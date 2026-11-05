import { test, expect, type Page } from '@playwright/test';

async function join(page: Page, name: string) {
  await page.goto('/');
  await page.getByLabel('What should we call you?').fill(name);
  await page.getByRole('button', { name: 'Make yourself at home', exact: true }).click();
  await expect(page.getByText('Connected to your node', { exact: true })).toBeVisible();
}
async function send(page: Page, text: string, channel = 'general') {
  await page.getByRole('textbox', { name: `Message #${channel}`, exact: true }).fill(text);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
}

test('two people can chat, manage a community, search, and recover a portable identity', async ({
  browser,
}, testInfo) => {
  const ownerContext = await browser.newContext(),
    memberContext = await browser.newContext();
  const owner = await ownerContext.newPage(),
    member = await memberContext.newPage();
  const errors: string[] = [];
  owner.on('pageerror', (error) => errors.push(error.message));
  member.on('pageerror', (error) => errors.push(error.message));
  await join(owner, 'Avery');
  await join(member, 'River');
  await expect(owner.getByText('ONLINE — 2')).toBeVisible();
  await send(owner, 'A little constellation of good ideas. **Welcome home.**');
  await expect(member.locator('.message-text').filter({ hasText: 'A little constellation' })).toBeVisible();
  await send(member, 'Here for the good conversations. And the small memory footprint.');
  const riverMessage = owner.locator('.message').filter({ hasText: 'Here for the good conversations.' });
  await expect(riverMessage).toBeVisible();
  await riverMessage.hover();
  await riverMessage.getByRole('button', { name: 'Add reaction', exact: true }).click();
  await riverMessage.getByRole('button', { name: 'React 🎉', exact: true }).click();
  await expect(member.getByRole('button', { name: '🎉 reaction, 1', exact: true })).toBeVisible();
  await riverMessage.hover();
  await riverMessage.getByRole('button', { name: 'Reply', exact: true }).click();
  await send(owner, 'That sounds like a pretty good start.');
  await expect(member.locator('.reply-quote').filter({ hasText: 'River' })).toBeVisible();
  const ownMessage = owner.locator('.message').filter({ hasText: 'That sounds like a pretty good start.' });
  await ownMessage.hover();
  await ownMessage.getByRole('button', { name: 'Edit message', exact: true }).click();
  await ownMessage
    .getByRole('textbox', { name: 'Edit message', exact: true })
    .fill('That sounds like a very good start.');
  await owner.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(
    member.locator('.message-text').filter({ hasText: 'That sounds like a very good start.' }),
  ).toBeVisible();
  // Hold an older REST snapshot while a newer message arrives over the socket.
  let releaseSnapshot: (() => void) | undefined;
  const captured = new Promise<void>((resolve) => {
    void owner.route(
      '**/api/channels/default-0/messages',
      async (route) => {
        const response = await route.fetch();
        await new Promise<void>((release) => {
          releaseSnapshot = release;
          resolve();
        });
        await route.fulfill({ response });
      },
      { times: 1 },
    );
  });
  await owner.getByRole('button', { name: 'introductions', exact: true }).click();
  await owner.getByRole('button', { name: 'general', exact: true }).click();
  await captured;
  await send(member, 'Still here while history catches up.');
  await expect(
    owner.locator('.message-text').filter({ hasText: 'Still here while history catches up.' }),
  ).toBeVisible();
  releaseSnapshot?.();
  await owner.waitForResponse((response) => response.url().endsWith('/api/channels/default-0/messages'));
  await expect(
    owner.locator('.message-text').filter({ hasText: 'Still here while history catches up.' }),
  ).toBeVisible();
  await owner.getByRole('button', { name: 'Create text channel', exact: true }).click();
  await owner.getByLabel('Channel name', { exact: true }).fill('feature-lab');
  await owner.getByLabel('Topic').fill('Small experiments. Useful ideas.');
  await owner.getByRole('button', { name: 'Create channel', exact: true }).click();
  await expect(owner.getByRole('textbox', { name: 'Message #feature-lab', exact: true })).toBeVisible();
  await send(owner, 'Our next experiment starts here.', 'feature-lab');
  await member.getByRole('button', { name: /^feature-lab/ }).click();
  await expect(
    member.locator('.message-text').filter({ hasText: 'Our next experiment starts here.' }),
  ).toBeVisible();
  await owner.getByRole('button', { name: 'Search messages', exact: true }).click();
  await owner.getByRole('textbox', { name: 'Search message history', exact: true }).fill('constellation');
  await expect(owner.locator('.search-result')).toHaveCount(1);
  await owner.locator('.search-result').click();
  await expect(owner.getByRole('textbox', { name: 'Message #general', exact: true })).toBeVisible();
  await owner.getByRole('button', { name: 'Open settings', exact: true }).click();
  await owner.getByRole('button', { name: 'Appearance', exact: true }).click();
  await owner.getByRole('button', { name: 'lilac', exact: true }).click();
  await expect(owner.locator('html')).toHaveAttribute('data-accent', 'lilac');
  await owner.getByLabel('Compact conversations').check();
  await owner.getByRole('button', { name: 'mint', exact: true }).click();
  await owner.getByLabel('Compact conversations').uncheck();
  await owner.getByRole('button', { name: 'Your identity', exact: true }).click();
  await owner.getByLabel('Backup passphrase', { exact: true }).fill('a-passphrase-for-ui-testing-only');
  const downloaded = owner.waitForEvent('download');
  await owner.getByRole('button', { name: 'Download encrypted backup', exact: true }).click();
  const download = await downloaded;
  const backupPath = testInfo.outputPath('identity.encrypted.json');
  await download.saveAs(backupPath);
  await owner.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await owner.screenshot({ path: 'artifacts/raeen-desktop.png', fullPage: true });
  const recoveredContext = await browser.newContext();
  const recovered = await recoveredContext.newPage();
  await recovered.goto('/');
  await recovered.getByRole('button', { name: 'Already have an identity? Import it', exact: true }).click();
  await recovered.getByLabel('Identity backup', { exact: true }).setInputFiles(backupPath);
  await recovered.getByLabel('Backup passphrase', { exact: true }).fill('a-passphrase-for-ui-testing-only');
  await recovered.getByRole('button', { name: 'Make yourself at home', exact: true }).click();
  await expect(recovered.getByText('Connected to your node', { exact: true })).toBeVisible();
  await expect(recovered.locator('.user-name b')).toHaveText('Avery');
  await expect(recovered.getByRole('button', { name: 'Create text channel', exact: true })).toBeVisible();
  await owner.reload();
  await expect(owner.getByText('Connected to your node', { exact: true })).toBeVisible();
  await expect(owner.locator('.message-text').filter({ hasText: 'A little constellation' })).toBeVisible();
  expect(errors).toEqual([]);
  await recoveredContext.close();
  await ownerContext.close();
  await memberContext.close();
});

test('mobile navigation and voice setup state remain usable without overflow', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.screenshot({ path: 'artifacts/raeen-welcome-mobile.png', fullPage: true });
  await join(page, 'Juniper');
  await expect(page.getByRole('textbox', { name: 'Message #general', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/raeen-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Open community canvas', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Draggable channel gallery' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/raeen-canvas-mobile.png', fullPage: true });
  await page
    .getByRole('navigation', { name: 'Canvas channels' })
    .getByRole('button', { name: 'Preview #general', exact: true })
    .click();
  await expect(
    page.getByRole('dialog').getByText('A little bit of everything. Make yourself at home.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Open channel', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Message #general', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show channels', exact: true }).click();
  await page.getByRole('button', { name: 'The Lounge', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View node setup', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View node setup', exact: true }).click();
  await page.getByRole('button', { name: 'Community node', exact: true }).click();
  await expect(page.getByText('Awaiting setup', { exact: true })).toBeVisible();
  await context.close();
});

test('the Phantom canvas opens real channels, supports dragging, and preserves chat drafts', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors: string[] = [],
    foreignRequests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:3011/') && !request.url().startsWith('data:'))
      foreignRequests.push(request.url());
  });
  await join(page, 'Canvas Explorer');
  await page
    .getByRole('textbox', { name: 'Message #general', exact: true })
    .fill('A thought to come back to.');
  await page.getByRole('button', { name: 'Open community canvas', exact: true }).click();
  const gallery = page.getByRole('group', { name: 'Draggable channel gallery' });
  await expect(gallery).toBeVisible();
  await expect(page.locator('.phantom-cell').first()).toBeAttached();
  expect(await page.locator('.phantom-cell').count()).toBeLessThan(120);
  const brokenImages = await page.locator('.phantom-cell img').evaluateAll(async (images) => {
    await Promise.all(images.map((image) => (image as HTMLImageElement).decode()));
    return images.filter((image) => !(image as HTMLImageElement).naturalWidth).length;
  });
  expect(brokenImages).toBe(0);
  await page.screenshot({ path: 'artifacts/raeen-canvas-desktop.png', fullPage: true });
  const rect = await gallery.boundingBox();
  if (!rect) throw new Error('Gallery has no viewport');
  const before = await page.locator('.phantom-cell').first().getAttribute('style');
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2 + 140, rect.y + rect.height / 2 + 60, { steps: 12 });
  await page.mouse.up();
  expect(await page.locator('.phantom-cell').first().getAttribute('style')).not.toBe(before);
  expect(await page.locator('.phantom-cell').count()).toBeLessThan(120);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Recenter canvas', exact: true }).click();
  const tile = await page.locator('.phantom-cell').evaluateAll((cells) => {
    return cells
      .map((cell) => {
        const box = cell.getBoundingClientRect();
        const x = box.left + box.width / 2,
          y = box.top + box.height / 2;
        return {
          x,
          y,
          title: cell.getAttribute('aria-label')?.replace('Preview ', ''),
          clickable: cell.contains(document.elementFromPoint(x, y)),
        };
      })
      .find((cell) => cell.clickable && cell.y > 350 && cell.y < 650);
  });
  if (!tile) throw new Error('No visible gallery card');
  await page.mouse.click(tile.x, tile.y);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: tile.title, exact: true }),
  ).toBeVisible();
  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: tile.title, exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const navigation = page.getByRole('navigation', { name: 'Canvas channels' });
  await navigation.getByRole('button', { name: 'Preview #general', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Open channel', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Message #general', exact: true })).toHaveValue(
    'A thought to come back to.',
  );
  await expect(page.locator('.phantom-stage')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open community canvas', exact: true }).click();
  await navigation.getByRole('button', { name: 'Preview The Lounge', exact: true }).click();
  await page.getByRole('button', { name: 'Open channel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View node setup', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  expect(foreignRequests).toEqual([]);
  await context.close();
});
