import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { DraftTemplate } from "../draft";
import { parseTemplatesCsv } from "../templates-csv";
import {
  createRequest,
  deleteRequest,
  generateDraft,
  getRequest,
  listCategories,
  listRequests,
  updateRequest,
} from "./handlers";
import { MESSAGES } from "./messages";
import {
  RepositoryFailedError,
  RepositoryUnavailableError,
  type Repository,
  type SupportRequestData,
  type SupportRequestRecord,
} from "./repository";

// Test double only: an in-memory Repository. The app itself uses the Prisma repository.
const templates: DraftTemplate[] = parseTemplatesCsv(
  readFileSync(path.join(__dirname, "..", "..", "data", "support_templates.csv"), "utf8"),
);

type FakeRepository = Repository & { writes: number; rows: Map<string, SupportRequestRecord> };

function fakeRepository(): FakeRepository {
  const rows = new Map<string, SupportRequestRecord>();
  let clock = Date.UTC(2026, 0, 1);
  let nextId = 1;
  const repo: FakeRepository = {
    rows,
    writes: 0,
    async listRequests() {
      return [...rows.values()].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    },
    async getRequest(id) {
      return rows.get(id) ?? null;
    },
    async createRequest(data: SupportRequestData) {
      repo.writes++;
      const now = new Date(clock++);
      const record = { ...data, id: `req${nextId++}`, createdAt: now, updatedAt: now };
      rows.set(record.id, record);
      return record;
    },
    async updateRequest(id, data) {
      repo.writes++;
      const existing = rows.get(id);
      if (!existing) return null;
      const record = { ...existing, ...data, updatedAt: new Date(clock++) };
      rows.set(id, record);
      return record;
    },
    async deleteRequest(id) {
      repo.writes++;
      return rows.delete(id);
    },
    async listCategories() {
      return templates.map((t) => t.category);
    },
    async listTemplates(category) {
      return templates.filter((t) => t.category === category);
    },
  };
  return repo;
}

const VALID = {
  requesterName: "Mari Maasikas",
  category: "Sisselogimine",
  description: "Sisestan parooli, aga süsteem ütleb, et parool on vale.",
  tone: "FORMAL",
};

type DraftBody = { draft: string; draftSourceLabel: string; draftBasisHash: string; match: string; notice: string | null };
type RequestBody = { request: SupportRequestRecord };

async function draftFor(repo: Repository, input: object = VALID): Promise<DraftBody> {
  const result = await generateDraft(repo, input);
  assert.equal(result.status, 200);
  return result.body as DraftBody;
}

async function saveNew(repo: Repository, body: object): Promise<SupportRequestRecord> {
  const result = await createRequest(repo, body);
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return (result.body as RequestBody).request;
}

let errorLog: string[] = [];
const originalConsoleError = console.error;
beforeEach(() => {
  errorLog = [];
  console.error = (...args: unknown[]) => errorLog.push(args.map(String).join(" "));
});
afterEach(() => {
  console.error = originalConsoleError;
});

// --- validation -------------------------------------------------------------

test("create: valid request is saved with default status NEW", async () => {
  const repo = fakeRepository();
  const request = await saveNew(repo, { ...VALID, requesterName: "  Mari Maasikas  " });
  assert.equal(request.status, "NEW");
  assert.equal(request.requesterName, "Mari Maasikas");
  assert.equal(request.draftReply, "");
  assert.equal(request.draftSourceLabel, null);
  assert.equal(request.draftNeedsReview, false);
});

test("create: required fields, enums and unknown category are rejected in Estonian", async () => {
  const repo = fakeRepository();
  const cases: [object, string][] = [
    [{ ...VALID, requesterName: "   " }, MESSAGES.nameRequired],
    [{ ...VALID, category: "" }, MESSAGES.categoryRequired],
    [{ ...VALID, category: "Tundmatu" }, MESSAGES.categoryUnknown],
    [{ ...VALID, description: "" }, MESSAGES.descriptionRequired],
    [{ ...VALID, tone: "Ametlik" }, MESSAGES.toneInvalid],
    [{ ...VALID, status: "DONE" }, MESSAGES.statusInvalid],
    [{ ...VALID, draftReply: 42 }, MESSAGES.draftInvalid],
    [{ ...VALID, draftBasisHash: "abc" }, MESSAGES.draftMetaInvalid],
  ];
  for (const [body, message] of cases) {
    const result = await createRequest(repo, body);
    assert.equal(result.status, 400, message);
    assert.ok((result.body as { errors: string[] }).errors.includes(message), message);
  }
  for (const body of [null, "tekst", [VALID]]) {
    const result = await createRequest(repo, body);
    assert.equal(result.status, 400);
    assert.deepEqual(result.body, { error: MESSAGES.invalidBody, errors: [MESSAGES.invalidBody] });
  }
  assert.equal(repo.writes, 0);
});

test("create: length limits 100/2000/5000 are inclusive", async () => {
  const repo = fakeRepository();
  await saveNew(repo, {
    ...VALID,
    requesterName: "n".repeat(100),
    description: "k".repeat(2000),
    draftReply: "m".repeat(5000),
  });
  const tooLong: [object, string][] = [
    [{ ...VALID, requesterName: "n".repeat(101) }, MESSAGES.nameTooLong],
    [{ ...VALID, description: "k".repeat(2001) }, MESSAGES.descriptionTooLong],
    [{ ...VALID, draftReply: "m".repeat(5001) }, MESSAGES.draftTooLong],
  ];
  for (const [body, message] of tooLong) {
    const result = await createRequest(repo, body);
    assert.equal(result.status, 400);
    assert.equal((result.body as { error: string }).error, message);
  }
});

test("create: an empty draft is allowed and clears draft metadata", async () => {
  const repo = fakeRepository();
  const { draftBasisHash } = await draftFor(repo);
  const request = await saveNew(repo, { ...VALID, draftReply: "  ", draftSourceLabel: "Silt", draftBasisHash });
  assert.equal(request.draftSourceLabel, null);
  assert.equal(request.draftBasisHash, null);
  assert.equal(request.draftNeedsReview, false);
});

// --- draft generation -------------------------------------------------------

test("draft: returns draft, label and basis hash without writing anything", async () => {
  const repo = fakeRepository();
  const body = await draftFor(repo);
  assert.equal(body.match, "template");
  assert.equal(body.draftSourceLabel, "Sisselogimine: Teele sisselogimisel kuvatakse teade vale parooli kohta.");
  assert.match(body.draftBasisHash, /^[0-9a-f]{64}$/);
  assert.ok(body.draft.startsWith("Lugupeetud Mari Maasikas"));
  assert.equal(body.notice, null);
  assert.equal(repo.writes, 0);
  assert.equal(repo.rows.size, 0);
});

test("draft: does not change the status of a saved request", async () => {
  const repo = fakeRepository();
  const saved = await saveNew(repo, { ...VALID, status: "IN_PROGRESS" });
  const writesBefore = repo.writes;
  await draftFor(repo, { ...VALID, id: saved.id, status: "RESOLVED" });
  assert.equal(repo.writes, writesBefore);
  assert.equal(repo.rows.get(saved.id)?.status, "IN_PROGRESS");
});

test("draft: invalid input and unknown category give 400", async () => {
  const repo = fakeRepository();
  const missing = await generateDraft(repo, { ...VALID, description: " " });
  assert.equal(missing.status, 400);
  assert.equal((missing.body as { error: string }).error, MESSAGES.descriptionRequired);
  const unknown = await generateDraft(repo, { ...VALID, category: "Tundmatu" });
  assert.equal(unknown.status, 400);
  assert.equal((unknown.body as { error: string }).error, MESSAGES.categoryUnknown);
});

test("draft: no matching template returns the generic draft with a notice", async () => {
  const body = await draftFor(fakeRepository(), { ...VALID, description: "Kohvimasin on katki." });
  assert.equal(body.match, "no-match");
  assert.equal(body.notice, MESSAGES.noMatchNotice);
});

// --- draftNeedsReview -------------------------------------------------------

test("needsReview: saving an unchanged generated draft does not flag it", async () => {
  const repo = fakeRepository();
  const draft = await draftFor(repo);
  const saved = await saveNew(repo, { ...VALID, draftReply: draft.draft, draftSourceLabel: draft.draftSourceLabel, draftBasisHash: draft.draftBasisHash });
  assert.equal(saved.draftNeedsReview, false);
  assert.equal(saved.draftSourceLabel, draft.draftSourceLabel);

  // Re-saving the same values (whitespace differences only) keeps it unflagged.
  const again = await updateRequest(repo, saved.id, { ...VALID, requesterName: " Mari  Maasikas ", draftReply: draft.draft });
  assert.equal((again.body as RequestBody).request.draftNeedsReview, false);
});

test("needsReview: new unsaved request edited after generation is flagged on first save", async () => {
  const repo = fakeRepository();
  for (const change of [
    { requesterName: "Jaan Tamm" },
    { category: "Veateated" },
    { description: "Teine kirjeldus pärast genereerimist." },
    { tone: "SHORT" },
  ]) {
    const draft = await draftFor(repo);
    const saved = await saveNew(repo, { ...VALID, ...change, draftReply: draft.draft, draftSourceLabel: draft.draftSourceLabel, draftBasisHash: draft.draftBasisHash });
    assert.equal(saved.draftNeedsReview, true, JSON.stringify(change));
    assert.equal(saved.draftSourceLabel, draft.draftSourceLabel);
  }
});

test("needsReview: saved request edited later is flagged, and cleared when reverted or regenerated", async () => {
  const repo = fakeRepository();
  const draft = await draftFor(repo);
  const saved = await saveNew(repo, { ...VALID, draftReply: draft.draft, draftSourceLabel: draft.draftSourceLabel, draftBasisHash: draft.draftBasisHash });

  // The client sends only the form fields; stored label and hash are kept.
  const changed = await updateRequest(repo, saved.id, { ...VALID, tone: "FRIENDLY", draftReply: draft.draft });
  const changedRequest = (changed.body as RequestBody).request;
  assert.equal(changedRequest.draftNeedsReview, true);
  assert.equal(changedRequest.draftSourceLabel, draft.draftSourceLabel);

  const reverted = await updateRequest(repo, saved.id, { ...VALID, draftReply: draft.draft });
  assert.equal((reverted.body as RequestBody).request.draftNeedsReview, false);

  const friendly = { ...VALID, tone: "FRIENDLY" };
  const regenerated = await draftFor(repo, friendly);
  const resaved = await updateRequest(repo, saved.id, { ...friendly, draftReply: regenerated.draft, draftSourceLabel: regenerated.draftSourceLabel, draftBasisHash: regenerated.draftBasisHash });
  assert.equal((resaved.body as RequestBody).request.draftNeedsReview, false);
});

test("needsReview: editing only the draft text or status does not flag it", async () => {
  const repo = fakeRepository();
  const draft = await draftFor(repo);
  const saved = await saveNew(repo, { ...VALID, draftReply: draft.draft, draftSourceLabel: draft.draftSourceLabel, draftBasisHash: draft.draftBasisHash });
  const edited = await updateRequest(repo, saved.id, { ...VALID, status: "RESOLVED", draftReply: `${draft.draft}\n\nLisatud käsitsi.` });
  const request = (edited.body as RequestBody).request;
  assert.equal(request.draftNeedsReview, false);
  assert.equal(request.status, "RESOLVED");
});

test("needsReview: a manually written draft without basis is never flagged", async () => {
  const repo = fakeRepository();
  const saved = await saveNew(repo, { ...VALID, draftReply: "Käsitsi kirjutatud mustand." });
  const updated = await updateRequest(repo, saved.id, { ...VALID, tone: "SHORT" });
  const request = (updated.body as RequestBody).request;
  assert.equal(request.draftNeedsReview, false);
  assert.equal(request.draftSourceLabel, null);
  assert.equal(request.draftReply, "Käsitsi kirjutatud mustand.");
});

// --- read, update, delete ---------------------------------------------------

test("list returns summaries newest first; get returns the full request", async () => {
  const repo = fakeRepository();
  const first = await saveNew(repo, VALID);
  const second = await saveNew(repo, { ...VALID, requesterName: "Jaan Tamm" });
  await updateRequest(repo, first.id, { ...VALID, status: "IN_PROGRESS" });

  const list = await listRequests(repo);
  const requests = (list.body as { requests: { id: string; description?: string }[] }).requests;
  assert.deepEqual(requests.map((r) => r.id), [first.id, second.id]);
  assert.equal(requests[0].description, undefined);

  const one = await getRequest(repo, second.id);
  assert.equal((one.body as RequestBody).request.description, VALID.description);
});

test("missing or malformed ids give 404", async () => {
  const repo = fakeRepository();
  for (const id of ["puudub", "../etc", ""]) {
    assert.equal((await getRequest(repo, id)).status, 404);
    assert.equal((await updateRequest(repo, id, VALID)).status, 404);
    assert.equal((await deleteRequest(repo, id)).status, 404);
  }
  assert.deepEqual((await getRequest(repo, "puudub")).body, { error: MESSAGES.notFound });
});

test("update validates input and keeps the stored request on failure", async () => {
  const repo = fakeRepository();
  const saved = await saveNew(repo, VALID);
  const result = await updateRequest(repo, saved.id, { ...VALID, requesterName: "" });
  assert.equal(result.status, 400);
  assert.equal(repo.rows.get(saved.id)?.requesterName, VALID.requesterName);
});

test("delete removes the request", async () => {
  const repo = fakeRepository();
  const saved = await saveNew(repo, VALID);
  assert.deepEqual((await deleteRequest(repo, saved.id)).body, { deleted: true });
  assert.equal((await getRequest(repo, saved.id)).status, 404);
});

test("categories come from the repository, deduplicated in Estonian order", async () => {
  const result = await listCategories(fakeRepository());
  assert.deepEqual((result.body as { categories: string[] }).categories, [
    "Eelnõu koostamine",
    "Istungid",
    "Kooskõlastamine",
    "Sisselogimine",
    "Veateated",
    "Õigused",
  ]);
});

// --- data-layer failures ----------------------------------------------------

const SECRET = "postgresql://kasutaja:salajane@host.example:5432/teele";

function failingRepository(error: Error): Repository {
  const fail = async (): Promise<never> => {
    throw error;
  };
  return {
    listRequests: fail,
    getRequest: fail,
    createRequest: fail,
    updateRequest: fail,
    deleteRequest: fail,
    listCategories: fail,
    listTemplates: fail,
  };
}

test("unavailable database gives 503 without leaking details", async () => {
  const unavailable = new RepositoryUnavailableError("P1001");
  unavailable.message = SECRET;
  const repo = failingRepository(unavailable);
  const results = [
    await listRequests(repo),
    await getRequest(repo, "req1"),
    await createRequest(repo, VALID),
    await updateRequest(repo, "req1", VALID),
    await deleteRequest(repo, "req1"),
    await generateDraft(repo, VALID),
    await listCategories(repo),
  ];
  for (const result of results) {
    assert.equal(result.status, 503);
    assert.deepEqual(result.body, { error: MESSAGES.dbUnavailable });
  }
  const logged = errorLog.join("\n");
  assert.ok(errorLog.length === results.length);
  assert.ok(!logged.includes("salajane") && !logged.includes("postgresql://"));
  assert.ok(!logged.includes(VALID.description));
});

test("other data-layer failures give 500 with an operation-specific message", async () => {
  const failed = new RepositoryFailedError("P2002");
  failed.message = SECRET;
  const repo = failingRepository(failed);
  assert.deepEqual((await createRequest(repo, VALID)).body, { error: MESSAGES.saveFailed });
  assert.deepEqual((await deleteRequest(repo, "req1")).body, { error: MESSAGES.deleteFailed });
  assert.deepEqual((await listRequests(repo)).body, { error: MESSAGES.loadFailed });
  assert.deepEqual((await generateDraft(repo, VALID)).body, { error: MESSAGES.draftFailed });
  assert.equal((await listCategories(repo)).status, 500);

  const unexpected = failingRepository(new Error(SECRET));
  assert.equal((await getRequest(unexpected, "req1")).status, 500);
  assert.ok(!errorLog.join("\n").includes("salajane"));
});
