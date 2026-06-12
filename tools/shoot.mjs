// Screenshot + FPS harness. Usage: node tools/shoot.mjs <iterationLabel>
// Expects a vite server on :5173 (dev) or :4173 (preview); pass URL via env VALLEY_URL.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const label = process.argv[2] || 'iter';
const url = process.env.VALLEY_URL || 'http://localhost:5173/';
const outDir = `shots/${label}`;
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || '/tmp/chrome-headless-shell-linux64/chrome-headless-shell',
  args: [
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));

await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__VALLEY__?.ready, { timeout: 60000 });
await page.evaluate(() => window.__VALLEY__.enter());
await page.waitForTimeout(400);

// entrance first (lantern still burning on its post), dawn-contaminating exit LAST
const views = ['entrance', 'ditch', 'hellmouth', 'free', 'exit'];
for (const v of views) {
  await page.evaluate((name) => {
    if (name === 'ditch') window.__VALLEY__.takeLantern(); // carried light from here on
    window.__VALLEY__.setView(name);
    if (name === 'exit') window.__VALLEY__.dawn(true);
    window.__VALLEY__.advance(3); // settle particles
  }, v);
  await page.waitForTimeout(700); // let a few real frames render
  await page.screenshot({ path: `${outDir}/${v}.png`, timeout: 120000 });
  console.log(`shot: ${v}`);
}

// FPS probe across the hell-mouth (SwiftShader CPU rendering — not GPU-representative).
const fps = await page.evaluate(() => window.__VALLEY__.fpsProbe(5));
const stats = await page.evaluate(() => window.__VALLEY__.stats());
console.log(JSON.stringify({ fps: Math.round(fps * 10) / 10, ...stats }));

await browser.close();
