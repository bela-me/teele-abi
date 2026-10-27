import type { Tone } from "../draft";
import { MESSAGES } from "../api/messages";
import { LIMITS, type RequestStatus } from "../api/validation";

// Pure editor-state logic for the request form. No React, no fetch.

export const TONE_LABELS: Record<Tone, string> = { FORMAL: "Ametlik", FRIENDLY: "Sõbralik", SHORT: "Lühike" };
export const STATUS_LABELS: Record<RequestStatus, string> = { NEW: "Uus", IN_PROGRESS: "Töös", RESOLVED: "Lahendatud" };

export type FormValues = {
  requesterName: string;
  category: string;
  description: string;
  tone: Tone;
  status: RequestStatus;
  draftReply: string;
};

export type DraftMeta = { draftSourceLabel: string | null; draftBasisHash: string | null };

export type SavedRequest = FormValues &
  DraftMeta & { id: string; draftNeedsReview: boolean; createdAt: string; updatedAt: string };

export type GeneratedDraft = {
  draft: string;
  draftSourceLabel: string;
  draftBasisHash: string;
  notice: string | null;
};

export type EditorState = {
  // Increases whenever another request (or a new form) is opened; async
  // results that started in an older session are ignored.
  session: number;
  requestId: string | null;
  values: FormValues;
  meta: DraftMeta;
  // Last saved (or initial empty) values; differences mean unsaved changes.
  baseline: { values: FormValues; meta: DraftMeta };
  createdAt: string | null;
  updatedAt: string | null;
};

export const EMPTY_VALUES: FormValues = {
  requesterName: "",
  category: "",
  description: "",
  tone: "FORMAL",
  status: "NEW",
  draftReply: "",
};

const EMPTY_META: DraftMeta = { draftSourceLabel: null, draftBasisHash: null };

export function newEditor(session: number): EditorState {
  return {
    session,
    requestId: null,
    values: EMPTY_VALUES,
    meta: EMPTY_META,
    baseline: { values: EMPTY_VALUES, meta: EMPTY_META },
    createdAt: null,
    updatedAt: null,
  };
}

function splitRecord(record: SavedRequest): { values: FormValues; meta: DraftMeta } {
  return {
    values: {
      requesterName: record.requesterName,
      category: record.category,
      description: record.description,
      tone: record.tone,
      status: record.status,
      draftReply: record.draftReply,
    },
    meta: { draftSourceLabel: record.draftSourceLabel, draftBasisHash: record.draftBasisHash },
  };
}

export function editorFromRecord(record: SavedRequest, session: number): EditorState {
  const { values, meta } = splitRecord(record);
  return {
    session,
    requestId: record.id,
    values,
    meta,
    baseline: { values, meta },
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

const VALUE_KEYS = Object.keys(EMPTY_VALUES) as (keyof FormValues)[];

function sameValues(a: FormValues, b: FormValues): boolean {
  return VALUE_KEYS.every((key) => a[key] === b[key]);
}

function sameMeta(a: DraftMeta, b: DraftMeta): boolean {
  return a.draftSourceLabel === b.draftSourceLabel && a.draftBasisHash === b.draftBasisHash;
}

/** True when the form differs from what was last saved (or from the empty form). */
export function isDirty(state: EditorState): boolean {
  return !sameValues(state.values, state.baseline.values) || !sameMeta(state.meta, state.baseline.meta);
}

export function setField<K extends keyof FormValues>(state: EditorState, key: K, value: FormValues[K]): EditorState {
  const values = { ...state.values, [key]: value };
  // A draft emptied by hand loses its template metadata; text typed afterwards is manual.
  const meta = key === "draftReply" && String(value).trim() === "" ? EMPTY_META : state.meta;
  return { ...state, values, meta };
}

/** Generating over any non-empty draft must be confirmed first. */
export function requiresOverwriteConfirm(draftReply: string): boolean {
  return draftReply.trim() !== "";
}

/**
 * Applies a generated draft unless the draft text was edited while the
 * request was in flight; newer edits are never overwritten.
 */
export function applyGeneratedDraft(
  state: EditorState,
  draftAtStart: string,
  result: GeneratedDraft,
): { state: EditorState; applied: boolean } {
  if (state.values.draftReply !== draftAtStart) return { state, applied: false };
  return {
    applied: true,
    state: {
      ...state,
      values: { ...state.values, draftReply: result.draft },
      meta: { draftSourceLabel: result.draftSourceLabel, draftBasisHash: result.draftBasisHash },
    },
  };
}

/**
 * Merges a save response into the editor. If nothing changed while saving,
 * the form shows the server's (trimmed) values; otherwise the newer edits
 * stay and remain marked as unsaved.
 */
export function applySavedRecord(
  state: EditorState,
  sent: { values: FormValues; meta: DraftMeta },
  record: SavedRequest,
): EditorState {
  const saved = splitRecord(record);
  const unchanged = sameValues(state.values, sent.values) && sameMeta(state.meta, sent.meta);
  return {
    ...state,
    requestId: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    baseline: saved,
    values: unchanged ? saved.values : state.values,
    meta: unchanged ? saved.meta : state.meta,
  };
}

export function requestBody(state: EditorState) {
  return { ...state.values, ...state.meta };
}

export function draftRequestBody(values: FormValues) {
  return {
    requesterName: values.requesterName,
    category: values.category,
    description: values.description,
    tone: values.tone,
  };
}

export type FieldErrors = Partial<Record<keyof FormValues, string>>;

/**
 * Client-side mirror of the server validation (lib/api/validation.ts).
 * categories = null skips the membership check (list not loaded); the server
 * still enforces it.
 */
export function validateForm(values: FormValues, categories: readonly string[] | null, forDraft = false): FieldErrors {
  const errors: FieldErrors = {};
  const name = values.requesterName.trim();
  if (name === "") errors.requesterName = MESSAGES.nameRequired;
  else if (name.length > LIMITS.requesterName) errors.requesterName = MESSAGES.nameTooLong;

  const category = values.category.trim();
  if (category === "") errors.category = MESSAGES.categoryRequired;
  else if (categories && !categories.includes(category)) errors.category = MESSAGES.categoryUnknown;

  const description = values.description.trim();
  if (description === "") errors.description = MESSAGES.descriptionRequired;
  else if (description.length > LIMITS.description) errors.description = MESSAGES.descriptionTooLong;

  if (!forDraft && values.draftReply.length > LIMITS.draftReply) errors.draftReply = MESSAGES.draftTooLong;
  return errors;
}
