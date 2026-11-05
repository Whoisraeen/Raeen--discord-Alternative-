import { test, expect, type Page } from '@playwright/test';

async function joinVoice(page: Page, name: string) {
  await page.goto('/');
  await page.getByLabel('What should we call you?').fill(name);
  await page.getByRole('button', { name: 'Make yourself at home', exact: true }).click();
  await expect(page.getByText('Connected to your node', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'The Lounge', exact: true }).click();
  await page.getByRole('button', { name: 'Join voice channel', exact: true }).click();
  await expect(page.getByText('Voice connected', { exact: true })).toBeVisible();
}

test('two clients exchange real WebRTC audio through LiveKit and can mute, deafen, and leave', async ({
  browser,
}) => {
  const a = await browser.newContext(),
    b = await browser.newContext();
  const first = await a.newPage(),
    second = await b.newPage();
  const errors: string[] = [];
  first.on('pageerror', (error) => errors.push(error.message));
  second.on('pageerror', (error) => errors.push(error.message));
  await joinVoice(first, 'Voice Pilot');
  await joinVoice(second, 'Voice Friend');
  await expect(first.locator('.voice-person')).toHaveCount(2);
  await expect(second.locator('.voice-person')).toHaveCount(2);
  for (const page of [first, second]) {
    await expect(page.locator('#raeen-remote-audio audio')).toHaveCount(1);
    await expect
      .poll(
        () =>
          page.locator('#raeen-remote-audio audio').evaluate((audio: HTMLAudioElement) => audio.currentTime),
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);
  }
  await first.getByRole('button', { name: 'Mute microphone', exact: true }).click();
  await expect(first.getByRole('button', { name: 'Unmute microphone', exact: true })).toBeVisible();
  await first.getByRole('button', { name: 'Toggle deafen', exact: true }).click();
  await expect(first.locator('#raeen-remote-audio audio')).toHaveJSProperty('muted', true);
  await first.getByRole('button', { name: 'Toggle deafen', exact: true }).click();
  await expect(first.locator('#raeen-remote-audio audio')).toHaveJSProperty('muted', false);
  await first.getByRole('button', { name: 'Unmute microphone', exact: true }).click();
  await first.screenshot({ path: 'artifacts/raeen-voice.png', fullPage: true });
  await first.getByRole('button', { name: 'general', exact: true }).click();
  await expect(first.getByText('Voice connected', { exact: true })).toBeVisible();
  await expect(first.locator('#raeen-remote-audio audio')).toHaveCount(1);
  await first.getByRole('button', { name: 'Disconnect voice', exact: true }).click();
  await expect(first.getByText('Voice connected', { exact: true })).toHaveCount(0);
  await expect(second.locator('.voice-person')).toHaveCount(1);
  await second.getByRole('button', { name: 'Leave voice', exact: true }).click();
  await expect(second.getByRole('button', { name: 'Join voice channel', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  await a.close();
  await b.close();
});
