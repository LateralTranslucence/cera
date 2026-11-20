import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultsFor, getIn, humanize, issuesAt, moveItem, newPanel, newRepeaterItem, removeItem, setIn, slugify } from '../src/admin/state.ts';
import type { PageIssue } from '../src/index.ts';
import { blocks } from '../src/panels/blocks.ts';
import { blocksFields } from '../src/panels/blocks.fields.ts';

test('setIn is immutable, creates containers and removes cleared keys', () => {
  const before = { a: { b: 1, c: 2 }, list: [{ x: 1 }] };
  const after = setIn(before, ['a', 'b'], 5);
  assert.deepEqual(after, { a: { b: 5, c: 2 }, list: [{ x: 1 }] });
  assert.equal(before.a.b, 1);
  assert.equal(after.list, before.list); // untouched branches are shared

  assert.deepEqual(setIn({}, ['items', 0, 'title'], 'Hi'), { items: [{ title: 'Hi' }] });
  assert.deepEqual(setIn({ a: 1, b: 2 }, ['a'], undefined), { b: 2 });
  assert.equal(getIn(after, ['list', 0, 'x']), 1);
  assert.equal(getIn(after, ['missing', 'deep']), undefined);
});

test('moveItem and removeItem', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']);
  assert.deepEqual(moveItem(['a', 'b'], 0, -1), ['a', 'b']); // out of range: unchanged
  assert.deepEqual(removeItem(['a', 'b', 'c'], 1), ['a', 'c']);
});

test('new panels and repeater items start with their defaults', () => {
  const p = newPanel(blocks, 'p1');
  assert.deepEqual(p, {
    id: 'p1',
    type: 'cera/blocks',
    v: 1,
    hidden: false,
    data: { background: { overlay: false }, blocks: [], perRow: 3, style: 'card', ctas: [] },
  });
  const item = newRepeaterItem(blocksFields.blocks.config.fields, 'i1');
  assert.deepEqual(item, { _id: 'i1', hidden: false });
  assert.deepEqual(defaultsFor({}), {});
});

test('issuesAt matches a path and everything below it', () => {
  const issue = (path: PageIssue['path']): PageIssue => ({ severity: 'warning', code: 'invalid-field', path, message: '' });
  const issues = [issue(['panels', 0, 'data', 'style']), issue(['panels', 1]), issue(['title'])];
  assert.equal(issuesAt(issues, ['panels', 0]).length, 1);
  assert.equal(issuesAt(issues, ['panels']).length, 2);
  assert.equal(issuesAt(issues, ['panels', 1], true).length, 1);
  assert.equal(issuesAt(issues, ['panels', 0], true).length, 0);
});

test('slugify and humanize', () => {
  assert.equal(slugify('  Über Café — Menu 2026! '), 'uber-cafe-menu-2026');
  assert.equal(humanize('anchorId'), 'Anchor id');
  assert.equal(humanize('per_row'), 'Per row');
});
