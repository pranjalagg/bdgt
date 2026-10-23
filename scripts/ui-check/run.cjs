// UI checks for bdgt: click-through smoke flows, screenshots of every screen
// (phone and desktop, light and dark) and an axe accessibility pass.
//   node scripts/ui-check/run.cjs <smoke|shots|a11y> [outDir]
// Needs the dev server with sync off:
//   VITE_SUPABASE_URL= npx vite dev --port 5174 --strictPort
// UI_CHECK_URL changes the address; UI_CHECK_CHROME points at a Chromium
// (the headless shell Playwright installs works).
const { chromium } = require('playwright-core');
const fs = require('fs');
const os = require('os');
const path = require('path');
const MODE = process.argv[2] || 'smoke';
const OUT = process.argv[3] || path.join(__dirname, 'out');
const BASE = process.env.UI_CHECK_URL || 'http://localhost:5174';
const CHROME = process.env.UI_CHECK_CHROME || path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell');
const SEED = path.join(__dirname, 'sample-backup.json');
const ROUTES = ['/', '/transactions', '/review', '/analytics', '/investments', '/buckets', '/recurring', '/settings'];
const CONFIGS = [
  { name: 'phone-light', viewport: { width: 390, height: 844 }, theme: 'light', mobile: true },
  { name: 'phone-dark', viewport: { width: 390, height: 844 }, theme: 'dark', mobile: true },
  { name: 'desktop-light', viewport: { width: 1280, height: 800 }, theme: 'light' },
  { name: 'desktop-dark', viewport: { width: 1280, height: 800 }, theme: 'dark' },
];

async function newPage(browser, cfg, errors) {
  const ctx = await browser.newContext({ viewport: cfg.viewport, deviceScaleFactor: 2, locale: 'en-US', timezoneId: 'America/Los_Angeles', isMobile: !!cfg.mobile, hasTouch: !!cfg.mobile });
  await ctx.addInitScript((t) => { try { localStorage.setItem('theme-preference', t); } catch {} }, cfg.theme);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(cfg.name + ': ' + String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(cfg.name + ' console: ' + m.text().slice(0, 200)); });
  page.on('dialog', (d) => d.accept());
  return page;
}

async function seed(page) {
  await page.goto(BASE + '/settings');
  await page.waitForLoadState('networkidle');
  const confirm = page.locator('[role=dialog] button[type=submit], [role=dialog] .btn-primary').first();
  if (await confirm.count()) { await confirm.click().catch(() => {}); await page.waitForTimeout(300); }
  await page.locator('input[type=file]').setInputFiles(SEED);
  await page.waitForTimeout(1500);
  await page.waitForFunction(() => typeof window.__bdgtSampleCaptures === 'function');
  await page.evaluate(() => window.__bdgtSampleCaptures());
}

// The app scrolls inside <main>, so grow the viewport to its full height.
async function fullShot(page, file, cfg) {
  await page.waitForTimeout(400);
  const h = await page.evaluate(() => { const m = document.querySelector('main'); return Math.max(m ? m.scrollHeight + 160 : 0, document.documentElement.scrollHeight); });
  await page.setViewportSize({ width: cfg.viewport.width, height: Math.min(Math.max(h, cfg.viewport.height), 6000) });
  await page.waitForTimeout(250);
  await page.screenshot({ path: file });
  await page.setViewportSize(cfg.viewport);
}

async function shots(browser, errors) {
  for (const cfg of CONFIGS) {
    const page = await newPage(browser, cfg, errors);
    await seed(page);
    for (const r of ROUTES) {
      await page.goto(BASE + r); await page.waitForLoadState('networkidle');
      await fullShot(page, path.join(OUT, cfg.name + (r === '/' ? '-dashboard' : r.replace('/', '-')) + '.png'), cfg);
    }
    // Overlays, at normal viewport size.
    await page.goto(BASE + '/'); await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /^Log/ }).first().click(); await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, cfg.name + '-log-sheet.png') });
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.getByRole('button', { name: /Income/ }).first().click(); await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, cfg.name + '-income-sheet.png') });
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.goto(BASE + '/transactions'); await page.waitForLoadState('networkidle');
    await page.locator('[data-row]').first().click(); await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, cfg.name + '-edit-sheet.png') });
    await page.context().close();
  }
}

async function chipStep(page) {
  await page.goto(BASE + '/transactions'); await page.waitForLoadState('networkidle');
  const all = await page.locator('[data-row]').count();
  await page.getByRole('group', { name: 'Filter by bucket' }).getByRole('button', { name: /Grocery/ }).click();
  await page.waitForTimeout(200);
  const some = await page.locator('[data-row]').count();
  if (!(some > 0 && some < all)) throw new Error('rows ' + all + ' -> ' + some);
  await page.getByRole('group', { name: 'Filter by bucket' }).getByRole('button', { name: 'All', exact: true }).click();
  await page.waitForTimeout(200);
  if (await page.locator('[data-row]').count() !== all) throw new Error('All did not restore');
}

async function step(results, name, fn) {
  try { await fn(); results.push('ok    ' + name); } catch (e) { results.push('FAIL  ' + name + ': ' + String(e).split('\n')[0]); }
}

async function smoke(browser, errors) {
  const cfg = CONFIGS[0];
  const page = await newPage(browser, cfg, errors);
  const results = [];
  const text = (t) => page.getByText(t, { exact: false }).first();
  await step(results, 'import sample backup', async () => { await seed(page); });
  await step(results, 'dashboard shows safe to spend and envelopes', async () => {
    await page.goto(BASE + '/'); await page.waitForLoadState('networkidle');
    await text('Safe to spend').waitFor({ timeout: 4000 });
    await text('Grocery').waitFor({ timeout: 4000 });
  });
  await step(results, 'month picker goes back and forward', async () => {
    await page.getByRole('button', { name: 'Previous month' }).first().click();
    await text('September 2026').waitFor({ timeout: 3000 });
    await page.getByRole('button', { name: 'Next month' }).first().click();
    await text('October 2026').waitFor({ timeout: 3000 });
  });
  await step(results, 'income sheet lists this month', async () => {
    await page.getByRole('button', { name: /Income/ }).first().click();
    await page.getByRole('dialog').getByText('Salary').first().waitFor({ timeout: 3000 });
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  });
  await step(results, 'sheet closes by button, Escape and dragging down', async () => {
    const open = async () => { await page.getByRole('button', { name: /^Log/ }).first().click(); await page.getByRole('dialog').waitFor({ timeout: 3000 }); await page.waitForTimeout(400); };
    const gone = async (how) => { await page.waitForTimeout(450); if (await page.getByRole('dialog').count()) throw new Error('still open after ' + how); };
    await open(); await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click(); await gone('close button');
    await open(); await page.keyboard.press('Escape'); await gone('Escape');
    await open();
    const box = await page.getByRole('dialog').locator('h2').boundingBox();
    await page.mouse.move(box.x - 8, box.y + 4); await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(box.x - 8, box.y + 4 + i * 25);
    await page.mouse.up(); await gone('drag');
  });
  await step(results, 'log an expense', async () => {
    await page.getByRole('button', { name: /^Log/ }).first().click();
    await page.locator('#log-amount').fill('12.34');
    await page.locator('#log-note').fill('Smoke test');
    await page.getByRole('group', { name: 'Buckets' }).getByRole('button', { name: /Grocery/ }).click();
    await page.waitForTimeout(400);
    await page.goto(BASE + '/transactions'); await page.waitForLoadState('networkidle');
    await text('Smoke test').waitFor({ timeout: 3000 });
  });
  await step(results, 'edit it', async () => {
    await page.locator('[data-row]').filter({ hasText: 'Smoke test' }).first().click();
    await page.locator('#edit-amount').fill('15');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await page.waitForTimeout(400);
    await page.locator('[data-row]').filter({ hasText: 'Smoke test' }).filter({ hasText: '15.00' }).first().waitFor({ timeout: 3000 });
  });
  await step(results, 'activity chips filter', () => chipStep(page));
  await step(results, 'delete it', async () => {
    await page.locator('[data-row]').filter({ hasText: 'Smoke test' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete transaction' }).click();
    await page.waitForTimeout(400);
    if (await text('Smoke test').count()) throw new Error('still there');
  });
  await step(results, 'review: approve a suggested payment', async () => {
    await page.goto(BASE + '/review'); await page.waitForLoadState('networkidle');
    const before = await page.getByRole('button', { name: 'Approve', exact: true }).count();
    await page.getByRole('button', { name: 'Approve', exact: true }).first().click();
    await page.waitForTimeout(500);
    const after = await page.getByRole('button', { name: 'Approve', exact: true }).count();
    if (after !== before - 1) throw new Error('approve buttons ' + before + ' -> ' + after);
  });
  await step(results, 'review: dismiss with the sheet', async () => {
    await page.getByRole('button', { name: 'Dismiss', exact: true }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Dismiss', exact: true }).click();
    await page.waitForTimeout(400);
  });
  await step(results, 'buckets list and edit sheet', async () => {
    await page.goto(BASE + '/buckets'); await page.waitForLoadState('networkidle');
    await text('Grocery').waitFor({ timeout: 3000 });
    await page.getByRole('button', { name: 'Edit Grocery' }).click();
    const dlg = page.getByRole('dialog');
    if (await dlg.locator('#name').inputValue() !== 'Grocery') throw new Error('sheet shows wrong bucket');
    // Default buckets can't be deleted, so their sheet has no Delete.
    if (await dlg.getByRole('button', { name: 'Delete bucket' }).count()) throw new Error('default bucket offers delete');
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  });
  await step(results, 'buckets: add one, then delete it from its sheet', async () => {
    await page.getByRole('button', { name: 'Add bucket' }).click();
    await page.locator('#name').fill('Smoke bucket');
    await page.getByRole('dialog').getByRole('button', { name: 'Add Bucket' }).click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Edit Smoke bucket' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete bucket' }).click();
    await page.waitForTimeout(500);
    if (await page.getByRole('button', { name: 'Edit Smoke bucket' }).count()) throw new Error('still there');
    if (await page.getByRole('dialog').count()) throw new Error('sheet still open');
  });
  await step(results, 'recurring lists bills', async () => {
    await page.goto(BASE + '/recurring'); await page.waitForLoadState('networkidle');
    await text('Netflix').waitFor({ timeout: 3000 });
    await page.locator('[data-row]').filter({ hasText: 'Netflix' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Pause' }).click();
    await page.waitForTimeout(400);
    await page.locator('[data-row]').filter({ hasText: 'Netflix' }).filter({ hasText: 'Paused' }).waitFor({ timeout: 2000 });
    await page.locator('[data-row]').filter({ hasText: 'Netflix' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Resume' }).click();
    await page.waitForTimeout(400);
    if (await page.locator('[data-row]').filter({ hasText: 'Paused' }).count()) throw new Error('still paused');
  });
  await step(results, 'investments lists a holding', async () => {
    await page.goto(BASE + '/investments'); await page.waitForLoadState('networkidle');
    await text('VTI').waitFor({ timeout: 3000 });
  });
  await step(results, 'analytics draws charts', async () => {
    await page.goto(BASE + '/analytics'); await page.waitForLoadState('networkidle');
    await page.locator('canvas').first().waitFor({ timeout: 4000 });
  });
  await step(results, 'settings switches theme', async () => {
    await page.goto(BASE + '/settings'); await page.waitForLoadState('networkidle');
    await page.locator('#theme').getByRole('button', { name: 'Dark' }).click();
    await page.waitForTimeout(200);
    if (!(await page.evaluate(() => document.documentElement.classList.contains('dark')))) throw new Error('not dark');
    await page.locator('#theme').getByRole('button', { name: 'Light' }).click();
    await page.waitForTimeout(200);
    if (await page.evaluate(() => document.documentElement.classList.contains('dark'))) throw new Error('still dark');
    if (await page.evaluate(() => document.querySelectorAll('head style').length && [...document.querySelectorAll('head style')].some((s) => s.textContent.includes('transition:none')))) throw new Error('transition pause left behind');
  });
  await step(results, 'new page starts at the top; Back returns to the same place', async () => {
    await page.goto(BASE + '/transactions'); await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.querySelector('main').scrollTo(0, 1200));
    await page.getByRole('link', { name: /Insights/ }).last().click(); await page.waitForTimeout(700);
    const top = await page.evaluate(() => document.querySelector('main').scrollTop);
    if (top !== 0) throw new Error('Insights opened at ' + top);
    await page.goBack(); await page.waitForTimeout(700);
    const back = await page.evaluate(() => document.querySelector('main').scrollTop);
    if (Math.abs(back - 1200) > 2) throw new Error('Back returned to ' + back);
  });
  await step(results, 'bottom nav reaches every section', async () => {
    for (const label of ['Activity', 'Insights', 'Setup', 'Month']) {
      await page.getByRole('link', { name: new RegExp(label) }).last().click();
      await page.waitForTimeout(300);
    }
  });
  await page.context().close();
  return results;
}

// axe on every page and the two main sheets, in both themes at phone width,
// plus a check that nothing overflows a 320 px screen.
async function a11y(browser, errors) {
  const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  const out = [];
  const run = async (page, label) => {
    await page.addScriptTag({ content: AXE });
    const found = await page.evaluate(async () => {
      const res = await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'], rules: { region: { enabled: false } } });
      return res.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, nodes: v.nodes.slice(0, 4).map((n) => (n.target.join(' ') + ' :: ' + (n.any[0]?.message || n.failureSummary || '')).slice(0, 260)) }));
    });
    for (const v of found) out.push(`${label}  [${v.impact}] ${v.id} x${v.n}\n      ` + v.nodes.join('\n      '));
  };
  for (const theme of ['light', 'dark']) {
    const page = await newPage(browser, { ...CONFIGS[0], theme }, errors);
    await seed(page);
    for (const r of ROUTES) {
      await page.goto(BASE + r); await page.waitForLoadState('networkidle'); await page.waitForTimeout(500);
      await run(page, `${theme} ${r}`);
    }
    await page.goto(BASE + '/'); await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /^Log/ }).first().click(); await page.waitForTimeout(500);
    await run(page, `${theme} log-sheet`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.goto(BASE + ROUTES[1]); await page.waitForLoadState('networkidle');
    await page.locator('[data-row]').first().click(); await page.waitForTimeout(500);
    await run(page, `${theme} edit-sheet`);
    await page.context().close();
  }
  const page = await newPage(browser, { ...CONFIGS[0], name: 'narrow', viewport: { width: 320, height: 800 } }, errors);
  await seed(page);
  for (const r of ROUTES) {
    await page.goto(BASE + r); await page.waitForLoadState('networkidle'); await page.waitForTimeout(400);
    const o = await page.evaluate(() => {
      const m = document.querySelector('main');
      const wide = [...document.querySelectorAll('main *')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > window.innerWidth + 1 && !e.closest('.scroll-row, .chips, .hscroll'); }).slice(0, 5).map((e) => e.tagName.toLowerCase() + '.' + String(e.className).split(' ').slice(0, 4).join('.') + ' right=' + Math.round(e.getBoundingClientRect().right));
      return { doc: document.documentElement.scrollWidth, main: m.scrollWidth, client: m.clientWidth, wide };
    });
    if (o.doc > 320 || o.main > o.client || o.wide.length) out.push(`320px ${r}: doc ${o.doc} main ${o.main}/${o.client}\n      ` + o.wide.join('\n      '));
  }
  await page.context().close();
  return out;
}

function assertNoPageErrors(errors) {
  if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const errors = [];
  fs.mkdirSync(OUT, { recursive: true });
  let failed = false;
  if (MODE === 'shots') await shots(browser, errors);
  if (MODE === 'smoke') {
    const results = await smoke(browser, errors);
    console.log(results.join('\n'));
    failed = results.some((r) => r.startsWith('FAIL'));
  }
  if (MODE === 'a11y') {
    const found = await a11y(browser, errors);
    console.log(found.length ? found.join('\n') : 'no findings');
    failed = found.length > 0;
  }
  await browser.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
  process.exit(failed || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
