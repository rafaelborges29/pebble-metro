import { test, expect, type Metro } from './metro-fixture';
import type { Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { root } from './emulator';

test('favourites storage survives write failures and torn migration/commit records', async ({}, testInfo) => {
  const executable = testInfo.outputPath('persistence-faults');
  execFileSync('cc', ['-std=c11', '-Wall', '-Wextra', '-Werror', '-I', `${root}/e2e/persistence`, '-I', `${root}/src/c`,
    `${root}/src/c/favorites.c`, `${root}/e2e/persistence/faults.c`, '-o', executable]);
  expect(execFileSync(executable, { encoding: 'utf8' })).toContain('Persistence fault injection passed');
});

test('phone copy uses complete matching keyed translation tables', async () => {
  const english = JSON.parse(readFileSync(`${root}/src/pkjs/locales/en.json`, 'utf8')) as Record<string, string>;
  const portuguese = JSON.parse(readFileSync(`${root}/src/pkjs/locales/pt_PT.json`, 'utf8')) as Record<string, string>;
  expect(Object.keys(portuguese).sort()).toEqual(Object.keys(english).sort());
  for (const dictionary of [english, portuguese]) for (const [key, value] of Object.entries(dictionary)) {
    expect(key).toMatch(/^[a-z]+(?:\.[a-z]+)*$/); expect(typeof value).toBe('string'); expect(value.trim()).not.toBe(''); expect(() => encodeURIComponent(value)).not.toThrow();
  }
  const page = readFileSync(`${root}/src/pkjs/settings-page.js`, 'utf8');
  for (const match of page.matchAll(/\b(?:t|button|select)\("([a-z.]+)"(?=[,)])/g)) expect(english[match[1]]).toBeTruthy();
  for (const status of ['connecting', 'ready', 'saving', 'saved', 'duplicate', 'conflict', 'invalid', 'storage', 'unknown', 'unavailable', 'expired', 'busy', 'bridge'])
    expect(english[`status.${status}`]).toBeTruthy();
});

async function choose(page: Page, station: string, direction = 'pt-ml-ap') {
  await expect(page.getByRole('button', { name: 'Add favourite', exact: true })).toBeEnabled();
  await page.getByLabel('Station', { exact: true }).selectOption(station);
  await page.getByLabel('Direction', { exact: true }).selectOption(direction);
}
async function saved(page: Page) { await expect(page.getByRole('status')).toHaveText('Saved on watch'); }
async function add(page: Page, station: string, direction = 'pt-ml-ap') {
  await choose(page, station, direction);
  await page.getByRole('button', { name: 'Add favourite', exact: true }).click();
  await saved(page);
}
async function result(metro: Metro, status: string, after: number) {
  await expect.poll(() => metro.commands.slice(after).filter(command => command.type === 'settings-state' && command.part === 3).at(-1)?.status,
    { message: `Watch completed settings result: ${status}` }).toBe(status);
}

test('Add saves immediately without closing, duplicates do not write, Done does not save a picker draft', async ({ metro }) => {
  await metro.favorites();
  const cancelled = await metro.openSettings(); await choose(cancelled, 'pt-ml-sa');
  await cancelled.getByRole('button', { name: 'Done', exact: true }).click();
  expect(await metro.favorites()).toEqual([]); expect(metro.settingsCloses).toBe(1);
  const config = await metro.openSettings(); await add(config, 'pt-ml-sa');
  expect(metro.settingsCloses).toBe(1); expect(config.isClosed()).toBe(false);
  expect(await metro.favorites()).toEqual([metro.favourite]);
  const before = metro.commands.length;
  await choose(config, 'pt-ml-sa'); await config.getByRole('button', { name: 'Add favourite', exact: true }).click();
  await expect(config.getByRole('status')).toHaveText('That favourite already exists.');
  expect(metro.commands.slice(before).some(command => command.type === 'settings-state' && command.request! > 1)).toBe(false);
  await metro.publish([3, 4, 5]); await metro.expectScreen('arrivals'); // No success notice to dismiss.
  await metro.relaunch(); await metro.expectScreen('saved-arrivals', 'arrivals');
  await metro.startPhone(); expect(await metro.favorites()).toEqual([metro.favourite]);
});

test('phone saves and failures leave watch actions and picker screens quiet', async ({ metro }) => {
  await metro.favorites(); const config = await metro.openSettings(); await add(config, 'pt-ml-sa');
  await metro.publish([3, 4, 5]); await metro.press('select'); await metro.expectScreen('actions');
  await add(config, 'pt-ml-ap', 'pt-ml-ss'); await metro.expectScreen('actions');
  await metro.alterNextSave({ favorites: [['pt-ml-ap', 'pt-ml-red', 'pt-ml-ap']] });
  await choose(config, 'pt-ml-ss'); const before = metro.commands.length;
  await config.getByRole('button', { name: 'Add favourite', exact: true }).click();
  await result(metro, 'invalid', before);
  await expect(config.getByRole('status')).toHaveText('Invalid changes were not saved.');
  await metro.expectScreen('actions'); expect(metro.settingsCloses).toBe(0);
  await metro.press('back'); await metro.press('back');
  await metro.press('up'); await metro.press('up'); await metro.press('select');
  await metro.expectScreen('lines');
  await add(config, 'pt-ml-ss'); await metro.expectScreen('lines');
});

test('removing the selected route invalidates an old watch removal confirmation without a popup', async ({ metro }) => {
  await metro.favorites(); const config = await metro.openSettings();
  await add(config, 'pt-ml-sa'); await add(config, 'pt-ml-ap', 'pt-ml-ss');
  await metro.publish([3, 4, 5]);
  await metro.press('select'); await metro.press('down'); await metro.press('select');
  await metro.expectScreen('remove-confirmation');
  config.on('dialog', dialog => dialog.accept());
  await config.getByRole('button', { name: 'Remove', exact: true }).first().click(); await saved(config);
  await expect.poll(() => metro.commands.filter(command => command.type === 'watch').at(-1)?.favorite?.station).toBe('pt-ml-ap');
  await metro.publish([7, 8, 9]); await metro.expectScreen('airport-arrivals-only');
  expect(await metro.favorites()).toEqual([{ station: 'pt-ml-ap', line: 'pt-ml-red', direction: 'pt-ml-ss' }]);
});

test('a stale phone selection cannot overwrite a newer on-watch favourite and can retry on the same page', async ({ metro }) => {
  await metro.favorites(); const config = await metro.openSettings(); await choose(config, 'pt-ml-ap', 'pt-ml-ss');
  await metro.press('select'); await metro.press('select'); await metro.press('down'); await metro.press('select');
  await metro.press('down'); await metro.press('select');
  const before = metro.commands.length;
  await config.getByRole('button', { name: 'Add favourite', exact: true }).click();
  await result(metro, 'conflict', before);
  await expect(config.getByRole('status')).toHaveText('Changed on watch. The list has been refreshed; try again.');
  expect(await metro.favorites()).toEqual([metro.favourite]);
  await expect(config.getByText('1 / 16', { exact: true })).toBeVisible();
  await add(config, 'pt-ml-ap', 'pt-ml-ss'); expect(await metro.favorites()).toHaveLength(2); expect(metro.settingsCloses).toBe(0);
});

test('missing fresh snapshots disable editing and Refresh recovers without closing', async ({ metro }) => {
  await metro.favorites(); metro.pauseSettings(true);
  const config = await metro.openSettings();
  await expect(config.getByRole('status')).toHaveText('Keep Metro connected and open, then refresh. No changes have been sent.');
  await expect(config.getByRole('button', { name: 'Add favourite', exact: true })).toBeDisabled();
  metro.pauseSettings(false);
  await config.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(config.getByRole('button', { name: 'Add favourite', exact: true })).toBeEnabled();
  expect(await metro.favorites()).toEqual([]); expect(metro.settingsCloses).toBe(0);
});

test.describe('live bridge unavailable', () => {
  test.use({ liveSettings: false });
  test('explains the preview requirement and never falls back to closing to save', async ({ metro }) => {
    await metro.favorites(); const config = await metro.openSettings();
    await expect(config.getByRole('status')).toContainText('Plugins / permissions preview');
    await expect(config.getByRole('button', { name: 'Add favourite', exact: true })).toBeDisabled();
    expect(await metro.favorites()).toEqual([]); expect(metro.settingsCloses).toBe(0);
    await config.getByRole('button', { name: 'Done', exact: true }).click(); expect(metro.settingsCloses).toBe(1);
  });
});

test('a phone runtime restart expires an open page instead of replaying it', async ({ metro }) => {
  await metro.favorites(); const old = await metro.openSettings(); await choose(old, 'pt-ml-sa');
  await metro.startPhone(); const before = metro.commands.length;
  await old.getByRole('button', { name: 'Add favourite', exact: true }).click();
  await expect(old.getByRole('status')).toHaveText('This settings session ended. Reopen Settings to continue.');
  const fresh = await metro.openSettings(); await expect(fresh.getByText('0 / 16', { exact: true })).toBeVisible();
  expect(metro.commands.slice(before).some(command => command.type === 'settings-state' && command.request! > 0)).toBe(false);
});

test('native validation rejects oversized, duplicate and unserved saves independently of the phone', async ({ metro }) => {
  await metro.favorites(); const config = await metro.openSettings(); const favorite = ['pt-ml-sa', 'pt-ml-red', 'pt-ml-ap'];
  for (const favorites of [Array.from({ length: 17 }, () => favorite), [favorite, favorite], [['pt-ml-ap', 'pt-ml-red', 'pt-ml-ap']], [['bad station', 'pt-ml-red', 'pt-ml-ap']]]) {
    await choose(config, 'pt-ml-sa'); await metro.alterNextSave({ favorites }); const before = metro.commands.length;
    await config.getByRole('button', { name: 'Add favourite', exact: true }).click();
    await result(metro, 'invalid', before);
    await expect(config.getByRole('status')).toHaveText('Invalid changes were not saved.');
    expect(await metro.favorites()).toEqual([]);
  }
});

test('an unacknowledged save is unknown, blocks duplicate actions and recovers by reading without replay', async ({ metro }) => {
  await metro.favorites(); const config = await metro.openSettings(); await choose(config, 'pt-ml-sa');
  metro.pauseSettings(true);
  await config.getByRole('button', { name: 'Add favourite', exact: true }).click();
  await expect(config.getByRole('status')).toHaveText('Saving to watch…');
  await expect(config.getByRole('button', { name: 'Add favourite', exact: true })).toBeDisabled();
  await expect(config.getByRole('button', { name: 'Done', exact: true })).toBeDisabled();
  await expect(config.getByRole('status')).toHaveText('Save result unknown. Refresh to check the watch before retrying.', { timeout: 20000 });
  metro.pauseSettings(false); await config.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(config.getByRole('status')).toHaveText('Up to date');
  expect(await metro.favorites()).toEqual([metro.favourite]); expect(metro.settingsCloses).toBe(0);
});

test('retransmitting identical request bytes does not commit twice', async ({ metro }) => {
  await metro.favorites(); const config = await metro.openSettings(); await choose(config, 'pt-ml-sa');
  const baseline = metro.commands.filter(command => command.type === 'settings-state' && command.part === 3).at(-1)!;
  await config.getByRole('button', { name: 'Add favourite', exact: true }).click(); await saved(config);
  const committed = metro.commands.filter(command => command.type === 'settings-state' && command.part === 3).at(-1)!;
  await choose(config, 'pt-ml-ap', 'pt-ml-ss');
  await metro.alterNextSave({ request: committed.request, revision: baseline.revision, catalog: baseline.catalog,
    favorites: [['pt-ml-sa', 'pt-ml-red', 'pt-ml-ap']] });
  const before = metro.commands.length;
  await config.getByRole('button', { name: 'Add favourite', exact: true }).click(); await result(metro, 'saved', before);
  expect(metro.commands.filter(command => command.type === 'settings-state' && command.part === 3).at(-1)?.revision).toBe(committed.revision);
  await expect(config.getByRole('status')).toHaveText('Save result unknown. Refresh to check the watch before retrying.', { timeout: 20000 });
  expect(await metro.favorites()).toEqual([metro.favourite]);
});

test('phone edits preserve cached ETA expiry rather than refreshing it', async ({ metro }) => {
  await metro.favorites(); const config = await metro.openSettings(); await add(config, 'pt-ml-sa');
  await metro.publish([3, 4, 5]); await metro.expectScreen('arrivals'); metro.setAutoArrivals(false);
  // No-op replacement through the real live bridge, after server-side validation.
  await choose(config, 'pt-ml-ap', 'pt-ml-ss'); await metro.alterNextSave({ favorites: [['pt-ml-sa', 'pt-ml-red', 'pt-ml-ap']] });
  await config.getByRole('button', { name: 'Add favourite', exact: true }).click(); await saved(config);
  await metro.expectScreen('arrivals'); await metro.relaunch(130); await metro.expectScreen('connecting-saved', 'arrivals');
});

test.describe('hostile source labels', () => {
  test.use({ hostileLabels: true });
  test('catalogue labels remain text, never executable HTML', async ({ metro }) => {
    await metro.favorites(); const config = await metro.openSettings(); await choose(config, 'pt-ml-sa');
    await expect(config.locator('img')).toHaveCount(0);
    await expect(config.getByLabel('Station', { exact: true }).locator('option').filter({ hasText: '</script><img src=x onerror=alert(1)>' })).toHaveCount(1);
    await config.getByRole('button', { name: 'Add favourite', exact: true }).click(); await saved(config);
    await expect(config.locator('.route h3')).toContainText('</script><img src=x onerror=alert(1)>');
    await expect(config.locator('img')).toHaveCount(0);
  });
});

test.describe('full phone favourites list', () => {
  test.use({ largeNetwork: true });
  test('catalogue changes reject an open selection and Refresh loads replacement controls', async ({ metro }) => {
    await metro.favorites(); const config = await metro.openSettings();
    await expect(config.getByRole('button', { name: 'Add favourite', exact: true })).toBeEnabled();
    await config.getByLabel('Line', { exact: true }).selectOption('pt-ml-blue');
    await metro.removeLine('pt-ml-blue'); const before = metro.commands.length;
    await config.getByRole('button', { name: 'Add favourite', exact: true }).click(); await result(metro, 'conflict', before);
    await expect(config.getByRole('status')).toHaveText('Changed on watch. The list has been refreshed; try again.');
    await expect(config.getByLabel('Line', { exact: true }).locator('option[value="pt-ml-blue"]')).toHaveCount(0);
    expect(await metro.favorites()).toEqual([]);
  });
  test('save 16 routes, retain surviving slots, remove all, and restart without resurrection', async ({ metro }) => {
    await metro.favorites(); const config = await metro.openSettings();
    for (const station of metro.stations.slice(0, 16)) await add(config, station.id, station.id === 'pt-ml-ap' ? 'pt-ml-ss' : 'pt-ml-ap');
    await expect(config.getByText('16 / 16', { exact: true })).toBeVisible();
    await expect(config.getByRole('button', { name: 'Add favourite', exact: true })).toBeDisabled();
    expect(await metro.favorites()).toHaveLength(16);
    config.on('dialog', dialog => dialog.accept());
    await config.getByRole('button', { name: 'Remove', exact: true }).first().click(); await saved(config);
    const remaining = await metro.favorites(); expect(remaining).toHaveLength(15); expect(remaining[0].station).toBe(metro.stations[1].id);
    for (let i = 0; i < 15; i++) { await config.getByRole('button', { name: 'Remove', exact: true }).first().click(); await saved(config); }
    expect(await metro.favorites()).toEqual([]); expect(metro.settingsCloses).toBe(0);
    await metro.relaunch(0, 'root'); await metro.startPhone(); expect(await metro.favorites()).toEqual([]); await metro.expectScreen('first-use');
  });
});

test.describe('Portuguese phone editor', () => {
  test.use({ watchLocale: 'pt_PT' });
  test('uses keyed Portuguese copy and excludes the origin terminus', async ({ metro }) => {
    await metro.favorites(); const config = await metro.openSettings();
    await expect(config.getByRole('heading', { name: 'Favoritos', exact: true })).toBeVisible();
    await expect(config.getByRole('button', { name: 'Adicionar favorito', exact: true })).toBeEnabled();
    await config.getByLabel('Estação', { exact: true }).selectOption('pt-ml-ap');
    await expect(config.getByLabel('Sentido', { exact: true }).locator('option')).toHaveCount(1);
    await expect(config.getByLabel('Sentido', { exact: true })).toHaveValue('pt-ml-ss');
    await config.getByRole('button', { name: 'Adicionar favorito', exact: true }).click();
    await expect(config.getByRole('status')).toHaveText('Guardado no relógio');
    expect(await metro.favorites()).toEqual([{ station: 'pt-ml-ap', line: 'pt-ml-red', direction: 'pt-ml-ss' }]); expect(metro.settingsCloses).toBe(0);
  });
});
