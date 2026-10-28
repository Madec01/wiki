/* Catégories : on te donne les catégories d'un article, retrouve-le. */
(() => {
  const { el, shuffle, rng } = WJ.util;
  const PENALTY = 10, LIVES = 6, COST = { traits: 15, image: 25, desc: 10 };
  const BAD_CAT = /^(Article|Bon article|Portail|Wikipédia|Page |Pages |Projet|Catégorie Commons|Image |Modèle|Admissibilité|Wikiprojet|Ébauche|Index|Catégorie:Catégorie)/i;
  const GENERIC = /^(Naissance|Décès|Personnalité|Mort|Date|\d)/i;

  async function prepare(entries) {
    const pages = await WJ.api.pages(entries.map((e) => e.title), { prop: 'categories', clshow: '!hidden', cllimit: 'max' });
    const byTitle = Object.fromEntries(pages.map((p) => [p.title, p]));
    const out = [];
    for (const e of entries) {
      const cats = (byTitle[e.title]?.categories || []).map((c) => c.title.replace(/^Catégorie:/, '')).filter((c) => !BAD_CAT.test(c));
      const masked = cats.map((c) => WJ.answer.hideTitleWords(c, e.title));
      const random = rng(e.title);
      const specific = shuffle(masked.filter((c) => !GENERIC.test(c)), random), generic = shuffle(masked.filter((c) => GENERIC.test(c)), random);
      if (masked.length >= 3) out.push({ ...e, cats: specific.concat(generic) });
    }
    if (!out.length) throw new Error('Pas assez de catégories exploitables, réessaie.');
    return out;
  }

  async function playRound({ entry, content, difficulty = 'normal' }) {
    const easy = difficulty === 'facile';
    const title = WJ.answer.displayTitle(entry.title);
    let errors = 0, lives = LIVES, shown = Math.min(easy ? 6 : 5, entry.cats.length), used = { traits: false, image: false, desc: false }, finished = false;
    const target = { title: entry.title, pageid: entry.pageid, aliases: [title] };
    const revealed = new Set();
    const list = el('ul', { class: 'cats' });
    const ptsEl = el('span', { class: 'points-max' });
    const heartsEl = el('span');
    const hintHost = el('div');
    const maskHost = el('div');
    const input = el('input', { type: 'text', placeholder: 'Quel article ?', 'aria-label': 'Ta réponse', enterkeyhint: 'go' });
    const validate = WJ.ui.button('Valider', () => submit(input.value), 'btn btn-primary');
    const form = el('div', { class: 'guess' }, [el('div', { class: 'ac-host' }, [input]), validate]);
    const result = el('div');
    const points = () => Math.max(0, 100 - errors * PENALTY - (used.traits ? COST.traits : 0) - (used.image ? COST.image : 0) - (used.desc ? COST.desc : 0));
    const desc = entry.description ? WJ.answer.hideTitleWords(entry.description, entry.title) : '';
    const bTraits = WJ.ui.button(`▁▁▁ Les traits (−${COST.traits})`, () => { used.traits = true; bTraits.remove(); if (easy) [...title].forEach((c, i) => { if (/[\p{L}\p{N}]/u.test(c) && (i === 0 || title[i - 1] === ' ')) revealed.add(i); }); renderMask(); refresh(); }, 'btn btn-ghost btn-sm');
    const bImg = WJ.ui.button(`🖼️ L’image (−${COST.image})`, () => { used.image = true; bImg.remove(); hintHost.append(el('div', { class: 'image-frame', style: { maxHeight: '36vh' } }, [WJ.ui.image(entry.image, 'Indice')])); refresh(); }, 'btn btn-ghost btn-sm');
    const bDesc = WJ.ui.button(`💡 Description (−${COST.desc})`, () => { used.desc = true; bDesc.remove(); hintHost.append(el('div', { class: 'hint-box', text: desc })); refresh(); }, 'btn btn-ghost btn-sm');
    const pass = WJ.ui.button('Je passe', () => finish(false, true), 'btn btn-ghost btn-sm');
    const hints = el('div', { class: 'hints' }, [bTraits, entry.image ? bImg : null, desc ? bDesc : null, pass]);
    function renderList() { list.innerHTML = ''; entry.cats.slice(0, shown).forEach((c) => list.append(el('li', { text: c }))); }
    function renderMask() { maskHost.innerHTML = ''; if (used.traits) maskHost.append(WJ.ui.maskView(WJ.answer.mask(title, revealed))); }
    function refresh() { ptsEl.innerHTML = `Jusqu’à <span class="pts">${points()}</span> pts`; heartsEl.innerHTML = ''; heartsEl.append(WJ.ui.hearts(lives, LIVES)); }

    let resolveRound; const done = new Promise((r) => { resolveRound = r; });
    async function submit(value) {
      if (finished) return;
      const v = String(value || '').trim(); if (!v) return;
      validate.disabled = true;
      const verdict = await WJ.answer.check(v, target, { lenient: true });
      validate.disabled = false;
      if (verdict.ok) { if (verdict.partial) WJ.ui.toast('Le nom suffit, on accepte !', 'ok'); return finish(true); }
      errors++; lives--; input.value = ''; input.focus();
      if (shown < entry.cats.length) { shown++; renderList(); }
      if (used.traits) { const more = WJ.answer.revealOneMore(title, revealed); if (more !== null) revealed.add(more); renderMask(); }
      refresh();
      if (lives <= 0 || points() <= 0) return finish(false);
      WJ.ui.toast(`Non… −${PENALTY} pts${shown <= entry.cats.length ? ', une catégorie de plus' : ''}.`, 'ko', 1400);
    }
    function finish(ok, passed = false) {
      if (finished) return; finished = true;
      const pts = ok ? points() : 0;
      form.remove(); hints.remove(); maskHost.innerHTML = '';
      shown = entry.cats.length; renderList();
      result.append(el('div', { class: 'reveal ' + (ok ? 'ok' : 'ko') }, [
        el('h3', { text: entry.title }), entry.description ? el('p', { class: 'muted', text: entry.description }) : null,
        el('p', { class: 'pts', text: ok ? `+${pts} pts` : passed ? 'Passé · 0 pt' : 'Perdu · 0 pt' }),
        WJ.ui.articleFooter(entry, { withCredit: used.image }),
      ]));
      WJ.ui.waitNext(result).then(() => resolveRound({ ok, points: pts, title: entry.title, emoji: !ok ? (passed ? '⬜' : '🟥') : errors === 0 ? '🟩' : '🟨' }));
    }
    content.append(el('p', { class: 'muted', text: 'Cet article appartient aux catégories suivantes :' }), list, el('div', { class: 'points-line' }, [ptsEl, heartsEl]), hintHost, maskHost, form, hints, result);
    renderList(); refresh();
    if (easy && desc) bDesc.click();
    WJ.ui.autocomplete(input, { onSubmit: submit });
    setTimeout(() => input.focus({ preventScroll: true }), 50);
    return done;
  }

  WJ.standardGame({
    id: 'categories', name: 'Les catégories', icon: '🗂️', group: 'deviner',
    desc: 'Cinq catégories d’un article s’affichent. Devine de quel article il s’agit.',
    rules: [`100 pts au départ, chaque erreur coûte ${PENALTY} pts et dévoile une catégorie de plus. ${LIVES} vies.`, `Indices : les traits du titre (−${COST.traits}), l’image (−${COST.image}), la description (−${COST.desc}, offerte en Facile).`, 'Pour une personne, le nom de famille suffit.'],
    themes: true, need: {}, rounds: 10, prepare, playRound,
  });
})();
