/* Plus ou moins de vues : lequel des deux articles est le plus consulté ? */
(() => {
  const { el, shuffle, fmtInt } = WJ.util;
  const MAX_DUELS = 20;
  const game = {
    id: 'vues', name: 'Plus ou moins de vues', icon: '📈', group: 'comparer',
    desc: 'Deux articles lus hier : lequel a reçu le plus de visites ? Enchaîne les bonnes réponses.',
    start(root, params = {}) {
      const launch = async () => {
        WJ.ui.view(root, WJ.ui.loading('Chargement des pages les plus lues…'));
        let entries;
        try {
          entries = (await WJ.pool.popularEntries(WJ.pool.viewsDay(), { strict: true, limit: 200 })).filter((e) => e.views > 0 && !e.disambiguation);
          if (entries.length < 12) throw new Error('Pas assez d’articles populaires disponibles.');
        } catch (e) { WJ.ui.view(root, WJ.ui.errorBox(e, launch)); return; }
        play(root, shuffle(entries));
      };
      if (params.go) return launch();
      WJ.ui.view(root, WJ.ui.startScreen({ game, themes: null, rules: ['Le nombre de vues du premier article est affiché, devine si le second en a eu plus ou moins.', '10 pts par bonne réponse, la partie s’arrête à la première erreur ou après 20 duels.', `Données : pages vues sur Wikipédia en français le ${WJ.util.fmtDateFr(WJ.pool.viewsDay())}.`], onStart: launch }));
    },
  };

  function play(root, pool) {
    const shell = WJ.ui.shell(root, { title: game.name, icon: game.icon, rounds: 0 });
    let streak = 0, i = 0;
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
        e.image ? WJ.ui.image(e.image, '', '') : el('div', { style: { height: '160px', background: 'var(--bg-2)' } }),
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
      shell.setScore(streak * 10);
      shell.setRound(streak + 1, MAX_DUELS);
      shell.content.innerHTML = '';
      const right = nextRight();
      if (!right || streak >= MAX_DUELS) return finish(true);
      const decide = (more) => {
        const correct = (right.views > left.views) === more;
        results.push({ ok: correct, points: correct ? 10 : 0, title: right.title, label: `${right.title} : ${fmtInt(right.views)} vues (vs ${fmtInt(left.views)})` });
        shell.content.innerHTML = '';
        shell.content.append(
          el('div', { class: 'streak', html: correct ? '✅ Exact !' : '❌ Raté…' }),
          el('div', { class: 'versus' }, [card(left, { showViews: true }), card(right, { showViews: true })]),
        );
        if (correct) {
          streak++; left = right;
          WJ.ui.waitNext(shell.content).then(round);
        } else {
          WJ.ui.waitNext(shell.content, 'Voir le résultat').then(() => finish(false));
        }
      };
      shell.content.append(
        el('div', { class: 'streak' }, ['Série : ', el('b', { text: String(streak) })]),
        el('div', { class: 'versus' }, [
          card(left, { showViews: true }),
          card(right, { showViews: false, actions: [WJ.ui.button('▲ Plus de vues', () => decide(true), 'btn btn-primary'), WJ.ui.button('▼ Moins de vues', () => decide(false), 'btn')] }),
        ]),
      );
    }
    function finish() {
      const score = streak * 10;
      WJ.store.bumpStat('games', 1); WJ.store.bumpStat('points', score);
      const best = WJ.store.best(game.id, 'default')?.score ?? null;
      const isBest = WJ.store.recordScore(game.id, 'default', score, { streak });
      WJ.ui.view(root, WJ.ui.endScreen({
        game: game.name, results, total: score, isBest, best,
        shareText: `WikiJeux · ${game.name}\nSérie de ${streak} 📈 ${score} pts\n${location.href.split('#')[0]}#/vues`,
        onReplay: () => { location.hash = '#/vues?go=1&r=' + Date.now(); },
      }));
    }
    round();
  }
  WJ.register(game);
})();
