import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { draftBasisHash, draftNeedsReview } from "../api/draft-basis";
import { validateRequestFields } from "../api/validation";
import { draftBasisPayload, reviewNeeded, type DraftBasis } from "../draft-basis-payload";
import { parseTemplatesCsv } from "../templates-csv";
import { sha256Hex } from "./basis-hash";
import {
  applyGeneratedDraft,
  applySavedRecord,
  editorFromRecord,
  EMPTY_VALUES,
  isDirty,
  newEditor,
  requestBody,
  requiresOverwriteConfirm,
  setField,
  validateForm,
  type EditorState,
  type GeneratedDraft,
  type SavedRequest,
} from "./editor";

const categories = [
  ...new Set(
    parseTemplatesCsv(readFileSync(path.join(__dirname, "..", "..", "data", "support_templates.csv"), "utf8")).map(
      (t) => t.category,
    ),
  ),
];

const BASIS: DraftBasis = {
  requesterName: "Mari Maasikas",
  category: "Sisselogimine",
  description: "Parool on vale.",
  tone: "FORMAL",
};

function filled(): EditorState {
  let state = newEditor(1);
  for (const [key, value] of Object.entries(BASIS) as [keyof DraftBasis, string][]) {
    state = setField(state, key, value as never);
  }
  return state;
}

function generated(draft = "Mustand", basis: DraftBasis = BASIS): GeneratedDraft {
  return { draft, draftSourceLabel: "Sisselogimine: mall", draftBasisHash: draftBasisHash(basis), notice: null };
}

function record(overrides: Partial<SavedRequest> = {}): SavedRequest {
  return {
    id: "req1",
    ...EMPTY_VALUES,
    ...BASIS,
    draftReply: "",
    draftSourceLabel: null,
    draftBasisHash: null,
    draftNeedsReview: false,
    createdAt: "2026-10-27T10:00:00.000Z",
    updatedAt: "2026-10-27T10:00:00.000Z",
    ...overrides,
  };
}

// --- unsaved changes ----------------------------------------------------------

test("a new empty form is clean; any edit makes it dirty; reverting makes it clean", () => {
  const empty = newEditor(1);
  assert.equal(isDirty(empty), false);
  const edited = setField(empty, "description", "x");
  assert.equal(isDirty(edited), true);
  assert.equal(isDirty(setField(edited, "description", "")), false);
  assert.equal(isDirty(setField(empty, "status", "RESOLVED")), true);
});

test("a loaded request is clean until edited; a generated draft makes it dirty", () => {
  const loaded = editorFromRecord(record(), 2);
  assert.equal(isDirty(loaded), false);
  assert.equal(isDirty(setField(loaded, "tone", "SHORT")), true);
  const withDraft = applyGeneratedDraft(loaded, "", generated()).state;
  assert.equal(isDirty(withDraft), true);
});

// --- overwrite confirmation and in-flight generation -------------------------

test("overwrite confirmation is required for any non-empty draft", () => {
  assert.equal(requiresOverwriteConfirm(""), false);
  assert.equal(requiresOverwriteConfirm("  \n\t"), false);
  assert.equal(requiresOverwriteConfirm("."), true);
  assert.equal(requiresOverwriteConfirm("Käsitsi muudetud tekst"), true);
});

test("a generated draft is applied with its label and basis hash", () => {
  const { state, applied } = applyGeneratedDraft(filled(), "", generated("Uus mustand"));
  assert.equal(applied, true);
  assert.equal(state.values.draftReply, "Uus mustand");
  assert.equal(state.meta.draftSourceLabel, "Sisselogimine: mall");
  assert.equal(state.meta.draftBasisHash, draftBasisHash(BASIS));
});

test("a late draft response never overwrites text edited while it was in flight", () => {
  const atStart = setField(filled(), "draftReply", "Vana tekst");
  const editedMeanwhile = setField(atStart, "draftReply", "Vana tekst, mida kasutaja muutis");
  const { state, applied } = applyGeneratedDraft(editedMeanwhile, "Vana tekst", generated());
  assert.equal(applied, false);
  assert.equal(state, editedMeanwhile);
  assert.equal(state.values.draftReply, "Vana tekst, mida kasutaja muutis");
});

test("emptying the draft by hand clears its template metadata", () => {
  const withDraft = applyGeneratedDraft(filled(), "", generated()).state;
  const cleared = setField(withDraft, "draftReply", "   ");
  assert.deepEqual(cleared.meta, { draftSourceLabel: null, draftBasisHash: null });
  assert.equal(cleared.values.draftReply, "   ");
});

// --- save responses -------------------------------------------------------------

test("save response replaces values when nothing changed while saving", () => {
  const state = setField(filled(), "requesterName", "  Mari Maasikas  ");
  const sent = { values: state.values, meta: state.meta };
  const saved = applySavedRecord(state, sent, record());
  assert.equal(saved.requestId, "req1");
  assert.equal(saved.values.requesterName, "Mari Maasikas");
  assert.equal(isDirty(saved), false);
});

test("edits made while saving are kept and stay marked unsaved", () => {
  const state = filled();
  const sent = { values: state.values, meta: state.meta };
  const editedMeanwhile = setField(state, "description", "Uuem kirjeldus");
  const saved = applySavedRecord(editedMeanwhile, sent, record());
  assert.equal(saved.requestId, "req1");
  assert.equal(saved.values.description, "Uuem kirjeldus");
  assert.equal(isDirty(saved), true);
});

test("request body carries the draft label and basis hash", () => {
  const state = applyGeneratedDraft(filled(), "", generated()).state;
  const body = requestBody(state);
  assert.equal(body.draftSourceLabel, "Sisselogimine: mall");
  assert.equal(body.draftBasisHash, draftBasisHash(BASIS));
  assert.equal(body.status, "NEW");
});

// --- consistency with the server -----------------------------------------------

test("browser hash equals server hash, including whitespace normalisation", async () => {
  const inputs: DraftBasis[] = [
    BASIS,
    { ...BASIS, requesterName: "  Mari \t Maasikas\n" },
    { ...BASIS, description: "Mitu\n\nrida   ja  tühikuid  " },
    { ...BASIS, category: "Õigused", description: "Šokolaad, žürii, ÕÄÖÜ ja emoji 🙂" },
    { ...BASIS, tone: "SHORT" },
  ];
  for (const basis of inputs) {
    assert.equal(await sha256Hex(draftBasisPayload(basis)), draftBasisHash(basis), JSON.stringify(basis));
  }
  assert.equal(draftBasisHash(inputs[1]), draftBasisHash(BASIS));
  assert.notEqual(draftBasisHash(inputs[4]), draftBasisHash(BASIS));
});

test("immediate browser review warning matches the server's draftNeedsReview", async () => {
  const basisHash = draftBasisHash(BASIS);
  const cases: [string, DraftBasis][] = [
    ["Mustand", BASIS],
    ["Mustand", { ...BASIS, requesterName: " Mari  Maasikas " }],
    ["Mustand", { ...BASIS, tone: "FRIENDLY" }],
    ["Mustand", { ...BASIS, description: "Teine kirjeldus." }],
    ["   ", { ...BASIS, tone: "FRIENDLY" }],
  ];
  for (const [draft, current] of cases) {
    const browserHash = await sha256Hex(draftBasisPayload(current));
    assert.ok(browserHash);
    assert.equal(reviewNeeded(draft, basisHash, browserHash), draftNeedsReview(draft, basisHash, current));
  }
  assert.equal(reviewNeeded("Mustand", null, "x"), false);
});

test("client validation reports the same messages as the server", () => {
  const bodies = [
    { ...EMPTY_VALUES },
    { ...EMPTY_VALUES, ...BASIS },
    { ...EMPTY_VALUES, ...BASIS, requesterName: " ", description: "\n" },
    { ...EMPTY_VALUES, ...BASIS, requesterName: "n".repeat(101), category: "Tundmatu" },
    { ...EMPTY_VALUES, ...BASIS, requesterName: "n".repeat(100), description: "k".repeat(2000), draftReply: "m".repeat(5000) },
    { ...EMPTY_VALUES, ...BASIS, description: ` ${"k".repeat(2001)} `, draftReply: "m".repeat(5001) },
  ];
  for (const body of bodies) {
    const client = Object.values(validateForm(body, categories)).sort();
    const server = validateRequestFields(body, categories);
    assert.deepEqual(client, server.ok ? [] : [...server.errors].sort(), JSON.stringify(body).slice(0, 80));
  }
});

test("client validation skips the category check only when categories are not loaded", () => {
  const values = { ...EMPTY_VALUES, ...BASIS, category: "Tundmatu" };
  assert.ok(validateForm(values, categories).category);
  assert.equal(validateForm(values, null).category, undefined);
  assert.equal(validateForm({ ...values, draftReply: "m".repeat(5001) }, categories, true).draftReply, undefined);
});
