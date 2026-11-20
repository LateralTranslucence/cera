/** Submissions as CSV, for spreadsheets. */
import type { SubmissionValue } from './model.ts';

interface Row {
  createdAt: string;
  formTitle?: string;
  email?: string;
  pagePath?: string;
  values: SubmissionValue[];
}

/**
 * One row per submission: when, form, contact email (the first email address
 * in it) and page, then a column per field
 * name (labeled with its newest label). Several values (checkboxes) are joined
 * with "; ". Cells that a spreadsheet would run as a formula are prefixed
 * with an apostrophe.
 */
export function submissionsCsv(rows: readonly Row[]): string {
  const columns = new Map<string, string>();
  for (const r of rows) for (const v of r.values) if (!columns.has(v.name)) columns.set(v.name, v.label);
  const header = ['Sent', 'Form', 'Contact email', 'Page', ...columns.values()];
  const lines = [header, ...rows.map((r) => {
    const byName = new Map(r.values.map((v) => [v.name, Array.isArray(v.value) ? v.value.join('; ') : v.value]));
    return [r.createdAt, r.formTitle ?? '', r.email ?? '', r.pagePath ?? '', ...[...columns.keys()].map((k) => byName.get(k) ?? '')];
  })];
  return lines.map((cells) => cells.map(cell).join(',')).join('\r\n') + '\r\n';
}

function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
