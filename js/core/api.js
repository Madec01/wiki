/* Accès aux API Wikimedia : Wikipédia (REST + action), pageviews, Wikidata (SPARQL), Commons. */
WJ.api = (() => {
  const UA = 'WikiJeux/1.0 (https://github.com/Madec01/wiki)';
  const LANG = 'fr';
  const inflight = new Map();

  class ApiError extends Error {
    constructor(message, status) { super(message); this.status = status; }
  }

  /** GET JSON avec dédoublonnage des requêtes identiques en vol et 2 tentatives sur 429/5xx. */
  async function getJSON(url, { retries = 2, headers = {} } = {}) {
    if (inflight.has(url)) return inflight.get(url);
    const p = (async () => {
      let lastErr;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const res = await fetch(url, { headers: { 'Api-User-Agent': UA, Accept: 'application/json', ...headers } });
          if (res.status === 429 || res.status >= 500) throw new ApiError(`Wikipédia répond ${res.status}`, res.status);
          if (!res.ok) throw new ApiError(`Erreur ${res.status}`, res.status);
          return await res.json();
        } catch (e) {
          lastErr = e;
          if (e instanceof ApiError && e.status === 404) break;
          if (attempt < retries) await WJ.util.sleep(600 * (attempt + 1));
        }
      }
      throw lastErr;
    })();
    inflight.set(url, p);
    try { return await p; } finally { inflight.delete(url); }
  }

  const enc = encodeURIComponent;
  const titleParam = (t) => String(t).replace(/ /g, '_');
  const restBase = (lang) => `https://${lang}.wikipedia.org/api/rest_v1`;

  /** API action (api.php) de Wikipédia, formatversion 2, CORS anonyme. */
  function query(params, lang = LANG) {
    const p = new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params });
    return getJSON(`https://${lang}.wikipedia.org/w/api.php?${p}`);
  }

  /** Résumé REST : titre, extrait, description, image, coordonnées, identifiant Wikidata. */
  const summary = (title, lang = LANG) => getJSON(`${restBase(lang)}/page/summary/${enc(titleParam(title))}`);
  const randomSummary = (lang = LANG) => getJSON(`${restBase(lang)}/page/random/summary`);

  /** Suggestions de titres pour l'autocomplétion. */
  async function suggest(term, limit = 8, lang = LANG) {
    const p = new URLSearchParams({ action: 'opensearch', format: 'json', origin: '*', search: term, limit, namespace: 0, redirects: 'resolve' });
    const d = await getJSON(`https://${lang}.wikipedia.org/w/api.php?${p}`);
    return Array.isArray(d) && Array.isArray(d[1]) ? d[1] : [];
  }

  /** Résout un titre (redirections, casse) vers {pageid, title} ou null. */
  async function resolve(title, lang = LANG) {
    const d = await query({ action: 'query', titles: title, redirects: 1, prop: 'pageprops', ppprop: 'disambiguation' }, lang);
    const page = d?.query?.pages?.[0];
    if (!page || page.missing || page.invalid) return null;
    return { pageid: page.pageid, title: page.title, disambiguation: !!page.pageprops?.disambiguation };
  }

  /** Charge des propriétés pour une liste de titres (ou pageids), par lots de 50. */
  async function pages(titles, props = {}, lang = LANG) {
    const out = [];
    for (let i = 0; i < titles.length; i += 50) {
      const batch = titles.slice(i, i + 50);
      const key = typeof batch[0] === 'number' ? 'pageids' : 'titles';
      const d = await query({ action: 'query', [key]: batch.join('|'), redirects: 1, ...props }, lang);
      out.push(...(d?.query?.pages || []));
    }
    return out;
  }

  /** Recherche CirrusSearch utilisée comme générateur : thèmes par modèle d'infobox. */
  function searchPages(search, { sort = 'incoming_links_desc', offset = 0, limit = 50, props = {} } = {}, lang = LANG) {
    return query({
      action: 'query', generator: 'search', gsrsearch: search, gsrsort: sort, gsroffset: offset, gsrlimit: limit, gsrnamespace: 0, ...props,
    }, lang).then((d) => d?.query?.pages || []);
  }

  /** Pages les plus consultées un jour donné (AAAA-MM-JJ). */
  async function topViews(day, lang = LANG) {
    const [y, m, d] = day.split('-');
    const data = await getJSON(`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${lang}.wikipedia/all-access/${y}/${m}/${d}`);
    return (data?.items?.[0]?.articles || []).map((a) => ({ title: a.article.replace(/_/g, ' '), views: a.views, rank: a.rank }));
  }

  /** HTML d'un article (pour la course de liens). */
  async function parse(title, lang = LANG) {
    const d = await query({ action: 'parse', page: title, prop: 'text|displaytitle', redirects: 1, disabletoc: 1, disableeditsection: 1, mobileformat: 1 }, lang);
    if (d?.error) throw new ApiError(d.error.info || 'Article introuvable', 404);
    return { title: d.parse.title, html: d.parse.text };
  }

  /** Teste si `from` contient un lien vers au moins un des `targets` ; renvoie les cibles trouvées. */
  async function linksBetween(from, targets, lang = LANG) {
    const d = await query({ action: 'query', titles: from, redirects: 1, prop: 'links', plnamespace: 0, pltitles: targets.join('|'), pllimit: 'max' }, lang);
    const page = d?.query?.pages?.[0];
    return (page?.links || []).map((l) => l.title);
  }

  /** Liens sortants d'un article (espace principal), jusqu'à `max` entrées. */
  async function outgoingLinks(title, max = 500, lang = LANG) {
    const out = [];
    let cont = {};
    do {
      const d = await query({ action: 'query', titles: title, redirects: 1, prop: 'links', plnamespace: 0, pllimit: 'max', ...cont }, lang);
      out.push(...((d?.query?.pages?.[0]?.links || []).map((l) => l.title)));
      cont = d?.continue || null;
    } while (cont && out.length < max);
    return out;
  }

  /** SPARQL sur Wikidata ; renvoie des lignes {var: valeur} simplifiées. */
  async function sparql(queryText) {
    const url = `https://query.wikidata.org/sparql?format=json&query=${enc(queryText)}`;
    const d = await getJSON(url, { headers: { Accept: 'application/sparql-results+json' } });
    return (d?.results?.bindings || []).map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v.value])));
  }
  const qidFromUri = (uri) => (uri || '').split('/').pop();

  /** Auteur et licence d'un fichier Commons, pour créditer les images. */
  async function imageCredit(fileName) {
    if (!fileName) return null;
    const p = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', origin: '*', titles: 'File:' + fileName, prop: 'imageinfo',
      iiprop: 'extmetadata|url', iiextmetadatafilter: 'Artist|LicenseShortName|DateTimeOriginal|Credit|ImageDescription',
    });
    try {
      const d = await getJSON(`https://commons.wikimedia.org/w/api.php?${p}`);
      const info = d?.query?.pages?.[0]?.imageinfo?.[0];
      if (!info) return null;
      const meta = info.extmetadata || {};
      const strip = (h) => (h ? String(h).replace(/<[^>]+>/g, '').trim() : '');
      return {
        artist: strip(meta.Artist?.value), license: strip(meta.LicenseShortName?.value), date: strip(meta.DateTimeOriginal?.value),
        description: strip(meta.ImageDescription?.value), url: info.descriptionurl || `https://commons.wikimedia.org/wiki/File:${enc(fileName)}`,
      };
    } catch (e) { return null; }
  }

  /** Propriétés standard demandées sur une page pour les jeux. */
  const PAGE_PROPS = {
    prop: 'pageimages|pageprops|description|coordinates',
    piprop: 'thumbnail|original|name', pithumbsize: 900, pilicense: 'any',
    ppprop: 'wikibase_item|disambiguation', coprimary: 'primary',
  };

  return { ApiError, getJSON, query, summary, randomSummary, suggest, resolve, pages, searchPages, topViews, parse, linksBetween, outgoingLinks, sparql, qidFromUri, imageCredit, PAGE_PROPS, LANG };
})();
