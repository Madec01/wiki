/* Résumé caviardé : le texte est masqué mot par mot. Clique sur un mot pour proposer ce qu'il cache. */
(() => {
  const { el, shuffle, rng } = WJ.util;
  const ROUNDS = 5;
  const MISS_STEP = 3;        // tous les 3 essais ratés, des lettres apparaissent
  const STEP_SHARE = 0.25;    // part des mots encore masqués concernés à chaque palier
  const PREREVEAL = { facile: 0.4, normal: 0.15, difficile: 0 }; // part des mots (hors titre) déjà visibles au départ

  async function playRound({ entry, content, difficulty = 'normal' }) {
    const summary = await WJ.api.summary(entry.title);
    const text = WJ.text.clean(summary.extract || '');
    if (text.split(/\s+/).length < 25) throw new Error('Résumé trop court pour cet article, on passe au suivant.');
    const body = WJ.text.excerpt(text, 160);
    const titleNorms = new Set(WJ.answer.titleWords(entry.title));
    const tokens = WJ.text.tokenize(body);
    const target = { title: entry.title, pageid: entry.pageid, aliases: [WJ.answer.displayTitle(entry.title)] };
    const random = rng(entry.title + '|caviarde');
    let attempts = 0, misses = 0, steps = 0, finished = false, editing = null;
    const spans = [];

    const article = el('p', { class: 'redacted' });
    tokens.forEach((tk) => {
      if (!tk.word || WJ.text.isStop(tk.norm) || WJ.text.isNumber(tk.t)) { article.append(tk.t); return; }
      const isTitle = titleNorms.has(tk.norm);
      const s = el('span', { class: 'redact' + (isTitle ? ' title' : ''), text: tk.t, dataset: { norm: tk.norm, len: String([...tk.t].length) }, title: `${[...tk.t].length} lettres · clique pour proposer un mot` });
      s.addEventListener('click', () => onWordClick(s));
      spans.push(s); article.append(s);
    });
    const hidden = () => spans.filter((s) => !s.classList.contains('found'));
    const status = el('p', { class: 'muted' });
    const foundList = el('div', { class: 'found-list' });
    const pass = WJ.ui.button('Je passe', () => finish(false), 'btn btn-ghost btn-sm');
    const actions = el('div', { class: 'row' }, [pass]);
    const result = el('div');
    const points = () => Math.max(10, 100 - 4 * misses);
    const refresh = () => {
      const h = hidden().length;
      const left = MISS_STEP - (misses % MISS_STEP);
      status.textContent = `${attempts} essai${attempts > 1 ? 's' : ''}, ${misses} raté${misses > 1 ? 's' : ''} · ${h} mot${h > 1 ? 's' : ''} masqué${h > 1 ? 's' : ''} · ${points()} pts si tu trouves maintenant · lettres offertes dans ${left} raté${left > 1 ? 's' : ''}`;
    };

    // --- surlignage des mots trouvés
    function clearFlash() { spans.forEach((s) => s.classList.remove('flash')); foundList.querySelectorAll('span').forEach((c) => c.classList.remove('on')); }
    function highlight(norm) {
      const already = spans.some((s) => s.dataset.norm === norm && s.classList.contains('flash'));
      clearFlash();
      if (already) return;
      spans.forEach((s) => { if (WJ.text.sameWord(s.dataset.norm, norm)) s.classList.add('flash'); });
      foundList.querySelectorAll('span').forEach((c) => { if (c.dataset.norm === norm) c.classList.add('on'); });
    }
    function reveal(norm, { chip = true } = {}) {
      let hits = 0;
      spans.forEach((s) => { if (!s.classList.contains('found') && WJ.text.sameWord(s.dataset.norm, norm)) { s.classList.add('found'); delete s.dataset.hint; hits++; } });
      if (hits && chip) {
        const label = spans.find((s) => WJ.text.sameWord(s.dataset.norm, norm))?.textContent || norm;
        const c = el('span', { text: `${label} ×${hits}`, dataset: { norm } });
        c.addEventListener('click', () => highlight(norm));
        foundList.append(c);
      }
      return hits;
    }
    const titleDone = () => titleNorms.size && spans.filter((s) => s.classList.contains('title')).every((s) => s.classList.contains('found'));

    /** Palier d'indices : une part des mots masqués gagne une lettre de plus (les mots déjà entamés continuent de se remplir). */
    function hintStep() {
      steps++;
      const byNorm = new Map();
      hidden().forEach((s) => { if (!byNorm.has(s.dataset.norm)) byNorm.set(s.dataset.norm, s); });
      const started = shuffle([...byNorm.keys()].filter((n) => byNorm.get(n).dataset.hint), random);
      const fresh = shuffle([...byNorm.keys()].filter((n) => !byNorm.get(n).dataset.hint), random);
      const n = Math.max(3, Math.ceil(byNorm.size * STEP_SHARE));
      const picks = started.slice(0, Math.ceil(n / 2));
      picks.push(...fresh.slice(0, n - picks.length));
      if (picks.length < n) picks.push(...started.slice(Math.ceil(n / 2), Math.ceil(n / 2) + n - picks.length));
      for (const norm of picks) {
        const sample = byNorm.get(norm);
        const letters = [...sample.textContent];
        const len = (sample.dataset.hint ? [...sample.dataset.hint].length : 0) + 1;
        if (len >= letters.length) { reveal(norm, { chip: false }); continue; } // mot entièrement donné
        spans.forEach((s) => { if (s.dataset.norm === norm && !s.classList.contains('found')) s.dataset.hint = [...s.textContent].slice(0, len).join(''); });
      }
      WJ.ui.toast(steps === 1 ? 'Des premières lettres apparaissent.' : 'Les mots se remplissent un peu plus.', 'info', 1600);
    }

    // --- clic sur un mot : saisie en place
    function closeEditor() {
      if (!editing) return;
      editing.input.replaceWith(editing.span);
      editing = null;
    }
    function onWordClick(s) {
      if (finished) return;
      if (s.classList.contains('found')) { highlight(s.dataset.norm); return; }
      closeEditor();
      const len = s.dataset.len;
      const input = el('input', { class: 'inline-guess', type: 'text', placeholder: s.classList.contains('title') ? `${len} lettres (ou le titre)` : `${len} lettres`, 'aria-label': 'Ton mot', autocomplete: 'off', autocapitalize: 'off', style: { width: `${Math.max(7, Number(len) * 0.75 + 2)}em` } });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(s, input.value); } else if (e.key === 'Escape') closeEditor(); });
      input.addEventListener('blur', () => setTimeout(() => { if (editing && editing.input === input && !input.value.trim()) closeEditor(); }, 150));
      s.replaceWith(input);
      editing = { span: s, input };
      input.focus();
    }
    async function submit(s, value) {
      if (finished) return;
      const v = String(value || '').trim();
      if (!v) return;
      closeEditor();
      attempts++;
      clearFlash();
      // Le titre complet ?
      if (WJ.answer.compareLocal(v, entry.title, target.aliases).ok) return finish(true);
      const norm = WJ.answer.normalize(v);
      const words = norm.split(' ').filter(Boolean);
      let hits = 0, here = false;
      for (const w of words) {
        if (WJ.text.sameWord(s.dataset.norm, w)) here = true;
        hits += reveal(w);
      }
      if (hits) {
        WJ.ui.toast(here ? `Oui ! « ${v} »${hits > 1 ? ` ×${hits}` : ''}` : `Pas ici, mais « ${v} » est ailleurs dans le texte !`, 'ok', 1400);
      } else {
        if (words.length > 1) {
          const verdict = await WJ.answer.check(v, target);
          if (verdict.ok) return finish(true);
        }
        misses++;
        if (misses % MISS_STEP === 0) hintStep();
        WJ.ui.toast('Non.', 'ko', 800);
      }
      if (titleDone()) return finish(true);
      refresh();
    }
    function finish(ok) {
      if (finished) return; finished = true;
      closeEditor();
      const pts = ok ? points() : 0;
      spans.forEach((s) => { s.classList.add('found', 'plain'); s.classList.remove('flash'); delete s.dataset.hint; });
      actions.remove(); status.remove();
      article.before(el('p', { class: 'muted', text: ok ? 'Bravo, voici le résumé en clair :' : 'Voici le résumé en clair :' }));
      result.append(el('div', { class: 'reveal ' + (ok ? 'ok' : 'ko') }, [
        el('h3', { text: entry.title }),
        el('p', { class: 'pts', text: ok ? `+${pts} pts · ${attempts} essai${attempts > 1 ? 's' : ''}, ${misses} raté${misses > 1 ? 's' : ''}` : 'Passé · 0 pt' }),
        WJ.ui.articleFooter(entry, { withCredit: false }),
      ]));
      WJ.ui.waitNext(result).then(() => resolveRound({ ok, points: pts, title: entry.title, emoji: !ok ? '⬜' : pts >= 70 ? '🟩' : '🟨', label: `${entry.title} (${misses} ratés)` }));
    }
    let resolveRound; const done = new Promise((r) => { resolveRound = r; });

    content.append(el('p', { class: 'muted', text: 'Clique sur un mot masqué et tape ce que tu crois qu’il cache. Les blocs dorés sont les mots du titre : trouve-les tous, ou tape le titre entier dessus.' }), article, status, foundList, actions, result);
    const ratio = PREREVEAL[difficulty] ?? PREREVEAL.normal;
    if (ratio > 0) {
      const norms = [...new Set(spans.filter((s) => !s.classList.contains('title')).map((s) => s.dataset.norm))];
      shuffle(norms, random).slice(0, Math.round(norms.length * ratio)).forEach((n) => reveal(n, { chip: false }));
    }
    refresh();
    WJ.debugCaviarde = { hintStep, spans: () => spans.length };
    return done;
  }

  WJ.standardGame({
    id: 'caviarde', name: 'Résumé caviardé', icon: '🕶️', group: 'deviner',
    desc: 'Le résumé d’un article est masqué mot par mot. Clique sur un mot, propose ce qu’il cache, et retrouve le titre.',
    rules: ['Chaque bloc affiche son nombre de lettres. Un mot trouvé se dévoile partout où il apparaît, même si tu l’as proposé au mauvais endroit.', `Tous les ${MISS_STEP} essais ratés, un quart des mots masqués gagne une lettre : les mots entamés continuent de se remplir.`, 'Les mots-outils sont visibles, plus 15 % des mots en Normal et 40 % en Facile.', '100 pts moins 4 par essai raté, minimum 10. Clique sur un mot trouvé pour le surligner partout.', `${ROUNDS} articles par partie.`],
    themes: true, need: {}, rounds: ROUNDS, playRound,
  });
})();
