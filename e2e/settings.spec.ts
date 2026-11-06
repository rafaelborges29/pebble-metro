import { test, expect, type Metro } from './metro-fixture';
import type { Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { root } from './emulator';

test('favourites storage survives write failures and torn migration/commit records', async ({}, testInfo) => {
  const executable = testInfo.outputPath('persistence-faults');
  execFileSync('cc', ['-std=c11', '-Wall', '-Wextra', '-Werror', '-I', `${root}/e2e/persistence`, '-I', `${root}/src/c`,
    `${root}/src/c/favorites.c`, `${root}/e2e/persistence/faults.c`, '-o', executable]);
  const result = execFileSync(executable, { encoding: 'utf8' });
  expect(result).toContain('Persistence fault injection passed');
});

async function add(page: Page, station: string, direction = 'pt-ml-ap') {
  await page.getByLabel('Station', { exact: true }).selectOption(station);
  await page.getByLabel('Direction', { exact: true }).selectOption(direction);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
}
async function result(metro: Metro, status: string, after: number) {
  await expect.poll(() => metro.commands.slice(after).filter(command => command.type === 'settings-state' && command.part === 3).at(-1)?.status,
    { message: `Watch completed settings result: ${status}` }).toBe(status);
}

test('bundled settings cancel, duplicate handling, save and reopen preserve watch ownership', async ({ metro }) => {
  await metro.favorites();
  const cancelled = await metro.openSettings();
  await add(cancelled, 'pt-ml-sa');
  await expect(cancelled.getByText('1 / 16', { exact: true })).toBeVisible();
  await add(cancelled, 'pt-ml-sa');
  await expect(cancelled.getByText('That favourite already exists.')).toBeVisible();
  await cancelled.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await metro.favorites()).toEqual([]);
  const config = await metro.openSettings(false); // Older app passes percent-encoded JSON.
  await add(config, 'pt-ml-sa');
  const before = metro.commands.length;
  await config.getByRole('button', { name: 'Send to watch', exact: true }).click();
  await result(metro, 'saved', before);
  expect(await metro.favorites()).toEqual([metro.favourite]);
  await metro.press('select'); // Dismiss phone-save notice.
  await metro.publish([3, 4, 5]);
  await metro.expectScreen('arrivals');
  const reopened = await metro.openSettings(); // Current Android passes already-decoded JSON.
  await expect(reopened.getByText('Favourites saved on watch.')).toBeVisible();
  await expect(reopened.getByText('1 / 16', { exact: true })).toBeVisible();
  await reopened.getByRole('button', { name: 'Cancel', exact: true }).click();
  await metro.relaunch();
  await metro.expectScreen('saved-arrivals', 'arrivals');
  await metro.startPhone();
  expect(await metro.favorites()).toEqual([metro.favourite]);
});

test('a phone draft cannot overwrite a newer on-watch favourite', async ({ metro }) => {
  await metro.favorites();
  const config = await metro.openSettings();
  await add(config, 'pt-ml-ap', 'pt-ml-ss');
  await metro.press('select'); await metro.press('select'); // Line -> stations.
  await metro.press('down'); await metro.press('select'); // Saldanha -> directions.
  await metro.press('down'); await metro.press('select'); // Aeroporto -> save on watch.
  const before = metro.commands.length;
  await config.getByRole('button', { name: 'Send to watch', exact: true }).click();
  await result(metro, 'conflict', before);
  expect(await metro.favorites()).toEqual([metro.favourite]);
  const current = await metro.openSettings();
  await expect(current.getByText('Changed on watch. Review the current list below.')).toBeVisible();
  await expect(current.getByText('1 / 16', { exact: true })).toBeVisible();
});

test('missing fresh snapshots produce a read-only page, never an empty replacement', async ({ metro }) => {
  await metro.favorites(); metro.pauseSettings(true);
  const config = await metro.openSettings();
  await expect(config.getByText(/This page cannot send changes/)).toBeVisible();
  await expect(config.getByRole('button', { name: 'Send to watch', exact: true })).toHaveCount(0);
  metro.pauseSettings(false);
  await config.getByRole('button', { name: 'Close', exact: true }).click();
  expect(await metro.favorites()).toEqual([]);
});

test('a phone runtime restart invalidates an already-open editor without replaying it', async ({ metro }) => {
  await metro.favorites(); const old = await metro.openSettings(); await add(old, 'pt-ml-sa');
  await metro.startPhone(); const before = metro.commands.length;
  await old.getByRole('button', { name: 'Send to watch', exact: true }).click();
  const fresh = await metro.openSettings();
  await expect(fresh.getByText('0 / 16', { exact: true })).toBeVisible();
  expect(metro.commands.slice(before).some(command => command.type === 'settings-state' && command.request! > 0)).toBe(false);
  expect(await metro.favorites()).toEqual([]);
});

test('native validation rejects oversized, duplicate and unserved drafts independently of the phone', async ({ metro }) => {
  await metro.favorites();
  const favorite = ['pt-ml-sa', 'pt-ml-red', 'pt-ml-ap'];
  for (const favorites of [Array.from({ length: 17 }, () => favorite), [favorite, favorite], [['pt-ml-ap', 'pt-ml-red', 'pt-ml-ap']], [['bad station', 'pt-ml-red', 'pt-ml-ap']]]) {
    const config = await metro.openSettings();
    await add(config, 'pt-ml-sa');
    // Alter serialization AFTER real phone validation: only native C can reject this.
    await metro.alterNextSave({ favorites });
    const before = metro.commands.length;
    await config.getByRole('button', { name: 'Send to watch', exact: true }).click();
    await result(metro, 'invalid', before);
    expect(await metro.favorites()).toEqual([]);
  }
});

test('retransmitting an identical save request does not commit twice', async ({ metro }) => {
  await metro.favorites();
  const config = await metro.openSettings();
  await add(config, 'pt-ml-sa');
  const baseline = metro.commands.filter(command => command.type === 'settings-state' && command.part === 3).at(-1)!;
  let before = metro.commands.length;
  await config.getByRole('button', { name: 'Send to watch', exact: true }).click();
  await result(metro, 'saved', before);
  const committed = metro.commands.filter(command => command.type === 'settings-state' && command.part === 3).at(-1)!;
  const retry = await metro.openSettings();
  await metro.alterNextSave({ request: committed.request, revision: baseline.revision, catalog: baseline.catalog,
    favorites: [['pt-ml-sa', 'pt-ml-red', 'pt-ml-ap']] });
  before = metro.commands.length;
  await retry.getByRole('button', { name: 'Send to watch', exact: true }).click();
  await result(metro, 'saved', before);
  expect(metro.commands.filter(command => command.type === 'settings-state' && command.part === 3).at(-1)?.revision).toBe(committed.revision);
  expect(await metro.favorites()).toEqual([metro.favourite]);
});

test('phone edits preserve cached ETA expiry rather than refreshing it', async ({ metro }) => {
  await metro.favorites();
  const config = await metro.openSettings(); await add(config, 'pt-ml-sa');
  let before = metro.commands.length;
  await config.getByRole('button', { name: 'Send to watch', exact: true }).click(); await result(metro, 'saved', before);
  await metro.press('select'); await metro.publish([3, 4, 5]); await metro.expectScreen('arrivals');
  metro.setAutoArrivals(false);
  const unchanged = await metro.openSettings(); before = metro.commands.length;
  await unchanged.getByRole('button', { name: 'Send to watch', exact: true }).click(); await result(metro, 'saved', before);
  await metro.press('select'); await metro.expectScreen('arrivals');
  await metro.relaunch(130); await metro.expectScreen('connecting-saved', 'arrivals');
});

test.describe('hostile source labels', () => {
  test.use({ hostileLabels: true });
  test('catalogue labels remain text, never executable HTML', async ({ metro }) => {
    await metro.favorites(); const config = await metro.openSettings();
    await expect(config.locator('img')).toHaveCount(0);
    await expect(config.getByLabel('Station', { exact: true }).locator('option').filter({ hasText: '</script><img src=x onerror=alert(1)>' })).toHaveCount(1);
    await add(config, 'pt-ml-sa');
    await expect(config.locator('li span')).toContainText('</script><img src=x onerror=alert(1)>');
    await expect(config.locator('img')).toHaveCount(0);
  });
});

test.describe('full phone favourites list', () => {
  test.use({ largeNetwork: true });
  test('catalogue changes reject an open phone draft', async ({ metro }) => {
    await metro.favorites(); const config = await metro.openSettings();
    await config.getByLabel('Line', { exact: true }).selectOption('pt-ml-blue');
    await config.getByRole('button', { name: 'Add', exact: true }).click();
    await metro.removeLine('pt-ml-blue');
    const before = metro.commands.length;
    await config.getByRole('button', { name: 'Send to watch', exact: true }).click();
    await result(metro, 'conflict', before); expect(await metro.favorites()).toEqual([]);
  });
  test('save 16 routes, retain surviving slots, remove all, and restart without resurrection', async ({ metro }) => {
    await metro.favorites();
    const config = await metro.openSettings();
    for (const station of metro.stations.slice(0, 16)) await add(config, station.id, station.id === 'pt-ml-ap' ? 'pt-ml-ss' : 'pt-ml-ap');
    await expect(config.getByText('16 / 16', { exact: true })).toBeVisible();
    await expect(config.getByRole('button', { name: 'Add', exact: true })).toBeDisabled();
    let before = metro.commands.length;
    await config.getByRole('button', { name: 'Send to watch', exact: true }).click();
    await result(metro, 'saved', before);
    expect(await metro.favorites()).toHaveLength(16);
    const removed = await metro.openSettings();
    removed.on('dialog', dialog => dialog.accept());
    await removed.getByRole('button', { name: 'Remove', exact: true }).first().click();
    before = metro.commands.length;
    await removed.getByRole('button', { name: 'Send to watch', exact: true }).click();
    await result(metro, 'saved', before);
    const remaining = await metro.favorites();
    expect(remaining).toHaveLength(15);
    expect(remaining[0].station).toBe(metro.stations[1].id);
    const empty = await metro.openSettings();
    empty.on('dialog', dialog => dialog.accept());
    for (let i = 0; i < 15; i++) await empty.getByRole('button', { name: 'Remove', exact: true }).first().click();
    before = metro.commands.length;
    await empty.getByRole('button', { name: 'Send to watch', exact: true }).click();
    await result(metro, 'saved', before);
    expect(await metro.favorites()).toEqual([]);
    await metro.press('select'); // Notice -> empty; closing at root exits.
    await metro.relaunch(0, 'root');
    await metro.startPhone();
    expect(await metro.favorites()).toEqual([]);
    await metro.expectScreen('first-use');
  });
});

test.describe('Portuguese phone editor', () => {
  test.use({ watchLocale: 'pt_PT' });
  test('uses the watch language and excludes the origin terminus', async ({ metro }) => {
    await metro.favorites();
    const config = await metro.openSettings();
    await expect(config.getByRole('heading', { name: 'Favoritos do Metro' })).toBeVisible();
    await config.getByLabel('Estação', { exact: true }).selectOption('pt-ml-ap');
    await expect(config.getByLabel('Sentido', { exact: true }).locator('option')).toHaveCount(1);
    await expect(config.getByLabel('Sentido', { exact: true })).toHaveValue('pt-ml-ss');
    await config.getByRole('button', { name: 'Adicionar', exact: true }).click();
    const before = metro.commands.length;
    await config.getByRole('button', { name: 'Enviar para o relógio', exact: true }).click();
    await result(metro, 'saved', before);
    expect(await metro.favorites()).toEqual([{ station: 'pt-ml-ap', line: 'pt-ml-red', direction: 'pt-ml-ss' }]);
  });
});
