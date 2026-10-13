import test from 'node:test';
import assert from 'node:assert/strict';
import { supportsHyperlinks, hyperlink } from '../src/links.js';

test('off when output is not a terminal', () => {
  assert.equal(supportsHyperlinks({ env: { WT_SESSION: 'x' }, isTTY: false }), false);
});

test('on in terminals known to support them', () => {
  for (const env of [{ WT_SESSION: 'x' }, { TERM_PROGRAM: 'vscode' }, { TERM_PROGRAM: 'iTerm.app' }, { TERM_PROGRAM: 'WezTerm' }, { KITTY_WINDOW_ID: '1' }, { VTE_VERSION: '6003' }]) {
    assert.equal(supportsHyperlinks({ env, isTTY: true }), true, JSON.stringify(env));
  }
});

test('off in the classic Windows console and unknown terminals', () => {
  assert.equal(supportsHyperlinks({ env: {}, isTTY: true }), false);
  assert.equal(supportsHyperlinks({ env: { VTE_VERSION: '4600' }, isTTY: true }), false);
});

test('FORCE_HYPERLINK overrides detection', () => {
  assert.equal(supportsHyperlinks({ env: { FORCE_HYPERLINK: '1' }, isTTY: false }), true);
  assert.equal(supportsHyperlinks({ env: { FORCE_HYPERLINK: '0', WT_SESSION: 'x' }, isTTY: true }), false);
});

test('hyperlink wraps text in OSC 8', () => {
  assert.equal(hyperlink('a.jpg', 'https://x.io/a.jpg'), '\x1b]8;;https://x.io/a.jpg\x1b\\a.jpg\x1b]8;;\x1b\\');
});

test('only http(s) URLs become links, and control characters are never passed through', () => {
  assert.equal(hyperlink('a', 'javascript:alert(1)'), 'a');
  assert.equal(hyperlink('a', 'not a url'), 'a');
  const out = hyperlink('a', 'https://x.io/a\x1b]8;;evil\x07.jpg');
  // exactly the four ESCs of the link itself, and no BEL
  assert.equal(out.split('\x1b').length - 1, 4);
  assert.doesNotMatch(out, /\x07/);
});
