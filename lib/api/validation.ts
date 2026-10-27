import type { Tone } from "../draft";
import { MESSAGES } from "./messages";

export const LIMITS = { requesterName: 100, description: 2000, draftReply: 5000, draftSourceLabel: 300 } as const;

export const TONES = ["FORMAL", "FRIENDLY", "SHORT"] as const satisfies readonly Tone[];
export const STATUSES = ["NEW", "IN_PROGRESS", "RESOLVED"] as const;
export type RequestStatus = (typeof STATUSES)[number];

export type DraftFields = {
  requesterName: string;
  category: string;
  description: string;
  tone: Tone;
};

export type RequestFields = DraftFields & {
  // undefined = not sent (keep the stored value on update, default on create).
  status: RequestStatus | undefined;
  draftReply: string | undefined;
  // undefined = not sent (keep the stored value on update), null = clear.
  draftSourceLabel: string | null | undefined;
  draftBasisHash: string | null | undefined;
};

export type Validation<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const HASH_PATTERN = /^[0-9a-f]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(
  value: unknown,
  max: number,
  messages: { required: string; tooLong: string },
  errors: string[],
): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text === "") errors.push(messages.required);
  else if (text.length > max) errors.push(messages.tooLong);
  return text;
}

/** Validates the fields shared by POST /api/draft and request create/update. */
export function validateDraftFields(body: unknown, categories: readonly string[]): Validation<DraftFields> {
  if (!isRecord(body)) return { ok: false, errors: [MESSAGES.invalidBody] };
  const errors: string[] = [];

  const requesterName = requiredText(
    body.requesterName,
    LIMITS.requesterName,
    { required: MESSAGES.nameRequired, tooLong: MESSAGES.nameTooLong },
    errors,
  );

  const category = typeof body.category === "string" ? body.category.trim() : "";
  if (category === "") errors.push(MESSAGES.categoryRequired);
  else if (!categories.includes(category)) errors.push(MESSAGES.categoryUnknown);

  const description = requiredText(
    body.description,
    LIMITS.description,
    { required: MESSAGES.descriptionRequired, tooLong: MESSAGES.descriptionTooLong },
    errors,
  );

  const tone = body.tone;
  if (!TONES.includes(tone as Tone)) errors.push(MESSAGES.toneInvalid);

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { requesterName, category, description, tone: tone as Tone } };
}

export function validateRequestFields(body: unknown, categories: readonly string[]): Validation<RequestFields> {
  const base = validateDraftFields(body, categories);
  if (!isRecord(body)) return base as Validation<RequestFields>;
  const errors = base.ok ? [] : [...base.errors];

  let status: RequestStatus | undefined;
  if (body.status !== undefined) {
    if (STATUSES.includes(body.status as RequestStatus)) status = body.status as RequestStatus;
    else errors.push(MESSAGES.statusInvalid);
  }

  let draftReply: string | undefined;
  if (body.draftReply === null) {
    draftReply = "";
  } else if (body.draftReply !== undefined) {
    if (typeof body.draftReply !== "string") errors.push(MESSAGES.draftInvalid);
    else if (body.draftReply.length > LIMITS.draftReply) errors.push(MESSAGES.draftTooLong);
    else draftReply = body.draftReply;
  }

  let draftSourceLabel: string | null | undefined;
  if (body.draftSourceLabel === null || body.draftSourceLabel === undefined) {
    draftSourceLabel = body.draftSourceLabel;
  } else if (
    typeof body.draftSourceLabel === "string" &&
    body.draftSourceLabel.trim() !== "" &&
    body.draftSourceLabel.length <= LIMITS.draftSourceLabel
  ) {
    draftSourceLabel = body.draftSourceLabel.trim();
  } else {
    errors.push(MESSAGES.draftMetaInvalid);
  }

  let draftBasisHash: string | null | undefined;
  if (body.draftBasisHash === null || body.draftBasisHash === undefined) {
    draftBasisHash = body.draftBasisHash;
  } else if (typeof body.draftBasisHash === "string" && HASH_PATTERN.test(body.draftBasisHash)) {
    draftBasisHash = body.draftBasisHash;
  } else if (!errors.includes(MESSAGES.draftMetaInvalid)) {
    errors.push(MESSAGES.draftMetaInvalid);
  }

  if (errors.length > 0 || !base.ok) return { ok: false, errors };
  return { ok: true, value: { ...base.value, status, draftReply, draftSourceLabel, draftBasisHash } };
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidId(id: string): boolean {
  return ID_PATTERN.test(id);
}
