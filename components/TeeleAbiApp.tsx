"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Tone } from "@/lib/draft";
import { draftBasisPayload, reviewNeeded } from "@/lib/draft-basis-payload";
import { MESSAGES } from "@/lib/api/messages";
import { LIMITS, STATUSES, TONES, type RequestStatus } from "@/lib/api/validation";
import { apiRequest } from "@/lib/ui/api-client";
import { sha256Hex } from "@/lib/ui/basis-hash";
import {
  applyGeneratedDraft,
  applySavedRecord,
  draftRequestBody,
  editorFromRecord,
  isDirty,
  newEditor,
  requestBody,
  requiresOverwriteConfirm,
  setField,
  STATUS_LABELS,
  TONE_LABELS,
  validateForm,
  type EditorState,
  type FieldErrors,
  type FormValues,
  type GeneratedDraft,
  type SavedRequest,
} from "@/lib/ui/editor";
import { formatDateTime } from "@/lib/ui/format";
import { ConfirmDialog, type ConfirmOptions } from "./ConfirmDialog";
import { RequestList, type ListState, type RequestSummary } from "./RequestList";

type Operation = "generate" | "save" | "delete";
type Notice = { session: number; kind: "success" | "info" | "error"; text: string; retry?: Operation };
type LoadState = { session: number; id: string; error: string | null } | null;
type CategoryState = { phase: "loading" | "ready" | "error"; items: string[]; error?: string };

const FIELD_ORDER: (keyof FormValues)[] = ["requesterName", "category", "description", "tone", "status", "draftReply"];

const REVIEW_WARNING =
  "Nimi, kategooria, kirjeldus või toon on pärast mustandi koostamist muutunud. Vaata mustand üle või genereeri uus.";

export default function TeeleAbiApp() {
  const sessionCounter = useRef(0);
  const [editor, setEditor] = useState<EditorState>(() => newEditor(0));
  const editorRef = useRef(editor);
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  const [load, setLoad] = useState<LoadState>(null);
  const [list, setList] = useState<ListState>({ phase: "loading", items: [] });
  const [categories, setCategories] = useState<CategoryState>({ phase: "loading", items: [] });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState<{ session: number; op: Operation } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const busy = pending?.session === editor.session ? pending.op : null;
  const dirty = isDirty(editor);
  const { values, meta } = editor;

  // --- data loading ---------------------------------------------------------

  const listSeq = useRef(0);
  const fetchList = useCallback(async () => {
    const seq = ++listSeq.current;
    const result = await apiRequest<{ requests: RequestSummary[] }>("/api/requests", {}, MESSAGES.loadFailed);
    if (seq !== listSeq.current) return; // a newer refresh is in flight
    setList((previous) =>
      result.ok
        ? { phase: "ready", items: result.data.requests }
        : { phase: "error", items: previous.items, error: result.error },
    );
  }, []);

  const fetchCategories = useCallback(
    () =>
      apiRequest<{ categories: string[] }>("/api/categories", {}, MESSAGES.categoriesFailed).then((result) =>
        setCategories(
          result.ok
            ? { phase: "ready", items: result.data.categories }
            : { phase: "error", items: [], error: result.error },
        ),
      ),
    [],
  );

  useEffect(() => {
    void fetchList();
    void fetchCategories();
  }, [fetchList, fetchCategories]);

  // --- review warning (same hash as the server) -------------------------------

  const basisPayload = draftBasisPayload(values);
  const [hashed, setHashed] = useState<{ payload: string; hash: string | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    sha256Hex(basisPayload).then(
      (hash) => {
        if (!cancelled) setHashed({ payload: basisPayload, hash });
      },
      () => {
        if (!cancelled) setHashed({ payload: basisPayload, hash: null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [basisPayload]);
  const currentHash = hashed?.payload === basisPayload ? hashed.hash : null;
  const showReviewWarning =
    currentHash !== null && reviewNeeded(values.draftReply, meta.draftBasisHash, currentHash);

  // --- unsaved changes --------------------------------------------------------

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function guardUnsaved(action: () => void) {
    if (!isDirty(editorRef.current)) {
      action();
      return;
    }
    setConfirm({
      title: "Salvestamata muudatused",
      message: "Sellel päringul on salvestamata muudatusi. Kui jätkad, need kaovad.",
      confirmLabel: "Loobu muudatustest",
      cancelLabel: "Jätka muutmist",
      destructive: true,
      onConfirm: action,
    });
  }

  function startSession(): number {
    sessionCounter.current += 1;
    return sessionCounter.current;
  }

  function focusField(key: keyof FormValues) {
    requestAnimationFrame(() => document.getElementById(`field-${key}`)?.focus());
  }

  function showErrors(fieldErrors: FieldErrors): boolean {
    setErrors(fieldErrors);
    const first = FIELD_ORDER.find((key) => fieldErrors[key]);
    if (first) focusField(first);
    return first !== undefined;
  }

  // --- opening requests -------------------------------------------------------

  async function loadRequest(id: string, session: number) {
    const result = await apiRequest<{ request: SavedRequest }>(
      `/api/requests/${encodeURIComponent(id)}`,
      {},
      MESSAGES.loadFailed,
    );
    if (editorRef.current.session !== session) return; // another request was opened meanwhile
    if (result.ok) {
      setEditor(editorFromRecord(result.data.request, session));
      setLoad(null);
    } else {
      setLoad({ session, id, error: result.error });
    }
  }

  function openSession(next: EditorState, loading: string | null) {
    editorRef.current = next;
    setEditor(next);
    setLoad(loading ? { session: next.session, id: loading, error: null } : null);
    setErrors({});
    setNotice(null);
    setDrawerOpen(false);
  }

  function openRequest(id: string) {
    if (id === editor.requestId && !load) {
      setDrawerOpen(false);
      return;
    }
    guardUnsaved(() => {
      const session = startSession();
      openSession({ ...newEditor(session), requestId: id }, id);
      void loadRequest(id, session);
    });
  }

  function openNew() {
    guardUnsaved(() => {
      openSession(newEditor(startSession()), null);
      focusField("requesterName");
    });
  }

  function retryLoad() {
    if (!load) return;
    setLoad({ ...load, error: null });
    void loadRequest(load.id, load.session);
  }

  // --- editing ----------------------------------------------------------------

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setEditor((current) => setField(current, key, value));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  }

  // --- generate ---------------------------------------------------------------

  async function runGenerate() {
    const state = editorRef.current;
    const session = state.session;
    const draftAtStart = state.values.draftReply;
    setPending({ session, op: "generate" });
    setNotice(null);
    const result = await apiRequest<GeneratedDraft>(
      "/api/draft",
      { method: "POST", body: draftRequestBody(state.values) },
      MESSAGES.draftFailed,
    );
    setPending((current) => (current?.session === session ? null : current));
    if (editorRef.current.session !== session) return;
    if (!result.ok) {
      setNotice({ session, kind: "error", text: result.error, retry: "generate" });
      return;
    }
    if (!applyGeneratedDraft(editorRef.current, draftAtStart, result.data).applied) {
      setNotice({
        session,
        kind: "info",
        text: "Mustandit muudeti koostamise ajal, seega uut mustandit ei rakendatud. Sinu tekst on alles.",
      });
      return;
    }
    setEditor((current) =>
      current.session === session ? applyGeneratedDraft(current, draftAtStart, result.data).state : current,
    );
    setNotice({
      session,
      kind: result.data.notice ? "info" : "success",
      text: result.data.notice ?? "Mustand on koostatud. Vaata see enne salvestamist üle.",
    });
  }

  function generate() {
    const categoryList = categories.phase === "ready" ? categories.items : null;
    if (showErrors(validateForm(values, categoryList, true))) return;
    if (requiresOverwriteConfirm(values.draftReply)) {
      setConfirm({
        title: "Kirjutada mustand üle?",
        message: "Praegune mustand asendatakse uue mallipõhise mustandiga. Kui tühistad, jääb praegune tekst täpselt alles.",
        confirmLabel: "Kirjuta üle",
        cancelLabel: "Tühista",
        onConfirm: () => void runGenerate(),
      });
      return;
    }
    void runGenerate();
  }

  // --- save -------------------------------------------------------------------

  async function runSave() {
    const state = editorRef.current;
    const session = state.session;
    const sent = { values: state.values, meta: state.meta };
    setPending({ session, op: "save" });
    setNotice(null);
    const result = await apiRequest<{ request: SavedRequest }>(
      state.requestId === null ? "/api/requests" : `/api/requests/${encodeURIComponent(state.requestId)}`,
      { method: state.requestId === null ? "POST" : "PUT", body: requestBody(state) },
      MESSAGES.saveFailed,
    );
    setPending((current) => (current?.session === session ? null : current));
    if (result.ok) void fetchList();
    if (editorRef.current.session !== session) return;
    if (!result.ok) {
      setNotice({ session, kind: "error", text: result.error, retry: "save" });
      return;
    }
    setEditor((current) =>
      current.session === session ? applySavedRecord(current, sent, result.data.request) : current,
    );
    setNotice({ session, kind: "success", text: "Päring on salvestatud." });
  }

  function save() {
    const categoryList = categories.phase === "ready" ? categories.items : null;
    if (showErrors(validateForm(values, categoryList))) return;
    void runSave();
  }

  // --- delete -----------------------------------------------------------------

  async function runDelete() {
    const state = editorRef.current;
    const session = state.session;
    if (state.requestId === null) return;
    setPending({ session, op: "delete" });
    setNotice(null);
    const result = await apiRequest<{ deleted: boolean }>(
      `/api/requests/${encodeURIComponent(state.requestId)}`,
      { method: "DELETE" },
      MESSAGES.deleteFailed,
    );
    setPending((current) => (current?.session === session ? null : current));
    if (result.ok) void fetchList();
    if (editorRef.current.session !== session) return;
    if (!result.ok) {
      setNotice({ session, kind: "error", text: result.error, retry: "delete" });
      return;
    }
    const next = newEditor(startSession());
    openSession(next, null);
    setNotice({ session: next.session, kind: "success", text: "Päring on kustutatud." });
  }

  function remove() {
    setConfirm({
      title: "Kustutada päring?",
      message: "Päring ja selle mustand kustutatakse andmebaasist jäädavalt.",
      confirmLabel: "Kustuta päring",
      cancelLabel: "Tühista",
      destructive: true,
      onConfirm: () => void runDelete(),
    });
  }

  // --- copy -------------------------------------------------------------------

  async function copy() {
    const session = editor.session;
    try {
      await navigator.clipboard.writeText(values.draftReply);
      setNotice({ session, kind: "success", text: "Mustand kopeeritud." });
    } catch {
      setNotice({
        session,
        kind: "error",
        text: "Kopeerimine ebaõnnestus. Märgista mustandi tekst ja kopeeri see käsitsi.",
      });
    }
  }

  function retry(operation: Operation) {
    if (operation === "generate") void runGenerate();
    if (operation === "save") void runSave();
    if (operation === "delete") void runDelete();
  }

  // --- mobile drawer ----------------------------------------------------------

  const drawerRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer) return;
    if (drawerOpen && !drawer.open) drawer.showModal();
    if (!drawerOpen && drawer.open) drawer.close();
  }, [drawerOpen]);

  // The drawer is hidden at desktop width; close it so a hidden modal never blocks the page.
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const close = () => {
      if (desktop.matches) setDrawerOpen(false);
    };
    desktop.addEventListener("change", close);
    return () => desktop.removeEventListener("change", close);
  }, []);

  // --- render -----------------------------------------------------------------

  const visibleNotice = notice?.session === editor.session ? notice : null;
  const categoryOptions =
    values.category !== "" && !categories.items.includes(values.category)
      ? [...categories.items, values.category]
      : categories.items;
  const loading = load?.session === editor.session ? load : null;
  const formDisabled = loading !== null;
  const hasDraft = values.draftReply.trim() !== "";

  const listProps = {
    list,
    selectedId: editor.requestId,
    onSelect: openRequest,
    onNew: openNew,
    onRetry: () => {
      setList((current) => ({ phase: "loading", items: current.items }));
      void fetchList();
    },
  };

  return (
    <div className="flex min-h-[calc(100dvh-2.5rem)]">
      <aside className="hidden w-[280px] shrink-0 border-r border-slate-200 bg-white md:block">
        <div className="sticky top-0 h-dvh">
          <RequestList {...listProps} />
        </div>
      </aside>

      <dialog
        ref={drawerRef}
        id="mobile-drawer"
        aria-label="Päringute loend"
        onCancel={(event) => {
          event.preventDefault();
          setDrawerOpen(false);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setDrawerOpen(false);
        }}
        className="m-0 h-dvh max-h-none w-[85vw] max-w-[320px] bg-white p-0 shadow-xl backdrop:bg-slate-900/50 md:hidden"
      >
        <div className="flex h-full flex-col">
          <div className="flex justify-end border-b border-slate-200 p-2">
            <button type="button" onClick={() => setDrawerOpen(false)} className="btn btn-secondary">
              Sulge
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <RequestList {...listProps} />
          </div>
        </div>
      </dialog>

      <main className="min-w-0 flex-1">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 md:px-8">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-controls="mobile-drawer"
            aria-expanded={drawerOpen}
            className="btn btn-secondary md:hidden"
          >
            <span aria-hidden="true" className="mr-2 text-lg leading-none">
              ☰
            </span>
            Päringud
          </button>
          <h1 className="text-xl font-semibold tracking-tight">Teele Abi</h1>
        </header>

        <div className="mx-auto max-w-3xl px-4 py-6 md:px-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-2xl font-semibold">{editor.requestId ? "Päring" : "Uus päring"}</h2>
            {dirty && <span className="text-sm font-medium text-amber-800">Salvestamata muudatused</span>}
          </div>
          {editor.requestId && editor.createdAt && editor.updatedAt && (
            <p className="mt-1 text-sm text-slate-600">
              Loodud {formatDateTime(editor.createdAt)} · Muudetud {formatDateTime(editor.updatedAt)}
            </p>
          )}

          {loading && (
            <div className="mt-6" role={loading.error ? "alert" : "status"}>
              {loading.error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                  <p>{loading.error}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={retryLoad} className="btn btn-secondary">
                      Proovi uuesti
                    </button>
                    <button type="button" onClick={openNew} className="btn btn-secondary">
                      Uus päring
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-600">Laadin päringut…</p>
              )}
            </div>
          )}

          {!formDisabled && (
            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                save();
              }}
              className="mt-6 space-y-6"
            >
              <section className="space-y-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:p-6">
                <Field label="Pöörduja nimi" name="requesterName" error={errors.requesterName}>
                  <input
                    id="field-requesterName"
                    type="text"
                    autoComplete="off"
                    value={values.requesterName}
                    onChange={(event) => update("requesterName", event.target.value)}
                    aria-invalid={errors.requesterName ? true : undefined}
                    aria-describedby={errors.requesterName ? "error-requesterName" : undefined}
                    className="field"
                  />
                </Field>

                <Field label="Kategooria" name="category" error={errors.category}>
                  <select
                    id="field-category"
                    value={values.category}
                    onChange={(event) => update("category", event.target.value)}
                    disabled={categories.phase === "loading" && categoryOptions.length === 0}
                    aria-invalid={errors.category ? true : undefined}
                    aria-describedby={errors.category ? "error-category" : undefined}
                    className="field"
                  >
                    <option value="">
                      {categories.phase === "loading" ? "Laadin kategooriaid…" : "Vali kategooria"}
                    </option>
                    {categoryOptions.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                  {categories.phase === "error" && (
                    <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-sm text-red-800">
                      <span>{categories.error}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setCategories({ phase: "loading", items: [] });
                          void fetchCategories();
                        }}
                        className="btn btn-secondary"
                      >
                        Proovi uuesti
                      </button>
                    </div>
                  )}
                </Field>

                <Field
                  label="Probleemi kirjeldus"
                  name="description"
                  error={errors.description}
                  counter={{ length: values.description.length, max: LIMITS.description }}
                >
                  <textarea
                    id="field-description"
                    rows={5}
                    value={values.description}
                    onChange={(event) => update("description", event.target.value)}
                    aria-invalid={errors.description ? true : undefined}
                    aria-describedby={`counter-description${errors.description ? " error-description" : ""}`}
                    className="field"
                  />
                </Field>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Vastuse toon" name="tone">
                    <select
                      id="field-tone"
                      value={values.tone}
                      onChange={(event) => update("tone", event.target.value as Tone)}
                      className="field"
                    >
                      {TONES.map((tone) => (
                        <option key={tone} value={tone}>
                          {TONE_LABELS[tone]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Staatus" name="status">
                    <select
                      id="field-status"
                      value={values.status}
                      onChange={(event) => update("status", event.target.value as RequestStatus)}
                      className="field"
                    >
                      {STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <button type="button" onClick={generate} disabled={busy !== null} className="btn btn-primary w-full sm:w-auto">
                  {busy === "generate" ? "Koostan mustandit..." : "Genereeri mustand"}
                </button>
              </section>

              <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:p-6">
                <div>
                  <h3 className="text-lg font-semibold">Vastuse mustand</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    See on mallipõhine mustand. Vaata see enne kasutamist üle.
                  </p>
                  {hasDraft && (
                    <p className="mt-1 text-sm text-slate-700">
                      {meta.draftSourceLabel ? `Kasutatud mall: ${meta.draftSourceLabel}` : "Mustand on kirjutatud käsitsi."}
                    </p>
                  )}
                </div>

                {showReviewWarning && (
                  <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    {REVIEW_WARNING}
                  </p>
                )}

                <Field
                  label="Mustandi tekst"
                  name="draftReply"
                  error={errors.draftReply}
                  counter={{ length: values.draftReply.length, max: LIMITS.draftReply }}
                >
                  <textarea
                    id="field-draftReply"
                    rows={12}
                    value={values.draftReply}
                    onChange={(event) => update("draftReply", event.target.value)}
                    aria-invalid={errors.draftReply ? true : undefined}
                    aria-describedby={`counter-draftReply${errors.draftReply ? " error-draftReply" : ""}`}
                    className="field font-[inherit]"
                  />
                </Field>

                {visibleNotice && (
                  <div
                    role={visibleNotice.kind === "error" ? "alert" : "status"}
                    className={`flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm ${
                      visibleNotice.kind === "error"
                        ? "border-red-200 bg-red-50 text-red-900"
                        : visibleNotice.kind === "info"
                          ? "border-slate-200 bg-slate-50 text-slate-800"
                          : "border-emerald-200 bg-emerald-50 text-emerald-900"
                    }`}
                  >
                    <span>{visibleNotice.text}</span>
                    {visibleNotice.retry && (
                      <button
                        type="button"
                        onClick={() => retry(visibleNotice.retry as Operation)}
                        disabled={busy !== null}
                        className="btn btn-secondary"
                      >
                        Proovi uuesti
                      </button>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button type="submit" disabled={busy !== null} className="btn btn-primary">
                    {busy === "save" ? "Salvestan..." : "Salvesta"}
                  </button>
                  <button type="button" onClick={copy} disabled={!values.draftReply} className="btn btn-secondary">
                    Kopeeri
                  </button>
                  {editor.requestId && (
                    <button
                      type="button"
                      onClick={remove}
                      disabled={busy !== null}
                      className="btn btn-danger-outline sm:ml-auto"
                    >
                      {busy === "delete" ? "Kustutan..." : "Kustuta päring"}
                    </button>
                  )}
                </div>
              </section>
            </form>
          )}
        </div>
      </main>

      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

function Field({
  label,
  name,
  error,
  counter,
  children,
}: {
  label: string;
  name: keyof FormValues;
  error?: string;
  counter?: { length: number; max: number };
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={`field-${name}`} className="text-sm font-medium text-slate-800">
          {label}
        </label>
        {counter && (
          <span
            id={`counter-${name}`}
            className={`text-xs ${counter.length > counter.max ? "font-semibold text-red-700" : "text-slate-500"}`}
          >
            {counter.length} / {counter.max} märki
          </span>
        )}
      </div>
      {children}
      {error && (
        <p id={`error-${name}`} className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
