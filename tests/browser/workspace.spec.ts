import { test, expect, type Page } from '@playwright/test';
async function join(page: Page, name: string) {
  await page.goto('/');
  await page.getByLabel('What should we call you?').fill(name);
  await page.getByRole('button', { name: 'Make yourself at home', exact: true }).click();
  await expect(page.getByText('Connected to your node', { exact: true })).toBeVisible();
}
async function home(page: Page) {
  if (
    (await page.getByRole('button', { name: 'Show channels', exact: true }).isVisible()) &&
    !(await page.locator('.channel-sidebar').evaluate((e) => e.classList.contains('mobile-open')))
  )
    await page.getByRole('button', { name: 'Show channels', exact: true }).click();
  await page.getByRole('button', { name: 'Community home', exact: false }).click();
  await expect(page.getByRole('heading', { name: /Good to see you/ })).toBeVisible();
}
async function screen(page: Page, label: string) {
  const desktop = page.locator('.hub-nav');
  await ((await desktop.isVisible()) ? desktop : page.locator('.hub-mobile-tabs'))
    .getByRole('button', { name: label, exact: true })
    .click();
  await expect(page.locator('.hub-page h1')).toBeVisible();
}

test('community tools use real data, preserve drafts, and persist private plans and budget records', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  const foreign: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('request', (r) => {
    if (r.url().startsWith('http') && new URL(r.url()).origin !== 'http://127.0.0.1:3011')
      foreign.push(r.url());
  });
  await join(page, 'Marin');
  await page
    .getByRole('textbox', { name: 'Message #general', exact: true })
    .fill('An unfinished thought for later.');
  await home(page);
  await page.getByRole('button', { name: 'Find a channel', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Spotlight Search' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('dialog', { name: 'Spotlight Search' })).toContainText('general');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Spotlight Search' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Find a channel', exact: true })).toBeFocused();
  await screen(page, 'People');
  await page.getByPlaceholder('Find a member').fill('Nobody-with-this-name');
  await expect(page.getByRole('heading', { name: 'No familiar faces yet' })).toBeVisible();
  await page.getByRole('button', { name: 'Show everyone', exact: true }).click();
  await screen(page, 'Planner');
  await page.getByLabel('What are you planning?', { exact: false }).fill('Friday co-op');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Save plan', exact: true }).click();
  await expect(page.locator('.hub-plan').filter({ hasText: 'Friday co-op' })).toBeVisible();
  await page.locator('.hub-plan').getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Friday co-op' })).toBeVisible();
  await page.getByRole('button', { name: 'Close details', exact: true }).click();
  await screen(page, 'Hosting budget');
  await page.getByLabel('Description', { exact: true }).fill('Community contribution');
  await page.getByLabel('Amount (USD)', { exact: true }).fill('12');
  await page.getByRole('button', { name: 'Entry type' }).click();
  await page.getByRole('option', { name: 'Contribution received', exact: true }).click();
  await page.getByRole('button', { name: 'Save local record', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Local record saved', exact: true })).toBeVisible();
  await page.getByLabel('Description', { exact: true }).fill('VPS cost');
  await page.getByLabel('Amount (USD)', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Entry type' }).click();
  await page.getByRole('option', { name: 'Hosting cost', exact: true }).click();
  await page.getByRole('button', { name: 'Save local record', exact: true }).click();
  await expect(
    page
      .locator('.hub-panel')
      .filter({ has: page.getByRole('heading', { name: 'The hosting reserve', exact: true }) })
      .getByText('$7.00', { exact: true }),
  ).toBeVisible();
  await screen(page, 'Your node');
  await expect(page.getByText(/Last response:/)).toBeVisible();
  await expect(page.getByText('Community snapshot', { exact: true })).toBeVisible();
  await screen(page, 'Field guide');
  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  await page.getByLabel('Backup passphrase', { exact: true }).fill('workspace-backup-test-passphrase');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download encrypted backup', exact: true }).click();
  const backup = await downloaded;
  const backupPath = testInfo.outputPath('backup.encrypted.json');
  await backup.saveAs(backupPath);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByLabel('Backup check passphrase', { exact: true }).fill('workspace-backup-test-passphrase');
  await page.locator('.hub-page input[type=file]').setInputFiles(backupPath);
  await expect(page.getByText('Backup matches your current identity', { exact: true })).toBeVisible();
  await page.getByLabel('Private reminder', { exact: true }).fill('Remember to back up the node.');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.locator('.hub-private-note')).toContainText('Remember to back up the node.');
  await page.getByRole('button', { name: 'Delete private reminder', exact: true }).click();
  await expect(page.locator('.hub-private-note')).toHaveCount(0);
  await page
    .getByRole('navigation', { name: 'Main Navigation' })
    .getByRole('button', { name: 'Back to chat', exact: true })
    .click();
  await expect(page.getByRole('textbox', { name: 'Message #general', exact: true })).toHaveValue(
    'An unfinished thought for later.',
  );
  await page.reload();
  await expect(page.getByText('Connected to your node', { exact: true })).toBeVisible();
  await home(page);
  await screen(page, 'Planner');
  await expect(page.locator('.hub-plan')).toContainText('Friday co-op');
  await screen(page, 'Hosting budget');
  await expect(
    page
      .locator('.hub-panel')
      .filter({ has: page.getByRole('heading', { name: 'The hosting reserve', exact: true }) })
      .getByText('$7.00', { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('hosting-budget.png') });
  expect(foreign).toEqual([]);
  expect(errors).toEqual([]);
});

test('all appearance treatments work and restore points recover the selected backdrop', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await join(page, 'Sage');
  await home(page);
  await screen(page, 'Appearance');
  const effects = [
    'Dot garden',
    'Interactive dots',
    'Meteor trails',
    'Shooting stars',
    'Sparkles',
    'Warp',
    'Glyph rain',
    'Living shape',
    'Evil eye',
    'Nimbu mirchi',
    'Cursor halo',
    'None',
  ];
  for (const effect of effects) {
    const trigger = page.locator('button[aria-haspopup="listbox"]');
    await trigger.click();
    await page.getByRole('option', { name: effect, exact: true }).click();
    await expect(trigger).toContainText(effect);
  }
  await page.getByRole('button', { name: 'Save a restore point', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restore point saved', exact: true })).toBeVisible();
  await page.locator('button[aria-haspopup="listbox"]').click();
  await page.getByRole('option', { name: 'Dot garden', exact: true }).click();
  await page.getByRole('button', { name: /Restore version/ }).click();
  await expect(page.locator('button[aria-haspopup="listbox"]')).toContainText('None');
  await page.screenshot({ path: '/tmp/raeen-appearance-tested.png' });
  expect(errors).toEqual([]);
});

test('workspace screens fit a phone and reduced motion avoids ambient canvas animation', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await join(page, 'Juniper');
  await home(page);
  await page.getByRole('button', { name: 'Open Workspace navigation', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Navigation', exact: true })
    .getByRole('button', { name: 'People', exact: true })
    .click();
  await expect(page.getByRole('dialog', { name: 'Navigation', exact: true })).toHaveCount(0);

  for (const label of [
    'People',
    'Planner',
    'Your node',
    'Hosting budget',
    'Appearance',
    'Field guide',
    'Overview',
  ]) {
    await screen(page, label);
    await expect(page.locator('.hub-page h1')).toBeVisible();
    const size = await page
      .locator('.hub-scroll')
      .evaluate((e) => ({ client: e.clientWidth, scroll: e.scrollWidth }));
    expect(size.scroll, `${label} horizontal overflow`).toBeLessThanOrEqual(size.client + 1);
  }
  await page.screenshot({ path: testInfo.outputPath('community-mobile.png') });
  expect(errors).toEqual([]);
});
