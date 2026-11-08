import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { API } from '../src/common/metro.js';
import { BROKER } from '../src/pkjs/feed.js';
import { root } from './emulator';
import { test, expect } from './metro-fixture';

test('PBW opts into native permissions with only the two required UnderLX hosts', async () => {
  const source: { pebble: { usesPermissions: unknown } } = JSON.parse(readFileSync(`${root}/package.json`, 'utf8'));
  const info: Record<string, unknown> = JSON.parse(execFileSync('python3', ['-c', `
from pathlib import Path
from zipfile import ZipFile
with ZipFile(Path('build') / (Path.cwd().name + '.pbw')) as bundle:
    print(bundle.read('appinfo.json').decode())
`], { cwd: root, encoding: 'utf8' }));
  const hosts = [new URL(API).hostname, new URL(BROKER).hostname];
  expect(hosts).toEqual(['api.underlx.com', 'perturbacoes.pt']);
  expect(info.manifestVersion).toBe(2);
  expect(info.usesPermissions).toEqual(hosts.map(host => ({
    name: 'Internet', parameters: { domains: [host] }, required: true, reason: expect.stringMatching(/\S/),
  })));
  expect(info.usesPermissions).toEqual(source.pebble.usesPermissions);
});

test('package preflight rejects legacy, missing or broadened permission metadata', async () => {
  execFileSync('python3', ['-c', `
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile
from tools.release_package import verify_pbw
source = Path('build') / (Path.cwd().name + '.pbw')
version = json.loads(Path('package.json').read_text())['version']
verify_pbw(source, version)
with TemporaryDirectory(prefix='metro-permissions-') as directory:
    for case in ('legacy', 'missing', 'broadened'):
        candidate = Path(directory) / (case + '.pbw')
        with ZipFile(source) as original, ZipFile(candidate, 'w') as altered:
            for entry in original.infolist():
                data = original.read(entry.filename)
                if entry.filename == 'appinfo.json':
                    info = json.loads(data)
                    if case == 'legacy': info['manifestVersion'] = 1
                    elif case == 'missing': info.pop('usesPermissions')
                    else: info['usesPermissions'].append({'name': 'Location'})
                    data = json.dumps(info).encode()
                altered.writestr(entry, data)
        try:
            verify_pbw(candidate, version)
        except ValueError as error:
            assert 'permission' in str(error), str(error)
        else:
            raise AssertionError('Preflight accepted ' + case + ' permissions')
`], { cwd: root, encoding: 'utf8' });
});

test.describe('native network access denied', () => {
  test.use({ internetAllowed: false });
  test('granting access recovers on the same Settings page without saving or replaying', async ({ metro, page }) => {
    const config = await metro.openSettings();
    await expect(config.getByRole('status')).toHaveText('Keep Metro connected and open, then refresh. No changes have been sent.');
    await expect(config.getByRole('button', { name: 'Add favourite', exact: true })).toBeDisabled();
    expect(metro.subscriptions).toEqual([]);
    metro.setInternetAllowed(true);
    // Observe the production 30-second metadata retry without restarting PKJS.
    await expect.poll(() => page.evaluate(() => localStorage.getItem('metro.network.v1')), { timeout: 40_000 }).not.toBeNull();
    await metro.delivered('catalog');
    await config.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(config.getByRole('button', { name: 'Add favourite', exact: true })).toBeEnabled();
    expect(await metro.favorites()).toEqual([]);
    expect(metro.commands.some(command => command.type === 'settings-save')).toBe(false);
    expect(metro.settingsCloses).toBe(0);
  });
});
