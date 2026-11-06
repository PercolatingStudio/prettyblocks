import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(repositoryRoot, path), 'utf8');
const readJson = path => JSON.parse(read(path));
const manifest = readJson('_dev/package.json');
const packageLock = readJson('_dev/package-lock.json');
const yarnLock = read('_dev/yarn.lock');
const viteConfig = read('_dev/vite.config.mjs');
const iframeConfig = read('_dev/vite.config.prettyblocks.mjs');
const legacyBrowserTargets = ['chrome87', 'edge88', 'firefox78', 'safari14'];

function yarnStanza(selector) {
  const start = yarnLock.indexOf(`${selector}:\n`);
  assert.notEqual(start, -1, `Missing ${selector} in _dev/yarn.lock`);
  const end = yarnLock.indexOf('\n\n', start);

  return yarnLock.slice(start, end === -1 ? undefined : end);
}

function configuredTargets(source, configName) {
  const match = source.match(/\btarget\s*:\s*\[([^\]]+)\]/);
  assert.ok(match, `${configName} must set an explicit browser target`);

  return [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map(result => result[1]);
}

test('keeps both Vite 8 bundles on the Vite 5 browser contract', () => {
  assert.deepEqual(configuredTargets(viteConfig, 'vite.config.mjs'), legacyBrowserTargets);
  assert.deepEqual(
    configuredTargets(iframeConfig, 'vite.config.prettyblocks.mjs'),
    legacyBrowserTargets,
  );
});

test('locks Vite 8 consistently for npm and Yarn', () => {
  const viteRange = manifest.dependencies.vite;
  assert.match(viteRange, /^\^8(?:\.\d+){0,2}$/);
  assert.equal(packageLock.packages[''].dependencies.vite, viteRange);

  const npmVite = packageLock.packages['node_modules/vite'];
  assert.match(npmVite.version, /^8\./);
  assert.equal(npmVite.engines.node, manifest.engines.node);
  assert.match(yarnStanza(`vite@${viteRange}`), /\n  version "8\.[^"]+"(?:\n|$)/);
});

test('uses a Vite 8-aware Vue plugin on the same Node runtime', () => {
  const pluginRange = manifest.dependencies['@vitejs/plugin-vue'];
  assert.equal(packageLock.packages[''].dependencies['@vitejs/plugin-vue'], pluginRange);

  const npmPlugin = packageLock.packages['node_modules/@vitejs/plugin-vue'];
  assert.match(npmPlugin.version, /^6\./);
  assert.equal(npmPlugin.engines.node, manifest.engines.node);
  assert.match(npmPlugin.peerDependencies.vite, /\^8\.0\.0/);
  assert.match(npmPlugin.peerDependencies.vue, /\^3\.2\.25/);
  assert.match(
    yarnStanza(`"@vitejs/plugin-vue@${pluginRange}"`),
    /\n  version "6\.[^"]+"(?:\n|$)/,
  );
});
