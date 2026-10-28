/* WikiJeux – utilitaires partagés. Namespace global WJ (scripts classiques, pas de bundler). */
window.WJ = window.WJ || {};

WJ.util = (() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /** Crée un élément : el('div', {class:'x', onclick: fn, html: '...'}, [children]) */
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    if (!Array.isArray(children)) children = [children];
    for (const c of children) {
      if (c === null || c === undefined || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** PRNG déterministe (mulberry32) à partir d'une graine texte. */
  function rng(seed) {
    let h = 1779033703 ^ String(seed).length;
    for (let i = 0; i < String(seed).length; i++) {
      h = Math.imul(h ^ String(seed).charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    let a = h >>> 0;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, random = Math.random) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const pick = (arr, random = Math.random) => arr[Math.floor(random() * arr.length)];
  const sample = (arr, n, random = Math.random) => shuffle(arr, random).slice(0, n);

  /** Clé du jour en UTC (AAAA-MM-JJ), optionnellement décalée de N jours. */
  function dayKey(offsetDays = 0) {
    const d = new Date(Date.now() + offsetDays * 86400000);
    return d.toISOString().slice(0, 10);
  }

  const fmtInt = (n) => new Intl.NumberFormat('fr-FR').format(Math.round(n));
  const fmtDateFr = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  /** Année lisible (gère av. J.-C.). */
  function fmtYear(y) {
    if (y === null || y === undefined || isNaN(y)) return '?';
    return y < 0 ? `${-y} av. J.-C.` : String(y);
  }

  /** Lit l'année d'une date Wikidata ("+1769-08-15T00:00:00Z" ou "-0044-03-15T..."). */
  function yearFromWikidata(value) {
    if (!value) return null;
    const m = /^([+-]?)(\d{1,16})-/.exec(value);
    if (!m) return null;
    const y = parseInt(m[2], 10);
    return m[1] === '-' ? -y : y;
  }

  /** Distance en km entre deux points GPS (Haversine). */
  function distanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371, toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  const wikiUrl = (title, lang = 'fr') => `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(title).replace(/ /g, '_'))}`;

  /** Charge un script externe une seule fois. */
  const loadedScripts = {};
  function loadScript(src) {
    if (!loadedScripts[src]) {
      loadedScripts[src] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src; s.async = true;
        s.onload = resolve; s.onerror = () => reject(new Error('Impossible de charger ' + src));
        document.head.append(s);
      });
    }
    return loadedScripts[src];
  }
  function loadStyle(href) {
    if (!document.querySelector(`link[href="${href}"]`)) {
      document.head.append(el('link', { rel: 'stylesheet', href }));
    }
  }

  return { $, $$, el, escapeHtml, rng, shuffle, pick, sample, dayKey, fmtInt, fmtDateFr, fmtYear, yearFromWikidata, clamp, sleep, debounce, distanceKm, wikiUrl, loadScript, loadStyle };
})();
