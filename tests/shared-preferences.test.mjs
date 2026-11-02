import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('theme works on shared pages without reader controls and retains reading preferences', () => {
  const handlers = {};
  const button = {
    setAttribute() {},
    addEventListener(event, handler) {
      handlers[event] = handler;
    },
  };
  const dataset = {};
  let saved = JSON.stringify({ theme: 'light', font: 'wenkai', focus: 'on' });
  const context = {
    document: {
      documentElement: { dataset },
      getElementById: (id) => (id === 'themeToggle' ? button : null),
      addEventListener: (_, ready) => ready(),
    },
    localStorage: {
      getItem: () => saved,
      setItem: (_, value) => {
        saved = value;
      },
    },
    window: { dispatchEvent() {} },
    Event: class {},
  };
  vm.runInNewContext(readFileSync('public/preferences.js', 'utf8'), context);
  handlers.click();
  assert.equal(dataset.theme, 'dark');
  assert.equal(button.textContent, '☀');
  assert.equal(JSON.parse(saved).font, 'wenkai');
  assert.equal(JSON.parse(saved).focus, 'on');
});
