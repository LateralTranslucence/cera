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

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');
const fileName = (path: string) => path.split('/').pop() ?? path;

/** A media reference typed by hand uses its path as its id. */
const isManual = (m: Record<string, unknown>) => !m.id || m.id === m.path;

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
  const m = isObject(value) && asString(value.path) ? value : undefined;
  const uploadable = accept.filter((k): k is 'image' | 'video' => k !== 'embed');
  const canUpload = Boolean(media) && uploadable.length > 0;
  const [mode, setMode] = useState<Mode>(m && isManual(m) ? 'manual' : 'idle');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const id = useId();

  const set = (key: string, v: unknown) => {
    const next: Record<string, unknown> = { kind: 'image', ...(m ?? {}), [key]: v };
    if (v === undefined || v === '') delete next[key];
    if (!asString(next.path)) return onChange(undefined);
    // A typed path no longer points at a library row, so it becomes its own id.
    onChange(key === 'path' || isManual(m ?? {}) ? { ...next, id: next.path } : next);
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
        onChange(m && asString(m.alt) && !ref.alt ? { ...ref, alt: m.alt } : ref);
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

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && canUpload && !readOnly && !busy) void upload(file);
  };

  return (
    <div
      className={`cera-group cera-media${dragging ? ' cera-media--drop' : ''}`}
      aria-labelledby={labelledBy}
      onDragOver={(e) => {
        if (!canUpload || readOnly) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {m && <MediaPreview media={m as unknown as MediaRef} />}

      {m && (
        <label className="cera-inline">
          Alt text
          <input
            type="text"
            value={asString(m.alt)}
            readOnly={readOnly}
            placeholder={m.kind === 'image' ? 'Describe the image for people who can’t see it' : ''}
            onChange={(e) => set('alt', e.target.value)}
          />
        </label>
      )}

      {mode === 'manual' && (
        <>
          <label className="cera-inline">
            Path or URL
            <input type="text" value={asString(m?.path)} placeholder="https://vimeo.com/… or a path in cera-media" readOnly={readOnly} onChange={(e) => set('path', e.target.value.trim())} />
          </label>
          {m && (
            <label className="cera-inline">
              Kind
              <select value={asString(m.kind) || 'image'} disabled={readOnly} onChange={(e) => set('kind', e.target.value)}>
                {accept.map((k) => (
                  <option key={k} value={k}>
                    {k === 'image' ? 'Image' : k === 'video' ? 'Video' : 'Embed'}
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
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file);
                }}
              />
              <button type="button" className="cera-button cera-button--small" disabled={Boolean(busy)} onClick={() => fileInput.current?.click()}>
                {m ? 'Upload a new file' : 'Upload a file'}
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
          {m && (
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
      {canUpload && !readOnly && !m && !busy && <p className="cera-note">Or drop a file here.</p>}

      {mode === 'library' && media && (
        <MediaLibrary
          find={media.find}
          kinds={uploadable}
          selectedId={asString(m?.id)}
          onPick={(item) => {
            const ref = toMediaRef(item);
            onChange(m && asString(m.alt) && !ref.alt ? { ...ref, alt: m.alt } : ref);
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

function MediaLibrary({
  find,
  kinds,
  selectedId,
  onPick,
}: {
  find: MediaContext['find'];
  kinds: MediaKind[];
  selectedId: string;
  onPick: (item: MediaItem) => void;
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
  }, [find, search, kindsKey]);

  return (
    <div className="cera-media__library">
      <input type="search" value={search} placeholder="Search by file name or alt text" aria-label="Search the media library" onChange={(e) => setSearch(e.target.value)} />
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
              <button type="button" aria-pressed={item.id === selectedId} title={item.alt || item.path} onClick={() => onPick(item)}>
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
