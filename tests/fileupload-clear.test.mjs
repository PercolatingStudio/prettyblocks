import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../_dev/src/components/form/FileUpload.vue', import.meta.url), 'utf8');
const update = source.match(/const updateValue = \(event\) => \{[\s\S]*?\n\};/)?.[0];
const remove = source.match(/const removeImg = \(\) => \{[\s\S]*?\n\};/)?.[0];
assert.ok(update && remove, 'The real file upload actions must be testable.');

function fixture(defaultValue, response = Promise.resolve({ success: true })) {
  const props = {
    default: defaultValue,
    modelValue: { url: '/uploads/old.png', filename: 'old.png', mediatype: 'image' },
    path: '$/modules/prettyblocks/views/images',
    uploadUrl: '/upload',
  };
  const events = [];
  const requests = [];
  const removeImg = runInNewContext(update + '\n' + remove + '\nremoveImg', {
    props,
    security_app: { ajax_token: 'test-token' },
    emit: (...args) => events.push(args),
    HttpClient: { post(url, params) { requests.push({ url, params }); return response; } },
    console: { error() {} },
  });
  return { removeImg, props, events, requests };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

for (const defaultValue of [{ url: '/placeholder.png' }, { url: '' }, undefined]) {
  test(`removing an uploaded file emits an explicit empty URL, not default ${JSON.stringify(defaultValue)}`, async () => {
    const f = fixture(defaultValue);
    f.removeImg();
    assert.equal(f.events.length, 0, 'wait for the removal request');
    await settle();
    assert.deepEqual(JSON.parse(JSON.stringify(f.events)), [
      ['update:modelValue', { url: '' }], ['saveParent'],
    ]);
    assert.equal(f.requests[0].url, '/upload');
    assert.equal(f.requests[0].params.action, 'removeImage');
    assert.equal(f.requests[0].params.state, f.props.modelValue);
    assert.equal(f.requests[0].params.ajax_token, 'test-token');
    assert.equal(f.props.modelValue.url, '/uploads/old.png', 'do not mutate the input prop');
  });
}

test('a missing file on disk can still be cleared from the field', async () => {
  const f = fixture({ url: '/placeholder.png' }, Promise.resolve({ success: false, message: 'Image not found' }));
  f.removeImg();
  await settle();
  assert.equal(f.events[0][1].url, '');
  assert.equal(f.events[1][0], 'saveParent');
});

test('a failed removal request does not emit a replacement value or save', async () => {
  const f = fixture({ url: '/placeholder.png' }, Promise.reject(new Error('Network unavailable')));
  f.removeImg();
  await settle();
  assert.deepEqual(f.events, []);
});
