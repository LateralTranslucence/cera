'use client';
/**
 * A modal dialog on the native <dialog> element: focus moves into it and
 * stays there, Escape closes it, and the page behind is inert.
 */
import { useEffect, useRef, type ReactNode } from 'react';

export function Dialog({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`cera-dialog${wide ? ' cera-dialog--wide' : ''}`}
      aria-labelledby="cera-dialog-title"
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop (the dialog element itself, outside its body) closes it.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open && (
        <div className="cera-dialog__body">
          <h2 id="cera-dialog-title">{title}</h2>
          {children}
        </div>
      )}
    </dialog>
  );
}
