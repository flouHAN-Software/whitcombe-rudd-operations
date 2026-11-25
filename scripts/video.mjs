// Tanıtım videosu (masaüstü, 1440×900): canlı demonun gerçek ekran kaydı, görünür imleç ve adım altyazılarıyla.
// Son bölümde ikinci bir tarayıcı Gemma Hale'in telefonu olur ve canlı oturuma katılır; telefondaki işlem
// kayıttaki ofis ekranında gerçekten görünür (deneme listesi kendiliğinden işaretlenir).
// Kullanım (sunucu açıkken: `npm run server`):
//   npm run video -- en      →  output/tanitim-en.mp4 ve tanitim-en.jpg (kapak)
//   npm run video -- tr      →  output/tanitim-tr.mp4 ve tanitim-tr.jpg
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { encode, overlay, record } from './rec.mjs';

const LANG = process.argv[2] === 'tr' ? 'tr' : 'en';
const BASE = process.env.BASE ?? 'http://localhost:8787';
const W = 1440;
const H = 900;
const OUT = fileURLToPath(new URL('../output/', import.meta.url));
const TMP = fileURLToPath(new URL(`../output/checks/video-${LANG}/`, import.meta.url));

// Ekrandaki düğme adları ve altyazılar (iki dil ayrı yazıldı)
const L = {
  en: {
    dispatch: 'Dispatch', field: 'Engineer app', invoices: 'Invoices', reports: 'Reports',
    live: 'Try it on your phone', session: 'Start a session', way: 'On my way', min15: /^15 min/, send: 'Send text and set off',
    arrived: 'I’ve arrived', finish: 'Finish job', toSend: /^To send/,
    note: 'Old fire removed, new fire fitted and tested. Record left with the tenant.',
    c: [
      'An operations dashboard for a firm that services boilers, appliances and air conditioning.',
      'The demo opens on the dashboard itself. A short note says what to try first; the full guide is a click away.',
      'Today: what needs attention right now, and how the day is going against the plan.',
      'Dispatch: drag a waiting job onto an engineer’s day. The window promised to the customer lights up.',
      'The engineer’s screen: set off, arrive, finish. The text to the tenant is shown before it goes.',
      'Finishing the job drafts its invoice on its own.',
      'Invoices: the new draft is already waiting to be sent.',
      'Reports: the last 12 weeks. The October cold snap is marked where it happened.',
      'A live session links a phone to this screen. Here a second browser plays Gemma’s phone.',
      'She presses “On my way” on the phone. The office screen ticks it off within a second.',
      'Concept project by flouHAN Software · flouhan.com'
    ]
  },
  tr: {
    dispatch: 'Planlama', field: 'Teknisyen uygulaması', invoices: 'Faturalar', reports: 'Raporlar',
    live: 'Telefonda canlı dene', session: 'Oturumu başlat', way: 'Yola çıkıyorum', min15: /^15 dk/, send: 'SMS’i gönder, yola çık',
    arrived: 'Vardım', finish: 'İşi bitir', toSend: /^Gönderilecek/,
    note: 'Old fire removed, new fire fitted and tested. Record left with the tenant.',
    c: [
      'Kombi, beyaz eşya ve klima servisi veren bir firmanın operasyon paneli.',
      'Demo doğrudan panelle açılır. Kısa bir not önce neyin deneneceğini söyler; tam rehber bir tık uzakta.',
      'Bugün: o an ilgilenilmesi gerekenler ve günün plana göre gidişi.',
      'Planlama: bekleyen bir işi teknisyenin gününe sürükleyin. Müşteriye söz verilen saat aralığı işaretlenir.',
      'Teknisyen ekranı: yola çık, var, işi bitir. Kiracıya gidecek mesaj gönderilmeden önce görünür.',
      'İş bitince faturası kendiliğinden hazırlanır.',
      'Faturalar: yeni taslak gönderilmeyi bekliyor.',
      'Raporlar: son 12 hafta. Ekim’deki ilk soğuklar grafikte işaretli.',
      'Canlı oturum bir telefonu bu ekrana bağlar. Burada Gemma’nın telefonunu ikinci bir tarayıcı canlandırıyor.',
      'Telefonda “Yola çıkıyorum”a basıyor. Ofis ekranı bunu bir saniye içinde işaretliyor.',
      'flouHAN Software konsept çalışması · flouhan.com'
    ]
  }
}[LANG];

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: 'light' });
await ctx.addInitScript(overlay, false);
const page = await ctx.newPage();
const pause = (ms) => page.waitForTimeout(ms);
const cap = (step, text) => page.evaluate(([s, t]) => window.__cap?.(s, t), [step, text]);
let mx = W / 2, my = H / 2;
async function moveTo(loc, { steps = 24, dx = 0, dy = 0 } = {}) {
  // öğe görünür alanın dışındaysa önce oraya kaydırılır (ör. uzun Türkçe rehberde alttaki düğme)
  await loc.scrollIntoViewIfNeeded();
  await pause(250);
  const bb = await loc.boundingBox();
  if (!bb) throw new Error('öğe görünmüyor');
  mx = bb.x + bb.width / 2 + dx;
  my = bb.y + bb.height / 2 + dy;
  await page.mouse.move(mx, my, { steps });
}
async function click(loc, opts) {
  // imleç görünür biçimde hedefe gider; tıklamayı Playwright yapar (öğe hazır ve yerinde olana kadar bekler)
  await moveTo(loc, opts);
  await pause(160);
  await loc.click({ timeout: 5000 }).catch(() => loc.click({ force: true }));
}
const rail = (name) => page.locator('.rail .nav-item', { hasText: name }).first();

await page.goto(`${BASE}/?lang=${LANG}&theme=light`, { waitUntil: 'networkidle' });
await page.locator('.wc').waitFor();
await page.evaluate(() => document.fonts.ready);
await pause(400);
const rec = await record(ctx, page, TMP, { maxWidth: W, maxHeight: H });
await page.mouse.move(mx, my);

// 1. İlk kareden ürün: ofis ekranı ve karşılama kartı; kart kapatılır
await cap('', L.c[0]);
await pause(2600);
await cap('1', L.c[1]);
await moveTo(page.locator('.wc-try'), { steps: 30, dx: -40 });
await pause(2200);
await click(page.locator('.wc-x'), { steps: 20 });
await pause(600);

// 2. Bugün
await cap('2', L.c[2]);
await moveTo(page.locator('a[data-need]').first(), { steps: 26, dx: -120 });
await pause(900);
await moveTo(page.locator('a[data-need]').nth(1), { steps: 14, dx: -120 });
await pause(700);
const chart = page.locator('.ov-plan .chart svg');
await moveTo(chart, { steps: 30, dx: -40 });
await pause(1800);

// 3. Planlama: havuzdaki işi Chris'in satırına sürükle
await cap('3', L.c[3]);
await click(rail(L.dispatch));
await pause(900);
await page.mouse.move(W / 2, H / 2, { steps: 10 });
await page.mouse.wheel(0, 760);
await pause(1000);
if (!(await page.locator('.tcard').count())) {
  await page.screenshot({ path: join(TMP, 'hata-planlama.png') });
  throw new Error('Planlama açılmadı, adres: ' + (await page.evaluate(() => location.hash)));
}
const card = page.locator('.tcard', { hasText: 'Washer' });
await moveTo(card, { steps: 26, dx: -60 });
await pause(300);
await page.mouse.down();
const lane = await page.locator('[data-lane="chris"]').boundingBox();
const tx = lane.x + ((13 * 60 + 20 - (7 * 60 + 30)) / (11 * 60)) * lane.width;
await page.mouse.move(mx + 20, my - 10, { steps: 6 });
await page.mouse.move(tx, lane.y + lane.height / 2, { steps: 46 });
mx = tx; my = lane.y + lane.height / 2;
await pause(1400);
await page.mouse.up();
await pause(1500);

// 4. Teknisyen uygulaması (ofis, Gemma'nın ekranına bakıyor)
await cap('4', L.c[4]);
await click(rail(L.field));
await pause(700);
await moveTo(page.getByRole('combobox'), { steps: 20 });
await page.getByRole('combobox').selectOption('gemma');
await pause(700);
await click(page.getByRole('button', { name: L.way }));
await pause(700);
await click(page.getByRole('radio', { name: L.min15 }), { steps: 14 });
await pause(1600);
await click(page.getByRole('button', { name: L.send }), { steps: 14 });
await pause(1300);
await click(page.getByRole('button', { name: L.arrived }), { steps: 18 });
await pause(1100);
await click(page.getByRole('button', { name: L.finish }), { steps: 18 });
await pause(600);
await click(page.locator('#fa-note'), { steps: 16 });
await page.keyboard.type(L.note, { delay: 22 });
await pause(300);
await click(page.locator('.fa-form button[type=submit]'), { steps: 18 });
await cap('', L.c[5]);
await pause(2400);

// 5. Faturalar: yeni taslak
await cap('5', L.c[6]);
await click(rail(L.invoices));
await pause(700);
await click(page.getByRole('tab', { name: L.toSend }), { steps: 18 });
await pause(600);
await moveTo(page.locator('.ilist .srow:not(.shead)').first(), { steps: 18, dx: -200 });
await pause(1800);

// 6. Raporlar
await cap('6', L.c[7]);
await click(rail(L.reports));
await pause(900);
const bars = page.locator('.rp-chart svg').first();
const bb = await bars.boundingBox();
mx = bb.x + 36 + ((bb.width - 36 - 150) / 12) * 6.5; my = bb.y + bb.height * 0.55;
await page.mouse.move(mx, my, { steps: 30 });
await pause(2400);

// 7. Canlı oturum: ikinci tarayıcı Gemma'nın telefonu olur
await cap('7', L.c[8]);
await click(rail(L.live));
await pause(900);
await click(page.getByRole('button', { name: L.session }), { steps: 18 });
await page.locator('.qr').waitFor({ timeout: 8000 });
await moveTo(page.locator('.qr'), { steps: 22 });
const link = (await page.locator('.lv-link').textContent()).trim();
const phone = await b.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const p = await phone.newPage();
await p.goto(link, { waitUntil: 'networkidle' });
await p.locator('.lv-bar .lv-st.is-live').waitFor({ timeout: 10000 });
await pause(1800);
await moveTo(page.locator('.live .lc li').first(), { steps: 22, dx: 120 });
await cap('', L.c[9]);
await pause(900);
await p.getByRole('button', { name: L.way }).tap();
await p.getByRole('radio', { name: L.min15 }).tap();
await p.getByRole('button', { name: L.send }).tap();
await page.locator('.live .lc li.is-ok').first().waitFor({ timeout: 8000 });
await pause(2200);
// pencere kapanınca üstteki şerit telefondan gelen son değişikliği gösterir
await click(page.locator('.live .lv-head .icon-btn'), { steps: 18 });
await pause(300);
await moveTo(page.locator('.lv-bar-last'), { steps: 22, dy: 18 });
await pause(2600);
await cap('', L.c[10]);
await pause(2600);
await phone.close();

const shot = await rec.stop();
await ctx.close();
await b.close();
const total = encode(shot, TMP, { mp4: join(OUT, `tanitim-${LANG}.mp4`), jpg: join(OUT, `tanitim-${LANG}.jpg`), w: W, h: H });
console.log(`tamam  tanitim-${LANG}.mp4  ${shot.frames.length} kare, ${total} sn`);
