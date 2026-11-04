import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './emulator';
import { test, expect, type Favourite, type Metro } from './metro-fixture';

const captureAssets = process.env.METRO_CAPTURE_ASSETS === '1';
async function captureStoreScreen(metro: Metro, name: string) {
  if (!captureAssets) return;
  const directory = resolve(root, 'assets/appstore');
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, `${metro.platform}_${name}.png`), await metro.screenshot());
}

async function expectSelection(metro: Metro, favourite: Favourite | null, after: number) {
  await expect.poll(() => metro.commands.slice(after).filter(command => command.type === 'watch').at(-1)?.favorite,
    { message: favourite ? `Native watch selection: ${favourite.station} -> ${favourite.direction}` : 'No native favourite selected' }).toEqual(favourite);
}

async function expectSubscription(metro: Metro, station: string | null) {
  await expect.poll(() => metro.activeSubscriptions, { message: 'Only the selected station is subscribed' })
    .toEqual(station ? [`json/vehicleeta/pt-ml/${station}/all`] : []);
}

async function removeFavourite(metro: Metro) {
  await metro.press('select'); // Arrivals -> actions.
  await metro.press('down');
  await metro.press('select');
  await metro.expectScreen('remove-confirmation');
  await metro.press('down'); // Explicitly confirm, rather than keep the favourite.
  await metro.press('select');
}

async function withDeferredArrival<T>(metro: Metro, values: number[], action: () => Promise<T>): Promise<T> {
  const gate = metro.deferNextArrival();
  // Attach rejection handling immediately while the real send is deliberately stalled.
  const pending = Promise.allSettled([metro.publish(values)]);
  try {
    await gate.wait();
    return await action();
  } finally {
    gate.release();
    const [result] = await pending;
    if (result.status === 'rejected') throw result.reason;
  }
}

async function saveFavourite(metro: Metro, { large = false, waitForData = true } = {}) {
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
  await expectSubscription(metro, metro.favourite.station);
  if (waitForData) {
    await metro.delivered('arrivals');
    await metro.expectScreen('arrivals');
  }
}

async function addStation(metro: Metro, row: number, { waitForData = true, direction = '' } = {}): Promise<Favourite> {
  await metro.press('back'); // Arrivals -> favourites; row zero is selected.
  // The last three rows are Add favourite, Retry data, About (no settings).
  for (let i = 0; i < 3; i++) await metro.press('up');
  await metro.press('select');
  for (let i = 0; i < row; i++) await metro.press('down');
  await metro.press('select');
  const station = metro.stations[row].id;
  // Termini exclude the origin; all other stations offer both red termini.
  direction ||= station === 'pt-ml-ap' ? 'pt-ml-ss' : 'pt-ml-ap';
  if (station !== 'pt-ml-ap' && station !== 'pt-ml-ss' && direction === 'pt-ml-ap') await metro.press('down');
  const favourite = { station, line: 'pt-ml-red', direction };
  const before = metro.commands.length;
  await metro.press('select');
  await expectSelection(metro, favourite, before);
  if (waitForData) await metro.publish([3, 4, 5]);
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

test('About shows provider/licence URLs and privacy/notices locations; removal confirmation remains navigable', async ({ metro }) => {
  await saveFavourite(metro);
  await metro.press('back');
  await metro.press('up'); // About is the last root row.
  await metro.press('select');
  await metro.expectScreen('about');
  await metro.press('select');
  await metro.press('down'); // Wrap from About to the favourite.
  await metro.press('select');
  await metro.press('select');
  await metro.press('down');
  await metro.press('select');
  await metro.expectScreen('remove-confirmation');
  await metro.press('select'); // Keep the favourite.
  await metro.press('back');
  await metro.expectScreen('arrivals');
});

test.describe('favourite lifecycle', () => {
  test('add a route after data has loaded, wait for its own arrivals and retain both caches', async ({ metro }) => {
    await saveFavourite(metro);
    metro.setAutoArrivals(false);
    const b = await addStation(metro, 0, { waitForData: false });
    await expectSubscription(metro, b.station);
    await metro.expectScreen('airport-loading', 'arrivals');
    await metro.expectAnimation('arrivals');
    await metro.publish([7, 8, 9]);
    await metro.expectScreen('airport-arrivals');
    await metro.relaunch();
    await metro.expectScreen('airport-saved', 'arrivals');
    await metro.press('up');
    await metro.expectScreen('saved-first-of-two', 'arrivals');
  });

  test('add a route while the first is loading; late first-route data cannot populate the second', async ({ metro }) => {
    metro.setAutoArrivals(false);
    await saveFavourite(metro, { waitForData: false });
    await metro.expectScreen('loading-arrivals', 'arrivals');
    await withDeferredArrival(metro, [11, 12, 13], async () => {
      const b = await addStation(metro, 0, { waitForData: false });
      await expectSubscription(metro, b.station);
      await metro.expectScreen('airport-loading', 'arrivals');
    });
    await metro.expectScreen('airport-loading', 'arrivals'); // A really reached native C, but B is still empty.
    await metro.publish([7, 8, 9]);
    await metro.expectScreen('airport-arrivals');
    await switchFavourite(metro, 'up', metro.favourite);
    await metro.expectScreen('saved-late-first', 'arrivals'); // The late data belongs to A, not B.
  });

  for (const replacement of [false, true]) {
    test(`queued invalidation survives station switching${replacement ? ' and coalescing with a newer snapshot' : ''}`, async ({ metro }) => {
      await saveFavourite(metro);
      metro.setAutoArrivals(false);
      const b = await addStation(metro, 0, { waitForData: false });
      await metro.publish([7, 8, 9]);
      await switchFavourite(metro, 'up', metro.favourite);
      await metro.publish([3, 4, 5]);
      const consumed = await withDeferredArrival(metro, [11, 12, 13], async () => {
        let consumed = await metro.queueStation([]); // A's empty update is serialized BEHIND the held batch.
        if (replacement) consumed = await metro.queueStation([{ direction: metro.favourite.direction, values: [13, 14, 15] }]);
        await switchFavourite(metro, 'down', b); // Pruning must not erase the pending invalidation obligation.
        await expectSubscription(metro, b.station);
        return consumed;
      });
      await consumed(); // Assert the empty snapshot (or its newer replacement) actually reached native C.
      await metro.expectScreen('airport-saved', 'arrivals'); // An A-only invalidation must not clear B.
      await switchFavourite(metro, 'up', metro.favourite);
      await metro.expectScreen(replacement ? 'saved-replaced-first' : 'no-estimate-first-of-two', replacement ? 'arrivals' : undefined);
      await metro.relaunch(); // No fresh source data may hide a RAM or durable-cache resurrection.
      await metro.expectScreen(replacement ? 'saved-replaced-first' : 'connecting-first-of-two', 'arrivals');
      await metro.press('down');
      await metro.expectScreen('airport-saved', 'arrivals');
    });
  }

  test('remove a loading route with data in flight without overwriting the surviving route', async ({ metro }) => {
    await saveFavourite(metro);
    metro.setAutoArrivals(false);
    await addStation(metro, 0, { waitForData: false });
    await metro.expectScreen('airport-loading', 'arrivals');
    await withDeferredArrival(metro, [7, 8, 9], async () => {
      const before = metro.commands.length;
      await removeFavourite(metro);
      await expectSelection(metro, metro.favourite, before);
      await expectSubscription(metro, metro.favourite.station);
      await metro.expectScreen('favourites');
    });
    await metro.expectScreen('favourites'); // Late data must not recreate the removed row.
    await metro.press('select');
    await metro.expectScreen('saved-arrivals', 'arrivals'); // No fresh A update was supplied on fallback.
    await metro.publish([3, 4, 5]);
    await metro.expectScreen('arrivals');
    await metro.relaunch();
    await metro.expectScreen('saved-arrivals', 'arrivals');
  });

  test('remove the first loaded route and persist the remaining nonzero slot across reopen', async ({ metro }) => {
    await saveFavourite(metro);
    metro.setAutoArrivals(false);
    const b = await addStation(metro, 0, { waitForData: false });
    await metro.publish([7, 8, 9]);
    await switchFavourite(metro, 'up', metro.favourite);
    await metro.publish([3, 4, 5]);
    await metro.expectScreen('first-of-two');
    const before = metro.commands.length;
    await removeFavourite(metro);
    await expectSelection(metro, b, before);
    await expectSubscription(metro, b.station);
    await metro.expectScreen('airport-only-favourite');
    await metro.press('select');
    await metro.expectScreen('airport-saved-only', 'arrivals');
    await metro.relaunch();
    await metro.expectScreen('airport-saved-only', 'arrivals');
    await metro.startPhone();
    await metro.publish([7, 8, 9]);
    await metro.expectScreen('airport-arrivals-only');
    await switchFavourite(metro, 'up', b);
    await switchFavourite(metro, 'down', b);
    await metro.expectScreen('airport-arrivals-only');
  });

  test('remove the last loaded favourite, ignore its late data and re-add it without resurrecting cache', async ({ metro }) => {
    await saveFavourite(metro);
    metro.setAutoArrivals(false);
    await withDeferredArrival(metro, [11, 12, 13], async () => {
      const before = metro.commands.length;
      await removeFavourite(metro);
      await expectSelection(metro, null, before);
      await expectSubscription(metro, null);
      await metro.expectScreen('empty-favourites');
    });
    await metro.expectScreen('empty-favourites');
    await metro.relaunch(0, 'root');
    await metro.expectScreen('connecting', 'empty');
    await metro.startPhone();
    await metro.expectScreen('first-use');
    await expectSubscription(metro, null);
    await saveFavourite(metro, { waitForData: false });
    await metro.expectScreen('loading-arrivals', 'arrivals');
    await metro.publish([3, 4, 5]);
    await metro.expectScreen('arrivals');
  });

  test('adding the same station, line and direction selects the existing favourite without duplicating it', async ({ metro }) => {
    await saveFavourite(metro);
    const subscriptions = metro.subscriptions.length;
    expect(await addStation(metro, 1)).toEqual(metro.favourite);
    await metro.expectScreen('arrivals'); // Still 1/1, not a duplicate 2/2.
    await expectSubscription(metro, metro.favourite.station);
    expect(metro.subscriptions).toHaveLength(subscriptions);
    await metro.press('back');
    await metro.expectScreen('favourites');
    await metro.relaunch(0, 'root');
    await metro.expectScreen('saved-arrivals', 'arrivals');
  });

  test('opposite directions share one station subscription but retain their own arrivals', async ({ metro }) => {
    await saveFavourite(metro);
    metro.setAutoArrivals(false);
    const subscriptions = metro.subscriptions.length;
    const b = await addStation(metro, 1, { waitForData: false, direction: 'pt-ml-ss' });
    await metro.expectScreen('opposite-loading', 'arrivals');
    // MQTT publishes a whole station snapshot; separate direction updates would correctly clear the other direction.
    await metro.publishStation([
      { direction: metro.favourite.direction, values: [3, 4, 5] },
      { direction: b.direction, values: [7, 8, 9] },
    ]);
    await metro.expectScreen('opposite-arrivals');
    await switchFavourite(metro, 'up', metro.favourite);
    await metro.expectScreen('first-of-two'); // Same continuously subscribed station remains LIVE.
    await switchFavourite(metro, 'down', b);
    await metro.expectScreen('opposite-arrivals');
    await removeFavourite(metro);
    await metro.expectScreen('favourites');
    await metro.press('select');
    await metro.expectScreen('arrivals'); // Removing the other direction must not discard this live snapshot.
    await expectSubscription(metro, metro.favourite.station);
    expect(metro.subscriptions).toHaveLength(subscriptions);
  });

  test('cancel adding a route while waiting without changing the favourite or station subscription', async ({ metro }) => {
    metro.setAutoArrivals(false);
    await saveFavourite(metro, { waitForData: false });
    const subscriptions = metro.subscriptions.length;
    await metro.press('back');
    for (let i = 0; i < 3; i++) await metro.press('up');
    await metro.press('select'); // Station picker.
    await metro.press('select'); // Aeroporto -> direction picker, but do not save.
    await metro.press('back');
    await metro.press('back'); // Favourites, with Add still highlighted.
    await metro.press('up');
    const before = metro.commands.length;
    await metro.press('select');
    await expectSelection(metro, metro.favourite, before);
    await metro.expectScreen('loading-arrivals', 'arrivals');
    await expectSubscription(metro, metro.favourite.station);
    expect(metro.subscriptions).toHaveLength(subscriptions);
    await metro.publish([3, 4, 5]);
    await metro.expectScreen('arrivals');
    await metro.press('back');
    await metro.expectScreen('favourites');
  });
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
    await saveFavourite(metro, { large: true });
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
    await saveFavourite(metro, { large: true });
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
    await metro.expectScreen('favourites-add-limit'); // Two-digit 17/19 stays visible on Round 2.
    await metro.press('select');
    await metro.expectScreen('favourites-limit');
    await metro.press('back');
    expect(metro.memory.filter(sample => sample.reason === 'ready')).toHaveLength(2);
    expect(Math.min(...metro.memory.map(sample => sample.free)), 'At least 50 KiB heap headroom throughout').toBeGreaterThanOrEqual(50 * 1024);
  });
});
