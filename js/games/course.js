/* Course de liens : rejoindre un article cible en cliquant uniquement sur les liens internes. */
(() => {
  const { el } = WJ.util;
  const HIDE = '.navbox, .bandeau-container, .bandeau, .homonymie, .mw-editsection, .reference, .references, .mw-references-wrap, .noprint, .metadata, .toc, #toc, .hatnote, .mw-kartographer-container, .mw-authority-control, .autres-projets, .liens-externes, .mw-empty-elt, style, script, link, meta, .bandeau-niveau-detail, .bandeau-section, .portail, .mw-indicators, .infobox .entete + tr .image';
  const NS = /^(Fichier|File|Catégorie|Category|Aide|Help|Modèle|Template|Spécial|Special|Portail|Portal|Wikipédia|Wikipedia|Discussion|Talk|Utilisateur|User|Projet|Référence|Module|MediaWiki|Sujet|Image|Média|Media)\s*:/i;

  const game = {
    id: 'course', name: 'Course de liens', icon: '🏁', group: 'explorer',
    desc: 'Pars d’un article et rejoins la cible en cliquant seulement sur les liens de Wikipédia. Le moins de clics possible.',
    start(root, params = {}) {
      let timer = null;
      const launch = async ({ theme }) => {
        WJ.ui.view(root, WJ.ui.loading('Choix du départ et de la cible…'));
        try {
          const [from, to] = await WJ.pool.draw(theme, { count: 2, need: {} });
          if (!from || !to) throw new Error('Impossible de tirer deux articles.');
          timer = await race(root, from, to, theme);
        } catch (e) { WJ.ui.view(root, WJ.ui.errorBox(e, () => launch({ theme }))); }
      };
      if (params.go) launch({ theme: params.theme || 'populaire' });
      else WJ.ui.view(root, WJ.ui.startScreen({ game, themes: WJ.pool.THEMES, defaultTheme: params.theme || 'populaire', rules: ['Chaque lien cliqué compte pour un clic, le chrono tourne.', 'Score : 150 pts moins 15 par clic et 1 par tranche de 10 secondes (minimum 10).', 'Les liens vers les fichiers, catégories et sites externes sont désactivés.'], onStart: launch }));
      return () => { if (timer && timer.stop) timer.stop(); };
    },
  };

  function sanitize(html) {
    const doc = new DOMParser().parseFromString(`<div class="mw-parser-output">${html}</div>`, 'text/html');
    doc.querySelectorAll(HIDE).forEach((n) => n.remove());
    doc.querySelectorAll('[style*="display:none"], [style*="display: none"]').forEach((n) => n.remove());
    doc.querySelectorAll('img').forEach((img) => {
      for (const attr of ['src', 'srcset']) { const v = img.getAttribute(attr); if (v && v.startsWith('//')) img.setAttribute(attr, v.replace(/(^|, )\/\//g, '$1https://')); }
      img.setAttribute('loading', 'lazy'); img.removeAttribute('usemap');
    });
    doc.querySelectorAll('a').forEach((a) => {
      const href = a.getAttribute('href') || '';
      const m = /^\/wiki\/([^#?]+)/.exec(href);
      if (m && !a.classList.contains('new') && !a.classList.contains('image') && !a.classList.contains('mw-file-description')) {
        const title = decodeURIComponent(m[1]).replace(/_/g, ' ');
        if (NS.test(title)) a.classList.add('dead');
        else { a.dataset.title = title; a.setAttribute('href', '#'); }
      } else a.classList.add('dead');
      a.removeAttribute('target');
    });
    doc.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    doc.querySelectorAll('[onclick], [onload]').forEach((n) => { n.removeAttribute('onclick'); n.removeAttribute('onload'); });
    return doc.body.firstChild;
  }

  async function race(root, from, to, theme) {
    const shell = WJ.ui.shell(root, { title: game.name, icon: game.icon, rounds: 0 });
    let clicks = 0, started = Date.now(), finished = false, loading = false;
    const path = [from.title];
    const count = el('span', { class: 'count', text: '0 clic' });
    const clock = el('span', { class: 'count', text: '0:00' });
    const pathEl = el('div', { class: 'path' });
    const article = el('div', { class: 'wiki-content' });
    const bar = el('div', { class: 'race-bar' }, [
      el('span', {}, ['🎯 Cible : ', el('span', { class: 'target', text: to.title })]),
      el('span', {}, [count, ' · ⏱ ', clock]),
      WJ.ui.button('Abandonner', () => finish(false), 'btn btn-ghost btn-sm'),
    ]);
    const tick = setInterval(() => { const s = Math.floor((Date.now() - started) / 1000); clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 500);
    const stop = () => clearInterval(tick);
    shell.content.append(bar, to.description ? el('p', { class: 'muted', text: `La cible : ${to.description}.` }) : null, pathEl, article);
    const renderPath = () => { pathEl.innerHTML = ''; path.forEach((p) => pathEl.append(el('span', { text: p }))); };

    async function show(title) {
      loading = true;
      article.innerHTML = ''; article.append(WJ.ui.loading(`Ouverture de « ${title} »…`));
      try {
        const page = await WJ.api.parse(title);
        if (finished) return;
        article.innerHTML = '';
        article.append(el('h1', { text: page.title }), sanitize(page.html));
        window.scrollTo({ top: 0 });
        return page.title;
      } catch (e) {
        article.innerHTML = ''; article.append(WJ.ui.errorBox(e, () => show(title)));
        return null;
      } finally { loading = false; }
    }
    article.addEventListener('click', async (e) => {
      const a = e.target.closest('a');
      if (!a) return;
      e.preventDefault();
      if (finished || loading || !a.dataset.title) return;
      clicks++; count.textContent = `${clicks} clic${clicks > 1 ? 's' : ''}`;
      const resolved = await show(a.dataset.title);
      if (resolved) { path.push(resolved); renderPath(); }
      if (resolved && (resolved === to.title || WJ.answer.normalize(resolved) === WJ.answer.normalize(to.title))) finish(true);
    });
    renderPath();
    await show(from.title);

    function finish(won) {
      if (finished) return; finished = true; stop();
      const seconds = Math.round((Date.now() - started) / 1000);
      const score = won ? Math.max(10, 150 - 15 * clicks - Math.floor(seconds / 10)) : 0;
      WJ.store.bumpStat('games', 1); WJ.store.bumpStat('points', score);
      const best = WJ.store.best(game.id, 'default')?.score ?? null;
      const isBest = won ? WJ.store.recordScore(game.id, 'default', score, { clicks, seconds }) : false;
      WJ.ui.view(root, WJ.ui.endScreen({
        game: game.name, results: [{ ok: won, points: score, title: to.title, label: won ? `${from.title} → ${to.title} en ${clicks} clic${clicks > 1 ? 's' : ''} et ${seconds} s` : `Abandon : ${from.title} → ${to.title}`, emoji: won ? '🏁' : '🏳️' }],
        total: score, isBest, best,
        shareText: `WikiJeux · ${game.name}\n${from.title} → ${to.title}\n${won ? `🏁 ${clicks} clics, ${seconds} s, ${score} pts` : '🏳️ abandon'}\nChemin : ${path.join(' → ')}\n${location.href.split('#')[0]}#/course`,
        onReplay: () => { location.hash = `#/course?theme=${theme}&go=1&r=${Date.now()}`; },
      }));
    }
    return { stop };
  }
  WJ.register(game);
  WJ.course = { sanitize };
})();
