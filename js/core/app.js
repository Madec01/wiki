/* Routeur et page d'accueil. */
WJ.app = (() => {
  const { el, $ } = WJ.util;
  const GROUPS = [
    { id: 'deviner', name: 'Deviner', desc: 'Retrouve l’article à partir d’un indice.' },
    { id: 'comparer', name: 'Comparer et classer', desc: 'Des chiffres, des dates, des intuitions.' },
    { id: 'explorer', name: 'Explorer', desc: 'Voyage dans les liens et sur la carte.' },
  ];
  let current = null; // {stop}

  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    const [path, qs] = h.split('?');
    const params = Object.fromEntries(new URLSearchParams(qs || ''));
    for (const k of Object.keys(params)) if (params[k] === '1') params[k] = true;
    return { path: decodeURIComponent(path || ''), params };
  }

  function gameCard(g) {
    const best = WJ.store.history().filter((h) => h.game === g.id).sort((a, b) => b.score - a.score)[0];
    return el('a', { class: 'game-card', href: `#/${g.id}` }, [
      el('span', { class: 'game-icon', text: g.icon }),
      el('span', { class: 'game-name', text: g.name }),
      el('span', { class: 'game-desc', text: g.desc }),
      best ? el('span', { class: 'game-best', text: `Record ${WJ.util.fmtInt(best.score)}` }) : null,
    ]);
  }

  function hub(root) {
    const stats = WJ.store.stats();
    const dailyDone = WJ.store.dailyResult('image', WJ.util.dayKey(0));
    WJ.ui.view(root,
      el('section', { class: 'hero' }, [
        el('h1', {}, ['Wiki', el('span', { class: 'accent', text: 'Jeux' })]),
        el('p', { class: 'lead', text: 'Treize façons de jouer avec Wikipédia en français. Rien à installer, tout vient des articles en direct.' }),
        el('div', { class: 'row' }, [
          el('a', { class: 'btn btn-primary btn-lg', href: '#/image?daily=1&go=1' }, [dailyDone ? `📅 Défi du jour : ${WJ.util.fmtInt(dailyDone.total)} pts ✓` : '📅 Défi du jour']),
          el('a', { class: 'btn btn-lg', href: '#/image' }, ['🖼️ Devine l’image']),
        ]),
      ]),
      ...GROUPS.map((grp) => {
        const games = WJ.games.filter((g) => g.group === grp.id);
        if (!games.length) return null;
        return el('section', { class: 'group' }, [
          el('h2', { text: grp.name }), el('p', { class: 'muted', text: grp.desc }),
          el('div', { class: 'grid' }, games.map(gameCard)),
        ]);
      }),
      el('section', { class: 'about card' }, [
        el('h2', { text: 'À propos' }),
        el('p', { html: 'Les textes et images viennent de <a href="https://fr.wikipedia.org" target="_blank" rel="noopener">Wikipédia</a>, <a href="https://commons.wikimedia.org" target="_blank" rel="noopener">Wikimedia Commons</a> et <a href="https://www.wikidata.org" target="_blank" rel="noopener">Wikidata</a>, sous licence libre (CC BY-SA). Les scores restent dans ton navigateur.' }),
        stats.games ? el('p', { class: 'muted', text: `${WJ.util.fmtInt(stats.games)} partie${stats.games > 1 ? 's' : ''} jouée${stats.games > 1 ? 's' : ''}, ${WJ.util.fmtInt(stats.points || 0)} points cumulés.` }) : null,
        el('div', { class: 'row' }, [
          WJ.ui.button('Vider le cache des articles', () => { WJ.store.clearCache(); WJ.ui.toast('Cache vidé.', 'ok'); }, 'btn btn-ghost btn-sm'),
          WJ.ui.button('Effacer mes scores', () => { if (confirm('Effacer tous les scores et records ?')) { ['history', 'stats'].forEach(WJ.store.remove); Object.keys(localStorage).filter((k) => /^wj\.(best|daily)\./.test(k)).forEach((k) => localStorage.removeItem(k)); hub(root); WJ.ui.toast('Scores effacés.', 'ok'); } }, 'btn btn-ghost btn-sm'),
        ]),
      ]),
    );
  }

  function route() {
    const root = $('#app');
    if (current && current.stop) { try { current.stop(); } catch (e) { /* ignore */ } }
    current = null;
    const { path, params } = parseHash();
    const game = WJ.game(path);
    document.title = game ? `${game.name} · WikiJeux` : 'WikiJeux';
    if (!game) { hub(root); return; }
    const res = game.start(root, params);
    current = { stop: typeof res === 'function' ? res : (res && res.stop) || null };
  }

  function initTheme() {
    const saved = WJ.store.settings().theme;
    if (saved) document.documentElement.dataset.theme = saved;
    $('#theme-toggle').addEventListener('click', () => {
      const dark = (document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
      const next = dark ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      WJ.store.setSetting('theme', next);
    });
  }

  function init() {
    initTheme();
    window.addEventListener('hashchange', route);
    route();
  }
  document.addEventListener('DOMContentLoaded', init);
  return { route, hub, parseHash };
})();
