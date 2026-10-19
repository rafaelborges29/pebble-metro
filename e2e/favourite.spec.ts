import { test, expect } from './metro-fixture';

test('save a favourite, receive arrivals, and retain it after relaunch', async ({ metro }) => {
  await metro.expectScreen('first-use');
  await metro.press('select');
  await metro.expectScreen('stations');
  await metro.press('down'); // Aeroporto -> Saldanha in the fixture catalogue.
  await metro.press('select'); // One line, so the app opens directions directly.
  await metro.expectScreen('directions');
  await metro.press('down'); // São Sebastião -> Aeroporto.
  await metro.press('select');

  await metro.delivered('arrivals');
  expect(metro.commands).toContainEqual(expect.objectContaining({ type: 'watch', favorite: metro.favourite }));
  expect(metro.subscriptions).toContain('json/vehicleeta/pt-ml/pt-ml-sa/all');
  await metro.expectScreen('arrivals');

  await metro.relaunch();
  await metro.delivered('arrivals');
  await metro.expectScreen('arrivals');
});
