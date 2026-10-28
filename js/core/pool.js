/* Viviers d'articles : populaires (pages les plus lues) et thématiques (par modèle d'infobox). */
WJ.pool = (() => {
  const { shuffle, dayKey, rng } = WJ.util;

  const THEMES = [
    { id: 'populaire', name: 'Populaire', icon: '🔥', desc: 'Les articles les plus lus ces derniers jours' },
    { id: 'cinema', name: 'Cinéma', icon: '🎬', q: 'hastemplate:"Infobox Cinéma (film)"', desc: 'Films célèbres' },
    { id: 'personnalites', name: 'Personnalités', icon: '👤', q: 'hastemplate:"Infobox Biographie2"', desc: 'Figures historiques et célébrités' },
    { id: 'animaux', name: 'Animaux', icon: '🐾', q: 'hastemplate:"Taxobox début" insource:"animal"', desc: 'Espèces animales' },
    { id: 'villes', name: 'Villes du monde', icon: '🏙️', q: 'hastemplate:"Infobox Ville"', desc: 'Grandes villes de la planète', geo: true },
    { id: 'france', name: 'Communes de France', icon: '🇫🇷', q: 'hastemplate:"Infobox Commune de France"', desc: 'Villes et villages français', geo: true },
    { id: 'pays', name: 'Pays', icon: '🌍', q: 'hastemplate:"Infobox Pays"', desc: 'États du monde', geo: true },
    { id: 'monuments', name: 'Monuments', icon: '🏛️', q: 'hastemplate:"Infobox Monument"', desc: 'Édifices remarquables', geo: true },
    { id: 'jeux', name: 'Jeux vidéo', icon: '🎮', q: 'hastemplate:"Infobox Jeu vidéo"', desc: 'Jeux marquants' },
    { id: 'musique', name: 'Musique', icon: '🎵', q: 'hastemplate:"Infobox Musique (artiste)"', desc: 'Artistes et groupes' },
    { id: 'peinture', name: 'Peinture', icon: '🖼️', q: 'hastemplate:"Infobox Art"', desc: 'Œuvres d’art' },
    { id: 'series', name: 'Séries TV', icon: '📺', q: 'hastemplate:"Infobox Série télévisée"', desc: 'Séries télévisées' },
  ];
  const theme = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

  /** Titres à écarter du vivier populaire (pages de service, actualité brute, listes). */
  const BAD_TITLE = /^(Wikipédia|Spécial|Portail|Fichier|Aide|Catégorie|Modèle|Discussion|Utilisateur|Projet|Référence|Module|MediaWiki)\s*:|^Liste |^Listes |^Saison \d|^Championnat|^Coupe |^Ligue |^Tournoi|^Élection|^Sondage|^Classement|^Calendrier|^Décès en|^Mort[s]? en|^Chronologie|^Page principale|^Accueil|^\d{1,4}$|^\d{1,4} (en|av)|^Cookie \(informatique\)|^Résultats |^Qualification|^Phase |^Groupe [A-H]$|^Épisodes? |^Attentat|^Massacre|^Pornograph|^Sexe|^Sexualité|^Masturbation|^Pénis|^Vagin|^Fellation|^Sodomie|^Anus|^Orgasme|^Vulve|^Sein$|^Position sexuelle|^Rapport sexuel|^Prostitution|^Film pornographique|^Actrice pornographique|^Acteur pornographique/i;
  const CURRENT_EVENT = /\b(20[2-9]\d)\b/;

  /** Fichiers d'image qui trahissent la réponse ou n'ont aucun intérêt visuel. */
  const BAD_IMAGE = /\.(svg|gif)(\?|$)|logo|carte|map\b|_map|flag|drapeau|blason|coat_of_arms|armoiries|locat|location|diagram|schéma|schema|plan_|signature|icon|embl[eè]m|seal|chart|wordmark|banner|bandeau|affiche|poster|cover|couverture|jaquette|pochette|screenshot|capture|title|titre|text/i;

  /** Transforme une page de l'API action en entrée de vivier. */
  function toEntry(p, extra = {}) {
    if (!p || p.missing || p.invalid) return null;
    const thumb = p.thumbnail?.source || null;
    const original = p.original?.source || null;
    return {
      title: p.title, pageid: p.pageid, description: p.description || '',
      image: thumb || original, original, imageName: p.pageimage || null, imageWidth: p.thumbnail?.width, imageHeight: p.thumbnail?.height,
      qid: p.pageprops?.wikibase_item || null, disambiguation: !!p.pageprops?.disambiguation,
      coords: p.coordinates?.[0] ? { lat: p.coordinates[0].lat, lon: p.coordinates[0].lon } : null,
      ...extra,
    };
  }

  const titleOk = (t, strict) => !BAD_TITLE.test(t) && !(strict && CURRENT_EVENT.test(t)) && !/\(homonymie\)/i.test(t);
  const imageOk = (e) => !!e.image && !BAD_IMAGE.test(e.imageName || e.image) && !(e.imageWidth && e.imageHeight && e.imageWidth < 120);
  /** Filtre selon les besoins du jeu : need = {image, coords, qid}. */
  function fits(e, need = {}) {
    if (!e || e.disambiguation) return false;
    if (need.image && !imageOk(e)) return false;
    if (need.coords && !e.coords) return false;
    if (need.qid && !e.qid) return false;
    return true;
  }

  /** Jour de référence pour les pages vues (les données de la veille arrivent avec retard). */
  const viewsDay = (offset = -2) => dayKey(offset);

  /** Pages les plus lues d'un jour, filtrées (titres de service, actualité), avec le nombre de vues. */
  async function popularTitles(day = viewsDay(), { strict = true, max = 400 } = {}) {
    return WJ.store.cached(`top.${day}.${strict ? 's' : 'l'}`, 36e5 * 24 * 3, async () => {
      let list = null;
      // 1. API metrics du jour demandé ; 2. la veille ; 3. list=mostviewed sur Wikipédia (si l'API metrics est bloquée)
      try { list = await WJ.api.topViews(day); } catch (e) { /* on tente la suite */ }
      if (!list) { try { list = await WJ.api.topViews(dayKey(-3)); } catch (e) { /* idem */ } }
      if (!list) list = await WJ.api.mostViewed();
      return list.filter((a) => titleOk(a.title, strict)).slice(0, max);
    });
  }

  /** Enrichit des titres populaires avec images, description, Wikidata, coordonnées (par lots de 50). */
  async function popularEntries(day = viewsDay(), { strict = true, limit = 150 } = {}) {
    return WJ.store.cached(`pop.${day}.${strict ? 's' : 'l'}.${limit}`, 36e5 * 12, async () => {
      const titles = await popularTitles(day, { strict });
      const views = Object.fromEntries(titles.map((t) => [t.title, t.views]));
      const pages = await WJ.api.pages(titles.slice(0, limit).map((t) => t.title), WJ.api.PAGE_PROPS);
      return pages.map((p) => toEntry(p, { views: views[p.title] || 0 })).filter(Boolean);
    });
  }

  /** Entrées d'un thème, tirées parmi les articles les plus liés (donc connus), avec un décalage aléatoire. */
  async function themedEntries(th, { random = Math.random, limit = 50, maxOffset = 250 } = {}) {
    const offset = Math.floor(random() * maxOffset);
    const pages = await WJ.api.searchPages(th.q, { sort: 'incoming_links_desc', offset, limit, props: WJ.api.PAGE_PROPS });
    return pages.sort((a, b) => (a.index || 0) - (b.index || 0)).map((p) => toEntry(p, { theme: th.id })).filter(Boolean);
  }

  /**
   * Fournit `count` articles jouables pour un thème et un besoin donné.
   * Pour le défi du jour, `seed` rend le tirage identique pour tout le monde.
   */
  async function draw(themeId, { count = 10, need = { image: true }, seed = null, exclude = new Set() } = {}) {
    const th = theme(themeId);
    const random = seed ? rng(seed) : Math.random;
    let entries = [];
    if (th.id === 'populaire') {
      entries = await popularEntries(viewsDay(), { strict: true, limit: 200 });
    } else {
      entries = await themedEntries(th, { random });
      if (entries.filter((e) => fits(e, need)).length < count) {
        entries = entries.concat(await themedEntries(th, { random, maxOffset: 100 }));
      }
    }
    const seen = new Set();
    const ok = entries.filter((e) => fits(e, need) && !exclude.has(e.title) && !seen.has(e.title) && seen.add(e.title));
    const picked = shuffle(ok, random).slice(0, count);
    if (!picked.length) throw new Error('Aucun article jouable trouvé pour ce thème. Réessaie dans un instant.');
    return picked;
  }

  /** Tirage du défi du jour : mêmes articles pour tous, basés sur les pages lues il y a deux jours. */
  const dailySeed = (gameId) => `${gameId}:${dayKey(0)}`;
  const drawDaily = (gameId, opts = {}) => draw('populaire', { ...opts, seed: dailySeed(gameId) });

  return { THEMES, theme, draw, drawDaily, dailySeed, popularTitles, popularEntries, themedEntries, toEntry, fits, imageOk, titleOk, viewsDay, BAD_IMAGE };
})();
