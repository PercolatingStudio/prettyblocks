import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { blockSelectionAfterRefresh } from '../_dev/src/store/blockSelection.mjs';

const source = readFileSync(new URL('../_dev/src/components/LeftPanel.vue', import.meta.url), 'utf8');
const action = source.match(/const loadEmptyState = async \(e\) => \{[\s\S]*?\n\};/)?.[0];
assert.ok(action, 'The repeater add action must be testable.');

function fixture() {
  const currentBlock = {
    id_prettyblocks: 10,
    subSelected: '10-1',
    states: { 1: { question: { value: 'Unsaved question' } } },
    need_reload: false,
  };
  const store = {
    currentBlock,
    psContext: { id_lang: 1, id_shop: 2 },
    saveContext: 'subState',
    reloadIframe() {},
    sendPrettyBlocksEvents() {},
  };
  let complete;
  let fail;
  const response = new Promise((resolve, reject) => { complete = resolve; fail = reject; });
  const calls = [];
  let refreshes = 0;
  const add = runInNewContext(action + '\nloadEmptyState', {
    prettyBlocksContext: store,
    security_app: { ajax_token: 'fixture-token' },
    ajax_urls: { state: '/state' },
    console: { error() {} },
    HttpClient: { get(url, params) { calls.push({ url, params }); return response; } },
    // Mirror the real selection-changing callback to catch accidental calls.
    loadSubState(element) {
      Object.assign(store.currentBlock, {
        id_prettyblocks: element.id_prettyblocks,
        subSelected: element.id,
        need_reload: element.need_reload,
      });
    },
    initStates() {
      refreshes++;
      const selection = blockSelectionAfterRefresh([
        { id_prettyblocks: 10, repeater_db: { 1: { question: { value: 'Saved question' } }, 2: {} } },
        { id_prettyblocks: 20, repeater_db: { 1: {} } },
      ], store.currentBlock);
      if (selection) Object.assign(store, selection);
    },
  });
  return { add, store, calls, complete, fail, refreshes: () => refreshes };
}

const settle = () => new Promise(resolve => setImmediate(resolve));
const assertDraft = store => {
  assert.equal(store.currentBlock.id_prettyblocks, 10);
  assert.equal(store.currentBlock.subSelected, '10-1');
  assert.equal(store.currentBlock.states[1].question.value, 'Unsaved question');
  assert.equal(store.saveContext, 'subState');
};

test('adding a repeater item keeps the current selection and draft before and after refresh', async () => {
  const f = fixture();
  await f.add({ id_prettyblocks: 10, need_reload: false });
  assertDraft(f.store);
  f.complete({ success: true });
  await settle();
  assertDraft(f.store);
  assert.equal(f.calls[0].params.action, 'getEmptyState');
  assert.equal(f.calls[0].params.id_prettyblocks, 10);
  assert.equal(f.calls[0].params.ctx_id_shop, 2);
  assert.equal(f.refreshes(), 1);
});

test('a failed add does not clear the draft or refresh persisted values over it', async () => {
  const f = fixture();
  await f.add({ id_prettyblocks: 10, need_reload: false });
  f.fail(new Error('Network unavailable'));
  await settle();
  assertDraft(f.store);
  assert.equal(f.refreshes(), 0);
});

test('adding to another repeater does not discard the item currently being edited', async () => {
  const f = fixture();
  await f.add({ id_prettyblocks: 20, need_reload: false });
  f.complete({ success: true });
  await settle();
  assertDraft(f.store);
  assert.equal(f.calls[0].params.id_prettyblocks, 20);
});
