/* Frise chronologique : place chaque carte au bon endroit dans la frise. */
(() => {
  const { el, shuffle, fmtYear, yearFromWikidata } = WJ.util;
  const LIVES = 3, PTS = 10, CARDS = 10;
  const THEMES = ['populaire', 'personnalites', 'cinema', 'monuments', 'jeux', 'peinture'];
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
      const launch = async ({ theme }) => {
        WJ.ui.view(root, WJ.ui.loading('Recherche de dates sur Wikidata…'));
        try {
          const entries = await WJ.pool.draw(theme, { count: 16, need: { image: true, qid: true } });
          const dates = await keyDates(entries.map((e) => e.qid));
          const cards = shuffle(entries.filter((e) => dates[e.qid]).map((e) => ({ ...e, ...dates[e.qid] }))).slice(0, CARDS);
          if (cards.length < 5) throw new Error('Pas assez de dates trouvées pour ce thème, réessaie.');
          play(root, cards, theme);
        } catch (e) { WJ.ui.view(root, WJ.ui.errorBox(e, () => launch({ theme }))); }
      };
      if (params.go) return launch({ theme: params.theme || 'populaire' });
      WJ.ui.view(root, WJ.ui.startScreen({ game, themes, defaultTheme: params.theme || 'populaire', rules: [`${PTS} pts par carte bien placée, ${LIVES} erreurs autorisées.`, 'Une carte mal placée est déplacée au bon endroit et la frise continue.', 'Les dates viennent de Wikidata : naissance, sortie, construction ou date de l’événement.'], onStart: launch }));
    },
  };

  function play(root, cards, theme) {
    const shell = WJ.ui.shell(root, { title: game.name, icon: game.icon, rounds: cards.length - 1 });
    const placed = [cards[0]];
    const queue = cards.slice(1);
    let lives = LIVES, score = 0, correct = 0, finished = false;
    const results = [];
    const timeline = el('div', { class: 'timeline' });
    const current = el('div', { class: 'tl-current' });
    const lifeLine = el('div', { class: 'row center' });
    shell.content.append(el('p', { class: 'muted', style: { textAlign: 'center' }, text: 'Clique sur un « + » pour placer la carte dans la frise, du plus ancien au plus récent.' }), lifeLine, current, timeline);

    const cardEl = (c, { showYear = true, cls = '' } = {}) => el('div', { class: 'tl-card ' + cls }, [
      WJ.ui.image(c.image, '', ''), el('div', { text: c.title, style: { fontWeight: 600 } }),
      el('div', { class: 'muted', style: { fontSize: '.72rem' }, text: KIND_LABEL[c.kind] || '' }),
      el('div', { class: 'year', text: showYear ? fmtYear(c.year) : '?' }),
    ]);
    function render() {
      lifeLine.innerHTML = ''; lifeLine.append(WJ.ui.hearts(lives, LIVES));
      shell.setScore(score); shell.setRound(correct + (results.length - correct) + 1, cards.length - 1);
      current.innerHTML = ''; timeline.innerHTML = '';
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
      const best = WJ.store.best(game.id, theme)?.score ?? null;
      const isBest = WJ.store.recordScore(game.id, theme, score);
      WJ.ui.view(root, WJ.ui.endScreen({ game: game.name, variantLabel: WJ.pool.theme(theme).name, results, total: score, isBest, best, shareText: `WikiJeux · ${game.name}\n${results.map((r) => (r.ok ? '🟩' : '🟥')).join('')} ${score} pts\n${location.href.split('#')[0]}#/frise`, onReplay: () => { location.hash = `#/frise?theme=${theme}&go=1&r=${Date.now()}`; } }));
    }
    render();
  }
  WJ.register(game);
  WJ.frise = { keyDates };
})();
