/* Qui est le plus vieux : deux personnalités, clique sur celle née en premier. */
(() => {
  const { el, shuffle, fmtYear, yearFromWikidata } = WJ.util;
  const LIVES = 3, MAX = 20, PTS = 10;

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

  async function loadPeople(count = 40) {
    const entries = (await WJ.pool.themedEntries(WJ.pool.theme('personnalites'), { limit: 50, maxOffset: 400 })).filter((e) => WJ.pool.fits(e, { image: true, qid: true }));
    const dates = await birthDates(entries.map((e) => e.qid));
    return shuffle(entries.filter((e) => dates[e.qid]).map((e) => ({ ...e, ...dates[e.qid] }))).slice(0, count);
  }

  const game = {
    id: 'vieux', name: 'Qui est le plus vieux ?', icon: '🎂', group: 'comparer',
    desc: 'Deux personnalités : laquelle est née en premier ? Trois erreurs et c’est fini.',
    start(root, params = {}) {
      const launch = async () => {
        WJ.ui.view(root, WJ.ui.loading('Recherche de personnalités et de leurs dates de naissance…'));
        try {
          const people = await loadPeople();
          if (people.length < 6) throw new Error('Pas assez de dates trouvées, réessaie.');
          play(root, people);
        } catch (e) { WJ.ui.view(root, WJ.ui.errorBox(e, launch)); }
      };
      if (params.go) return launch();
      WJ.ui.view(root, WJ.ui.startScreen({ game, themes: null, rules: [`${PTS} pts par bonne réponse, ${LIVES} vies, ${MAX} duels maximum.`, 'Les dates viennent de Wikidata.'], onStart: launch }));
    },
  };

  function play(root, people) {
    const shell = WJ.ui.shell(root, { title: game.name, icon: game.icon, rounds: MAX });
    let lives = LIVES, score = 0, n = 0, i = 0;
    const results = [];
    const lifeLine = el('div', { class: 'row center' });
    function personCard(p, onPick) {
      const c = el('div', { class: 'vs-card', role: 'button', tabindex: 0 }, [
        WJ.ui.image(p.image, p.title, ''),
        el('div', { class: 'vs-body' }, [el('h3', { text: p.title }), el('p', { class: 'muted', style: { fontSize: '.8rem' }, text: (p.description || '').slice(0, 80) }), el('div', { class: 'vs-views year', text: '?' })]),
      ]);
      c.addEventListener('click', () => onPick(p, c));
      c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(p, c); } });
      return c;
    }
    function duel() {
      if (lives <= 0 || n >= MAX || i + 1 >= people.length) return finish();
      shell.setRound(n + 1, MAX); shell.setScore(score);
      shell.content.innerHTML = '';
      let a = people[i++], b = people[i++];
      if (a.born === b.born) { b = people[i++] || b; }
      if (!b || a === b) return finish();
      let decided = false;
      const cards = {};
      const onPick = (p, cardEl) => {
        if (decided) return; decided = true; n++;
        const older = a.born <= b.born ? a : b;
        const ok = p === older;
        if (ok) score += PTS; else lives--;
        results.push({ ok, points: ok ? PTS : 0, title: p.title, label: `${a.title} (${fmtYear(a.born)}) vs ${b.title} (${fmtYear(b.born)})` });
        for (const [key, c] of Object.entries(cards)) {
          const person = key === 'a' ? a : b;
          c.querySelector('.year').textContent = `${fmtYear(person.born)}${person.died ? ' – ' + fmtYear(person.died) : ''}`;
          c.classList.add(person === older ? 'right' : 'wrong');
        }
        lifeLine.innerHTML = ''; lifeLine.append(WJ.ui.hearts(lives, LIVES));
        shell.setScore(score);
        WJ.ui.toast(ok ? `Oui ! +${PTS}` : `Non… ${older.title} est né${/femme|actrice|chanteuse|reine|princesse|écrivaine/i.test(older.description || '') ? 'e' : ''} en ${fmtYear(older.born)}.`, ok ? 'ok' : 'ko', 2200);
        WJ.ui.waitNext(shell.content, lives > 0 && n < MAX ? 'Duel suivant →' : 'Résultat').then(duel);
      };
      cards.a = personCard(a, onPick); cards.b = personCard(b, onPick);
      lifeLine.innerHTML = ''; lifeLine.append(WJ.ui.hearts(lives, LIVES));
      shell.content.append(el('p', { class: 'muted', style: { textAlign: 'center' }, text: 'Qui est né en premier ?' }), lifeLine, el('div', { class: 'duel' }, [cards.a, cards.b]));
    }
    function finish() {
      WJ.store.bumpStat('games', 1); WJ.store.bumpStat('points', score);
      const best = WJ.store.best(game.id, 'default')?.score ?? null;
      const isBest = WJ.store.recordScore(game.id, 'default', score);
      WJ.ui.view(root, WJ.ui.endScreen({ game: game.name, results, total: score, isBest, best, shareText: `WikiJeux · ${game.name}\n${results.map((r) => (r.ok ? '🟩' : '🟥')).join('')} ${score} pts\n${location.href.split('#')[0]}#/vieux`, onReplay: () => { location.hash = '#/vieux?go=1&r=' + Date.now(); } }));
    }
    duel();
  }
  WJ.register(game);
  WJ.vieux = { birthDates };
})();
