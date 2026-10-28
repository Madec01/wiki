/* Frise chronologique : place chaque carte au bon endroit dans la frise. */
(() => {
  const { el, shuffle, fmtYear, yearFromWikidata } = WJ.util;
  const THEMES = ['populaire', 'personnalites', 'cinema', 'monuments', 'jeux', 'peinture'];
  const MODES = [
    { id: 'classique', name: 'Classique', icon: '🕰️', cards: 10, lives: 3, desc: '10 cartes, 3 erreurs permises' },
    { id: 'marathon', name: 'Marathon', icon: '🏃', cards: 20, lives: 5, desc: '20 cartes, 5 erreurs permises' },
    { id: 'sansfilet', name: 'Sans filet', icon: '🪢', cards: 10, lives: 1, desc: '10 cartes, une seule erreur' },
    { id: 'classement', name: 'Classement', icon: '🧩', cards: 8, lives: 0, order: true, desc: '8 cartes à ranger de la plus ancienne à la plus récente ; à chaque validation on te dit seulement combien sont justes' },
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
      WJ.ui.view(root, WJ.ui.startScreen({ game, themes, defaultTheme: params.theme || 'populaire', modes: MODES, defaultMode: params.mode || 'classique', difficulty: true, rules: [`${PTS} pts par carte bien placée, +20 si tout est juste.`, 'Une carte mal placée est déplacée au bon endroit et la frise continue.', 'Mode Classement : range toutes les cartes en les faisant glisser, puis valide ; on te dit seulement combien sont bien placées. 100 pts si c’est bon du premier coup, −10 par essai supplémentaire.', 'Les dates viennent de Wikidata : naissance, sortie, construction ou date de l’événement.'], onStart: launch }));
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
  /** Mode Classement : toutes les cartes sont visibles, on les range en les faisant glisser, puis on valide. Seuls les nombres de justes et de fausses sont donnés. */
  function playOrder(root, cards, theme, mode, difficulty) {
    const shell = WJ.ui.shell(root, { title: game.name, icon: game.icon, rounds: 0 });
    let order = cards.slice();
    let attempts = 0, finished = false, selected = null;
    const history = [];
    const list = el('div', { class: 'order-list' });
    const attemptsEl = el('div', { class: 'attempts' });
    const result = el('div');
    const validate = WJ.ui.button('Valider l’ordre', () => check(), 'btn btn-primary btn-lg');
    const giveUp = WJ.ui.button('Abandonner', () => finish(false), 'btn btn-ghost');
    const actions = el('div', { class: 'row center' }, [validate, giveUp]);
    const pts = () => Math.max(10, 100 - 10 * (attempts - 1));
    shell.content.append(el('p', { class: 'muted', style: { textAlign: 'center' }, text: 'Range les cartes de la plus ancienne (1) à la plus récente : fais-les glisser, ou touche une carte puis sa destination. Valide autant de fois que nécessaire : on te dit seulement combien sont bien placées.' }), list, attemptsEl, actions, result);

    const cardById = new Map();
    function cardEl(c) {
      const node = el('div', { class: 'tl-card draggable', dataset: { qid: c.qid } }, [
        el('span', { class: 'pos' }), WJ.ui.image(c.image, '', ''), el('div', { text: c.title, style: { fontWeight: 600 } }),
        el('div', { class: 'muted', style: { fontSize: '.68rem' }, text: KIND_LABEL[c.kind] || '' }), el('div', { class: 'year', text: '?' }),
      ]);
      node.querySelector('img').draggable = false;
      attachDrag(node, c);
      return node;
    }
    function render() {
      list.innerHTML = '';
      order.forEach((c) => { const n = cardById.get(c.qid) || cardEl(c); cardById.set(c.qid, n); n.classList.toggle('selected', selected === c); list.append(n); });
      numbering();
    }
    function numbering() { [...list.children].filter((n) => !n.classList.contains('dragging')).forEach((n, i) => { const p = n.querySelector('.pos'); if (p) p.textContent = String(i + 1); }); }
    function syncFromDom() { order = [...list.children].filter((n) => n.dataset.qid).map((n) => cards.find((c) => c.qid === n.dataset.qid)).filter(Boolean); }
    function moveTo(card, index) {
      const from = order.indexOf(card);
      if (from < 0) return;
      order.splice(from, 1); order.splice(index, 0, card);
      render();
    }

    /** Glisser-déposer au pointeur (souris et tactile) + sélection par touches successives.
     *  La carte saisie ne bouge jamais dans le DOM pendant le glissé (sinon le navigateur relâche la capture du pointeur) :
     *  un emplacement vide se déplace à sa place, et la carte y est remise au relâchement. */
    function attachDrag(node, card) {
      let startX = 0, startY = 0, dragging = false, ghost = null, slot = null, pid = null;
      node.addEventListener('pointerdown', (e) => {
        if (finished || e.button > 0) return;
        startX = e.clientX; startY = e.clientY; pid = e.pointerId; dragging = false;
        try { node.setPointerCapture(pid); } catch (err) { /* ignore */ }
      });
      node.addEventListener('pointermove', (e) => {
        if (pid === null || e.pointerId !== pid || finished) return;
        const dx = e.clientX - startX, dy = e.clientY - startY;
        if (!dragging) {
          if (Math.hypot(dx, dy) < 8) return;
          dragging = true;
          ghost = node.cloneNode(true); ghost.classList.add('ghost'); ghost.style.width = node.offsetWidth + 'px'; document.body.append(ghost);
          slot = el('div', { class: 'tl-card slot', style: { width: node.offsetWidth + 'px', height: node.offsetHeight + 'px' } });
          node.before(slot); node.classList.add('dragging');
        }
        ghost.style.left = (e.clientX - node.offsetWidth / 2) + 'px'; ghost.style.top = (e.clientY - 30) + 'px';
        const under = document.elementsFromPoint(e.clientX, e.clientY).find((x) => x.classList && x.classList.contains('tl-card') && x !== ghost && x !== node && x !== slot && list.contains(x));
        if (under) {
          const kids = [...list.children];
          if (kids.indexOf(slot) < kids.indexOf(under)) under.after(slot); else under.before(slot);
          numbering();
        }
      });
      const end = (e) => {
        if (pid === null || e.pointerId !== pid) return;
        try { node.releasePointerCapture(pid); } catch (err) { /* ignore */ }
        pid = null;
        if (dragging) {
          dragging = false; ghost?.remove(); ghost = null; node.classList.remove('dragging');
          if (slot) { slot.replaceWith(node); slot = null; }
          syncFromDom(); selected = null; render();
        } else if (!finished && e.type === 'pointerup') {
          // Toucher : sélectionner, puis toucher la destination
          if (selected && selected !== card) { const target = order.indexOf(card); const c = selected; selected = null; moveTo(c, target); }
          else { selected = selected === card ? null : card; render(); }
        }
      };
      node.addEventListener('pointerup', end);
      node.addEventListener('pointercancel', end);
    }

    function check() {
      if (finished) return;
      attempts++;
      const sorted = order.slice().sort((a, b) => a.year - b.year);
      const exact = order.filter((c, i) => c.year === sorted[i].year).length;
      history.push(exact);
      shell.setRound(attempts, 0);
      attemptsEl.innerHTML = '';
      attemptsEl.append(el('div', { class: 'found-list' }, history.map((n, i) => el('span', { text: `Essai ${i + 1} : ${n}/${order.length} juste${n > 1 ? 's' : ''}`, class: i === history.length - 1 ? 'on' : '' }))));
      if (exact === order.length) return finish(true);
      WJ.ui.toast(`${exact} bien placée${exact > 1 ? 's' : ''}, ${order.length - exact} à revoir. ${pts() - 10 >= 10 ? `Prochain essai : ${pts() - 10} pts max.` : ''}`, exact >= order.length / 2 ? 'info' : 'ko', 2600);
    }
    function finish(ok) {
      if (finished) return; finished = true;
      const score = ok ? pts() : 0;
      const sorted = order.slice().sort((a, b) => a.year - b.year);
      order = sorted; selected = null; render();
      [...list.children].forEach((n, i) => { n.classList.remove('draggable'); n.querySelector('.year').textContent = fmtYear(sorted[i].year); n.classList.add('placed-ok'); });
      actions.remove();
      shell.setScore(score);
      const results = sorted.map((c, i) => ({ ok, points: ok ? Math.round(score / sorted.length) : 0, title: c.title, label: `${i + 1}. ${c.title} (${fmtYear(c.year)})` }));
      result.append(el('div', { class: 'reveal ' + (ok ? 'ok' : 'ko') }, [
        el('h3', { text: ok ? `Bon ordre trouvé en ${attempts} essai${attempts > 1 ? 's' : ''} !` : 'Voici le bon ordre' }),
        el('p', { class: 'pts', text: `+${score} pts` }),
      ]));
      WJ.ui.waitNext(result, 'Voir le résultat').then(() => {
        WJ.store.bumpStat('games', 1); WJ.store.bumpStat('points', score);
        const variant = [theme, mode.id, difficulty !== 'normal' ? difficulty : null].filter(Boolean).join(':');
        const best = WJ.store.best(game.id, variant)?.score ?? null;
        const isBest = WJ.store.recordScore(game.id, variant, score);
        WJ.ui.view(root, WJ.ui.endScreen({ game: game.name, variantLabel: `${WJ.pool.theme(theme).name}, ${mode.name}`, results, total: score, isBest, best, shareText: `WikiJeux · ${game.name} · ${mode.name}\n${ok ? `🧩 bon ordre en ${attempts} essai${attempts > 1 ? 's' : ''}` : '🏳️ abandon'} · ${score} pts\n${location.href.split('#')[0]}#/frise`, onReplay: () => { location.hash = `#/frise?theme=${theme}&mode=${mode.id}&difficulty=${difficulty}&go=1&r=${Date.now()}`; } }));
      });
    }
    render();
    WJ.debugOrder = { get order() { return order; }, setOrder: (qids) => { order = qids.map((q) => cards.find((c) => c.qid === q)); render(); }, moveTo };
  }

  WJ.register(game);
  WJ.frise = { keyDates };
})();
