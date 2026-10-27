import { parse } from "csv-parse/sync";

export type TemplateRow = {
  category: string;
  exampleIssue: string;
  templateReply: string;
  sortOrder: number;
};

const REQUIRED_COLUMNS = ["category", "example_issue", "template_reply"] as const;

/**
 * Parses support_templates.csv (UTF-8, optional BOM, quoted fields, CRLF or LF).
 * Throws if a required column or value is missing, or if a
 * (category, example_issue) pair appears twice.
 */
export function parseTemplatesCsv(content: string): TemplateRow[] {
  const records: Record<string, string>[] = parse(content, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const header = records.length > 0 ? Object.keys(records[0]) : [];
  const missing = REQUIRED_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    throw new Error(`CSV is missing required columns: ${missing.join(", ")}`);
  }

  const seen = new Set<string>();
  return records.map((record, index) => {
    const line = index + 2; // header is line 1
    const row: TemplateRow = {
      category: record.category,
      exampleIssue: record.example_issue,
      templateReply: record.template_reply,
      sortOrder: index,
    };
    if (!row.category || !row.exampleIssue || !row.templateReply) {
      throw new Error(`CSV line ${line}: category, example_issue and template_reply are required`);
    }
    const key = `${row.category}\u0000${row.exampleIssue}`;
    if (seen.has(key)) {
      throw new Error(`CSV line ${line}: duplicate (category, example_issue) pair`);
    }
    seen.add(key);
    return row;
  });
}
