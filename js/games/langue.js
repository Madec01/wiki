/* Devine la langue : le même article dans une autre langue. */
(() => {
  const { el, shuffle, pick } = WJ.util;
  const LANGS = [
    ['en', 'anglais', 'latin'], ['de', 'allemand', 'latin'], ['es', 'espagnol', 'latin'], ['it', 'italien', 'latin'], ['pt', 'portugais', 'latin'], ['nl', 'néerlandais', 'latin'],
    ['sv', 'suédois', 'latin'], ['da', 'danois', 'latin'], ['no', 'norvégien', 'latin'], ['fi', 'finnois', 'latin'], ['pl', 'polonais', 'latin'], ['cs', 'tchèque', 'latin'], ['sk', 'slovaque', 'latin'],
    ['hu', 'hongrois', 'latin'], ['ro', 'roumain', 'latin'], ['tr', 'turc', 'latin'], ['hr', 'croate', 'latin'], ['sl', 'slovène', 'latin'], ['et', 'estonien', 'latin'], ['lv', 'letton', 'latin'], ['lt', 'lituanien', 'latin'],
    ['ca', 'catalan', 'latin'], ['eu', 'basque', 'latin'], ['br', 'breton', 'latin'], ['oc', 'occitan', 'latin'], ['la', 'latin', 'latin'], ['eo', 'espéranto', 'latin'], ['is', 'islandais', 'latin'], ['ga', 'irlandais', 'latin'], ['cy', 'gallois', 'latin'],
    ['id', 'indonésien', 'latin'], ['ms', 'malais', 'latin'], ['vi', 'vietnamien', 'latin'], ['sw', 'swahili', 'latin'], ['af', 'afrikaans', 'latin'], ['tl', 'tagalog', 'latin'], ['sq', 'albanais', 'latin'], ['az', 'azéri', 'latin'],
    ['ru', 'russe', 'cyrillique'], ['uk', 'ukrainien', 'cyrillique'], ['bg', 'bulgare', 'cyrillique'], ['sr', 'serbe', 'cyrillique'], ['mk', 'macédonien', 'cyrillique'], ['be', 'biélorusse', 'cyrillique'], ['kk', 'kazakh', 'cyrillique'], ['mn', 'mongol', 'cyrillique'],
    ['el', 'grec', 'grec'], ['ar', 'arabe', 'arabe'], ['fa', 'persan', 'arabe'], ['ur', 'ourdou', 'arabe'], ['he', 'hébreu', 'hébreu'], ['hy', 'arménien', 'autre'], ['ka', 'géorgien', 'autre'],
    ['hi', 'hindi', 'indien'], ['bn', 'bengali', 'indien'], ['ta', 'tamoul', 'indien'], ['te', 'télougou', 'indien'], ['ml', 'malayalam', 'indien'], ['th', 'thaï', 'autre'], ['ko', 'coréen', 'cjk'], ['ja', 'japonais', 'cjk'], ['zh', 'chinois', 'cjk'],
  ].map(([code, name, group]) => ({ code, name, group }));
  const byCode = Object.fromEntries(LANGS.map((l) => [l.code, l]));
  const RTL = new Set(['ar', 'fa', 'ur', 'he']);

  async function playRound({ entry, content }) {
    const d = await WJ.api.query({ action: 'query', titles: entry.title, redirects: 1, prop: 'langlinks', lllimit: 'max', llprop: 'autonym' });
    const links = (d?.query?.pages?.[0]?.langlinks || []).filter((l) => byCode[l.lang]);
    if (links.length < 4) throw new Error('Trop peu de versions linguistiques pour cet article, on passe.');
    let target = null, extract = '';
    for (const l of shuffle(links).slice(0, 4)) {
      try {
        const s = await WJ.api.summary(l.title, l.lang);
        const t = WJ.text.clean(s.extract || '');
        if (t.length > 50) { target = { ...byCode[l.lang], title: l.title, autonym: l.autonym }; extract = t; break; }
      } catch (e) { /* version absente, on essaie une autre */ }
    }
    if (!target) throw new Error('Impossible de charger une version étrangère, on passe.');
    WJ.debugLangue = target;
    const shown = extract.length > 420 ? extract.slice(0, 420).replace(/\s+\S*$/, '') + '…' : extract;
    // Quatre options : la bonne + des langues de même écriture quand c'est possible
    const sameGroup = LANGS.filter((l) => l.group === target.group && l.code !== target.code);
    const others = LANGS.filter((l) => l.group !== target.group);
    const distractors = shuffle(sameGroup).slice(0, 3);
    while (distractors.length < 3) distractors.push(pick(others.filter((o) => !distractors.includes(o))));
    const options = shuffle([target, ...distractors]);
    let tries = 0, finished = false;
    const result = el('div');
    let resolveRound; const done = new Promise((r) => { resolveRound = r; });
    const optEls = el('div', { class: 'options' });
    options.forEach((o) => {
      const b = WJ.ui.button(o.name.charAt(0).toUpperCase() + o.name.slice(1), () => choose(o, b), 'btn');
      optEls.append(b);
    });
    function choose(o, b) {
      if (finished) return;
      tries++;
      if (o.code === target.code) return finish(true, b);
      b.classList.add('wrong'); b.disabled = true;
      if (tries >= 2) return finish(false);
      WJ.ui.toast('Non, encore un essai.', 'ko', 1200);
    }
    function finish(ok, b) {
      finished = true;
      const pts = !ok ? 0 : tries === 1 ? 100 : 40;
      [...optEls.children].forEach((c) => { c.disabled = true; if (c.textContent.toLowerCase() === target.name) c.classList.add('right'); });
      result.append(el('div', { class: 'reveal ' + (ok ? 'ok' : 'ko') }, [
        el('h3', { text: `C’était du ${target.name}${target.autonym ? ` (${target.autonym})` : ''}` }),
        el('p', { class: 'pts', text: ok ? `+${pts} pts` : 'Raté · 0 pt' }),
        el('div', { class: 'article-footer' }, [
          el('a', { href: WJ.util.wikiUrl(target.title, target.code), target: '_blank', rel: 'noopener', class: 'btn btn-ghost btn-sm' }, [`${target.title} ↗`]),
          el('a', { href: WJ.util.wikiUrl(entry.title), target: '_blank', rel: 'noopener', class: 'btn btn-ghost btn-sm' }, ['Version française ↗']),
        ]),
      ]));
      WJ.ui.waitNext(result).then(() => resolveRound({ ok, points: pts, title: entry.title, emoji: !ok ? '🟥' : tries === 1 ? '🟩' : '🟨', label: `${entry.title} en ${target.name}` }));
    }
    content.append(
      el('p', { class: 'muted', text: 'Dans quelle langue est écrit cet extrait ?' }),
      el('blockquote', { class: 'quote', lang: target.code, dir: RTL.has(target.code) ? 'rtl' : 'ltr', text: shown }),
      el('p', { class: 'muted', text: `Indice : il s’agit de l’article « ${entry.title} ».` }),
      optEls, result,
    );
    return done;
  }

  WJ.standardGame({
    id: 'langue', name: 'Devine la langue', icon: '🗣️', group: 'explorer',
    desc: 'Un article connu, mais dans une autre langue. Reconnais laquelle parmi quatre propositions.',
    rules: ['100 pts du premier coup, 40 au second essai.', 'Les propositions utilisent la même écriture quand c’est possible : il faut lire, pas juste reconnaître l’alphabet.'],
    themes: true, need: {}, rounds: 8, playRound,
  });
})();
