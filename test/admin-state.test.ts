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
  const panel = newPanel(blocks, 'p1');
  assert.deepEqual(panel, {
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

test('folded panels: a name from the title, a summary from list counts or the start of the text', async () => {
  const { galleryFields } = await import('../src/panels/gallery.fields.ts');
  const { textFields } = await import('../src/panels/text.fields.ts');
  const { panelName, panelSummary } = await import('../src/admin/state.ts');

  assert.equal(panelName(blocks, { title: 'What we <em>do</em>' }, 'cera/blocks'), 'What we do');
  assert.equal(panelName(blocks, { title: '  ' }, 'cera/blocks'), 'Blocks');
  assert.equal(panelName(undefined, {}, 'acme/unknown'), 'acme/unknown');

  assert.equal(panelSummary(blocksFields, { blocks: [{}, {}, {}] }), '3 blocks');
  assert.equal(panelSummary(galleryFields, { gallery: [{}] }), '1 image');
  assert.equal(panelSummary(textFields, { ctas: [{}, {}] }), '2 buttons');
  assert.equal(panelSummary(textFields, { copy: '<p>From the dazzling brilliance &amp; quiet&nbsp;mystery</p>' }), 'From the dazzling brilliance & quiet mystery');
  assert.equal(panelSummary(textFields, { copy: `<p>${'word '.repeat(40)}</p>` }, 40).length, 40);
  assert.equal(panelSummary(textFields, {}), '');
  assert.equal(panelSummary(undefined, { anything: [1] }), '');
});

test('duplicatePanel puts a deep copy with a new id right after the original', async () => {
  const { duplicatePanel } = await import('../src/admin/state.ts');
  const firstPanel = { id: 'a', type: 'cera/text', v: 1, hidden: false, data: { list: [{ _id: 'x' }] } };
  const secondPanel = { id: 'b', type: 'cera/text', v: 1, hidden: true, data: {} };
  const out = duplicatePanel([firstPanel, secondPanel], 0, 'a2');
  assert.deepEqual(out.map((panel) => panel.id), ['a', 'a2', 'b']);
  assert.deepEqual(out[1]!.data, firstPanel.data);
  assert.notEqual(out[1]!.data, firstPanel.data); // firstPanel copy, not the same object
  assert.deepEqual(duplicatePanel([firstPanel], 5).map((panel) => panel.id), ['a']);
});

test('initials and relative times for the admin chrome', async () => {
  const { initials } = await import('../src/admin/AdminSidebar.tsx');
  const { formatWhen } = await import('../src/admin/PageList.tsx');
  assert.equal(initials('Ada Lovelace'), 'AL');
  assert.equal(initials('ada.lovelace@example.com'), 'AL');
  assert.equal(initials('admin@cera.test'), 'A');
  assert.equal(initials(''), '?');

  const now = Date.parse('2026-11-20T12:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();
  assert.equal(formatWhen(ago(10_000), now), 'Just now');
  assert.equal(formatWhen(ago(5 * 60_000), now), '5 min ago');
  assert.equal(formatWhen(ago(3 * 3_600_000), now), '3 hr ago');
  assert.equal(formatWhen(ago(30 * 3_600_000), now), 'Yesterday');
  assert.match(formatWhen(ago(10 * 86_400_000), now), /^Nov 1\d$/);
  assert.match(formatWhen('2025-03-02T12:00:00Z', now), /^Mar \d, 2025$/);
});
