// Panelin otomatik kontrolü (Playwright, Chromium).
// Her ekranı 1440 / 1024 / 375 px'te açar, tam sayfa görüntü alır ve şunlara bakar:
//   konsol ve sayfa hataları, yatay taşma (görünür alanın dışına çıkan öğe), 14 px altı yazı (kimlik kuralı),
//   erişilebilirlik (axe-core, WCAG 2.1 A ve AA: ciddi ve kritik ihlal hata, diğerleri uyarı).
// Ardından telefonda teknisyen akışını gerçek dokunmayla dener.
//
// Kullanım (geliştirme sunucusu açıkken):
//   npm run check                 EN-açık ve TR-koyu
//   npm run check -- --all        dört dil/tema birleşimi
//   npm run check -- --no-shots   görüntü almadan yalnızca denetim
//   npm run check -- --no-axe     erişilebilirlik denetimi olmadan (daha hızlı)
//   BASE=http://localhost:4173 npm run check   başka adres (ör. vite preview)
// Çıktı: output/checks/<genişlik>/<ekran>-<dil>-<tema>.png, output/checks/akis-*.png, output/checks/rapor.txt
// Her çalıştırma yeni ve boş bir tarayıcı profiliyle açılır; kişisel tarayıcıya ve demo verisine dokunmaz.

import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:5190';
const OUT = fileURLToPath(new URL('../output/checks/', import.meta.url));
const ALL = process.argv.includes('--all');
const SHOTS = !process.argv.includes('--no-shots');
const AXE = !process.argv.includes('--no-axe');
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const ROUTES = ['today', 'jobs', 'dispatch', 'stock', 'customers', 'invoices', 'reports', 'field'];
const SIZES = [
  { id: '1440', opts: { viewport: { width: 1440, height: 900 } } },
  { id: '1024', opts: { viewport: { width: 1024, height: 768 } } },
  { id: '375', opts: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } }
];
const COMBOS = ALL
  ? [['en', 'light'], ['en', 'dark'], ['tr', 'light'], ['tr', 'dark']]
  : [['en', 'light'], ['tr', 'dark']];

/** Sayfa içinde çalışır: taşan öğeler ve 14 px altı yazılar */
function audit() {
  const vw = document.documentElement.clientWidth;
  const hidden = (el) => {
    const s = getComputedStyle(el);
    return s.display === 'none' || s.visibility === 'hidden' || s.clip === 'rect(0px, 0px, 0px, 0px)' || el.closest('.sr-only');
  };
  // Kendi içinde kayan alanlar (sekme şeridi, planlama tahtası) taşma sayılmaz
  const inScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true;
    }
    return false;
  };
  const name = (el) => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : '');
  const over = [];
  const small = new Map();
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || hidden(el)) continue;
    if (r.right > vw + 1 && !inScroller(el) && over.length < 8) over.push(`${name(el)} (sağ kenar ${Math.round(r.right)} > ${vw})`);
    const text = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (text) {
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 14) small.set(name(el), `${fs}px "${el.textContent.trim().slice(0, 24)}"`);
    }
  }
  return {
    pageOverflow: document.documentElement.scrollWidth - vw,
    over,
    small: [...small].slice(0, 6).map(([k, v]) => `${k} ${v}`)
  };
}

async function open(page, lang, theme, route) {
  await page.goto(`${BASE}/?lang=${lang}&theme=${theme}#/${route}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
}

const lines = [];
let failures = 0;
// rehber görülmüş, ofis hesabıyla giriş yapılmış sayılır
const office = () => { try { localStorage.setItem('wr-prefs', JSON.stringify({ chosen: true })); localStorage.setItem('wr-account', JSON.stringify({ role: 'office' })); } catch (e) {} };
const log = (s) => { lines.push(s); console.log(s); };

const browser = await chromium.launch();
try {
  for (const size of SIZES) {
    if (SHOTS) await mkdir(join(OUT, size.id), { recursive: true });
    for (const [lang, theme] of COMBOS) {
      const ctx = await browser.newContext({ ...size.opts, colorScheme: theme });
      // rehber ilk girişte açılır; ekran denetiminde görülmüş sayılır (rehberin kendisi ayrıca denetlenir)
      await ctx.addInitScript(office);
      for (const route of ROUTES) {
        const page = await ctx.newPage();
        const errors = [];
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('pageerror', (e) => errors.push(e.message));
        await open(page, lang, theme, route);
        const a = await page.evaluate(audit);
        // Telefonda tam sayfa görüntüde sabit alt menü ortada kalıyor; telefonun gösterdiği ekran çekilir (denetim yine bütün sayfayı tarar)
        if (SHOTS) await page.screenshot({ path: join(OUT, size.id, `${route}-${lang}-${theme}.png`), fullPage: !size.opts.isMobile });
        const tag = `${route.padEnd(9)} ${size.id.padEnd(4)} ${lang}-${theme}`;
        const axe = AXE ? (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations : [];
        const serious = axe.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        const minor = axe.filter((v) => !serious.includes(v));
        const bad = errors.length || a.pageOverflow > 0 || a.over.length || serious.length;
        if (bad) failures++;
        log(`${bad ? 'HATA' : 'tamam'}  ${tag}${a.small.length ? '  (14 px altı yazı var)' : ''}`);
        errors.forEach((e) => log(`        konsol: ${e.slice(0, 160)}`));
        if (a.pageOverflow > 0) log(`        sayfa ${a.pageOverflow} px yatay taşıyor`);
        a.over.forEach((o) => log(`        taşan: ${o}`));
        a.small.forEach((s) => log(`        küçük yazı: ${s}`));
        for (const v of [...serious, ...minor]) {
          log(`        erişilebilirlik (${v.impact}): ${v.id} · ${v.nodes.length} öğe · ör. ${String(v.nodes[0]?.target ?? '').slice(0, 70)}`);
        }
        await page.close();
      }
      await ctx.close();
    }
  }

  // Telefonda teknisyen akışı, gerçek dokunmayla: yola çık → var → boş notla bitirmeyi dene → notla bitir
  // İlk giriş rehberi: açılıyor mu, erişilebilir mi, düğmesi doğru ekranı açıyor mu
  log('');
  log('İlk giriş: karşılama kartı, rehber ve giriş ekranı');
  for (const [sid, opts] of [['1440', SIZES[0].opts], ['375', SIZES[2].opts]]) for (const lang of ['en', 'tr']) {
    const gctx = await browser.newContext({ ...opts, colorScheme: 'light' });
    const gp = await gctx.newPage();
    const gerr = [];
    gp.on('pageerror', (e) => gerr.push(e.message));
    const over = () => gp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const axe = async (sel) => (AXE ? (await (sel ? new AxeBuilder({ page: gp }).include(sel) : new AxeBuilder({ page: gp })).withTags(AXE_TAGS).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical') : []);
    // hiç ziyaret edilmemiş tarayıcı: ürün (ofis ekranı) hemen görünür, üstünde küçük karşılama kartı
    await gp.goto(`${BASE}/?lang=${lang}&theme=light`, { waitUntil: 'networkidle' });
    await gp.waitForTimeout(500);
    const card = await gp.locator('.wc').isVisible();
    const product = await gp.locator(opts.isMobile ? '.mtop' : '.rail').isVisible();
    const gate = await gp.locator('.guide, .si').count();
    const wover = await over();
    const wax = await axe('.wc');
    if (SHOTS) await gp.screenshot({ path: join(OUT, `karsilama-${sid}-${lang}.png`), fullPage: false });
    // ilk deneme düğmesi: Planlama açılır, kart kapanır ve bir daha açılmaz
    await gp.locator('.wc-try button').first().click();
    await gp.waitForTimeout(300);
    const hash = await gp.evaluate(() => location.hash);
    const cardGone = !(await gp.locator('.wc').count());
    // tam rehber: her ekranın ne işe yaradığı ve iki cihazla deneme
    await gp.evaluate(() => window.dispatchEvent(new Event('wr:guide')));
    await gp.locator('.guide').waitFor({ timeout: 3000 });
    const gax = await axe('.guide');
    if (SHOTS) {
      await gp.locator('.gd-live').scrollIntoViewIfNeeded();
      await gp.screenshot({ path: join(OUT, `rehber-canli-${sid}-${lang}.png`), fullPage: false });
    }
    await gp.keyboard.press('Escape');
    await gp.waitForTimeout(250);
    const guideGone = !(await gp.locator('.guide').count());
    // daha önce gelmiş ve çıkış yapmış ziyaretçi giriş ekranını görür
    await gp.evaluate(() => localStorage.removeItem('wr-account'));
    await gp.goto('about:blank');
    await gp.goto(`${BASE}/?lang=${lang}&theme=light`, { waitUntil: 'networkidle' });
    await gp.waitForTimeout(400);
    const signin = await gp.locator('.si').isVisible();
    const noCard = !(await gp.locator('.wc').count());
    const sax = await axe(null);
    const sover = await over();
    if (SHOTS) await gp.screenshot({ path: join(OUT, `giris-${sid}-${lang}.png`), fullPage: false });
    const bad = !card || !product || gate || wover > 0 || wax.length || hash !== '#/dispatch' || !cardGone || gax.length || !guideGone || !signin || !noCard || sax.length || sover > 0 || gerr.length;
    if (bad) failures++;
    log(`${bad ? 'HATA' : 'tamam'}  ilk giriş ${sid} ${lang}${!card ? ' (kart yok)' : ''}${!product ? ' (ürün görünmüyor)' : ''}${gate ? ' (rehber ya da giriş ekranı önde)' : ''}${wover > 0 ? ' (taşma ' + wover + ')' : ''}${hash !== '#/dispatch' ? ' (düğme ' + hash + ' açtı)' : ''}${!cardGone ? ' (kart kapanmadı)' : ''}${!guideGone ? ' (rehber kapanmadı)' : ''}${!signin ? ' (giriş ekranı yok)' : ''}${!noCard ? ' (girişte kart var)' : ''}${sover > 0 ? ' (giriş taşma ' + sover + ')' : ''}`);
    [['kart', wax], ['rehber', gax], ['giriş', sax]].forEach(([n, list]) => list.forEach((v) => log(`        ${n} erişilebilirlik (${v.impact}): ${v.id}`)));
    gerr.forEach((e) => log('        hata: ' + e));
    await gctx.close();
  }
  // Telif satırı her kabukta en altta görünür; "Bu proje hakkında" menüden açılır
  log('');
  log('Telif satırı ve "Bu proje hakkında"');
  const COPY = { en: '© 2026 flouHAN Software. All rights reserved.', tr: '© 2026 flouHAN Software. Tüm hakları saklıdır.' };
  const visibleCopy = (p) => p.evaluate(() => [...document.querySelectorAll('.copy')].filter((e) => e.getClientRects().length && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden').map((e) => e.textContent));
  for (const [sid, opts] of SIZES.map((x) => [x.id, x.opts])) for (const lang of ['en', 'tr']) {
    const actx = await browser.newContext({ ...opts, colorScheme: 'light' });
    // rehber görülmüş sayılır; hesap yalnızca ilk açılışta adresle verilir (sonra giriş ekranı ve teknisyen denenir)
    await actx.addInitScript(() => { try { localStorage.setItem('wr-prefs', JSON.stringify({ chosen: true })); } catch (e) {} });
    const ap = await actx.newPage();
    const aerr = [];
    ap.on('pageerror', (e) => aerr.push(e.message));
    await ap.goto(`${BASE}/?as=office&lang=${lang}&theme=light#/today`, { waitUntil: 'networkidle' });
    await ap.waitForTimeout(300);
    // ofis kabuğu: masaüstünde menüde, orta genişlikte sayfa sonunda, telefonda "Diğer"de
    if (opts.isMobile) await ap.locator('.tabbar .tab').last().tap();
    const shown = await visibleCopy(ap);
    const copyOk = shown.includes(COPY[lang]);
    // pencere: masaüstünde menüden, telefonda "Diğer"den
    if (opts.isMobile) await ap.locator('.sheet-list button', { hasText: lang === 'tr' ? 'Bu proje hakkında' : 'About this project' }).tap();
    else await ap.locator('.rail .nav-item', { hasText: lang === 'tr' ? 'Bu proje hakkında' : 'About this project' }).click();
    await ap.locator('.about').waitFor({ timeout: 3000 });
    const info = await ap.evaluate(() => ({
      over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      repo: !!document.querySelector('.about a[href="https://github.com/flouHAN-Software/whitcombe-rudd-operations"]'),
      secs: document.querySelectorAll('.about .gd-sec').length
    }));
    const ax = AXE ? (await new AxeBuilder({ page: ap }).include('.about').withTags(AXE_TAGS).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical') : [];
    if (SHOTS) await ap.locator('.about').screenshot({ path: join(OUT, `hakkinda-${sid}-${lang}.png`) });
    await ap.keyboard.press('Escape');
    const closed = !(await ap.locator('.about').count());
    // giriş ekranı ve teknisyen kabuğu
    // aynı adrese gitmek sayfayı yeniden yüklemez: önce boş sayfaya çıkılır
    await ap.evaluate(() => { localStorage.removeItem('wr-account'); });
    await ap.goto('about:blank');
    await open(ap, lang, 'light', 'today');
    const signCopy = (await ap.locator('.si').count()) > 0 && (await visibleCopy(ap)).includes(COPY[lang]);
    await ap.evaluate(() => { localStorage.setItem('wr-account', JSON.stringify({ role: 'engineer', eng: 'gemma' })); });
    await ap.goto('about:blank');
    await open(ap, lang, 'light', 'field');
    const engCopy = (await ap.locator('.app-eng').count()) > 0 && (await visibleCopy(ap)).includes(COPY[lang]);
    const bad = !copyOk || !signCopy || !engCopy || !info.repo || info.secs !== 5 || info.over > 0 || ax.length || !closed || aerr.length;
    if (bad) failures++;
    log(`${bad ? 'HATA' : 'tamam'}  telif ve hakkında ${sid} ${lang}${!copyOk ? ' (ofiste telif yok)' : ''}${!signCopy ? ' (girişte telif yok)' : ''}${!engCopy ? ' (teknisyende telif yok)' : ''}${!info.repo ? ' (depo bağlantısı yok)' : ''}${info.secs !== 5 ? ' (' + info.secs + ' bölüm)' : ''}${info.over > 0 ? ' (taşma ' + info.over + ')' : ''}${!closed ? ' (Esc kapatmadı)' : ''}`);
    ax.forEach((v) => log(`        erişilebilirlik (${v.impact}): ${v.id}`));
    aerr.forEach((e) => log('        hata: ' + e));
    await actx.close();
  }
  log('');
  log('Akış: telefonda teknisyen uygulaması (Gemma Hale hesabı, dokunarak)');
  const ctx = await browser.newContext({ ...SIZES[2].opts, colorScheme: 'light' });
  await ctx.addInitScript(() => { try { localStorage.setItem('wr-prefs', JSON.stringify({ chosen: true })); localStorage.setItem('wr-account', JSON.stringify({ role: 'engineer', eng: 'gemma' })); } catch (e) {} });
  const page = await ctx.newPage();
  const perr = [];
  page.on('pageerror', (e) => perr.push(e.message));
  const step = async (label, fn) => {
    try {
      await fn();
      log(`tamam  ${label}`);
    } catch (e) {
      failures++;
      log(`HATA   ${label}: ${String(e.message ?? e).split('\n')[0]}`);
    }
  };
  await open(page, 'en', 'light', 'field');
  await step('teknisyen hesabında seçim kutusu ve ofis görünümü yok', async () => {
    if (await page.getByRole('combobox').count()) throw new Error('teknisyen seçimi görünüyor');
    if (await page.locator('.fa-office, .rail, .tabbar').filter({ visible: true }).count()) throw new Error('ofis parçası görünüyor');
    const head = await page.locator('.fa-head b').textContent();
    if (head !== 'Gemma Hale') throw new Error('başlıkta ' + head);
  });
  await step('ofis ekranı adresi teknisyene açılmıyor', async () => {
    await page.evaluate(() => { location.hash = '#/invoices'; });
    await page.waitForTimeout(300);
    const h = await page.evaluate(() => location.hash);
    if (h !== '#/field') throw new Error('adres ' + h);
  });
  if (SHOTS) await page.screenshot({ path: join(OUT, 'akis-0-teknisyen-hesabi.png') });
  await step('"On my way" düğmesine dokunma', () => page.getByRole('button', { name: 'On my way' }).tap());
  await step('15 dakika seçimi', () => page.getByRole('radio', { name: /^15 min/ }).tap());
  if (SHOTS) await page.screenshot({ path: join(OUT, 'akis-1-yola-cikis.png') });
  await step('SMS gönderip yola çıkma', async () => {
    await page.getByRole('button', { name: 'Send text and set off' }).tap();
    await page.locator('.toast', { hasText: 'Text sent' }).waitFor({ timeout: 3000 });
  });
  await step('"I’ve arrived" düğmesine dokunma', async () => {
    await page.getByRole('button', { name: 'I’ve arrived' }).tap();
    await page.locator('.fa-timer').waitFor({ timeout: 3000 });
  });
  await step('boş notla bitirme reddediliyor', async () => {
    await page.getByRole('button', { name: 'Finish job' }).tap();
    await page.locator('.fa-form button[type=submit]').tap();
    await page.locator('.fa-err').waitFor({ timeout: 3000 });
  });
  if (SHOTS) await page.screenshot({ path: join(OUT, 'akis-2-bitir.png') });
  await step('notla bitirme ve taslak fatura', async () => {
    await page.locator('#fa-note').fill('Old fire removed, new fire fitted and tested. Record left with the tenant.');
    await page.locator('.fa-form button[type=submit]').tap();
    await page.locator('.toast', { hasText: 'draft invoice' }).waitFor({ timeout: 3000 });
    const n = await page.evaluate(() => JSON.parse(localStorage.getItem('wr:invoices.v1') ?? '[]').filter((i) => i.job === 'WR-48212').length);
    if (n !== 1) throw new Error(`WR-48212 için ${n} fatura bulundu`);
  });
  await step('geri al işi ve faturayı döndürüyor', async () => {
    await page.locator('.toast button').tap();
    await page.locator('.fa-timer').waitFor({ timeout: 3000 });
    const n = await page.evaluate(() => JSON.parse(localStorage.getItem('wr:invoices.v1') ?? '[]').filter((i) => i.job === 'WR-48212').length);
    if (n !== 0) throw new Error(`geri almadan sonra ${n} fatura kaldı`);
  });
  await step('sayfa hatası yok', async () => { if (perr.length) throw new Error(perr.join(' | ')); });
  await ctx.close();
} finally {
  await browser.close();
}

log('');
log(failures ? `${failures} sorun bulundu.` : 'Sorun bulunmadı.');
await mkdir(OUT, { recursive: true });
await writeFile(join(OUT, 'rapor.txt'), lines.join('\n') + '\n', 'utf8');
process.exitCode = failures ? 1 : 0;
