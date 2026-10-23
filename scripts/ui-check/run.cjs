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
const ROUTES = ['/', '/activity', '/review', '/insights', '/insights/investments', '/budget', '/budget/bills', '/settings'];
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
      await fullShot(page, path.join(OUT, cfg.name + (r === '/' ? '-dashboard' : r.replace(/\//g, '-')) + '.png'), cfg);
    }
    // Overlays, at normal viewport size.
    await page.goto(BASE + '/'); await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /^(Log|Add an expense)/ }).first().click(); await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, cfg.name + '-log-sheet.png') });
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.getByRole('button', { name: /Income/ }).first().click(); await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, cfg.name + '-income-sheet.png') });
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.goto(BASE + '/activity'); await page.waitForLoadState('networkidle');
    await page.locator('[data-row]').first().click(); await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, cfg.name + '-edit-sheet.png') });
    await page.context().close();
  }
}

async function chipStep(page) {
  await page.goto(BASE + '/activity'); await page.waitForLoadState('networkidle');
  const all = await page.locator('[data-row]').count();
  await page.getByRole('group', { name: 'Filter by bucket' }).getByRole('button', { name: /Grocery/ }).click();
  await page.waitForTimeout(200);
  const some = await page.locator('[data-row]').count();
  if (!(some > 0 && some < all)) throw new Error('rows ' + all + ' -> ' + some);
  await page.getByRole('group', { name: 'Filter by bucket' }).getByRole('button', { name: 'All', exact: true }).click();
  await page.waitForTimeout(200);
  if (await page.locator('[data-row]').count() !== all) throw new Error('All did not restore');
}

// With Hide amounts on, every visible amount must be blurred: each text
// node that looks like money has an ancestor marked .amt.
async function assertAmountsHidden(page) {
  const offenders = await page.evaluate(() => {
    const out = [];
    const roots = [document.querySelector('main'), ...document.querySelectorAll('[role=dialog]')].filter(Boolean);
    for (const root of roots) {
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const el = n.parentElement;
        if (!/[$₹€£]\s?\d/.test(n.textContent) || !el || !el.getClientRects().length) continue;
        if (!el.closest('.amt') && !el.closest('[aria-hidden="true"] .roller')) out.push(n.textContent.trim().slice(0, 40));
      }
    }
    return out;
  });
  if (offenders.length) throw new Error('amounts not hidden: ' + offenders.slice(0, 6).join(' | '));
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
  await step(results, 'month menu picks a month; T returns to this one', async () => {
    await page.getByRole('button', { name: /^October/ }).first().click();
    await page.getByRole('menuitemradio', { name: 'September 2026' }).click();
    await page.getByRole('button', { name: /^September/ }).first().waitFor({ timeout: 3000 });
    await page.keyboard.press('t');
    await page.getByRole('button', { name: /^October/ }).first().waitFor({ timeout: 3000 });
  });
  await step(results, 'income sheet lists this month', async () => {
    await page.goto(BASE + '/budget'); await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /^Income this month/ }).click();
    await page.getByRole('dialog').getByText('Salary').first().waitFor({ timeout: 3000 });
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.goto(BASE + '/'); await page.waitForLoadState('networkidle');
  });
  await step(results, 'sheet closes by button, Escape and dragging down', async () => {
    const open = async () => { await page.getByRole('button', { name: /^(Log|Add an expense)/ }).first().click(); await page.getByRole('dialog').waitFor({ timeout: 3000 }); await page.waitForTimeout(400); };
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
    await page.getByRole('button', { name: /^(Log|Add an expense)/ }).first().click();
    await page.locator('#log-amount').fill('12.34');
    await page.locator('#log-note').fill('Smoke test');
    await page.getByRole('group', { name: 'Buckets' }).getByRole('button', { name: /Grocery/ }).click();
    await page.waitForTimeout(400);
    await page.goto(BASE + '/activity'); await page.waitForLoadState('networkidle');
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
  await step(results, 'review: the toast offers Undo, and Undo brings it back', async () => {
    const before = await page.getByRole('button', { name: 'Approve', exact: true }).count();
    await page.getByRole('button', { name: 'Approve', exact: true }).first().click();
    await page.getByRole('status').getByRole('button', { name: 'Undo' }).click({ timeout: 3000 });
    await page.waitForTimeout(600);
    const after = await page.getByRole('button', { name: 'Approve', exact: true }).count();
    if (after !== before) throw new Error('approve buttons ' + before + ' -> ' + after);
  });
  await step(results, 'review: dismiss with the sheet', async () => {
    await page.getByRole('button', { name: 'Dismiss', exact: true }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Dismiss', exact: true }).click();
    await page.waitForTimeout(400);
  });
  await step(results, 'Budget lists envelopes in three groups', async () => {
    await page.goto(BASE + '/budget'); await page.waitForLoadState('networkidle');
    for (const [group, name] of [['Everyday', 'Grocery'], ['Bills', 'Utilities'], ['Savings', 'Emergency Fund']]) {
      await page.getByRole('region', { name: group }).getByRole('link', { name: new RegExp(name) }).waitFor({ timeout: 3000 });
    }
  });
  await step(results, 'envelope page: ring, this month, and its Edit sheet', async () => {
    await page.getByRole('region', { name: 'Everyday' }).getByRole('link', { name: /^Grocery/ }).click();
    await page.waitForURL('**/budget/groc', { timeout: 3000 });
    await page.getByRole('region', { name: 'This month' }).getByText('Trader Joe’s').first().waitFor({ timeout: 3000 });
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const dlg = page.getByRole('dialog');
    if (await dlg.locator('#name').inputValue() !== 'Grocery') throw new Error('sheet shows wrong envelope');
    if (await dlg.getByRole('button', { name: 'Delete envelope' }).count()) throw new Error('default envelope offers delete');
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  });
  await step(results, 'swiping from the left edge goes back to Budget', async () => {
    await page.mouse.move(4, 400); await page.mouse.down();
    await page.mouse.move(60, 402, { steps: 4 }); await page.mouse.move(260, 404, { steps: 8 }); await page.mouse.up();
    await page.waitForURL((u) => new URL(u).pathname === '/budget', { timeout: 3000 });
  });
  await step(results, 'add an envelope, then delete it from its page', async () => {
    await page.getByRole('button', { name: 'New envelope' }).first().click();
    await page.locator('#name').fill('Smoke bucket');
    await page.getByRole('dialog').getByRole('button', { name: 'Add envelope' }).click();
    await page.waitForTimeout(400);
    await page.getByRole('link', { name: /^Smoke bucket/ }).click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete envelope' }).click();
    await page.waitForURL((u) => new URL(u).pathname === '/budget', { timeout: 3000 });
    if (await page.getByRole('link', { name: /^Smoke bucket/ }).count()) throw new Error('still listed');
  });
  await step(results, 'a link to a missing envelope lands on Budget', async () => {
    await page.goto(BASE + '/budget/does-not-exist'); await page.waitForLoadState('networkidle');
    await page.waitForURL((u) => new URL(u).pathname === '/budget', { timeout: 4000 });
  });
  await step(results, 'income sheet adds and deletes an income', async () => {
    await page.getByRole('button', { name: /^Income this month/ }).click();
    await page.locator('#income-amount').fill('100');
    await page.locator('#income-note').fill('Smoke income');
    await page.getByRole('dialog').getByRole('button', { name: 'Add Income' }).click();
    await page.getByRole('dialog').getByText('Smoke income').waitFor({ timeout: 3000 });
    const row = page.getByRole('dialog').locator('div').filter({ hasText: 'Smoke income' }).filter({ has: page.getByRole('button', { name: 'Delete income' }) }).last();
    await row.getByRole('button', { name: 'Delete income' }).click();
    await page.waitForTimeout(400);
    if (await page.getByRole('dialog').getByText('Smoke income').count()) throw new Error('income still listed');
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  });
  await step(results, 'assign: fields, over-assigning, the rest, Done persists', async () => {
    const dlg = page.getByRole('dialog');
    const figure = () => dlg.locator('p.figure').first();
    await page.getByRole('button', { name: 'Assign', exact: true }).click();
    await dlg.waitFor({ timeout: 3000 });
    if ((await figure().textContent()).trim() !== '$1,040.00') throw new Error('starts at ' + (await figure().textContent()));
    await page.locator('#assign-groc').fill('650');
    if ((await figure().textContent()).trim() !== '$890.00') throw new Error('after 650: ' + (await figure().textContent()));
    await page.locator('#assign-dine').fill('1500');
    if (!(await figure().getAttribute('class')).includes('text-danger')) throw new Error('over-assigned not red');
    await dlg.getByText('assigned beyond your income').waitFor({ timeout: 2000 });
    await page.locator('#assign-dine').fill('300');
    await dlg.getByRole('button', { name: /^Put the rest/ }).click();
    await dlg.getByText('Every dollar has a job').waitFor({ timeout: 2000 });
    await dlg.getByRole('button', { name: 'Done' }).click();
    await page.waitForTimeout(500);
    await page.reload(); await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Assign', exact: true }).click();
    if (await page.locator('#assign-groc').inputValue() !== '650') throw new Error('Grocery not saved');
    await dlg.getByRole('button', { name: 'Cancel' }).click(); await page.waitForTimeout(400);
  });
  await step(results, 'add a savings goal', async () => {
    await page.getByRole('button', { name: 'Add goal' }).click();
    await page.locator('#goal-name').fill('Smoke goal');
    await page.locator('#goal-bucket').selectOption('save');
    await page.locator('#goal-target').fill('500');
    await page.getByRole('dialog').getByRole('button', { name: 'Create Goal' }).click();
    await page.getByText('Smoke goal').waitFor({ timeout: 3000 });
  });
  await step(results, 'month notes: add a note', async () => {
    await page.getByRole('button', { name: 'Month notes' }).click();
    await page.locator('#month-note-text').fill('Smoke note');
    await page.locator('#month-note-text').press('Enter');
    await page.getByRole('dialog').getByText('Smoke note').waitFor({ timeout: 3000 });
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  });
  await step(results, 'recurring lists bills', async () => {
    await page.goto(BASE + '/budget/bills'); await page.waitForLoadState('networkidle');
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
    await page.goto(BASE + '/insights/investments'); await page.waitForLoadState('networkidle');
    await text('VTI').waitFor({ timeout: 3000 });
  });
  await step(results, 'analytics draws charts', async () => {
    await page.goto(BASE + '/insights'); await page.waitForLoadState('networkidle');
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
    await page.goto(BASE + '/activity'); await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.querySelector('main').scrollTo(0, 1200));
    await page.getByRole('link', { name: /Insights/ }).last().click(); await page.waitForTimeout(700);
    const top = await page.evaluate(() => document.querySelector('main').scrollTop);
    if (top !== 0) throw new Error('Insights opened at ' + top);
    await page.goBack(); await page.waitForTimeout(700);
    const back = await page.evaluate(() => document.querySelector('main').scrollTop);
    if (Math.abs(back - 1200) > 2) throw new Error('Back returned to ' + back);
  });
  await step(results, 'old addresses redirect and keep their query', async () => {
    await page.goto(BASE + '/transactions?bucket=unsorted'); await page.waitForLoadState('networkidle');
    const u = new URL(page.url());
    if (u.pathname !== '/activity' || u.searchParams.get('bucket') !== 'unsorted') throw new Error('landed on ' + u.pathname + u.search);
    await page.goto(BASE + '/recurring'); await page.waitForLoadState('networkidle');
    if (new URL(page.url()).pathname !== '/budget/bills') throw new Error('landed on ' + new URL(page.url()).pathname);
  });
  await step(results, 'tab bar reaches every tab and the lens follows', async () => {
    const tabs = page.getByRole('navigation', { name: 'Tabs' });
    const lens = () => page.evaluate(() => getComputedStyle(document.querySelector('.tabbar .lens')).transform);
    const seen = new Set();
    for (const [label, path] of [['Budget', '/budget'], ['Activity', '/activity'], ['Insights', '/insights'], ['Home', '/']]) {
      await tabs.getByRole('link', { name: new RegExp('^' + label) }).click();
      await page.waitForTimeout(700);
      if (new URL(page.url()).pathname !== path) throw new Error(label + ' opened ' + new URL(page.url()).pathname);
      seen.add(await lens());
    }
    if (seen.size < 4) throw new Error('lens positions ' + [...seen].join(' | '));
  });
  await step(results, 'Activity tab badge shows the number to review', async () => {
    await page.goto(BASE + '/review'); await page.waitForLoadState('networkidle');
    const label = await page.getByRole('tab', { selected: true }).textContent();
    const want = (label.match(/\((\d+)\)/) || [, '0'])[1];
    const link = page.getByRole('navigation', { name: 'Tabs' }).locator('a[href="/activity"]');
    const badge = await link.locator('.badge').textContent();
    const name = await link.getAttribute('aria-label');
    if (badge.trim() !== want || name !== `Activity, ${want} to review`) throw new Error('badge ' + badge + ', label ' + name + ', want ' + want);
  });
  await step(results, 'tapping the current tab scrolls to the top', async () => {
    await page.goto(BASE + '/budget'); await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.querySelector('main').scrollTo(0, 800));
    await page.getByRole('navigation', { name: 'Tabs' }).getByRole('link', { name: /^Budget/ }).click();
    await page.waitForTimeout(900);
    const top = await page.evaluate(() => document.querySelector('main').scrollTop);
    if (top !== 0) throw new Error('scrollTop ' + top);
  });
  await step(results, 'navigation bar turns glass and shows the title after scrolling', async () => {
    await page.evaluate(() => document.querySelector('main').scrollTo(0, 0));
    await page.waitForTimeout(300);
    const atTop = await page.evaluate(() => ({ glass: document.querySelector('header.navbar').classList.contains('scrolled'), title: !!document.querySelector('header.navbar .title.show') }));
    if (atTop.glass || atTop.title) throw new Error('at the top: ' + JSON.stringify(atTop));
    await page.evaluate(() => document.querySelector('main').scrollTo(0, 300));
    await page.waitForTimeout(400);
    const state = await page.evaluate(() => ({ glass: document.querySelector('header.navbar').classList.contains('scrolled'), title: !!document.querySelector('header.navbar .title.show') }));
    if (!state.glass || !state.title) throw new Error(JSON.stringify(state));
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
    await page.getByRole('button', { name: /^(Log|Add an expense)/ }).first().click(); await page.waitForTimeout(500);
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
