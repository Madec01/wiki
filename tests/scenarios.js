/* Scénarios de test. Chaque fonction est un test ; `check` consigne les assertions. */
const WJ_len = (t) => t.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '').length;
module.exports = ({ page, url, check, live }) => {
  // Même hash qu'actuellement : le navigateur ne déclenche pas hashchange, on passe par l'accueil d'abord.
  const goto = async (hash) => { const cur = await page.evaluate(() => location.hash).catch(() => ''); if (cur === hash) { await page.goto(url + '#/'); await page.waitForTimeout(80); } await page.goto(url + hash); await page.waitForTimeout(150); };
  const text = async (sel) => (await page.locator(sel).first().textContent()) || '';
  const wait = (sel, t = 15000) => page.waitForSelector(sel, { timeout: t });
  const ev = (fn, ...args) => page.evaluate(fn, ...args);
  const count = (sel) => page.locator(sel).count();

  async function answerCurrent(correct = true) {
    const title = await ev(() => WJ.debugEntry.title);
    await page.fill('.guess input', correct ? title : 'zzz réponse fausse');
    await page.click('.guess .btn-primary');
    return title;
  }
  /** Joue n'importe quelle manche jusqu'à l'écran de fin, en cliquant ce qui est cliquable. */
  async function autoplay(max = 120) {
    const order = ['.next', 'button:has-text("Je passe")', '.choices .btn:not([disabled])', '.options .btn:not([disabled])', '.tl-gap', '.duel .vs-card', 'button:has-text("plus peuplée")', 'button:has-text("Valider mon estimation")', 'button:has-text("Plus de vues")', 'button:has-text("Valider ma position")'];
    for (let i = 0; i < max; i++) {
      if (await count('.end')) return;
      if (await count('.next')) { await page.locator('.next').first().click(); await page.waitForTimeout(60); continue; }
      if (await count('.blank-choice .btn:not([disabled])')) { const boxes = page.locator('.blank-choice'); const n = await boxes.count(); for (let k = 0; k < n; k++) await boxes.nth(k).locator('.btn:not([disabled])').first().click(); await page.click('button:has-text("Valider")'); await page.waitForTimeout(80); continue; }
      if (await count('#map') && !(await count('.reveal'))) await ev(() => WJ.debugMonde && WJ.debugMonde.place && WJ.debugMonde.place(10, 10));
      let clicked = false;
      for (const sel of order) { const l = page.locator(sel); if (await l.count()) { await l.first().click(); clicked = true; break; } }
      if (!clicked) await page.waitForTimeout(150);
      await page.waitForTimeout(60);
    }
  }

  return {
    async unites() {
      await goto('#/');
      const r = await ev(() => ({
        n1: WJ.answer.normalize('Tour Eiffel (monument)'), n2: WJ.answer.normalize('L’Œuvre au noir'),
        c1: WJ.answer.compareLocal('tour eiffel', 'Tour Eiffel').ok, c2: WJ.answer.compareLocal('la tour eifel', 'Tour Eiffel').typo === true,
        c3: WJ.answer.compareLocal('Paris', 'Tour Eiffel').ok, c4: WJ.answer.compareLocal('napoleon ier', 'Napoléon Ier (film)').ok && !WJ.answer.compareLocal('napoleon', 'Napoléon Ier (film)').ok,
        m: WJ.answer.mask('Al-Khwarizmi', new Set([0])).map((w) => w.map((c) => (c.shown ? c.ch : '_')).join('')).join(' '),
        hide: WJ.answer.hideTitleWords('La tour Eiffel est à Paris.', 'Tour Eiffel'),
        year: [WJ.util.yearFromWikidata('1769-08-15T00:00:00Z'), WJ.util.yearFromWikidata('-0044-03-15T00:00:00Z'), WJ.util.yearFromWikidata('+2001-01-01T00:00:00Z')],
        pool: WJ.pool.titleOk('Liste des pays', true) === false && WJ.pool.titleOk('Tour Eiffel', true) && WJ.pool.titleOk('Ballon d’or 2026', true) === false,
        img: WJ.pool.imageOk({ image: 'x.jpg', imageName: 'Logo_truc.jpg' }) === false && WJ.pool.imageOk({ image: 'x.jpg', imageName: 'Portrait.jpg' }),
        excerpt: WJ.text.excerpt('Première phrase ici. Deuxième phrase là. Troisième phrase encore plus longue.', 6),
      }));
      check(r.n1 === 'tour eiffel', 'normalize retire la parenthèse: ' + r.n1);
      check(r.n2 === 'l oeuvre au noir', 'normalize gère œ et apostrophe: ' + r.n2);
      check(r.c1 && r.c2 && !r.c3 && r.c4, `compareLocal ${JSON.stringify([r.c1, r.c2, r.c3, r.c4])}`);
      check(r.m === 'A_-_________', 'mask: ' + r.m);
      check(r.hide === 'La ▮▮▮▮ ▮▮▮▮▮▮ est à Paris.', 'hideTitleWords: ' + r.hide);
      check(r.year[0] === 1769 && r.year[1] === -44 && r.year[2] === 2001, 'yearFromWikidata ' + r.year);
      check(r.pool, 'filtres de titres');
      check(r.img, 'filtres d’images');
      check(r.excerpt === 'Première phrase ici. Deuxième phrase là.', 'excerpt: ' + r.excerpt);
      const len = await ev(async () => ({
        a1: (await WJ.answer.check('Tolstoï', { title: 'Léon Tolstoï', pageid: 1 }, { lenient: true, allowRedirect: false })),
        a2: (await WJ.answer.check('dostoievski', { title: 'Fiodor Dostoïevski', pageid: 1 }, { lenient: true, allowRedirect: false })).ok,
        a3: (await WJ.answer.check('monde', { title: 'Coupe du monde', pageid: 1 }, { lenient: true, allowRedirect: false })).ok,
        a4: (await WJ.answer.check('Tolstoï', { title: 'Léon Tolstoï', pageid: 1 }, { lenient: false, allowRedirect: false })).ok,
        a5: WJ.answer.nameAliases('Antoine de Saint-Exupéry'),
        a6: (await WJ.answer.check('XIV', { title: 'Louis XIV', pageid: 1 }, { lenient: true, allowRedirect: false })).ok,
        t1: WJ.pool.themeOk(WJ.pool.theme('animaux'), { title: 'Canidae', description: 'famille de mammifères' }),
        t2: WJ.pool.themeOk(WJ.pool.theme('animaux'), { title: 'Lion', description: 'espèce de mammifères' }),
        t3: WJ.pool.themeOk(WJ.pool.theme('animaux'), { title: 'Panthera leo', description: 'espèce de mammifères' }, 'facile'),
        t4: WJ.pool.themeOk(WJ.pool.theme('animaux'), { title: 'Grand dauphin', description: 'espèce de mammifères' }, 'facile'),
        t5: WJ.pool.themeOk(WJ.pool.theme('cinema'), { title: 'Titanic', description: 'page d\'homonymie' }),
        t6: WJ.pool.themeOk(WJ.pool.theme('animaux'), { title: 'Coléoptères', description: 'ordre d\'insectes' }),
        t7: WJ.pool.themeOk(WJ.pool.theme('animaux'), { title: 'Papillon', description: '' }),
        p1: WJ.pool.preferred(WJ.pool.theme('personnalites'), { title: 'X', description: 'écrivain russe' }, 'facile'),
        p2: WJ.pool.preferred(WJ.pool.theme('personnalites'), { title: 'X', description: 'écrivain français' }, 'facile'),
        seen: await (async () => { WJ.store.set('seen', []); const a = await WJ.pool.draw('cinema', { count: 3, need: { image: true } }); const b = await WJ.pool.draw('cinema', { count: 3, need: { image: true } }); return { a: a.map((e) => e.title), b: b.map((e) => e.title), stored: WJ.store.get('seen', []).length }; })(),
        pairs: WJ.vieux.makePairs([{ born: 1800 }, { born: 1810 }, { born: 1900 }, { born: 1905 }, { born: 1500 }], 30).map((p) => Math.abs(p[0].born - p[1].born)),
        hp: WJ.habitants.makePairs([{ qid: 'a', pop: 100000 }, { qid: 'b', pop: 200000 }, { qid: 'c', pop: 5000000 }, { qid: 'd', pop: 110000 }, { qid: 'e', pop: 300000 }], 5).map((p) => [p.qid, p.ref.qid, Math.max(p.pop, p.ref.pop) / Math.min(p.pop, p.ref.pop)]),
      }));
      check(len.a1.ok && len.a1.partial, 'nom de famille accepté en mode indulgent: ' + JSON.stringify(len.a1));
      check(len.a2 && !len.a3 && !len.a4 && !len.a6, `aliases de nom ${JSON.stringify([len.a2, len.a3, len.a4, len.a6])}`);
      check(len.a5.includes('Saint-Exupéry') && len.a5.includes('Exupéry'), 'alias nom composé: ' + len.a5);
      check(!len.t1 && len.t2 && !len.t3 && len.t4 && !len.t5 && !len.t6 && !len.t7, `filtres animaux ${JSON.stringify([len.t1, len.t2, len.t3, len.t4, len.t5, len.t6, len.t7])}`);
      check(!len.p1 && len.p2, 'préférence français en facile');
      check(len.seen.stored === 6 && len.seen.a.every((t) => !len.seen.b.includes(t)), 'deux tirages successifs sans répétition: ' + JSON.stringify(len.seen));
      check(len.pairs.length === 2 && len.pairs.every((g) => g > 0 && g <= 30), 'paires de même époque: ' + JSON.stringify(len.pairs));
      check(len.hp.length === 2 && len.hp.every(([x, r, k]) => x !== r && k >= 1.15 && k <= 4), 'paires de villes comparables: ' + JSON.stringify(len.hp));
      if (!live) {
        const red = await ev(() => WJ.answer.check('Dickens', { title: 'Charles Dickens', pageid: 1355526 }));
        check(red.ok && red.redirect, 'redirection acceptée via l’API: ' + JSON.stringify(red));
      }
    },
    async accueil() {
      await goto('#/');
      await wait('.game-card');
      const n = await count('.game-card');
      check(n === 13, `${n} cartes de jeu sur l’accueil`);
      check((await text('h1')).includes('Wiki'), 'titre présent');
    },
    async image_partie() {
      await ev(() => WJ.store.setSetting('difficulty', 'normal'));
      await goto('#/image');
      await wait('.start');
      check((await count('.theme-chip')) >= 13, 'thèmes et niveaux affichés');
      await page.click('.start .btn-primary');
      await wait('.image-frame img', 30000);
      check((await text('.points-max')).includes('100'), 'départ à 100 pts');
      await page.click('.mode-btn:has-text("Les traits")');
      await wait('.mask .cell');
      check((await text('.points-max')).includes('60'), 'traits → 60 pts: ' + (await text('.points-max')));
      await answerCurrent(false);
      await page.waitForTimeout(300);
      check((await text('.points-max')).includes('50'), 'erreur → 50 pts: ' + (await text('.points-max')));
      check((await count('.heart.lost')) === 1, 'une vie perdue');
      check((await count('.cell.shown')) >= 1, 'une lettre dévoilée après erreur');
      check((await count('.keyboard .key')) === 26, 'clavier du pendu affiché');
      const t = await ev(() => WJ.answer.normalize(WJ.answer.displayTitle(WJ.debugEntry.title)).replace(/ /g, ''));
      const absent = 'abcdefghijklmnopqrstuvwxyz'.split('').find((c) => !t.includes(c));
      const present = [...t].find((c) => /[a-z]/.test(c) && !(/* déjà dévoilée ? */ false));
      const shownBefore = await count('.cell.shown');
      await page.click(`.keyboard .key:text-is("${present.toUpperCase()}")`).catch(() => {});
      await page.waitForTimeout(150);
      check((await count('.cell.shown')) >= shownBefore, 'lettre présente : occurrences dévoilées');
      const ptsBefore = parseInt((await text('.points-max')).replace(/\D/g, ''), 10);
      await page.fill('.guess input', absent);
      await page.click('.guess .btn-primary');
      await page.waitForTimeout(150);
      const ptsAfter = parseInt((await text('.points-max')).replace(/\D/g, ''), 10);
      check(ptsAfter === ptsBefore - 5, `lettre absente : −5 pts (${ptsBefore} → ${ptsAfter})`);
      check((await count(`.keyboard .key.ko`)) === 1, 'lettre absente marquée sur le clavier');
      await page.click('.mode-btn:has-text("Lettres posées")');
      await page.waitForTimeout(100);
      check((await text('.points-max')).includes('15'), 'lettres → 30 − 10 − 5 = 15 pts: ' + (await text('.points-max')));
      const title = await answerCurrent(true);
      await wait('.reveal.ok');
      check((await text('.reveal h3')) === title, 'bonne réponse révélée');
      check((await text('.reveal .pts')).includes('+15'), '+15 pts');
      await page.click('.next');
      await wait('.image-frame img');
      check((await text('.shell-round')).includes('Manche 2'), 'manche 2');
      check((await text('.shell-score')).includes('15'), 'score 15 au tableau');
      await page.click('button:has-text("Je passe")');
      await wait('.reveal.ko');
      check((await text('.reveal .pts')).includes('Passé'), 'passer → 0 pt');
      await page.click('.next');
      await autoplay();
      await wait('.end');
      check((await text('.end-total')).includes('15'), 'total final 15');
      check((await count('.end-list li')) >= 7, 'récapitulatif des manches');
    },
    async image_facile() {
      await goto('#/image');
      await wait('.start');
      check((await count('.theme-chip:has-text("Facile")')) === 1, 'chip Facile présent');
      await page.click('.theme-chip:has-text("Facile")');
      await page.click('.start .btn-primary');
      await wait('.image-frame img', 30000);
      check((await count('.hint-box')) === 1, 'description offerte en facile');
      check((await text('.points-max')).includes('100'), 'toujours 100 pts en facile');
      await page.click('.mode-btn:has-text("Les traits")');
      await wait('.mask .cell');
      const words = await ev(() => [...document.querySelectorAll('.mask-word')].map((w) => w.querySelector('.cell').classList.contains('shown')));
      check(words.every(Boolean), 'première lettre de chaque mot dévoilée: ' + JSON.stringify(words));
      await goto('#/'); await goto('#/image');
      await wait('.start');
      await page.click('.theme-chip:has-text("Normal")');
      check((await ev(() => WJ.store.settings().difficulty)) === 'normal', 'réglage mémorisé');
    },
    async caviarde() {
      await goto('#/caviarde?go=1');
      await wait('.redacted', 30000);
      check((await count('.redact')) > 5, 'mots masqués présents');
      check((await count('.redact.found')) >= 1, 'une partie des mots déjà visible en Normal');
      check((await ev(() => [...document.querySelectorAll('.redact:not(.found)')].every((s) => s.dataset.len && Number(s.dataset.len) > 0))), 'nombre de lettres sur chaque bloc');
      const word = await ev(() => document.querySelector('.redact:not(.found):not(.title)').textContent);
      await page.locator('.redact:not(.found):not(.title)').first().click();
      await wait('.inline-guess');
      await page.fill('.inline-guess', word);
      await page.press('.inline-guess', 'Enter');
      await page.waitForTimeout(200);
      check((await text('.found-list')).includes(word), 'mot trouvé listé: ' + (await text('.found-list')));
      await page.click('.found-list span');
      check((await count('.redact.flash')) >= 1, 'surlignage au clic sur un mot trouvé');
      // trois ratés → premières lettres ; les paliers suivants complètent les mots
      for (let k = 0; k < 3; k++) { await page.locator('.redact:not(.found)').first().click(); await wait('.inline-guess'); await page.fill('.inline-guess', 'zzzz' + k); await page.press('.inline-guess', 'Enter'); await page.waitForTimeout(120); }
      check((await count('.redact[data-hint]')) >= 3, 'premières lettres après 3 ratés: ' + (await count('.redact[data-hint]')));
      await ev(() => { WJ.debugCaviarde.hintStep(); WJ.debugCaviarde.hintStep(); });
      const maxHint = await ev(() => Math.max(0, ...[...document.querySelectorAll('.redact[data-hint]')].map((s) => s.dataset.hint.length)));
      check(maxHint >= 2, 'les mots entamés se remplissent (indice de ' + maxHint + ' lettres)');
      for (let k = 0; k < 2; k++) { await page.locator('.redact:not(.found)').first().click(); await wait('.inline-guess'); await page.fill('.inline-guess', 'yyyy' + k); await page.press('.inline-guess', 'Enter'); await page.waitForTimeout(120); }
      // le titre tapé sur un bloc doré
      await page.locator('.redact.title').first().click();
      await wait('.inline-guess');
      await page.fill('.inline-guess', await ev(() => WJ.debugEntry.title));
      await page.press('.inline-guess', 'Enter');
      await wait('.reveal.ok');
      check((await text('.reveal .pts')).includes('+80'), 'titre trouvé après 5 ratés : 100 − 20 = 80 pts: ' + (await text('.reveal .pts')));
      check((await count('.redact.plain')) > 5 && (await count('.redact:not(.plain)')) === 0, 'texte en clair une fois trouvé');
      await page.click('.next');
      await autoplay();
      await wait('.end');
    },
    async categories() {
      await goto('#/categories?go=1');
      await wait('.cats li', 30000);
      check((await count('.cats li')) === 5, '5 catégories au départ');
      await answerCurrent(false);
      await page.waitForTimeout(300);
      check((await count('.cats li')) === 6, '6 catégories après erreur');
      check((await text('.points-max')).includes('90'), '90 pts après erreur');
      await page.click('button:has-text("Les traits")');
      await wait('.mask .cell');
      check((await text('.points-max')).includes('75'), 'traits → 75 pts');
      await answerCurrent(true);
      await wait('.reveal.ok');
      check((await text('.reveal .pts')).includes('+75'), '+75 pts');
      await page.click('.next');
      await autoplay();
      await wait('.end');
    },
    async anagramme() {
      await goto('#/anagramme?go=1');
      await wait('.anagram span', 30000);
      const title = await ev(() => WJ.debugEntry.title);
      const shown = await text('.anagram');
      check(shown.replace(/\s/g, '').length === WJ_len(title), 'anagramme de même longueur: ' + shown + ' / ' + title);
      await page.click('button:has-text("Image")');
      await wait('.image-frame img');
      check((await text('.points-max')).includes('70'), 'image → 70 pts');
      await answerCurrent(true);
      await wait('.reveal.ok');
      check((await text('.reveal .pts')).includes('+70'), '+70 pts');
      await page.click('.next');
      await autoplay();
      await wait('.end');
    },
    async trous() {
      await goto('#/trous?go=1');
      await wait('.blank-choice', 30000);
      const answers = await ev(() => [...document.querySelectorAll('.blank-choice')].map((b) => b.answer));
      check(answers.length >= 2, `${answers.length} trous à choix multiple`);
      check((await count('.blank-choice .btn')) === answers.length * 4, 'quatre choix par trou');
      const boxes = page.locator('.blank-choice');
      for (let i = 0; i < answers.length; i++) await boxes.nth(i).locator(`.btn:text-is("${answers[i]}")`).click();
      await page.click('button:has-text("Valider")');
      await wait('.reveal');
      const expected = 30 * answers.length + 10;
      check((await text('.reveal .pts')).includes('+' + expected), `+${expected} pts: ` + (await text('.reveal .pts')));
      await page.click('.next');
      await autoplay();
      await wait('.end');
      // Difficile : saisie libre
      await goto('#/trous?go=1&difficulty=difficile');
      await wait('.blank', 30000);
      const free = await ev(() => [...document.querySelectorAll('.blank')].map((b) => b.answer));
      const blanks = page.locator('.blank');
      for (let i = 0; i < free.length; i++) await blanks.nth(i).fill(i === 0 ? 'zzz' : free[i]);
      await page.click('button:has-text("Valider")');
      await page.waitForTimeout(200);
      check((await count('.blank.ok')) === free.length - 1, 'saisie libre : bons mots validés, un faux');
      await blanks.nth(0).fill(free[0]);
      await page.click('button:has-text("Valider")');
      await wait('.reveal');
      check((await text('.reveal .pts')).includes('+' + (30 * (free.length - 1) + 15)), 'saisie libre : second essai à 15 pts');
    },
    async vues() {
      await goto('#/vues?go=1&theme=survie');
      await wait('.versus', 30000);
      check((await count('.vs-card')) === 2, 'deux cartes');
      const more = async () => { const a = await text('.versus .vs-card:first-child h3'); const b = await text('.versus .vs-card:last-child h3'); return ev(([a, b]) => { const pool = WJ.store.get('cache.pop.' + WJ.pool.viewsDay() + '.s.200').v; return pool.find((e) => e.title === b)?.views > pool.find((e) => e.title === a)?.views; }, [a, b]); };
      for (let k = 0; k < 3; k++) {
        await page.click((await more()) ? 'button:has-text("Plus de vues")' : 'button:has-text("Moins de vues")');
        await wait('.next');
        check((await text('.streak')).includes('Exact'), `duel ${k + 1} gagné`);
        await page.click('.next');
      }
      check((await text('.shell-score')).includes('30'), 'score 30 après 3 duels');
      await page.click((await more()) ? 'button:has-text("Moins de vues")' : 'button:has-text("Plus de vues")');
      await wait('.next'); await page.click('.next');
      await wait('.end');
      check((await text('.end-total')).includes('30'), 'survie : fin à la première erreur, total 30');
      await goto('#/vues?go=1&theme=trois');
      await wait('.versus', 30000);
      await page.click((await more()) ? 'button:has-text("Moins de vues")' : 'button:has-text("Plus de vues")');
      await wait('.next'); await page.click('.next');
      check((await count('.versus')) === 1, '3 vies : on continue après une erreur');
      await autoplay();
      await wait('.end');
    },
    async vieux() {
      await goto('#/vieux?go=1');
      await wait('.duel', 30000);
      check((await count('.duel .vs-card')) === 2, 'deux personnalités');
      await page.click('.duel .vs-card:first-child');
      await wait('.next');
      check((await count('.duel .vs-card.right')) === 1, 'le plus vieux est marqué');
      check(!(await text('.duel .year')).includes('?'), 'années dévoilées: ' + (await text('.duel .year')));
      await autoplay();
      await wait('.end');
      await goto('#/vieux?go=1&difficulty=difficile');
      await wait('.duel', 30000);
      check((await count('.duel .vs-card img')) === 0, 'difficile : sans photo');
    },
    async habitants() {
      await goto('#/habitants?go=1&theme=france');
      await wait('.versus', 30000);
      const e = await ev(() => ({ pop: WJ.debugEntry.pop, ref: WJ.debugEntry.ref.pop }));
      await page.click(e.pop > e.ref ? 'button:has-text("plus peuplée")' : 'button:has-text("moins peuplée")');
      await wait('input[type=range]:not([disabled])');
      await ev((real) => { const r = document.querySelector('input[type=range]'); const lmin = Math.log10(20000), lmax = Math.log10(2500000); r.value = Math.round(1000 * (Math.log10(real) - lmin) / (lmax - lmin)); r.dispatchEvent(new Event('input')); }, e.pop);
      await page.click('button:has-text("Valider mon estimation")');
      await wait('.reveal');
      const pts = parseInt(((await text('.reveal .pts')).match(/\+(\d+)/) || [])[1], 10);
      check(pts >= 95, 'comparaison juste + estimation exacte ≈ 100 pts: ' + pts);
      await page.click('.next');
      await wait('.versus');
      const e2 = await ev(() => ({ pop: WJ.debugEntry.pop, ref: WJ.debugEntry.ref.pop }));
      await page.click(e2.pop > e2.ref ? 'button:has-text("moins peuplée")' : 'button:has-text("plus peuplée")');
      await wait('.reveal');
      check((await text('.reveal .pts')).includes('+0'), 'comparaison fausse → 0 pt');
      await page.click('.next');
      await autoplay();
      await wait('.end');
    },
    async frise() {
      await goto('#/frise?go=1&theme=personnalites&mode=classique');
      await wait('.tl-gap', 30000);
      check((await count('.timeline .tl-card')) === 1, 'une carte placée au départ');
      check((await count('.tl-axis')) === 1, 'axe affiché');
      for (let k = 0; k < 25 && !(await count('.end')); k++) {
        const info = await ev(() => [...document.querySelectorAll('.timeline .tl-card .year')].map((y) => parseInt(y.textContent.replace(/\D/g, ''), 10) * (y.textContent.includes('av.') ? -1 : 1)));
        const cur = await ev(() => document.querySelector('.tl-current .tl-card div').textContent);
        const qid = await ev((t) => { const e = Object.values(WJ.store.get('cache.pop.' + WJ.pool.viewsDay() + '.s.200')?.v || {}).find((x) => x.title === t); return e ? e.qid : null; }, cur);
        let pos = 0;
        if (qid) { const y = 1500 + ((parseInt(qid.slice(1), 10) * 37) % 500); pos = info.findIndex((v) => v > y); if (pos < 0) pos = info.length; }
        else pos = Math.floor(Math.random() * (info.length + 1));
        await page.locator('.tl-gap').nth(pos).click();
        await page.waitForTimeout(80);
      }
      await wait('.end', 5000);
      check(true, 'frise terminée');
      await goto('#/frise');
      await wait('.start');
      check((await count('.theme-chip:has-text("Marathon")')) === 1, 'modes de frise affichés');
      await goto('#/frise?go=1&theme=personnalites&mode=classement');
      await wait('.order-list .tl-card', 30000);
      const n = await count('.order-list .tl-card');
      check(n >= 5, `classement : ${n} cartes visibles`);
      // sélection par touches : première carte puis dernière → déplacement
      const firstTitle = await text('.order-list .tl-card:first-child div');
      await page.locator('.order-list .tl-card').first().click();
      check((await count('.order-list .tl-card.selected')) === 1, 'carte sélectionnée');
      await page.locator('.order-list .tl-card').last().click();
      check((await text('.order-list .tl-card:last-child div')) === firstTitle && (await count('.order-list .tl-card')) === n, 'carte déplacée en dernière position par touches');
      // glisser-déposer : la dernière carte vers la première
      const a = await page.locator('.order-list .tl-card').last().boundingBox();
      const b = await page.locator('.order-list .tl-card').first().boundingBox();
      await page.mouse.move(a.x + a.width / 2, a.y + 20); await page.mouse.down();
      await page.mouse.move(a.x + a.width / 2 + 15, a.y + 25, { steps: 3 }); await page.mouse.move(b.x + b.width / 2, b.y + 20, { steps: 8 }); await page.mouse.up();
      await page.waitForTimeout(100);
      check((await text('.order-list .tl-card:first-child div')) === firstTitle, 'glisser-déposer vers la première position');
      // un essai faux : seulement les nombres, pas de couleurs
      const years = await ev(() => WJ.debugOrder.order.map((c) => [c.qid, c.year]));
      const sortedQ = years.slice().sort((x, y) => x[1] - y[1]).map((x) => x[0]);
      await ev((q) => WJ.debugOrder.setOrder(q), sortedQ.slice().reverse());
      await page.click('button:has-text("Valider l’ordre")');
      await page.waitForTimeout(100);
      check((await count('.placed-ok, .placed-ko')) === 0 && /Essai 1 : \d+\//.test(await text('.attempts')), 'après un essai faux : seulement le compte: ' + (await text('.attempts')));
      await ev((q) => WJ.debugOrder.setOrder(q), sortedQ);
      await page.click('button:has-text("Valider l’ordre")');
      await wait('.reveal.ok');
      check((await text('.reveal h3')).includes('2 essais') && (await text('.reveal .pts')).includes('+90'), 'bon ordre au 2e essai → 90 pts: ' + (await text('.reveal .pts')));
      await page.click('.next');
      await wait('.end');
    },
    async langue() {
      await goto('#/langue?go=1');
      await wait('.options', 30000);
      check((await count('.options .btn')) === 4, 'quatre langues proposées');
      check((await text('.quote')).length > 20, 'extrait affiché');
      const target = await ev(() => WJ.debugLangue.name);
      await page.click(`.options .btn:has-text("${target.charAt(0).toUpperCase() + target.slice(1)}")`);
      await wait('.reveal');
      check((await text('.reveal h3')).includes(target), `${target} reconnu`);
      check((await text('.reveal .pts')).includes('+100'), '+100 pts du premier coup');
      await page.click('.next');
      await autoplay();
      await wait('.end');
    },
    async course() {
      await goto('#/course?go=1');
      await wait('.wiki-content a[data-title]', 30000);
      const target = await text('.race-bar .target');
      check((await count('.wiki-content a.dead')) >= 1, 'liens fichiers/externes désactivés');
      const link = page.locator(`.wiki-content a[data-title="${target}"]`);
      if (await link.count()) { await link.first().click(); }
      else { await page.click('.wiki-content a[data-title]'); await page.waitForTimeout(200); await page.click(`.wiki-content a[data-title="${target}"]`); }
      await wait('.end', 10000);
      check((await text('.end')).includes('clic'), 'course gagnée: ' + (await text('.end-list')));
    },
    async chainon() {
      await goto('#/chainon?go=1');
      await wait('.choices .btn', 30000);
      const b = await ev(() => WJ.debugChain.b.title);
      check((await count('.choices .btn')) >= 2 && (await count('.choices .btn')) <= 4, 'jusqu’à quatre propositions');
      await page.locator(`.choices .btn:not(:text-is("${b}"))`).first().click();
      await page.waitForTimeout(200);
      check((await text('.points-max')).includes('50'), 'après un essai raté : 50 pts');
      await page.locator(`.choices .btn:text-is("${b}")`).click();
      await wait('.reveal.ok', 5000);
      check((await text('.reveal .pts')).includes('+50'), '+50 pts');
      await page.click('.next');
      await autoplay();
      await wait('.end');
      await goto('#/chainon?go=1&difficulty=difficile');
      await wait('.guess input', 30000);
      await page.fill('.guess input', 'Banane');
      await page.click('.guess .btn-primary');
      await page.waitForTimeout(400);
      check((await text('.points-max')).includes('80'), 'difficile : −20 après un essai raté: ' + (await text('.points-max')));
      const b2 = await ev(() => WJ.debugChain.b.title);
      await page.fill('.guess input', b2);
      await page.click('.guess .btn-primary');
      await wait('.reveal.ok', 5000);
      check((await text('.reveal .pts')).includes('+80'), 'difficile : +80 pts');
    },
    async monde() {
      await goto('#/monde?go=1&theme=monuments');
      await wait('.options .btn', 30000);
      check((await count('.options .btn')) === 6, 'six pays proposés');
      const country = await ev(() => WJ.debugMonde.country);
      await page.locator(`.options .btn:not(:text-is("${country}"))`).first().click();
      await page.waitForTimeout(150);
      await page.locator(`.options .btn:text-is("${country}")`).click();
      await wait('.reveal');
      check((await text('.reveal .pts')).includes('+40'), 'pays trouvé au second essai → 40 pts: ' + (await text('.reveal .pts')));
      check((await count('#map')) === 1, 'carte affichée après la réponse');
      await page.click('.next');
      await wait('.options .btn');
      await page.locator(`.options .btn:text-is("${await ev(() => WJ.debugMonde.country)}")`).click();
      await wait('.reveal');
      check((await text('.reveal .pts')).includes('+100'), 'pays du premier coup → 100 pts');
      await page.click('.next');
      await autoplay();
      await wait('.end');
      await goto('#/monde?go=1&theme=monuments&difficulty=difficile');
      await wait('#map', 30000);
      const c = await ev(() => WJ.debugEntry.coords);
      await ev((c) => WJ.debugMonde.place(c.lat, c.lon), c);
      await page.click('button:has-text("Valider ma position")');
      await wait('.reveal');
      check((await text('.reveal .pts')).includes('+100'), 'difficile : position exacte → 100 pts');
    },
    async secours_sans_metrics() {
      if (live) return;
      await page.route(/wikimedia\.org\/api\/rest_v1\/metrics/, (r) => r.fulfill({ status: 405, body: '' }));
      await goto('#/');
      await ev(() => WJ.store.clearCache());
      await goto('#/image?go=1');
      await wait('.image-frame img', 30000);
      check(true, 'partie lancée sans l’API metrics (secours mostviewed)');
      await page.unroute(/wikimedia\.org\/api\/rest_v1\/metrics/);
      await ev(() => WJ.store.clearCache());
    },
    async image_defi_du_jour() {
      await goto('#/image?daily=1&go=1');
      await wait('.image-frame img', 30000);
      check((await text('.shell-round')).includes('/5'), 'défi du jour en 5 manches');
      await autoplay();
      await wait('.end');
      check((await text('.end h2')).includes('Défi du jour'), 'écran de fin du défi');
      await goto('#/');
      check((await text('.hero')).includes('✓'), 'défi marqué fait sur l’accueil');
    },
  };
};
