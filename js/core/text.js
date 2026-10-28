/* Outils texte : découpage en mots, mots-outils, phrases. */
WJ.text = (() => {
  const STOP = new Set(('le la les l un une des du de d et ou où en est sont a à au aux ce cet cette ces qui que quoi dont il elle ils elles on nous vous je tu ' +
    'son sa ses leur leurs mon ma mes ton ta tes notre nos votre vos se s ne n pas plus moins très dans par pour sur sous avec sans entre vers chez ' +
    'comme mais donc or ni car si y été être avoir fait fut ont était étaient sera ans an depuis puis aussi encore tout tous toute toutes autre autres ' +
    'même mêmes dès lors ainsi alors après avant jusqu jusque the of and in on at to by for from with as is are was were be been it its this that these those an').split(/\s+/));

  /** Découpe un texte en jetons {t: texte, word: bool, norm}. Les mots incluent lettres et chiffres ; apostrophes et tirets séparent. */
  function tokenize(text) {
    const out = [];
    const re = /[\p{L}\p{N}]+|[^\p{L}\p{N}]+/gu;
    for (const m of String(text).matchAll(re)) {
      const t = m[0];
      const word = /[\p{L}\p{N}]/u.test(t);
      out.push({ t, word, norm: word ? WJ.answer.normalize(t) : '' });
    }
    return out;
  }
  const isStop = (norm) => STOP.has(norm) || norm.length <= 1;
  const isNumber = (t) => /^\p{N}+$/u.test(t);

  /** Rapproche deux formes (pluriels simples). */
  function sameWord(a, b) {
    if (a === b) return true;
    const strip = (w) => w.replace(/(s|x)$/, '');
    if (strip(a) === strip(b)) return true;
    return a.length >= 6 && b.length >= 6 && WJ.answer.levenshtein(a, b) <= 1;
  }

  /** Coupe un texte en phrases (approximatif, gère quelques abréviations). */
  function sentences(text) {
    return String(text).replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ')
      .split(/(?<=[.!?…])\s+(?=[A-ZÀ-ÝŒ«"])/)
      .map((s) => s.trim()).filter(Boolean);
  }

  /** Premiers mots d'un texte, coupés sur une fin de phrase si possible. */
  function excerpt(text, maxWords = 70) {
    const sents = sentences(text);
    let out = '';
    for (const s of sents) {
      if ((out + ' ' + s).split(/\s+/).length > maxWords && out) break;
      out = (out + ' ' + s).trim();
    }
    return out || String(text).split(/\s+/).slice(0, maxWords).join(' ');
  }

  /** Retire la prononciation API entre crochets ou /.../ et les notes. */
  const clean = (text) => String(text || '').replace(/\s*\[[^\]]*\]/g, '').replace(/\s*\/[^/]{2,40}\//g, '').replace(/\s*\(\s*\)/g, '').replace(/\s{2,}/g, ' ').replace(/ ,/g, ',').trim();

  return { STOP, tokenize, isStop, isNumber, sameWord, sentences, excerpt, clean };
})();
