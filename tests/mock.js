/* Simulation des API Wikimedia pour les tests Playwright (pas de réseau). */
const fs = require('fs');
const path = require('path');
const fx = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8'));
const TOP = fx('top.json');
const SEARCH = fx('search.json');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhQGAWjR9awAAAABJRU5ErkJggg==', 'base64');

// Articles "connus" avec image : les pages de la recherche + quelques titres du top.
const KNOWN = {};
for (const p of SEARCH.query.pages) KNOWN[p.title] = p;
let nextId = 900000;
function fakePage(title, withImage = true) {
  if (KNOWN[title]) return KNOWN[title];
  const id = nextId++;
  const p = { pageid: id, ns: 0, title, description: `description de ${title}`, pageprops: { wikibase_item: 'Q' + id } };
  if (withImage) {
    p.pageimage = title.replace(/ /g, '_') + '.jpg';
    p.thumbnail = { source: `https://upload.wikimedia.org/fake/${encodeURIComponent(title)}.jpg`, width: 900, height: 600 };
    p.original = { source: `https://upload.wikimedia.org/fake/${encodeURIComponent(title)}-orig.jpg`, width: 1800, height: 1200 };
  }
  p.coordinates = [{ lat: 48.85 + Math.random(), lon: 2.35 + Math.random(), primary: true, globe: 'earth' }];
  KNOWN[title] = p;
  return p;
}
// Redirections connues pour les tests
const hash = (str) => { let h = 7; for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
/** Graphe de liens déterministe : X pointe vers ~2/3 des pages connues, jamais vers « Banane ». */
const linksOf = (title) => Object.keys(KNOWN).filter((k) => k !== title && k !== 'Banane' && hash(title + '→' + k) % 3 !== 0);
const REDIRECTS = { 'Dickens': 'Charles Dickens', 'Tolstoi': 'Léon Tolstoï', 'Colomb': 'Christophe Colomb' };

const EXTRACT = (t) => `${t} est un sujet encyclopédique important. Cet article décrit ${t} en détail, avec son histoire, sa géographie et sa culture. Beaucoup de personnes connaissent ${t} grâce à la télévision et aux livres publiés depuis le dix-neuvième siècle.`;

function handleActionApi(url) {
  const q = url.searchParams;
  const action = q.get('action');
  if (action === 'opensearch') {
    const s = (q.get('search') || '').toLowerCase();
    const hits = Object.keys(KNOWN).filter((t) => t.toLowerCase().startsWith(s)).slice(0, 7);
    return [q.get('search'), hits, hits.map(() => ''), hits.map((h) => 'https://fr.wikipedia.org/wiki/' + h)];
  }
  if (action === 'parse') {
    const page = q.get('page');
    const links = Object.keys(KNOWN).map((t) => `<a href="/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}" title="${t}">${t}</a>`).join(' · ');
    return { parse: { title: page, text: `<div class="mw-parser-output"><p><b>${page}</b> est un article. Liens : ${links}</p><p>Autre <a href="/wiki/Fichier:Truc.jpg">fichier</a> et <a href="https://example.org">externe</a>.</p></div>` } };
  }
  if (action === 'query' && q.get('list') === 'mostviewed') {
    return { batchcomplete: true, query: { mostviewed: TOP.items[0].articles.map((a) => ({ ns: /^(Wikipédia|Spécial):/.test(a.article) ? 4 : 0, title: a.article.replace(/_/g, ' '), count: a.views })) } };
  }
  if (action === 'query') {
    const prop = q.get('prop') || '';
    if (q.get('generator') === 'search') {
      const offset = parseInt(q.get('gsroffset') || '0', 10);
      let pages;
      if (offset === 0) pages = SEARCH.query.pages.map((p) => ({ ...p, coordinates: p.coordinates || [{ lat: 40 + (p.pageid % 20), lon: -5 + (p.pageid % 30), primary: true, globe: 'earth' }] }));
      else {
        const titles = TOP.items[0].articles.map((a) => a.article.replace(/_/g, ' ')).filter((t) => !/:/.test(t));
        const start = offset % Math.max(1, titles.length - 50);
        pages = titles.slice(start, start + 50).map((t, i) => ({ ...fakePage(t), index: i + 1, description: 'personnalité de test ' + (i % 3 === 0 ? 'française' : 'russe') }));
      }
      return { batchcomplete: true, query: { pages } };
    }
    let titles = (q.get('titles') || '').split('|').filter(Boolean);
    const redirects = [];
    titles = titles.map((t) => { if (REDIRECTS[t]) { redirects.push({ from: t, to: REDIRECTS[t] }); return REDIRECTS[t]; } return t; });
    const pages = titles.map((t) => {
      if (/^zzz/i.test(t)) return { ns: 0, title: t, missing: true };
      const p = { ...fakePage(t) };
      if (prop.includes('links')) {
        const want = (q.get('pltitles') || '').split('|').filter(Boolean);
        const mine = linksOf(t);
        p.links = (want.length ? want.filter((w) => mine.includes(w)) : mine.slice(0, 80)).map((title) => ({ ns: 0, title }));
      }
      if (prop.includes('extracts')) p.extract = EXTRACT(t);
      if (prop.includes('categories')) p.categories = ['Catégorie:Article de qualité', `Catégorie:${t} dans l’art`, 'Catégorie:Patrimoine mondial', 'Catégorie:Monument historique', 'Catégorie:Architecture', 'Catégorie:Tourisme', 'Catégorie:Édifice religieux', 'Catégorie:Naissance en 1850'].map((title) => ({ ns: 14, title }));
      if (prop.includes('langlinks')) p.langlinks = [{ lang: 'de', title: 'Eiffelturm', autonym: 'Deutsch', langname: 'allemand' }, { lang: 'en', title: 'Eiffel Tower', autonym: 'English', langname: 'anglais' }, { lang: 'es', title: 'Torre Eiffel', autonym: 'español', langname: 'espagnol' }, { lang: 'it', title: 'Torre Eiffel', autonym: 'italiano', langname: 'italien' }];
      return p;
    });
    return { batchcomplete: true, query: { redirects, pages } };
  }
  return { error: { info: 'mock: action inconnue ' + action } };
}

function sparqlMock(url) {
  const query = decodeURIComponent(url.searchParams.get('query') || '');
  const items = [...query.matchAll(/wd:(Q\d+)/g)].map((m) => m[1]).filter((q) => q !== 'Q5' && q !== 'Q484170' && q !== 'Q1549591' && q !== 'Q142');
  if (/P1082/.test(query) && /Q484170|Q1549591/.test(query)) {
    const rows = ['Paris', 'Lyon', 'Marseille', 'Toulouse', 'Nice', 'Nantes', 'Lille', 'Rennes', 'Bordeaux', 'Strasbourg', 'Grenoble', 'Dijon'].map((n, i) => ({
      item: { value: 'http://www.wikidata.org/entity/Q90' + i }, itemLabel: { value: n }, pop: { value: String(2000000 - i * 150000) }, deptLabel: { value: 'Département ' + i }, article: { value: 'https://fr.wikipedia.org/wiki/' + n }, img: { value: 'https://upload.wikimedia.org/fake/' + n + '.jpg' }, countryLabel: { value: 'France' },
    }));
    return { results: { bindings: rows } };
  }
  if (/P17/.test(query)) {
    const countries = [['France', 'Europe'], ['Allemagne', 'Europe'], ['Italie', 'Europe'], ['Japon', 'Asie']];
    return { results: { bindings: items.map((q) => { const [c, k] = countries[parseInt(q.slice(1), 10) % countries.length]; return { item: { value: 'http://www.wikidata.org/entity/' + q }, countryLabel: { value: c }, continentLabel: { value: k } }; }) } };
  }
  const rows = items.map((q, i) => {
    const year = 1500 + ((parseInt(q.slice(1), 10) * 37) % 500);
    return { item: { value: 'http://www.wikidata.org/entity/' + q }, dob: { value: `+${year}-01-01T00:00:00Z` }, date: { value: `+${year}-01-01T00:00:00Z` }, kind: { value: 'dob' } };
  });
  return { results: { bindings: rows } };
}

async function install(page, { log = false, realParse = false } = {}) {
  await page.route(/wikimedia\.org|wikipedia\.org|wikidata\.org|unpkg\.com|tile\.openstreetmap\.org/, async (route) => {
    const url = new URL(route.request().url());
    if (log) console.log('[mock]', url.href.slice(0, 140));
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    try {
      if (url.hostname === 'upload.wikimedia.org' || url.hostname === 'thumb.wikimedia.org' || url.hostname === 'tile.openstreetmap.org') return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
      if (url.hostname === 'wikimedia.org') return json(TOP);
      if (url.hostname === 'query.wikidata.org') return json(sparqlMock(url));
      if (url.hostname === 'commons.wikimedia.org') return json({ query: { pages: [{ imageinfo: [{ extmetadata: { Artist: { value: 'Test Artist' }, LicenseShortName: { value: 'CC BY-SA 4.0' } }, descriptionurl: 'https://commons.wikimedia.org/wiki/File:x.jpg' }] }] } });
      if (url.pathname.startsWith('/api/rest_v1/page/summary/')) {
        const title = decodeURIComponent(url.pathname.split('/').pop()).replace(/_/g, ' ');
        const p = fakePage(title);
        return json({ title, pageid: p.pageid, extract: url.hostname.startsWith('fr.') ? EXTRACT(title) : `${title} ist ein sehr bekannter Artikel in einer anderen Sprache. Viele Leute kennen ihn aus dem Fernsehen, aus Büchern und aus der Schule, und er wird oft zitiert.`, description: p.description, thumbnail: p.thumbnail, originalimage: p.original, coordinates: { lat: 48.858, lon: 2.294 }, wikibase_item: p.pageprops.wikibase_item, type: 'standard' });
      }
      if (url.pathname === '/w/api.php' && realParse && url.searchParams.get('action') === 'parse') return json(fx('parse-tour-eiffel.json'));
      if (url.pathname === '/w/api.php') return json(handleActionApi(url));
      if (url.hostname === 'unpkg.com') return route.fulfill({ status: 200, contentType: url.pathname.endsWith('.css') ? 'text/css' : 'application/javascript', body: url.pathname.endsWith('.css') ? '' : 'window.L={map(){return{setView(){return this},on(){},remove(){},fitBounds(){},invalidateSize(){}}},tileLayer(){return{addTo(){}}},marker(){return{addTo(){return this},bindPopup(){return this},openPopup(){return this}}},polyline(){return{addTo(){return this}}},latLngBounds(){return{}},icon(){return{}},divIcon(){return{}}};' });
      return route.fulfill({ status: 404, body: 'mock: ' + url.href });
    } catch (e) {
      console.error('mock error', e);
      return route.fulfill({ status: 500, body: String(e) });
    }
  });
}
module.exports = { install, KNOWN };
