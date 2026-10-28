/* Scénarios de test. Chaque fonction est un test ; `check` consigne les assertions. */
const WJ_len = (t) => t.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').length;
module.exports = ({ page, url, check, live }) => {
  const goto = async (hash) => { await page.goto(url + hash); await page.waitForTimeout(150); };
  const text = async (sel) => (await page.locator(sel).first().textContent()) || '';
  const wait = (sel, t = 15000) => page.waitForSelector(sel, { timeout: t });
  const ev = (fn, ...args) => page.evaluate(fn, ...args);

  async function answerCurrent(correct = true) {
    const title = await ev(() => WJ.debugEntry.title);
    await page.fill('.guess input', correct ? title : 'zzz réponse fausse');
    await page.click('.guess .btn-primary');
    return title;
  }
  async function finishRemainingRounds(passLabel = 'Je passe') {
    for (let i = 0; i < 20; i++) {
      if (await page.locator('.end').count()) return;
      const pass = page.locator(`button:has-text("${passLabel}")`);
      if (await pass.count()) await pass.first().click();
      const next = page.locator('.next');
      if (await next.count()) await next.first().click();
      await page.waitForTimeout(100);
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
      if (!live) {
        const red = await ev(() => WJ.answer.check('Dickens', { title: 'Charles Dickens', pageid: 1355526 }));
        check(red.ok && red.redirect, 'redirection acceptée via l’API: ' + JSON.stringify(red));
      }
    },
    async accueil() {
      await goto('#/');
      await wait('.game-card');
      const n = await page.locator('.game-card').count();
      check(n >= 1, `${n} carte(s) de jeu sur l’accueil`);
      check((await text('h1')).includes('Wiki'), 'titre présent');
    },
    async image_partie() {
      await goto('#/image');
      await wait('.start');
      check((await page.locator('.theme-chip').count()) >= 10, 'thèmes affichés');
      await page.click('.start .btn-primary');
      await wait('.image-frame img', 30000);
      check((await text('.points-max')).includes('100'), 'départ à 100 pts');
      await page.click('.mode-btn:has-text("Les traits")');
      await wait('.mask .cell');
      check((await text('.points-max')).includes('60'), 'traits → 60 pts: ' + (await text('.points-max')));
      await answerCurrent(false);
      await page.waitForTimeout(300);
      check((await text('.points-max')).includes('50'), 'erreur → 50 pts: ' + (await text('.points-max')));
      check((await page.locator('.heart.lost').count()) === 1, 'une vie perdue');
      check((await page.locator('.cell.shown').count()) >= 1, 'une lettre dévoilée après erreur');
      await page.click('.mode-btn:has-text("Lettres posées")');
      await page.waitForTimeout(100);
      check((await text('.points-max')).includes('20'), 'lettres → 20 pts: ' + (await text('.points-max')));
      const title = await answerCurrent(true);
      await wait('.reveal.ok');
      check((await text('.reveal h3')) === title, 'bonne réponse révélée');
      check((await text('.reveal .pts')).includes('+20'), '+20 pts');
      await page.click('.next');
      await wait('.image-frame img');
      check((await text('.shell-round')).includes('Manche 2'), 'manche 2');
      check((await text('.shell-score')).includes('20'), 'score 20 au tableau');
      await page.click('button:has-text("Je passe")');
      await wait('.reveal.ko');
      check((await text('.reveal .pts')).includes('Passé'), 'passer → 0 pt');
      await page.click('.next');
      await finishRemainingRounds();
      await wait('.end');
      check((await text('.end-total')).includes('20'), 'total final 20');
      check((await page.locator('.end-list li').count()) >= 7, 'récapitulatif des manches');
    },

    async caviarde() {
      await goto('#/caviarde?go=1');
      await wait('.redacted', 30000);
      check((await page.locator('.redact').count()) > 5, 'mots masqués présents');
      await page.fill('.guess input', 'sujet');
      await page.click('.guess .btn-primary');
      await page.waitForTimeout(200);
      check((await text('.found-list')).includes('sujet'), 'mot trouvé listé: ' + (await text('.found-list')));
      check((await page.locator('.redact.found').count()) >= 1, 'occurrences dévoilées');
      await answerCurrent(true);
      await wait('.reveal.ok');
      check((await text('.reveal .pts')).includes('+96'), 'titre trouvé après 1 essai → 96 pts: ' + (await text('.reveal .pts')));
      await page.click('.next');
      await finishRemainingRounds();
      await wait('.end');
      check((await text('.end-total')).includes('96'), 'total 96');
    },
    async categories() {
      await goto('#/categories?go=1');
      await wait('.cats li', 30000);
      check((await page.locator('.cats li').count()) === 3, '3 catégories au départ');
      await answerCurrent(false);
      await page.waitForTimeout(300);
      check((await page.locator('.cats li').count()) === 4, '4 catégories après erreur');
      check((await text('.points-max')).includes('85'), '85 pts après erreur');
      await answerCurrent(true);
      await wait('.reveal.ok');
      check((await text('.reveal .pts')).includes('+85'), '+85 pts');
      await page.click('.next');
      await finishRemainingRounds();
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
      await finishRemainingRounds();
      await wait('.end');
    },
    async trous() {
      await goto('#/trous?go=1');
      await wait('.blank', 30000);
      const answers = await ev(() => [...document.querySelectorAll('.blank')].map((b) => b.answer));
      check(answers.length >= 2, `${answers.length} trous`);
      const blanks = page.locator('.blank');
      for (let i = 0; i < answers.length; i++) await blanks.nth(i).fill(i === 0 ? 'zzz' : answers[i]);
      await page.click('button:has-text("Valider")');
      await page.waitForTimeout(200);
      check((await page.locator('.blank.ok').count()) === answers.length - 1, 'bons mots validés, un faux');
      await blanks.nth(0).fill(answers[0]);
      await page.click('button:has-text("Valider")');
      await wait('.reveal');
      const expected = 30 * (answers.length - 1) + 15;
      check((await text('.reveal .pts')).includes('+' + expected), `+${expected} pts: ` + (await text('.reveal .pts')));
      await page.click('.next');
      await finishRemainingRounds();
      await wait('.end');
    },

    async vues() {
      await goto('#/vues?go=1');
      await wait('.versus', 30000);
      check((await page.locator('.vs-card').count()) === 2, 'deux cartes');
      const views = await ev(() => { const l = WJ.debugEntry; return null; }).catch(() => null);
      // Joue en lisant les vues réelles depuis la carte de gauche et le vivier simulé
      for (let k = 0; k < 3; k++) {
        const leftTitle = await text('.versus .vs-card:first-child h3');
        const rightTitle = await text('.versus .vs-card:last-child h3');
        const more = await ev(([a, b]) => { const pool = JSON.parse(JSON.stringify(WJ.store.get('cache.pop.' + WJ.pool.viewsDay() + '.s.200').v)); const va = pool.find((e) => e.title === a)?.views, vb = pool.find((e) => e.title === b)?.views; return vb > va; }, [leftTitle, rightTitle]);
        await page.click(more ? 'button:has-text("Plus de vues")' : 'button:has-text("Moins de vues")');
        await wait('.next');
        check((await text('.streak')).includes('Exact'), `duel ${k + 1} gagné`);
        await page.click('.next');
      }
      check((await text('.shell-score')).includes('30'), 'score 30 après 3 duels');
      await page.click('button:has-text("Moins de vues"), button:has-text("Plus de vues")');
      await page.waitForTimeout(100);
      if (await page.locator('.next').count()) { await page.click('.next'); }
      if (!(await page.locator('.end').count())) {
        // la 4e réponse était juste par hasard : on force une erreur
        for (let k = 0; k < 5 && !(await page.locator('.end').count()); k++) {
          const leftTitle = await text('.versus .vs-card:first-child h3');
          const rightTitle = await text('.versus .vs-card:last-child h3');
          const more = await ev(([a, b]) => { const pool = WJ.store.get('cache.pop.' + WJ.pool.viewsDay() + '.s.200').v; return pool.find((e) => e.title === b)?.views > pool.find((e) => e.title === a)?.views; }, [leftTitle, rightTitle]);
          await page.click(more ? 'button:has-text("Moins de vues")' : 'button:has-text("Plus de vues")');
          await wait('.next'); await page.click('.next');
        }
      }
      await wait('.end');
      check((await text('.end-total')).match(/\d+/) !== null, 'écran de fin avec total');
    },
    async vieux() {
      await goto('#/vieux?go=1');
      await wait('.duel', 30000);
      check((await page.locator('.duel .vs-card').count()) === 2, 'deux personnalités');
      await page.click('.duel .vs-card:first-child');
      await wait('.next');
      check((await page.locator('.duel .vs-card.right').count()) === 1, 'le plus vieux est marqué');
      check(!(await text('.duel .year')).includes('?'), 'années dévoilées: ' + (await text('.duel .year')));
      for (let k = 0; k < 25 && !(await page.locator('.end').count()); k++) {
        if (await page.locator('.next').count()) await page.click('.next');
        else if (await page.locator('.duel .vs-card').count()) await page.click('.duel .vs-card:first-child');
        await page.waitForTimeout(60);
      }
      await wait('.end');
    },
    async habitants() {
      await goto('#/habitants?go=1&theme=france');
      await wait('input[type=range]', 30000);
      const real = await ev(() => WJ.debugEntry.pop);
      // place le curseur exactement sur la bonne valeur (échelle log)
      await ev((real) => { const r = document.querySelector('input[type=range]'); const lmin = Math.log10(20000), lmax = Math.log10(2500000); r.value = Math.round(1000 * (Math.log10(real) - lmin) / (lmax - lmin)); r.dispatchEvent(new Event('input')); }, real);
      await page.click('button:has-text("Valider mon estimation")');
      await wait('.reveal');
      const pts = parseInt(((await text('.reveal .pts')).match(/\+(\d+)/) || [])[1], 10);
      check(pts >= 95, 'estimation exacte ≈ 100 pts: ' + pts);
      await page.click('.next');
      for (let k = 0; k < 12 && !(await page.locator('.end').count()); k++) {
        if (await page.locator('button:has-text("Valider mon estimation")').count()) await page.click('button:has-text("Valider mon estimation")');
        if (await page.locator('.next').count()) await page.click('.next');
        await page.waitForTimeout(60);
      }
      await wait('.end');
    },
    async frise() {
      await goto('#/frise?go=1&theme=personnalites');
      await wait('.tl-gap', 30000);
      const n0 = await page.locator('.timeline .tl-card').count();
      check(n0 === 1, 'une carte placée au départ');
      // place correctement en lisant les années depuis la frise
      for (let k = 0; k < 12 && !(await page.locator('.end').count()); k++) {
        const info = await ev(() => { const years = [...document.querySelectorAll('.timeline .tl-card .year')].map((y) => parseInt(y.textContent.replace(/\D/g, ''), 10) * (y.textContent.includes('av.') ? -1 : 1)); return years; });
        const curTitle = await text('.tl-current .tl-card div');
        const year = await ev((t) => { const c = [...document.querySelectorAll('.tl-current .tl-card')]; return WJ.debugFriseYear || null; }, curTitle);
        // on choisit la bonne position via l'ordre des années ; l'année de la carte courante n'est pas affichée : on la cherche dans le cache SPARQL simulé (année = 1500 + (Q*37)%500)
        const cur = await ev(() => { const t = document.querySelector('.tl-current .tl-card div').textContent; return t; });
        const qid = await ev((t) => { const e = Object.values(WJ.store.get('cache.pop.' + WJ.pool.viewsDay() + '.s.200')?.v || {}).find((x) => x.title === t); return e ? e.qid : null; }, cur);
        let pos = 0;
        if (qid) { const y = 1500 + ((parseInt(qid.slice(1), 10) * 37) % 500); pos = info.findIndex((v) => v > y); if (pos < 0) pos = info.length; }
        else { pos = Math.floor(Math.random() * (info.length + 1)); }
        await page.locator('.tl-gap').nth(pos).click();
        await page.waitForTimeout(80);
      }
      await wait('.end', 5000);
      check(true, 'frise terminée');
    },
    async langue() {
      await goto('#/langue?go=1');
      await wait('.options', 30000);
      check((await page.locator('.options .btn').count()) === 4, 'quatre langues proposées');
      check((await text('.quote')).length > 20, 'extrait affiché');
      const target = await ev(() => WJ.debugLangue.name);
      await page.click(`.options .btn:has-text("${target.charAt(0).toUpperCase() + target.slice(1)}")`);
      await wait('.reveal');
      check((await text('.reveal h3')).includes(target), `${target} reconnu`);
      check((await text('.reveal .pts')).includes('+100'), '+100 pts du premier coup');
      await page.click('.next');
      await finishRemainingRounds();
      for (let k = 0; k < 60 && !(await page.locator('.end').count()); k++) {
        if (await page.locator('.options .btn:not([disabled])').count()) await page.click('.options .btn:not([disabled])');
        if (await page.locator('.next').count()) await page.click('.next');
        await page.waitForTimeout(60);
      }
      await wait('.end');
    },
    async course() {
      await goto('#/course?go=1');
      await wait('.wiki-content a[data-title]', 30000);
      const target = await text('.race-bar .target');
      check((await page.locator('.wiki-content a.dead').count()) >= 1, 'liens fichiers/externes désactivés');
      const link = page.locator(`.wiki-content a[data-title="${target}"]`);
      if (await link.count()) { await link.first().click(); }
      else { await page.click('.wiki-content a[data-title]'); await page.waitForTimeout(200); await page.click(`.wiki-content a[data-title="${target}"]`); }
      await wait('.end', 10000);
      check((await text('.end')).includes('clic'), 'course gagnée: ' + (await text('.end-list')));
    },
    async chainon() {
      await goto('#/chainon?go=1');
      await wait('.guess input', 30000);
      await page.fill('.guess input', 'Banane');
      await page.click('.guess .btn-primary');
      await page.waitForTimeout(400);
      check((await text('.points-max')).includes('80'), '−20 après un essai raté: ' + (await text('.points-max')));
      await page.fill('.guess input', 'Charles Dickens');
      await page.click('.guess .btn-primary');
      await wait('.reveal.ok', 5000);
      check((await text('.reveal .pts')).includes('+80'), '+80 pts');
      await page.click('.next');
      await finishRemainingRounds();
      await wait('.end');
    },
    async monde() {
      await goto('#/monde?go=1&theme=monuments');
      await wait('#map', 30000);
      const c = await ev(() => WJ.debugEntry.coords);
      await ev((c) => WJ.debugMonde.place(c.lat, c.lon), c);
      await page.click('button:has-text("Valider ma position")');
      await wait('.reveal');
      check((await text('.reveal .pts')).includes('+100'), 'position exacte → 100 pts: ' + (await text('.reveal .pts')));
      await page.click('.next');
      await wait('#map');
      await ev(() => WJ.debugMonde.place(0, 0));
      await page.click('button:has-text("Valider ma position")');
      await wait('.reveal');
      check(!(await text('.reveal .pts')).includes('+100'), 'position lointaine → moins de points: ' + (await text('.reveal .pts')));
      await page.click('.next');
      for (let k = 0; k < 10 && !(await page.locator('.end').count()); k++) {
        if (await page.locator('#map').count()) { await ev(() => WJ.debugMonde.place(10, 10)); await page.click('button:has-text("Valider ma position")'); }
        if (await page.locator('.next').count()) await page.click('.next');
        await page.waitForTimeout(60);
      }
      await wait('.end');
    },
    async image_defi_du_jour() {
      await goto('#/image?daily=1&go=1');
      await wait('.image-frame img', 30000);
      check((await text('.shell-round')).includes('/5'), 'défi du jour en 5 manches');
      await finishRemainingRounds();
      await wait('.end');
      check((await text('.end h2')).includes('Défi du jour'), 'écran de fin du défi');
      await goto('#/');
      check((await text('.hero')).includes('✓'), 'défi marqué fait sur l’accueil');
    },
  };
};
