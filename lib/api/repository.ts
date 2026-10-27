import type { DraftTemplate, Tone } from "../draft";
import type { RequestStatus } from "./validation";

export type SupportRequestRecord = {
  id: string;
  requesterName: string;
  category: string;
  description: string;
  tone: Tone;
  status: RequestStatus;
  draftReply: string;
  draftSourceLabel: string | null;
  draftBasisHash: string | null;
  draftNeedsReview: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type SupportRequestData = Omit<SupportRequestRecord, "id" | "createdAt" | "updatedAt">;

/** Data access used by the API handlers; the app uses the Prisma implementation only. */
export interface Repository {
  listRequests(): Promise<SupportRequestRecord[]>; // newest updatedAt first
  getRequest(id: string): Promise<SupportRequestRecord | null>;
  createRequest(data: SupportRequestData): Promise<SupportRequestRecord>;
  updateRequest(id: string, data: SupportRequestData): Promise<SupportRequestRecord | null>;
  deleteRequest(id: string): Promise<boolean>;
  listCategories(): Promise<string[]>;
  listTemplates(category: string): Promise<DraftTemplate[]>;
}

/** The database could not be reached (connection, timeout, missing configuration). */
export class RepositoryUnavailableError extends Error {
  constructor(readonly code: string) {
    super("Repository unavailable");
    this.name = "RepositoryUnavailableError";
  }
}

/** Any other data-layer failure. Carries only an error code, never a message. */
export class RepositoryFailedError extends Error {
  constructor(readonly code: string) {
    super("Repository operation failed");
    this.name = "RepositoryFailedError";
  }
}
