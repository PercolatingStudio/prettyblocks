import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acceptsBlockRefresh,
  blockSelectionAfterRefresh,
  emptyBlockSelection,
  sameBlockContext,
  snapshotBlockContext,
} from '../_dev/src/store/blockSelection.mjs';

const blocks = [
  { id_prettyblocks: 10, instance_id: 'first', code: 'text', need_reload: false, repeater_db: { 1: { text: 'first' } } },
  { id_prettyblocks: 20, instance_id: 'last', code: 'image', need_reload: true, repeater_db: {} },
];
const current = { ...blocks[0], subSelected: '10-1', states: { 1: { text: 'unsaved selection state' } } };
const context = { zone: 'displayHome', id_lang: 1, id_shop: 1 };

test('ordinary save/reorder refresh preserves selection and repeater state', () => {
  assert.equal(blockSelectionAfterRefresh(blocks, current), null);
  assert.equal(blockSelectionAfterRefresh([...blocks].reverse(), current), null);
  assert.equal(current.subSelected, '10-1');
  assert.equal(current.states[1].text, 'unsaved selection state');
});

test('adding selects the returned ID, not whichever block happens to be last', () => {
  const selection = blockSelectionAfterRefresh(blocks, current, { selectId: '10' });
  assert.deepEqual(selection, {
    currentBlock: { id_prettyblocks: 10, instance_id: 'first', code: 'text', subSelected: null, need_reload: false, states: blocks[0].repeater_db },
    saveContext: 'config',
  });
});

test('deleting explicitly selects the last surviving block with complete metadata', () => {
  const selection = blockSelectionAfterRefresh(blocks, current, { afterDelete: true });
  assert.equal(selection.currentBlock.id_prettyblocks, 20);
  assert.equal(selection.currentBlock.instance_id, 'last');
  assert.equal(selection.currentBlock.code, 'image');
  assert.equal(selection.currentBlock.subSelected, null);
  assert.deepEqual(selection.currentBlock.states, {});
});

test('deleting the last block clears every stale field and opens theme settings', () => {
  const selection = blockSelectionAfterRefresh([], current, { afterDelete: true });
  assert.deepEqual(selection, { currentBlock: emptyBlockSelection(), saveContext: 'settings' });
  assert.equal(selection.currentBlock.id_prettyblocks, null);
  assert.equal(selection.currentBlock.subSelected, null);
});

test('a missing selected block or changed context resets to settings, not an arbitrary block', () => {
  assert.equal(blockSelectionAfterRefresh([blocks[1]], current).saveContext, 'settings');
  assert.equal(blockSelectionAfterRefresh(blocks, current, { contextChanged: true }).saveContext, 'settings');
  assert.equal(blockSelectionAfterRefresh(blocks, current, { selectId: 999 }), null);
});

test('an ordinary first load does not select a block without an explicit request', () => {
  assert.equal(blockSelectionAfterRefresh(blocks, emptyBlockSelection()), null);
});

test('context snapshots do not mutate when the live shop/language/zone changes', () => {
  const store = { currentZone: { name: 'displayHome' }, psContext: { id_lang: 1, id_shop: 1 } };
  const captured = snapshotBlockContext(store);
  store.currentZone.name = 'displayFooter';
  store.psContext.id_lang = 2;
  assert.deepEqual(captured, context);
  assert.equal(sameBlockContext(captured, snapshotBlockContext(store)), false);
});

test('stale request responses and responses for another zone/language/shop are rejected', () => {
  assert.equal(acceptsBlockRefresh(2, 2, context, { ...context, id_lang: '1' }), true);
  assert.equal(acceptsBlockRefresh(1, 2, context, context), false);
  for (const changed of [{ zone: 'displayFooter' }, { id_lang: 2 }, { id_shop: 2 }]) {
    assert.equal(acceptsBlockRefresh(2, 2, context, { ...context, ...changed }), false);
  }
});
