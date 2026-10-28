/* Devine l'image : l'image principale d'un article, trois façons de répondre, points dégressifs façon pendu. */
(() => {
  const { el, rng } = WJ.util;
  const MODES = {
    cash: { label: 'Réponse cash', max: 100, hint: 'Tu connais ? Tape le titre.' },
    traits: { label: 'Les traits', max: 60, hint: 'Le nombre de lettres de chaque mot est affiché.' },
    lettres: { label: 'Lettres posées', max: 30, hint: 'Un tiers des lettres est déjà dévoilé.' },
  };
  const PENALTY = 10;
  const LIVES = 5;
  const HINT_COST = 15;
  const LETTER_PENALTY = 5;
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  async function playRound({ entry, nextEntry, content, difficulty = 'normal' }) {
    const easy = difficulty === 'facile';
    const hintCost = easy ? 0 : HINT_COST;
    if (nextEntry?.image) { const pre = new Image(); pre.src = nextEntry.image; }
    const title = WJ.answer.displayTitle(entry.title);
    const target = { title: entry.title, pageid: entry.pageid, aliases: [title] };
    const random = rng(entry.title + '|lettres');
    let mode = 'cash', cap = MODES.cash.max, errors = 0, letterErrors = 0, lives = LIVES, hintUsed = false, finished = false;
    const revealed = new Set();
    const usedLetters = new Map(); // lettre normalisée → true (présente) / false (absente)
    const keyboard = el('div', { class: 'keyboard' });

    // --- éléments
    const frame = el('div', { class: 'image-frame' }, [WJ.ui.image(entry.image, 'Image mystère')]);
    frame.addEventListener('click', () => frame.classList.toggle('zoomed'));
    const ptsEl = el('span', { class: 'points-max' });
    const heartsEl = el('span');
    const modeLine = el('div', { class: 'modes' });
    const maskHost = el('div');
    const hintHost = el('div');
    const input = el('input', { type: 'text', placeholder: 'Titre de l’article…', 'aria-label': 'Ta réponse', enterkeyhint: 'go' });
    const acHost = el('div', { class: 'ac-host' }, [input]);
    const validate = WJ.ui.button('Valider', () => submit(input.value), 'btn btn-primary');
    const pass = WJ.ui.button('Je passe', () => finish(false, true), 'btn btn-ghost');
    const form = el('div', { class: 'guess' }, [acHost, validate, pass]);
    const result = el('div');
    const points = () => Math.max(0, cap - errors * PENALTY - letterErrors * LETTER_PENALTY - (hintUsed ? hintCost : 0));
    const titleLetters = () => WJ.answer.letterIndexes(title);
    const norm1 = (c) => WJ.answer.normalize(c).replace(/ /g, '');

    function renderStatus() {
      ptsEl.innerHTML = `Jusqu’à <span class="pts">${points()}</span> pts`;
      heartsEl.innerHTML = '';
      heartsEl.append(WJ.ui.hearts(lives, LIVES));
    }
    function renderMask() {
      maskHost.innerHTML = '';
      if (mode === 'cash') return;
      maskHost.append(WJ.ui.maskView(WJ.answer.mask(title, revealed)));
      renderKeyboard();
    }
    function renderKeyboard() {
      keyboard.innerHTML = '';
      if (mode === 'cash' || finished) return;
      const known = new Set(titleLetters().filter((i) => revealed.has(i)).map((i) => norm1(title[i])));
      ALPHABET.forEach((L) => {
        const n = L.toLowerCase();
        const state = usedLetters.has(n) ? (usedLetters.get(n) ? 'ok' : 'ko') : known.has(n) ? 'ok' : '';
        keyboard.append(el('button', { class: 'key ' + state, type: 'button', text: L, disabled: !!state, 'aria-label': `Lettre ${L}`, onclick: () => guessLetter(n) }));
      });
    }
    /** Pendu : une lettre présente se dévoile partout (gratuit), une lettre absente coûte quelques points. */
    function guessLetter(ch) {
      if (finished) return;
      const n = norm1(ch);
      if (!n || n.length !== 1) return;
      if (mode === 'cash') { WJ.ui.toast('Passe aux traits pour jouer les lettres.', 'warn', 1600); return; }
      const known = new Set(titleLetters().filter((i) => revealed.has(i)).map((i) => norm1(title[i])));
      if (usedLetters.has(n) || known.has(n)) { WJ.ui.toast('Lettre déjà jouée.', 'info', 900); return; }
      const hits = titleLetters().filter((i) => norm1(title[i]) === n);
      usedLetters.set(n, hits.length > 0);
      if (hits.length) {
        hits.forEach((i) => revealed.add(i));
        WJ.ui.toast(`Oui ! ${hits.length} fois.`, 'ok', 900);
      } else {
        letterErrors++;
        WJ.ui.toast(`Pas de ${ch.toUpperCase()}… −${LETTER_PENALTY} pts`, 'ko', 1100);
      }
      renderStatus(); renderMask(); renderModes();
      if (titleLetters().every((i) => revealed.has(i))) { WJ.ui.toast('Titre complet !', 'ok'); return finish(true); }
      if (points() <= 0) return finish(false);
      input.focus({ preventScroll: true });
    }
    function renderModes() {
      modeLine.innerHTML = '';
      const btn = (id) => {
        const m = MODES[id];
        const reachable = Math.max(0, Math.min(cap, m.max) - errors * PENALTY - letterErrors * LETTER_PENALTY - (hintUsed ? hintCost : 0));
        return el('button', { class: 'mode-btn', type: 'button', disabled: mode === id || (mode === 'lettres'), onclick: () => switchMode(id) }, [
          el('b', { text: (id === 'traits' ? '▁▁▁ ' : '▁A▁ ') + m.label }), el('small', { text: `jusqu’à ${reachable} pts · ${m.hint}` }),
        ]);
      };
      if (mode === 'cash') modeLine.append(btn('traits'), btn('lettres'));
      else if (mode === 'traits') modeLine.append(btn('lettres'), hintButton());
      else modeLine.append(hintButton());
    }
    function hintButton() {
      const desc = entry.description && WJ.answer.hideTitleWords(entry.description, entry.title);
      return el('button', { class: 'mode-btn', type: 'button', disabled: hintUsed || !desc, onclick: showHint }, [
        el('b', { text: '💡 Indice' }), el('small', { text: desc ? `−${hintCost} pts · la description Wikidata` : 'pas de description disponible' }),
      ]);
    }
    function showHint() {
      const desc = entry.description && WJ.answer.hideTitleWords(entry.description, entry.title);
      if (!desc || hintUsed) return;
      hintUsed = true; hintHost.innerHTML = ''; hintHost.append(el('div', { class: 'hint-box', text: desc })); renderStatus(); renderModes();
    }
    function switchMode(id) {
      if (finished) return;
      mode = id;
      cap = Math.min(cap, MODES[id].max);
      if (easy) [...title].forEach((c, i) => { if (/[\p{L}\p{N}]/u.test(c) && (i === 0 || title[i - 1] === ' ')) revealed.add(i); });
      if (id === 'lettres') WJ.answer.pickReveal(title, 0.35, random, revealed).forEach((i) => revealed.add(i));
      renderStatus(); renderMask(); renderModes();
      input.focus();
    }

    async function submit(value) {
      if (finished) return;
      const v = String(value || '').trim();
      if (!v) return input.focus();
      if ([...v].length === 1 && /[\p{L}\p{N}]/u.test(v)) { input.value = ''; return guessLetter(v); }
      validate.disabled = true;
      const verdict = await WJ.answer.check(v, target, { lenient: true });
      validate.disabled = false;
      if (verdict.ok) {
        if (verdict.partial) WJ.ui.toast('Le nom suffit, on accepte !', 'ok');
        else if (verdict.typo) WJ.ui.toast('Accepté malgré la coquille !', 'ok');
        else if (verdict.redirect) WJ.ui.toast(`« ${verdict.resolvedTitle} » mène bien au bon article !`, 'ok');
        return finish(true);
      }
      errors++; lives--;
      input.value = ''; input.focus();
      if (mode !== 'cash') {
        const more = WJ.answer.revealOneMore(title, revealed, random);
        if (more !== null) revealed.add(more);
      }
      renderStatus(); renderMask(); renderModes();
      if (lives <= 0 || points() <= 0) {
        WJ.ui.toast('Plus de vies… la réponse se dévoile.', 'ko');
        return finish(false);
      }
      WJ.ui.toast(`Non… −${PENALTY} pts, ${lives} vie${lives > 1 ? 's' : ''} restante${lives > 1 ? 's' : ''}.`, 'ko', 1800);
    }

    let resolveRound;
    const done = new Promise((r) => { resolveRound = r; });

    function finish(ok, passed = false) {
      if (finished) return;
      finished = true;
      const pts = ok ? points() : 0;
      form.remove(); modeLine.remove(); maskHost.innerHTML = ''; keyboard.remove();
      WJ.answer.letterIndexes(title).forEach((i) => revealed.add(i));
      result.append(el('div', { class: 'reveal ' + (ok ? 'ok' : 'ko') }, [
        el('h3', { text: entry.title }),
        entry.description ? el('p', { class: 'muted', text: entry.description }) : null,
        el('p', { class: 'pts', text: ok ? `+${pts} pts` : (passed ? 'Passé · 0 pt' : 'Perdu · 0 pt') }),
        WJ.ui.articleFooter(entry),
      ]));
      const emoji = !ok ? (passed ? '⬜' : '🟥') : mode === 'cash' ? '🟩' : '🟨';
      WJ.ui.waitNext(result).then(() => resolveRound({ ok, points: pts, title: entry.title, emoji, label: `${entry.title}${ok ? ` (${MODES[mode].label.toLowerCase()})` : ''}` }));
    }

    content.append(frame, el('div', { class: 'points-line' }, [ptsEl, heartsEl]), modeLine, maskHost, keyboard, hintHost, form, result);
    WJ.ui.autocomplete(input, { onSubmit: submit });
    renderStatus(); renderModes();
    if (easy) showHint();
    setTimeout(() => input.focus({ preventScroll: true }), 50);
    return done;
  }

  WJ.standardGame({
    id: 'image', name: 'Devine l’image', icon: '🖼️', group: 'deviner',
    desc: 'L’image principale d’un article s’affiche. Retrouve de quel article il s’agit.',
    rules: [
      '<b>Réponse cash</b> : tu connais, tu tapes, 100 pts.',
      '<b>Les traits</b> : le nombre de lettres s’affiche, 60 pts max.',
      '<b>Lettres posées</b> : un tiers des lettres est dévoilé, 30 pts max.',
      `Chaque mauvaise réponse coûte ${PENALTY} pts et une vie sur ${LIVES}, et dévoile une lettre de plus en mode traits ou lettres.`,
      `Façon pendu : avec les traits, tape ou clique une lettre. Présente, elle s’affiche partout gratuitement ; absente, −${LETTER_PENALTY} pts. Titre complet = gagné.`,
      'Les redirections comptent : « Napoléon » vaut « Napoléon Ier », et le nom de famille suffit pour une personne.',
      'Mode facile : sujets les plus connus, description offerte, première lettre de chaque mot dévoilée avec les traits.',
    ],
    themes: true, need: { image: true }, rounds: 10, dailyRounds: 5, daily: true, playRound,
  });
})();
