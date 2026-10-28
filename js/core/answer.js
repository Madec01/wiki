/* Normalisation et comparaison des réponses, masques façon pendu. */
WJ.answer = (() => {
  const ARTICLES = /^(le |la |les |l'|l’|un |une |des |du |de la |de l'|the |a |an |el |la |los |las |il |lo |die |der |das )/;

  /** Minuscules, sans accents ni ponctuation ; retire la parenthèse de désambiguïsation finale. */
  function normalize(s) {
    return String(s || '')
      .replace(/\s*\([^)]*\)\s*$/, '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/ß/g, 'ss').replace(/ø/g, 'o').replace(/ł/g, 'l').replace(/đ/g, 'd')
      .replace(/[’'`´]/g, "'")
      .replace(/[^a-z0-9' ]+/g, ' ')
      .replace(/'/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  const stripArticles = (n) => n.replace(ARTICLES, '').trim();

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  /** Tolérance aux fautes de frappe selon la longueur. */
  const tolerance = (len) => (len >= 14 ? 3 : len >= 8 ? 2 : len >= 5 ? 1 : 0);

  /** Comparaison locale : {ok, exact, typo}. */
  function compareLocal(guess, title, aliases = []) {
    const g = normalize(guess);
    if (!g) return { ok: false };
    const candidates = [title, ...aliases].map(normalize).filter(Boolean);
    for (const t of candidates) {
      if (g === t || stripArticles(g) === stripArticles(t)) return { ok: true, exact: true };
    }
    for (const t of candidates) {
      const d = levenshtein(stripArticles(g), stripArticles(t));
      if (d <= tolerance(t.length)) return { ok: true, exact: false, typo: true };
    }
    return { ok: false };
  }

  const PARTICLES = new Set(['de', 'du', 'des', 'le', 'la', 'les', 'von', 'van', 'der', 'den', 'da', 'del', 'della', 'di', 'do', 'dos', 'of', 'y', 'et', 'al', 'el', 'ibn', 'bin', 'ben', 'mac', 'mc', 'st', 'saint', 'sainte']);
  /** Si le titre ressemble à un nom de personne (« Fiodor Dostoïevski »), formes acceptées : nom seul, titre sans le prénom. */
  function nameAliases(title) {
    const t = displayTitle(title);
    const words = t.split(/\s+/);
    if (words.length < 2 || words.length > 5) return [];
    const nameLike = words.every((w) => /^[\p{Lu}]/u.test(w) || PARTICLES.has(w.toLowerCase()));
    if (!nameLike) return [];
    const last = words[words.length - 1];
    if (normalize(last).replace(/ /g, '').length < 4 || /^[IVXLC]+$/.test(last) || /^\d/.test(last)) return [];
    const out = [last, words.slice(1).join(' ')];
    const lastPlain = last.split(/[-‐]/).pop();
    if (lastPlain && lastPlain !== last && normalize(lastPlain).length >= 5) out.push(lastPlain);
    return out;
  }

  /**
   * Vérifie une réponse contre un article cible {title, pageid}. Essaie d'abord localement,
   * puis demande à Wikipédia si le texte saisi redirige vers la même page (ex. « Napoléon » → « Napoléon Ier »).
   */
  async function check(guess, target, { allowRedirect = true, lenient = false } = {}) {
    const aliases = (target.aliases || []).concat(lenient ? nameAliases(target.title) : []);
    const local = compareLocal(guess, target.title, aliases);
    if (local.ok && lenient && !compareLocal(guess, target.title, target.aliases || []).ok) local.partial = true;
    if (local.ok) return local;
    const g = String(guess || '').trim();
    if (!allowRedirect || g.length < 2 || !target.pageid) return { ok: false };
    try {
      const r = await WJ.api.resolve(g);
      if (r && r.pageid === target.pageid) return { ok: true, exact: false, redirect: true, resolvedTitle: r.title };
    } catch (e) { /* hors ligne ou quota : on reste sur le verdict local */ }
    return { ok: false };
  }

  /** Titre d'affichage sans la parenthèse de désambiguïsation. */
  const displayTitle = (title) => String(title || '').replace(/\s*\([^)]*\)\s*$/, '').trim();

  /** Indices des caractères "lettre ou chiffre" du titre. */
  const letterIndexes = (title) => [...title].map((c, i) => (/[\p{L}\p{N}]/u.test(c) ? i : -1)).filter((i) => i >= 0);

  /**
   * Masque un titre : les lettres non révélées deviennent « _ », espaces et ponctuation restent visibles.
   * revealed : Set d'indices de caractères révélés. Renvoie un tableau de mots (tableaux de cases).
   */
  function mask(title, revealed = new Set()) {
    const words = [];
    let cur = [];
    [...title].forEach((c, i) => {
      if (c === ' ') { if (cur.length) words.push(cur); cur = []; return; }
      const isLetter = /[\p{L}\p{N}]/u.test(c);
      cur.push({ ch: c, i, letter: isLetter, shown: !isLetter || revealed.has(i) });
    });
    if (cur.length) words.push(cur);
    return words;
  }

  /** Choisit des indices à révéler : une fraction des lettres, en évitant de dévoiler toute une lettre partout. */
  function pickReveal(title, fraction, random = Math.random, already = new Set()) {
    const idx = letterIndexes(title).filter((i) => !already.has(i));
    const n = Math.max(1, Math.round(letterIndexes(title).length * fraction) - already.size);
    return WJ.util.shuffle(idx, random).slice(0, Math.min(n, idx.length));
  }

  /** Révèle une lettre de plus (pour le pendu), en priorité une lettre qui n'est pas déjà connue ailleurs. */
  function revealOneMore(title, revealed, random = Math.random) {
    const idx = letterIndexes(title).filter((i) => !revealed.has(i));
    if (!idx.length) return null;
    const known = new Set([...revealed].map((i) => normalize(title[i])));
    const fresh = idx.filter((i) => !known.has(normalize(title[i])));
    return WJ.util.pick(fresh.length ? fresh : idx, random);
  }

  /** Mots significatifs d'un titre (≥ 3 lettres), normalisés. */
  const titleWords = (title) => normalize(displayTitle(title)).split(' ').filter((w) => w.length >= 3);

  /** Remplace les occurrences des mots du titre dans un texte par des blocs ▮. */
  function hideTitleWords(text, title) {
    let out = String(text || '');
    const words = [...new Set([...titleWords(title), ...String(displayTitle(title)).split(/\s+/).filter((w) => w.length >= 3)])];
    for (const w of words) {
      const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRe(w)})(?=$|[^\\p{L}\\p{N}])`, 'giu');
      out = out.replace(re, (m, pre, word) => pre + '▮'.repeat(Math.max(3, word.length)));
      // forme sans accents aussi (le texte peut varier)
      const plain = normalize(w);
      if (plain && plain !== w.toLowerCase()) {
        const re2 = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRe(plain)})(?=$|[^\\p{L}\\p{N}])`, 'giu');
        out = out.replace(re2, (m, pre, word) => pre + '▮'.repeat(Math.max(3, word.length)));
      }
    }
    return out;
  }
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return { normalize, stripArticles, levenshtein, compareLocal, check, nameAliases, displayTitle, mask, pickReveal, revealOneMore, letterIndexes, titleWords, hideTitleWords, escapeRe };
})();
