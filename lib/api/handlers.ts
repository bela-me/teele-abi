import { buildDraft } from "../draft";
import { draftBasisHash, draftNeedsReview } from "./draft-basis";
import { MESSAGES } from "./messages";
import {
  RepositoryFailedError,
  RepositoryUnavailableError,
  type Repository,
  type SupportRequestData,
  type SupportRequestRecord,
} from "./repository";
import { isValidId, validateDraftFields, validateRequestFields, type RequestFields } from "./validation";

export type ApiResult = { status: number; body: unknown };

function invalid(errors: string[]): ApiResult {
  return { status: 400, body: { error: errors[0], errors } };
}

const notFound: ApiResult = { status: 404, body: { error: MESSAGES.notFound } };

/**
 * Maps a data-layer failure to an Estonian error response. Only the operation
 * name and an error code are logged — never messages, connection strings or
 * request content.
 */
function failure(operation: string, error: unknown, message: string): ApiResult {
  const code =
    error instanceof RepositoryUnavailableError || error instanceof RepositoryFailedError
      ? error.code
      : "unexpected";
  console.error(`[api] ${operation} failed (${code})`);
  if (error instanceof RepositoryUnavailableError) {
    return { status: 503, body: { error: MESSAGES.dbUnavailable } };
  }
  return { status: 500, body: { error: message } };
}

function toSummary(record: SupportRequestRecord) {
  return {
    id: record.id,
    requesterName: record.requesterName,
    category: record.category,
    status: record.status,
    draftNeedsReview: record.draftNeedsReview,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Combines validated input with the stored request (on update). Omitted
 * optional fields keep their stored values; an empty draft clears its
 * metadata. draftNeedsReview is always recomputed on the server.
 */
function toData(fields: RequestFields, existing: SupportRequestRecord | null): SupportRequestData {
  const draftReply = fields.draftReply ?? existing?.draftReply ?? "";
  const hasDraft = draftReply.trim() !== "";
  const draftSourceLabel = hasDraft
    ? (fields.draftSourceLabel !== undefined ? fields.draftSourceLabel : existing?.draftSourceLabel ?? null)
    : null;
  const basisHash = hasDraft
    ? (fields.draftBasisHash !== undefined ? fields.draftBasisHash : existing?.draftBasisHash ?? null)
    : null;

  return {
    requesterName: fields.requesterName,
    category: fields.category,
    description: fields.description,
    tone: fields.tone,
    status: fields.status ?? existing?.status ?? "NEW",
    draftReply,
    draftSourceLabel,
    draftBasisHash: basisHash,
    draftNeedsReview: draftNeedsReview(draftReply, basisHash, fields),
  };
}

export async function listRequests(repo: Repository): Promise<ApiResult> {
  try {
    const requests = await repo.listRequests();
    return { status: 200, body: { requests: requests.map(toSummary) } };
  } catch (error) {
    return failure("listRequests", error, MESSAGES.loadFailed);
  }
}

export async function getRequest(repo: Repository, id: string): Promise<ApiResult> {
  if (!isValidId(id)) return notFound;
  try {
    const request = await repo.getRequest(id);
    return request ? { status: 200, body: { request } } : notFound;
  } catch (error) {
    return failure("getRequest", error, MESSAGES.loadFailed);
  }
}

export async function createRequest(repo: Repository, body: unknown): Promise<ApiResult> {
  try {
    const validation = validateRequestFields(body, await repo.listCategories());
    if (!validation.ok) return invalid(validation.errors);
    const request = await repo.createRequest(toData(validation.value, null));
    return { status: 201, body: { request } };
  } catch (error) {
    return failure("createRequest", error, MESSAGES.saveFailed);
  }
}

export async function updateRequest(repo: Repository, id: string, body: unknown): Promise<ApiResult> {
  if (!isValidId(id)) return notFound;
  try {
    const existing = await repo.getRequest(id);
    if (!existing) return notFound;
    const validation = validateRequestFields(body, await repo.listCategories());
    if (!validation.ok) return invalid(validation.errors);
    const request = await repo.updateRequest(id, toData(validation.value, existing));
    return request ? { status: 200, body: { request } } : notFound;
  } catch (error) {
    return failure("updateRequest", error, MESSAGES.saveFailed);
  }
}

export async function deleteRequest(repo: Repository, id: string): Promise<ApiResult> {
  if (!isValidId(id)) return notFound;
  try {
    return (await repo.deleteRequest(id)) ? { status: 200, body: { deleted: true } } : notFound;
  } catch (error) {
    return failure("deleteRequest", error, MESSAGES.deleteFailed);
  }
}

/** Builds a draft from the stored templates. Reads only; never saves or changes status. */
export async function generateDraft(repo: Repository, body: unknown): Promise<ApiResult> {
  try {
    const validation = validateDraftFields(body, await repo.listCategories());
    if (!validation.ok) return invalid(validation.errors);
    const fields = validation.value;
    const result = buildDraft(fields, await repo.listTemplates(fields.category));
    const notice =
      result.match === "no-match"
        ? MESSAGES.noMatchNotice
        : result.match === "no-templates"
          ? MESSAGES.noTemplatesNotice
          : null;
    return {
      status: 200,
      body: {
        draft: result.draft,
        draftSourceLabel: result.draftSourceLabel,
        draftBasisHash: draftBasisHash(fields),
        match: result.match,
        notice,
      },
    };
  } catch (error) {
    return failure("generateDraft", error, MESSAGES.draftFailed);
  }
}

export async function listCategories(repo: Repository): Promise<ApiResult> {
  try {
    const categories = [...new Set(await repo.listCategories())].sort((a, b) => a.localeCompare(b, "et"));
    return { status: 200, body: { categories } };
  } catch (error) {
    return failure("listCategories", error, MESSAGES.categoriesFailed);
  }
}
