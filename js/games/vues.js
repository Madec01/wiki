/* Plus ou moins de vues : lequel des deux articles est le plus consulté ? */
(() => {
  const { el, shuffle, fmtInt } = WJ.util;
  const MODES = [
    { id: 'trois', name: '3 vies', icon: '❤️', lives: 3, max: 30, desc: 'Trois erreurs permises, jusqu’à 30 duels' },
    { id: 'survie', name: 'Survie', icon: '💀', lives: 1, max: 30, desc: 'Une seule erreur et c’est fini' },
    { id: 'dix', name: '10 duels', icon: '🔟', lives: 99, max: 10, desc: 'Dix duels, le score fait foi' },
  ];
  const PTS = 10;
  const game = {
    id: 'vues', name: 'Plus ou moins de vues', icon: '📈', group: 'comparer',
    desc: 'Deux articles très lus ces jours-ci : lequel a reçu le plus de visites ? Enchaîne les bonnes réponses.',
    start(root, params = {}) {
      const launch = async ({ theme }) => {
        const mode = MODES.find((m) => m.id === theme) || MODES[0];
        WJ.ui.view(root, WJ.ui.loading('Chargement des pages les plus lues…'));
        let entries;
        try {
          entries = (await WJ.pool.popularEntries(WJ.pool.viewsDay(), { strict: true, limit: 200 })).filter((e) => e.views > 0 && !e.disambiguation);
          if (entries.length < 12) throw new Error('Pas assez d’articles populaires disponibles.');
        } catch (e) { WJ.ui.view(root, WJ.ui.errorBox(e, () => launch({ theme }))); return; }
        play(root, shuffle(entries), mode);
      };
      if (params.go) return launch({ theme: params.theme || 'trois' });
      WJ.ui.view(root, WJ.ui.startScreen({ game, themes: MODES, defaultTheme: params.theme || 'trois', rules: ['Le nombre de vues du premier article est affiché, devine si le second en a eu plus ou moins.', `${PTS} pts par bonne réponse.`, `Données : pages vues sur Wikipédia en français le ${WJ.util.fmtDateFr(WJ.pool.viewsDay())}.`], onStart: launch }));
    },
  };

  function play(root, pool, mode) {
    const shell = WJ.ui.shell(root, { title: game.name, icon: game.icon, rounds: mode.max });
    let streak = 0, best = 0, score = 0, lives = mode.lives, n = 0, i = 0;
    const results = [];
    let left = pool[i++];
    function nextRight() {
      while (i < pool.length) {
        const c = pool[i++];
        const ratio = Math.max(c.views, left.views) / Math.max(1, Math.min(c.views, left.views));
        if (ratio >= 1.12) return c;
      }
      return null;
    }
    function card(e, { showViews, actions }) {
      return el('div', { class: 'vs-card' }, [
        e.image ? WJ.ui.image(e.image, '', '') : el('div', { style: { height: '200px', background: 'var(--bg-2)' } }),
        el('div', { class: 'vs-body' }, [
          el('h3', { text: e.title }),
          e.description ? el('p', { class: 'muted', style: { fontSize: '.8rem' }, text: e.description.slice(0, 70) }) : null,
          showViews ? el('div', { class: 'vs-views', text: fmtInt(e.views) }) : el('div', { class: 'vs-views', text: '?' }),
          showViews ? el('div', { class: 'muted', style: { fontSize: '.75rem' }, text: 'vues' }) : null,
          actions ? el('div', { class: 'vs-actions' }, actions) : null,
        ]),
      ]);
    }
    function round() {
      shell.setScore(score);
      shell.setRound(n + 1, mode.max);
      shell.content.innerHTML = '';
      const right = nextRight();
      if (!right || n >= mode.max || lives <= 0) return finish();
      const decide = (more) => {
        const correct = (right.views > left.views) === more;
        n++;
        results.push({ ok: correct, points: correct ? PTS : 0, title: right.title, label: `${right.title} : ${fmtInt(right.views)} vues (vs ${fmtInt(left.views)})` });
        if (correct) { streak++; score += PTS; best = Math.max(best, streak); } else { streak = 0; lives--; }
        shell.content.innerHTML = '';
        shell.content.append(
          el('div', { class: 'streak', html: correct ? '✅ Exact !' : '❌ Raté…' }),
          mode.lives < 50 ? el('div', { class: 'row center' }, [WJ.ui.hearts(lives, mode.lives)]) : null,
          el('div', { class: 'versus' }, [card(left, { showViews: true }), card(right, { showViews: true })]),
        );
        left = right;
        const over = lives <= 0 || n >= mode.max;
        WJ.ui.waitNext(shell.content, over ? 'Voir le résultat' : 'Suivant →').then(over ? finish : round);
      };
      shell.content.append(
        el('div', { class: 'streak' }, ['Série : ', el('b', { text: String(streak) }), mode.lives < 50 ? el('span', { class: 'muted', text: ` · ${lives} vie${lives > 1 ? 's' : ''}` }) : null]),
        el('div', { class: 'versus' }, [
          card(left, { showViews: true }),
          card(right, { showViews: false, actions: [WJ.ui.button('▲ Plus de vues', () => decide(true), 'btn btn-primary'), WJ.ui.button('▼ Moins de vues', () => decide(false), 'btn')] }),
        ]),
      );
    }
    function finish() {
      WJ.store.bumpStat('games', 1); WJ.store.bumpStat('points', score);
      const prev = WJ.store.best(game.id, mode.id)?.score ?? null;
      const isBest = WJ.store.recordScore(game.id, mode.id, score, { streak: best });
      WJ.ui.view(root, WJ.ui.endScreen({
        game: game.name, variantLabel: mode.name, results, total: score, isBest, best: prev,
        shareText: `WikiJeux · ${game.name} · ${mode.name}\n${results.map((r) => (r.ok ? '🟩' : '🟥')).join('')} ${score} pts (meilleure série : ${best})\n${location.href.split('#')[0]}#/vues`,
        onReplay: () => { location.hash = `#/vues?theme=${mode.id}&go=1&r=${Date.now()}`; },
      }));
    }
    round();
  }
  WJ.register(game);
})();
