import assert from 'node:assert/strict';
import test from 'node:test';
import { dependenciesChanged, evaluate, exceptionLabel } from '../scripts/dependency-policy.mjs';

const pr = {
  user: { login: 'contributor', type: 'User' },
  base: { ref: 'main', repo: { full_name: 'PercolatingStudio/prettyblocks' } },
  head: { repo: { full_name: 'contributor/prettyblocks' } },
  labels: [],
};

test('refuses lockfile-only updates from a fork', () => {
  assert.equal(evaluate(pr, ['_dev/yarn.lock']).state, 'failure');
});
test('catches dependency rollups even with accompanying workflows (#346)', () => {
  assert.equal(evaluate(pr, ['.github/workflows/build-release.yml', '_dev/package.json', '_dev/yarn.lock', 'composer.lock']).state, 'failure');
});
test('permits official Dependabot, not an impersonated login or branch', () => {
  const bot = { ...pr, user: { login: 'dependabot[bot]', type: 'Bot' }, head: pr.base };
  assert.equal(evaluate(bot, ['_dev/yarn.lock']).state, 'success');
  assert.equal(evaluate({ ...bot, user: { ...bot.user, type: 'User' } }, ['_dev/yarn.lock']).state, 'failure');
  assert.equal(evaluate({ ...bot, head: pr.head }, ['_dev/yarn.lock']).state, 'failure');
});
test('permits functional changes with dependencies and maintainer exceptions', () => {
  assert.equal(evaluate(pr, ['_dev/yarn.lock', '_dev/src/components/Block.vue']).state, 'success');
  assert.equal(evaluate({ ...pr, labels: [{ name: exceptionLabel }] }, ['composer.lock']).state, 'success');
});
test('distinguishes publisher metadata from actual version requirements', () => {
  assert.equal(dependenciesChanged('composer.json', { authors: ['old'], require: { php: '>=8.1' } }, { authors: ['new'], require: { php: '>=8.1' } }), false);
  assert.equal(evaluate(pr, ['composer.json']).state, 'success');
  assert.equal(dependenciesChanged('_dev/package.json', { dependencies: { vue: '^3' } }, { dependencies: { vue: '^4' } }), true);
  assert.equal(evaluate(pr, ['_dev/package.json'], ['_dev/package.json']).state, 'failure');
});
test('ignores dependency key ordering and detects platform/override changes', () => {
  assert.equal(dependenciesChanged('_dev/package.json', { dependencies: { a: '1', b: '2' } }, { dependencies: { b: '2', a: '1' } }), false);
  assert.equal(dependenciesChanged('composer.json', { config: { platform: { php: '8.1' } } }, { config: { platform: { php: '8.5' } } }), true);
  assert.equal(dependenciesChanged('_dev/package.json', {}, { overrides: { dep: '2' } }), true);
});
test('keeps non-main contributions out of V3 scope', () => {
  assert.equal(evaluate({ ...pr, base: { ...pr.base, ref: 'v2' } }, ['composer.lock']).state, 'success');
});
