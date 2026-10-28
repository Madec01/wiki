/* Stockage local : scores, historique, réglages, cache avec durée de vie. */
WJ.store = (() => {
  const PREFIX = 'wj.';
  let memory = {}; // secours si localStorage est indisponible (navigation privée, etc.)

  function get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      return key in memory ? memory[key] : fallback;
    }
  }
  function set(key, value) {
    memory[key] = value;
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) { /* quota ou privé : on garde en mémoire */ }
  }
  function remove(key) {
    delete memory[key];
    try { localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ }
  }

  /** Cache JSON avec TTL en millisecondes. fn est appelé seulement si le cache est absent ou périmé. */
  async function cached(key, ttlMs, fn) {
    const hit = get('cache.' + key);
    if (hit && hit.exp > Date.now() && hit.v !== undefined) return hit.v;
    const v = await fn();
    set('cache.' + key, { exp: Date.now() + ttlMs, v });
    return v;
  }
  function clearCache() {
    try {
      Object.keys(localStorage).filter((k) => k.startsWith(PREFIX + 'cache.')).forEach((k) => localStorage.removeItem(k));
    } catch (e) { /* ignore */ }
    memory = {};
  }

  const settings = () => get('settings', {});
  const setSetting = (k, v) => set('settings', { ...settings(), [k]: v });

  /** Meilleur score par jeu (et par thème). */
  const bestKey = (game, variant = 'default') => `best.${game}.${variant}`;
  const best = (game, variant) => get(bestKey(game, variant), null);
  function recordScore(game, variant, score, extra = {}) {
    const prev = best(game, variant);
    const isBest = prev === null || score > prev.score;
    if (isBest) set(bestKey(game, variant), { score, date: new Date().toISOString(), ...extra });
    const hist = get('history', []);
    hist.unshift({ game, variant, score, date: new Date().toISOString(), ...extra });
    set('history', hist.slice(0, 100));
    return isBest;
  }
  const history = () => get('history', []);

  /** Défi du jour : un résultat par jeu et par jour. */
  const dailyKey = (game, day) => `daily.${game}.${day}`;
  const dailyResult = (game, day) => get(dailyKey(game, day), null);
  const saveDaily = (game, day, result) => set(dailyKey(game, day), result);

  /** Statistiques globales simples. */
  function bumpStat(name, by = 1) {
    const s = get('stats', {});
    s[name] = (s[name] || 0) + by;
    set('stats', s);
  }
  const stats = () => get('stats', {});

  return { get, set, remove, cached, clearCache, settings, setSetting, best, recordScore, history, dailyResult, saveDaily, bumpStat, stats };
})();
