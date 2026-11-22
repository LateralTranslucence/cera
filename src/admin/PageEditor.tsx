'use client';
/**
 * The page editor: a sticky top bar (back, title, state, save draft,
 * schedule, publish) over a stack of cards: Page settings, then the lead
 * boxes (the hero), then the panels, which drag to reorder.
 *
 * It edits the raw stored page and hands it to `onSave` (a server action
 * that calls `savePage`), so validation and the database checks all happen
 * on the server.
 */
import { useEffect, useId, useMemo, useRef, useState, useTransition, type CSSProperties, type ReactNode } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { adminNounOf, adminNounPluralOf, type AnyContentType, type BoxMap } from '../content-type.ts';
import type { FieldMap, OptionsContext } from '../fields.ts';
import { checkPage, type PageIssue, type SaveMode, type StoredPage } from '../document.ts';
import { upgradePanel, type StoredPanel } from '../migrate.ts';
import type { AnyPanel } from '../panel.ts';
import type { DeletePageResult, PageLink, PageRevision, PageSchedule, SaveResult } from '../supabase/index.ts';
import { Dialog } from './Dialog.tsx';
import { FieldMapForm, IssueList, type FormContext } from './fields.tsx';
import { GripIcon, Icon } from './icons.tsx';
import { formatScheduled, formatWhen } from './PageList.tsx';
import { duplicatePanel, humanize, issuesAt, moveItem, newPanel, panelName, removeItem, setIn, slugify, toLocalInput } from './state.ts';

export interface SaveInput {
  page: StoredPage;
  expectedVersion: number;
  /** 'schedule' saves and makes this version go live at `publishAt`. */
  mode: SaveMode | 'schedule';
  publishAt?: string;
}

export interface PageEditorProps {
  contentType: AnyContentType;
  page: StoredPage;
  /** 0 for a page that hasn't been saved yet. */
  version: number;
  published: boolean;
  /** Published, and the saved working copy differs from what's live. */
  unpublishedChanges?: boolean;
  /** When the working copy was last saved. */
  updatedAt?: string;
  /** A pending scheduled publish. */
  schedule?: PageSchedule;
  onSave: (input: SaveInput) => Promise<SaveResult>;
  /** Takes the page off the live site. Shown when the page is published. */
  onUnpublish?: () => Promise<void>;
  /** Cancels a pending scheduled publish. Without it, the editor can't schedule. */
  onCancelSchedule?: () => Promise<void>;
  /** Called after a successful save, e.g. to move from /new to the page's URL. */
  onSaved?: (result: Extract<SaveResult, { ok: true }>, mode: SaveInput['mode']) => void;
  /**
   * Link that opens the page in draft-mode preview; with `version`, that saved
   * version (History's Preview links, opened in a new tab).
   */
  previewHref?: (slug: string, version?: { pageId: string; version: number }) => string;
  /** The back link in the top bar. */
  backHref?: string;
  /** Its text. Default "Pages". */
  backLabel?: string;
  /** Content types offered to `selectFrom` option sources. */
  contentTypes?: OptionsContext['contentTypes'];
  /** The site's background colors. Without them, background colors are typed. */
  colors?: OptionsContext['colors'];
  /** Finds pages for `relation` fields' page picker (a server action). Without it, relations take pasted ids. */
  findPages?: FormContext['findPages'];
  /** Uploads and the media library (see `mediaUploader`). Without it, media fields take typed paths and URLs. */
  media?: FormContext['media'];
  /** The site's icon sets (server actions), for the icon picker. */
  icons?: FormContext['icons'];
  /** The site's controls for its `custom()` field kinds, by kind. */
  controls?: FormContext['controls'];
  /** Viewers can look but not save. */
  readOnly?: boolean;
  /** Loads saved versions, newest first (older than `before` when given). Shows History in Page settings. */
  loadHistory?: (before?: number) => Promise<PageRevision[]>;
  /** Restores an old version as a new draft (a server action that calls `restoreRevision`). */
  onRestore?: (input: { version: number; expectedVersion: number }) => Promise<SaveResult>;
  /** Deletes the page (a server action that calls `deletePage`). Shows Delete page in Page settings. */
  onDelete?: (input: { expectedVersion: number }) => Promise<DeletePageResult>;
  /** The other pages that link to this one, listed before deleting. */
  findLinks?: () => Promise<PageLink[]>;
  /** Called after the page is deleted, e.g. to go back to the page list. */
  onDeleted?: () => void;
}

type Status = { tone: 'info' | 'success' | 'error'; text: string; reload?: boolean } | null;
type Dialogs = 'unpublish' | 'schedule' | 'add' | 'history' | 'delete' | null;

/** How many versions the History dialog loads at a time. */
const HISTORY_PAGE = 30;

const SETTINGS = '__settings';
/** The editor announces moves itself (with panel names), so dnd-kit's generic announcements are off. */
const QUIET = { announcements: { onDragStart: () => undefined, onDragOver: () => undefined, onDragEnd: () => undefined, onDragCancel: () => undefined } };

/**
 * Upgrades known panels to their current version so the form matches the
 * definition. A panel whose migration fails is left as stored; saving reports it.
 */
function upgradeForEditing(contentType: AnyContentType, page: StoredPage): StoredPage {
  const definitions = new Map<string, AnyPanel>(contentType.panels.map((definition: AnyPanel) => [definition.type, definition]));
  const panels = page.panels.map((panel) => {
    const definition = definitions.get(panel.type);
    if (!definition) return panel;
    try {
      return upgradePanel(definition, panel);
    } catch {
      return panel;
    }
  });
  return { ...page, panels };
}

/** Tomorrow at 9:00 in the browser's time zone, as a datetime-local value. */
function defaultScheduleTime(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return toLocalInput(date);
}

export function PageEditor({
  contentType,
  page: initialPage,
  version: initialVersion,
  published: initialPublished,
  unpublishedChanges: initialUnpublished = false,
  updatedAt,
  schedule: initialSchedule,
  onSave,
  onUnpublish,
  onCancelSchedule,
  onSaved,
  previewHref,
  backHref,
  backLabel = 'Pages',
  contentTypes,
  colors,
  findPages,
  media,
  icons,
  controls,
  readOnly = false,
  loadHistory,
  onRestore,
  onDelete,
  findLinks,
  onDeleted,
}: PageEditorProps) {
  // What this content type calls itself and its panels ("page"/"panel", "form"/"field").
  // Types that are never published (contentType.publishable: false) get a plain Save and no publishing controls.
  const publishable = contentType.publishable !== false;
  const noun = adminNounOf(contentType);
  const nouns = adminNounPluralOf(contentType);
  const item = contentType.editor?.itemNoun ?? 'panel';
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);
  const Item = item.charAt(0).toUpperCase() + item.slice(1);
  const slugLabel = contentType.editor?.slugLabel ?? 'Address';
  const slugWord = slugLabel.charAt(0).toLowerCase() + slugLabel.slice(1);
  const showSlug = (slug: string) => (contentType.route ? (slug === 'home' ? '/' : `/${slug || '…'}`) : slug || '…');

  const [page, setPage] = useState(() => upgradeForEditing(contentType, initialPage));
  const [version, setVersion] = useState(initialVersion);
  const [published, setPublished] = useState(initialPublished);
  const [unpublished, setUnpublished] = useState(initialUnpublished);
  const [schedule, setSchedule] = useState(initialSchedule);
  const [savedAt, setSavedAt] = useState(updatedAt);
  const [issues, setIssues] = useState<PageIssue[]>([]);
  const [status, setStatus] = useState<Status>(null);
  const [dirty, setDirty] = useState(false);
  const [slugTouched, setSlugTouched] = useState(initialVersion > 0);
  const [saving, startSaving] = useTransition();
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [scheduleAt, setScheduleAt] = useState('');
  // Which cards are open. A new page opens its settings, since it needs a title.
  const [open, setOpen] = useState<Set<string>>(() => new Set(initialVersion === 0 ? [SETTINGS] : []));
  const [deleted, setDeleted] = useState<{ panel: StoredPanel; index: number; name: string } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  // History dialog: the versions loaded so far, and whether there are older ones.
  const [history, setHistory] = useState<{ items: PageRevision[]; more: boolean; loading: boolean; error?: string }>({ items: [], more: false, loading: false });
  // Delete dialog: the pages that link here (null while loading).
  const [links, setLinks] = useState<PageLink[] | null>(null);
  // Re-render now and then so "Saved 5 min ago" stays true.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((tick) => tick + 1), 30_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!scrollTo) return;
    document.getElementById(`cera-panel-${scrollTo}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setScrollTo(null);
  }, [scrollTo]);

  const definitions = useMemo(() => new Map<string, AnyPanel>(contentType.panels.map((definition: AnyPanel) => [definition.type, definition])), [contentType]);
  const options = useMemo<OptionsContext>(() => ({ contentTypes: contentTypes ?? [{ name: contentType.name, label: contentType.label, public: true }], colors }), [contentTypes, contentType, colors]);
  const context: FormContext = { issues, options, readOnly, findPages, media, icons, controls };

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const update = (next: StoredPage) => {
    setPage(next);
    setDirty(true);
  };
  const setPanels = (panels: StoredPanel[]) => update({ ...page, panels });
  const toggle = (key: string) =>
    setOpen((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // The latest page state, readable after an await in the save handler.
  const pageRef = useRef(page);
  pageRef.current = page;

  const save = (mode: SaveInput['mode'], publishAt?: string) => {
    // The same checks the server runs, first, so errors show without a round trip. The server checks again.
    const check = checkPage(contentType, page, mode === 'draft' ? 'draft' : 'publish');
    if (!check.ok) {
      setIssues(check.issues);
      setStatus({ tone: 'error', text: `Not ${mode === 'publish' ? 'published' : mode === 'schedule' ? 'scheduled' : 'saved'}. Fix the errors below.` });
      setOpen((previous) => new Set(previous).add(SETTINGS));
      return;
    }
    // Outside the transition, so it shows immediately (updates inside a transition are held back until it finishes).
    setStatus({ tone: 'info', text: mode === 'publish' ? 'Publishing…' : mode === 'schedule' ? 'Scheduling…' : 'Saving…' });
    const sent = page;
    startSaving(async () => {
      try {
        const result = await onSave({ page: sent, expectedVersion: version, mode, ...(publishAt && { publishAt }) });
        setIssues(result.issues);
        if (result.ok) {
          setVersion(result.version);
          setSavedAt(new Date().toISOString());
          if (mode === 'publish') {
            setPublished(true);
            setUnpublished(false);
            setSchedule(undefined);
          } else {
            setUnpublished(published);
            if (mode === 'schedule' && publishAt) setSchedule({ at: publishAt, version: result.version });
          }
          // Show what was stored (sanitized rich text, filled-in defaults), unless
          // the editor kept typing during the save: then keep their newer edits.
          if (pageRef.current === sent) {
            setPage(result.page);
            setDirty(false);
          }
          setSlugTouched(true);
          const warnings = result.issues.length ? ` ${result.issues.length} warning${result.issues.length === 1 ? '' : 's'} below.` : '';
          const done =
            mode === 'publish'
              ? 'Published.'
              : mode === 'schedule' && publishAt
                ? `Scheduled to publish ${formatScheduled(publishAt)}. Changes you make now wait for the next publish.`
                : published
                  ? `Draft saved. The live ${noun} is unchanged.`
                  : 'Draft saved.';
          setStatus({ tone: 'success', text: done + warnings });
          onSaved?.(result, mode);
          return;
        }
        const verb = mode === 'publish' ? 'published' : mode === 'schedule' ? 'scheduled' : 'saved';
        switch (result.reason) {
          case 'invalid':
            setStatus({ tone: 'error', text: `Not ${verb}. Fix the errors below.` });
            setOpen((previous) => new Set(previous).add(SETTINGS));
            break;
          case 'conflict':
            setStatus({ tone: 'error', text: `Someone else saved this ${noun} after you opened it. Reload to get their version (your unsaved changes will be lost).`, reload: true });
            break;
          case 'forbidden':
            setStatus({ tone: 'error', text: `Your account is not allowed to edit ${nouns}.` });
            break;
          case 'slug-taken':
            setStatus({ tone: 'error', text: `Another ${noun} already uses the ${slugWord} “${showSlug(page.slug)}”.` });
            setOpen((previous) => new Set(previous).add(SETTINGS));
            break;
          case 'not-found':
            setStatus({ tone: 'error', text: `This ${noun} no longer exists.` });
            break;
          case 'bad-time':
            setStatus({ tone: 'error', text: 'Not scheduled. Pick a time in the future.' });
            break;
        }
      } catch (error) {
        setStatus({ tone: 'error', text: `Save failed: ${error instanceof Error ? error.message : String(error)}` });
      }
    });
  };

  const unpublish = () => {
    if (!onUnpublish) return;
    setDialog(null);
    setStatus({ tone: 'info', text: 'Unpublishing…' });
    startSaving(async () => {
      try {
        await onUnpublish();
        setPublished(false);
        setUnpublished(false);
        setSchedule(undefined);
        setStatus({ tone: 'success', text: `Unpublished. The ${noun} is no longer on the live site.` });
      } catch (error) {
        setStatus({ tone: 'error', text: `Unpublish failed: ${error instanceof Error ? error.message : String(error)}` });
      }
    });
  };

  const cancelSchedule = () => {
    if (!onCancelSchedule) return;
    startSaving(async () => {
      try {
        await onCancelSchedule();
        setSchedule(undefined);
        setStatus({ tone: 'success', text: 'Schedule canceled.' });
      } catch (error) {
        setStatus({ tone: 'error', text: `Couldn’t cancel the schedule: ${error instanceof Error ? error.message : String(error)}` });
      }
    });
  };

  const fetchHistory = (before?: number) => {
    if (!loadHistory) return;
    setHistory((previous) => ({ ...previous, loading: true, error: undefined }));
    loadHistory(before)
      .then((items) =>
        setHistory((previous) => ({ items: before === undefined ? items : [...previous.items, ...items], more: items.length >= HISTORY_PAGE, loading: false })),
      )
      .catch((error: unknown) => setHistory((previous) => ({ ...previous, loading: false, error: error instanceof Error ? error.message : String(error) })));
  };
  const openHistory = () => {
    setHistory({ items: [], more: false, loading: true });
    setDialog('history');
    fetchHistory();
  };

  const restore = (from: number) => {
    if (!onRestore) return;
    setDialog(null);
    setStatus({ tone: 'info', text: `Restoring version ${from}…` });
    startSaving(async () => {
      try {
        const result = await onRestore({ version: from, expectedVersion: version });
        setIssues(result.issues);
        if (result.ok) {
          setVersion(result.version);
          setSavedAt(new Date().toISOString());
          setPage(upgradeForEditing(contentType, result.page));
          setDirty(false);
          setDeleted(null);
          setUnpublished(published);
          setStatus({
            tone: 'success',
            text: `Restored version ${from} as a new draft (version ${result.version}).${published ? ` The live ${noun} is unchanged until you publish.` : ''}`,
          });
          onSaved?.(result, 'draft');
          return;
        }
        switch (result.reason) {
          case 'conflict':
            setStatus({ tone: 'error', text: `Not restored. Someone else saved this ${noun} after you opened it. Reload to see their version.`, reload: true });
            break;
          case 'slug-taken':
            setStatus({ tone: 'error', text: `Not restored. Another ${noun} now uses that version’s ${slugWord}. Change that ${noun}’s ${slugWord} first, or copy what you need from the old version.` });
            break;
          case 'forbidden':
            setStatus({ tone: 'error', text: `Your account is not allowed to edit ${nouns}.` });
            break;
          case 'not-found':
            setStatus({ tone: 'error', text: `Not restored. Version ${from} no longer exists.` });
            break;
          default:
            setStatus({ tone: 'error', text: `Not restored. Version ${from} has errors that can’t be saved.` });
        }
      } catch (error) {
        setStatus({ tone: 'error', text: `Restore failed: ${error instanceof Error ? error.message : String(error)}` });
      }
    });
  };

  /** Loads the pages that link to this one, for the Unpublish and Delete dialogs. */
  const loadLinks = () => {
    if (!findLinks) {
      setLinks([]);
      return;
    }
    setLinks(null);
    findLinks()
      .then(setLinks)
      .catch(() => setLinks([]));
  };

  const openDelete = () => {
    setDialog('delete');
    if (!published) loadLinks();
  };

  const openUnpublish = () => {
    setDialog('unpublish');
    loadLinks();
  };

  const removePage = () => {
    if (!onDelete) return;
    setDialog(null);
    setStatus({ tone: 'info', text: 'Deleting…' });
    startSaving(async () => {
      try {
        const result = await onDelete({ expectedVersion: version });
        if (result.ok) {
          // Nothing left to save: don't warn about unsaved changes on the way out.
          setDirty(false);
          setStatus({ tone: 'success', text: `${Noun} deleted.` });
          onDeleted?.();
          return;
        }
        const text = {
          live: `Not deleted. The ${noun} is live: unpublish it first.`,
          conflict: `Not deleted. Someone else saved this ${noun} after you opened it. Reload to see their version.`,
          forbidden: `Your account is not allowed to delete ${nouns}.`,
          'not-found': `This ${noun} was already deleted.`,
          'in-use': `Not deleted. Other records still depend on this ${noun}${noun === 'form' ? ': delete its submissions first' : ''}.`,
        }[result.reason];
        setStatus({ tone: 'error', text, reload: result.reason === 'conflict' });
      } catch (error) {
        setStatus({ tone: 'error', text: `Delete failed: ${error instanceof Error ? error.message : String(error)}` });
      }
    });
  };

  const removePanel = (index: number) => {
    const panel = page.panels[index];
    if (!panel) return;
    setDeleted({ panel, index, name: panelName(definitions.get(panel.type), panel.data, panel.type) });
    setPanels(removeItem(page.panels, index));
  };

  const addPanel = (definition: AnyPanel) => {
    const panel = newPanel(definition);
    setOpen((previous) => new Set(previous).add(panel.id));
    setScrollTo(panel.id);
    setPanels([...page.panels, panel]);
    setDialog(null);
  };

  // Where each box goes, from the content type's `editor` layout: page and
  // other boxes in Page settings, lead boxes (the hero) as fixed cards.
  const lead = new Set<string>(contentType.editor?.leadBoxes ?? []);
  const allBoxes = Object.entries(contentType.boxes as BoxMap);
  const settingsBoxes = allBoxes.filter(([name]) => !lead.has(name) || (contentType.editor?.pageBoxes ?? []).includes(name));
  const leadBoxes = allBoxes.filter(([name]) => lead.has(name) && !(contentType.editor?.pageBoxes ?? []).includes(name));
  const settingsIssues = [...issuesAt(issues, ['title']), ...issuesAt(issues, ['slug']), ...settingsBoxes.flatMap(([name]) => issuesAt(issues, ['boxes', name]))];
  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const changes = published && (dirty || unpublished);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const nameAt = (index: number) => {
    const panel = page.panels[index];
    return panel ? panelName(definitions.get(panel.type), panel.data, panel.type) : '';
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= page.panels.length || from === to) return;
    setAnnouncement(`${nameAt(from)} moved to position ${to + 1} of ${page.panels.length}.`);
    setPanels(moveItem(page.panels, from, to));
  };
  const onDragStart = (event: DragStartEvent) => {
    const index = page.panels.findIndex((panel) => panel.id === event.active.id);
    setAnnouncement(`Picked up ${nameAt(index)}.`);
  };
  const onDragEnd = (event: DragEndEvent) => {
    const from = page.panels.findIndex((panel) => panel.id === event.active.id);
    const to = event.over ? page.panels.findIndex((panel) => panel.id === event.over!.id) : from;
    if (from !== to) move(from, to);
    else setAnnouncement(`${nameAt(from)} dropped.`);
  };

  const previewUrl = previewHref && version > 0 ? previewHref(page.slug) : undefined;
  const openSchedule = () => {
    setScheduleAt(schedule ? toLocalInput(new Date(schedule.at)) : defaultScheduleTime());
    setDialog('schedule');
  };

  return (
    <div className="cera-editor">
      <header className="cera-topbar">
        {backHref && (
          <a className="cera-back" href={backHref} aria-label={`Back to ${backLabel}`}>
            <Icon name="chevronLeft" size={16} strokeWidth={2} />
            {backLabel}
          </a>
        )}
        <div className="cera-topbar__title">
          <h1>{page.title || `Untitled ${noun}`}</h1>
          <StateLine noun={noun} version={version} published={published} publishable={publishable} changes={changes} schedule={schedule} onCancelSchedule={!readOnly && onCancelSchedule ? cancelSchedule : undefined} />
        </div>
        <div className="cera-topbar__actions">
          {!readOnly && (
            <span className={`cera-topbar__saved${dirty ? ' is-dirty' : ''}`} aria-live="polite" suppressHydrationWarning>
              {saving ? 'Saving…' : dirty ? 'Unsaved changes' : version > 0 && savedAt ? `Saved ${formatWhen(savedAt).toLowerCase()}` : ''}
            </span>
          )}
          {!readOnly && published && onUnpublish && (
            <>
              <button type="button" className="cera-button cera-button--lg cera-button--danger cera-topbar__wide" disabled={saving} onClick={openUnpublish}>
                Unpublish
              </button>
              <span className="cera-divider cera-topbar__wide" aria-hidden="true" />
            </>
          )}
          {previewUrl && (
            <a className="cera-button cera-button--lg cera-topbar__wide" href={previewUrl} target="_blank" rel="noreferrer" title={dirty ? 'Preview shows the last saved draft' : undefined}>
              <Icon name="eye" />
              Preview
            </a>
          )}
          {!readOnly && !publishable && (
            <button type="button" className="cera-button cera-button--lg cera-button--primary" disabled={saving || (!dirty && version > 0)} onClick={() => save('draft')}>
              Save
            </button>
          )}
          {!readOnly && publishable && (
            <>
              <button type="button" className="cera-button cera-button--lg cera-topbar__wide" disabled={saving || (!dirty && version > 0)} onClick={() => save('draft')}>
                Save draft
              </button>
              {onCancelSchedule && (
                <button type="button" className="cera-button cera-button--lg cera-topbar__wide" disabled={saving} onClick={openSchedule}>
                  <Icon name="clock" />
                  Schedule
                </button>
              )}
            </>
          )}
          {/* The other actions as one menu, shown instead of their buttons on narrow screens (admin.css). */}
          {publishable && (
            <ActionsMenu
              actions={[
                ...(!readOnly ? [{ label: 'Save draft', disabled: saving || (!dirty && version > 0), onSelect: () => save('draft') }] : []),
                ...(!readOnly && onCancelSchedule ? [{ label: 'Schedule', disabled: saving, onSelect: openSchedule }] : []),
                ...(previewUrl ? [{ label: 'Preview', href: previewUrl }] : []),
                ...(!readOnly && published && onUnpublish ? [{ label: 'Unpublish', danger: true, disabled: saving, onSelect: openUnpublish }] : []),
              ]}
            />
          )}
          {!readOnly && publishable && (
            <button type="button" className="cera-button cera-button--lg cera-button--primary" disabled={saving || (published && !changes)} onClick={() => save('publish')}>
              {published ? 'Publish changes' : 'Publish'}
            </button>
          )}
        </div>
      </header>

      <div className="cera-stack">
        {readOnly && <p className="cera-status cera-status--info">You can view this {noun} but not change it.</p>}
        {status && (
          <p className={`cera-status cera-status--${status.tone}`} role={status.tone === 'error' ? 'alert' : 'status'}>
            {status.text}
            {errorCount > 0 && status.tone === 'error' && ` ${errorCount} error${errorCount === 1 ? '' : 's'}, each next to its field.`}
            {status.reload && (
              <button type="button" className="cera-button cera-button--small" onClick={() => window.location.reload()}>
                Reload
              </button>
            )}
          </p>
        )}

        {/* Page settings: title, address and the content type's boxes. */}
        <Card
          id={SETTINGS}
          name={`${Noun} settings`}
          open={open.has(SETTINGS) || settingsIssues.length > 0}
          onToggle={() => toggle(SETTINGS)}
          hasError={settingsIssues.some((issue) => issue.severity === 'error')}
        >
          <div className="cera-panel-card__group">
            <div className="cera-fields">
              <div className="cera-field cera-field--text" data-field="title">
                <label htmlFor="cera-title" className="cera-field__label">
                  {contentType.editor?.titleLabel ?? 'Title'}
                </label>
                <input
                  id="cera-title"
                  type="text"
                  value={page.title}
                  readOnly={readOnly}
                  onChange={(event) => {
                    const title = event.target.value;
                    update({ ...page, title, ...(slugTouched ? {} : { slug: slugify(title) }) });
                  }}
                />
                <IssueList issues={issuesAt(issues, ['title'])} />
              </div>
              <div className="cera-field cera-field--text" data-field="slug">
                <label htmlFor="cera-slug" className="cera-field__label">
                  {slugLabel}
                </label>
                <input
                  id="cera-slug"
                  type="text"
                  className="cera-code"
                  value={page.slug}
                  readOnly={readOnly}
                  onChange={(event) => {
                    setSlugTouched(true);
                    update({ ...page, slug: event.target.value });
                  }}
                />
                <p className="cera-note">{contentType.editor?.slugNote ?? `Lowercase words joined by hyphens.${contentType.route === '/[slug]' ? ' “home” is the front page.' : ''}`}</p>
                <IssueList issues={issuesAt(issues, ['slug'])} />
              </div>
            </div>
          </div>
          {settingsBoxes.map(([name, fields]) => (
            <div key={name} className="cera-panel-card__group">
              <h3>{humanize(name)}</h3>
              <FieldMapForm fields={fields} value={page.boxes[name]} onChange={(boxValue) => update(setIn(page, ['boxes', name], boxValue))} path={['boxes', name]} context={context} />
            </div>
          ))}
          {version > 0 && (loadHistory || (!readOnly && onDelete)) && (
            <div className="cera-panel-card__group cera-settings-actions">
              {loadHistory && (
                <button type="button" className="cera-button" onClick={openHistory}>
                  <Icon name="history" />
                  History
                </button>
              )}
              {!readOnly && onDelete && (
                <button type="button" className="cera-button cera-button--danger" disabled={saving} onClick={openDelete}>
                  <Icon name="trash" />
                  Delete {noun}
                </button>
              )}
            </div>
          )}
        </Card>

        {/* Lead boxes (the hero) render like panels, but can't be moved, hidden or removed. */}
        {leadBoxes.map(([name, fields]) => {
          const data = (page.boxes[name] ?? {}) as Record<string, unknown>;
          const boxIssues = issuesAt(issues, ['boxes', name]);
          return (
            <Card
              key={name}
              id={name}
              lead
              badge={humanize(name)}
              name={panelName(undefined, data, humanize(name))}
              open={open.has(name) || boxIssues.length > 0}
              onToggle={() => toggle(name)}
              hasError={boxIssues.some((issue) => issue.severity === 'error')}
            >
              <FieldMapForm fields={fields} value={page.boxes[name]} onChange={(boxValue) => update(setIn(page, ['boxes', name], boxValue))} path={['boxes', name]} context={context} />
            </Card>
          );
        })}

        <DndContext sensors={sensors} collisionDetection={closestCenter} accessibility={QUIET} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setAnnouncement('Move canceled.')}>
          <SortableContext items={page.panels.map((panel) => panel.id)} strategy={verticalListSortingStrategy}>
            {page.panels.map((panel, i) => {
              const definition = definitions.get(panel.type);
              const path = ['panels', i];
              const all = issuesAt(issues, path);
              return (
                <SortableCard
                  key={panel.id}
                  id={panel.id}
                  index={i}
                  count={page.panels.length}
                  readOnly={readOnly}
                  onMove={move}
                  badge={definition?.label ?? panel.type}
                  name={panelName(definition, panel.data, panel.type)}
                  hidden={panel.hidden}
                  open={!definition || open.has(panel.id) || all.length > 0}
                  onToggle={() => toggle(panel.id)}
                  hasError={all.some((issue) => issue.severity === 'error')}
                  actions={
                    !readOnly && (
                      <>
                        <button
                          type="button"
                          className="cera-icon-button"
                          aria-label={panel.hidden ? `Show ${item} on the ${noun}` : `Hide ${item} from the ${noun}`}
                          title={panel.hidden ? `Show ${item} on the ${noun}` : `Hide ${item} from the ${noun}`}
                          onClick={() => setPanels(setIn(page.panels, [i, 'hidden'], !panel.hidden))}
                        >
                          <Icon name={panel.hidden ? 'eyeOff' : 'eye'} />
                        </button>
                        <button type="button" className="cera-icon-button" aria-label={`Duplicate ${item}`} title={`Duplicate ${item}`} onClick={() => setPanels(duplicatePanel(page.panels, i))}>
                          <Icon name="duplicate" />
                        </button>
                        <button type="button" className="cera-icon-button cera-danger" aria-label={`Delete ${item}`} title={`Delete ${item}`} onClick={() => removePanel(i)}>
                          <Icon name="trash" />
                        </button>
                        <span className="cera-divider" aria-hidden="true" />
                      </>
                    )
                  }
                >
                  <IssueList issues={issuesAt(issues, path, true)} />
                  {definition ? (
                    <FieldMapForm fields={definition.fields} value={panel.data} onChange={(data) => setPanels(setIn(page.panels, [i, 'data'], data))} path={[...path, 'data']} context={context} />
                  ) : (
                    <p className="cera-note">This site has no definition for “{panel.type}” {item}s, so it can’t be edited here. It is kept exactly as stored when you save.</p>
                  )}
                </SortableCard>
              );
            })}
          </SortableContext>
        </DndContext>
        <p className="cera-visually-hidden" aria-live="assertive">
          {announcement}
        </p>

        {deleted && (
          <p className="cera-status cera-status--info" role="status">
            Deleted the {deleted.name} {item}. It’s gone from the {noun} when you next save.
            <button
              type="button"
              className="cera-button cera-button--small"
              onClick={() => {
                const list = [...page.panels];
                list.splice(Math.min(deleted.index, list.length), 0, deleted.panel);
                setPanels(list);
                setDeleted(null);
              }}
            >
              Undo
            </button>
          </p>
        )}

        {!readOnly && contentType.panels.length > 0 && (
          <button type="button" className="cera-add-panel" onClick={() => setDialog('add')}>
            <Icon name="plus" strokeWidth={2} />
            Add {item}
          </button>
        )}
      </div>

      <Dialog open={dialog === 'unpublish'} onClose={() => setDialog(null)} title={`Unpublish this ${noun}?`}>
        <p>
          It comes off the live site{schedule ? ', and its scheduled publish is canceled' : ''}. Its content and history are kept, and you can publish it again at any time.
        </p>
        {links === null ? (
          <p className="cera-note">Checking which pages feature it…</p>
        ) : (
          links.some((link) => link.live) && (
            <div>
              <p>{links.filter((link) => link.live).length === 1 ? 'This live page features it and will stop showing it:' : 'These live pages feature it and will stop showing it:'}</p>
              <LinkList links={links.filter((link) => link.live)} />
            </div>
          )
        )}
        <div className="cera-dialog__buttons">
          <button type="button" className="cera-button" onClick={() => setDialog(null)}>
            Keep it live
          </button>
          <button type="button" className="cera-button cera-button--danger" disabled={links === null} onClick={unpublish}>
            Unpublish
          </button>
        </div>
      </Dialog>

      <Dialog open={dialog === 'schedule'} onClose={() => setDialog(null)} title={schedule ? 'Change the schedule' : 'Schedule publishing'}>
        <form
          className="cera-dialog__body"
          style={{ padding: 0 }}
          onSubmit={(event) => {
            event.preventDefault();
            const at = new Date(scheduleAt);
            if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) {
              setStatus({ tone: 'error', text: 'Not scheduled. Pick a time in the future.' });
            } else {
              save('schedule', at.toISOString());
            }
            setDialog(null);
          }}
        >
          <label className="cera-inline">
            Publish on
            <input type="datetime-local" required value={scheduleAt} min={toLocalInput(new Date())} onChange={(event) => setScheduleAt(event.target.value)} />
          </label>
          <p className="cera-note">
            This saves the page as it is now and publishes that version at the time you pick (your time zone). Changes you make afterwards wait for the next publish. It goes
            live within a few minutes of the time.
          </p>
          <div className="cera-dialog__buttons">
            <button type="button" className="cera-button" onClick={() => setDialog(null)}>
              Cancel
            </button>
            <button type="submit" className="cera-button cera-button--primary">
              {schedule ? 'Change schedule' : 'Schedule'}
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog open={dialog === 'history'} onClose={() => setDialog(null)} title="Page history" wide>
        <p className="cera-note">
          Every save is kept. Restoring a version saves its content as a new draft{published ? `, and the live ${noun} stays as it is until you publish` : ''}. You can undo a
          restore by restoring the version before it.
        </p>
        {dirty && !readOnly && <p className="cera-status cera-status--info">You have unsaved changes. Restoring a version replaces them.</p>}
        {history.error && <p className="cera-status cera-status--error">Couldn’t load the history: {history.error}</p>}
        {history.items.length > 0 && (
          <ol className="cera-history">
            {history.items.map((revision) => (
              <li key={revision.version} className="cera-history__row">
                <div className="cera-history__main">
                  <p className="cera-history__head">
                    <strong>Version {revision.version}</strong>
                    {revision.live && <span className="cera-pill">Live</span>}
                    {revision.version === version && <span className="cera-tag">Current</span>}
                  </p>
                  <p className="cera-history__meta" suppressHydrationWarning>
                    {revisionKind(revision)} · {formatWhen(revision.createdAt)}
                    {revision.createdBy && ` by ${revision.createdBy}`}
                  </p>
                  {(revision.title !== page.title || revision.slug !== page.slug) && (
                    <p className="cera-history__diff">
                      {revision.title !== page.title && <span>Title: {revision.title || 'Untitled'}</span>}
                      {revision.slug !== page.slug && <span className="cera-mono">/{revision.slug}</span>}
                    </p>
                  )}
                </div>
                {previewHref && (
                  <a className="cera-button cera-button--small" href={previewHref(page.slug, { pageId: page.id, version: revision.version })} target="_blank" rel="noopener">
                    Preview
                  </a>
                )}
                {!readOnly && onRestore && revision.version !== version && (
                  <button type="button" className="cera-button cera-button--small" disabled={saving} onClick={() => restore(revision.version)}>
                    Restore
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
        {history.loading && <p className="cera-note">Loading…</p>}
        <div className="cera-dialog__buttons">
          {history.more && !history.loading && (
            <button type="button" className="cera-button" onClick={() => fetchHistory(history.items[history.items.length - 1]?.version)}>
              Show older versions
            </button>
          )}
          <button type="button" className="cera-button" onClick={() => setDialog(null)}>
            Close
          </button>
        </div>
      </Dialog>

      <Dialog open={dialog === 'delete'} onClose={() => setDialog(null)} title={published ? 'Unpublish before deleting' : `Delete this ${noun}?`}>
        {published ? (
          <>
            <p>“{page.title || `Untitled ${noun}`}” is on the live site. Unpublish it first, then delete it.</p>
            <div className="cera-dialog__buttons">
              <button type="button" className="cera-button" onClick={() => setDialog(null)}>
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              “{page.title || `Untitled ${noun}`}” and all its saved versions are deleted for good{schedule ? ', and its scheduled publish is canceled' : ''}. This can’t be undone.
              {dirty && ' Your unsaved changes are lost too.'}
            </p>
            {links === null ? (
              <p className="cera-note">Checking which pages link to it…</p>
            ) : (
              links.length > 0 && (
                <div>
                  <p>{links.length === 1 ? 'This page links to it and will stop showing it:' : 'These pages link to it and will stop showing it:'}</p>
                  <LinkList links={links} />
                </div>
              )
            )}
            <div className="cera-dialog__buttons">
              <button type="button" className="cera-button" onClick={() => setDialog(null)}>
                Keep {noun}
              </button>
              <button type="button" className="cera-button cera-button--danger" disabled={links === null} onClick={removePage}>
                Delete {noun}
              </button>
            </div>
          </>
        )}
      </Dialog>

      <Dialog open={dialog === 'add'} onClose={() => setDialog(null)} title={`Add a ${item}`} wide>
        <p className="cera-note">New {item}s go at the end of the {noun}. Drag them by the handle to move them.</p>
        <ul className="cera-picker-grid">
          {contentType.panels.map((definition: AnyPanel) => (
            <li key={definition.type}>
              <button type="button" onClick={() => addPanel(definition)}>
                <strong>{definition.label}</strong>
                {definition.description && <span>{definition.description}</span>}
              </button>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}

/** What kind of save a revision was, for the History dialog. */
function revisionKind(revision: PageRevision): string {
  if (revision.restoredFrom !== undefined) return `Restored from version ${revision.restoredFrom}`;
  if (revision.kind === 'publish') return 'Published';
  if (revision.kind === 'schedule' && revision.schedule) {
    const when = formatScheduled(revision.schedule.at);
    return {
      pending: `Scheduled for ${when}`,
      published: `Scheduled, went live ${when}`,
      cancelled: `Scheduled for ${when}, canceled`,
      failed: `Scheduled for ${when}, failed`,
    }[revision.schedule.status];
  }
  return 'Draft saved';
}

function StateLine({
  noun,
  version,
  published,
  publishable,
  changes,
  schedule,
  onCancelSchedule,
}: {
  noun: string;
  version: number;
  published: boolean;
  publishable: boolean;
  changes: boolean;
  schedule?: PageSchedule;
  onCancelSchedule?: () => void;
}) {
  const cancel = onCancelSchedule && (
    <button type="button" className="cera-text-button" style={{ height: 28, padding: '0 6px', fontSize: 13 }} onClick={onCancelSchedule}>
      Cancel schedule
    </button>
  );
  if (published) {
    return (
      <span className="cera-state">
        <span className="cera-state__dot" aria-hidden="true" />
        Published
        {changes && (
          <>
            {' · '}
            <span className="cera-state__changes">unpublished changes</span>
          </>
        )}
        {schedule && (
          <>
            {' · '}
            <span suppressHydrationWarning>update scheduled for {formatScheduled(schedule.at)}</span>
            {cancel}
          </>
        )}
      </span>
    );
  }
  if (schedule) {
    return (
      <span className="cera-state">
        <span className="cera-state__dot cera-state__dot--scheduled" aria-hidden="true" />
        <span suppressHydrationWarning>Scheduled for {formatScheduled(schedule.at)}</span>
        {cancel}
      </span>
    );
  }
  return (
    <span className="cera-state">
      <span className="cera-state__dot cera-state__dot--draft" aria-hidden="true" />
      {version === 0 ? `New ${noun}, not saved yet` : publishable ? 'Draft' : 'In the admin only'}
    </span>
  );
}

interface CardProps {
  id: string;
  /** The pill before the name (a panel's type). Cards whose name says enough, like Page settings, have none. */
  badge?: string;
  name: string;
  open: boolean;
  onToggle: () => void;
  hasError?: boolean;
  hidden?: boolean;
  lead?: boolean;
  actions?: ReactNode;
  grip?: ReactNode;
  children: ReactNode;
}

const Card = ({ ref, style, dragging, ...props }: CardProps & { ref?: (element: HTMLElement | null) => void; style?: CSSProperties; dragging?: boolean }) => {
  const { id, badge, name, open, onToggle, hasError, hidden, lead, actions, grip, children } = props;
  const bodyId = `cera-panel-body-${id}`;
  return (
    <section
      ref={ref}
      style={style}
      id={`cera-panel-${id}`}
      className={`cera-panel-card${open ? ' is-open' : ''}${hidden ? ' is-hidden' : ''}${hasError ? ' has-error' : ''}${lead ? ' cera-panel-card--lead' : ''}${dragging ? ' is-dragging' : ''}`}
      aria-label={badge ? `${badge}: ${name}` : name}
    >
      <div className="cera-panel-card__head">
        {grip ?? <span className="cera-grip-spacer" aria-hidden="true" />}
        <div className="cera-panel-card__label">
          {badge && <span className="cera-badge cera-badge--type">{badge}</span>}
          <span className="cera-panel-card__name">{name}</span>
          {hidden && <span className="cera-tag">Hidden</span>}
        </div>
        <div className="cera-panel-card__actions">
          {/* The panel's tools (show/hide, duplicate, delete); at 600px and narrower they show only once the card is open (admin.css). */}
          {actions && <span className="cera-panel-card__tools">{actions}</span>}
          <button
            type="button"
            className="cera-icon-button cera-panel-card__chevron"
            aria-expanded={open}
            aria-controls={bodyId}
            aria-label={open ? `Fold ${name}` : `Open ${name}`}
            title={open ? 'Fold' : 'Open'}
            onClick={onToggle}
          >
            <Icon name="chevronDown" strokeWidth={2} />
          </button>
        </div>
      </div>
      <div className="cera-panel-card__body" id={bodyId} hidden={!open}>
        {open && children}
      </div>
    </section>
  );
};

function SortableCard({
  index,
  count,
  readOnly,
  onMove,
  ...props
}: CardProps & { index: number; count: number; readOnly: boolean; onMove: (from: number, to: number) => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: props.id, disabled: readOnly });
  const hintId = `cera-grip-hint-${props.id}`;
  const grip = readOnly ? undefined : (
    <>
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="cera-grip"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        aria-describedby={hintId}
        // dnd-kit's own keyboard dragging is off; arrow keys move the panel one place.
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            onMove(index, index + (event.key === 'ArrowUp' ? -1 : 1));
          }
        }}
      >
        <GripIcon />
      </button>
      <span id={hintId} hidden>
        Panel {index + 1} of {count}. Use the up and down arrow keys to move it.
      </span>
    </>
  );
  return <Card {...props} ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} dragging={isDragging} grip={grip} />;
}

interface MenuAction {
  label: string;
  /** A link (opened in a new tab), or else a button that calls onSelect. */
  href?: string;
  onSelect?: () => void;
  disabled?: boolean;
  danger?: boolean;
}

/**
 * The top bar's actions as one "Actions" menu, for narrow screens. Choosing
 * one closes the menu and puts focus back on its button first, so a dialog
 * the action opens returns focus there when it closes.
 */
function ActionsMenu({ actions }: { actions: MenuAction[] }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // Close on Escape (back to the button) or a click elsewhere.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    const onClick = (event: MouseEvent) => !root.current?.contains(event.target as Node) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  if (actions.length === 0) return null;
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  return (
    <div className="cera-topbar__more" ref={root}>
      <button ref={button} type="button" className="cera-button cera-button--lg" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(!open)}>
        Actions
        <Icon name="chevronDown" size={16} strokeWidth={2} />
      </button>
      <div className="cera-menu cera-menu--down" id={menuId} hidden={!open}>
        {actions.map((action) =>
          action.href ? (
            <a key={action.label} href={action.href} target="_blank" rel="noreferrer" onClick={close}>
              {action.label}
            </a>
          ) : (
            <button
              key={action.label}
              type="button"
              className={action.danger ? 'is-danger' : undefined}
              disabled={action.disabled}
              onClick={() => {
                close();
                action.onSelect?.();
              }}
            >
              {action.label}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

/** Pages that link to this one, with whether each link is live or only in a draft. */
function LinkList({ links }: { links: PageLink[] }) {
  return (
    <ul className="cera-link-list">
      {links.map((link) => (
        <li key={link.id}>
          {link.title || 'Untitled'} <span className="cera-mono">/{link.slug}</span> {link.live ? <span className="cera-pill">Live</span> : <span className="cera-pill cera-pill--draft">Draft</span>}
        </li>
      ))}
    </ul>
  );
}
