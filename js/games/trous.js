/* Texte à trous : le début de l'article avec trois mots clés à compléter. */
(() => {
  const { el, rng, shuffle } = WJ.util;
  const BLANKS = 3, FIRST = 30, SECOND = 15;

  function chooseBlanks(tokens, title, random) {
    const titleNorms = new Set(WJ.answer.titleWords(title));
    const cands = [];
    let sentenceStart = true;
    tokens.forEach((tk, i) => {
      if (tk.word) {
        const isProper = /^\p{Lu}/u.test(tk.t) && !sentenceStart;
        const isYear = /^\d{3,4}$/.test(tk.t);
        const long = tk.norm.length >= 6;
        if (!titleNorms.has(tk.norm) && !WJ.text.isStop(tk.norm) && (isProper || isYear || long) && tk.t.length >= 3) {
          cands.push({ i, score: (isProper ? 3 : 0) + (isYear ? 2 : 0) + (long ? 1 : 0) + random() });
        }
        sentenceStart = false;
      } else if (/[.!?]/.test(tk.t)) sentenceStart = true;
    });
    // Évite deux trous pour le même mot et garde-les espacés
    const picked = [];
    const used = new Set();
    for (const c of cands.sort((a, b) => b.score - a.score)) {
      const norm = tokens[c.i].norm;
      if (used.has(norm) || picked.some((p) => Math.abs(p - c.i) < 4)) continue;
      picked.push(c.i); used.add(norm);
      if (picked.length >= BLANKS) break;
    }
    return picked.sort((a, b) => a - b);
  }

  async function playRound({ entry, content }) {
    const summary = await WJ.api.summary(entry.title);
    const text = WJ.text.excerpt(WJ.text.clean(summary.extract || ''), 60);
    const tokens = WJ.text.tokenize(text);
    const random = rng(entry.title + '|trous');
    const idx = chooseBlanks(tokens, entry.title, random);
    if (idx.length < 2) throw new Error('Texte trop court pour y faire des trous, on passe.');
    let attempt = 0, finished = false;
    const inputs = [];
    const para = el('p', { class: 'extract' });
    tokens.forEach((tk, i) => {
      if (!idx.includes(i)) { para.append(tk.t); return; }
      const inp = el('input', { class: 'blank', type: 'text', placeholder: `${tk.t.length} lettres`, 'aria-label': 'Mot manquant', autocomplete: 'off', autocapitalize: 'off', style: { minWidth: `${Math.max(5, tk.t.length * 0.9)}em` } });
      inp.answer = tk.t; inp.points = 0;
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') validate.click(); });
      inputs.push(inp); para.append(inp);
    });
    const validate = WJ.ui.button('Valider', check, 'btn btn-primary');
    const pass = WJ.ui.button('Je passe', () => finish(true), 'btn btn-ghost');
    const actions = el('div', { class: 'row' }, [validate, pass]);
    const status = el('p', { class: 'muted', text: `${idx.length} mots à retrouver · ${FIRST} pts par mot au premier essai, ${SECOND} au second.` });
    const result = el('div');
    let resolveRound; const done = new Promise((r) => { resolveRound = r; });

    function check() {
      if (finished) return;
      attempt++;
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
        if (!inp.classList.contains('ok')) { inp.value = inp.answer; inp.classList.add('ko'); inp.disabled = true; }
      }
      actions.remove();
      const good = inputs.filter((i) => i.points > 0).length;
      result.append(el('div', { class: 'reveal ' + (good === inputs.length ? 'ok' : good ? '' : 'ko') }, [
        el('p', { class: 'pts', text: passed ? 'Passé · 0 pt' : `${good}/${inputs.length} mot${good > 1 ? 's' : ''} · +${pts} pts` }),
        WJ.ui.articleFooter(entry, { withCredit: false }),
      ]));
      WJ.ui.waitNext(result).then(() => resolveRound({ ok: good > 0, points: passed ? 0 : pts, title: entry.title, emoji: passed ? '⬜' : good === inputs.length ? '🟩' : good ? '🟨' : '🟥', label: `${entry.title} (${good}/${inputs.length})` }));
    }
    content.append(
      el('div', { class: 'row' }, [entry.image ? el('img', { src: entry.image, alt: '', style: { width: '72px', height: '72px', objectFit: 'cover', borderRadius: '12px' } }) : null, el('h3', { text: entry.title, style: { margin: 0 } })]),
      para, status, actions, result,
    );
    setTimeout(() => inputs[0]?.focus({ preventScroll: true }), 50);
    return done;
  }

  WJ.standardGame({
    id: 'trous', name: 'Texte à trous', icon: '✍️', group: 'deviner',
    desc: 'Le début d’un article avec trois mots clés effacés : noms propres, dates, termes importants.',
    rules: [`${FIRST} pts par mot trouvé du premier coup, ${SECOND} au second essai (avec la première lettre).`, 'Une petite faute de frappe est tolérée sur les mots longs.'],
    themes: true, need: {}, rounds: 8, playRound,
  });
})();
