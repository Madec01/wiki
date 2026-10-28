/* Où dans le monde : place le lieu de l'article sur la carte. */
(() => {
  const { el, distanceKm, fmtInt } = WJ.util;
  const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  const ROUNDS = 8;

  function score(d) {
    if (d <= 25) return 100;
    return Math.max(0, Math.round(100 * (1 - Math.log10(d / 25) / Math.log10(400))));
  }

  async function playRound({ entry, content }) {
    WJ.util.loadStyle(LEAFLET_CSS);
    await WJ.util.loadScript(LEAFLET_JS);
    const title = entry.title;
    const desc = entry.description ? WJ.answer.hideTitleWords(entry.description, title) : '';
    const mapEl = el('div', { id: 'map' });
    const result = el('div');
    const validate = WJ.ui.button('Valider ma position', () => decide(), 'btn btn-primary btn-lg', { disabled: true });
    content.append(
      el('div', { class: 'image-frame', style: { maxHeight: '32vh' } }, [WJ.ui.image(entry.image, 'Lieu mystère')]),
      desc ? el('p', { class: 'muted', style: { textAlign: 'center' }, text: desc }) : null,
      el('p', { class: 'muted', style: { textAlign: 'center' }, text: 'Clique sur la carte à l’endroit où se trouve ce lieu.' }),
      mapEl, el('div', { class: 'row center' }, [validate]), result,
    );
    const map = L.map(mapEl, { worldCopyJump: true }).setView([30, 10], 2);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
    let guess = null, marker = null, finished = false;
    const place = (lat, lon) => {
      if (finished) return;
      guess = { lat, lon };
      if (marker) marker.remove(); 
      marker = L.marker([lat, lon]).addTo(map);
      validate.disabled = false;
    };
    map.on('click', (e) => place(e.latlng.lat, e.latlng.lng));
    WJ.debugMonde = { place };
    let resolveRound; const done = new Promise((r) => { resolveRound = r; });
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
      result.append(el('div', { class: 'reveal ' + (pts >= 60 ? 'ok' : pts > 0 ? '' : 'ko') }, [
        el('h3', { text: title }), entry.description ? el('p', { class: 'muted', text: entry.description }) : null,
        el('p', { class: 'pts', text: `${d < 1 ? 'moins d’un km' : fmtInt(d) + ' km'} · +${pts} pts` }),
        WJ.ui.articleFooter(entry),
      ]));
      WJ.ui.waitNext(result).then(() => { try { map.remove(); } catch (e) { /* ignore */ } resolveRound({ ok: pts >= 40, points: pts, title, emoji: pts >= 80 ? '🟩' : pts >= 40 ? '🟨' : '🟥', label: `${title} (${fmtInt(d)} km)` }); });
    }
    return done;
  }

  WJ.standardGame({
    id: 'monde', name: 'Où dans le monde ?', icon: '🗺️', group: 'explorer',
    desc: 'Une photo d’un lieu tiré de Wikipédia : plante ton épingle sur la carte le plus près possible.',
    rules: ['100 pts à moins de 25 km, 0 au-delà de 10 000 km, dégressif entre les deux.', `${ROUNDS} lieux par partie. Carte OpenStreetMap, coordonnées des articles.`],
    themes: true, need: { image: true, coords: true }, rounds: ROUNDS, playRound,
  });
})();
