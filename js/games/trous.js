/* Texte à trous : le début de l'article avec trois mots clés à compléter. Choix multiple, ou saisie libre en Difficile. */
(() => {
  const { el, rng, shuffle, pick } = WJ.util;
  const BLANKS = 3, FIRST = 30, SECOND = 15, CHOICE = 30, BONUS = 10;

  function candidates(tokens, title, random) {
    const titleNorms = new Set(WJ.answer.titleWords(title));
    const cands = [];
    let sentenceStart = true;
    tokens.forEach((tk, i) => {
      if (tk.word) {
        const isProper = /^\p{Lu}/u.test(tk.t) && !sentenceStart;
        const isYear = /^\d{3,4}$/.test(tk.t);
        const long = tk.norm.length >= 6;
        if (!titleNorms.has(tk.norm) && !WJ.text.isStop(tk.norm) && (isProper || isYear || long) && tk.t.length >= 3) {
          cands.push({ i, t: tk.t, norm: tk.norm, kind: isYear ? 'year' : isProper ? 'proper' : 'long', score: (isProper ? 3 : 0) + (isYear ? 2 : 0) + (long ? 1 : 0) + random() });
        }
        sentenceStart = false;
      } else if (/[.!?]/.test(tk.t)) sentenceStart = true;
    });
    return cands;
  }
  function chooseBlanks(cands) {
    const picked = [], used = new Set();
    for (const c of cands.slice().sort((a, b) => b.score - a.score)) {
      if (used.has(c.norm) || picked.some((p) => Math.abs(p.i - c.i) < 4)) continue;
      picked.push(c); used.add(c.norm);
      if (picked.length >= BLANKS) break;
    }
    return picked.sort((a, b) => a.i - b.i);
  }

  /** Charge les extraits de tous les articles pour disposer de leurres (mots d'autres articles). */
  async function prepare(entries) {
    const out = [];
    for (const e of entries) {
      try {
        const s = await WJ.api.summary(e.title);
        const text = WJ.text.excerpt(WJ.text.clean(s.extract || ''), 60);
        const tokens = WJ.text.tokenize(text);
        const cands = candidates(tokens, e.title, rng(e.title + '|trous'));
        const blanks = chooseBlanks(cands);
        if (blanks.length >= 2) out.push({ ...e, tokens, blanks, cands });
      } catch (err) { /* article sans résumé : ignoré */ }
    }
    if (out.length < 2) throw new Error('Pas assez de textes exploitables, réessaie.');
    return out;
  }

  /** Trois leurres plausibles pour un trou : années voisines, ou mots du même type pris dans les autres articles. */
  function distractors(blank, entry, all, random) {
    const out = new Set();
    if (blank.kind === 'year') {
      const y = parseInt(blank.t, 10);
      let guard = 0;
      while (out.size < 3 && guard++ < 50) { const d = (Math.floor(random() * 40) + 1) * (random() < 0.5 ? -1 : 1); const v = y + d; if (v !== y && v > 0 && v <= new Date().getFullYear()) out.add(String(v)); }
      return [...out];
    }
    const pool = [];
    for (const e of all) if (e !== entry) for (const c of e.cands) if (c.kind === blank.kind && c.norm !== blank.norm) pool.push(c.t);
    for (const c of entry.cands) if (c.kind === blank.kind && c.norm !== blank.norm && !entry.blanks.includes(c)) pool.push(c.t);
    const uniq = [...new Set(pool)];
    for (const w of shuffle(uniq, random)) { if (out.size >= 3) break; if (WJ.answer.normalize(w) !== blank.norm) out.add(w); }
    const fallback = ['Paris', 'Londres', 'France', 'Europe', 'Napoléon', 'Allemagne', 'Rome', 'Italie'];
    for (const w of fallback) { if (out.size >= 3) break; if (WJ.answer.normalize(w) !== blank.norm) out.add(w); }
    return [...out].slice(0, 3);
  }

  async function playRound({ entry, content, difficulty = 'normal' }) {
    const free = difficulty === 'difficile';
    const random = rng(entry.title + '|leurres');
    const all = playRound.entries || [entry];
    const { tokens, blanks } = entry;
    let attempt = 0, finished = false;
    const inputs = [];
    const para = el('p', { class: 'extract' });
    tokens.forEach((tk, i) => {
      const b = blanks.find((x) => x.i === i);
      if (!b) { para.append(tk.t); return; }
      if (free) {
        const inp = el('input', { class: 'blank', type: 'text', placeholder: `${tk.t.length} lettres`, 'aria-label': 'Mot manquant', autocomplete: 'off', autocapitalize: 'off', style: { minWidth: `${Math.max(5, tk.t.length * 0.9)}em` } });
        inp.answer = tk.t; inp.points = 0;
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') validate.click(); });
        inputs.push(inp); para.append(inp);
      } else {
        const opts = shuffle([tk.t, ...distractors(b, entry, all, random)], random);
        const box = el('span', { class: 'blank-choice' });
        box.answer = tk.t; box.points = 0; box.picked = null;
        opts.forEach((o) => {
          const btn = WJ.ui.button(o, () => { if (finished) return; box.picked = o; [...box.children].forEach((c) => c.classList.toggle('picked', c === btn)); }, 'btn');
          box.append(btn);
        });
        inputs.push(box); para.append(box);
      }
    });
    const validate = WJ.ui.button('Valider', check, 'btn btn-primary');
    const pass = WJ.ui.button('Je passe', () => finish(true), 'btn btn-ghost');
    const actions = el('div', { class: 'row' }, [validate, pass]);
    const status = el('p', { class: 'muted', text: free ? `${blanks.length} mots à retrouver · ${FIRST} pts par mot au premier essai, ${SECOND} au second.` : `${blanks.length} mots à retrouver · ${CHOICE} pts par bon choix, +${BONUS} si tout est juste.` });
    const result = el('div');
    let resolveRound; const done = new Promise((r) => { resolveRound = r; });

    function check() {
      if (finished) return;
      attempt++;
      if (!free) {
        if (inputs.some((b) => !b.picked)) { WJ.ui.toast('Choisis un mot pour chaque trou.', 'warn'); attempt--; return; }
        for (const box of inputs) {
          const ok = WJ.answer.normalize(box.picked) === WJ.answer.normalize(box.answer);
          box.points = ok ? CHOICE : 0;
          [...box.children].forEach((c) => { c.disabled = true; if (c.textContent === box.answer) c.classList.add('right'); else if (c.classList.contains('picked') && !ok) c.classList.add('wrong'); });
        }
        return finish(false);
      }
      let allOk = true;
      for (const inp of inputs) {
        if (inp.classList.contains('ok')) continue;
        const v = inp.value.trim();
        const d = WJ.answer.levenshtein(WJ.answer.normalize(v), WJ.answer.normalize(inp.answer));
        const ok = v && d <= (inp.answer.length >= 6 ? 1 : 0);
        if (ok) { inp.classList.remove('ko'); inp.classList.add('ok'); inp.value = inp.answer; inp.disabled = true; inp.points = attempt === 1 ? FIRST : SECOND; }
        else { allOk = false; inp.classList.add('ko'); if (attempt === 1) inp.placeholder = `${inp.answer[0]}… (${inp.answer.length} lettres)`; }
      }
      if (allOk || attempt >= 2) return finish(false);
      status.textContent = 'Un second essai : la première lettre des mots manquants est indiquée.';
      inputs.find((i) => !i.disabled)?.focus();
    }
    function finish(passed) {
      if (finished) return; finished = true;
      let pts = 0;
      for (const inp of inputs) {
        pts += inp.points;
        if (free && !inp.classList.contains('ok')) { inp.value = inp.answer; inp.classList.add('ko'); inp.disabled = true; }
        if (!free) [...inp.children].forEach((c) => { c.disabled = true; if (c.textContent === inp.answer) c.classList.add('right'); });
      }
      const good = inputs.filter((i) => i.points > 0).length;
      if (!free && !passed && good === inputs.length) pts += BONUS;
      actions.remove();
      result.append(el('div', { class: 'reveal ' + (good === inputs.length ? 'ok' : good ? '' : 'ko') }, [
        el('p', { class: 'pts', text: passed ? 'Passé · 0 pt' : `${good}/${inputs.length} mot${good > 1 ? 's' : ''} · +${pts} pts` }),
        WJ.ui.articleFooter(entry, { withCredit: false }),
      ]));
      WJ.ui.waitNext(result).then(() => resolveRound({ ok: good > 0, points: passed ? 0 : pts, title: entry.title, emoji: passed ? '⬜' : good === inputs.length ? '🟩' : good ? '🟨' : '🟥', label: `${entry.title} (${good}/${inputs.length})` }));
    }
    content.append(
      el('div', { class: 'row' }, [entry.image ? el('img', { src: entry.image, alt: '', style: { width: '72px', height: '72px', objectFit: 'contain', borderRadius: '12px', background: 'var(--bg-2)' } }) : null, el('h3', { text: entry.title, style: { margin: 0 } })]),
      para, status, actions, result,
    );
    if (free) setTimeout(() => inputs[0]?.focus({ preventScroll: true }), 50);
    return done;
  }

  WJ.standardGame({
    id: 'trous', name: 'Texte à trous', icon: '✍️', group: 'deviner',
    desc: 'Le début d’un article avec trois mots clés effacés : noms propres, dates, termes importants. Choisis le bon parmi quatre.',
    rules: [`${CHOICE} pts par bon choix, +${BONUS} si les trois sont justes.`, `En Difficile, il faut taper les mots : ${FIRST} pts du premier coup, ${SECOND} au second essai avec la première lettre.`],
    themes: true, need: {}, rounds: 8, prepare: async (entries, opts) => { const out = await prepare(entries, opts); playRound.entries = out; return out; }, playRound,
  });
})();
