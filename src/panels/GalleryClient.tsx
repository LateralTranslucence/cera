'use client';
/**
 * A grid of images; each opens full size in a modal <dialog> (as in the
 * theme), which brings focus trapping, Escape to close and returning focus
 * to the image for free. Arrow keys move to the previous and next image.
 */
import { useRef, useState, type KeyboardEvent } from 'react';

export interface GalleryImage {
  key: string;
  src: string;
  alt: string;
  width?: number;
  height?: number;
}

export function GalleryClient({ images }: { images: GalleryImage[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const shown = current === null ? null : images[current];

  const open = (i: number) => {
    setCurrent(i);
    dialog.current?.showModal();
  };
  const step = (by: number) => setCurrent((i) => (i === null ? i : (i + by + images.length) % images.length));
  const onKeyDown = (e: KeyboardEvent) => {
    if (images.length < 2) return;
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  };

  return (
    <>
      <ul className="gallery">
        {images.map((img, i) => (
          <li key={img.key}>
            <button type="button" className="gallery__open" onClick={() => open(i)}>
              <img src={img.src} alt="" width={img.width} height={img.height} loading="lazy" />
              <span className="visually-hidden">{img.alt ? `Open: ${img.alt}` : `Open image ${i + 1}`}</span>
            </button>
          </li>
        ))}
      </ul>
      <dialog
        ref={dialog}
        className="gallery__dialog"
        aria-label={shown?.alt || 'Image'}
        onKeyDown={onKeyDown}
        onClose={() => setCurrent(null)}
        onClick={(e) => {
          // A click on the backdrop (the dialog itself, not its contents) closes it.
          if (e.target === dialog.current) dialog.current.close();
        }}
      >
        {shown && (
          <figure className="gallery__full">
            <img src={shown.src} alt={shown.alt} width={shown.width} height={shown.height} />
            {shown.alt && <figcaption>{shown.alt}</figcaption>}
          </figure>
        )}
        <div className="gallery__controls">
          {images.length > 1 && (
            <>
              <button type="button" onClick={() => step(-1)}>
                Previous
              </button>
              <span>
                {(current ?? 0) + 1} of {images.length}
              </span>
              <button type="button" onClick={() => step(1)}>
                Next
              </button>
            </>
          )}
          <button type="button" onClick={() => dialog.current?.close()} autoFocus>
            Close
          </button>
        </div>
      </dialog>
    </>
  );
}
