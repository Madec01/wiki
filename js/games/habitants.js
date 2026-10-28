/* Combien d'habitants : d'abord plus ou moins qu'une ville connue, puis estimation au curseur. */
(() => {
  const { el, shuffle, fmtInt } = WJ.util;
  const THEMES = [
    { id: 'france', name: 'Villes de France', icon: '🇫🇷', min: 20000, max: 2500000, desc: 'Communes de plus de 20 000 habitants' },
    { id: 'monde', name: 'Grandes villes du monde', icon: '🌍', min: 1000000, max: 40000000, desc: 'Métropoles de plus d’un million d’habitants' },
  ];
  const STEP1 = 30, STEP2 = 70;
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

  /** Paires (ville mystère, ville de référence) de populations comparables mais distinctes. */
  function makePairs(list, count) {
    const pool = shuffle(list);
    const pairs = [];
    const used = new Set();
    for (const x of pool) {
      if (pairs.length >= count) break;
      if (used.has(x.qid)) continue;
      const ref = shuffle(pool.filter((r) => r !== x && !used.has(r.qid))).find((r) => { const k = Math.max(r.pop, x.pop) / Math.min(r.pop, x.pop); return k >= 1.15 && k <= 4; });
      if (!ref) continue;
      used.add(x.qid); used.add(ref.qid);
      pairs.push({ ...x, ref });
    }
    return pairs;
  }

  const game = {
    id: 'habitants', name: 'Combien d’habitants ?', icon: '🏘️', group: 'comparer',
    desc: 'Une ville mystère et une ville de référence : plus ou moins peuplée ? Puis affine ton estimation au curseur.',
    start(root, params = {}) {
      const launch = async ({ theme }) => {
        const th = THEMES.find((t) => t.id === theme) || THEMES[0];
        WJ.ui.view(root, WJ.ui.loading('Interrogation de Wikidata…'));
        let list;
        try { list = makePairs(await cities(th.id), 10); if (list.length < 3) throw new Error('Pas assez de villes.'); } catch (e) { WJ.ui.view(root, WJ.ui.errorBox(e, () => launch({ theme }))); return; }
        await WJ.runRounds({ game, root, variant: th.id, variantLabel: th.name, entries: list, playRound: (ctx) => playRound(ctx, th) });
      };
      if (params.go) return launch({ theme: params.theme || 'france' });
      WJ.ui.view(root, WJ.ui.startScreen({ game, themes: THEMES, defaultTheme: params.theme || 'france', rules: [`Étape 1 : la ville mystère est-elle plus ou moins peuplée que la ville de référence ? ${STEP1} pts si c’est juste, sinon la manche s’arrête.`, `Étape 2 : estime sa population au curseur, jusqu’à ${STEP2} pts selon la précision (0 au-delà d’un facteur 3).`, 'Chiffres Wikidata, 10 villes par partie.'], onStart: launch }));
    },
  };

  const accuracy = (guess, real) => Math.max(0, 1 - Math.abs(Math.log10(guess / real)) / Math.log10(3));

  function playRound({ entry, content }, th) {
    const lmin = Math.log10(th.min), lmax = Math.log10(th.max);
    const toSlider = (pop) => Math.round(1000 * (Math.log10(Math.max(th.min, Math.min(th.max, pop))) - lmin) / (lmax - lmin));
    const range = el('input', { type: 'range', min: 0, max: 1000, value: toSlider(entry.ref.pop), 'aria-label': 'Population estimée' });
    const value = el('div', { class: 'slider-value' });
    const toPop = () => Math.round(Math.pow(10, lmin + (range.value / 1000) * (lmax - lmin)) / 1000) * 1000;
    const refresh = () => { value.textContent = fmtInt(toPop()) + ' hab.'; };
    range.addEventListener('input', refresh); refresh();
    const result = el('div');
    const step2 = el('div', { class: 'hidden' });
    let resolveRound; const done = new Promise((r) => { resolveRound = r; });
    let pts = 0;
    const cityCard = (c, showPop) => el('div', { class: 'vs-card' }, [
      c.image ? WJ.ui.image(c.image, c.name, '') : el('div', { style: { height: '200px', background: 'var(--bg-2)' } }),
      el('div', { class: 'vs-body' }, [el('h3', { text: c.name }), c.where ? el('p', { class: 'muted', style: { fontSize: '.8rem' }, text: c.where }) : null, el('div', { class: 'vs-views', text: showPop ? fmtInt(c.pop) : '?' }), el('div', { class: 'muted', style: { fontSize: '.75rem' }, text: 'habitants' })]),
    ]);
    const step1 = el('div', { class: 'row center' });
    const decide = (more) => {
      const ok = (entry.pop > entry.ref.pop) === more;
      step1.remove();
      if (!ok) return finish(false, null);
      pts += STEP1;
      WJ.ui.toast(`Exact ! +${STEP1}. Maintenant, à combien ?`, 'ok', 2000);
      step2.classList.remove('hidden');
    };
    step1.append(WJ.ui.button(`▲ ${entry.name} est plus peuplée`, () => decide(true), 'btn btn-primary'), WJ.ui.button(`▼ ${entry.name} est moins peuplée`, () => decide(false), 'btn'));
    const validate = WJ.ui.button('Valider mon estimation', () => {
      const guess = toPop();
      pts += Math.round(STEP2 * accuracy(guess, entry.pop));
      validate.disabled = true; range.disabled = true;
      finish(true, guess);
    }, 'btn btn-primary btn-lg');
    step2.append(el('p', { class: 'muted', style: { textAlign: 'center' }, text: `Le curseur démarre sur ${entry.ref.name}. Estime la population de ${entry.name}.` }), el('div', { class: 'slider-wrap' }, [value, range, el('div', { class: 'scale' }, [el('span', { text: fmtInt(th.min) }), el('span', { text: fmtInt(th.max) })])]), el('div', { class: 'row center' }, [validate]));
    function finish(step1ok, guess) {
      const ratio = guess ? guess / entry.pop : null;
      result.append(el('div', { class: 'reveal ' + (pts >= 60 ? 'ok' : pts > 0 ? '' : 'ko') }, [
        el('h3', { text: `${entry.name} : ${fmtInt(entry.pop)} habitants` }),
        el('p', { class: 'muted', text: step1ok ? `Tu as dit ${fmtInt(guess)} : ${ratio > 1 ? '+' : '−'}${Math.round(Math.abs(ratio - 1) * 100)} %. ${entry.ref.name} : ${fmtInt(entry.ref.pop)}.` : `Raté : ${entry.name} est ${entry.pop > entry.ref.pop ? 'plus' : 'moins'} peuplée que ${entry.ref.name} (${fmtInt(entry.ref.pop)}).` }),
        el('p', { class: 'pts', text: `+${pts} pts` }),
        el('div', { class: 'article-footer' }, [el('a', { href: WJ.util.wikiUrl(entry.title), target: '_blank', rel: 'noopener', class: 'btn btn-ghost btn-sm' }, ['Lire l’article ↗'])]),
      ]));
      WJ.ui.waitNext(result).then(() => resolveRound({ ok: pts >= 30, points: pts, title: entry.title, emoji: pts >= 80 ? '🟩' : pts >= 30 ? '🟨' : '🟥', label: `${entry.name} : ${fmtInt(entry.pop)} hab.` }));
    }
    content.append(
      el('div', { class: 'versus' }, [cityCard(entry, false), cityCard(entry.ref, true)]),
      el('p', { class: 'muted', style: { textAlign: 'center' }, text: `${entry.name} est-elle plus ou moins peuplée que ${entry.ref.name} ?` }),
      step1, step2, result,
    );
    return done;
  }
  WJ.register(game);
  WJ.habitants = { makePairs };
})();
