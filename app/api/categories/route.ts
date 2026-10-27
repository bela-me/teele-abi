import { listCategories } from "@/lib/api/handlers";
import { respond } from "@/lib/server/http";
import { prismaRepository } from "@/lib/server/prisma-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return respond(await listCategories(prismaRepository));
}
