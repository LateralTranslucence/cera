'use client';
/**
 * The Settings screen's approval workflows: one per content type, and
 * whether people may approve their own pages.
 */
import { useId, useState, useTransition, type FormEvent } from 'react';
import { APPROVAL_WORKFLOWS, workflowOf, type ApprovalSettings } from '../approvals.ts';
import type { CeraRole } from '../roles.ts';

/** A content type as the form lists it. */
export interface ApprovalType {
  name: string;
  /** Its plural title, e.g. "Pages". */
  title: string;
  /** The roles that may write it; everyone who writes when left out. */
  editRoles?: readonly CeraRole[];
}

export interface ApprovalSettingsFormProps {
  settings: ApprovalSettings;
  /** 0 when never saved. */
  version: number;
  types: readonly ApprovalType[];
  /** How many people have each role, to point out workflows nobody could finish. */
  people?: Partial<Record<CeraRole, number>>;
  onSave: (input: { settings: ApprovalSettings; expectedVersion: number }) => Promise<{ ok: true; settings: ApprovalSettings; version: number } | { ok: false; message: string }>;
}

type Status = { kind: 'success' | 'error'; text: string } | null;

/** What to point out about these settings, given who there is. */
export function approvalWarnings(settings: ApprovalSettings, types: readonly ApprovalType[], people: Partial<Record<CeraRole, number>>): string[] {
  const admins = people.admin ?? 0;
  const editors = people.editor ?? 0;
  const used = types.map((type) => settings.tiers[type.name] ?? []).filter((tiers) => tiers.length > 0);
  if (used.length === 0) return [];
  const warnings: string[] = [];
  if (settings.someoneElse && used.some((tiers) => tiers.includes('admin')) && admins < 2) {
    warnings.push('There’s only one admin, so nobody can approve pages that admin submits.');
  } else if (settings.someoneElse && used.some((tiers) => !tiers.includes('admin')) && admins + editors < 2) {
    warnings.push('Only one person can approve, so nobody can approve the pages they submit.');
  }
  if (used.some((tiers) => tiers.length > 1) && editors === 0) warnings.push('There are no editors, so admins approve both tiers.');
  return warnings;
}

export function ApprovalSettingsForm({ settings: initial, version: initialVersion, types, people, onSave }: ApprovalSettingsFormProps) {
  const [settings, setSettings] = useState(initial);
  const [version, setVersion] = useState(initialVersion);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [saving, startSaving] = useTransition();
  const id = useId();

  const change = (next: ApprovalSettings) => {
    setSettings(next);
    setDirty(true);
    setStatus(null);
  };
  const setWorkflow = (name: string, workflowId: string) => {
    const { [name]: _before, ...others } = settings.tiers;
    const tiers = APPROVAL_WORKFLOWS.find((workflow) => workflow.id === workflowId)?.tiers ?? [];
    change({ ...settings, tiers: tiers.length > 0 ? { ...others, [name]: [...tiers] } : others });
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    startSaving(async () => {
      try {
        const result = await onSave({ settings, expectedVersion: version });
        if (!result.ok) {
          setStatus({ kind: 'error', text: result.message });
          return;
        }
        setSettings(result.settings);
        setVersion(result.version);
        setDirty(false);
        setStatus({ kind: 'success', text: 'Settings saved.' });
      } catch (error) {
        setStatus({ kind: 'error', text: `Not saved: ${error instanceof Error ? error.message : String(error)}` });
      }
    });
  };

  const warnings = people ? approvalWarnings(settings, types, people) : [];
  const anyApproval = types.some((type) => (settings.tiers[type.name] ?? []).length > 0);

  return (
    <form className="cera-settings" onSubmit={save}>
      <section className="cera-section">
        <h2>Approval workflows</h2>
        <p className="cera-note" style={{ marginBottom: 16 }}>
          Who has to approve a page before it goes live, for each kind of content. An admin’s approval is always the last one needed.
        </p>
        <div className="cera-workflows">
          {types.map((type) => {
            const current = workflowOf(settings.tiers[type.name]);
            // Editors can't approve what they can't edit (the type's editRoles).
            const offered = APPROVAL_WORKFLOWS.filter((workflow) => workflow.id === current.id || !workflow.tiers.includes('editor') || !type.editRoles || type.editRoles.includes('editor'));
            const field = `${id}-${type.name}`;
            return (
              <div key={type.name} className="cera-workflow">
                <label htmlFor={field}>{type.title}</label>
                <select id={field} value={current.id} aria-describedby={`${field}-note`} onChange={(event) => setWorkflow(type.name, event.target.value)}>
                  {offered.map((workflow) => (
                    <option key={workflow.id} value={workflow.id}>
                      {workflow.label}
                    </option>
                  ))}
                </select>
                <p id={`${field}-note`} className="cera-note">
                  {type.editRoles && !type.editRoles.includes('editor') && !type.editRoles.includes('author') ? 'Only admins write these.' : current.note}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="cera-section">
        <h2>Own pages</h2>
        <label className="cera-check">
          <input type="checkbox" checked={settings.someoneElse} disabled={!anyApproval && !settings.someoneElse} onChange={(event) => change({ ...settings, someoneElse: event.target.checked })} />
          <span>
            Someone else must approve
            <span className="cera-note" style={{ display: 'block' }}>
              Nobody publishes their own pages, admins included, where approval is on. Off: whoever can give the last approval publishes without asking.
            </span>
          </span>
        </label>
      </section>

      {warnings.map((warning) => (
        <p key={warning} className="cera-status cera-status--info">
          {warning}
        </p>
      ))}
      {status && (
        <p className={`cera-status cera-status--${status.kind}`} role={status.kind === 'error' ? 'alert' : 'status'}>
          {status.text}
        </p>
      )}
      <div className="cera-settings__buttons">
        <button type="submit" className="cera-button cera-button--lg cera-button--primary" disabled={saving || !dirty}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        <span className="cera-note">Pages already live or scheduled stay that way. Requests already waiting follow the new settings.</span>
      </div>
    </form>
  );
}
