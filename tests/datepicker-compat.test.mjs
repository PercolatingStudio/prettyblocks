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
const fieldRepeater = read('_dev/src/components/FieldRepeater.vue');

function versionParts(version, label) {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, `${label} must use a semantic version, got ${version}`);

  return match.slice(1).map(Number);
}

function yarnStanza(selector) {
  const start = yarnLock.indexOf(`${selector}:\n`);
  assert.notEqual(start, -1, `Missing ${selector} in _dev/yarn.lock`);
  const end = yarnLock.indexOf('\n\n', start);

  return yarnLock.slice(start, end === -1 ? undefined : end);
}

test('locks Vue Datepicker 14 to a compatible Vue runtime in both lockfiles', () => {
  const datepickerRange = manifest.dependencies['@vuepic/vue-datepicker'];
  assert.match(datepickerRange, /^\^14(?:\.\d+){0,2}$/, 'Datepicker must stay on the compatible v14 major');
  assert.equal(packageLock.packages[''].dependencies['@vuepic/vue-datepicker'], datepickerRange);

  const npmDatepicker = packageLock.packages['node_modules/@vuepic/vue-datepicker'];
  const npmVue = packageLock.packages['node_modules/vue'];
  assert.equal(versionParts(npmDatepicker.version, 'npm Datepicker')[0], 14);
  assert.match(npmDatepicker.peerDependencies.vue, />=\s*3\.5(?:\.0)?/);

  const [vueMajor, vueMinor] = versionParts(npmVue.version, 'npm Vue');
  assert.equal(vueMajor, 3);
  assert.ok(vueMinor >= 5, `Vue Datepicker 14 requires Vue >=3.5, got ${npmVue.version}`);

  assert.match(
    yarnStanza(`"@vuepic/vue-datepicker@${datepickerRange}"`),
    /\n  version "14\.[^"]+"(?:\n|$)/,
  );

  const vueRange = manifest.dependencies.vue;
  assert.equal(packageLock.packages[''].dependencies.vue, vueRange);
  assert.match(yarnStanza(`vue@${vueRange}`), /\n  version "3\.(?:[5-9]|\d{2,})\.[^"]+"(?:\n|$)/);
});

test('uses the Vue Datepicker 14 component and grouped props', () => {
  const namedImport = fieldRepeater.match(
    /import\s*\{([^}]+)\}\s*from\s*['"]@vuepic\/vue-datepicker['"]/,
  );
  assert.ok(namedImport, 'Vue Datepicker must use the v14 named import');
  const importedNames = namedImport[1].split(',').map(name => name.trim());
  assert.ok(importedNames.includes('VueDatePicker'));
  assert.ok(importedNames.includes('WeekStart'));
  assert.doesNotMatch(fieldRepeater, /import\s+VueDatePicker\s+from\s+['"]@vuepic\/vue-datepicker['"]/);

  assert.match(fieldRepeater, /:time-config="\{\s*enableTimePicker:\s*false\s*\}"/);
  assert.match(fieldRepeater, /:formats="\{\s*month:\s*'MMM'\s*\}"/);
  assert.match(fieldRepeater, /:week-start="WeekStart\.Monday"/);
  assert.doesNotMatch(fieldRepeater, /:enable-time-picker=/);
  assert.doesNotMatch(fieldRepeater, /\smonth-name-format=/);
  assert.match(fieldRepeater, /:model-value="formatDateFromString\(f\.value\)"/);
  assert.match(
    fieldRepeater,
    /if\s*\(date === null \|\| date === undefined \|\| date === ''\)\s*\{\s*return null\s*\}/,
  );
  assert.match(fieldRepeater, /@update:modelValue="f\.value = \$event \?\? ''"/);
  assert.match(fieldRepeater, /@vuepic\/vue-datepicker\/dist\/main\.css/);
});
