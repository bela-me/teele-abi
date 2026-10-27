"use client";

import { useEffect, useId, useRef } from "react";

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
};

/**
 * Modal confirmation built on the native <dialog>: focus moves into it, Esc
 * cancels, and focus returns to the trigger on close. Cancel is the first
 * (default-focused) button, so Enter never confirms by accident.
 */
export function ConfirmDialog({ options, onClose }: { options: ConfirmOptions | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (options && !dialog.open) dialog.showModal();
    if (!options && dialog.open) dialog.close();
  }, [options]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={messageId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-900/50"
    >
      {options && (
        <>
          <h2 id={titleId} className="text-lg font-semibold">
            {options.title}
          </h2>
          <p id={messageId} className="mt-2 text-sm text-slate-700">
            {options.message}
          </p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              {options.cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                options.onConfirm();
              }}
              className={options.destructive ? "btn btn-danger" : "btn btn-primary"}
            >
              {options.confirmLabel}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
