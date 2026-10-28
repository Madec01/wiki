/* Résumé caviardé : le texte est masqué mot par mot, chaque mot proposé se dévoile partout. Trouve le titre. */
(() => {
  const { el, pick } = WJ.util;
  const ROUNDS = 5;
  const COST = { letter: 5, word: 10, somewhere: 6 };
  const AUTO_EVERY = 5; // un mot offert tous les 5 essais ratés

  async function playRound({ entry, content, difficulty = 'normal' }) {
    const summary = await WJ.api.summary(entry.title);
    const text = WJ.text.clean(summary.extract || '');
    if (text.split(/\s+/).length < 25) throw new Error('Résumé trop court pour cet article, on passe au suivant.');
    const body = WJ.text.excerpt(text, 160);
    const titleNorms = new Set(WJ.answer.titleWords(entry.title));
    const tokens = WJ.text.tokenize(body);
    const target = { title: entry.title, pageid: entry.pageid, aliases: [WJ.answer.displayTitle(entry.title)] };
    let guesses = 0, misses = 0, hintCost = 0, finished = false, selected = null;
    const spans = [];

    const article = el('p', { class: 'redacted' });
    tokens.forEach((tk) => {
      if (!tk.word || WJ.text.isStop(tk.norm) || WJ.text.isNumber(tk.t)) { article.append(tk.t); return; }
      const isTitle = titleNorms.has(tk.norm);
      const s = el('span', { class: 'redact' + (isTitle ? ' title' : ''), text: tk.t, dataset: { norm: tk.norm }, title: `${tk.t.length} lettres` });
      s.addEventListener('click', () => onWordClick(s));
      spans.push(s); article.append(s);
    });
    const hidden = () => spans.filter((s) => !s.classList.contains('found'));
    const status = el('p', { class: 'muted' });
    const foundList = el('div', { class: 'found-list' });
    const selInfo = el('p', { class: 'muted', text: 'Clique sur un mot masqué pour le sélectionner, puis choisis un indice.' });
    const input = el('input', { type: 'text', placeholder: 'Un mot… ou le titre', 'aria-label': 'Mot ou titre', enterkeyhint: 'go' });
    const validate = WJ.ui.button('Essayer', () => submit(input.value), 'btn btn-primary');
    const pass = WJ.ui.button('Je passe', () => finish(false), 'btn btn-ghost');
    const form = el('div', { class: 'guess' }, [el('div', { class: 'ac-host' }, [input]), validate, pass]);
    const bLetter = WJ.ui.button(`🔤 Première lettre (−${COST.letter})`, () => hintLetter(), 'btn btn-ghost btn-sm', { disabled: true });
    const bWord = WJ.ui.button(`👁️ Dévoiler ce mot (−${COST.word})`, () => hintWord(), 'btn btn-ghost btn-sm', { disabled: true });
    const bSome = WJ.ui.button(`🎁 Un mot du texte (−${COST.somewhere})`, () => hintSomewhere(), 'btn btn-ghost btn-sm');
    const hints = el('div', { class: 'hints' }, [bLetter, bWord, bSome]);
    const result = el('div');
    const points = () => Math.max(10, 100 - 4 * guesses - hintCost);
    const refresh = () => {
      const h = hidden().length;
      status.textContent = `${guesses} essai${guesses > 1 ? 's' : ''} · ${h} mot${h > 1 ? 's' : ''} masqué${h > 1 ? 's' : ''} · ${points()} pts si tu trouves maintenant`;
      bLetter.disabled = !selected || selected.classList.contains('first');
      bWord.disabled = !selected;
      bSome.disabled = !hidden().some((s) => !s.classList.contains('title'));
    };

    // --- sélection et surlignage
    function clearFlash() { spans.forEach((s) => s.classList.remove('flash')); foundList.querySelectorAll('span').forEach((c) => c.classList.remove('on')); }
    function onWordClick(s) {
      if (finished) return;
      if (s.classList.contains('found')) { highlight(s.dataset.norm); return; }
      if (selected) selected.classList.remove('selected');
      selected = s === selected ? null : s;
      if (selected) selected.classList.add('selected');
      selInfo.textContent = selected ? `Mot sélectionné : ${selected.textContent.length} lettres${selected.classList.contains('title') ? ' (un mot du titre)' : ''}.` : 'Clique sur un mot masqué pour le sélectionner, puis choisis un indice.';
      refresh();
    }
    function highlight(norm) {
      const already = spans.some((s) => s.dataset.norm === norm && s.classList.contains('flash'));
      clearFlash();
      if (already) return;
      spans.forEach((s) => { if (WJ.text.sameWord(s.dataset.norm, norm)) s.classList.add('flash'); });
      foundList.querySelectorAll('span').forEach((c) => { if (c.dataset.norm === norm) c.classList.add('on'); });
    }
    function reveal(norm, { chip = true } = {}) {
      let hits = 0;
      spans.forEach((s) => { if (!s.classList.contains('found') && WJ.text.sameWord(s.dataset.norm, norm)) { s.classList.add('found'); s.classList.remove('first', 'selected'); hits++; } });
      if (hits && chip) {
        const label = spans.find((s) => WJ.text.sameWord(s.dataset.norm, norm))?.textContent || norm;
        const c = el('span', { text: `${label} ×${hits}`, dataset: { norm } });
        c.addEventListener('click', () => highlight(norm));
        foundList.append(c);
      }
      if (selected && selected.classList.contains('found')) selected = null;
      return hits;
    }
    const titleDone = () => titleNorms.size && spans.filter((s) => s.classList.contains('title')).every((s) => s.classList.contains('found'));

    // --- indices
    function hintLetter() {
      if (!selected || finished) return;
      hintCost += COST.letter;
      spans.forEach((s) => { if (s.dataset.norm === selected.dataset.norm) s.classList.add('first'); });
      refresh();
    }
    function hintWord() {
      if (!selected || finished) return;
      hintCost += COST.word;
      reveal(selected.dataset.norm);
      if (titleDone()) return finish(true);
      refresh();
    }
    function hintSomewhere(free = false) {
      const cands = hidden().filter((s) => !s.classList.contains('title'));
      if (!cands.length || finished) return;
      if (!free) hintCost += COST.somewhere;
      const s = pick(cands);
      WJ.ui.toast(`${free ? 'Cadeau : ' : ''}le mot « ${s.textContent} » est dans le texte. Tape-le pour le placer.`, 'info', 3500);
      hints.append(el('span', { class: 'theme-chip', text: s.textContent, onclick: () => { input.value = s.textContent; submit(s.textContent, { freebie: true }); } }));
      refresh();
    }

    let resolveRound; const done = new Promise((r) => { resolveRound = r; });
    async function submit(value, { freebie = false } = {}) {
      if (finished) return;
      const v = String(value || '').trim();
      if (!v) return;
      input.value = '';
      if (WJ.answer.compareLocal(v, entry.title, target.aliases).ok) return finish(true);
      if (!freebie) guesses++;
      clearFlash();
      const words = WJ.answer.normalize(v).split(' ').filter(Boolean);
      let hits = 0;
      for (const w of words) {
        const already = spans.some((s) => s.classList.contains('found') && WJ.text.sameWord(s.dataset.norm, w));
        hits += reveal(w);
        if (already) highlight(w);
      }
      if (!hits) {
        if (words.length > 1) {
          validate.disabled = true;
          const verdict = await WJ.answer.check(v, target);
          validate.disabled = false;
          if (verdict.ok) return finish(true);
          WJ.ui.toast('Ce n’est pas le titre.', 'ko', 1200);
        } else WJ.ui.toast('Absent du texte.', 'ko', 1000);
        misses++;
        if (misses % AUTO_EVERY === 0) hintSomewhere(true);
      }
      if (titleDone()) return finish(true);
      refresh(); input.focus();
    }
    function finish(ok) {
      if (finished) return; finished = true;
      const pts = ok ? points() : 0;
      spans.forEach((s) => { s.classList.add('found'); s.classList.remove('selected', 'first'); });
      form.remove(); hints.remove(); selInfo.remove();
      result.append(el('div', { class: 'reveal ' + (ok ? 'ok' : 'ko') }, [
        el('h3', { text: entry.title }),
        el('p', { class: 'pts', text: ok ? `+${pts} pts en ${guesses} essai${guesses > 1 ? 's' : ''}${hintCost ? ` (indices : −${hintCost})` : ''}` : 'Passé · 0 pt' }),
        WJ.ui.articleFooter(entry, { withCredit: false }),
      ]));
      WJ.ui.waitNext(result).then(() => resolveRound({ ok, points: pts, title: entry.title, emoji: !ok ? '⬜' : pts >= 70 ? '🟩' : '🟨', label: `${entry.title} (${guesses} essais)` }));
    }
    content.append(el('p', { class: 'muted', text: 'Propose des mots pour dévoiler le résumé. Les blocs dorés sont les mots du titre. Clique sur un mot trouvé pour le surligner partout.' }), article, status, foundList, selInfo, hints, form, result);
    if (difficulty === 'facile') hintSomewhere(true);
    refresh();
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(input.value); });
    setTimeout(() => input.focus({ preventScroll: true }), 50);
    return done;
  }

  WJ.standardGame({
    id: 'caviarde', name: 'Résumé caviardé', icon: '🕶️', group: 'deviner',
    desc: 'Le résumé d’un article est entièrement masqué. Propose des mots pour le dévoiler et trouve le titre.',
    rules: ['Chaque mot proposé se dévoile partout où il apparaît. Les mots-outils sont déjà visibles.', 'Indices : sélectionne un mot masqué pour obtenir sa première lettre (−5) ou le dévoiler (−10) ; « un mot du texte » (−6) te donne un mot sans sa place.', `Un mot est offert tous les ${AUTO_EVERY} essais ratés. Tape le titre dès que tu le devines : 100 pts moins 4 par essai, minimum 10.`, `${ROUNDS} articles par partie.`],
    themes: true, need: {}, rounds: ROUNDS, playRound,
  });
})();
