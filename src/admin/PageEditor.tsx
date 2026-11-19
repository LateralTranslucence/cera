'use client';
/**
 * The page editor: page fields, boxes and the panel list, with save draft /
 * publish. It edits the raw stored page and hands it to `onSave` (a server
 * action that calls `savePage`), so validation and the database checks all
 * happen on the server.
 */
import { useEffect, useMemo, useState, useTransition } from 'react';
import type { AnyContentType, BoxMap } from '../content-type.ts';
import type { OptionsContext } from '../fields.ts';
import type { PageIssue, SaveMode, StoredPage } from '../document.ts';
import { upgradePanel, type StoredPanel } from '../migrate.ts';
import type { AnyPanel } from '../panel.ts';
import type { SaveResult } from '../supabase/index.ts';
import { FieldMapForm, IssueList, type FormContext } from './fields.tsx';
import { humanize, issuesAt, moveItem, newPanel, removeItem, setIn, slugify } from './state.ts';

export interface SaveInput {
  page: StoredPage;
  expectedVersion: number;
  mode: SaveMode;
}

export interface PageEditorProps {
  contentType: AnyContentType;
  page: StoredPage;
  /** 0 for a page that hasn't been saved yet. */
  version: number;
  published: boolean;
  onSave: (input: SaveInput) => Promise<SaveResult>;
  /** Takes the page off the live site. Shown when the page is published. */
  onUnpublish?: () => Promise<void>;
  /** Called after a successful save, e.g. to move from /new to the page's URL. */
  onSaved?: (result: Extract<SaveResult, { ok: true }>, mode: SaveMode) => void;
  /** Link that opens the page in draft-mode preview. */
  previewHref?: (slug: string) => string;
  /** Content types offered to `selectFrom` option sources. */
  contentTypes?: OptionsContext['contentTypes'];
  /** Viewers can look but not save. */
  readOnly?: boolean;
}

type Status = { tone: 'info' | 'success' | 'error'; text: string; reload?: boolean } | null;

/**
 * Upgrades known panels to their current version so the form matches the
 * definition. A panel whose migration fails is left as stored; saving reports it.
 */
function upgradeForEditing(ct: AnyContentType, page: StoredPage): StoredPage {
  const defs = new Map<string, AnyPanel>(ct.panels.map((p: AnyPanel) => [p.type, p]));
  const panels = page.panels.map((p) => {
    const def = defs.get(p.type);
    if (!def) return p;
    try {
      return upgradePanel(def, p);
    } catch {
      return p;
    }
  });
  return { ...page, panels };
}

export function PageEditor({
  contentType: ct,
  page: initialPage,
  version: initialVersion,
  published: initialPublished,
  onSave,
  onUnpublish,
  onSaved,
  previewHref,
  contentTypes,
  readOnly = false,
}: PageEditorProps) {
  const [page, setPage] = useState(() => upgradeForEditing(ct, initialPage));
  const [version, setVersion] = useState(initialVersion);
  const [published, setPublished] = useState(initialPublished);
  const [issues, setIssues] = useState<PageIssue[]>([]);
  const [status, setStatus] = useState<Status>(null);
  const [dirty, setDirty] = useState(false);
  const [slugTouched, setSlugTouched] = useState(initialVersion > 0);
  const [saving, startSaving] = useTransition();
  const [addType, setAddType] = useState<string>(ct.panels[0]?.type ?? '');
  // Which panels are expanded. Newly added panels start open.
  const [openPanels, setOpenPanels] = useState<Set<string>>(() => new Set());
  // A panel just added from the Page section: bring it into view once rendered.
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  useEffect(() => {
    if (!scrollTo) return;
    document.getElementById(`cera-panel-${scrollTo}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setScrollTo(null);
  }, [scrollTo]);

  const defs = useMemo(() => new Map<string, AnyPanel>(ct.panels.map((p: AnyPanel) => [p.type, p])), [ct]);
  const options = useMemo<OptionsContext>(
    () => ({ contentTypes: contentTypes ?? [{ name: ct.name, label: ct.label, public: true }] }),
    [contentTypes, ct],
  );
  const ctx: FormContext = { issues, options, readOnly };

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const update = (next: StoredPage) => {
    setPage(next);
    setDirty(true);
  };
  const setPanels = (panels: StoredPanel[]) => update({ ...page, panels });

  const save = (mode: SaveMode) => {
    // Outside the transition, so it shows immediately (updates inside a
    // transition are held back until it finishes).
    setStatus({ tone: 'info', text: mode === 'publish' ? 'Publishing…' : 'Saving…' });
    startSaving(async () => {
      try {
        const result = await onSave({ page, expectedVersion: version, mode });
        setIssues(result.issues);
        if (result.ok) {
          setVersion(result.version);
          if (mode === 'publish') setPublished(true);
          setDirty(false);
          setSlugTouched(true);
          const warnings = result.issues.length ? ` ${result.issues.length} warning${result.issues.length === 1 ? '' : 's'} below.` : '';
          setStatus({ tone: 'success', text: (mode === 'publish' ? 'Published.' : 'Draft saved. The live page is unchanged.') + warnings });
          onSaved?.(result, mode);
          return;
        }
        switch (result.reason) {
          case 'invalid':
            setStatus({ tone: 'error', text: mode === 'publish' ? 'Not published. Fix the errors below.' : 'Not saved. Fix the errors below.' });
            break;
          case 'conflict':
            setStatus({ tone: 'error', text: 'Someone else saved this page after you opened it. Reload to get their version (your unsaved changes will be lost).', reload: true });
            break;
          case 'forbidden':
            setStatus({ tone: 'error', text: 'Your account is not allowed to edit pages.' });
            break;
          case 'slug-taken':
            setStatus({ tone: 'error', text: `Another page already uses the slug “${page.slug}”.` });
            break;
          case 'not-found':
            setStatus({ tone: 'error', text: 'This page no longer exists.' });
            break;
        }
      } catch (e) {
        setStatus({ tone: 'error', text: `Save failed: ${e instanceof Error ? e.message : String(e)}` });
      }
    });
  };

  const unpublish = () => {
    if (!onUnpublish || !window.confirm('Take this page off the live site? Your saved content and history are kept.')) return;
    setStatus({ tone: 'info', text: 'Unpublishing…' });
    startSaving(async () => {
      try {
        await onUnpublish();
        setPublished(false);
        setStatus({ tone: 'success', text: 'Unpublished. The page is no longer on the live site.' });
      } catch (e) {
        setStatus({ tone: 'error', text: `Unpublish failed: ${e instanceof Error ? e.message : String(e)}` });
      }
    });
  };

  const pageIssues = [...issuesAt(issues, ['title']), ...issuesAt(issues, ['slug'])];

  // Where each box goes, from the content type's `editor` layout.
  const inPage = new Set<string>(ct.editor?.pageBoxes ?? []);
  const lead = new Set<string>(ct.editor?.leadBoxes ?? []);
  const allBoxes = Object.entries(ct.boxes as BoxMap);
  const pageBoxes = allBoxes.filter(([name]) => inPage.has(name));
  const leadBoxes = allBoxes.filter(([name]) => lead.has(name) && !inPage.has(name));
  const otherBoxes = allBoxes.filter(([name]) => !inPage.has(name) && !lead.has(name));
  const errorCount = issues.filter((i) => i.severity === 'error').length;

  return (
    <div className="cera-editor">
      <header className="cera-toolbar">
        <div className="cera-toolbar__title">
          <h1>{page.title || 'Untitled page'}</h1>
          <p className="cera-badges">
            <span className={`cera-badge${published ? ' cera-badge--live' : ''}`}>{published ? 'Published' : 'Not published'}</span>
            {dirty && <span className="cera-badge cera-badge--dirty">Unsaved changes</span>}
            {version > 0 && <span className="cera-badge">Version {version}</span>}
          </p>
        </div>
        <div className="cera-toolbar__actions">
          {previewHref && version > 0 && (
            <a className="cera-button" href={previewHref(page.slug)} target="_blank" rel="noreferrer" title={dirty ? 'Preview shows the last saved draft' : undefined}>
              Preview
            </a>
          )}
          {!readOnly && (
            <>
              {published && onUnpublish && (
                <button type="button" className="cera-button" disabled={saving} onClick={unpublish}>
                  Unpublish
                </button>
              )}
              <button type="button" className="cera-button" disabled={saving} onClick={() => save('draft')}>
                Save draft
              </button>
              <button type="button" className="cera-button cera-button--primary" disabled={saving} onClick={() => save('publish')}>
                Publish
              </button>
            </>
          )}
        </div>
      </header>

      {readOnly && <p className="cera-status cera-status--info">You can view this page but not change it.</p>}
      {status && (
        <p className={`cera-status cera-status--${status.tone}`} role="status">
          {status.text}
          {status.reload && (
            <button type="button" className="cera-button cera-button--small" onClick={() => window.location.reload()}>
              Reload
            </button>
          )}
        </p>
      )}
      {errorCount > 0 && <p className="cera-note">{errorCount} error{errorCount === 1 ? '' : 's'}; each is shown next to its field.</p>}

      <section className="cera-section">
        <h2>Page</h2>
        <div className="cera-fields">
          <div className="cera-field">
            <label htmlFor="cera-title">Title</label>
            <input
              id="cera-title"
              type="text"
              value={page.title}
              readOnly={readOnly}
              onChange={(e) => {
                const title = e.target.value;
                update({ ...page, title, ...(slugTouched ? {} : { slug: slugify(title) }) });
              }}
            />
          </div>
          <div className="cera-field">
            <label htmlFor="cera-slug">Slug</label>
            <input
              id="cera-slug"
              type="text"
              value={page.slug}
              readOnly={readOnly}
              onChange={(e) => {
                setSlugTouched(true);
                update({ ...page, slug: e.target.value });
              }}
            />
            <p className="cera-note">The page’s address: lowercase words joined by hyphens. “home” is the front page.</p>
          </div>
          <IssueList issues={pageIssues} />
          {pageBoxes.map(([name, fields]) => (
            <div key={name} className="cera-subsection">
              <h3>{humanize(name)}</h3>
              <FieldMapForm fields={fields} value={page.boxes[name]} onChange={(v) => update(setIn(page, ['boxes', name], v))} path={['boxes', name]} ctx={ctx} />
            </div>
          ))}
          {!readOnly && ct.panels.length > 0 && (
            <div className="cera-field">
              <label htmlFor="cera-add-panel">Add a panel</label>
              <div className="cera-add-panel">
                <select id="cera-add-panel" value={addType} onChange={(e) => setAddType(e.target.value)}>
                  {ct.panels.map((p: AnyPanel) => (
                    <option key={p.type} value={p.type}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="cera-button"
                  onClick={() => {
                    const def = defs.get(addType);
                    if (!def) return;
                    const panel = newPanel(def);
                    setOpenPanels((s) => new Set(s).add(panel.id));
                    setScrollTo(panel.id);
                    setPanels([...page.panels, panel]);
                  }}
                >
                  Add
                </button>
              </div>
              <p className="cera-note">
                {page.panels.length === 0 ? 'No panels yet. ' : `${page.panels.length} panel${page.panels.length === 1 ? '' : 's'} below. `}
                New panels are added at the end; use ↑ ↓ on a panel to move it.
              </p>
            </div>
          )}
        </div>
      </section>

      {otherBoxes.map(([name, fields]) => (
        <section key={name} className="cera-section">
          <details open={issuesAt(issues, ['boxes', name]).length > 0}>
            <summary>
              <h2>{humanize(name)}</h2>
            </summary>
            <FieldMapForm fields={fields} value={page.boxes[name]} onChange={(v) => update(setIn(page, ['boxes', name], v))} path={['boxes', name]} ctx={ctx} />
          </details>
        </section>
      ))}

      {/* Lead boxes (e.g. the hero) render like panels, so they sit with them, but can't be moved or removed. */}
      {leadBoxes.map(([name, fields]) => (
        <section key={name} className="cera-section cera-panel cera-panel--fixed">
          <details open>
            <summary>
              <h2 className="cera-panel__type">{humanize(name)}</h2>
              <span className="cera-panel__title">Always first on the page</span>
            </summary>
            <FieldMapForm fields={fields} value={page.boxes[name]} onChange={(v) => update(setIn(page, ['boxes', name], v))} path={['boxes', name]} ctx={ctx} />
          </details>
        </section>
      ))}

      {/* Each panel is a top-level section. */}
      {page.panels.map((p, i) => {
        const def = defs.get(p.type);
        const path = ['panels', i];
        const own = issuesAt(issues, path, true);
        const title = typeof p.data.title === 'string' && p.data.title ? p.data.title : null;
        return (
          <section
            key={p.id}
            id={`cera-panel-${p.id}`}
            className={`cera-section cera-panel${p.hidden ? ' is-hidden' : ''}${issuesAt(issues, path).length ? ' has-warning' : ''}`}
          >
            <details
              open={!def || openPanels.has(p.id) || issuesAt(issues, path).length > 0}
              onToggle={(e) => {
                const isOpen = (e.currentTarget as HTMLDetailsElement).open;
                setOpenPanels((s) => {
                  const next = new Set(s);
                  if (isOpen) next.add(p.id);
                  else next.delete(p.id);
                  return next;
                });
              }}
            >
              <summary>
                <h2 className="cera-panel__type">{def?.label ?? p.type}</h2>
                {title && <span className="cera-panel__title">{title}</span>}
                {p.hidden && <span className="cera-badge">Hidden</span>}
                <span className="cera-item-buttons">
                  <button
                    type="button"
                    className="cera-icon-button"
                    aria-label={p.hidden ? 'Show panel' : 'Hide panel'}
                    title={p.hidden ? 'Show on the page' : 'Hide from the page'}
                    disabled={readOnly}
                    onClick={(e) => {
                      e.preventDefault();
                      setPanels(setIn(page.panels, [i, 'hidden'], !p.hidden));
                    }}
                  >
                    {p.hidden ? '◌' : '●'}
                  </button>
                  <button type="button" className="cera-icon-button" aria-label="Move panel up" title="Move up" disabled={readOnly || i === 0} onClick={(e) => { e.preventDefault(); setPanels(moveItem(page.panels, i, i - 1)); }}>
                    ↑
                  </button>
                  <button type="button" className="cera-icon-button" aria-label="Move panel down" title="Move down" disabled={readOnly || i === page.panels.length - 1} onClick={(e) => { e.preventDefault(); setPanels(moveItem(page.panels, i, i + 1)); }}>
                    ↓
                  </button>
                  <button
                    type="button"
                    className="cera-icon-button cera-danger"
                    aria-label="Remove panel"
                    title="Remove"
                    disabled={readOnly}
                    onClick={(e) => {
                      e.preventDefault();
                      if (window.confirm(`Remove this ${def?.label ?? p.type} panel? It disappears when you next save.`)) setPanels(removeItem(page.panels, i));
                    }}
                  >
                    ✕
                  </button>
                </span>
              </summary>
              <IssueList issues={own} />
              {def ? (
                <FieldMapForm fields={def.fields} value={p.data} onChange={(data) => setPanels(setIn(page.panels, [i, 'data'], data))} path={[...path, 'data']} ctx={ctx} />
              ) : (
                <p className="cera-note">
                  This site has no definition for “{p.type}” panels, so it can’t be edited here. It is kept exactly as stored when you save.
                </p>
              )}
            </details>
          </section>
        );
      })}
    </div>
  );
}
