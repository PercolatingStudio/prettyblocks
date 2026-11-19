import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../views/js/front.js', import.meta.url), 'utf8');
function fixture(marker = '#c62828') {
  const attrs = { 'style-xl': 'padding-top:33px', 'style-lg': 'padding-top:22px', 'style-sm': 'padding-top:11px' };
  if (marker !== null) attrs['data-prettyblocks-background-color'] = marker;
  const element = {
    attrs, style: { backgroundColor: marker || '' },
    getAttribute(name) { return this.attrs[name] ?? null; },
    setAttribute(name, value) {
      this.attrs[name] = value;
      if (name === 'style') this.style.backgroundColor = value.match(/(?:^|;)\s*background-color:([^;]+)/)?.[1] ?? '';
    },
  };
  const window = { innerWidth: 1440 };
  const apply = runInNewContext(source + '\napplyAdaptiveStyle', {
    window,
    document: { addEventListener() {}, querySelectorAll: selector => selector.includes('[style-xl]') ? [element] : [] },
    setTimeout: callback => { callback(); return 1; }, clearTimeout() {},
  });
  return { element, window, apply };
}

test('colored blocks keep their background when responsive spacing replaces inline style', () => {
  const f = fixture();
  f.apply();
  assert.equal(f.element.attrs.style, 'padding-top:33px');
  assert.equal(f.element.style.backgroundColor, '#c62828');
});

test('background survives repeated desktop/tablet/gap/mobile resizes without changing breakpoint behavior', () => {
  const f = fixture();
  for (const [width, expected] of [[1280, 'padding-top:33px'], [1024, 'padding-top:22px'], [768, 'padding-top:22px'], [700, ''], [640, 'padding-top:11px'], [375, 'padding-top:11px'], [1440, 'padding-top:33px']]) {
    f.window.innerWidth = width;
    f.window.onresize();
    assert.equal(f.element.attrs.style, expected);
    assert.equal(f.element.style.backgroundColor, '#c62828');
  }
});

test('legacy responsive background declarations without the new marker retain their old behavior', () => {
  const f = fixture(null);
  f.element.attrs['style-xl'] = 'background-color:red;padding-top:33px';
  f.element.attrs['style-lg'] = 'background-color:blue;padding-top:22px';
  f.apply();
  assert.equal(f.element.style.backgroundColor, 'red');
  f.window.innerWidth = 1024;
  f.apply();
  assert.equal(f.element.style.backgroundColor, 'blue');
});

test('an explicit PrettyBlocks background takes precedence over a responsive background', () => {
  const f = fixture();
  f.element.attrs['style-xl'] = 'background-color:red;padding-top:33px';
  f.apply();
  assert.equal(f.element.style.backgroundColor, '#c62828');
});

test('uncolored elements are not given a background', () => {
  const f = fixture(null);
  f.apply();
  assert.equal(f.element.style.backgroundColor, '');
});

test('removing a background marker never resurrects the old color on resize', () => {
  const f = fixture();
  f.apply();
  delete f.element.attrs['data-prettyblocks-background-color'];
  f.window.innerWidth = 700;
  f.window.onresize();
  assert.equal(f.element.style.backgroundColor, '');
});
