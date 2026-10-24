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
const ROUTES = ['/', '/activity', '/review', '/insights', '/insights/spending', '/insights/income', '/insights/envelopes', '/insights/savings-rate', '/insights/investments', '/budget', '/budget/bills', '/settings', '/settings/rules', '/settings/capture'];
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
    await page.getByRole('button', { name: 'Edit Home' }).click(); await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, cfg.name + '-edit-home-sheet.png') });
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.goto(BASE + '/budget'); await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /^Income this month/ }).click(); await page.waitForTimeout(500);
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
  await page.getByRole('group', { name: 'Filter' }).getByRole('button', { name: /Grocery/ }).click();
  await page.waitForTimeout(200);
  const some = await page.locator('[data-row]').count();
  if (!(some > 0 && some < all)) throw new Error('rows ' + all + ' -> ' + some);
  await page.getByRole('group', { name: 'Filter' }).getByRole('button', { name: 'All', exact: true }).click();
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

// Drag a list row sideways by a fraction of its width, slowly enough that
// it counts as a drag and not a flick.
async function swipeRow(page, row, fraction) {
  await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(250);
  const b = await row.boundingBox();
  const y = b.y + b.height / 2;
  const x0 = fraction < 0 ? b.x + b.width - 24 : b.x + 40;
  const dx = fraction * b.width;
  await page.mouse.move(x0, y); await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(x0 + (dx * i) / 12, y); await page.waitForTimeout(16); }
  await page.waitForTimeout(150); await page.mouse.move(x0 + dx, y + 1); await page.mouse.up();
}

async function step(results, name, fn) {
  try { await fn(); results.push('ok    ' + name); } catch (e) { results.push('FAIL  ' + name + ': ' + String(e).split('\n')[0]); }
}

async function smoke(browser, errors) {
  const cfg = CONFIGS[0];
  const page = await newPage(browser, cfg, errors);
  const results = [];
  const text = (t) => page.getByText(t, { exact: false }).first();
  const fontHosts = [];
  page.on('request', (r) => { if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) fontHosts.push(r.url()); });
  await step(results, 'import sample backup', async () => { await seed(page); });
  await step(results, 'fonts load from the app, Manrope is used', async () => {
    await page.goto(BASE + '/'); await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    if (!/Manrope/.test(family)) throw new Error('body font is ' + family);
    const loaded = await page.evaluate(() => document.fonts.check('600 16px "Manrope Variable"'));
    if (!loaded) throw new Error('Manrope did not load');
    if (fontHosts.length) throw new Error('fonts requested from ' + fontHosts[0]);
  });
  const heroFigure = () => page.locator('section[aria-label="Safe to spend"] [role=img]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')).join(''));
  const homeHeadings = () => page.locator('main h2').allTextContents();
  await step(results, 'Home shows safe to spend and the plan pill', async () => {
    await page.goto(BASE + '/'); await page.waitForLoadState('networkidle');
    await text('Safe to spend today').waitFor({ timeout: 4000 });
    // The figure depends on today's date (days left), so it is checked
    // against the bar's own "$X today" title rather than a fixed amount.
    const fig = await heroFigure();
    const compact = (await page.locator('header.navbar .title').textContent()).trim();
    if (!/^\$[\d,]+\.\d\d$/.test(fig) || compact !== fig + ' today') throw new Error('hero reads ' + fig + ', bar reads ' + compact);
    await page.getByText(/\$[\d,.]+ (under|over) plan/).first().waitFor({ timeout: 2000 });
    await text('Grocery').waitFor({ timeout: 4000 });
  });
  await step(results, 'scrubbing the pace chart changes the hero label, releasing restores it', async () => {
    const box = await page.locator('.pace').boundingBox();
    await page.mouse.move(box.x + box.width * 0.3, box.y + 60); await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.4, box.y + 60, { steps: 4 });
    await text('Spent on everyday envelopes by Oct').waitFor({ timeout: 2000 });
    await text('Plan by then').waitFor({ timeout: 2000 });
    await page.mouse.up();
    await text('Safe to spend today').waitFor({ timeout: 2000 });
    if (await page.getByText('Spent on everyday envelopes by').count()) throw new Error('scrub label stayed');
  });
  await step(results, 'Edit Home: turn on Upcoming bills, it appears; reorder Recent above Envelopes; reload keeps both', async () => {
    if ((await homeHeadings()).includes('Upcoming bills')) throw new Error('bills on by default');
    await page.getByRole('button', { name: 'Edit Home' }).click();
    const sheet = page.getByRole('dialog', { name: 'Edit Home' });
    await sheet.waitFor({ timeout: 3000 }); await page.waitForTimeout(400);
    await sheet.getByRole('switch', { name: 'Show Upcoming bills' }).click();
    await sheet.getByRole('button', { name: 'Move Recent activity' }).press('ArrowUp');
    // The tap menu and dragging move cards too.
    await sheet.getByRole('button', { name: 'Move Month notes' }).click();
    await sheet.getByRole('button', { name: 'Move up', exact: true }).click();
    const grip = await sheet.getByRole('button', { name: 'Move Upcoming bills' }).boundingBox();
    const rowH = await sheet.locator('li').first().evaluate((li) => li.offsetHeight);
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2); await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 + rowH * 1.1, { steps: 8 }); await page.mouse.up();
    const order = await sheet.locator('li [id^="home-card-"]').allTextContents();
    const want = ['Payments to review', 'Recent activity', 'Envelopes', 'Savings goals', 'Upcoming bills', 'Month notes', 'Savings rate'];
    if (order.join('|') !== want.join('|')) throw new Error('sheet order ' + order.join(', '));
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    const check = async (when) => {
      const h = await homeHeadings();
      if (!h.includes('Upcoming bills')) throw new Error('bills missing ' + when + ': ' + h.join(', '));
      if (h.indexOf('Recent') > h.indexOf('Envelopes')) throw new Error('order ' + when + ': ' + h.join(', '));
    };
    await check('before reload');
    await page.reload(); await page.waitForLoadState('networkidle'); await page.waitForTimeout(500);
    await check('after reload');
  });
  await step(results, 'review card opens Review', async () => {
    await page.getByRole('link', { name: /payments? to review$/ }).click();
    await page.waitForURL('**/review', { timeout: 3000 });
    await page.goto(BASE + '/'); await page.waitForLoadState('networkidle');
  });
  await step(results, 'envelope card opens its envelope page', async () => {
    await page.locator('section[aria-labelledby="home-envelopes"] a[href*="/budget/"]').filter({ hasText: 'Grocery' }).click();
    await page.waitForURL(/\/budget\/(?!bills)[^/]+$/, { timeout: 3000 });
    await page.goto(BASE + '/'); await page.waitForLoadState('networkidle');
  });
  await step(results, 'past month shows Left in September', async () => {
    await page.getByRole('button', { name: /^October/ }).first().click();
    await page.getByRole('menuitemradio', { name: 'September 2026' }).click();
    await text('Left in September').waitFor({ timeout: 3000 });
    await page.keyboard.press('t');
    await text('Safe to spend today').waitFor({ timeout: 3000 });
  });
  await step(results, 'Home hides every amount with the eye on', async () => {
    await page.getByRole('button', { name: 'Hide amounts' }).first().click();
    await page.waitForTimeout(300);
    try { await assertAmountsHidden(page); } finally { await page.getByRole('button', { name: 'Hide amounts' }).first().click(); }
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
    await open(); await page.getByRole('dialog').getByRole('button', { name: /^(Close|Cancel)$/ }).click(); await gone('close button');
    await open(); await page.keyboard.press('Escape'); await gone('Escape');
    await open();
    const box = await page.getByRole('dialog').locator('h2').boundingBox();
    await page.mouse.move(box.x - 8, box.y + 4); await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(box.x - 8, box.y + 4 + i * 25);
    await page.mouse.up(); await gone('drag');
  });
  const openLog = async () => { await page.getByRole('button', { name: /^(Log|Add an expense)/ }).first().click(); await page.getByRole('dialog', { name: 'New expense' }).waitFor({ timeout: 3000 }); await page.waitForTimeout(400); };
  const keys = async (list) => { for (const k of list) await page.locator(`.keypad [data-key="${k}"]`).click(); };
  const saveButton = () => page.locator('[data-save]');
  await step(results, 'keypad: 12 + 8.5, pick Dining Out, button reads Add $20.50 to Dining Out, save, toast, Activity lists it', async () => {
    await page.goto(BASE + '/activity'); await page.waitForLoadState('networkidle');
    await openLog();
    await keys(['1', '2', '+', '8', '.', '5']);
    await page.getByRole('radio', { name: /Dining Out/ }).click();
    const label = (await saveButton().textContent()).replace(/\s+/g, ' ').trim();
    if (label !== 'Add $20.50 to Dining Out') throw new Error('button reads ' + label);
    await page.locator('#log-note').fill('Keypad smoke');
    await saveButton().click();
    await text('Added $20.50 to Dining Out').waitFor({ timeout: 2000 });
    await page.waitForTimeout(400);
    if (await page.getByRole('dialog').count()) throw new Error('sheet still open');
    await page.locator('[data-row]').filter({ hasText: 'Keypad smoke' }).filter({ hasText: '20.50' }).first().waitFor({ timeout: 3000 });
  });
  await step(results, 'Undo removes it', async () => {
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.waitForTimeout(500);
    if (await page.getByText('Keypad smoke').count()) throw new Error('still listed');
  });
  await step(results, 'keyboard: type 7, press Enter with an envelope chosen', async () => {
    await openLog();
    await page.locator('#log-note').fill('Smoke test');
    await page.locator('output[data-autofocus]').focus();
    await page.keyboard.type('7');
    await page.keyboard.press('ArrowRight');
    if (!(await page.getByRole('radio', { checked: true }).count())) throw new Error('no envelope chosen by arrow');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    if (await page.getByRole('dialog').count()) throw new Error('Enter did not save');
    await page.locator('[data-row]').filter({ hasText: 'Smoke test' }).filter({ hasText: '7.00' }).first().waitFor({ timeout: 3000 });
  });
  await step(results, 'Escape closes only the top sheet', async () => {
    await openLog();
    await page.getByRole('button', { name: /^Paid in/ }).click();
    await page.getByRole('dialog', { name: 'Paid in' }).waitFor({ timeout: 3000 }); await page.waitForTimeout(400);
    await page.keyboard.press('Escape'); await page.waitForTimeout(450);
    if (await page.getByRole('dialog', { name: 'Paid in' }).count()) throw new Error('Paid in still open');
    if (!(await page.getByRole('dialog', { name: 'New expense' }).count())) throw new Error('Log closed too');
  });
  await step(results, 'Paid in: switch to EUR with a rate, saved amount is converted', async () => {
    await keys(['1', '0']);
    await page.getByRole('button', { name: /^Paid in/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Paid in' });
    await sheet.waitFor({ timeout: 3000 }); await page.waitForTimeout(300);
    await sheet.locator('#log-select').selectOption('EUR');
    await sheet.locator('#log-rate').fill('0.5');
    await sheet.getByRole('button', { name: 'Done' }).click(); await page.waitForTimeout(400);
    await page.getByRole('radio', { name: /Grocery/ }).click();
    const label = (await saveButton().textContent()).replace(/\s+/g, ' ').trim();
    if (label !== 'Add $20.00 to Grocery') throw new Error('button reads ' + label);
    await page.locator('#log-note').fill('Euro smoke');
    await saveButton().click(); await page.waitForTimeout(500);
    await page.locator('[data-row]').filter({ hasText: 'Euro smoke' }).filter({ hasText: '20.00' }).first().waitFor({ timeout: 3000 });
    await page.getByRole('button', { name: 'Undo' }).click(); await page.waitForTimeout(400);
  });
  await step(results, 'Log sheet hides every amount with the eye on', async () => {
    await page.goto(BASE + '/'); await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Hide amounts' }).first().click();
    try {
      await openLog();
      await keys(['1', '2']);
      await page.getByRole('radio', { name: /Grocery/ }).click();
      await assertAmountsHidden(page);
      await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    } finally { await page.getByRole('button', { name: 'Hide amounts' }).first().click(); }
    await page.goto(BASE + '/activity'); await page.waitForLoadState('networkidle');
  });
  await step(results, 'tap opens the sheet; edit amount to 15, saved', async () => {
    await page.locator('[data-row]').filter({ hasText: 'Smoke test' }).first().click();
    await page.locator('#edit-amount').fill('15');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await page.waitForTimeout(400);
    await page.locator('[data-row]').filter({ hasText: 'Smoke test' }).filter({ hasText: '15.00' }).first().waitFor({ timeout: 3000 });
  });
  await step(results, 'chips filter and All restores', () => chipStep(page));
  await step(results, 'search narrows to Trader Joe’s', async () => {
    const all = await page.locator('[data-row]').count();
    await page.getByRole('searchbox', { name: 'Search expenses' }).fill('trader');
    await page.waitForTimeout(200);
    const rows = await page.locator('[data-row]').allTextContents();
    if (!rows.length || rows.length >= all || rows.some((r) => !/Trader/.test(r))) throw new Error('rows ' + rows.length + ' of ' + all);
    await page.getByRole('searchbox', { name: 'Search expenses' }).fill('');
  });
  const swipe = (row, fraction) => swipeRow(page, row, fraction);
  const rowOf = (name) => page.locator('[data-row]').filter({ hasText: name }).first();
  await step(results, 'swipe left fully deletes, Undo restores', async () => {
    await swipe(rowOf('Haircut tip'), -0.7);
    await text('Deleted $15.00').waitFor({ timeout: 2000 });
    await page.waitForTimeout(400);
    if (await page.locator('[data-row]').filter({ hasText: 'Haircut tip' }).count()) throw new Error('row still there');
    await page.getByRole('button', { name: 'Undo' }).click(); await page.waitForTimeout(400);
    await rowOf('Haircut tip').waitFor({ timeout: 2000 });
  });
  await step(results, 'a short swipe rests open and a tap closes it', async () => {
    await swipe(rowOf('Haircut tip'), -0.3);
    await page.waitForTimeout(350);
    const open = await rowOf('Haircut tip').evaluate((el) => el.parentElement.style.transform);
    if (!/translateX\(-88px\)/.test(open)) throw new Error('rests at ' + open);
    await rowOf('Haircut tip').click(); await page.waitForTimeout(350);
    if (await page.getByRole('dialog').count()) throw new Error('tap on an open row opened the sheet');
    const closed = await rowOf('Haircut tip').evaluate((el) => el.parentElement.style.transform);
    if (closed) throw new Error('still open: ' + closed);
  });
  await step(results, 'swipe right moves to Misc, Undo restores', async () => {
    await swipe(rowOf('Starbucks'), 0.6);
    const sheet = page.getByRole('dialog', { name: 'Move to' });
    await sheet.waitFor({ timeout: 2000 }); await page.waitForTimeout(350);
    await sheet.getByRole('button', { name: /^Misc/ }).click();
    await text('Moved to Misc').waitFor({ timeout: 2000 });
    await rowOf('Starbucks').filter({ hasText: 'Misc' }).waitFor({ timeout: 2000 });
    await page.getByRole('button', { name: 'Undo' }).click(); await page.waitForTimeout(400);
    await rowOf('Starbucks').filter({ hasText: 'Dining Out' }).waitFor({ timeout: 2000 });
  });
  await step(results, 'Activity and its sheet hide every amount with the eye on', async () => {
    await page.goto(BASE + '/'); await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Hide amounts' }).first().click();
    try {
      await page.goto(BASE + '/activity'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(300);
      await assertAmountsHidden(page);
      await page.locator('[data-row]').first().click(); await page.waitForTimeout(500);
      await assertAmountsHidden(page);
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    } finally {
      await page.goto(BASE + '/'); await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: 'Hide amounts' }).first().click();
      await page.goto(BASE + '/activity'); await page.waitForLoadState('networkidle');
    }
  });
  await step(results, 'delete it', async () => {
    await page.locator('[data-row]').filter({ hasText: 'Smoke test' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete expense' }).click();
    await page.waitForTimeout(400);
    if (await text('Smoke test').count()) throw new Error('still there');
  });
  const left = async () => Number((await page.getByText(/^\d+ left$/).first().textContent()).split(' ')[0]);
  const topCard = () => page.locator('[data-top]');
  const topName = async () => (await topCard().locator('h2').textContent()).trim();
  const settle = () => page.waitForTimeout(600);
  await step(results, 'deck hides every amount with the eye on', async () => {
    await page.goto(BASE + '/'); await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Hide amounts' }).first().click();
    try {
      await page.goto(BASE + '/review'); await page.waitForLoadState('networkidle'); await settle();
      await assertAmountsHidden(page);
    } finally {
      await page.goto(BASE + '/'); await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: 'Hide amounts' }).first().click();
    }
    await page.goto(BASE + '/review'); await page.waitForLoadState('networkidle'); await settle();
  });
  await step(results, 'drag the top card right approves it (count drops by 1)', async () => {
    const before = await left();
    const name = await topName();
    const b = await topCard().boundingBox();
    const y = b.y + b.height - 60;
    await page.mouse.move(b.x + b.width / 2, y); await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(b.x + b.width / 2 + i * 18, y); await page.waitForTimeout(16); }
    await page.mouse.up(); await settle();
    if ((await left()) !== before - 1) throw new Error('left ' + before + ' -> ' + (await left()));
    await text('Approved ' + name).waitFor({ timeout: 2000 });
  });
  await step(results, 'Undo after approve brings it back', async () => {
    const before = await left();
    await page.getByRole('status').getByRole('button', { name: 'Undo' }).click({ timeout: 3000 });
    await settle();
    if ((await left()) !== before + 1) throw new Error('left ' + before + ' -> ' + (await left()));
  });
  await step(results, 'Dismiss button opens the sheet and dismisses', async () => {
    const before = await left();
    await page.getByRole('button', { name: 'Dismiss', exact: true }).first().click();
    const sheet = page.getByRole('dialog', { name: 'Dismiss payment' });
    await sheet.waitFor({ timeout: 2000 }); await page.waitForTimeout(300);
    await sheet.getByRole('switch').waitFor({ timeout: 1000 });
    await sheet.getByRole('button', { name: 'Dismiss', exact: true }).click(); await settle();
    if ((await left()) !== before - 1) throw new Error('left ' + before + ' -> ' + (await left()));
  });
  await step(results, '₹ card shows ₹250.00 and Rate needed; Approve reads Add rate and asks for a rate', async () => {
    if ((await topName()) !== 'Swiggy') throw new Error('top card ' + (await topName()));
    await topCard().getByText('₹250.00').waitFor({ timeout: 1000 });
    await topCard().getByText('Rate needed').waitFor({ timeout: 1000 });
    const before = await left();
    await page.getByRole('button', { name: 'Add rate', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Edit and approve' });
    await sheet.waitFor({ timeout: 2000 }); await page.waitForTimeout(300);
    await sheet.locator('#review-rate').fill('83.33');
    await sheet.getByRole('button', { name: 'Approve', exact: true }).click(); await settle();
    if ((await left()) !== before - 1) throw new Error('left ' + before + ' -> ' + (await left()));
  });
  await step(results, 'with a rate known, the next ₹ card shows About $150.01', async () => {
    if ((await topName()) !== 'CRED') throw new Error('top card ' + (await topName()));
    await topCard().getByText(/^About \$150\.0\d$/).waitFor({ timeout: 1000 });
  });
  await step(results, 'card without an envelope: Approve opens the picker first', async () => {
    const before = await left();
    await page.getByRole('button', { name: 'Choose envelope', exact: true }).last().click();
    const sheet = page.getByRole('dialog', { name: 'Choose envelope' });
    await sheet.waitFor({ timeout: 2000 }); await page.waitForTimeout(300);
    await sheet.getByRole('button', { name: /^Misc/ }).click(); await settle();
    if ((await left()) !== before - 1) throw new Error('left ' + before + ' -> ' + (await left()));
  });
  await step(results, 'Approved list shows Back to review', async () => {
    const before = await left();
    await page.getByRole('tab', { name: 'Approved' }).click(); await page.waitForTimeout(300);
    const row = page.locator('.group-row').filter({ hasText: 'CRED' });
    await row.getByRole('button', { name: 'Back to review' }).click(); await settle();
    await page.getByRole('tab', { name: /^To review/ }).click(); await page.waitForTimeout(300);
    if ((await left()) !== before + 1) throw new Error('left ' + before + ' -> ' + (await left()));
  });
  await step(results, 'Approve all suggested approves only suggested ones', async () => {
    const label = await page.getByRole('button', { name: /^Approve all suggested/ }).textContent();
    const n = Number(label.match(/\((\d+)\)/)[1]);
    const before = await left();
    await page.getByRole('button', { name: /^Approve all suggested/ }).click(); await settle();
    const after = await left();
    if (after !== before - n || after === 0) throw new Error('left ' + before + ' -> ' + after + ' approving ' + n);
    if (await page.getByRole('button', { name: /^Approve all suggested/ }).count()) throw new Error('still offers approve all');
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
  const scrubAt = async (chart, fraction) => {
    const b = await chart.boundingBox();
    const y = b.y + b.height / 2;
    await page.mouse.move(b.x + b.width * fraction, y); await page.mouse.down();
    await page.mouse.move(b.x + b.width * fraction + 2, y, { steps: 2 });
    await page.waitForTimeout(150);
  };
  const periodPill = () => page.getByRole('tablist', { name: 'Period' }).locator('.segmented-pill').evaluate((el) => el.style.transform);
  await step(results, 'period switches Week / Month / 6 months and the pill slides', async () => {
    await page.goto(BASE + '/insights'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(400);
    const seen = new Set();
    for (const [tab, label] of [['Week', 'Spent in the last 7 days'], ['6 months', 'Average per month'], ['Month', 'Spent in October']]) {
      await page.getByRole('tablist', { name: 'Period' }).getByRole('tab', { name: tab, exact: true }).click(); await page.waitForTimeout(450);
      await text(label).waitFor({ timeout: 2000 });
      seen.add(await periodPill());
    }
    if (seen.size !== 3) throw new Error('pill positions ' + [...seen].join(' | '));
  });
  await step(results, 'scrubbing the period chart reads a day', async () => {
    await scrubAt(page.locator('[aria-label^="Spending on each day"]'), 0.25);
    await page.getByText(/^[A-Z][a-z]{2}, Oct \d+$/).first().waitFor({ timeout: 2000 });
    await page.mouse.up(); await page.waitForTimeout(200);
    await text('Spent in October').waitFor({ timeout: 2000 });
  });
  await step(results, 'threshold $50 changes the split; legend hides Rent', async () => {
    const split = () => page.getByText(/^Big \d+% ·/).first().textContent();
    const before = await split();
    await page.getByRole('button', { name: /or more$/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Big purchases' });
    await sheet.waitFor({ timeout: 2000 }); await page.waitForTimeout(300);
    await sheet.getByText('Envelopes whose spending this month reaches this amount count as big.').waitFor({ timeout: 1000 });
    await sheet.getByRole('button', { name: '$50', exact: true }).click();
    await sheet.getByRole('button', { name: 'Done' }).click(); await page.waitForTimeout(400);
    const after = await split();
    if (after === before) throw new Error('split unchanged: ' + after);
    // The figure in the donut's middle stays inside its hole (108px across).
    const mid = await page.locator('[aria-label*="purchases by envelope"] .figure, [aria-label*="purchases by envelope"] .money').first().boundingBox();
    if (mid.width > 108) throw new Error('donut figure is ' + Math.round(mid.width) + 'px wide');
    const rent = page.locator('button[aria-pressed]').filter({ hasText: 'Rent/Mortgage' }).filter({ hasText: '% of big' });
    const total = () => page.locator('[aria-label*="purchases by envelope"]').getAttribute('aria-label');
    const t0 = await total();
    await rent.click(); await page.waitForTimeout(200);
    if ((await rent.getAttribute('aria-pressed')) !== 'false') throw new Error('Rent still shown');
    if ((await total()) === t0) throw new Error('donut total unchanged');
  });
  await step(results, 'patterns section renders', async () => {
    await page.locator('[data-patterns]').waitFor({ timeout: 2000 });
    await page.getByRole('button', { name: 'How these work' }).click();
    await page.getByRole('dialog', { name: 'How patterns work' }).waitFor({ timeout: 2000 });
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  });
  await step(results, 'Insights hides every amount with the eye on', async () => {
    await page.goto(BASE + '/'); await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Hide amounts' }).first().click();
    try {
      for (const r of ['/insights', '/insights/income']) {
        await page.goto(BASE + r); await page.waitForLoadState('networkidle'); await page.waitForTimeout(500);
        await assertAmountsHidden(page);
      }
    } finally {
      await page.goto(BASE + '/'); await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: 'Hide amounts' }).first().click();
    }
  });
  await step(results, 'each trend page opens, scrubs to August and returns', async () => {
    await page.goto(BASE + '/insights'); await page.waitForLoadState('networkidle');
    for (const [card, path] of [['Monthly spending', '/insights/spending'], ['Income and spending', '/insights/income'], ['Spending by envelope', '/insights/envelopes'], ['Savings rate', '/insights/savings-rate']]) {
      await page.getByRole('link', { name: new RegExp('^' + card) }).click();
      await page.waitForURL('**' + path, { timeout: 3000 }); await page.waitForTimeout(900);
      await scrubAt(page.locator('main [role=img][aria-label*="per month"]').first(), 3.5 / 6);
      const label = (await page.locator('main p').first().textContent()).trim();
      if (!label.startsWith('August')) throw new Error(card + ' reads ' + label);
      await page.mouse.up(); await page.waitForTimeout(200);
      await page.getByRole('link', { name: 'Insights' }).first().click();
      await page.waitForURL((u) => new URL(u).pathname === '/insights', { timeout: 3000 }); await page.waitForTimeout(300);
    }
    await page.goto(BASE + '/insights/nope'); await page.waitForLoadState('networkidle');
    if (new URL(page.url()).pathname !== '/insights') throw new Error('unknown chart landed on ' + new URL(page.url()).pathname);
  });
  await step(results, 'envelopes page: Rent hidden, toggling it on redraws', async () => {
    await page.goto(BASE + '/insights/envelopes'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(400);
    const chip = page.getByRole('group', { name: 'Envelopes' }).getByRole('button', { name: /Rent\/Mortgage/ });
    if ((await chip.getAttribute('aria-pressed')) !== 'false') throw new Error('Rent shown at first');
    const lines = () => page.locator('main [role=img][aria-label*="per month"] path').count();
    const before = await lines();
    await chip.click(); await page.waitForTimeout(300);
    if ((await chip.getAttribute('aria-pressed')) !== 'true') throw new Error('Rent not shown after tap');
    if ((await lines()) <= before) throw new Error('lines ' + before + ' -> ' + (await lines()));
  });
  await step(results, 'investments page lists VTI and opens Add purchase', async () => {
    await page.goto(BASE + '/insights/investments'); await page.waitForLoadState('networkidle');
    await text('VTI').waitFor({ timeout: 3000 });
    await page.getByRole('button', { name: 'Add purchase' }).click();
    await page.getByRole('dialog', { name: 'Add Purchase' }).waitFor({ timeout: 2000 });
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
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
  await step(results, 'export JSON downloads a file', async () => {
    await page.goto(BASE + '/settings'); await page.waitForLoadState('networkidle');
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }), page.getByRole('button', { name: /^Export JSON/ }).click()]);
    if (!/^budget-backup-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename())) throw new Error('file ' + download.suggestedFilename());
  });
  await step(results, 'Home screen row opens Edit Home', async () => {
    await page.getByRole('button', { name: /^Home screen/ }).click();
    await page.getByRole('dialog', { name: 'Edit Home' }).waitFor({ timeout: 2000 });
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  });
  await step(results, 'back from Capture rules returns to Settings', async () => {
    await page.getByRole('link', { name: /^Capture rules/ }).click();
    await page.waitForURL('**/settings/rules', { timeout: 3000 });
    await page.getByText('Learned from the payments you approved or dismissed.', { exact: false }).waitFor({ timeout: 2000 });
    await page.getByRole('link', { name: 'Settings' }).first().click();
    await page.waitForURL((u) => new URL(u).pathname === '/settings', { timeout: 3000 });
  });
  await step(results, 'Done on Settings goes back where it was opened from', async () => {
    await page.goto(BASE + '/'); await page.waitForLoadState('networkidle');
    await page.getByRole('link', { name: /Settings/ }).first().click();
    await page.waitForURL('**/settings', { timeout: 3000 }); await page.waitForTimeout(400);
    if (await page.getByRole('navigation', { name: 'Tabs' }).count()) throw new Error('tab bar shows over Settings');
    await page.getByRole('button', { name: 'Done' }).click();
    await page.waitForURL((u) => new URL(u).pathname === '/', { timeout: 3000 });
  });
  await step(results, 'Done after visiting a Settings page returns to the tab, not the page', async () => {
    await page.goto(BASE + '/'); await page.waitForLoadState('networkidle');
    await page.getByRole('link', { name: /Settings/ }).first().click(); await page.waitForURL('**/settings');
    await page.getByRole('link', { name: /^Capture rules/ }).click(); await page.waitForURL('**/settings/rules');
    await page.getByRole('link', { name: 'Settings' }).first().click();
    await page.waitForURL((u) => new URL(u).pathname === '/settings', { timeout: 3000 }); await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Done' }).click();
    await page.waitForURL((u) => new URL(u).pathname === '/', { timeout: 3000 });
  });
  await step(results, 'Back from a page goes back; Android back afterwards does not return to it', async () => {
    await page.goto(BASE + '/'); await page.waitForLoadState('networkidle');
    await page.getByRole('navigation', { name: 'Tabs' }).getByRole('link', { name: /^Budget/ }).click(); await page.waitForURL('**/budget');
    await page.getByRole('region', { name: 'Everyday' }).getByRole('link', { name: /^Grocery/ }).click(); await page.waitForURL('**/budget/groc');
    await page.locator('header.navbar a', { hasText: 'Budget' }).click();
    await page.waitForURL((u) => new URL(u).pathname === '/budget', { timeout: 3000 }); await page.waitForTimeout(300);
    await page.goBack(); await page.waitForTimeout(500);
    const after = new URL(page.url()).pathname;
    if (after !== '/') throw new Error('browser back from Budget landed on ' + after);
  });
  await step(results, 'tapping the current tab from a page inside it pops back to the tab', async () => {
    await page.goto(BASE + '/'); await page.waitForLoadState('networkidle');
    const tab = page.getByRole('navigation', { name: 'Tabs' }).getByRole('link', { name: /^Budget/ });
    await tab.click(); await page.waitForURL('**/budget');
    await page.getByRole('region', { name: 'Everyday' }).getByRole('link', { name: /^Grocery/ }).click(); await page.waitForURL('**/budget/groc');
    await tab.click();
    await page.waitForURL((u) => new URL(u).pathname === '/budget', { timeout: 3000 }); await page.waitForTimeout(300);
    await page.goBack(); await page.waitForTimeout(500);
    const after = new URL(page.url()).pathname;
    if (after !== '/') throw new Error('browser back after the tab tap landed on ' + after);
  });
  await step(results, 'Close on Review opened directly lands on Activity', async () => {
    await page.goto(BASE + '/review'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Close' }).click();
    await page.waitForURL((u) => new URL(u).pathname === '/activity', { timeout: 3000 });
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
    // The unsorted link shows the Unsorted chip selected.
    const pressed = await page.getByRole('group', { name: 'Filter' }).locator('[aria-pressed="true"]').allTextContents();
    if (pressed.map((t) => t.trim()).join() !== 'Unsorted') throw new Error('chip ' + pressed.join());
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
    if (await page.getByRole('navigation', { name: 'Tabs' }).count()) throw new Error('tab bar shows over Review');
    await page.goto(BASE + '/activity'); await page.waitForLoadState('networkidle');
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
  await step(results, 'with a status bar (Android), the bar fills the top edge and covers nothing at rest', async () => {
    for (const r of ['/', '/budget', '/settings']) {
      await page.goto(BASE + r); await page.waitForLoadState('networkidle');
      await page.addStyleTag({ content: ':root { --safe-area-inset-top: 40px !important; }' }); await page.waitForTimeout(300);
      const atRest = await page.evaluate(() => {
        const h = document.querySelector('header.navbar').getBoundingClientRect();
        const content = document.querySelector('main h1:not(.sr-only), main section, main .card, main .group');
        return { top: Math.round(h.top), bottom: Math.round(h.bottom), content: Math.round(content.getBoundingClientRect().top) };
      });
      if (atRest.top !== 0) throw new Error(r + ': bar starts ' + atRest.top + 'px below the top');
      if (atRest.content < atRest.bottom) throw new Error(r + ': bar covers the page by ' + (atRest.bottom - atRest.content) + 'px');
      await page.evaluate(() => document.querySelector('main').scrollTo(0, 200)); await page.waitForTimeout(250);
      const scrolled = await page.evaluate(() => Math.round(document.querySelector('header.navbar').getBoundingClientRect().top));
      if (scrolled !== 0) throw new Error(r + ': scrolled bar floats ' + scrolled + 'px below the top');
    }
  });
  await step(results, 'large title fades as it slides under the bar, so it never shows behind the bar buttons', async () => {
    for (const r of ['/budget', '/settings']) {
      await page.goto(BASE + r); await page.waitForLoadState('networkidle'); await page.waitForTimeout(300);
      await page.evaluate(() => document.querySelector('main').scrollTo(0, 34)); await page.waitForTimeout(300);
      const o = await page.evaluate(() => {
        const h = document.querySelector('h1.ltitle'); const bar = document.querySelector('header.navbar').getBoundingClientRect();
        const t = h.getBoundingClientRect();
        return { opacity: Number(getComputedStyle(h).opacity), under: t.top < bar.bottom };
      });
      if (o.under && o.opacity > 0.35) throw new Error(r + ': title under the bar at opacity ' + o.opacity);
    }
  });
  await step(results, 'the small title in the bar never overlaps the bar buttons', async () => {
    for (const r of ['/', '/budget', '/activity', '/insights', '/settings', '/budget/groc']) {
      await page.goto(BASE + r); await page.waitForLoadState('networkidle'); await page.waitForTimeout(300);
      // The longest month name makes the widest month button.
      if (r === '/') { await page.getByRole('button', { name: /^October/ }).first().click(); await page.getByRole('menuitemradio', { name: 'September 2026' }).click(); await page.waitForTimeout(300); }
      await page.evaluate(() => document.querySelector('main').scrollTo(0, 400)); await page.waitForTimeout(350);
      const hit = await page.evaluate(() => {
        const bar = document.querySelector('header.navbar');
        const title = bar.querySelector('.title.show');
        if (!title) return 'no title';
        const t = title.getBoundingClientRect();
        const parts = [...bar.querySelectorAll('a, button')].map((el) => el.getBoundingClientRect()).filter((b) => b.width > 0);
        return parts.some((b) => b.left < t.right - 1 && b.right > t.left + 1 && b.top < t.bottom && b.bottom > t.top) ? `overlap: title ${Math.round(t.left)}–${Math.round(t.right)}` : '';
      });
      if (hit) throw new Error(r + ' ' + hit);
      if (r === '/') { await page.keyboard.press('t'); await page.waitForTimeout(200); }
    }
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
  await step(results, 'fresh profile: Insights renders with no NaN or Infinity anywhere', async () => {
    await page.goto(BASE + '/settings'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(500);
    await page.getByRole('button', { name: /^Reset all data$/i }).click({ timeout: 5000 });
    await page.waitForTimeout(1200);
    // A fresh profile asks for its currency first.
    const confirm = page.locator('[role=dialog] button[type=submit], [role=dialog] .btn-primary').first();
    if (await confirm.count()) { await confirm.click(); await page.waitForTimeout(400); }
    for (const r of ['/', '/insights', '/insights/spending', '/insights/income', '/insights/envelopes', '/insights/savings-rate', '/budget']) {
      await page.goto(BASE + r); await page.waitForLoadState('networkidle'); await page.waitForTimeout(500);
      for (const t of ['Week', '6 months']) {
        if (r === '/insights') { await page.getByRole('tab', { name: t, exact: true }).click({ timeout: 5000 }); await page.waitForTimeout(200); }
      }
      const bad = await page.evaluate(() => {
        const txt = document.body.innerText;
        const attrs = [...document.querySelectorAll('svg *')].flatMap((el) => [...el.attributes].map((a) => a.value)).filter((v) => /NaN|Infinity/.test(v));
        return [/NaN|Infinity/.test(txt) ? 'text' : '', attrs.length ? 'svg ' + attrs.slice(0, 2).join(' ') : ''].filter(Boolean);
      });
      if (bad.length) throw new Error(r + ': ' + bad.join(', '));
      if (r === '/insights' && !(await page.getByText('Nothing spent this month yet.').count())) throw new Error('data was not reset');
    }
  });
  await step(results, 'import the sample backup from Settings', async () => {
    await page.goto(BASE + '/settings'); await page.waitForLoadState('networkidle');
    await page.locator('input[type=file]').setInputFiles(SEED);
    await page.waitForTimeout(1500);
    await page.goto(BASE + '/activity'); await page.waitForLoadState('networkidle');
    await page.locator('[data-row]').filter({ hasText: 'Trader Joe’s' }).first().waitFor({ timeout: 3000 });
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
    await page.getByRole('button', { name: /^Paid in/ }).click(); await page.waitForTimeout(500);
    await page.locator('#log-select').selectOption('EUR'); await page.waitForTimeout(200);
    await run(page, `${theme} paid-in-sheet`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.getByRole('button', { name: /^Date/ }).click(); await page.waitForTimeout(300);
    await run(page, `${theme} date-menu`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Edit Home' }).click(); await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Move Envelopes' }).click(); await page.waitForTimeout(200);
    await run(page, `${theme} edit-home-sheet`);
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.goto(BASE + ROUTES[1]); await page.waitForLoadState('networkidle');
    await page.locator('[data-row]').first().click(); await page.waitForTimeout(500);
    await run(page, `${theme} edit-sheet`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await swipeRow(page, page.locator('[data-row]').first(), 0.6); await page.waitForTimeout(500);
    await run(page, `${theme} move-sheet`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.goto(BASE + '/review'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Dismiss', exact: true }).first().click(); await page.waitForTimeout(500);
    await run(page, `${theme} review-dismiss-sheet`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Edit', exact: true }).click(); await page.waitForTimeout(500);
    await run(page, `${theme} review-edit-sheet`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.goto(BASE + '/insights'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(400);
    await page.getByRole('button', { name: /or more$/ }).click(); await page.waitForTimeout(500);
    await run(page, `${theme} threshold-sheet`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.context().close();
  }
  // Reduced motion: whatever still animates may only fade.
  {
    const ctx = await browser.newContext({ viewport: CONFIGS[0].viewport, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'America/Los_Angeles', isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push('reduced-motion: ' + String(e)));
    page.on('dialog', (d) => d.accept());
    await seed(page);
    const moving = async (label) => {
      const props = await page.evaluate(() => {
        const out = new Set();
        for (const a of document.getAnimations()) {
          if (a.transitionProperty) out.add(a.transitionProperty);
          else for (const k of a.effect?.getKeyframes?.() ?? []) for (const key of Object.keys(k)) if (!['offset', 'easing', 'composite', 'computedOffset'].includes(key)) out.add(key);
        }
        return [...out];
      });
      // Fades of opacity or colour are fine; anything that moves or resizes is not.
      const bad = props.filter((p) => !['opacity', 'color', 'background-color', 'border-color', 'outline-color', 'box-shadow', 'fill', 'stroke'].includes(p));
      if (bad.length) out.push(`reduced motion ${label}: animates ${bad.join(', ')}`);
    };
    const settleShort = () => page.waitForTimeout(60);
    await page.goto(BASE + '/'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(400);
    await page.getByRole('button', { name: /^(Log|Add an expense)/ }).first().click(); await settleShort();
    await moving('opening a sheet');
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    await page.goto(BASE + '/budget'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(400);
    await page.getByRole('region', { name: 'Everyday' }).getByRole('link', { name: /^Grocery/ }).click(); await settleShort();
    await moving('pushing a page');
    await page.goto(BASE + '/review'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Approve', exact: true }).click(); await settleShort();
    await moving('approving a card');
    await page.goto(BASE + '/insights'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(400);
    await page.getByRole('tab', { name: 'Week', exact: true }).click(); await settleShort();
    await moving('switching the period');
    await ctx.close();
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
