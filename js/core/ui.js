/* Composants d'interface partagés. */
WJ.ui = (() => {
  const { el, $, escapeHtml, debounce } = WJ.util;

  function view(root, ...nodes) {
    root.innerHTML = '';
    root.append(...nodes.filter(Boolean));
    window.scrollTo({ top: 0 });
  }

  function toast(message, kind = 'info', ms = 2600) {
    const host = $('#toasts');
    const t = el('div', { class: `toast toast-${kind}`, role: 'status', text: message });
    host.append(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
  }

  const button = (label, onClick, cls = 'btn', attrs = {}) => el('button', { class: cls, type: 'button', onclick: onClick, ...attrs }, label);

  const loading = (msg = 'Chargement depuis Wikipédia…') => el('div', { class: 'loading' }, [el('div', { class: 'spinner' }), el('p', { text: msg })]);

  function errorBox(err, retry) {
    const msg = err?.message || String(err);
    const hint = /429|répond 5|Failed to fetch|NetworkError/i.test(msg)
      ? 'Wikipédia limite les requêtes ou le réseau est coupé. Patiente quelques secondes puis réessaie.'
      : '';
    return el('div', { class: 'card error' }, [
      el('p', { class: 'error-title', text: 'Oups.' }),
      el('p', { text: msg }),
      hint ? el('p', { class: 'muted', text: hint }) : null,
      retry ? button('Réessayer', retry, 'btn btn-primary') : null,
    ]);
  }

  /** Autocomplétion branchée sur la recherche Wikipédia. onPick(title) ; onSubmit(valeur) sur Entrée. */
  function autocomplete(input, { onPick, onSubmit, fetchSuggestions = (t) => WJ.api.suggest(t) } = {}) {
    const box = el('ul', { class: 'ac-list', role: 'listbox', hidden: true });
    input.parentNode.insertBefore(box, input.nextSibling);
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    let items = [], active = -1, seq = 0;

    function render() {
      box.innerHTML = '';
      items.forEach((t, i) => {
        const li = el('li', { class: 'ac-item' + (i === active ? ' active' : ''), role: 'option', text: t });
        li.addEventListener('pointerdown', (e) => { e.preventDefault(); choose(t); });
        box.append(li);
      });
      box.hidden = !items.length;
    }
    function hide() { items = []; active = -1; render(); }
    function choose(t) { input.value = t; hide(); onPick && onPick(t); }

    const update = debounce(async () => {
      const term = input.value.trim();
      if (term.length < 2) return hide();
      const my = ++seq;
      try {
        const list = await fetchSuggestions(term);
        if (my !== seq) return;
        items = list.slice(0, 7); active = -1; render();
      } catch (e) { /* silencieux : la saisie reste possible sans suggestions */ }
    }, 220);

    input.addEventListener('input', update);
    input.addEventListener('blur', () => setTimeout(hide, 120));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); active = (active + 1) % items.length; render(); }
      else if (e.key === 'ArrowUp' && items.length) { e.preventDefault(); active = (active - 1 + items.length) % items.length; render(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (active >= 0 && items[active]) { choose(items[active]); if (onSubmit) onSubmit(input.value); }
        else { hide(); onSubmit && onSubmit(input.value); }
      } else if (e.key === 'Escape') hide();
    });
    return { hide, destroy: () => box.remove() };
  }

  /** Affichage d'un titre masqué façon pendu : words = WJ.answer.mask(...) */
  function maskView(words, { revealedClass = '' } = {}) {
    return el('div', { class: 'mask' }, words.map((w) => el('span', { class: 'mask-word' }, w.map((c) =>
      el('span', { class: 'cell' + (c.letter ? '' : ' punct') + (c.shown && c.letter ? ' shown ' + revealedClass : ''), text: c.shown ? c.ch : '' })))));
  }

  const hearts = (lives, max) => el('div', { class: 'hearts', title: `${lives} vie(s)` }, Array.from({ length: max }, (_, i) => el('span', { class: 'heart' + (i < lives ? '' : ' lost'), text: i < lives ? '♥' : '♡' })));

  /** Cadre commun d'un jeu : en-tête (manche, score) + zone de contenu. */
  function shell(root, { title, icon, rounds, onQuit }) {
    const roundEl = el('span', { class: 'shell-round' });
    const scoreEl = el('span', { class: 'shell-score', text: '0 pt' });
    const content = el('div', { class: 'shell-content' });
    const head = el('div', { class: 'shell-head' }, [
      el('a', { class: 'shell-title', href: '#/', onclick: (e) => { if (onQuit) { e.preventDefault(); onQuit(); } } }, [`${icon} ${title}`]),
      el('div', { class: 'shell-meta' }, [roundEl, scoreEl]),
    ]);
    view(root, el('section', { class: 'shell' }, [head, content]));
    return {
      content,
      setRound: (i, total = rounds) => { roundEl.textContent = total ? `Manche ${i}/${total}` : ''; },
      setScore: (s) => { scoreEl.textContent = `${WJ.util.fmtInt(s)} pt${s >= 2 ? 's' : ''}`; },
    };
  }

  /** Lien vers l'article et crédit image (chargé en différé). */
  function articleFooter(entry, { withCredit = true } = {}) {
    const box = el('div', { class: 'article-footer' }, [
      el('a', { href: WJ.util.wikiUrl(entry.title), target: '_blank', rel: 'noopener', class: 'btn btn-ghost btn-sm' }, ['Lire l’article ↗']),
    ]);
    if (withCredit && entry.imageName) {
      const credit = el('p', { class: 'credit muted', text: 'Image : Wikimedia Commons' });
      box.append(credit);
      WJ.api.imageCredit(entry.imageName).then((c) => {
        if (!c) return;
        credit.innerHTML = `Image : ${c.artist ? escapeHtml(c.artist.slice(0, 60)) + ' · ' : ''}${escapeHtml(c.license || '')} · <a href="${escapeHtml(c.url)}" target="_blank" rel="noopener">Commons ↗</a>`;
      });
    }
    return box;
  }

  async function share(text) {
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      toast('Résultat copié dans le presse-papier !', 'ok');
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      toast('Impossible de partager sur cet appareil.', 'warn');
    }
  }

  /** Écran de fin : récapitulatif, record, partage, rejouer. */
  function endScreen({ game, variantLabel, results, total, isBest, best, onReplay, onHome, shareText, daily }) {
    const emojiLine = results.map((r) => r.emoji || (r.ok ? '🟩' : '🟥')).join('');
    return el('section', { class: 'end card' }, [
      el('h2', { text: daily ? 'Défi du jour terminé !' : 'Partie terminée !' }),
      el('p', { class: 'end-total' }, [el('strong', { text: WJ.util.fmtInt(total) }), ' points']),
      isBest ? el('p', { class: 'badge badge-best', text: '🏆 Nouveau record !' }) : (best !== null && best !== undefined ? el('p', { class: 'muted', text: `Record : ${WJ.util.fmtInt(best)} pts` }) : null),
      el('p', { class: 'emoji-line', text: emojiLine }),
      el('ul', { class: 'end-list' }, results.map((r) => el('li', {}, [
        el('span', { class: 'end-ok', text: r.emoji || (r.ok ? '🟩' : '🟥') }),
        el('a', { href: WJ.util.wikiUrl(r.title), target: '_blank', rel: 'noopener', text: r.label || r.title }),
        el('span', { class: 'end-pts', text: `${r.points > 0 ? '+' : ''}${WJ.util.fmtInt(r.points)}` }),
      ]))),
      el('div', { class: 'row' }, [
        button('Partager', () => share(shareText || `WikiJeux · ${game}${variantLabel ? ' · ' + variantLabel : ''}\n${emojiLine} ${WJ.util.fmtInt(total)} pts\n${location.href.split('#')[0]}`), 'btn'),
        onReplay && !daily ? button('Rejouer', onReplay, 'btn btn-primary') : null,
        button('Accueil', onHome || (() => { location.hash = '#/'; }), 'btn btn-ghost'),
      ]),
    ]);
  }

  /** Sélecteur de thème (boutons). */
  function themePicker(themes, current, onPick) {
    return el('div', { class: 'themes' }, themes.map((t) => el('button', {
      class: 'theme-chip' + (t.id === current ? ' active' : ''), type: 'button', onclick: () => onPick(t.id), title: t.desc || '',
    }, [`${t.icon} ${t.name}`])));
  }

  /** Écran d'accueil d'un jeu : règles, choix du thème, lancer. */
  function startScreen({ game, themes, defaultTheme, onStart, rules, extra, daily, difficulty: showDifficulty = false, modes = null, defaultMode = null, modesLabel = 'Mode' }) {
    let theme = defaultTheme || (themes && themes[0]?.id);
    let mode = defaultMode || (modes && modes[0]?.id);
    const themeName = (id) => (themes || []).find((t) => t.id === id)?.name || WJ.pool.theme(id).name;
    const modeHost = el('div');
    function renderModes() {
      modeHost.innerHTML = '';
      if (!modes) return;
      modeHost.append(el('h3', { text: modesLabel }), themePicker(modes, mode, (id) => { mode = id; renderModes(); updateBest(); }),
        modes.find((m) => m.id === mode)?.desc ? el('p', { class: 'muted', style: { fontSize: '.85rem' }, text: modes.find((m) => m.id === mode).desc }) : null);
    }
    let difficulty = WJ.store.settings().difficulty || 'normal';
    const diffHost = el('div');
    function renderDiff() {
      diffHost.innerHTML = '';
      if (!showDifficulty) return;
      diffHost.append(el('h3', { text: 'Difficulté' }), themePicker(WJ.pool.DIFFICULTIES, difficulty, (id) => { difficulty = id; WJ.store.setSetting('difficulty', id); renderDiff(); updateBest(); }),
        el('p', { class: 'muted', style: { fontSize: '.85rem' }, text: WJ.pool.difficulty(difficulty).desc }));
    }
    const variantOf = () => [theme, modes ? mode : null, showDifficulty && difficulty !== 'normal' ? difficulty : null].filter(Boolean).join(':');
    const bestEl = el('p', { class: 'muted' });
    const updateBest = () => { const b = WJ.store.best(game.id, variantOf()); bestEl.textContent = b ? `Record (${[themeName(theme), modes ? modes.find((m) => m.id === mode)?.name : null, showDifficulty && difficulty !== 'normal' ? difficulty : null].filter(Boolean).join(', ')}) : ${WJ.util.fmtInt(b.score)} pts` : ''; };
    updateBest();
    // Re-render simple du sélecteur à chaque clic
    let pickerHost = el('div');
    function renderPicker() {
      pickerHost.innerHTML = '';
      if (!themes) return;
      pickerHost.append(themePicker(themes, theme, (id) => { theme = id; renderPicker(); updateBest(); }));
    }
    renderPicker(); renderModes(); renderDiff();
    const dailyDone = daily ? WJ.store.dailyResult(game.id, WJ.util.dayKey(0)) : null;
    return el('section', { class: 'start card' }, [
      el('h2', {}, [`${game.icon} ${game.name}`]),
      el('p', { class: 'lead', text: game.desc }),
      rules ? el('ul', { class: 'rules' }, rules.map((r) => el('li', { html: r }))) : null,
      themes ? el('h3', { text: 'Thème' }) : null,
      pickerHost,
      modeHost,
      diffHost,
      bestEl,
      extra || null,
      el('div', { class: 'row' }, [
        button('Jouer', () => onStart({ theme, mode, difficulty: showDifficulty ? difficulty : 'normal' }), 'btn btn-primary btn-lg'),
        daily ? button(dailyDone ? `Défi du jour : ${WJ.util.fmtInt(dailyDone.total)} pts ✓` : '📅 Défi du jour', () => onStart({ theme: 'populaire', daily: true }), 'btn btn-lg' + (dailyDone ? ' done' : '')) : null,
      ]),
    ]);
  }

  function waitNext(container, label = 'Suivant →') {
    return new Promise((resolve) => {
      const b = button(label, () => { b.disabled = true; resolve(); }, 'btn btn-primary btn-lg next');
      container.append(el('div', { class: 'row center' }, [b]));
      b.focus();
    });
  }

  /** Image avec gestion d'erreur de chargement. */
  function image(src, alt = '', cls = 'main-image') {
    const img = el('img', { src, alt, class: cls, loading: 'eager', decoding: 'async', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', () => { img.classList.add('broken'); img.alt = 'Image indisponible'; });
    return img;
  }

  return { view, toast, button, loading, errorBox, autocomplete, maskView, hearts, shell, articleFooter, share, endScreen, themePicker, startScreen, waitNext, image };
})();
