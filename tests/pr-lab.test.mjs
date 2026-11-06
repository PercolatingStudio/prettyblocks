import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runner = join(repositoryRoot, 'scripts/pr-lab.mjs');
const repository = 'PrestaSafe/prettyblocks';

const BASE_SHA = 'a'.repeat(40);
const HEAD_SHA = 'b'.repeat(40);
const MERGE_SHA = 'c'.repeat(40);
const HARNESS_SHA = 'd'.repeat(40);

const sha256 = value => createHash('sha256').update(value).digest('hex');

const fakeGh = String.raw`
const fs = require('node:fs');
const path = require('node:path');

const scenario = JSON.parse(fs.readFileSync(path.join(process.env.HOME, 'scenario.json'), 'utf8'));
const args = process.argv.slice(2);

if (args[0] === 'api' && /\/pulls\/\d+$/.test(args[1] || '')) {
  process.stdout.write(JSON.stringify(scenario.pr));
  process.exit(0);
}
if (args[0] === 'repo' && args[1] === 'view') {
  process.stdout.write(scenario.repository + '\n');
  process.exit(0);
}

process.stderr.write('Unexpected fake gh invocation: ' + JSON.stringify(args) + '\n');
process.exit(64);
`;

const fakeGit = String.raw`
const fs = require('node:fs');
const path = require('node:path');

const scenario = JSON.parse(fs.readFileSync(path.join(process.env.HOME, 'scenario.json'), 'utf8'));
const original = process.argv.slice(2);
let cwd = process.cwd();
let index = 0;

while (index < original.length) {
  if (original[index] === '-c') {
    index += 2;
    continue;
  }
  if (original[index] === '-C') {
    cwd = original[index + 1];
    index += 2;
    continue;
  }
  break;
}

const command = original[index];
const args = original.slice(index + 1);
const output = value => process.stdout.write(String(value || '') + (value ? '\n' : ''));

if (command === 'init') {
  fs.mkdirSync(args.at(-1), { recursive: true });
  process.exit(0);
}

if (command === 'status') {
  output(scenario.harnessStatus || '');
  process.exit(0);
}

if (command === 'remote' || command === 'fetch') process.exit(0);

if (command === 'rev-parse') {
  const ref = args[0];
  if (!original.includes('-C') && ref === 'HEAD') output(scenario.harnessSha);
  else if (ref === 'refs/remotes/origin/main') output(scenario.baseSha);
  else if (ref === 'refs/remotes/origin/pr') output(scenario.fetchHeadSha);
  else if (ref === 'HEAD') output(scenario.mergeSha);
  else {
    process.stderr.write('Unknown ref in fake git: ' + ref + '\n');
    process.exit(65);
  }
  process.exit(0);
}

if (command === 'checkout') {
  fs.writeFileSync(
    path.join(cwd, 'prettyblocks.php'),
    "<?php\nfinal class PrettyBlocksFake { public function __construct() { $this->version = '" + scenario.version + "'; } }\n",
  );
  fs.mkdirSync(path.join(cwd, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(cwd, 'docker'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'scripts/build-release.sh'), 'MALICIOUS BUILD SCRIPT\n');
  fs.writeFileSync(path.join(cwd, 'scripts/test-release.sh'), 'MALICIOUS TEST SCRIPT\n');
  fs.writeFileSync(path.join(cwd, 'docker/compose.yml'), 'malicious: true\n');
  fs.writeFileSync(path.join(cwd, 'docker/compose.release-test.yml'), 'malicious: true\n');
  fs.writeFileSync(path.join(cwd, 'docker/malicious-only'), 'must be removed\n');
  fs.writeFileSync(path.join(cwd, '.dockerignore'), 'MALICIOUS\n');
  process.exit(0);
}

if (command === 'merge') {
  if (scenario.mergeConflict) {
    process.stderr.write('CONFLICT (content): fake merge conflict\n');
    process.exit(1);
  }
  process.exit(0);
}

if (command === 'diff') {
  if (args.includes('--diff-filter=U')) output(scenario.conflictFiles.join('\n'));
  else if (args.includes('--name-only')) output(scenario.files.join('\n'));
  else output('diff --git a/fake b/fake\n+fake change');
  process.exit(0);
}

process.stderr.write('Unexpected fake git invocation: ' + JSON.stringify(original) + '\n');
process.exit(64);
`;

const fakeBash = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const home = process.env.HOME;
const scenario = JSON.parse(fs.readFileSync(path.join(home, 'scenario.json'), 'utf8'));
const args = process.argv.slice(2);
const workspace = process.cwd();
const callsPath = path.join(home, 'bash-calls.json');
const calls = fs.existsSync(callsPath) ? JSON.parse(fs.readFileSync(callsPath, 'utf8')) : [];
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const harnessChecks = Object.entries(scenario.expectedHarness).map(([relative, expected]) => ({
  relative,
  matches: fs.existsSync(path.join(workspace, relative)) && digest(path.join(workspace, relative)) === expected,
}));
const trustedHarness = harnessChecks.every(check => check.matches);
const maliciousOnlyRemoved = !fs.existsSync(path.join(workspace, 'docker/malicious-only'));

calls.push({
  args,
  script: path.basename(args[0] || ''),
  hasGhToken: Object.prototype.hasOwnProperty.call(process.env, 'GH_TOKEN'),
  hasGithubToken: Object.prototype.hasOwnProperty.call(process.env, 'GITHUB_TOKEN'),
  project: process.env.PRETTYBLOCKS_TEST_PROJECT || null,
  keep: process.env.PRETTYBLOCKS_KEEP_STACK || null,
  logDir: process.env.PRETTYBLOCKS_TEST_LOG_DIR || null,
  ps82: process.env.PS82_RELEASE_PORT || null,
  ps91: process.env.PS91_RELEASE_PORT || null,
  trustedHarness,
  maliciousOnlyRemoved,
  harnessChecks,
});
fs.writeFileSync(callsPath, JSON.stringify(calls, null, 2));

if (!trustedHarness || !maliciousOnlyRemoved) {
  process.stderr.write('Candidate-controlled infrastructure reached fake bash.\n');
  process.exit(90);
}

if (path.basename(args[0] || '') === 'build-release.sh') {
  const dist = path.join(workspace, 'dist');
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, 'prettyblocks-' + scenario.version + '.zip'), scenario.archiveContent);
  process.stdout.write('fake build passed\n');
  process.exit(0);
}

if (path.basename(args[0] || '') === 'test-release.sh') {
  if (!args[1] || !fs.existsSync(args[1])) {
    process.stderr.write('Archive missing from fake release test.\n');
    process.exit(91);
  }
  process.stdout.write('fake install test passed\n');
  process.exit(0);
}

process.stderr.write('Unexpected fake bash invocation: ' + JSON.stringify(args) + '\n');
process.exit(64);
`;

const fakeDocker = String.raw`
const fs = require('node:fs');
const path = require('node:path');

const callsPath = path.join(process.env.HOME, 'docker-calls.json');
const calls = fs.existsSync(callsPath) ? JSON.parse(fs.readFileSync(callsPath, 'utf8')) : [];
calls.push({
  args: process.argv.slice(2),
  archive: process.env.PRETTYBLOCKS_RELEASE_ARCHIVE_PATH || null,
  ps82: process.env.PS82_PORT || null,
  ps91: process.env.PS91_PORT || null,
});
fs.writeFileSync(callsPath, JSON.stringify(calls, null, 2));
process.exit(0);
`;

function defaultScenario(number = 901) {
  return {
    repository,
    pr: {
      number,
      html_url: `https://github.com/${repository}/pull/${number}`,
      state: 'open',
      base: { ref: 'main' },
      head: { sha: HEAD_SHA },
      draft: false,
      user: { login: 'contributor' },
      title: 'Fake pull request',
    },
    baseSha: BASE_SHA,
    fetchHeadSha: HEAD_SHA,
    mergeSha: MERGE_SHA,
    harnessSha: HARNESS_SHA,
    harnessStatus: '',
    mergeConflict: false,
    conflictFiles: [],
    files: ['prettyblocks.php'],
    version: '3.2.2',
    archiveContent: 'fake-prettyblocks-archive\n',
  };
}

function mergeScenario(overrides = {}) {
  const defaults = defaultScenario(overrides.pr?.number);
  const scenario = {
    ...defaults,
    ...overrides,
    pr: {
      ...defaults.pr,
      ...overrides.pr,
      base: { ...defaults.pr.base, ...overrides.pr?.base },
      head: { ...defaults.pr.head, ...overrides.pr?.head },
      user: { ...defaults.pr.user, ...overrides.pr?.user },
    },
  };
  if (!Object.prototype.hasOwnProperty.call(overrides, 'fetchHeadSha')) {
    scenario.fetchHeadSha = scenario.pr.head.sha;
  }
  return scenario;
}

function trustedHarnessHashes() {
  const files = [
    '.dockerignore',
    'scripts/build-release.sh',
    'scripts/test-release.sh',
    'docker/compose.yml',
    'docker/compose.release-test.yml',
  ];
  return Object.fromEntries(files.map(file => [file, sha256(readFileSync(join(repositoryRoot, file)))]));
}

function writeExecutable(path, body) {
  writeFileSync(path, `#!${process.execPath}\n${body}`);
  chmodSync(path, 0o755);
}

function fixture(t, overrides = {}, inheritedEnvironment = process.env) {
  const root = mkdtempSync(join(tmpdir(), 'prettyblocks-pr-lab-test-'));
  const home = join(root, 'home');
  const bin = join(root, 'bin');
  const temporary = join(root, 'tmp');
  const output = join(root, 'output');
  mkdirSync(home, { recursive: true });
  mkdirSync(bin, { recursive: true });
  mkdirSync(temporary, { recursive: true });
  const scenario = mergeScenario(overrides);
  scenario.expectedHarness = trustedHarnessHashes();
  writeFileSync(join(home, 'scenario.json'), JSON.stringify(scenario, null, 2));
  writeExecutable(join(bin, 'gh'), fakeGh);
  writeExecutable(join(bin, 'git'), fakeGit);
  writeExecutable(join(bin, 'bash'), fakeBash);
  writeExecutable(join(bin, 'docker'), fakeDocker);

  const environment = {
    ...inheritedEnvironment,
    PATH: bin,
    HOME: home,
    TMPDIR: temporary,
    GH_TOKEN: 'must-not-reach-build',
    GITHUB_TOKEN: 'must-not-reach-test',
    // A real PR event must not constrain the fake PRs used by these tests.
    // Individual guard tests can still opt in through extraEnvironment.
    PR_LAB_EXPECTED_HEAD: '',
    PR_LAB_EXPECTED_BASE: '',
  };

  t.after(() => rmSync(root, { recursive: true, force: true }));

  return {
    root,
    home,
    output,
    scenario,
    spawn(args, extraEnvironment = {}) {
      const result = spawnSync(process.execPath, [runner, ...args], {
        cwd: repositoryRoot,
        env: { ...environment, ...extraEnvironment },
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
      });
      assert.ifError(result.error);
      return result;
    },
    test(extraArgs = [], extraEnvironment = {}) {
      return this.spawn([
        'test',
        String(scenario.pr.number),
        '--output',
        output,
        '--repository',
        repository,
        ...extraArgs,
      ], extraEnvironment);
    },
    down() {
      return this.spawn(['down', output]);
    },
    result() {
      return JSON.parse(readFileSync(join(output, 'result.json'), 'utf8'));
    },
    bashCalls() {
      return JSON.parse(readFileSync(join(home, 'bash-calls.json'), 'utf8'));
    },
    dockerCalls() {
      return JSON.parse(readFileSync(join(home, 'docker-calls.json'), 'utf8'));
    },
  };
}

test('refuse une PR qui ne cible pas main et produit un rapport failed', t => {
  const lab = fixture(t, { pr: { number: 902, base: { ref: 'develop' } } });
  const execution = lab.test();

  assert.notEqual(execution.status, 0);
  const result = lab.result();
  assert.equal(result.status, 'failed');
  assert.match(result.error, /Only open PRs targeting main/);
  assert.match(readFileSync(join(lab.output, 'report.md'), 'utf8'), /Résultat : \*\*failed\*\*/);
  assert.equal(existsSync(join(lab.home, 'bash-calls.json')), false);
});

test('refuse une tête différente de celle attendue par le workflow', t => {
  const lab = fixture(t, { pr: { number: 903 } });
  const execution = lab.test([], { PR_LAB_EXPECTED_HEAD: 'e'.repeat(40) });

  assert.notEqual(execution.status, 0);
  const result = lab.result();
  assert.equal(result.status, 'failed');
  assert.match(result.error, /PR head changed since this workflow event/);
  assert.equal(result.workspace, undefined);
});

test('isole les fixtures des SHA de la vraie PR hérités du workflow', t => {
  const lab = fixture(t, { pr: { number: 909 } }, {
    ...process.env,
    PR_LAB_EXPECTED_HEAD: 'e'.repeat(40),
    PR_LAB_EXPECTED_BASE: 'f'.repeat(40),
  });
  const execution = lab.test();

  assert.equal(execution.status, 0, execution.stderr || execution.stdout);
  assert.equal(lab.result().status, 'passed');
  assert.equal(lab.result().base, BASE_SHA);
  assert.equal(lab.result().head, HEAD_SHA);
});

test('conserve le contrôle explicite du SHA de base pour la vraie validation', t => {
  const lab = fixture(t, { pr: { number: 910 } });
  const execution = lab.test([], { PR_LAB_EXPECTED_BASE: 'e'.repeat(40) });

  assert.notEqual(execution.status, 0);
  assert.match(lab.result().error, /main changed since this workflow event/);
});

test('refuse une tête qui change pendant le fetch', t => {
  const lab = fixture(t, { pr: { number: 904 }, fetchHeadSha: 'f'.repeat(40) });
  const execution = lab.test();

  assert.notEqual(execution.status, 0);
  const result = lab.result();
  assert.equal(result.status, 'failed');
  assert.match(result.error, /PR changed while fetching/);
  assert.equal(existsSync(result.workspace), false);
});

test('rapporte les fichiers en conflit et nettoie le checkout temporaire', t => {
  const conflictFiles = ['prettyblocks.php', 'src/Controller/AdminThemeManagerController.php'];
  const lab = fixture(t, {
    pr: { number: 905 },
    mergeConflict: true,
    conflictFiles,
  });
  const execution = lab.test();

  assert.notEqual(execution.status, 0);
  const result = lab.result();
  assert.equal(result.status, 'failed');
  assert.match(result.error, /Merge conflict with current main/);
  assert.deepEqual(
    readFileSync(join(lab.output, 'conflicts.txt'), 'utf8').trim().split('\n'),
    conflictFiles,
  );
  assert.equal(existsSync(result.workspace), false);
});

test('réussit avec une fausse archive, nettoie et exécute seulement le harness de confiance sans jetons', t => {
  const archiveContent = 'deterministic fake archive\n';
  const lab = fixture(t, {
    pr: { number: 906 },
    archiveContent,
    files: [
      '.dockerignore',
      'docker/compose.yml',
      'scripts/test-release.sh',
      'prettyblocks.php',
    ],
  });
  const execution = lab.test();

  assert.equal(execution.status, 0, execution.stderr || execution.stdout);
  const result = lab.result();
  assert.equal(result.status, 'passed');
  assert.equal(result.kept, false);
  assert.equal(result.checksum, sha256(archiveContent));
  assert.equal(readFileSync(join(lab.output, 'prettyblocks-3.2.2.zip'), 'utf8'), archiveContent);
  assert.equal(existsSync(result.workspace), false);
  assert.match(readFileSync(join(lab.output, 'report.md'), 'utf8'), /Résultat : \*\*passed\*\*/);
  assert.ok(result.warnings.some(warning => warning.includes('harness de confiance')));

  const calls = lab.bashCalls();
  assert.deepEqual(calls.map(call => call.script), ['build-release.sh', 'test-release.sh']);
  for (const call of calls) {
    assert.equal(call.hasGhToken, false);
    assert.equal(call.hasGithubToken, false);
    assert.equal(call.trustedHarness, true);
    assert.equal(call.maliciousOnlyRemoved, true);
    assert.equal(call.project, result.project);
    assert.equal(call.keep, '0');
    assert.equal(call.logDir, join(lab.output, 'logs'));
  }
});

test('--keep conserve la stack et down cible uniquement son projet dédié', t => {
  const lab = fixture(t, { pr: { number: 907 } });
  const execution = lab.test(['--keep', '--ps82-port', '18282', '--ps91-port', '19291']);

  assert.equal(execution.status, 0, execution.stderr || execution.stdout);
  const kept = lab.result();
  assert.equal(kept.status, 'passed');
  assert.equal(kept.kept, true);
  assert.match(kept.project, /^prettyblocks-pr-907-[a-z0-9]+$/);
  assert.equal(existsSync(kept.workspace), true);
  assert.ok(lab.bashCalls().every(call => call.keep === '1'));

  const cleanup = lab.down();
  assert.equal(cleanup.status, 0, cleanup.stderr || cleanup.stdout);
  const calls = lab.dockerCalls();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, [
    'compose',
    '-p',
    kept.project,
    '-f',
    join(kept.workspace, 'docker/compose.yml'),
    '-f',
    join(kept.workspace, 'docker/compose.release-test.yml'),
    'down',
    '-v',
    '--remove-orphans',
  ]);
  assert.equal(calls[0].archive, kept.archive);
  assert.equal(calls[0].ps82, '18282');
  assert.equal(calls[0].ps91, '19291');
  assert.equal(existsSync(kept.workspace), false);
  assert.equal(lab.result().kept, false);
  assert.doesNotMatch(readFileSync(join(lab.output, 'report.md'), 'utf8'), /Prévisualisation locale/);
});

test('down refuse un workspace forgé en dehors du répertoire temporaire direct', t => {
  const lab = fixture(t, { pr: { number: 908 } });
  mkdirSync(lab.output, { recursive: true });
  const victim = join(lab.root, 'prettyblocks-pr-908-forged');
  mkdirSync(victim);
  writeFileSync(join(victim, 'keep.txt'), 'must survive');
  writeFileSync(join(lab.output, 'result.json'), JSON.stringify({
    workspace: victim,
    project: 'prettyblocks-pr-908-forged',
  }));
  const cleanup = lab.down();
  assert.notEqual(cleanup.status, 0);
  assert.match(cleanup.stderr, /Invalid PR lab state/);
  assert.equal(readFileSync(join(victim, 'keep.txt'), 'utf8'), 'must survive');
  assert.equal(existsSync(join(lab.home, 'docker-calls.json')), false);
});
