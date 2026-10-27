import { generateDraft } from "@/lib/api/handlers";
import { readJson, respond } from "@/lib/server/http";
import { prismaRepository } from "@/lib/server/prisma-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Short pause so the "Koostan mustandit..." loading state is visible; no external calls.
const SIMULATED_DELAY_MS = 1000;

export async function POST(request: Request) {
  const body = await readJson(request);
  await new Promise((resolve) => setTimeout(resolve, SIMULATED_DELAY_MS));
  return respond(await generateDraft(prismaRepository, body));
}
