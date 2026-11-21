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
  for (const row of rows) for (const answer of row.values) if (!columns.has(answer.name)) columns.set(answer.name, answer.label);
  const header = ['Sent', 'Form', 'Contact email', 'Page', ...columns.values()];
  const lines = [header, ...rows.map((row) => {
    const byName = new Map(row.values.map((answer) => [answer.name, Array.isArray(answer.value) ? answer.value.join('; ') : answer.value]));
    return [row.createdAt, row.formTitle ?? '', row.email ?? '', row.pagePath ?? '', ...[...columns.keys()].map((name) => byName.get(name) ?? '')];
  })];
  return lines.map((cells) => cells.map(cell).join(',')).join('\r\n') + '\r\n';
}

function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
