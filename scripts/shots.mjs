// Portföy (vaka çalışması) görüntüleri. Masaüstü 1440×900 @2x, telefon 375×812 @3x.
// Kullanım (geliştirme sunucusu açıkken): npm run shots
// Çıktı: output/*.png. Her görüntü boş bir tarayıcı profiliyle, demo saati 10:34'te alınır.

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:5190';
const OUT = fileURLToPath(new URL('../output/', import.meta.url));
await mkdir(OUT, { recursive: true });

const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
const PHONE = { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 };

const browser = await chromium.launch();

async function shot(name, { route, lang = 'en', theme = 'light', size = DESK, before, guide = false }) {
  const ctx = await browser.newContext({ ...size, colorScheme: theme });
  // Görüntüler ofis hesabıyla alınır (karşılama kartı kapalı); rehber görüntüsünde ilk ziyaret olduğu gibi kalır
  if (!guide) await ctx.addInitScript(() => { try { localStorage.setItem('wr-prefs', JSON.stringify({ chosen: true })); localStorage.setItem('wr-account', JSON.stringify({ role: 'office' })); } catch (e) {} });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?lang=${lang}&theme=${theme}#/${route}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);
  if (before) await before(page);
  await page.screenshot({ path: join(OUT, name) });
  await ctx.close();
  console.log('tamam ', name);
}

try {
  await shot('01-bugun.png', { route: 'today' });

  // İlk girişteki kullanım rehberi
  await shot('06-rehber.png', { route: 'today', guide: true, size: { viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 } });

  // Havuzdaki iş Chris'in satırına sürüklenirken: bakır varış bandı ve önizleme saati görünür
  // Tahta ve havuz birlikte görünsün diye bu görüntü daha uzun pencerede alınır
  await shot('02-planlama-surukleme.png', {
    route: 'dispatch',
    size: { viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 2 },
    before: async (page) => {
      const card = await page.locator('.tcard', { hasText: 'WR-48214' }).boundingBox();
      const lane = await page.locator('[data-lane="chris"]').boundingBox();
      const x = lane.x + ((13 * 60 + 20 - (7 * 60 + 30)) / (11 * 60)) * lane.width;
      const y = lane.y + lane.height / 2;
      await page.mouse.move(card.x + 24, card.y + card.height / 2);
      await page.mouse.down();
      await page.mouse.move(card.x + 44, card.y + card.height / 2 + 6, { steps: 3 });
      await page.mouse.move(x, y, { steps: 14 });
      await page.waitForTimeout(250);
    }
  });

  await shot('03-is-detayi-koyu.png', { route: 'jobs/WR-48207', theme: 'dark' });

  // Sitedeki kart için: koyu planlama tahtası, kartın 3:2 oranında
  await shot('kart-planlama-koyu.png', { route: 'dispatch', theme: 'dark', size: { viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 } });

  // Raporlar: haftalık iş grafiği, varış oranı ve ilk ziyarette çözüm (sayfanın üst bölümü)
  await shot('05-raporlar.png', { route: 'reports', size: { viewport: { width: 1440, height: 940 }, deviceScaleFactor: 2 } });

  // Telefonda teknisyen: Gemma yola çıkmadan önce müşteriye gidecek SMS'i görüyor
  await shot('04-teknisyen-telefon.png', {
    route: 'field',
    size: PHONE,
    before: async (page) => {
      await page.getByRole('combobox').selectOption('gemma');
      await page.getByRole('button', { name: 'On my way' }).tap();
      // formun kendi yumuşak kaydırması bitsin
      await page.waitForTimeout(1500);
      // Üstte yarım cümle kalmasın: görüntü "What the customer said" başlığından başlar
      await page.evaluate(() => {
        document.querySelector('.fa-cur .fa-block')?.scrollIntoView({ block: 'start' });
        window.scrollBy(0, -(document.querySelector('.mtop')?.getBoundingClientRect().height ?? 56) - 16);
      });
      await page.waitForTimeout(150);
    }
  });
} finally {
  await browser.close();
}
