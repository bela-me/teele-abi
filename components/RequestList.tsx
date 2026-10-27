"use client";

import type { RequestStatus } from "@/lib/api/validation";
import { STATUS_LABELS } from "@/lib/ui/editor";
import { formatDateTime } from "@/lib/ui/format";

export type RequestSummary = {
  id: string;
  requesterName: string;
  category: string;
  status: RequestStatus;
  draftNeedsReview: boolean;
  updatedAt: string;
};

export type ListState =
  | { phase: "loading"; items: RequestSummary[] }
  | { phase: "ready"; items: RequestSummary[] }
  | { phase: "error"; items: RequestSummary[]; error: string };

const STATUS_STYLES: Record<RequestStatus, string> = {
  NEW: "bg-blue-50 text-blue-800 ring-blue-200",
  IN_PROGRESS: "bg-amber-50 text-amber-900 ring-amber-200",
  RESOLVED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function RequestList({
  list,
  selectedId,
  onSelect,
  onNew,
  onRetry,
}: {
  list: ListState;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRetry: () => void;
}) {
  return (
    <nav aria-label="Päringud" className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-4">
        <h2 className="text-base font-semibold">Päringud</h2>
        <button type="button" onClick={onNew} className="btn btn-primary">
          Uus päring
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {list.phase === "loading" && list.items.length === 0 && (
          <p className="px-2 py-4 text-sm text-slate-600" role="status">
            Laadin päringuid…
          </p>
        )}

        {list.phase === "error" && (
          <div role="alert" className="m-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <p>{list.error}</p>
            <button type="button" onClick={onRetry} className="btn btn-secondary mt-2">
              Proovi uuesti
            </button>
          </div>
        )}

        {list.phase === "ready" && list.items.length === 0 && (
          <p className="px-2 py-4 text-sm text-slate-600">
            Salvestatud päringuid veel ei ole. Täida vorm ja vajuta „Salvesta”.
          </p>
        )}

        {list.items.length > 0 && (
          <ul className="space-y-1">
            {list.items.map((item) => {
              const selected = item.id === selectedId;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(item.id)}
                    aria-current={selected ? "true" : undefined}
                    className={`block min-h-11 w-full rounded-lg px-3 py-2 text-left transition-colors ${
                      selected ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-slate-100"
                    }`}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0 break-words font-medium">{item.requesterName}</span>
                      <StatusBadge status={item.status} />
                    </span>
                    <span className="mt-0.5 block text-sm text-slate-600">{item.category}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      Muudetud {formatDateTime(item.updatedAt)}
                      {item.draftNeedsReview && " · mustand vajab ülevaatamist"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </nav>
  );
}
