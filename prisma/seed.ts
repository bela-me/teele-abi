import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { parseTemplatesCsv } from "../lib/templates-csv";

// Idempotent: upserts templates by (category, exampleIssue).
// Never touches SupportRequest rows and never deletes templates.
const CSV_PATH = path.join(__dirname, "..", "data", "support_templates.csv");

const prisma = new PrismaClient();

async function main() {
  const rows = parseTemplatesCsv(readFileSync(CSV_PATH, "utf8"));

  await prisma.$transaction(
    rows.map((row) =>
      prisma.supportTemplate.upsert({
        where: {
          category_exampleIssue: {
            category: row.category,
            exampleIssue: row.exampleIssue,
          },
        },
        update: { templateReply: row.templateReply, sortOrder: row.sortOrder },
        create: row,
      }),
    ),
  );

  const categories = new Set(rows.map((row) => row.category));
  console.log(`Seed: ${rows.length} templates upserted across ${categories.size} categories.`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
