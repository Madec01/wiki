/* Combien d'habitants : estime la population d'une ville. */
(() => {
  const { el, shuffle, fmtInt } = WJ.util;
  const THEMES = [
    { id: 'france', name: 'Villes de France', icon: '🇫🇷', min: 20000, max: 2500000, desc: 'Communes de plus de 20 000 habitants' },
    { id: 'monde', name: 'Grandes villes du monde', icon: '🌍', min: 1000000, max: 40000000, desc: 'Métropoles de plus d’un million d’habitants' },
  ];
  const QUERIES = {
    france: `SELECT ?item ?itemLabel (MAX(?p) AS ?pop) (SAMPLE(?deptLabel) AS ?where) (SAMPLE(?img) AS ?img) (SAMPLE(?article) AS ?article) WHERE {
      ?item wdt:P31 wd:Q484170; wdt:P1082 ?p . FILTER(?p > 20000)
      ?article schema:about ?item; schema:isPartOf <https://fr.wikipedia.org/> .
      OPTIONAL { ?item wdt:P131 ?dept . ?dept rdfs:label ?deptLabel FILTER(LANG(?deptLabel) = "fr") }
      OPTIONAL { ?item wdt:P18 ?img }
      ?item rdfs:label ?itemLabel FILTER(LANG(?itemLabel) = "fr")
    } GROUP BY ?item ?itemLabel LIMIT 600`,
    monde: `SELECT ?item ?itemLabel (MAX(?p) AS ?pop) (SAMPLE(?countryLabel) AS ?where) (SAMPLE(?img) AS ?img) (SAMPLE(?article) AS ?article) WHERE {
      ?item wdt:P31 wd:Q1549591; wdt:P1082 ?p . FILTER(?p > 1000000)
      ?article schema:about ?item; schema:isPartOf <https://fr.wikipedia.org/> .
      OPTIONAL { ?item wdt:P17 ?country . ?country rdfs:label ?countryLabel FILTER(LANG(?countryLabel) = "fr") }
      OPTIONAL { ?item wdt:P18 ?img }
      ?item rdfs:label ?itemLabel FILTER(LANG(?itemLabel) = "fr")
    } GROUP BY ?item ?itemLabel LIMIT 600`,
  };
  const imgUrl = (u) => (u ? u.replace(/^http:/, 'https:') + (u.includes('?') ? '&' : '?') + 'width=800' : null);

  async function cities(themeId) {
    return WJ.store.cached(`cities.${themeId}`, 7 * 864e5, async () => {
      const rows = await WJ.api.sparql(QUERIES[themeId]);
      const seen = new Set();
      return rows.map((r) => ({
        qid: WJ.api.qidFromUri(r.item), title: decodeURIComponent((r.article || '').split('/wiki/')[1] || r.itemLabel).replace(/_/g, ' '), name: r.itemLabel,
        pop: Math.round(parseFloat(r.pop)), where: r.where || '', image: imgUrl(r.img),
      })).filter((c) => c.pop > 0 && c.name && !seen.has(c.qid) && seen.add(c.qid));
    });
  }

  const game = {
    id: 'habitants', name: 'Combien d’habitants ?', icon: '🏘️', group: 'comparer',
    desc: 'Une ville, un curseur : estime sa population. Plus tu es proche, plus tu marques.',
    start(root, params = {}) {
      const launch = async ({ theme }) => {
        const th = THEMES.find((t) => t.id === theme) || THEMES[0];
        WJ.ui.view(root, WJ.ui.loading('Interrogation de Wikidata…'));
        let list;
        try { list = shuffle(await cities(th.id)).slice(0, 10); if (list.length < 3) throw new Error('Pas assez de villes.'); } catch (e) { WJ.ui.view(root, WJ.ui.errorBox(e, () => launch({ theme }))); return; }
        await WJ.runRounds({ game, root, variant: th.id, variantLabel: th.name, entries: list, playRound: (ctx) => playRound(ctx, th) });
      };
      if (params.go) return launch({ theme: params.theme || 'france' });
      WJ.ui.view(root, WJ.ui.startScreen({ game, themes: THEMES, defaultTheme: params.theme || 'france', rules: ['100 pts si tu tombes juste, 0 au-delà d’un facteur 3.', 'Le curseur est logarithmique : chaque cran multiplie la population.', 'Chiffres Wikidata, 10 villes par partie.'], onStart: launch }));
    },
  };

  function score(guess, real) {
    const err = Math.abs(Math.log10(guess / real));
    return Math.max(0, Math.round(100 * (1 - err / Math.log10(3))));
  }

  function playRound({ entry, content }, th) {
    const lmin = Math.log10(th.min), lmax = Math.log10(th.max);
    const range = el('input', { type: 'range', min: 0, max: 1000, value: 500, 'aria-label': 'Population estimée' });
    const value = el('div', { class: 'slider-value' });
    const toPop = () => Math.round(Math.pow(10, lmin + (range.value / 1000) * (lmax - lmin)) / 1000) * 1000;
    const refresh = () => { value.textContent = fmtInt(toPop()) + ' hab.'; };
    range.addEventListener('input', refresh); refresh();
    const result = el('div');
    let resolveRound; const done = new Promise((r) => { resolveRound = r; });
    const validate = WJ.ui.button('Valider mon estimation', () => {
      const guess = toPop(); const pts = score(guess, entry.pop);
      validate.disabled = true; range.disabled = true;
      const ratio = guess / entry.pop;
      result.append(el('div', { class: 'reveal ' + (pts >= 60 ? 'ok' : pts > 0 ? '' : 'ko') }, [
        el('h3', { text: `${fmtInt(entry.pop)} habitants` }),
        el('p', { class: 'muted', text: `Tu as dit ${fmtInt(guess)} : ${ratio > 1 ? '+' : '−'}${Math.round(Math.abs(ratio - 1) * 100)} %.` }),
        el('p', { class: 'pts', text: `+${pts} pts` }),
        el('div', { class: 'article-footer' }, [el('a', { href: WJ.util.wikiUrl(entry.title), target: '_blank', rel: 'noopener', class: 'btn btn-ghost btn-sm' }, ['Lire l’article ↗'])]),
      ]));
      WJ.ui.waitNext(result).then(() => resolveRound({ ok: pts >= 40, points: pts, title: entry.title, emoji: pts >= 80 ? '🟩' : pts >= 40 ? '🟨' : '🟥', label: `${entry.name} : ${fmtInt(entry.pop)} hab.` }));
    }, 'btn btn-primary btn-lg');
    content.append(
      el('h2', { text: entry.name, style: { textAlign: 'center' } }),
      entry.where ? el('p', { class: 'muted', style: { textAlign: 'center' }, text: entry.where }) : null,
      entry.image ? el('div', { class: 'image-frame', style: { maxHeight: '36vh' } }, [WJ.ui.image(entry.image, entry.name)]) : null,
      el('div', { class: 'slider-wrap' }, [value, range, el('div', { class: 'scale' }, [el('span', { text: fmtInt(th.min) }), el('span', { text: fmtInt(th.max) })])]),
      el('div', { class: 'row center' }, [validate]), result,
    );
    return done;
  }
  WJ.register(game);
})();
