import assert from 'node:assert/strict';
import test from 'node:test';
import { withPrettyBlocksMode } from '../_dev/src/store/previewUrl.mjs';

const shop = 'https://shop.example.test/store/';
const product = shop + 'fr/1-1-t-shirt.html';
const combination = '#/1-taille-s/8-couleur-blanc';

test('puts edit mode before a product combination fragment and preserves the query', () => {
  const input = product + '?campaign=summer&tag=a%26b' + combination;
  const output = new URL(withPrettyBlocksMode(input, shop));

  assert.equal(output.pathname, '/store/fr/1-1-t-shirt.html');
  assert.equal(output.hash, combination);
  assert.deepEqual([...output.searchParams], [
    ['campaign', 'summer'], ['tag', 'a&b'], ['prettyblocks', '1'],
  ]);
});

test('adding edit mode to a combination URL is idempotent across iframe reloads', () => {
  const expected = product + '?prettyblocks=1' + combination;
  assert.equal(withPrettyBlocksMode(product + combination, shop), expected);
  assert.equal(withPrettyBlocksMode(expected, shop), expected);
});

test('replaces disabled, duplicated and previously corrupted edit flags', () => {
  for (const query of [
    '?prettyblocks=0',
    '?prettyblocks=0&prettyblocks=1',
    '?prettyblocks=1?prettyblocks=1?prettyblocks=1',
  ]) {
    const output = new URL(withPrettyBlocksMode(product + query + combination, shop));
    assert.deepEqual(output.searchParams.getAll('prettyblocks'), ['1']);
    assert.equal(output.hash, combination);
  }
});

test('another query key or value containing prettyblocks is not the edit flag', () => {
  const output = new URL(withPrettyBlocksMode(product + '?q=prettyblocks&notprettyblocks=0', shop));
  assert.equal(output.searchParams.get('q'), 'prettyblocks');
  assert.equal(output.searchParams.get('notprettyblocks'), '0');
  assert.deepEqual(output.searchParams.getAll('prettyblocks'), ['1']);
});

test('resolves relative links, query-only links and fragments against the current preview', () => {
  assert.equal(withPrettyBlocksMode('2-t-shirt.html' + combination, shop, product),
    shop + 'fr/2-t-shirt.html?prettyblocks=1' + combination);
  assert.equal(withPrettyBlocksMode('?id=2' + combination, shop, product),
    product + '?id=2&prettyblocks=1' + combination);
  assert.equal(withPrettyBlocksMode(combination, shop, product + '?id=2'),
    product + '?id=2&prettyblocks=1' + combination);
});

test('keeps subdirectory and multishop URLs on their intended path and origin', () => {
  const expected = product + '?prettyblocks=1' + combination;
  assert.equal(withPrettyBlocksMode('fr/1-1-t-shirt.html' + combination, shop), expected);
  assert.equal(withPrettyBlocksMode('/fr/1-1-t-shirt.html' + combination, shop), expected);
  assert.equal(withPrettyBlocksMode('/store/fr/1-1-t-shirt.html' + combination, shop), expected);
  assert.equal(withPrettyBlocksMode('//other.example.test/t-shirt.html' + combination, shop),
    'https://other.example.test/t-shirt.html?prettyblocks=1' + combination);
  assert.equal(withPrettyBlocksMode('https://other.example.test/t-shirt.html' + combination, shop),
    'https://other.example.test/t-shirt.html?prettyblocks=1' + combination);
});

test('does not create an editor URL from empty, malformed or non-web targets', () => {
  for (const input of ['', null, 'http://[invalid', 'javascript:alert(1)', 'mailto:shop@example.test']) {
    assert.equal(withPrettyBlocksMode(input, shop), null);
  }
});

test('a back-office startup_url round trip retains the query and combination', () => {
  const editor = new URL(shop + 'admin/modules/prettyblocks/');
  const preview = withPrettyBlocksMode(product + '?id=1' + combination, shop);
  editor.searchParams.set('startup_url', preview);

  const reopened = new URL(editor.href).searchParams.get('startup_url');
  assert.equal(reopened, product + '?id=1&prettyblocks=1' + combination);
  assert.equal(withPrettyBlocksMode(reopened, shop), reopened);
});
