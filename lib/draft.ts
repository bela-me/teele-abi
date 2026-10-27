/**
 * Deterministic, template-based draft generation. No database, network or AI.
 *
 * Matching (only templates of the chosen category are considered):
 * 1. Text is lower-cased, punctuation is removed and it is split into words.
 *    Words shorter than 3 characters, Estonian filler words (STOP_WORDS) and
 *    the generic words "Teele" and "kasutaja" (STOP_STEMS) are ignored, as are
 *    the words of the category name itself, since every template shares them.
 * 2. Each remaining word is reduced to a crude stem: its first 5 characters.
 *    This lets inflected forms match ("parooli" ~ "parool", "salvestamisel" ~
 *    "salvestu").
 * 3. issueHits = description stems found in the template's exampleIssue.
 *    replyHits = description stems found only in the templateReply.
 *    score = 2 * issueHits + replyHits.
 * 4. Threshold: a template is eligible only if issueHits >= 1, i.e. the
 *    description shares at least one meaningful keyword with the example issue.
 *    Reply-only overlap can rank eligible templates but never selects one alone.
 * 5. Tie-break: highest score, then lowest sortOrder (CSV row order), then
 *    exampleIssue in Estonian collation order.
 * 6. No eligible template, or no templates in the category: a cautious generic
 *    draft that only asks for details and promises nothing.
 */

export type Tone = "FORMAL" | "FRIENDLY" | "SHORT";

export type DraftTemplate = {
  id?: string;
  category: string;
  exampleIssue: string;
  templateReply: string;
  sortOrder: number;
};

export type DraftInput = {
  requesterName: string;
  category: string;
  description: string;
  tone: Tone;
};

export type DraftMatch = "template" | "no-match" | "no-templates";

export type DraftResult = {
  draft: string;
  draftSourceLabel: string;
  match: DraftMatch;
  templateId: string | null;
};

const STEM_LENGTH = 5;
const MIN_WORD_LENGTH = 3;
const MIN_ISSUE_HITS = 1;

const STOP_STEMS = new Set(["teele", "kasut"]);

const STOP_WORDS = new Set([
  "aga", "ainult", "aitäh", "alati", "eile", "ega", "enam", "hetkel", "juba",
  "kas", "kohta", "kuid", "kuidas", "kus", "meie", "meil", "miks", "millal",
  "mida", "mina", "mingi", "mingit", "minu", "mis", "mitte", "mul", "mulle",
  "nad", "nende", "ning", "nii", "nüüd", "oli", "olen", "olnud", "oma", "ole",
  "palun", "pole", "praegu", "saa", "saan", "saaks", "seal", "sest", "siin",
  "siis", "seda", "see", "selle", "soovin", "tahan", "tema", "teie", "teil",
  "tere", "tänan", "täna", "uus", "uut", "vaja", "veel", "või", "väga", "üks",
]);

export const GENERIC_LABEL_NO_MATCH = "Üldmustand – sobivat malli ei leitud";
export const GENERIC_LABEL_NO_TEMPLATES = "Üldmustand – kategoorias puuduvad mallid";

const SIGNATURE = "Teele kasutajatugi";

function words(text: string): string[] {
  return text
    .toLocaleLowerCase("et")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((word) => word.length >= MIN_WORD_LENGTH && !STOP_WORDS.has(word));
}

export function keywordStems(text: string, ignore: ReadonlySet<string> = new Set()): Set<string> {
  const stems = new Set<string>();
  for (const word of words(text)) {
    const stem = word.slice(0, STEM_LENGTH);
    if (!STOP_STEMS.has(stem) && !ignore.has(stem)) stems.add(stem);
  }
  return stems;
}

function countShared(a: Set<string>, b: Set<string>, exclude?: Set<string>): number {
  let count = 0;
  for (const stem of a) {
    if (b.has(stem) && !exclude?.has(stem)) count++;
  }
  return count;
}

export type ScoredTemplate = {
  template: DraftTemplate;
  issueHits: number;
  replyHits: number;
  score: number;
};

/** Scores every template of the category; eligible ones first, best first. */
export function rankTemplates(
  category: string,
  description: string,
  templates: readonly DraftTemplate[],
): ScoredTemplate[] {
  const categoryStems = keywordStems(category);
  const descriptionStems = keywordStems(description, categoryStems);

  return templates
    .filter((template) => template.category === category)
    .map((template) => {
      const issueStems = keywordStems(template.exampleIssue, categoryStems);
      const replyStems = keywordStems(template.templateReply, categoryStems);
      const issueHits = countShared(descriptionStems, issueStems);
      const replyHits = countShared(descriptionStems, replyStems, issueStems);
      return { template, issueHits, replyHits, score: 2 * issueHits + replyHits };
    })
    .sort(
      (a, b) =>
        Number(b.issueHits >= MIN_ISSUE_HITS) - Number(a.issueHits >= MIN_ISSUE_HITS) ||
        b.score - a.score ||
        a.template.sortOrder - b.template.sortOrder ||
        a.template.exampleIssue.localeCompare(b.template.exampleIssue, "et"),
    );
}

export function selectTemplate(
  category: string,
  description: string,
  templates: readonly DraftTemplate[],
): DraftTemplate | null {
  const best = rankTemplates(category, description, templates)[0];
  return best && best.issueHits >= MIN_ISSUE_HITS ? best.template : null;
}

function genericBody(category: string): string {
  return (
    `Teie pöördumine kategoorias „${category}” vajab enne edasist käsitlemist täpsustamist. ` +
    "Palun kirjeldage, millise toimingu juures olukord tekkis, millist teadet või käitumist nägite ning millal see juhtus. " +
    "Ärge saatke paroole, isikuandmeid ega tegelike dokumentide sisu."
  );
}

function applyTone(tone: Tone, name: string, body: string): string {
  switch (tone) {
    case "FORMAL":
      return [
        `Lugupeetud ${name}`,
        `Täname pöördumise eest. ${body}`,
        "Lisaküsimuste korral palun pöörduge uuesti kasutajatoe poole.",
        `Lugupidamisega\n${SIGNATURE}`,
      ].join("\n\n");
    case "FRIENDLY":
      return [
        `Tere, ${name}!`,
        `Aitäh, et meiega ühendust võtsite. ${body}`,
        "Kui tekib veel küsimusi, andke julgelt teada.",
        `Heade soovidega\n${SIGNATURE}`,
      ].join("\n\n");
    case "SHORT":
      // Short only drops the pleasantries; the template body is kept whole so
      // that no instruction or warning is lost.
      return [`Tere, ${name}!`, body, SIGNATURE].join("\n\n");
  }
}

export function buildDraft(input: DraftInput, templates: readonly DraftTemplate[]): DraftResult {
  const name = input.requesterName.trim().replace(/\s+/g, " ");
  const category = input.category.trim();
  const inCategory = templates.filter((template) => template.category === category);
  const template = selectTemplate(category, input.description, inCategory);

  if (template) {
    return {
      draft: applyTone(input.tone, name, template.templateReply.trim()),
      draftSourceLabel: `${template.category}: ${template.exampleIssue}`,
      match: "template",
      templateId: template.id ?? null,
    };
  }

  const match: DraftMatch = inCategory.length === 0 ? "no-templates" : "no-match";
  return {
    draft: applyTone(input.tone, name, genericBody(category)),
    draftSourceLabel: match === "no-templates" ? GENERIC_LABEL_NO_TEMPLATES : GENERIC_LABEL_NO_MATCH,
    match,
    templateId: null,
  };
}
