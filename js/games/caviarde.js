/* Résumé caviardé : le texte est masqué mot par mot, chaque mot proposé se dévoile partout. Trouve le titre. */
(() => {
  const { el } = WJ.util;
  const ROUNDS = 5;

  async function playRound({ entry, content }) {
    const summary = await WJ.api.summary(entry.title);
    const text = WJ.text.clean(summary.extract || '');
    if (text.split(/\s+/).length < 25) throw new Error('Résumé trop court pour cet article, on passe au suivant.');
    const body = WJ.text.excerpt(text, 160);
    const titleNorms = new Set(WJ.answer.titleWords(entry.title));
    const tokens = WJ.text.tokenize(body);
    const target = { title: entry.title, pageid: entry.pageid, aliases: [WJ.answer.displayTitle(entry.title)] };
    let guesses = 0, finished = false;
    const found = new Set();
    const spans = [];

    const article = el('p', { class: 'redacted' });
    tokens.forEach((tk) => {
      if (!tk.word || WJ.text.isStop(tk.norm) || WJ.text.isNumber(tk.t)) { article.append(tk.t); return; }
      const isTitle = titleNorms.has(tk.norm);
      const s = el('span', { class: 'redact' + (isTitle ? ' title' : ''), text: tk.t, dataset: { norm: tk.norm } });
      s.addEventListener('click', () => { if (!s.classList.contains('found')) WJ.ui.toast(`${tk.t.length} lettres`, 'info', 900); });
      spans.push(s); article.append(s);
    });
    const hiddenCount = () => spans.filter((s) => !s.classList.contains('found')).length;
    const status = el('p', { class: 'muted' });
    const foundList = el('div', { class: 'found-list' });
    const input = el('input', { type: 'text', placeholder: 'Un mot… ou le titre', 'aria-label': 'Mot ou titre', enterkeyhint: 'go' });
    const validate = WJ.ui.button('Essayer', () => submit(input.value), 'btn btn-primary');
    const pass = WJ.ui.button('Je passe', () => finish(false), 'btn btn-ghost');
    const form = el('div', { class: 'guess' }, [el('div', { class: 'ac-host' }, [input]), validate, pass]);
    const result = el('div');
    const points = () => Math.max(10, 100 - 4 * guesses);
    const refresh = () => { status.textContent = `${guesses} essai${guesses > 1 ? 's' : ''} · ${hiddenCount()} mot${hiddenCount() > 1 ? 's' : ''} encore masqué${hiddenCount() > 1 ? 's' : ''} · ${points()} pts si tu trouves maintenant`; };

    let resolveRound; const done = new Promise((r) => { resolveRound = r; });
    async function submit(value) {
      if (finished) return;
      const v = String(value || '').trim();
      if (!v) return;
      input.value = '';
      // Le titre ?
      const local = WJ.answer.compareLocal(v, entry.title, target.aliases);
      if (local.ok) return finish(true);
      guesses++;
      const norm = WJ.answer.normalize(v);
      const words = norm.split(' ').filter(Boolean);
      let hits = 0;
      spans.forEach((s) => s.classList.remove('flash'));
      for (const w of words) {
        for (const s of spans) {
          if (!s.classList.contains('found') && WJ.text.sameWord(s.dataset.norm, w)) { s.classList.add('found'); hits++; }
          else if (s.classList.contains('found') && WJ.text.sameWord(s.dataset.norm, w)) s.classList.add('flash');
        }
      }
      if (hits) { found.add(v); foundList.append(el('span', { text: `${v} ×${hits}` })); }
      else if (words.length > 1 || v.includes(' ')) {
        // Peut-être le titre via une redirection
        validate.disabled = true;
        const verdict = await WJ.answer.check(v, target);
        validate.disabled = false;
        if (verdict.ok) return finish(true);
        WJ.ui.toast('Ce n’est pas le titre.', 'ko', 1200);
      } else WJ.ui.toast('Absent du texte.', 'ko', 1000);
      // Tous les mots du titre dévoilés = gagné
      if (spans.filter((s) => s.classList.contains('title')).every((s) => s.classList.contains('found')) && titleNorms.size) return finish(true);
      refresh(); input.focus();
    }
    function finish(ok) {
      if (finished) return; finished = true;
      const pts = ok ? points() : 0;
      spans.forEach((s) => s.classList.add('found'));
      form.remove();
      result.append(el('div', { class: 'reveal ' + (ok ? 'ok' : 'ko') }, [
        el('h3', { text: entry.title }),
        el('p', { class: 'pts', text: ok ? `+${pts} pts en ${guesses} essai${guesses > 1 ? 's' : ''}` : 'Passé · 0 pt' }),
        WJ.ui.articleFooter(entry, { withCredit: false }),
      ]));
      WJ.ui.waitNext(result).then(() => resolveRound({ ok, points: pts, title: entry.title, emoji: !ok ? '⬜' : guesses <= 8 ? '🟩' : '🟨', label: `${entry.title} (${guesses} essais)` }));
    }
    content.append(el('p', { class: 'muted', text: 'Propose des mots pour dévoiler le résumé. Les blocs dorés sont les mots du titre.' }), article, status, foundList, form, result);
    refresh();
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(input.value); });
    setTimeout(() => input.focus({ preventScroll: true }), 50);
    return done;
  }

  WJ.standardGame({
    id: 'caviarde', name: 'Résumé caviardé', icon: '🕶️', group: 'deviner',
    desc: 'Le résumé d’un article est entièrement masqué. Propose des mots pour le dévoiler et trouve le titre.',
    rules: ['Chaque mot proposé se dévoile partout où il apparaît dans le texte.', 'Les mots-outils (le, la, de…) sont déjà visibles.', 'Tape le titre dès que tu le devines : 100 pts moins 4 par essai, minimum 10.', `${ROUNDS} articles par partie.`],
    themes: true, need: {}, rounds: ROUNDS, playRound,
  });
})();
