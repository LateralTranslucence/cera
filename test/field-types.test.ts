// The field types ported last: email, phone, date and time, time zone, image
// link, and the background palette's admin helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { z } from 'zod';
import { custom, field, isTimeZone, objectSchema } from '../src/index.ts';
import { FieldMapForm, type CustomControlProps } from '../src/admin/fields.tsx';
import { dateTimeInput, dateTimeValue, toLocalInput } from '../src/admin/state.ts';

const schema = objectSchema({
  email: field.email(),
  phone: field.phone(),
  when: field.dateTime(),
  zone: field.timezone(),
  link: field.imageLink(),
});
const valid = (data: Record<string, unknown>) => schema.safeParse(data).success;

test('email and phone: checked like the form builder’s fields', () => {
  assert.equal(valid({ email: 'ada@example.com', phone: '+1 (555) 010-0199' }), true);
  for (const email of ['ada', 'ada@example', 'ada @example.com', '<ada@example.com>']) assert.equal(valid({ email }), false, email);
  for (const phone of ['call me', '+', '555-0100 ext. 2']) assert.equal(valid({ phone }), false, phone);
  // Both optional by default.
  assert.equal(valid({}), true);
});

test('date and time: an ISO 8601 moment; time zone: an IANA name', () => {
  assert.equal(valid({ when: '2026-11-20T15:30:00.000Z' }), true);
  assert.equal(valid({ when: '2026-11-20T09:30:00-06:00' }), true);
  for (const when of ['tomorrow', '2026-11-20', '11/20/2026 3:30 PM', '2026-13-45T99:00:00Z']) assert.equal(valid({ when }), false, when);
  assert.equal(valid({ zone: 'America/Chicago' }), true);
  assert.equal(valid({ zone: 'UTC' }), true);
  assert.equal(valid({ zone: 'Mars/Olympus_Mons' }), false);
  assert.equal(isTimeZone('Europe/Paris'), true);
  assert.equal(isTimeZone(''), false);
});

test('image link: a URL and the theme’s Modal option, off unless set', () => {
  assert.deepEqual(schema.parse({ link: { url: '/mars' } }).link, { url: '/mars', modal: false });
  assert.deepEqual(schema.parse({ link: { url: '/mars', modal: true } }).link, { url: '/mars', modal: true });
  assert.equal(valid({ link: '/mars' }), false);
});

test('the date and time control: stored in UTC, edited in the browser’s time zone', () => {
  const stored = '2026-11-20T15:30:00.000Z';
  const input = dateTimeInput(stored);
  assert.equal(input, toLocalInput(new Date(stored)));
  assert.match(input, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  assert.equal(dateTimeValue(input), stored);
  assert.equal(dateTimeInput('not a date'), '');
  assert.equal(dateTimeInput(undefined), '');
  assert.equal(dateTimeValue(''), undefined);
});

test('a site’s own control draws its custom() kind; a kind without one is shown read-only', () => {
  const fields = { tone: custom('tone', z.string().optional(), { label: 'Tone' }), other: custom('other', z.number().optional(), { label: 'Other' }) };
  const ToneControl = ({ id, value, readOnly }: CustomControlProps) => createElement('output', { id, 'data-read-only': String(readOnly) }, `tone: ${String(value)}`);
  const html = renderToStaticMarkup(
    createElement(FieldMapForm, {
      fields,
      value: { tone: 'warm', other: 3 },
      onChange: () => {},
      path: [],
      context: { issues: [], options: { contentTypes: [] }, readOnly: false, controls: { tone: ToneControl } },
    }),
  );
  assert.match(html, /<output id="[^"]+" data-read-only="false">tone: warm<\/output>/);
  assert.match(html, /No editor for “other” fields yet/);
});
