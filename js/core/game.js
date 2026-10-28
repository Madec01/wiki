/* Registre des jeux et moteur de manches. */
WJ.games = [];
WJ.register = (game) => { WJ.games.push(game); return game; };
WJ.game = (id) => WJ.games.find((g) => g.id === id);

/**
 * Déroule une partie en N manches.
 * playRound(ctx) doit renvoyer {ok, points, title, label?, emoji?} quand la manche est finie (après le clic « Suivant »).
 * ctx = {index, total, score, content, shell, entry}
 */
WJ.runRounds = async function runRounds({ game, root, variant = 'default', variantLabel, entries, playRound, daily = false, shareLine, difficulty = 'normal' }) {
  let stopped = false;
  const total = entries.length;
  const shell = WJ.ui.shell(root, { title: game.name, icon: game.icon, rounds: total, onQuit: () => { stopped = true; location.hash = '#/'; } });
  const results = [];
  let score = 0;
  for (let i = 0; i < total && !stopped; i++) {
    shell.setRound(i + 1, total);
    WJ.debugEntry = entries[i];
    shell.setScore(score);
    shell.content.innerHTML = '';
    let res;
    try {
      res = await playRound({ index: i, total, score, content: shell.content, shell, entry: entries[i], nextEntry: entries[i + 1], results, difficulty });
    } catch (e) {
      if (stopped) return;
      console.error(e);
      shell.content.innerHTML = '';
      shell.content.append(WJ.ui.errorBox(e));
      await WJ.ui.waitNext(shell.content, 'Manche suivante →');
      res = { ok: false, points: 0, title: entries[i]?.title || '?', emoji: '⬛' };
    }
    if (stopped) return;
    score += res.points || 0;
    results.push({ title: entries[i]?.title, ...res });
    shell.setScore(score);
  }
  if (stopped) return;
  WJ.store.bumpStat('games', 1);
  WJ.store.bumpStat('points', score);
  let isBest = false, best = null;
  if (daily) {
    WJ.store.saveDaily(game.id, WJ.util.dayKey(0), { total: score, results: results.map((r) => ({ ok: r.ok, points: r.points, title: r.title })) });
  } else {
    best = WJ.store.best(game.id, variant)?.score ?? null;
    isBest = WJ.store.recordScore(game.id, variant, score, { rounds: total });
  }
  const emojiLine = results.map((r) => r.emoji || (r.ok ? '🟩' : '🟥')).join('');
  const share = `WikiJeux · ${game.name}${daily ? ' · Défi du ' + new Date().toLocaleDateString('fr-FR') : variantLabel ? ' · ' + variantLabel : ''}\n${emojiLine} ${WJ.util.fmtInt(score)} pts${shareLine ? '\n' + shareLine(results) : ''}\n${location.href.split('#')[0]}#/${game.id}`;
  WJ.ui.view(root, WJ.ui.endScreen({
    game: game.name, variantLabel, results, total: score, isBest, best, daily, shareText: share,
    onReplay: () => { location.hash = `#/${game.id}?theme=${encodeURIComponent(variant.split(':')[0])}&difficulty=${difficulty}&go=1`; },
  }));
  return { score, results };
};

/**
 * Jeu « standard » : écran d'accueil avec thème, tirage d'articles, manches, écran de fin.
 * def = {id, name, icon, desc, rules, themes (true = tous | liste d'ids | false), need, rounds, dailyRounds, playRound, daily}
 */
WJ.standardGame = function standardGame(def) {
  const game = {
    id: def.id, name: def.name, icon: def.icon, desc: def.desc, group: def.group || 'deviner', tags: def.tags || [],
    start(root, params = {}) {
      const themes = def.themes === false ? null : (Array.isArray(def.themes) ? WJ.pool.THEMES.filter((t) => def.themes.includes(t.id)) : WJ.pool.THEMES.filter((t) => !def.need?.coords || t.geo || t.id === 'populaire'));
      const defaultTheme = params.theme && themes?.some((t) => t.id === params.theme) ? params.theme : (themes ? themes[0].id : 'default');
      const launch = async ({ theme, daily, difficulty = 'normal' }) => {
        const rounds = daily ? (def.dailyRounds || 5) : (def.rounds || 10);
        if (daily) difficulty = 'normal';
        WJ.ui.view(root, WJ.ui.loading());
        let entries;
        try {
          entries = daily ? await WJ.pool.drawDaily(def.id, { count: rounds, need: def.need }) : await WJ.pool.draw(theme, { count: rounds, need: def.need, difficulty });
          if (def.prepare) entries = await def.prepare(entries, { theme, daily });
        } catch (e) {
          console.error(e);
          WJ.ui.view(root, WJ.ui.errorBox(e, () => launch({ theme, daily })));
          return;
        }
        const th = WJ.pool.theme(theme);
        const variant = (themes ? theme : 'default') + (difficulty !== 'normal' ? ':' + difficulty : '');
        const label = (themes ? th.name : '') + (difficulty !== 'normal' ? ` (${difficulty})` : '');
        await WJ.runRounds({ game, root, variant, variantLabel: label, entries, playRound: def.playRound, daily, shareLine: def.shareLine, difficulty });
      };
      if (params.go) return launch({ theme: defaultTheme, daily: !!params.daily, difficulty: params.difficulty || WJ.store.settings().difficulty || 'normal' });
      WJ.ui.view(root, WJ.ui.startScreen({ game, themes, defaultTheme, rules: def.rules, daily: !!def.daily, difficulty: def.difficulty !== false, onStart: launch, extra: def.extra ? def.extra() : null }));
    },
  };
  return WJ.register(game);
};
