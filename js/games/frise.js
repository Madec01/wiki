/* Frise chronologique : place chaque carte au bon endroit dans la frise. */
(() => {
  const { el, shuffle, fmtYear, yearFromWikidata } = WJ.util;
  const THEMES = ['populaire', 'personnalites', 'cinema', 'monuments', 'jeux', 'peinture'];
  const MODES = [
    { id: 'classique', name: 'Classique', icon: '🕰️', cards: 10, lives: 3, desc: '10 cartes, 3 erreurs permises' },
    { id: 'marathon', name: 'Marathon', icon: '🏃', cards: 20, lives: 5, desc: '20 cartes, 5 erreurs permises' },
    { id: 'sansfilet', name: 'Sans filet', icon: '🪢', cards: 10, lives: 1, desc: '10 cartes, une seule erreur' },
    { id: 'classement', name: 'Classement', icon: '🧩', cards: 8, lives: 0, order: true, desc: '8 cartes à ranger de la plus ancienne à la plus récente, puis on compte les justes' },
  ];
  const PTS = 10;
  const KIND_LABEL = { naissance: '👤 naissance', sortie: '🎬 sortie', creation: '🏛️ création', debut: '📅 début', evenement: '📅 événement' };
  const KIND_PRIORITY = ['naissance', 'sortie', 'creation', 'debut', 'evenement'];

  /** Une date « clé » par entité : naissance, sortie, création, début ou date de l'événement. */
  async function keyDates(qids) {
    if (!qids.length) return {};
    const values = qids.map((q) => 'wd:' + q).join(' ');
    const rows = await WJ.api.sparql(`SELECT ?item ?date ?kind WHERE { VALUES ?item { ${values} }
      { ?item wdt:P569 ?date . BIND("naissance" AS ?kind) } UNION { ?item wdt:P577 ?date . BIND("sortie" AS ?kind) }
      UNION { ?item wdt:P571 ?date . BIND("creation" AS ?kind) } UNION { ?item wdt:P580 ?date . BIND("debut" AS ?kind) } UNION { ?item wdt:P585 ?date . BIND("evenement" AS ?kind) } }`);
    const out = {};
    for (const r of rows) {
      const q = WJ.api.qidFromUri(r.item), y = yearFromWikidata(r.date), kind = r.kind || 'evenement';
      if (y === null) continue;
      const cur = out[q];
      const better = !cur || KIND_PRIORITY.indexOf(kind) < KIND_PRIORITY.indexOf(cur.kind) || (kind === cur.kind && y < cur.year);
      if (better) out[q] = { year: y, kind };
    }
    return out;
  }

  const game = {
    id: 'frise', name: 'Frise chronologique', icon: '🕰️', group: 'comparer',
    desc: 'Des personnages, des films, des monuments : place chaque carte au bon endroit dans le temps.',
    start(root, params = {}) {
      const themes = WJ.pool.THEMES.filter((t) => THEMES.includes(t.id));
      const launch = async ({ theme, mode: modeId, difficulty = 'normal' }) => {
        const mode = MODES.find((m) => m.id === modeId) || MODES[0];
        WJ.ui.view(root, WJ.ui.loading('Recherche de dates sur Wikidata…'));
        try {
          const entries = await WJ.pool.draw(theme, { count: mode.cards + 8, need: { image: true, qid: true }, difficulty });
          const dates = await keyDates(entries.map((e) => e.qid));
          const cards = shuffle(entries.filter((e) => dates[e.qid]).map((e) => ({ ...e, ...dates[e.qid] }))).slice(0, mode.cards);
          if (cards.length < 5) throw new Error('Pas assez de dates trouvées pour ce thème, réessaie.');
          if (mode.order) playOrder(root, cards, theme, mode, difficulty); else play(root, cards, theme, mode, difficulty);
        } catch (e) { WJ.ui.view(root, WJ.ui.errorBox(e, () => launch({ theme, mode: modeId, difficulty }))); }
      };
      if (params.go) return launch({ theme: params.theme || 'populaire', mode: params.mode || 'classique', difficulty: params.difficulty || WJ.store.settings().difficulty || 'normal' });
      WJ.ui.view(root, WJ.ui.startScreen({ game, themes, defaultTheme: params.theme || 'populaire', modes: MODES, defaultMode: params.mode || 'classique', difficulty: true, rules: [`${PTS} pts par carte bien placée, +20 si tout est juste.`, 'Une carte mal placée est déplacée au bon endroit et la frise continue.', 'Mode Classement : toutes les cartes sont visibles, range-les puis valide ; on compte les justes et les fausses.', 'Les dates viennent de Wikidata : naissance, sortie, construction ou date de l’événement.'], onStart: launch }));
    },
  };

  function play(root, cards, theme, mode, difficulty) {
    const shell = WJ.ui.shell(root, { title: game.name, icon: game.icon, rounds: cards.length - 1 });
    const placed = [cards[0]];
    const queue = cards.slice(1);
    let lives = mode.lives, score = 0, correct = 0, finished = false;
    const results = [];
    const timeline = el('div', { class: 'timeline' });
    const ends = el('div', { class: 'tl-ends' });
    const current = el('div', { class: 'tl-current' });
    const lifeLine = el('div', { class: 'row center' });
    shell.content.append(el('p', { class: 'muted', style: { textAlign: 'center' }, text: 'Où placer cette carte ? Clique sur un « + » : à gauche le plus ancien, à droite le plus récent.' }), lifeLine, current, timeline, el('div', { class: 'tl-axis' }), ends);

    const cardEl = (c, { showYear = true, cls = '' } = {}) => el('div', { class: 'tl-card ' + cls }, [
      WJ.ui.image(c.image, '', ''), el('div', { text: c.title, style: { fontWeight: 600 } }),
      el('div', { class: 'muted', style: { fontSize: '.72rem' }, text: KIND_LABEL[c.kind] || '' }),
      el('div', { class: 'year', text: showYear ? fmtYear(c.year) : '?' }),
    ]);
    function render() {
      lifeLine.innerHTML = ''; lifeLine.append(WJ.ui.hearts(lives, mode.lives));
      shell.setScore(score); shell.setRound(Math.min(results.length + 1, cards.length - 1), cards.length - 1);
      current.innerHTML = ''; timeline.innerHTML = '';
      ends.innerHTML = ''; ends.append(el('span', { text: '⟵ plus ancien · ' + fmtYear(placed[0].year) }), el('span', { text: fmtYear(placed[placed.length - 1].year) + ' · plus récent ⟶' }));
      const card = queue[0];
      if (!card || lives <= 0) return finish();
      current.append(cardEl(card, { showYear: false }));
      const gap = (g) => el('button', { class: 'tl-gap', type: 'button', 'aria-label': 'Placer ici', text: '+', onclick: () => place(g) });
      timeline.append(gap(0));
      placed.forEach((p, i) => { timeline.append(cardEl(p, { cls: p.cls || '' })); timeline.append(gap(i + 1)); });
    }
    function place(g) {
      if (finished) return;
      const card = queue.shift();
      const okLeft = g === 0 || placed[g - 1].year <= card.year;
      const okRight = g === placed.length || card.year <= placed[g].year;
      const ok = okLeft && okRight;
      let pos = g;
      if (!ok) { pos = placed.findIndex((p) => p.year > card.year); if (pos < 0) pos = placed.length; lives--; }
      else { score += PTS; correct++; }
      card.cls = ok ? 'placed-ok' : 'placed-ko';
      placed.splice(pos, 0, card);
      results.push({ ok, points: ok ? PTS : 0, title: card.title, label: `${card.title} (${fmtYear(card.year)})` });
      WJ.ui.toast(ok ? `Bien placé ! ${fmtYear(card.year)}` : `Raté : ${fmtYear(card.year)}`, ok ? 'ok' : 'ko', 1500);
      render();
      const node = timeline.children[pos * 2 + 1];
      if (node) node.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
    function finish() {
      if (finished) return; finished = true;
      if (correct === cards.length - 1) score += 20;
      WJ.store.bumpStat('games', 1); WJ.store.bumpStat('points', score);
      const variant = [theme, mode.id, difficulty !== 'normal' ? difficulty : null].filter(Boolean).join(':');
      const best = WJ.store.best(game.id, variant)?.score ?? null;
      const isBest = WJ.store.recordScore(game.id, variant, score);
      WJ.ui.view(root, WJ.ui.endScreen({ game: game.name, variantLabel: `${WJ.pool.theme(theme).name}, ${mode.name}`, results, total: score, isBest, best, shareText: `WikiJeux · ${game.name} · ${mode.name}\n${results.map((r) => (r.ok ? '🟩' : '🟥')).join('')} ${score} pts\n${location.href.split('#')[0]}#/frise`, onReplay: () => { location.hash = `#/frise?theme=${theme}&mode=${mode.id}&difficulty=${difficulty}&go=1&r=${Date.now()}`; } }));
    }
    render();
  }
  /** Mode Classement : toutes les cartes sont visibles, on les range avec les flèches puis on valide. */
  function playOrder(root, cards, theme, mode, difficulty) {
    const shell = WJ.ui.shell(root, { title: game.name, icon: game.icon, rounds: 0 });
    const order = cards.slice();
    let finished = false;
    const list = el('div', { class: 'order-list' });
    const result = el('div');
    const validate = WJ.ui.button('Valider l’ordre', () => check(), 'btn btn-primary btn-lg');
    shell.content.append(el('p', { class: 'muted', style: { textAlign: 'center' }, text: 'Range les cartes de la plus ancienne (1) à la plus récente avec les flèches, puis valide.' }), list, el('div', { class: 'row center' }, [validate]), result);
    const move = (i, d) => { const j = i + d; if (j < 0 || j >= order.length) return; [order[i], order[j]] = [order[j], order[i]]; render(); };
    function render(verdict = null) {
      list.innerHTML = '';
      order.forEach((c, i) => {
        const v = verdict ? verdict[i] : null;
        const card = el('div', { class: 'tl-card' + (v === null ? '' : v ? ' placed-ok' : ' placed-ko') }, [
          el('span', { class: 'pos', text: String(i + 1) }),
          WJ.ui.image(c.image, '', ''), el('div', { text: c.title, style: { fontWeight: 600 } }),
          el('div', { class: 'muted', style: { fontSize: '.68rem' }, text: KIND_LABEL[c.kind] || '' }),
          el('div', { class: 'year', text: verdict ? fmtYear(c.year) : '?' }),
          verdict ? null : el('div', { class: 'order-arrows' }, [
            el('button', { type: 'button', text: '◀', 'aria-label': 'Vers la gauche', disabled: i === 0, onclick: () => move(i, -1) }),
            el('button', { type: 'button', text: '▶', 'aria-label': 'Vers la droite', disabled: i === order.length - 1, onclick: () => move(i, 1) }),
          ]),
        ]);
        list.append(card);
      });
    }
    function check() {
      if (finished) return; finished = true;
      validate.remove();
      const sorted = order.slice().sort((a, b) => a.year - b.year);
      const verdict = order.map((c, i) => c.year === sorted[i].year);
      const exact = verdict.filter(Boolean).length;
      let score = exact * PTS + (exact === order.length ? 20 : 0);
      render(verdict);
      shell.setScore(score);
      const results = order.map((c, i) => ({ ok: verdict[i], points: verdict[i] ? PTS : 0, title: c.title, label: `${i + 1}. ${c.title} (${fmtYear(c.year)})` }));
      result.append(el('div', { class: 'reveal ' + (exact === order.length ? 'ok' : exact ? '' : 'ko') }, [
        el('h3', { text: `${exact} juste${exact > 1 ? 's' : ''}, ${order.length - exact} fau${order.length - exact > 1 ? 'sses' : 'sse'}` }),
        el('p', { class: 'muted', text: 'Bon ordre : ' + sorted.map((c) => `${c.title} (${fmtYear(c.year)})`).join(' → ') }),
        el('p', { class: 'pts', text: `+${score} pts` }),
      ]));
      WJ.ui.waitNext(result, 'Voir le résultat').then(() => {
        WJ.store.bumpStat('games', 1); WJ.store.bumpStat('points', score);
        const variant = [theme, mode.id, difficulty !== 'normal' ? difficulty : null].filter(Boolean).join(':');
        const best = WJ.store.best(game.id, variant)?.score ?? null;
        const isBest = WJ.store.recordScore(game.id, variant, score);
        WJ.ui.view(root, WJ.ui.endScreen({ game: game.name, variantLabel: `${WJ.pool.theme(theme).name}, ${mode.name}`, results, total: score, isBest, best, shareText: `WikiJeux · ${game.name} · ${mode.name}\n${results.map((r) => (r.ok ? '🟩' : '🟥')).join('')} ${exact}/${order.length} justes, ${score} pts\n${location.href.split('#')[0]}#/frise`, onReplay: () => { location.hash = `#/frise?theme=${theme}&mode=${mode.id}&difficulty=${difficulty}&go=1&r=${Date.now()}`; } }));
      });
    }
    render();
    WJ.debugOrder = { order, move };
  }

  WJ.register(game);
  WJ.frise = { keyDates };
})();
