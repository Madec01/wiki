/* Qui est le plus vieux : deux personnalités de la même époque, clique sur celle née en premier. */
(() => {
  const { el, shuffle, fmtYear, yearFromWikidata, pick } = WJ.util;
  const LIVES = 3, MAX = 20;
  const LEVEL = { facile: { gap: 80, pts: 10, photos: true }, normal: { gap: 30, pts: 10, photos: true }, difficile: { gap: 12, pts: 15, photos: false } };

  /** Dates de naissance/mort pour une liste d'identifiants Wikidata. */
  async function birthDates(qids) {
    if (!qids.length) return {};
    const rows = await WJ.api.sparql(`SELECT ?item (MIN(?b) AS ?dob) (MIN(?d) AS ?dod) WHERE { VALUES ?item { ${qids.map((q) => 'wd:' + q).join(' ')} } ?item wdt:P569 ?b . OPTIONAL { ?item wdt:P570 ?d } } GROUP BY ?item`);
    const out = {};
    for (const r of rows) {
      const y = yearFromWikidata(r.dob);
      if (y !== null) out[WJ.api.qidFromUri(r.item)] = { born: y, died: yearFromWikidata(r.dod), dob: r.dob };
    }
    return out;
  }

  async function loadPeople(difficulty) {
    const diff = WJ.pool.difficulty(difficulty);
    const th = WJ.pool.theme('personnalites');
    let entries = [];
    for (let i = 0; i < 3; i++) entries = entries.concat(await WJ.pool.themedEntries(th, { limit: 50, maxOffset: Math.max(60, diff.offset) }));
    const seen = new Set();
    entries = entries.filter((e) => WJ.pool.fits(e, { image: true, qid: true }) && !seen.has(e.qid) && seen.add(e.qid));
    const dates = await birthDates(entries.map((e) => e.qid));
    return entries.filter((e) => dates[e.qid]).map((e) => ({ ...e, ...dates[e.qid] }));
  }

  /** Paires de personnes nées à moins de `gap` ans d'écart (mais pas la même année). */
  function makePairs(people, gap) {
    const sorted = people.slice().sort((a, b) => a.born - b.born);
    const used = new Set();
    const pairs = [];
    for (const order of shuffle(sorted.map((_, i) => i))) {
      if (used.has(order)) continue;
      const a = sorted[order];
      const partners = [];
      for (let j = order + 1; j < sorted.length && sorted[j].born - a.born <= gap; j++) if (!used.has(j) && sorted[j].born !== a.born) partners.push(j);
      for (let j = order - 1; j >= 0 && a.born - sorted[j].born <= gap; j--) if (!used.has(j) && sorted[j].born !== a.born) partners.push(j);
      if (!partners.length) continue;
      const j = pick(partners);
      used.add(order); used.add(j);
      pairs.push(shuffle([a, sorted[j]]));
    }
    return shuffle(pairs);
  }

  const game = {
    id: 'vieux', name: 'Qui est le plus vieux ?', icon: '🎂', group: 'comparer',
    desc: 'Deux personnalités de la même époque : laquelle est née en premier ? Trois erreurs et c’est fini.',
    start(root, params = {}) {
      const launch = async ({ difficulty = 'normal' }) => {
        const lvl = LEVEL[difficulty] || LEVEL.normal;
        WJ.ui.view(root, WJ.ui.loading('Recherche de personnalités et de leurs dates de naissance…'));
        try {
          const people = await loadPeople(difficulty);
          let pairs = makePairs(people, lvl.gap);
          if (pairs.length < 6) pairs = makePairs(people, lvl.gap * 3);
          if (pairs.length < 3) throw new Error('Pas assez de dates trouvées, réessaie.');
          play(root, pairs, difficulty, lvl);
        } catch (e) { WJ.ui.view(root, WJ.ui.errorBox(e, () => launch({ difficulty }))); }
      };
      if (params.go) return launch({ difficulty: params.difficulty || WJ.store.settings().difficulty || 'normal' });
      WJ.ui.view(root, WJ.ui.startScreen({ game, themes: null, difficulty: true, rules: [`${LIVES} vies, ${MAX} duels maximum.`, 'Facile : jusqu’à 80 ans d’écart. Normal : moins de 30 ans. Difficile : moins de 12 ans, sans photo, 15 pts par duel.', 'Les dates viennent de Wikidata.'], onStart: launch }));
    },
  };

  function play(root, pairs, difficulty, lvl) {
    const shell = WJ.ui.shell(root, { title: game.name, icon: game.icon, rounds: Math.min(MAX, pairs.length) });
    let lives = LIVES, score = 0, n = 0;
    const results = [];
    const lifeLine = el('div', { class: 'row center' });
    const total = Math.min(MAX, pairs.length);
    function personCard(p, onPick) {
      const c = el('div', { class: 'vs-card', role: 'button', tabindex: 0 }, [
        lvl.photos ? WJ.ui.image(p.image, p.title, '') : el('div', { style: { height: '60px', background: 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' } }, ['👤']),
        el('div', { class: 'vs-body' }, [el('h3', { text: p.title }), el('p', { class: 'muted', style: { fontSize: '.8rem' }, text: (p.description || '').replace(/\s*\(\d{3,4}[^)]*\)/g, '').slice(0, 80) }), el('div', { class: 'vs-views year', text: '?' })]),
      ]);
      c.addEventListener('click', () => onPick(p, c));
      c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(p, c); } });
      return c;
    }
    function duel() {
      if (lives <= 0 || n >= total) return finish();
      shell.setRound(n + 1, total); shell.setScore(score);
      shell.content.innerHTML = '';
      const [a, b] = pairs[n];
      let decided = false;
      const cards = {};
      const onPick = (p) => {
        if (decided) return; decided = true; n++;
        const older = a.born <= b.born ? a : b;
        const ok = p === older;
        if (ok) score += lvl.pts; else lives--;
        results.push({ ok, points: ok ? lvl.pts : 0, title: p.title, label: `${a.title} (${fmtYear(a.born)}) vs ${b.title} (${fmtYear(b.born)})` });
        for (const [key, c] of Object.entries(cards)) {
          const person = key === 'a' ? a : b;
          c.querySelector('.year').textContent = `${fmtYear(person.born)}${person.died ? ' – ' + fmtYear(person.died) : ''}`;
          c.classList.add(person === older ? 'right' : 'wrong');
        }
        lifeLine.innerHTML = ''; lifeLine.append(WJ.ui.hearts(lives, LIVES));
        shell.setScore(score);
        WJ.ui.toast(ok ? `Oui ! +${lvl.pts}` : `Non… ${older.title} : ${fmtYear(older.born)}, ${Math.abs(a.born - b.born)} an${Math.abs(a.born - b.born) > 1 ? 's' : ''} d’écart.`, ok ? 'ok' : 'ko', 2400);
        WJ.ui.waitNext(shell.content, lives > 0 && n < total ? 'Duel suivant →' : 'Résultat').then(duel);
      };
      cards.a = personCard(a, onPick); cards.b = personCard(b, onPick);
      lifeLine.innerHTML = ''; lifeLine.append(WJ.ui.hearts(lives, LIVES));
      shell.content.append(el('p', { class: 'muted', style: { textAlign: 'center' }, text: 'Qui est né en premier ?' }), lifeLine, el('div', { class: 'duel' }, [cards.a, cards.b]));
    }
    function finish() {
      WJ.store.bumpStat('games', 1); WJ.store.bumpStat('points', score);
      const variant = difficulty === 'normal' ? 'default' : difficulty;
      const best = WJ.store.best(game.id, variant)?.score ?? null;
      const isBest = WJ.store.recordScore(game.id, variant, score);
      WJ.ui.view(root, WJ.ui.endScreen({ game: game.name, variantLabel: difficulty !== 'normal' ? difficulty : '', results, total: score, isBest, best, shareText: `WikiJeux · ${game.name}\n${results.map((r) => (r.ok ? '🟩' : '🟥')).join('')} ${score} pts\n${location.href.split('#')[0]}#/vieux`, onReplay: () => { location.hash = `#/vieux?go=1&difficulty=${difficulty}&r=${Date.now()}`; } }));
    }
    duel();
  }
  WJ.register(game);
  WJ.vieux = { birthDates, makePairs };
})();
