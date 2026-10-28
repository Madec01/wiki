/* Chaînon manquant : trouve un article qui relie A à C (A → ? → C). */
(() => {
  const { el, shuffle, pick } = WJ.util;
  const ROUNDS = 5, PENALTY = 20, HINT = 20, TRIES = 3;
  const okLink = (t) => !/^\d/.test(t) && !/^(Liste|Portail|Catégorie|Fichier|Aide|Modèle|Wikipédia|Spécial|Projet|Référence)\b/i.test(t) && !/\(homonymie\)/i.test(t) && t.length >= 3 && !/^(Janvier|Février|Mars|Avril|Mai|Juin|Juillet|Août|Septembre|Octobre|Novembre|Décembre)\b/.test(t) && !/siècle|millénaire|décennie|^Années /i.test(t);

  async function buildChain(a) {
    const aLinks = (await WJ.api.outgoingLinks(a.title, 500)).filter(okLink);
    if (aLinks.length < 10) throw new Error('Article de départ trop peu lié.');
    const aSet = new Set(aLinks);
    for (let attempt = 0; attempt < 4; attempt++) {
      const b = pick(aLinks);
      const bLinks = (await WJ.api.outgoingLinks(b, 500)).filter((t) => okLink(t) && t !== a.title && !aSet.has(t));
      if (bLinks.length < 10) continue;
      const cTitle = pick(bLinks);
      const [bInfo, cInfo] = await Promise.all([WJ.api.summary(b).catch(() => null), WJ.api.summary(cTitle).catch(() => null)]);
      if (!cInfo || cInfo.type === 'disambiguation') continue;
      return { a, b: { title: b, description: bInfo?.description || '', pageid: bInfo?.pageid, image: bInfo?.thumbnail?.source }, c: { title: cInfo.title, description: cInfo.description || '', pageid: cInfo.pageid, image: cInfo.thumbnail?.source } };
    }
    throw new Error('Impossible de construire une chaîne depuis cet article.');
  }

  async function playRound({ entry, content }) {
    content.append(WJ.ui.loading('Construction de la chaîne…'));
    const chain = await buildChain(entry);
    content.innerHTML = '';
    const { a, b, c } = chain;
    let tries = 0, hintUsed = false, finished = false;
    const points = () => Math.max(20, 100 - tries * PENALTY - (hintUsed ? HINT : 0));
    const ptsEl = el('span', { class: 'points-max' });
    const refresh = () => { ptsEl.innerHTML = `Jusqu’à <span class="pts">${points()}</span> pts · ${TRIES - tries} essai${TRIES - tries > 1 ? 's' : ''}`; };
    const node = (x, cls) => el('div', { class: 'vs-card ' + cls }, [x.image ? WJ.ui.image(x.image, '', '') : el('div', { style: { height: '100px', background: 'var(--bg-2)' } }), el('div', { class: 'vs-body' }, [el('h3', { text: x.title }), x.description ? el('p', { class: 'muted', style: { fontSize: '.8rem' }, text: x.description }) : null])]);
    const mystery = el('div', { class: 'vs-card' }, [el('div', { class: 'vs-body' }, [el('h3', { text: '?' }), el('div', { class: 'vs-views', text: '→ ? →' })])]);
    const hintHost = el('div');
    const input = el('input', { type: 'text', placeholder: 'Un article qui relie les deux…', 'aria-label': 'Ta réponse', enterkeyhint: 'go' });
    const validate = WJ.ui.button('Vérifier', () => submit(input.value), 'btn btn-primary');
    const form = el('div', { class: 'guess' }, [el('div', { class: 'ac-host' }, [input]), validate]);
    const hintBtn = WJ.ui.button(`💡 Indice (−${HINT})`, () => { hintUsed = true; hintBtn.remove(); hintHost.append(el('div', { class: 'hint-box', text: `Une solution possible commence par « ${b.title[0]} »${b.description ? ' : ' + WJ.answer.hideTitleWords(b.description, b.title) : ''}.` })); refresh(); }, 'btn btn-ghost btn-sm');
    const pass = WJ.ui.button('Je passe', () => finish(false), 'btn btn-ghost btn-sm');
    const result = el('div');
    let resolveRound; const done = new Promise((r) => { resolveRound = r; });

    async function submit(value) {
      if (finished) return;
      const v = String(value || '').trim(); if (!v) return;
      validate.disabled = true;
      try {
        const resolved = await WJ.api.resolve(v);
        if (!resolved) { WJ.ui.toast('Cet article n’existe pas.', 'ko'); return; }
        const x = resolved.title;
        if (x === a.title || x === c.title) { WJ.ui.toast('Il faut un article intermédiaire !', 'warn'); return; }
        const [fromA, toC] = await Promise.all([WJ.api.linksBetween(a.title, [v, x]), WJ.api.linksBetween(x, [c.title])]);
        if (fromA.length && toC.length) return finish(true, x);
        tries++; refresh(); input.value = ''; input.focus();
        const why = !fromA.length && !toC.length ? `« ${a.title} » ne mène pas à « ${x} », et « ${x} » ne mène pas à « ${c.title} ».` : !fromA.length ? `« ${a.title} » ne contient pas de lien vers « ${x} ».` : `« ${x} » ne contient pas de lien vers « ${c.title} ».`;
        WJ.ui.toast(why, 'ko', 3200);
        if (tries >= TRIES) finish(false);
      } catch (e) { WJ.ui.toast('Vérification impossible, réessaie.', 'warn'); }
      finally { validate.disabled = false; }
    }
    function finish(ok, found) {
      if (finished) return; finished = true;
      const pts = ok ? points() : 0;
      form.remove(); hintBtn.remove(); pass.remove();
      mystery.replaceWith(node({ title: found || b.title, description: found && found !== b.title ? 'Ta solution' : b.description, image: found && found !== b.title ? null : b.image }, ok ? 'right' : 'wrong'));
      result.append(el('div', { class: 'reveal ' + (ok ? 'ok' : 'ko') }, [
        el('p', { class: 'pts', text: ok ? `+${pts} pts` : `Perdu · 0 pt. Une solution : ${b.title}` }),
        el('div', { class: 'article-footer' }, [a, { title: found || b.title }, c].map((x) => el('a', { href: WJ.util.wikiUrl(x.title), target: '_blank', rel: 'noopener', class: 'btn btn-ghost btn-sm' }, [x.title + ' ↗']))),
      ]));
      WJ.ui.waitNext(result).then(() => resolveRound({ ok, points: pts, title: a.title, emoji: !ok ? '🟥' : tries === 0 ? '🟩' : '🟨', label: `${a.title} → ${found || b.title} → ${c.title}` }));
    }
    content.append(el('p', { class: 'muted', text: 'Trouve un article qui est lié depuis le premier ET qui contient un lien vers le second.' }), el('div', { class: 'duel', style: { gridTemplateColumns: '1fr 1fr 1fr' } }, [node(a, ''), mystery, node(c, '')]), el('div', { class: 'points-line' }, [ptsEl]), hintHost, form, el('div', { class: 'row' }, [hintBtn, pass]), result);
    refresh();
    WJ.ui.autocomplete(input, { onSubmit: submit });
    setTimeout(() => input.focus({ preventScroll: true }), 50);
    return done;
  }

  WJ.standardGame({
    id: 'chainon', name: 'Le chaînon manquant', icon: '🔗', group: 'explorer',
    desc: 'Deux articles sans lien direct. Trouve l’article qui fait le pont entre les deux.',
    rules: ['Toute réponse valable est acceptée : il doit y avoir un lien de A vers ta réponse, et de ta réponse vers C.', `100 pts, −${PENALTY} par essai raté, ${TRIES} essais. L’indice coûte ${HINT} pts.`, `${ROUNDS} chaînes par partie.`],
    themes: true, need: { image: true }, rounds: ROUNDS, playRound,
  });
})();
