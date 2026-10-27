import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildDraft,
  GENERIC_LABEL_NO_MATCH,
  GENERIC_LABEL_NO_TEMPLATES,
  selectTemplate,
  type DraftTemplate,
  type Tone,
} from "./draft";
import { parseTemplatesCsv } from "./templates-csv";

const templates: DraftTemplate[] = parseTemplatesCsv(
  readFileSync(path.join(__dirname, "..", "data", "support_templates.csv"), "utf8"),
);

const TONES: Tone[] = ["FORMAL", "FRIENDLY", "SHORT"];
const NAME = "Mari Maasikas";

function issueFor(category: string, description: string): string | undefined {
  return selectTemplate(category, description, templates)?.exampleIssue;
}

test("CSV fixture has the expected 14 templates", () => {
  assert.equal(templates.length, 14);
});

test("each template is selected by its own example issue", () => {
  for (const template of templates) {
    assert.equal(issueFor(template.category, template.exampleIssue), template.exampleIssue);
  }
});

test("distinguishes two different problems within the same category", () => {
  const cases: [string, string, string][] = [
    ["Sisselogimine", "Sisestan parooli, aga süsteem ütleb, et parool on vale.", "Teele sisselogimisel kuvatakse teade vale parooli kohta."],
    ["Sisselogimine", "Pärast sisselogimist jääb töölaud lõputult laadima.", "Teele sisselogimine õnnestub, kuid töölaud jääb laadima."],
    ["Õigused", "Ma ei näe vajalikku menetlust oma vaates.", "Teele kasutaja ei näe vajalikku dokumenti või menetlust."],
    ["Õigused", "Uue eelnõu loomise nupp puudub.", "Teele kasutaja ei saa uut eelnõu luua, sest loomise võimalus puudub."],
    ["Eelnõu koostamine", "Tekstiredaktoris tehtud muudatused kaovad ega salvestu.", "Teele eelnõu tekstiredaktoris tehtud muudatused ei salvestu."],
    ["Eelnõu koostamine", "Kopeerisin teksti ja vormindus läks valeks.", "Teele eelnõu teksti kopeerimisel muutub vormindus valeks."],
    ["Kooskõlastamine", "Saatmise nupp on hall ja mitteaktiivne.", "Teele eelnõu kooskõlastamisele saatmise nupp on mitteaktiivne."],
    ["Kooskõlastamine", "Kooskõlastaja ei leia talle saadetud eelnõu üles.", "Teele kooskõlastaja ei leia talle saadetud eelnõu."],
    ["Sisselogimine", "Millega saab sisse logida, kas Smart-ID sobib?", "Kuidas saan Teelesse sisse logida?"],
    ["Eelnõu koostamine", "Tahan pooleli oleva eelnõu ära kustutada.", "Kas ma saan koostamisel oleva eelnõu kustutada?"],
    ["Istungid", "Istungi helifailid ei ole mulle nähtavad.", "Miks ma ei näe linnavalitsuse istungite helifaile?"],
  ];
  for (const [category, description, expected] of cases) {
    assert.equal(issueFor(category, description), expected, description);
  }
});

test("only templates of the chosen category are considered", () => {
  const result = buildDraft(
    { requesterName: NAME, category: "Istungid", description: "Parool on vale ja sisselogimine ei õnnestu.", tone: "FORMAL" },
    templates,
  );
  assert.equal(result.match, "no-match");
  assert.ok(!result.draft.includes("Ärge saatke oma parooli ega muid sisselogimisandmeid."));
});

test("'Teele' and 'kasutaja' alone never select a template", () => {
  for (const category of new Set(templates.map((t) => t.category))) {
    assert.equal(issueFor(category, "Teele kasutaja. Teele kasutajad, kasutajal Teeles."), undefined, category);
  }
});

test("irrelevant description returns the cautious generic draft", () => {
  const result = buildDraft(
    { requesterName: NAME, category: "Sisselogimine", description: "Kohvimasin kontoris on katki.", tone: "FORMAL" },
    templates,
  );
  assert.equal(result.match, "no-match");
  assert.equal(result.draftSourceLabel, GENERIC_LABEL_NO_MATCH);
  assert.equal(result.templateId, null);
  assert.ok(result.draft.includes("Ärge saatke paroole, isikuandmeid ega tegelike dokumentide sisu."));
});

test("empty template list returns the generic draft as a non-fatal result", () => {
  for (const list of [[], templates]) {
    const result = buildDraft(
      { requesterName: NAME, category: "Tundmatu kategooria", description: "Parool on vale.", tone: "SHORT" },
      list,
    );
    assert.equal(result.match, "no-templates");
    assert.equal(result.draftSourceLabel, GENERIC_LABEL_NO_TEMPLATES);
    assert.ok(result.draft.startsWith(`Tere, ${NAME}!`));
  }
});

test("generic draft promises no actions and invents no features", () => {
  for (const tone of TONES) {
    const { draft } = buildDraft({ requesterName: NAME, category: "Veateated", description: "Midagi muud.", tone }, []);
    assert.doesNotMatch(draft, /lähtest|avasime|andsime|parandasime|lahendasime|saatsime|uurisime|tööpäeva/i);
  }
});

test("tie-break uses lowest sortOrder and is independent of input order", () => {
  const tied: DraftTemplate[] = [
    { category: "Test", exampleIssue: "Aruanne ei avane", templateReply: "Vastus B.", sortOrder: 2 },
    { category: "Test", exampleIssue: "Aruanne ei avane kiiresti", templateReply: "Vastus A.", sortOrder: 1 },
    { category: "Test", exampleIssue: "Aruanne ei avane üldse", templateReply: "Vastus C.", sortOrder: 3 },
  ];
  const orders = [tied, [...tied].reverse(), [tied[2], tied[0], tied[1]]];
  for (const list of orders) {
    assert.equal(selectTemplate("Test", "Aruanne ei avane.", list)?.sortOrder, 1);
  }

  // Real CSV: "teksti" matches both Eelnõu koostamine templates equally.
  const shuffled = [...templates].reverse();
  const expected = "Teele eelnõu tekstiredaktoris tehtud muudatused ei salvestu.";
  assert.equal(selectTemplate("Eelnõu koostamine", "Probleem tekstiga.", templates)?.exampleIssue, expected);
  assert.equal(selectTemplate("Eelnõu koostamine", "Probleem tekstiga.", shuffled)?.exampleIssue, expected);
});

test("formal, friendly and short tones use the name and correct greeting and closing", () => {
  const base = { requesterName: `  ${NAME}  `, category: "Sisselogimine", description: "Parool on vale." };
  const formal = buildDraft({ ...base, tone: "FORMAL" }, templates).draft;
  const friendly = buildDraft({ ...base, tone: "FRIENDLY" }, templates).draft;
  const short = buildDraft({ ...base, tone: "SHORT" }, templates).draft;

  assert.ok(formal.startsWith(`Lugupeetud ${NAME}\n`));
  assert.ok(formal.endsWith("Lugupidamisega\nTeele kasutajatugi"));
  assert.ok(friendly.startsWith(`Tere, ${NAME}!\n`));
  assert.ok(friendly.endsWith("Heade soovidega\nTeele kasutajatugi"));
  assert.ok(short.startsWith(`Tere, ${NAME}!\n`));
  assert.ok(short.endsWith("\nTeele kasutajatugi"));
  assert.ok(short.length < friendly.length && short.length < formal.length);
});

test("every tone keeps every template's full text, including warnings", () => {
  for (const template of templates) {
    for (const tone of TONES) {
      const result = buildDraft(
        { requesterName: NAME, category: template.category, description: template.exampleIssue, tone },
        templates,
      );
      assert.equal(result.match, "template");
      assert.equal(result.draftSourceLabel, `${template.category}: ${template.exampleIssue}`);
      assert.ok(result.draft.includes(template.templateReply), `${tone}: ${template.exampleIssue}`);
    }
  }
});

// --- topic synonyms -------------------------------------------------------------

const START_PROCEEDING = "Kuidas alustada menetlust?";

test("Menetlused: starting and creating a proceeding select the start template, also with a typo", () => {
  for (const description of [
    "Kuidas alustada menetlust?",
    "Kuidas luua menetlust?",
    "Kuidas alustada meneltuse loomist?",
    "kuidas alustada meneltuse loomist",
    "Kuidas menetluse loomine käib?",
    "Kuidas ma loon uue menetluse?",
  ]) {
    assert.equal(issueFor("Menetlused", description), START_PROCEEDING, description);
  }
});

test("Menetlused: unrelated questions do not select the start template", () => {
  for (const description of [
    "Minu loodud menetlust ei ole nimekirjas.",
    "Kuidas luua aruannet?",
    "Kuidas menetlust kustutada?",
    "Menetluse dokument ei avane.",
    "Menetluse loomisel tekib viga.",
    "Ma ei saa menetlust luua.",
    "Menetluse loomine ei õnnestu.",
    "Ei saa menetlust alustada.",
    "Menetluse alustamisel tekib viga.",
    "Menetluse alustamine ei õnnestu.",
  ]) {
    assert.equal(issueFor("Menetlused", description), undefined, description);
  }
});

test("topic synonyms apply only in their own category", () => {
  for (const category of ["Kooskõlastamine", "Sisselogimine", "Istungid", "Veateated"]) {
    for (const description of ["Kuidas luua menetlust?", "kuidas alustada meneltuse loomist"]) {
      const result = buildDraft({ requesterName: NAME, category, description, tone: "FORMAL" }, templates);
      assert.equal(result.match, "no-match", `${category}: ${description}`);
    }
  }
  assert.equal(
    issueFor("Õigused", "Uue eelnõu loomise nupp puudub."),
    "Teele kasutaja ei saa uut eelnõu luua, sest loomise võimalus puudub.",
  );
});
