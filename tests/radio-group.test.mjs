import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createContext, runInContext } from 'node:vm';

const fieldSource = readFileSync(new URL('../_dev/src/components/FieldRepeater.vue', import.meta.url), 'utf8');
const radioSource = readFileSync(new URL('../_dev/src/components/form/Radio.vue', import.meta.url), 'utf8');
const fieldRadio = fieldSource.match(/<Radio\b[\s\S]*?\/>/)?.[0];
const radioInput = radioSource.match(/<input\b[\s\S]*?\/>/)?.[0];
const radioLabel = radioSource.match(/<label\b[^>]*>/)?.[0];
assert.ok(fieldRadio && radioInput && radioLabel, 'The real radio templates must be testable.');

let sequence = 0;
function setup(source, values = {}) {
  const context = createContext({ uuidv4: () => `qa-id-${++sequence}`, ...values });
  // Execute the component's stable identities once per mounted instance, then
  // evaluate the actual template bindings on repeated renders/options.
  const identities = source.match(/^const (?:radioGroupName|inputId) = .+$/gm) ?? [];
  runInContext(identities.join('\n'), context);
  return {
    context,
    binding(template, name) {
      const expression = template.match(new RegExp(`:${name}="([^"]+)"`))?.[1];
      assert.ok(expression, `Missing ${name} binding`);
      return runInContext(expression, context);
    },
  };
}

function group() {
  const field = setup(fieldSource);
  return [0, 1].map(key => {
    field.context.key = key;
    const name = field.binding(fieldRadio, 'name');
    const radio = setup(radioSource, { name });
    return {
      name, nativeName: radio.binding(radioInput, 'name'),
      id: radio.binding(radioInput, 'id'), labelFor: radio.binding(radioLabel, 'for'),
    };
  });
}

test('all options of one radio field share one native group name', () => {
  const options = group();
  for (const option of options) assert.equal(option.nativeName, option.name);
  assert.equal(options[0].nativeName, options[1].nativeName);
});

test('separate fields and block/repeater instances never share a native group name', () => {
  const groups = [group(), group(), group(), group()];
  assert.equal(new Set(groups.map(options => options[0].nativeName)).size, groups.length);
  for (const options of groups) {
    for (const option of options) assert.equal(option.nativeName, option.name);
  }
});

test('each option has a unique input ID independent from its group name', () => {
  const options = [...group(), ...group()];
  assert.equal(new Set(options.map(option => option.id)).size, options.length);
  for (const option of options) assert.notEqual(option.id, option.name);
});

test('labels target their own input and identities remain stable on re-render', () => {
  for (const option of [...group(), ...group()]) assert.equal(option.labelFor, option.id);
  const field = setup(fieldSource, { key: 0 });
  const name = field.binding(fieldRadio, 'name');
  field.context.key = 1;
  assert.equal(field.binding(fieldRadio, 'name'), name);
  const radio = setup(radioSource, { name });
  const id = radio.binding(radioInput, 'id');
  assert.equal(radio.binding(radioInput, 'id'), id);
  assert.equal(radio.binding(radioLabel, 'for'), id);
});

test('selecting an option still emits its value without changing the storage contract', () => {
  const action = radioSource.match(/function onInput\(event\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(action);
  const events = [];
  const context = createContext({ emit: (...args) => events.push(args) });
  runInContext(action + '\nonInput({ target: { value: "grid" } })', context);
  assert.deepEqual(events, [['update:modelValue', 'grid']]);
});

test('option component keys use choice values even when labels are duplicated', () => {
  const field = setup(fieldSource, { group: 'Same label' });
  field.context.value = 'list';
  const first = field.binding(fieldRadio, 'key');
  field.context.value = 'grid';
  assert.notEqual(field.binding(fieldRadio, 'key'), first);
});
