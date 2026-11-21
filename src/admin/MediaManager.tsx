'use client';
/**
 * The Media page: browse and search the library (a page at a time, or only
 * the files no page uses), upload files, change a file's alt text, replace
 * the file everywhere it's used, see which pages use it, and delete it when
 * none do.
 *
 * Sites pass server actions wrapping `updateMedia`, `deleteMedia`,
 * `mediaUsage` and (through mediaReplacer) `replaceMedia` from ./supabase,
 * plus the picker's `MediaContext`, each checking the user's role.
 */
import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import type { MediaDeleteResult, MediaItem, MediaKind, MediaReplaceResult, MediaUpdate, MediaUploadResult, MediaUse } from '../media.ts';
import { formatBytes, mediaAccept } from '../media.ts';
import { mediaUrl } from '../media-url.ts';
import { MediaLibrary, type MediaContext } from './media.tsx';

export interface MediaManagerProps {
  /** Searches the library and, for editors, uploads to it. */
  media: MediaContext;
  /** Editors and admins can upload, change alt text and delete; viewers only look. */
  canEdit: boolean;
  onUpdate: (update: MediaUpdate) => Promise<MediaUploadResult>;
  onDelete: (id: string) => Promise<MediaDeleteResult>;
  /** Replaces a file with a new upload (see mediaReplacer). Without it, files can't be replaced. */
  onReplace?: (id: string, file: File) => Promise<MediaReplaceResult>;
  findUsage: (path: string) => Promise<MediaUse[]>;
  /** Where to edit a page that uses a file. */
  pageHref: (use: MediaUse) => string;
}

type Status = { kind: 'success' | 'error'; text: string } | null;

const KINDS: Record<string, MediaKind[]> = { all: ['image', 'video'], image: ['image'], video: ['video'] };
const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });
const fileName = (path: string) => path.split('/').pop() ?? path;

export function MediaManager({ media, canEdit, onUpdate, onDelete, onReplace, findUsage, pageHref }: MediaManagerProps) {
  const [kind, setKind] = useState<keyof typeof KINDS>('all');
  const [unused, setUnused] = useState(false);
  const [version, setVersion] = useState(0);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const reload = () => setVersion((previous) => previous + 1);

  async function uploadAll(files: File[]) {
    setStatus(null);
    const failures: string[] = [];
    let last: MediaItem | null = null;
    for (const [index, file] of files.entries()) {
      setBusy(files.length > 1 ? `Uploading ${index + 1} of ${files.length}: ${file.name}…` : `Uploading ${file.name}…`);
      try {
        const result = await media.upload(file);
        if (result.ok) last = result.item;
        else failures.push(`${file.name}: ${result.message}`);
      } catch {
        failures.push(`${file.name}: the upload failed.`);
      }
    }
    setBusy(null);
    if (fileInput.current) fileInput.current.value = '';
    if (last) {
      setSelected(last);
      reload();
    }
    const done = files.length - failures.length;
    if (failures.length) setStatus({ kind: 'error', text: failures.join(' ') });
    else if (done) setStatus({ kind: 'success', text: done === 1 ? 'Uploaded.' : `Uploaded ${done} files.` });
  }

  return (
    <div
      className="cera-media-manager"
      onDragOver={(event) => {
        if (canEdit && !busy) event.preventDefault();
      }}
      onDrop={(event) => {
        if (!canEdit || busy) return;
        event.preventDefault();
        const files = [...event.dataTransfer.files];
        if (files.length) void uploadAll(files);
      }}
    >
      <div className="cera-media-manager__bar">
        <label className="cera-inline">
          Show
          <select value={kind} onChange={(event) => setKind(event.target.value as keyof typeof KINDS)}>
            <option value="all">All files</option>
            <option value="image">Images</option>
            <option value="video">Videos</option>
          </select>
        </label>
        <label className="cera-check">
          <input type="checkbox" checked={unused} onChange={(event) => setUnused(event.target.checked)} />
          Only files no page uses
        </label>
        {canEdit && (
          <>
            <input
              ref={fileInput}
              type="file"
              multiple
              className="cera-visually-hidden"
              accept={mediaAccept(['image', 'video'])}
              disabled={Boolean(busy)}
              onChange={(event) => {
                const files = [...(event.target.files ?? [])];
                if (files.length) void uploadAll(files);
              }}
            />
            <button type="button" className="cera-button cera-button--primary" disabled={Boolean(busy)} onClick={() => fileInput.current?.click()}>
              Upload files
            </button>
            <span className="cera-note">or drop them here</span>
          </>
        )}
      </div>
      {busy && (
        <p className="cera-note" role="status">
          {busy}
        </p>
      )}
      {status && (
        <p className={`cera-status cera-status--${status.kind}`} role={status.kind === 'error' ? 'alert' : 'status'}>
          {status.text}
        </p>
      )}

      <div className="cera-media-manager__layout">
        <MediaLibrary find={media.find} kinds={KINDS[kind]!} unused={unused} version={version} isSelected={(id) => id === selected?.id} onPick={(item) => (setSelected(item), setStatus(null))} />
        {selected ? (
          <MediaDetails
            key={selected.id}
            item={selected}
            canEdit={canEdit}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onReplace={onReplace}
            findUsage={findUsage}
            pageHref={pageHref}
            onSaved={(item) => {
              setSelected(item);
              reload();
            }}
            onDeleted={() => {
              setStatus({ kind: 'success', text: `Deleted ${fileName(selected.path)}.` });
              setSelected(null);
              reload();
            }}
            onClose={() => setSelected(null)}
          />
        ) : (
          <p className="cera-note cera-media-manager__hint">Select a file to see its details{canEdit ? ', change its alt text or delete it' : ''}.</p>
        )}
      </div>
    </div>
  );
}

function MediaDetails({
  item,
  canEdit,
  onUpdate,
  onDelete,
  onReplace,
  findUsage,
  pageHref,
  onSaved,
  onDeleted,
  onClose,
}: Omit<MediaManagerProps, 'media'> & {
  item: MediaItem;
  onSaved: (item: MediaItem) => void;
  onDeleted: () => void;
  onClose: () => void;
}) {
  const [alt, setAlt] = useState(item.alt ?? '');
  const [usage, setUsage] = useState<MediaUse[] | null>(null);
  const [usageError, setUsageError] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [pending, startTransition] = useTransition();
  const section = useRef<HTMLElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const url = mediaUrl(item);

  // On narrow screens the details sit above the grid, so bring them into view.
  useEffect(() => {
    section.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, []);

  useEffect(() => {
    let current = true;
    findUsage(item.path)
      .then((found) => current && setUsage(found))
      .catch(() => current && setUsageError(true));
    return () => {
      current = false;
    };
  }, [findUsage, item.path]);

  function save(event: FormEvent) {
    event.preventDefault();
    setStatus(null);
    startTransition(async () => {
      const result = await onUpdate({ id: item.id, alt });
      if (result.ok) {
        setStatus({ kind: 'success', text: 'Alt text saved.' });
        onSaved(result.item);
      } else {
        setStatus({ kind: 'error', text: result.message });
      }
    });
  }

  function replace(file: File) {
    if (!onReplace) return;
    setStatus(null);
    startTransition(async () => {
      try {
        const result = await onReplace(item.id, file);
        if (result.ok) {
          setStatus({
            kind: 'success',
            text: result.pages ? `Replaced. ${result.pages === 1 ? 'The page that uses it shows' : `All ${result.pages} pages that use it show`} the new file, live versions included.` : 'Replaced.',
          });
          onSaved(result.item);
        } else setStatus({ kind: 'error', text: result.message });
      } catch {
        setStatus({ kind: 'error', text: 'The file couldn’t be replaced. Try again.' });
      } finally {
        if (replaceInput.current) replaceInput.current.value = '';
      }
    });
  }

  function remove() {
    if (!window.confirm(`Delete ${fileName(item.path)}? It’s removed from the library and from storage, and can’t be restored.`)) return;
    setStatus(null);
    startTransition(async () => {
      const result = await onDelete(item.id);
      if (result.ok) onDeleted();
      else {
        if (result.usedBy) setUsage(result.usedBy);
        setStatus({ kind: 'error', text: result.message });
      }
    });
  }

  const inUse = Boolean(usage?.length);

  return (
    <section ref={section} className="cera-section cera-media-details" aria-label={`Details for ${fileName(item.path)}`}>
      <div className="cera-media-details__head">
        <h2 title={item.path}>{fileName(item.path)}</h2>
        <button type="button" className="cera-icon-button" aria-label="Close details" title="Close" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="cera-media-details__preview">
        {item.kind === 'video' ? <video src={url} controls muted playsInline preload="metadata" /> : <img src={url} alt={item.alt ?? ''} />}
      </div>
      <dl className="cera-media-details__facts">
        <dt>Type</dt>
        <dd>{item.mimeType ?? item.kind}</dd>
        {item.width && item.height ? (
          <>
            <dt>Size</dt>
            <dd>
              {item.width} × {item.height}
              {item.sizeBytes ? `, ${formatBytes(item.sizeBytes)}` : ''}
            </dd>
          </>
        ) : item.sizeBytes ? (
          <>
            <dt>Size</dt>
            <dd>{formatBytes(item.sizeBytes)}</dd>
          </>
        ) : null}
        {item.createdAt && (
          <>
            <dt>Uploaded</dt>
            <dd>{dateFormat.format(new Date(item.createdAt))}</dd>
          </>
        )}
        <dt>Address</dt>
        <dd>
          <a href={url} target="_blank" rel="noopener noreferrer">
            Open the file
          </a>
        </dd>
      </dl>

      <form onSubmit={save} className="cera-media-details__alt">
        <label>
          Alt text
          <textarea value={alt} rows={3} maxLength={500} readOnly={!canEdit} placeholder={item.kind === 'image' ? 'Describe the image for people who can’t see it' : ''} onChange={(event) => setAlt(event.target.value)} />
        </label>
        <p className="cera-note">Used when this file is added to a page. Pages that already use it keep their own alt text, which you change on the page.</p>
        {canEdit && (
          <button type="submit" className="cera-button cera-button--small" disabled={pending || alt.trim() === (item.alt ?? '')}>
            Save alt text
          </button>
        )}
      </form>

      <h3>Used on</h3>
      {usageError ? (
        <p className="cera-status cera-status--error">Couldn’t check which pages use this file.</p>
      ) : usage === null ? (
        <p className="cera-note">Checking…</p>
      ) : usage.length === 0 ? (
        <p className="cera-note">No pages use this file.</p>
      ) : (
        <ul className="cera-media-details__uses">
          {usage.map((use) => (
            <li key={use.id}>
              <a href={pageHref(use)}>{use.title || 'Untitled'}</a> <span className="cera-note">{use.slug === 'home' ? '/' : `/${use.slug}`}</span>{' '}
              {use.live && <span className="cera-badge cera-badge--live">{use.draft ? 'Live' : 'Live only'}</span>}{' '}
              {use.draft && !use.live && <span className="cera-badge">Draft</span>}
            </li>
          ))}
        </ul>
      )}

      {status && (
        <p className={`cera-status cera-status--${status.kind}`} role={status.kind === 'error' ? 'alert' : 'status'}>
          {status.text}
        </p>
      )}

      {canEdit && onReplace && (
        <div className="cera-media-details__replace">
          <input
            ref={replaceInput}
            type="file"
            className="cera-visually-hidden"
            accept={mediaAccept([item.kind === 'video' ? 'video' : 'image'])}
            disabled={pending}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) replace(file);
            }}
          />
          <button type="button" className="cera-button cera-button--small" disabled={pending} onClick={() => replaceInput.current?.click()}>
            Replace file…
          </button>
          <p className="cera-note">Upload a new {item.kind === 'video' ? 'video' : 'image'} in its place. Every page that uses this file shows the new one at once, live pages included. Each page keeps its own alt text.</p>
        </div>
      )}

      {canEdit && (
        <div className="cera-media-details__delete">
          <button type="button" className="cera-button cera-button--small cera-danger" disabled={pending || usage === null || inUse} onClick={remove}>
            Delete file
          </button>
          {inUse && <p className="cera-note">To delete it, remove it from {usage!.length === 1 ? 'that page' : 'those pages'} and publish the change.</p>}
        </div>
      )}
    </section>
  );
}
