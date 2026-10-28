/* Anagramme : les lettres du titre sont mélangées mot par mot. */
(() => {
  const { el, shuffle, rng } = WJ.util;
  const PENALTY = 15, LIVES = 5, IMAGE_COST = 30, DESC_COST = 15, FIRST_COST = 20;

  function scramble(word, random) {
    const letters = [...word];
    if (letters.length < 2) return word;
    for (let i = 0; i < 10; i++) {
      const s = shuffle(letters, random).join('');
      if (s !== word) return s;
    }
    return letters.reverse().join('');
  }

  async function playRound({ entry, content }) {
    const title = WJ.answer.displayTitle(entry.title);
    const random = rng(entry.title + '|anagramme');
    const words = title.split(/[\s]+/);
    const upper = (w) => w.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    const scrambled = words.map((w) => w.split(/(-|’|')/).map((part) => (/^[-’']$/.test(part) ? part : scramble(upper(part), random))).join(''));
    const target = { title: entry.title, pageid: entry.pageid, aliases: [title] };
    let errors = 0, lives = LIVES, imageUsed = false, descUsed = false, firstUsed = false, finished = false;

    const anagram = el('div', { class: 'anagram' }, scrambled.map((w) => el('span', { text: w })));
    const ptsEl = el('span', { class: 'points-max' }); const heartsEl = el('span');
    const hintHost = el('div');
    const input = el('input', { type: 'text', placeholder: 'Le titre…', 'aria-label': 'Ta réponse', enterkeyhint: 'go' });
    const validate = WJ.ui.button('Valider', () => submit(input.value), 'btn btn-primary');
    const form = el('div', { class: 'guess' }, [el('div', { class: 'ac-host' }, [input]), validate]);
    const hints = el('div', { class: 'row' });
    const result = el('div');
    const points = () => Math.max(0, 100 - errors * PENALTY - (imageUsed ? IMAGE_COST : 0) - (descUsed ? DESC_COST : 0) - (firstUsed ? FIRST_COST : 0));
    const refresh = () => { ptsEl.innerHTML = `Jusqu’à <span class="pts">${points()}</span> pts`; heartsEl.innerHTML = ''; heartsEl.append(WJ.ui.hearts(lives, LIVES)); };
    const desc = entry.description ? WJ.answer.hideTitleWords(entry.description, entry.title) : '';
    const bImg = WJ.ui.button(`🖼️ Image (−${IMAGE_COST})`, () => { imageUsed = true; bImg.remove(); hintHost.prepend(el('div', { class: 'image-frame' }, [WJ.ui.image(entry.image, 'Indice')])); refresh(); }, 'btn btn-ghost btn-sm');
    const bDesc = WJ.ui.button(`💡 Description (−${DESC_COST})`, () => { descUsed = true; bDesc.remove(); hintHost.append(el('div', { class: 'hint-box', text: desc })); refresh(); }, 'btn btn-ghost btn-sm');
    const bFirst = WJ.ui.button(`🔤 Premières lettres (−${FIRST_COST})`, () => { firstUsed = true; bFirst.remove(); hintHost.append(el('div', { class: 'hint-box', text: 'Commence par : ' + words.map((w) => upper(w)[0] + '…').join(' ') })); refresh(); }, 'btn btn-ghost btn-sm');
    const pass = WJ.ui.button('Je passe', () => finish(false, true), 'btn btn-ghost btn-sm');
    hints.append(entry.image ? bImg : null, desc ? bDesc : null, bFirst, pass);

    let resolveRound; const done = new Promise((r) => { resolveRound = r; });
    async function submit(value) {
      if (finished) return;
      const v = String(value || '').trim(); if (!v) return;
      validate.disabled = true;
      const verdict = await WJ.answer.check(v, target, { lenient: true });
      validate.disabled = false;
      if (verdict.ok) return finish(true);
      errors++; lives--; input.value = ''; input.focus(); refresh();
      if (lives <= 0 || points() <= 0) return finish(false);
      WJ.ui.toast(`Non… −${PENALTY} pts`, 'ko', 1200);
    }
    function finish(ok, passed = false) {
      if (finished) return; finished = true;
      const pts = ok ? points() : 0;
      form.remove(); hints.remove();
      anagram.innerHTML = ''; words.forEach((w) => anagram.append(el('span', { text: upper(w), class: 'found' })));
      result.append(el('div', { class: 'reveal ' + (ok ? 'ok' : 'ko') }, [
        el('h3', { text: entry.title }), entry.description ? el('p', { class: 'muted', text: entry.description }) : null,
        el('p', { class: 'pts', text: ok ? `+${pts} pts` : passed ? 'Passé · 0 pt' : 'Perdu · 0 pt' }),
        WJ.ui.articleFooter(entry, { withCredit: imageUsed }),
      ]));
      WJ.ui.waitNext(result).then(() => resolveRound({ ok, points: pts, title: entry.title, emoji: !ok ? (passed ? '⬜' : '🟥') : points() >= 70 ? '🟩' : '🟨' }));
    }
    content.append(el('p', { class: 'muted', text: `${words.length} mot${words.length > 1 ? 's' : ''}, lettres mélangées :` }), anagram, el('div', { class: 'points-line' }, [ptsEl, heartsEl]), hintHost, form, hints, result);
    refresh();
    WJ.ui.autocomplete(input, { onSubmit: submit });
    setTimeout(() => input.focus({ preventScroll: true }), 50);
    return done;
  }

  WJ.standardGame({
    id: 'anagramme', name: 'Anagramme', icon: '🔀', group: 'deviner',
    desc: 'Les lettres du titre sont mélangées, mot par mot. Remets-les dans l’ordre.',
    rules: ['100 pts au départ, −15 par erreur.', `Indices payants : l’image (−${IMAGE_COST}), la description (−${DESC_COST}), les premières lettres (−${FIRST_COST}).`],
    themes: true, need: { image: true }, rounds: 10, playRound,
  });
})();
