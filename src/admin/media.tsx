'use client';
/**
 * The media field: upload a file, pick one from the library, or type a path
 * or URL (for embeds and files hosted elsewhere).
 *
 * Uploads go straight from the browser to Storage with a signed URL; see
 * `finishMediaUpload` in ./supabase for the steps. Sites give the editor a
 * `MediaContext` built from their server actions:
 *
 *   media={{ upload: mediaUploader({ prepare: prepareMediaUploadAction, finish: finishMediaUploadAction }), find: findMediaAction }}
 */
import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import type { MediaRef } from '../fields.ts';
import {
  mediaAccept,
  toMediaRef,
  type MediaItem,
  type MediaKind,
  type MediaQuery,
  type MediaUploadDone,
  type MediaUploadPrepared,
  type MediaUploadRequest,
  type MediaUploadResult,
} from '../media.ts';
import { mediaUrl } from '../media-url.ts';

export interface MediaContext {
  /** Uploads a file and records it in the library. */
  upload: (file: File) => Promise<MediaUploadResult>;
  /** Searches the library. */
  find: (query: MediaQuery) => Promise<MediaItem[]>;
}

/**
 * Builds `MediaContext.upload` from two server actions: one wrapping
 * `prepareMediaUpload`, one wrapping `finishMediaUpload`. Both must check
 * the user's role.
 */
export function mediaUploader(actions: {
  prepare: (request: MediaUploadRequest) => Promise<MediaUploadPrepared>;
  finish: (done: MediaUploadDone) => Promise<MediaUploadResult>;
}): MediaContext['upload'] {
  return async (file) => {
    const [size, ticket] = await Promise.all([measure(file), actions.prepare({ name: file.name, type: file.type, size: file.size })]);
    if (!ticket.ok) return ticket;
    const res = await fetch(ticket.signedUrl, {
      method: 'PUT',
      headers: { 'content-type': file.type, 'cache-control': 'max-age=31536000', 'x-upsert': 'false' },
      body: file,
    }).catch(() => null);
    if (!res?.ok) return { ok: false, message: await uploadError(res) };
    return actions.finish({ path: ticket.path, ...size });
  };
}

async function uploadError(res: Response | null): Promise<string> {
  if (!res) return 'The upload didn’t reach the server. Check your connection and try again.';
  const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
  const detail = body?.message ?? body?.error;
  return detail ? `Storage refused the file: ${detail}` : `The upload failed (HTTP ${res.status}).`;
}

/** Image or video dimensions, measured in the browser. Missing when they can't be read. */
async function measure(file: File): Promise<{ width?: number; height?: number }> {
  try {
    if (file.type.startsWith('image/')) {
      const bitmap = await createImageBitmap(file);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    }
    if (file.type.startsWith('video/')) {
      const url = URL.createObjectURL(file);
      try {
        return await new Promise((resolve) => {
          const video = document.createElement('video');
          const done = (size: { width?: number; height?: number }) => {
            clearTimeout(timer);
            resolve(size);
          };
          const timer = setTimeout(() => done({}), 5000);
          video.preload = 'metadata';
          video.onloadedmetadata = () => done({ width: video.videoWidth || undefined, height: video.videoHeight || undefined });
          video.onerror = () => done({});
          video.src = url;
        });
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  } catch {
    // Unreadable (e.g. AVIF in an older browser): upload without dimensions.
  }
  return {};
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const asString = (value: unknown): string => (typeof value === 'string' ? value : '');
const fileName = (path: string) => path.split('/').pop() ?? path;

/** A media reference typed by hand uses its path as its id. */
const isManual = (reference: Record<string, unknown>) => !reference.id || reference.id === reference.path;

type Mode = 'idle' | 'library' | 'manual';

export function MediaInput({
  value,
  onChange,
  readOnly,
  accept = ['image', 'video', 'embed'],
  media,
  labelledBy,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  readOnly: boolean;
  accept?: readonly MediaKind[];
  media?: MediaContext;
  labelledBy?: string;
}) {
  const mediaValue = isObject(value) && asString(value.path) ? value : undefined;
  const uploadable = accept.filter((kind): kind is 'image' | 'video' => kind !== 'embed');
  const canUpload = Boolean(media) && uploadable.length > 0;
  const [mode, setMode] = useState<Mode>(mediaValue && isManual(mediaValue) ? 'manual' : 'idle');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const id = useId();

  const set = (key: string, newValue: unknown) => {
    const next: Record<string, unknown> = { kind: 'image', ...(mediaValue ?? {}), [key]: newValue };
    if (newValue === undefined || newValue === '') delete next[key];
    if (!asString(next.path)) return onChange(undefined);
    // A typed path no longer points at a library row, so it becomes its own id.
    onChange(key === 'path' || isManual(mediaValue ?? {}) ? { ...next, id: next.path } : next);
  };

  async function upload(file: File) {
    if (!media) return;
    setError(null);
    setBusy(`Uploading ${file.name}…`);
    try {
      const result = await media.upload(file);
      if (result.ok) {
        // Keep alt text the editor already wrote for this spot.
        const ref = toMediaRef(result.item);
        onChange(mediaValue && asString(mediaValue.alt) && !ref.alt ? { ...ref, alt: mediaValue.alt } : ref);
        setMode('idle');
      } else {
        setError(result.message);
      }
    } catch {
      setError('The upload failed. Try again.');
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && canUpload && !readOnly && !busy) void upload(file);
  };

  return (
    <div
      className={`cera-group cera-media${dragging ? ' cera-media--drop' : ''}`}
      aria-labelledby={labelledBy}
      onDragOver={(event) => {
        if (!canUpload || readOnly) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {mediaValue && <MediaPreview media={mediaValue as unknown as MediaRef} />}

      {mediaValue && (
        <label className="cera-inline">
          Alt text
          <input
            type="text"
            value={asString(mediaValue.alt)}
            readOnly={readOnly}
            placeholder={mediaValue.kind === 'image' ? 'Describe the image for people who can’t see it' : ''}
            onChange={(event) => set('alt', event.target.value)}
          />
        </label>
      )}

      {mode === 'manual' && (
        <>
          <label className="cera-inline">
            Path or URL
            <input type="text" value={asString(mediaValue?.path)} placeholder="https://vimeo.com/… or a path in cera-media" readOnly={readOnly} onChange={(event) => set('path', event.target.value.trim())} />
          </label>
          {mediaValue && (
            <label className="cera-inline">
              Kind
              <select value={asString(mediaValue.kind) || 'image'} disabled={readOnly} onChange={(event) => set('kind', event.target.value)}>
                {accept.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind === 'image' ? 'Image' : kind === 'video' ? 'Video' : 'Embed'}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      )}

      {!readOnly && (
        <div className="cera-media__actions">
          {canUpload && (
            <>
              <input
                ref={fileInput}
                id={`${id}-file`}
                type="file"
                className="cera-visually-hidden"
                accept={mediaAccept(uploadable)}
                disabled={Boolean(busy)}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                }}
              />
              <button type="button" className="cera-button cera-button--small" disabled={Boolean(busy)} onClick={() => fileInput.current?.click()}>
                {mediaValue ? 'Upload a new file' : 'Upload a file'}
              </button>
              <button
                type="button"
                className="cera-button cera-button--small"
                aria-expanded={mode === 'library'}
                disabled={Boolean(busy)}
                onClick={() => setMode(mode === 'library' ? 'idle' : 'library')}
              >
                {mode === 'library' ? 'Close library' : 'Choose from library'}
              </button>
            </>
          )}
          {mode !== 'manual' && (
            <button type="button" className="cera-link-button" onClick={() => setMode('manual')}>
              Use a path or URL
            </button>
          )}
          {mediaValue && (
            <button type="button" className="cera-link-button cera-danger" onClick={() => onChange(undefined)}>
              Remove
            </button>
          )}
        </div>
      )}

      {busy && (
        <p className="cera-note" role="status">
          {busy}
        </p>
      )}
      {error && (
        <p className="cera-status cera-status--error" role="alert">
          {error}
        </p>
      )}
      {canUpload && !readOnly && !mediaValue && !busy && <p className="cera-note">Or drop a file here.</p>}

      {mode === 'library' && media && (
        <MediaLibrary
          find={media.find}
          kinds={uploadable}
          isSelected={(id) => id === asString(mediaValue?.id)}
          onPick={(item) => {
            const ref = toMediaRef(item);
            onChange(mediaValue && asString(mediaValue.alt) && !ref.alt ? { ...ref, alt: mediaValue.alt } : ref);
            setMode('idle');
          }}
        />
      )}
    </div>
  );
}

function MediaPreview({ media }: { media: MediaRef }) {
  const url = mediaUrl(media);
  return (
    <div className="cera-media__preview">
      {media.kind === 'image' ? (
        <img src={url} alt="" loading="lazy" />
      ) : media.kind === 'video' ? (
        <video src={url} muted playsInline preload="metadata" />
      ) : (
        <span className="cera-media__embed">Embed</span>
      )}
      <span className="cera-media__meta">
        <span className="cera-media__name" title={media.path}>
          {fileName(media.path)}
        </span>
        {media.width && media.height ? (
          <span>
            {media.width} × {media.height}
          </span>
        ) : null}
        {media.kind === 'embed' && (
          <a href={media.path} target="_blank" rel="noopener noreferrer">
            Open
          </a>
        )}
      </span>
    </div>
  );
}

/** A searchable grid of library items. Changing `version` reloads it (after an upload, edit or delete). */
export function MediaLibrary({
  find,
  kinds,
  isSelected,
  onPick,
  version = 0,
}: {
  find: MediaContext['find'];
  kinds: MediaKind[];
  isSelected: (id: string) => boolean;
  onPick: (item: MediaItem) => void;
  version?: number;
}) {
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [error, setError] = useState(false);
  const kindsKey = kinds.join(',');

  useEffect(() => {
    let current = true;
    const timer = setTimeout(
      () => {
        find({ search, kinds: kindsKey.split(',') as MediaKind[], limit: 60 })
          .then((found) => current && (setItems(found), setError(false)))
          .catch(() => current && setError(true));
      },
      search ? 250 : 0,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [find, search, kindsKey, version]);

  return (
    <div className="cera-media__library">
      <input type="search" value={search} placeholder="Search by file name or alt text" aria-label="Search the media library" onChange={(event) => setSearch(event.target.value)} />
      {error ? (
        <p className="cera-status cera-status--error">The library couldn’t be loaded.</p>
      ) : items === null ? (
        <p className="cera-note">Loading…</p>
      ) : items.length === 0 ? (
        <p className="cera-note">{search ? 'Nothing matches.' : 'The library is empty. Upload a file to start it.'}</p>
      ) : (
        <ul className="cera-media__grid">
          {items.map((item) => (
            <li key={item.id}>
              <button type="button" aria-pressed={isSelected(item.id)} title={item.alt || item.path} onClick={() => onPick(item)}>
                {item.kind === 'video' ? <video src={mediaUrl(item)} muted preload="metadata" /> : <img src={mediaUrl(item)} alt="" loading="lazy" />}
                <span>{item.alt || fileName(item.path)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The gallery field: an ordered list of images. Add by uploading (several at
 * once, or dropped), or from the library, which stays open so several can be
 * picked; reorder, remove, and set each image's alt text.
 */
export function GalleryInput({
  value,
  onChange,
  readOnly,
  media,
  limit,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  readOnly: boolean;
  media?: MediaContext;
  limit?: number;
}) {
  const items = (Array.isArray(value) ? value : []).filter(isObject) as Array<Record<string, unknown>>;
  const [library, setLibrary] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // Uploads finish one at a time; build on the latest list, not the one this render saw.
  const latest = useRef(items);
  latest.current = items;
  const full = limit !== undefined && items.length >= limit;

  const set = (next: Array<Record<string, unknown>>) => {
    latest.current = next;
    onChange(next);
  };
  const move = (index: number, by: number) => {
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item!);
    set(next);
  };

  async function uploadAll(files: File[]) {
    if (!media) return;
    setError(null);
    const room = limit === undefined ? files.length : Math.max(limit - latest.current.length, 0);
    const queue = files.slice(0, room);
    const failures: string[] = [];
    for (const [index, file] of queue.entries()) {
      setBusy(`Uploading ${index + 1} of ${queue.length}: ${file.name}…`);
      try {
        const result = await media.upload(file);
        if (result.ok) set([...latest.current, toMediaRef(result.item) as unknown as Record<string, unknown>]);
        else failures.push(`${file.name}: ${result.message}`);
      } catch {
        failures.push(`${file.name}: the upload failed.`);
      }
    }
    if (files.length > queue.length) failures.push(`The gallery holds ${limit}; ${files.length - queue.length} file(s) weren’t added.`);
    setBusy(null);
    if (failures.length) setError(failures.join(' '));
    if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <div
      className={`cera-group cera-media cera-gallery${dragging ? ' cera-media--drop' : ''}`}
      onDragOver={(event) => {
        if (!media || readOnly || full) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const files = [...event.dataTransfer.files].filter((file) => file.type.startsWith('image/'));
        if (files.length && media && !readOnly && !busy && !full) void uploadAll(files);
      }}
    >
      {items.length === 0 ? (
        <p className="cera-note">No images yet.</p>
      ) : (
        <ol className="cera-gallery__items">
          {items.map((item, i) => (
            <li key={`${asString(item.id)}-${i}`} className="cera-gallery__item">
              <img src={mediaUrl(item as unknown as MediaRef)} alt="" loading="lazy" />
              <label className="cera-inline">
                Alt text
                <input
                  type="text"
                  value={asString(item.alt)}
                  readOnly={readOnly}
                  placeholder="Describe the image"
                  onChange={(event) => {
                    const next = [...items];
                    next[i] = { ...item, alt: event.target.value };
                    if (!event.target.value) delete next[i]!.alt;
                    set(next);
                  }}
                />
              </label>
              {!readOnly && (
                <span className="cera-item-buttons">
                  <button type="button" className="cera-icon-button" aria-label="Move earlier" title="Move earlier" disabled={i === 0} onClick={() => move(i, -1)}>
                    ↑
                  </button>
                  <button type="button" className="cera-icon-button" aria-label="Move later" title="Move later" disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                    ↓
                  </button>
                  <button type="button" className="cera-icon-button cera-danger" aria-label="Remove image" title="Remove" onClick={() => set(items.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {!readOnly && media && (
        <div className="cera-media__actions">
          <input
            ref={fileInput}
            type="file"
            multiple
            className="cera-visually-hidden"
            accept={mediaAccept(['image'])}
            disabled={Boolean(busy) || full}
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              if (files.length) void uploadAll(files);
            }}
          />
          <button type="button" className="cera-button cera-button--small" disabled={Boolean(busy) || full} onClick={() => fileInput.current?.click()}>
            Upload images
          </button>
          <button type="button" className="cera-button cera-button--small" aria-expanded={library} disabled={Boolean(busy)} onClick={() => setLibrary(!library)}>
            {library ? 'Close library' : 'Choose from library'}
          </button>
          {limit !== undefined && (
            <span className="cera-note">
              {items.length} of {limit}
            </span>
          )}
        </div>
      )}
      {!media && !readOnly && <p className="cera-note">This admin has no media library, so images can’t be added here.</p>}
      {busy && (
        <p className="cera-note" role="status">
          {busy}
        </p>
      )}
      {error && (
        <p className="cera-status cera-status--error" role="alert">
          {error}
        </p>
      )}
      {library && media && (
        <MediaLibrary
          find={media.find}
          kinds={['image']}
          isSelected={(id) => items.some((it) => it.id === id)}
          onPick={(item) => {
            if (full) return;
            // Picking adds to the end; the library stays open for more.
            set([...items, toMediaRef(item) as unknown as Record<string, unknown>]);
          }}
        />
      )}
    </div>
  );
}
