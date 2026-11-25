// Telefon için dikey tanıtım videosu (1080×1920): demo telefon ekranında, dokunarak kullanılır.
// Vaka sayfası telefonda açılınca masaüstü videosu yerine bu oynar (yazılar telefonda da okunur).
// Akış: ofis ekranı ve karşılama kartı → kartla Gemma Hale olarak gir → yola çık, var, işi bitir → ofis hesabına geç → Bugün ve Faturalar.
// Kullanım (sunucu açıkken: `npm run server`):
//   npm run video-phone -- en   →  output/tanitim-telefon-en.mp4 ve .jpg
//   npm run video-phone -- tr   →  output/tanitim-telefon-tr.mp4 ve .jpg
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { encode, overlay, record } from './rec.mjs';

const LANG = process.argv[2] === 'tr' ? 'tr' : 'en';
const BASE = process.env.BASE ?? 'http://localhost:8787';
// 360×640 CSS pikseli, 3 kat yoğunluk: 1080×1920
const VW = 360, VH = 640, DPR = 3;
const OUT = fileURLToPath(new URL('../output/', import.meta.url));
const TMP = fileURLToPath(new URL(`../output/checks/video-telefon-${LANG}/`, import.meta.url));

const L = {
  en: {
    way: 'On my way', min15: /^15 min/, send: 'Send text and set off', arrived: 'I’ve arrived', finish: 'Finish job',
    office: 'Switch to the office account', more: 'More', invoices: 'Invoices', toSend: /^To send/,
    note: 'Old fire removed, new fire fitted and tested.',
    c: [
      'The office dashboard on a phone, with a short note on what to try first.',
      'Two accounts: an engineer sees only their own day. This is Gemma’s next job.',
      'Before she sets off, she sees the exact text the tenant will get.',
      'On site the clock runs. She finishes the job with a short note.',
      'Finishing the job drafts its invoice for the office.',
      'The office account opens on the same data: the day at a glance, on a phone too.',
      'Gemma’s job is already here as a draft invoice, waiting to be sent.',
      'Concept project by flouHAN Software · flouhan.com'
    ]
  },
  tr: {
    way: 'Yola çıkıyorum', min15: /^15 dk/, send: 'SMS’i gönder, yola çık', arrived: 'Vardım', finish: 'İşi bitir',
    office: 'Ofis hesabına geç', more: 'Diğer', invoices: 'Faturalar', toSend: /^Gönderilecek/,
    note: 'Old fire removed, new fire fitted and tested.',
    c: [
      'Ofis paneli telefonda; kısa bir not önce neyin deneneceğini söyler.',
      'İki hesap var: teknisyen yalnızca kendi gününü görür. Bu, Gemma’nın sıradaki işi.',
      'Yola çıkmadan önce kiracıya gidecek mesajı olduğu gibi görür.',
      'Sahada süre işler. İşi kısa bir notla bitirir.',
      'İş bitince faturası ofis için kendiliğinden hazırlanır.',
      'Ofis hesabı aynı veriyle açılır: günün özeti telefonda da var.',
      'Gemma’nın işi burada: taslak fatura gönderilmeyi bekliyor.',
      'flouHAN Software konsept çalışması · flouhan.com'
    ]
  }
}[LANG];

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true, colorScheme: 'light' });
await ctx.addInitScript(overlay, true);
// hiç ziyaret edilmemiş tarayıcı: video doğrudan ofis ekranı ve karşılama kartıyla açılır
const page = await ctx.newPage();
const pause = (ms) => page.waitForTimeout(ms);
const cap = (step, text, pos) => page.evaluate(([s, t, p]) => window.__cap?.(s, t, p), [step, text, pos]);
/** Görünür dokunma: öğe görünür alana kaydırılır, dokunulan yerde halka çıkar */
async function tap(loc, wait = 450) {
  await loc.scrollIntoViewIfNeeded();
  await pause(250);
  const bb = await loc.boundingBox();
  if (bb) await page.evaluate(([x, y]) => window.__tap?.(x, y), [bb.x + bb.width / 2, bb.y + bb.height / 2]);
  await pause(160);
  await loc.tap({ timeout: 5000 }).catch(() => loc.click({ force: true }));
  await pause(wait);
}
const scroll = (y) => page.evaluate((top) => window.scrollBy({ top, behavior: 'smooth' }), y);

await page.goto(`${BASE}/?lang=${LANG}&theme=light`, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.locator('.wc').waitFor();
await pause(400);
const rec = await record(ctx, page, TMP, { maxWidth: VW * DPR, maxHeight: VH * DPR });

// 1. Ofis ekranı ve karşılama kartı; kartla teknisyen hesabına geçilir
await cap('1', L.c[0]);
await pause(3000);
await tap(page.locator('.wc-foot .btn').nth(1), 900);

// 2. Gemma'nın sıradaki işi
await cap('2', L.c[1]);
await pause(1200);
await scroll(260);
await pause(1800);
await scroll(-260);
await pause(800);

// 3. Yola çıkış: kiracıya gidecek mesaj
await tap(page.getByRole('button', { name: L.way }), 700);
await cap('3', L.c[2]);
await tap(page.getByRole('radio', { name: L.min15 }), 2400);
await tap(page.getByRole('button', { name: L.send }), 1400);

// 4. Varış ve bitirme
await cap('4', L.c[3]);
await tap(page.getByRole('button', { name: L.arrived }), 1600);
await tap(page.getByRole('button', { name: L.finish }), 600);
await tap(page.locator('#fa-note'), 200);
await page.keyboard.type(L.note, { delay: 28 });
await pause(400);
await page.evaluate(() => document.activeElement?.blur());
await tap(page.locator('.fa-form button[type=submit]'), 400);
await cap('', L.c[4]);
await pause(2600);

// 5. Ofis hesabına geç: Bugün
await tap(page.locator('.etop-me'), 700);
await tap(page.getByRole('button', { name: L.office }), 900);
await cap('5', L.c[5]);
await pause(1400);
await scroll(320);
await pause(2000);

// 6. Faturalar: taslak
await tap(page.locator('.tabbar .tab', { hasText: L.more }), 700);
await tap(page.locator('.sheet-list a', { hasText: L.invoices }), 900);
await cap('6', L.c[6]);
await tap(page.getByRole('tab', { name: L.toSend }), 2600);
await cap('', L.c[7]);
await pause(2800);

const shot = await rec.stop();
await ctx.close();
await b.close();
const total = encode(shot, TMP, { mp4: join(OUT, `tanitim-telefon-${LANG}.mp4`), jpg: join(OUT, `tanitim-telefon-${LANG}.jpg`), w: VW * DPR, h: VH * DPR, posterAt: 2.4 });
console.log(`tamam  tanitim-telefon-${LANG}.mp4  ${shot.frames.length} kare, ${total} sn`);
