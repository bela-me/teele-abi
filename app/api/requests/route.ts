import { createRequest, listRequests } from "@/lib/api/handlers";
import { readJson, respond } from "@/lib/server/http";
import { prismaRepository } from "@/lib/server/prisma-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return respond(await listRequests(prismaRepository));
}

export async function POST(request: Request) {
  return respond(await createRequest(prismaRepository, await readJson(request)));
}
