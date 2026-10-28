/* Catégories : on te donne les catégories d'un article, retrouve-le. */
(() => {
  const { el, shuffle, rng } = WJ.util;
  const PENALTY = 15, LIVES = 5, IMAGE_COST = 30;
  const BAD_CAT = /^(Article|Bon article|Portail|Wikipédia|Page |Pages |Projet|Catégorie Commons|Image |Modèle|Admissibilité|Wikiprojet|Ébauche|Index|Catégorie:Catégorie)/i;

  async function prepare(entries) {
    const pages = await WJ.api.pages(entries.map((e) => e.title), { prop: 'categories', clshow: '!hidden', cllimit: 'max' });
    const byTitle = Object.fromEntries(pages.map((p) => [p.title, p]));
    const out = [];
    for (const e of entries) {
      const cats = (byTitle[e.title]?.categories || []).map((c) => c.title.replace(/^Catégorie:/, '')).filter((c) => !BAD_CAT.test(c));
      const masked = cats.map((c) => WJ.answer.hideTitleWords(c, e.title));
      if (masked.length >= 3) out.push({ ...e, cats: shuffle(masked, rng(e.title)) });
    }
    if (!out.length) throw new Error('Pas assez de catégories exploitables, réessaie.');
    return out;
  }

  async function playRound({ entry, content }) {
    let errors = 0, lives = LIVES, shown = Math.min(3, entry.cats.length), imageUsed = false, finished = false;
    const target = { title: entry.title, pageid: entry.pageid, aliases: [WJ.answer.displayTitle(entry.title)] };
    const list = el('ul', { class: 'cats' });
    const ptsEl = el('span', { class: 'points-max' });
    const heartsEl = el('span');
    const imgHost = el('div');
    const input = el('input', { type: 'text', placeholder: 'Quel article ?', 'aria-label': 'Ta réponse', enterkeyhint: 'go' });
    const validate = WJ.ui.button('Valider', () => submit(input.value), 'btn btn-primary');
    const imgBtn = WJ.ui.button(`🖼️ Voir l’image (−${IMAGE_COST})`, () => { imageUsed = true; imgBtn.remove(); imgHost.append(el('div', { class: 'image-frame' }, [WJ.ui.image(entry.image, 'Indice')])); refresh(); }, 'btn btn-ghost');
    const pass = WJ.ui.button('Je passe', () => finish(false, true), 'btn btn-ghost');
    const form = el('div', { class: 'guess' }, [el('div', { class: 'ac-host' }, [input]), validate]);
    const result = el('div');
    const points = () => Math.max(0, 100 - errors * PENALTY - (imageUsed ? IMAGE_COST : 0));
    function renderList() { list.innerHTML = ''; entry.cats.slice(0, shown).forEach((c) => list.append(el('li', { text: c }))); }
    function refresh() { ptsEl.innerHTML = `Jusqu’à <span class="pts">${points()}</span> pts`; heartsEl.innerHTML = ''; heartsEl.append(WJ.ui.hearts(lives, LIVES)); }

    let resolveRound; const done = new Promise((r) => { resolveRound = r; });
    async function submit(value) {
      if (finished) return;
      const v = String(value || '').trim(); if (!v) return;
      validate.disabled = true;
      const verdict = await WJ.answer.check(v, target);
      validate.disabled = false;
      if (verdict.ok) return finish(true);
      errors++; lives--; input.value = ''; input.focus();
      if (shown < entry.cats.length) { shown++; renderList(); }
      refresh();
      if (lives <= 0 || points() <= 0) return finish(false);
      WJ.ui.toast(`Non… ${shown < entry.cats.length || shown > 3 ? 'une catégorie de plus.' : ''}`, 'ko', 1400);
    }
    function finish(ok, passed = false) {
      if (finished) return; finished = true;
      const pts = ok ? points() : 0;
      form.remove(); imgBtn.remove(); pass.remove();
      shown = entry.cats.length; renderList();
      result.append(el('div', { class: 'reveal ' + (ok ? 'ok' : 'ko') }, [
        el('h3', { text: entry.title }), entry.description ? el('p', { class: 'muted', text: entry.description }) : null,
        el('p', { class: 'pts', text: ok ? `+${pts} pts` : passed ? 'Passé · 0 pt' : 'Perdu · 0 pt' }),
        WJ.ui.articleFooter(entry, { withCredit: false }),
      ]));
      WJ.ui.waitNext(result).then(() => resolveRound({ ok, points: pts, title: entry.title, emoji: !ok ? (passed ? '⬜' : '🟥') : errors === 0 ? '🟩' : '🟨' }));
    }
    content.append(el('p', { class: 'muted', text: 'Cet article appartient aux catégories suivantes :' }), list, el('div', { class: 'points-line' }, [ptsEl, heartsEl]), imgHost, form, el('div', { class: 'row' }, [entry.image ? imgBtn : null, pass]), result);
    renderList(); refresh();
    WJ.ui.autocomplete(input, { onSubmit: submit });
    setTimeout(() => input.focus({ preventScroll: true }), 50);
    return done;
  }

  WJ.standardGame({
    id: 'categories', name: 'Les catégories', icon: '🗂️', group: 'deviner',
    desc: 'Trois catégories d’un article s’affichent. Devine de quel article il s’agit.',
    rules: ['100 pts au départ, chaque erreur coûte 15 pts et dévoile une catégorie de plus.', `Voir l’image coûte ${IMAGE_COST} pts.`, `${LIVES} vies par article.`],
    themes: true, need: {}, rounds: 10, prepare, playRound,
  });
})();
