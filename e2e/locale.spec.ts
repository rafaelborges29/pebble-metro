import { test, expect } from './metro-fixture';

for (const locale of ['pt_PT', 'fr_FR']) {
  test.describe(`watch locale ${locale}`, () => {
    test.use({ watchLocale: locale });
    test('native language selection, menus, estimates, saved data and removal', async ({ metro }) => {
      await metro.expectScreen('first-use');
      await metro.press('select');
      await metro.expectScreen('lines');
      await metro.press('select'); // Vermelha -> its stations.
      await metro.expectScreen('stations');
      await metro.press('down');
      await metro.press('select');
      await metro.expectScreen('directions');
      await metro.press('down');
      await metro.press('select');
      await metro.delivered('arrivals');
      await metro.expectScreen('arrivals');
      expect(metro.commands.filter(c => c.type === 'watch').at(-1)?.favorite).toEqual(metro.favourite);
      await metro.relaunch();
      await metro.expectScreen('saved-arrivals', 'arrivals');
      await metro.startPhone();
      await metro.publish([3, 4, 5]);
      await metro.expectScreen('arrivals');
      await metro.press('select');
      await metro.expectScreen('actions');
      await metro.press('down');
      await metro.press('select');
      await metro.expectScreen('remove-confirmation');
      await metro.press('select'); // Keep favourite.
      await metro.press('back');
      await metro.press('back');
      await metro.expectScreen('favourites'); // Favourite, Add and Retry only.
      await metro.press('select');
      metro.setAutoArrivals(false);
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
    });
  });
}

for (const locale of ['pt_PT', 'fr_FR']) {
  test.describe(`watch locale ${locale} catalogue notice`, () => {
    test.use({ watchLocale: locale, largeNetwork: true });
    test('line picker and metadata replacement notice', async ({ metro }) => {
      await metro.press('select');
      await metro.expectScreen('locale-lines'); // Four available lines, before choosing a station.
      await metro.press('down'); // Azul.
      await metro.press('select');
      await metro.expectScreen('stations-blue'); // Only the two stations on Azul.
      await metro.press('select');
      await metro.expectScreen('directions-blue-second'); // The origin terminus is excluded.
      await metro.removeLine('pt-ml-blue');
      await metro.expectScreen('catalog-updated');
    });
  });
}
