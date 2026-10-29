import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './emulator';
import { test, expect, type Favourite, type Metro } from './metro-fixture';

const captureAssets = process.env.METRO_CAPTURE_ASSETS === '1';
async function captureStoreScreen(metro: Metro, name: string) {
  if (!captureAssets) return;
  const directory = resolve(root, 'assets/appstore');
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, `emery_${name}.png`), await metro.screenshot());
}

async function expectSelection(metro: Metro, favourite: Favourite, after: number) {
  await expect.poll(() => metro.commands.slice(after).filter(command => command.type === 'watch').at(-1)?.favorite,
    { message: `Native watch selection: ${favourite.station} -> ${favourite.direction}` }).toEqual(favourite);
}

async function saveFavourite(metro: Metro, large = false) {
  await metro.expectScreen('first-use');
  await metro.press('select'); // First use goes directly to stations.
  await metro.expectScreen(large ? 'stations-large' : 'stations');
  await metro.press('down'); // Aeroporto -> Saldanha in the alphabetical catalogue.
  await metro.press('select'); // One line: directions open without a line menu.
  await metro.expectScreen('directions');
  await metro.press('down'); // São Sebastião -> Aeroporto.
  const before = metro.commands.length;
  await metro.press('select');
  await expectSelection(metro, metro.favourite, before);
  await metro.delivered('arrivals');
  expect(metro.subscriptions).toContain('json/vehicleeta/pt-ml/pt-ml-sa/all');
  await metro.expectScreen('arrivals');
}

async function addStation(metro: Metro, row: number): Promise<Favourite> {
  await metro.press('back'); // Arrivals -> favourites; row zero is selected.
  // The last three rows are Add favourite, Retry data, About (no settings).
  for (let i = 0; i < 3; i++) await metro.press('up');
  await metro.press('select');
  for (let i = 0; i < row; i++) await metro.press('down');
  await metro.press('select');
  const station = metro.stations[row].id;
  // Termini exclude the origin; all other stations offer both red termini.
  if (station !== 'pt-ml-ap' && station !== 'pt-ml-ss') await metro.press('down');
  const favourite = { station, line: 'pt-ml-red', direction: station === 'pt-ml-ap' ? 'pt-ml-ss' : 'pt-ml-ap' };
  const before = metro.commands.length;
  await metro.press('select');
  await expectSelection(metro, favourite, before);
  await metro.publish([3, 4, 5]);
  return favourite;
}

async function switchFavourite(metro: Metro, button: 'up' | 'down', favourite: Favourite) {
  const before = metro.commands.length;
  await metro.press(button);
  await expectSelection(metro, favourite, before);
}

test('reopen immediately from the watch cache, then receive fresh arrivals', async ({ metro }) => {
  await saveFavourite(metro);
  await captureStoreScreen(metro, 'arrivals');
  if (captureAssets) {
    await metro.publish([42, 95, 180], 's');
    await captureStoreScreen(metro, 'seconds');
    await metro.publish([3, 4, 5]);
    await metro.expectScreen('arrivals');
  }
  await metro.relaunch();
  await metro.expectScreen('saved-arrivals', 'arrivals');
  await captureStoreScreen(metro, 'saved');
  await metro.expectAnimation('arrivals');
  await metro.startPhone();
  await metro.delivered('arrivals');
  await metro.expectScreen('arrivals');
  await metro.press('select');
  await metro.expectScreen('actions'); // Only Retry live data and Remove favourite.
  await metro.press('back');
  await metro.press('back');
  await metro.expectScreen('favourites');
  await metro.press('select');
  if (captureAssets) {
    await addStation(metro, 0);
    await metro.press('back');
    await captureStoreScreen(metro, 'favourites');
  }
});

test('revisiting a RAM-only route persists it without waiting for another source update', async ({ metro }) => {
  await saveFavourite(metro);
  const b = await addStation(metro, 0);
  const c = await addStation(metro, 2);
  expect(b.station).not.toBe(c.station);
  metro.setAutoArrivals(false);
  await switchFavourite(metro, 'down', metro.favourite); // A was evicted by B/C, but is still valid in RAM.
  await metro.expectScreen('saved-ram-route', 'arrivals');
  await metro.relaunch(); // No intervening MQTT arrival can make this pass accidentally.
  await metro.expectScreen('saved-ram-route', 'arrivals');
});

test('a phone-only runtime restart re-handshakes while the watch stays open', async ({ metro }) => {
  await saveFavourite(metro);
  const hellos = metro.commands.filter(command => command.type === 'hello').length;
  await metro.startPhone(); // Keep the native process and physical app connection alive.
  await metro.delivered('arrivals');
  await metro.expectScreen('arrivals');
  expect(metro.commands.filter(command => command.type === 'hello').length).toBeGreaterThan(hellos);
});

test('expired arrivals stay hidden after 130 seconds spent closed', async ({ metro }) => {
  await saveFavourite(metro);
  await metro.relaunch(130);
  await metro.expectScreen('connecting-saved', 'arrivals');
  await metro.startPhone();
  await metro.delivered('arrivals');
  await metro.expectScreen('arrivals');
});

test('ranges and bounds remain estimates; Due and empty updates cannot invent arrivals', async ({ metro }) => {
  await saveFavourite(metro);
  await metro.publish([150, 330, 510], 's', 'i');
  await metro.expectScreen('arrival-range');
  await metro.publish([330, 510, 690], 's', 'l');
  await metro.expectScreen('arrival-upper-bound');
  await metro.publish([330, 510, 690], 's', 'm');
  await metro.expectScreen('arrival-lower-bound');
  await metro.publish([0], 's');
  await metro.expectScreen('estimated-now');
  await metro.publish([]);
  await metro.expectScreen('no-estimate');
  await metro.relaunch();
  await metro.expectScreen('connecting-saved', 'arrivals');
});

test.describe('full native data budget', () => {
  test.use({ largeNetwork: true });
  test('metadata replacement safely resets an open interchange picker', async ({ metro }) => {
    await saveFavourite(metro, true);
    await metro.press('back');
    for (let i = 0; i < 3; i++) await metro.press('up');
    await metro.press('select');
    const station = metro.stations.findIndex(station => station.id === 'pt-ml-z41');
    expect(station).toBeGreaterThan(0);
    for (let i = 0; i < station; i++) await metro.press('down');
    await metro.press('select'); // Z41 has red and blue lines.
    await metro.press('down'); // Highlight the line that the source will remove.
    await metro.removeLine('pt-ml-blue');
    await metro.expectScreen('catalog-updated');
    await metro.press('select');
    await metro.expectScreen('favourites');
    await metro.press('select');
    await metro.expectScreen('arrivals');
  });
  test('16 real-button favourites survive 160 switches, source updates and relaunch without heap growth', async ({ metro }) => {
    test.setTimeout(180_000);
    expect(metro.stations).toHaveLength(50);
    await saveFavourite(metro, true);
    const favourites = [metro.favourite];
    // Add the other fifteen distinct stations via the actual native menus.
    for (let row = 0; row < 16; row++) if (row !== 1) favourites.push(await addStation(metro, row));
    expect(new Set(favourites.map(favourite => JSON.stringify(favourite))).size).toBe(16);

    let selected = 15;
    for (let i = 0; i < 160; i++) {
      // Whole cycles in BOTH directions exercise all slots and wraparound,
      // rather than just toggling between two cached favourites.
      const button = i % 32 < 16 ? 'down' : 'up';
      selected = (selected + (button === 'down' ? 1 : 15)) % 16;
      await switchFavourite(metro, button, favourites[selected]);
      // New source data, including second-precision rendering, during churn.
      if (i % 8 === 0) await metro.publish([90 + i, 150 + i, 210 + i], 's');
    }
    const switches = () => metro.memory.filter(sample => sample.reason.startsWith('switch'));
    await expect.poll(() => switches().length, { message: 'Native switch heap samples through switch 176' }).toBe(12);
    expect(metro.memory.some(sample => sample.reason === 'catalog')).toBe(true);
    // Creation accounts for 16 selections. Allow another 32 switches for
    // lazy system fonts/SDK allocations, then bound the entire high-water range.
    const steady = switches().slice(3);
    const used = steady.map(sample => sample.used);
    expect(Math.max(...used) - Math.min(...used), 'Heap stabilizes after warmup').toBeLessThanOrEqual(4096);

    // Make the two most recently visited routes deterministic before closing.
    await switchFavourite(metro, 'down', favourites[0]);
    await metro.publish([3, 4, 5]);
    await switchFavourite(metro, 'up', favourites[15]);
    await metro.publish([3, 4, 5]);
    await metro.relaunch();
    await metro.expectScreen('saved-full-favourites', 'arrivals');
    await metro.press('down');
    await metro.expectScreen('saved-first-favourite', 'arrivals');
    await metro.press('down');
    await metro.expectScreen('uncached-favourite', 'arrivals'); // Other routes were RAM-only.

    const before = metro.commands.length;
    await metro.startPhone();
    await expectSelection(metro, favourites[1], before);
    selected = 1;
    // Verify every persisted route ID and wraparound, not just the last
    // screen or phone storage. Aeroporto also needs the opposite destination.
    for (let i = 0; i < 16; i++) {
      selected = (selected + 1) % 16;
      await switchFavourite(metro, 'down', favourites[selected]);
    }
    await metro.publish([3, 4, 5]);
    await metro.press('back');
    await metro.expectScreen('full-favourites');
    for (let i = 0; i < 3; i++) await metro.press('up');
    await metro.press('select');
    await metro.expectScreen('favourites-limit');
    await metro.press('back');
    expect(metro.memory.filter(sample => sample.reason === 'ready')).toHaveLength(2);
    expect(Math.min(...metro.memory.map(sample => sample.free)), 'At least 50 KiB heap headroom throughout').toBeGreaterThanOrEqual(50 * 1024);
  });
});
