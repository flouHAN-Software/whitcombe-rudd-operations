// Canlı oturum denemesi: bilgisayar (ofis, Ellie Whitcombe) ve telefon (teknisyen, Gemma Hale) aynı oturumda.
// Rehberdeki üç adım sırayla denenir ve bilgisayardaki listenin kendiliğinden işaretlendiğine bakılır:
//   1. telefonda "Yola çıkıyorum"  → bilgisayarda iş "On the way", şeritte "Gemma Hale set off for …"
//   2. telefonda varış ve "İşi bitir" → bilgisayarda iş tamamlandı, taslak fatura açıldı
//   3. bilgisayarda havuzdaki işi Gemma'nın satırına sürükleme → telefonda iş ve bildirim
// Ayrıca: telefon giriş ekranı ve rehber olmadan Gemma'nın hesabıyla açılır; ofis ekranları telefona kapalıdır.
// Kullanım: sunucu açıkken (`npm run server`)  npm run live-check
//           canlı sitede: BASE=https://flouhan.com npm run live-check
import { chromium } from 'playwright';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE ?? 'http://localhost:8787';
const OUT = fileURLToPath(new URL('../output/checks/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const office = () => { try { localStorage.setItem('wr-prefs', JSON.stringify({ chosen: true })); localStorage.setItem('wr-account', JSON.stringify({ role: 'office' })); } catch (e) { /* */ } };

const b = await chromium.launch();
let fail = 0;
const ok = (cond, label) => { console.log(`${cond ? 'tamam' : 'HATA '}  ${label}`); if (!cond) fail++; };
const wait = (loc, label, ms = 8000) => loc.waitFor({ timeout: ms }).then(() => ok(true, label)).catch(() => ok(false, label));
try {
  const desk = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await desk.addInitScript(office);
  const d = await desk.newPage();
  const errs = [];
  d.on('pageerror', (e) => errs.push(e.message));
  await d.goto(`${BASE}/?lang=en&theme=light#/jobs/WR-48212`, { waitUntil: 'networkidle' });
  await d.getByRole('button', { name: 'Try it on your phone' }).click();
  ok(await d.locator('.live .lc li').count() === 3, 'pencere oturumdan önce ne deneneceğini anlatıyor (3 adım)');
  await d.getByRole('button', { name: 'Start a session' }).click();
  await d.locator('.live .lv-st.is-live').waitFor({ timeout: 10000 });
  ok(true, 'bilgisayar oturumu açtı ve bağlandı');
  const link = (await d.locator('.lv-link').textContent()).trim();
  ok(/[?&]room=[a-z0-9]{8}/.test(link) && link.includes('as=gemma') && link.includes('#/field'), 'karekod bağlantısı: ' + link.replace(BASE, ''));
  await d.screenshot({ path: join(OUT, 'canli-1-oturum.png') });

  // telefon: hiç giriş yapılmamış, boş bir tarayıcı
  const phone = await b.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = await phone.newPage();
  p.on('pageerror', (e) => errs.push('telefon: ' + e.message));
  await p.goto(link, { waitUntil: 'networkidle' });
  ok(!(await p.locator('.guide, .si').count()), 'telefonda rehber ve giriş ekranı yok, doğrudan teknisyen uygulaması');
  ok((await p.locator('.fa-head b').textContent()) === 'Gemma Hale' && !(await p.locator('.tabbar').filter({ visible: true }).count()), 'telefon Gemma Hale hesabıyla açıldı, ofis menüsü yok');
  await p.locator('.lv-bar .lv-st.is-live').waitFor({ timeout: 10000 });
  await wait(d.getByText('2 devices connected').first(), 'bilgisayarda "2 cihaz bağlı" göründü', 10000);

  // 1. yola çıkış
  await p.getByRole('button', { name: 'On my way' }).tap();
  await p.getByRole('button', { name: 'Send text and set off' }).tap();
  await p.screenshot({ path: join(OUT, 'canli-2-telefon.png') });
  await wait(d.locator('.live .lc li.is-ok').first(), 'adım 1 bilgisayardaki listede kendiliğinden işaretlendi');
  await d.keyboard.press('Escape');
  await wait(d.locator('.jd-head .st', { hasText: 'On the way' }), 'telefondaki "Yola çıkıyorum" bilgisayarda anında göründü (WR-48212 On the way)');
  await wait(d.locator('.lv-bar-last', { hasText: 'Gemma Hale' }).filter({ hasText: 'set off for WR-48212' }), 'şeritte "Gemma Hale set off for WR-48212"');
  await d.screenshot({ path: join(OUT, 'canli-3-bilgisayar.png') });

  // ters yön: bilgisayarda varış işaretle → telefonda süre çubuğu ve şeritte ofisin işaretlediği yazar
  await d.getByRole('button', { name: 'Mark arrived' }).click();
  await wait(p.locator('.fa-timer'), 'bilgisayardaki "Varışı işaretle" telefona anında gitti');
  await wait(p.locator('.lv-bar-last', { hasText: 'Ellie Whitcombe' }).filter({ hasText: 'marked WR-48212 as arrived' }), 'telefonun şeridinde "Ellie Whitcombe marked WR-48212 as arrived"');

  // 2. telefonda işi bitir → bilgisayarda tamamlandı ve taslak fatura
  await p.getByRole('button', { name: 'Finish job' }).tap();
  await p.locator('#fa-note').fill('Old fire removed, new fire fitted and tested.');
  await p.locator('.fa-form button[type=submit]').tap();
  await wait(d.locator('.lv-bar-last', { hasText: 'finished WR-48212' }), 'telefonda bitirilen iş bilgisayarın şeridinde');
  await d.evaluate(() => { location.hash = '#/invoices'; });
  await wait(d.locator('main', { hasText: 'WR-48212' }).first(), 'bilgisayarda Faturalar’da WR-48212 taslağı');

  // 3. bilgisayarda havuzdaki "No heating" işini Gemma'nın satırına sürükle (15:20)
  await d.evaluate(() => { location.hash = '#/dispatch'; });
  const card = d.locator('.tcard', { hasText: 'No heating' });
  await card.waitFor({ timeout: 8000 });
  await card.scrollIntoViewIfNeeded();
  const cb = await card.boundingBox();
  await d.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await d.mouse.down();
  const lane = d.locator('[data-lane="gemma"]');
  await lane.scrollIntoViewIfNeeded();
  const lb = await lane.boundingBox();
  const tx = lb.x + ((15 * 60 + 20 - (7 * 60 + 30)) / (11 * 60)) * lb.width;
  await d.mouse.move(cb.x + 30, cb.y, { steps: 5 });
  await d.mouse.move(tx, lb.y + lb.height / 2, { steps: 25 });
  await d.mouse.up();
  await wait(p.locator('.toast', { hasText: 'added WR-48239' }), 'telefonda "Ellie Whitcombe added WR-48239 to your day" bildirimi');
  await p.screenshot({ path: join(OUT, 'canli-4-telefon-bildirim.png') });

  await d.getByRole('button', { name: 'Details' }).click();
  ok(await d.locator('.live .lc li.is-ok').count() === 3, 'bilgisayardaki listede üç adım da işaretli');
  await d.screenshot({ path: join(OUT, 'canli-5-liste.png') });

  // aynı demo saati
  const [dc, pc] = await Promise.all([d.locator('.clock-time').first().textContent().catch(() => ''), p.locator('.fa-head span').first().textContent().catch(() => '')]);
  console.log('       saat: bilgisayar', dc.trim(), '| telefon', pc.trim().slice(0, 30));

  // telefon ofis ekranı açamaz
  await p.evaluate(() => { location.hash = '#/invoices'; });
  await p.waitForTimeout(300);
  ok((await p.evaluate(() => location.hash)) === '#/field', 'telefonda ofis ekranı adresi teknisyen uygulamasına döndü');

  // oturumdan çıkış: bilgisayar kendi verisine döner
  await d.getByRole('button', { name: 'End session' }).click();
  await d.waitForTimeout(1200);
  ok(!(await d.locator('.lv-bar').count()) && !(await d.evaluate(() => location.search.includes('room='))), 'oturum kapandı, adres temizlendi');
  ok(errs.length === 0, 'sayfa hatası yok' + (errs.length ? ': ' + errs.join(' | ') : ''));
} finally {
  await b.close();
}
console.log(fail ? `${fail} sorun` : 'Sorun bulunmadı.');
process.exitCode = fail ? 1 : 0;
