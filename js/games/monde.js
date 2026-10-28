/* Où dans le monde : retrouve le pays du lieu (ou place-le sur la carte en Difficile). */
(() => {
  const { el, distanceKm, fmtInt, shuffle, pick } = WJ.util;
  const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  const ROUNDS = 8, OPTIONS = 6;
  const COUNTRIES = {
    Europe: ['France', 'Allemagne', 'Italie', 'Espagne', 'Portugal', 'Royaume-Uni', 'Irlande', 'Belgique', 'Pays-Bas', 'Suisse', 'Autriche', 'Pologne', 'Suède', 'Norvège', 'Danemark', 'Finlande', 'Grèce', 'Turquie', 'Russie', 'Ukraine', 'Roumanie', 'Hongrie', 'Tchéquie', 'Croatie', 'Islande'],
    Asie: ['Chine', 'Japon', 'Inde', 'Corée du Sud', 'Thaïlande', 'Viêt Nam', 'Indonésie', 'Malaisie', 'Philippines', 'Iran', 'Irak', 'Arabie saoudite', 'Israël', 'Émirats arabes unis', 'Pakistan', 'Népal', 'Cambodge', 'Mongolie', 'Kazakhstan', 'Sri Lanka'],
    Afrique: ['Maroc', 'Algérie', 'Tunisie', 'Égypte', 'Sénégal', 'Côte d’Ivoire', 'Nigeria', 'Kenya', 'Tanzanie', 'Afrique du Sud', 'Éthiopie', 'Madagascar', 'Cameroun', 'Ghana', 'Mali', 'Namibie'],
    'Amérique du Nord': ['États-Unis', 'Canada', 'Mexique', 'Cuba', 'Guatemala', 'Costa Rica', 'Panama', 'Jamaïque', 'Haïti'],
    'Amérique du Sud': ['Brésil', 'Argentine', 'Chili', 'Pérou', 'Colombie', 'Venezuela', 'Bolivie', 'Équateur', 'Uruguay', 'Paraguay'],
    Océanie: ['Australie', 'Nouvelle-Zélande', 'Fidji', 'Papouasie-Nouvelle-Guinée'],
  };
  const continentOf = (name) => Object.keys(COUNTRIES).find((k) => COUNTRIES[k].includes(name)) || null;

  function score(d) {
    if (d <= 25) return 100;
    return Math.max(0, Math.round(100 * (1 - Math.log10(d / 25) / Math.log10(400))));
  }

  /** Pays et continent de chaque lieu via Wikidata (P17, P30). */
  async function prepare(entries, { difficulty } = {}) {
    if (difficulty === 'difficile') return entries;
    const qids = entries.filter((e) => e.qid).map((e) => e.qid);
    const rows = qids.length ? await WJ.api.sparql(`SELECT ?item ?countryLabel ?continentLabel WHERE { VALUES ?item { ${qids.map((q) => 'wd:' + q).join(' ')} } ?item wdt:P17 ?country . OPTIONAL { ?country wdt:P30 ?continent } SERVICE wikibase:label { bd:serviceParam wikibase:language "fr" } }`) : [];
    const byQid = {};
    for (const r of rows) { const q = WJ.api.qidFromUri(r.item); if (!byQid[q] && r.countryLabel && !/^Q\d+$/.test(r.countryLabel)) byQid[q] = { country: r.countryLabel, continent: r.continentLabel || null }; }
    const out = entries.filter((e) => byQid[e.qid]).map((e) => ({ ...e, ...byQid[e.qid] }));
    if (out.length < 3) throw new Error('Pays introuvables pour ces lieux, réessaie.');
    return out;
  }

  async function mapAfter(mapEl, entry, guess) {
    try {
      WJ.util.loadStyle(LEAFLET_CSS);
      await WJ.util.loadScript(LEAFLET_JS);
      const map = L.map(mapEl, { worldCopyJump: true }).setView([entry.coords.lat, entry.coords.lon], guess ? 2 : 4);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
      L.marker([entry.coords.lat, entry.coords.lon]).addTo(map).bindPopup(entry.title).openPopup();
      if (guess) {
        L.polyline([[guess.lat, guess.lon], [entry.coords.lat, entry.coords.lon]], { color: '#b8860b', dashArray: '6 6' }).addTo(map);
        map.fitBounds(L.latLngBounds([[guess.lat, guess.lon], [entry.coords.lat, entry.coords.lon]]), { padding: [30, 30] });
      }
      setTimeout(() => { try { map.invalidateSize(); } catch (e) { /* ignore */ } }, 400);
      return map;
    } catch (e) { return null; }
  }

  async function playRound({ entry, content, difficulty = 'normal' }) {
    const title = entry.title;
    const desc = entry.description ? WJ.answer.hideTitleWords(entry.description, title) : '';
    const result = el('div');
    const mapEl = el('div', { id: 'map' });
    let resolveRound; const done = new Promise((r) => { resolveRound = r; });
    let finished = false, map = null;
    const end = (ok, pts, extra) => {
      result.append(el('div', { class: 'reveal ' + (pts >= 60 ? 'ok' : pts > 0 ? '' : 'ko') }, [
        el('h3', { text: title }), entry.description ? el('p', { class: 'muted', text: entry.description }) : null,
        el('p', { class: 'pts', text: `${extra} · +${pts} pts` }),
        WJ.ui.articleFooter(entry),
      ]));
      WJ.ui.waitNext(result).then(() => { try { if (map) map.remove(); } catch (e) { /* ignore */ } resolveRound({ ok, points: pts, title, emoji: pts >= 80 ? '🟩' : pts >= 40 ? '🟨' : '🟥', label: `${title} (${extra})` }); });
    };
    content.append(
      el('div', { class: 'image-frame', style: { maxHeight: '36vh' } }, [WJ.ui.image(entry.image, 'Lieu mystère')]),
      desc ? el('p', { class: 'muted', style: { textAlign: 'center' }, text: desc }) : null,
    );

    if (difficulty !== 'difficile') {
      // --- choix du pays
      const sameContinent = (entry.continent && COUNTRIES[entry.continent]) || (continentOf(entry.country) && COUNTRIES[continentOf(entry.country)]) || [];
      const others = Object.values(COUNTRIES).flat().filter((c) => !sameContinent.includes(c));
      const distractors = shuffle(sameContinent.filter((c) => c !== entry.country)).slice(0, OPTIONS - 1);
      while (distractors.length < OPTIONS - 1) { const c = pick(others); if (c !== entry.country && !distractors.includes(c)) distractors.push(c); }
      const options = shuffle([entry.country, ...distractors]);
      let tries = 0;
      const box = el('div', { class: 'options' });
      options.forEach((c) => {
        const b = WJ.ui.button(c, () => choose(c, b), 'btn');
        box.append(b);
      });
      function choose(c, b) {
        if (finished) return;
        tries++;
        const ok = c === entry.country;
        if (!ok) { b.classList.add('wrong'); b.disabled = true; if (tries < 2) { WJ.ui.toast('Non, encore un essai.', 'ko', 1200); return; } }
        finished = true;
        [...box.children].forEach((x) => { x.disabled = true; if (x.textContent === entry.country) x.classList.add('right'); });
        const pts = ok ? (tries === 1 ? 100 : 40) : 0;
        content.append(mapEl);
        mapAfter(mapEl, entry, null).then((m) => { map = m; });
        end(ok, pts, ok ? `${entry.country}, trouvé en ${tries} essai${tries > 1 ? 's' : ''}` : `c’était ${entry.country}`);
      }
      WJ.debugMonde = { country: entry.country, choose: (c) => choose(c, [...box.children].find((x) => x.textContent === c)) };
      content.append(el('p', { class: 'muted', style: { textAlign: 'center' }, text: 'Dans quel pays se trouve ce lieu ?' }), box, result);
      return done;
    }

    // --- Difficile : placer sur la carte
    WJ.util.loadStyle(LEAFLET_CSS);
    await WJ.util.loadScript(LEAFLET_JS);
    const validate = WJ.ui.button('Valider ma position', () => decide(), 'btn btn-primary btn-lg', { disabled: true });
    content.append(el('p', { class: 'muted', style: { textAlign: 'center' }, text: 'Clique sur la carte à l’endroit où se trouve ce lieu.' }), mapEl, el('div', { class: 'row center' }, [validate]), result);
    map = L.map(mapEl, { worldCopyJump: true }).setView([30, 10], 2);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
    setTimeout(() => { try { map.invalidateSize(); } catch (e) { /* ignore */ } }, 500);
    let guess = null, marker = null;
    const place = (lat, lon) => {
      if (finished) return;
      guess = { lat, lon };
      if (marker) marker.remove();
      marker = L.marker([lat, lon]).addTo(map);
      validate.disabled = false;
    };
    map.on('click', (e) => place(e.latlng.lat, e.latlng.lng));
    WJ.debugMonde = { place };
    function decide() {
      if (finished || !guess) return; finished = true;
      validate.remove();
      const d = distanceKm(guess.lat, guess.lon, entry.coords.lat, entry.coords.lon);
      const pts = score(d);
      try {
        L.marker([entry.coords.lat, entry.coords.lon]).addTo(map).bindPopup(title).openPopup();
        L.polyline([[guess.lat, guess.lon], [entry.coords.lat, entry.coords.lon]], { color: '#b8860b', dashArray: '6 6' }).addTo(map);
        map.fitBounds(L.latLngBounds([[guess.lat, guess.lon], [entry.coords.lat, entry.coords.lon]]), { padding: [30, 30] });
      } catch (e) { /* carte simulée en test */ }
      end(pts >= 40, pts, d < 1 ? 'moins d’un km' : fmtInt(d) + ' km');
    }
    return done;
  }

  WJ.standardGame({
    id: 'monde', name: 'Où dans le monde ?', icon: '🗺️', group: 'explorer',
    desc: 'Une photo d’un lieu tiré de Wikipédia : dans quel pays est-ce ? En Difficile, plante ton épingle sur la carte.',
    rules: ['Six pays proposés, souvent du même continent : 100 pts du premier coup, 40 au second essai.', 'Difficile : clique sur la carte, 100 pts à moins de 25 km, 0 au-delà de 10 000 km.', `${ROUNDS} lieux par partie. Pays d’après Wikidata, carte OpenStreetMap.`],
    themes: true, need: { image: true, coords: true, qid: true }, rounds: ROUNDS, prepare, playRound,
  });
})();
