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

  /** Niveaux : profondeur du tirage dans le classement par liens entrants, et taille du vivier populaire. */
  const DIFFICULTIES = [
    { id: 'facile', name: 'Facile', icon: '🙂', desc: 'Les sujets les plus connus, indice gratuit', offset: 40, popular: 60 },
    { id: 'normal', name: 'Normal', icon: '😎', desc: 'Sujets connus', offset: 250, popular: 200 },
    { id: 'difficile', name: 'Difficile', icon: '🔥', desc: 'Sujets plus pointus', offset: 700, popular: 400 },
  ];
  const difficulty = (id) => DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[1];

  /** Descriptions Wikidata des rangs taxonomiques : familles, genres, ordres… imprenables en jeu. */
  const TAXON_RANK = /^(famille|sous-famille|super-famille|genre|sous-genre|ordre|sous-ordre|infra-ordre|super-ordre|classe|sous-classe|infra-classe|tribu|sous-tribu|embranchement|sous-embranchement|clade|taxon|cohorte|règne|phylum|division|groupe d)/i;
  /** Titres latins : « Canidae », « Panthera leo »… quand frwiki n'a pas de nom vernaculaire. */
  const LATIN_SUFFIX = /(idae|inae|iformes|ptera|oidea|aceae|ales|phyta|mycota|ini|morpha|oidei|acea|ida)$/;
  const LATIN_BINOMIAL = /^[A-Z][a-z]+ [a-z]+(us|a|um|is|e|ii|i|ae|ensis|or|ens|ans|es|os|on|ix|ax|eo|io|ea|ia|ula|ulus|ella|ina|inus|ata|atus|osa|osus|aris|alis|icus|ica|icum|ius|ium|ops|ter|era)$/;

  /** Exclusions propres à un thème. */
  function themeOk(th, e, diff = 'normal') {
    const d = e.description || '';
    if (/^(page d'homonymie|liste |catégorie|redirection)/i.test(d)) return false;
    if (th.id === 'animaux') {
      if (TAXON_RANK.test(d) || LATIN_SUFFIX.test(e.title)) return false;
      if (diff === 'facile' && (LATIN_BINOMIAL.test(e.title) || !/espèce/i.test(d))) return false;
    }
    return true;
  }
  /** Préférence douce en mode facile : on prend d'abord ces entrées, puis les autres si besoin. */
  function preferred(th, e, diff) {
    if (diff !== 'facile') return true;
    if (th.id === 'personnalites') return /fran[çc]ais/i.test(e.description || '');
    if (th.id === 'animaux') return !/[A-Z][a-z]+ [a-z]+/.test(e.title);
    return true;
  }

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
  async function draw(themeId, { count = 10, need = { image: true }, seed = null, exclude = new Set(), difficulty: diffId = 'normal' } = {}) {
    const th = theme(themeId);
    const diff = difficulty(diffId);
    const random = seed ? rng(seed) : Math.random;
    const usable = (list) => list.filter((e) => fits(e, need) && themeOk(th, e, diff.id)).length;
    let entries = [];
    if (th.id === 'populaire') {
      entries = (await popularEntries(viewsDay(), { strict: true, limit: Math.max(200, diff.popular) })).slice().sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, diff.popular);
    } else {
      entries = await themedEntries(th, { random, maxOffset: diff.offset });
      for (let i = 0; i < 2 && usable(entries) < count * 2; i++) {
        entries = entries.concat(await themedEntries(th, { random, maxOffset: i === 0 ? diff.offset : Math.max(60, diff.offset * 2) }));
      }
    }
    const seen = new Set();
    const ok = entries.filter((e) => fits(e, need) && themeOk(th, e, diff.id) && !exclude.has(e.title) && !seen.has(e.title) && seen.add(e.title));
    const first = shuffle(ok.filter((e) => preferred(th, e, diff.id)), random);
    const rest = shuffle(ok.filter((e) => !preferred(th, e, diff.id)), random);
    const picked = first.concat(rest).slice(0, count);
    if (!picked.length) throw new Error('Aucun article jouable trouvé pour ce thème. Réessaie dans un instant.');
    return picked;
  }

  /** Tirage du défi du jour : mêmes articles pour tous, basés sur les pages lues il y a deux jours. */
  const dailySeed = (gameId) => `${gameId}:${dayKey(0)}`;
  const drawDaily = (gameId, opts = {}) => draw('populaire', { ...opts, seed: dailySeed(gameId) });

  return { THEMES, theme, DIFFICULTIES, difficulty, themeOk, preferred, draw, drawDaily, dailySeed, popularTitles, popularEntries, themedEntries, toEntry, fits, imageOk, titleOk, viewsDay, BAD_IMAGE };
})();
