import { deleteRequest, getRequest, updateRequest } from "@/lib/api/handlers";
import { readJson, respond } from "@/lib/server/http";
import { prismaRepository } from "@/lib/server/prisma-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  return respond(await getRequest(prismaRepository, id));
}

export async function PUT(request: Request, { params }: Context) {
  const { id } = await params;
  return respond(await updateRequest(prismaRepository, id, await readJson(request)));
}

export async function DELETE(_request: Request, { params }: Context) {
  const { id } = await params;
  return respond(await deleteRequest(prismaRepository, id));
}
