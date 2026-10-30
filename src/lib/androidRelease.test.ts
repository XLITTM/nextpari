import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readAndroidRelease, shouldShowAndroidBanner, type AndroidReleaseView } from './androidRelease.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

const published: AndroidReleaseView = {
  published: true,
  versionCode: 2,
  versionName: '0.3.0',
  releaseNotes: 'Заметки',
  sizeBytes: 1000,
  releasedAt: '2026-10-28T12:00:00.000Z',
  effectiveOn: '2026-10-28',
  sha256: 'ab'.repeat(32),
  minSdk: 26,
  downloadPath: '/api/android/release/download',
  banner: { enabled: true, title: 'Nextpari для Android', body: 'Скачайте официальное приложение' },
  update: { mode: 'recommended', minimumVersionCode: 2 },
};

describe('android download banner policy', () => {
  it('hides the banner until a published release enables it', () => {
    assert.equal(shouldShowAndroidBanner({ release: { published: false }, pathname: '/', dismissedVersion: null }), false);
    assert.equal(shouldShowAndroidBanner({
      release: { ...published, banner: { ...published.banner, enabled: false } },
      pathname: '/',
      dismissedVersion: null,
    }), false);
  });

  it('remembers dismissal and stays off inside games and the download page', () => {
    assert.equal(shouldShowAndroidBanner({ release: published, pathname: '/', dismissedVersion: '2' }), false);
    assert.equal(shouldShowAndroidBanner({ release: published, pathname: '/games/blackjack', dismissedVersion: null }), false);
    assert.equal(shouldShowAndroidBanner({ release: published, pathname: '/download', dismissedVersion: null }), false);
    assert.equal(shouldShowAndroidBanner({ release: published, pathname: '/', dismissedVersion: '1' }), true);
  });

  it('rejects a release that points somewhere other than the official download path', () => {
    assert.deepEqual(readAndroidRelease({ published: false }), { published: false });
    assert.deepEqual(readAndroidRelease({ ...published, downloadPath: 'https://evil.example/app.apk' }), { published: false });
  });

  it('keeps the banner out of staff portals and names the PWA separately', () => {
    const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');
    const portal = app.indexOf('if (portal)');
    const banner = app.indexOf('<AndroidDownloadBanner />');
    assert.equal(portal > 0 && banner > portal, true);
    const pwa = readFileSync(join(root, 'src/components/InstallPwaPrompt.tsx'), 'utf8');
    assert.equal(pwa.includes('Установить веб-приложение'), true);
    assert.equal(pwa.includes('aria-label="Скачать приложение"'), false);
    const games = readFileSync(join(root, 'src/components/games/GamesHub.tsx'), 'utf8');
    assert.equal(games.includes('href="/download"'), true);
    assert.equal(games.includes('/api/android/release/download'), false);
  });
});
