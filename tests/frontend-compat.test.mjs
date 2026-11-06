import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = path => JSON.parse(readFileSync(resolve(repositoryRoot, path), 'utf8'));
const manifest = readJson('_dev/package.json');
const packageLock = readJson('_dev/package-lock.json');
const yarnLock = readFileSync(resolve(repositoryRoot, '_dev/yarn.lock'), 'utf8');

function yarnStanza(selector) {
  const start = yarnLock.indexOf(`${selector}:\n`);
  assert.notEqual(start, -1, `Missing ${selector} in _dev/yarn.lock`);
  const end = yarnLock.indexOf('\n\n', start);
  return yarnLock.slice(start, end === -1 ? undefined : end);
}

test('keeps the V3 editor on VueQuill 1 and its Quill 1 runtime', () => {
  assert.equal(manifest.dependencies['@vueup/vue-quill'], '1.2.0');

  assert.equal(packageLock.packages[''].dependencies['@vueup/vue-quill'], '1.2.0');
  const npmVueQuill = packageLock.packages['node_modules/@vueup/vue-quill'];
  assert.equal(npmVueQuill.version, '1.2.0');
  assert.equal(npmVueQuill.dependencies.quill, '^1.3.7');
  assert.match(
    packageLock.packages['node_modules/@vueup/vue-quill/node_modules/quill'].version,
    /^1\./,
  );

  assert.match(yarnStanza('"@vueup/vue-quill@1.2.0"'), /\n  version "1\.2\.0"(?:\n|$)/);
  assert.match(yarnStanza('"@vueup/vue-quill@1.2.0"'), /\n    quill "\^1\.3\.7"(?:\n|$)/);
  assert.match(yarnStanza('quill@^1.3.7'), /\n  version "1\.[^"]+"(?:\n|$)/);
});
