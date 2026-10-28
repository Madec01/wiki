/* Chaînon manquant : trouve un article qui relie A à C (A → ? → C). Choix multiple, saisie libre en Difficile. */
(() => {
  const { el, shuffle, pick } = WJ.util;
  const ROUNDS = 5, PENALTY = 20, HINT = 20, TRIES = 3, CHOICES = 4;
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
      return { a, aLinks, b: { title: b, description: bInfo?.description || '', pageid: bInfo?.pageid, image: bInfo?.thumbnail?.source }, c: { title: cInfo.title, description: cInfo.description || '', pageid: cInfo.pageid, image: cInfo.thumbnail?.source } };
    }
    throw new Error('Impossible de construire une chaîne depuis cet article.');
  }

  /** Leurres : des liens de A qui ne mènent pas à C (vérifié). */
  async function distractors(chain, n) {
    const out = [];
    const cands = shuffle(chain.aLinks.filter((t) => t !== chain.b.title && t !== chain.c.title));
    for (const t of cands) {
      if (out.length >= n) break;
      try { const links = await WJ.api.linksBetween(t, [chain.c.title]); if (!links.length) out.push(t); } catch (e) { /* on ignore ce candidat */ }
      if (out.length < n && cands.indexOf(t) > 20) break;
    }
    return out;
  }

  async function playRound({ entry, content, difficulty = 'normal' }) {
    content.append(WJ.ui.loading('Construction de la chaîne…'));
    const chain = await buildChain(entry);
    const free = difficulty === 'difficile';
    const options = free ? null : shuffle([chain.b.title, ...(await distractors(chain, CHOICES - 1))]);
    WJ.debugChain = chain;
    content.innerHTML = '';
    const { a, b, c } = chain;
    let tries = 0, hintUsed = false, finished = false;
    const points = () => (free ? Math.max(20, 100 - tries * PENALTY - (hintUsed ? HINT : 0)) : tries === 0 ? 100 : 50);
    const ptsEl = el('span', { class: 'points-max' });
    const refresh = () => { ptsEl.innerHTML = `Jusqu’à <span class="pts">${points()}</span> pts · ${(free ? TRIES : 2) - tries} essai${(free ? TRIES : 2) - tries > 1 ? 's' : ''}`; };
    const node = (x, cls) => el('div', { class: 'vs-card ' + cls }, [x.image ? WJ.ui.image(x.image, '', '') : el('div', { style: { height: '100px', background: 'var(--bg-2)' } }), el('div', { class: 'vs-body' }, [el('h3', { text: x.title }), x.description ? el('p', { class: 'muted', style: { fontSize: '.8rem' }, text: x.description }) : null])]);
    const mystery = el('div', { class: 'vs-card' }, [el('div', { class: 'vs-body' }, [el('h3', { text: '?' }), el('div', { class: 'vs-views', text: '→ ? →' })])]);
    const hintHost = el('div');
    const result = el('div');
    let resolveRound; const done = new Promise((r) => { resolveRound = r; });

    function finish(ok, found) {
      if (finished) return; finished = true;
      const pts = ok ? points() : 0;
      form?.remove(); hintBtn?.remove(); pass?.remove(); choices?.querySelectorAll('button').forEach((x) => { x.disabled = true; if (x.textContent === b.title) x.classList.add('right'); });
      mystery.replaceWith(node({ title: found || b.title, description: found && found !== b.title ? 'Ta solution' : b.description, image: found && found !== b.title ? null : b.image }, ok ? 'right' : 'wrong'));
      result.append(el('div', { class: 'reveal ' + (ok ? 'ok' : 'ko') }, [
        el('p', { class: 'pts', text: ok ? `+${pts} pts` : `Perdu · 0 pt. Une solution : ${b.title}` }),
        el('div', { class: 'article-footer' }, [a, { title: found || b.title }, c].map((x) => el('a', { href: WJ.util.wikiUrl(x.title), target: '_blank', rel: 'noopener', class: 'btn btn-ghost btn-sm' }, [x.title + ' ↗']))),
      ]));
      WJ.ui.waitNext(result).then(() => resolveRound({ ok, points: pts, title: a.title, emoji: !ok ? '🟥' : tries === 0 ? '🟩' : '🟨', label: `${a.title} → ${found || b.title} → ${c.title}` }));
    }

    // --- choix multiple
    let form = null, hintBtn = null, pass = null, choices = null;
    if (!free) {
      choices = el('div', { class: 'choices' });
      options.forEach((t) => {
        const btn = WJ.ui.button(t, () => {
          if (finished) return;
          if (t === b.title) return finish(true, t);
          tries++; btn.classList.add('wrong'); btn.disabled = true; refresh();
          if (tries >= 2) return finish(false);
          WJ.ui.toast(`« ${t} » ne fait pas le pont. Encore un essai.`, 'ko', 1600);
        }, 'btn');
        choices.append(btn);
      });
      content.append(el('p', { class: 'muted', text: 'Lequel de ces articles est lié depuis le premier ET contient un lien vers le second ?' }), el('div', { class: 'duel', style: { gridTemplateColumns: '1fr 1fr 1fr' } }, [node(a, ''), mystery, node(c, '')]), el('div', { class: 'points-line' }, [ptsEl]), choices, result);
      refresh();
      return done;
    }

    // --- Difficile : saisie libre
    const input = el('input', { type: 'text', placeholder: 'Un article qui relie les deux…', 'aria-label': 'Ta réponse', enterkeyhint: 'go' });
    const validate = WJ.ui.button('Vérifier', () => submit(input.value), 'btn btn-primary');
    form = el('div', { class: 'guess' }, [el('div', { class: 'ac-host' }, [input]), validate]);
    hintBtn = WJ.ui.button(`💡 Indice (−${HINT})`, () => { hintUsed = true; hintBtn.remove(); hintHost.append(el('div', { class: 'hint-box', text: `Une solution possible commence par « ${b.title[0]} »${b.description ? ' : ' + WJ.answer.hideTitleWords(b.description, b.title) : ''}.` })); refresh(); }, 'btn btn-ghost btn-sm');
    pass = WJ.ui.button('Je passe', () => finish(false), 'btn btn-ghost btn-sm');
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
    content.append(el('p', { class: 'muted', text: 'Trouve un article qui est lié depuis le premier ET qui contient un lien vers le second.' }), el('div', { class: 'duel', style: { gridTemplateColumns: '1fr 1fr 1fr' } }, [node(a, ''), mystery, node(c, '')]), el('div', { class: 'points-line' }, [ptsEl]), hintHost, form, el('div', { class: 'row' }, [hintBtn, pass]), result);
    refresh();
    WJ.ui.autocomplete(input, { onSubmit: submit });
    setTimeout(() => input.focus({ preventScroll: true }), 50);
    return done;
  }

  WJ.standardGame({
    id: 'chainon', name: 'Le chaînon manquant', icon: '🔗', group: 'explorer',
    desc: 'Deux articles sans lien direct. Trouve, parmi quatre, l’article qui fait le pont entre les deux.',
    rules: ['Quatre propositions, une seule relie vraiment A à C : 100 pts du premier coup, 50 au second.', `Difficile : tape toi-même un article, toute réponse valable est acceptée (−${PENALTY} par essai raté, ${TRIES} essais, indice −${HINT}).`, `${ROUNDS} chaînes par partie.`],
    themes: true, need: { image: true }, rounds: ROUNDS, playRound,
  });
})();
