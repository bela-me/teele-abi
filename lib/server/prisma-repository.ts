import { Prisma, PrismaClient } from "@prisma/client";
import {
  RepositoryFailedError,
  RepositoryUnavailableError,
  type Repository,
  type SupportRequestRecord,
} from "../api/repository";

// One client per server process. Created lazily on the first query, so
// importing this module (e.g. during `next build`) never touches the database.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function db(): PrismaClient {
  globalForPrisma.prisma ??= new PrismaClient({ errorFormat: "minimal" });
  return globalForPrisma.prisma;
}

// Connection, timeout and pool errors: https://www.prisma.io/docs/orm/reference/error-reference
const UNAVAILABLE_CODES = new Set(["P1000", "P1001", "P1002", "P1003", "P1008", "P1011", "P1017", "P2024"]);

function isNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

/** Rethrows Prisma errors as repository errors that carry only a code. */
function translate(error: unknown): never {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    throw new RepositoryUnavailableError(error.errorCode ?? "init");
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (UNAVAILABLE_CODES.has(error.code)) throw new RepositoryUnavailableError(error.code);
    throw new RepositoryFailedError(error.code);
  }
  if (error instanceof Prisma.PrismaClientRustPanicError) throw new RepositoryUnavailableError("panic");
  throw new RepositoryFailedError(error instanceof Error ? error.name : "unknown");
}

async function run<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    translate(error);
  }
}

export const prismaRepository: Repository = {
  listRequests: () =>
    run(() => db().supportRequest.findMany({ orderBy: [{ updatedAt: "desc" }, { id: "asc" }] })),

  getRequest: (id) => run(() => db().supportRequest.findUnique({ where: { id } })),

  createRequest: (data) => run(() => db().supportRequest.create({ data })),

  updateRequest: (id, data) =>
    run(async (): Promise<SupportRequestRecord | null> => {
      try {
        return await db().supportRequest.update({ where: { id }, data });
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    }),

  deleteRequest: (id) =>
    run(async () => {
      try {
        await db().supportRequest.delete({ where: { id } });
        return true;
      } catch (error) {
        if (isNotFound(error)) return false;
        throw error;
      }
    }),

  listCategories: () =>
    run(async () => {
      const rows = await db().supportTemplate.findMany({ distinct: ["category"], select: { category: true } });
      return rows.map((row) => row.category);
    }),

  listTemplates: (category) =>
    run(() =>
      db().supportTemplate.findMany({
        where: { category },
        orderBy: [{ sortOrder: "asc" }, { exampleIssue: "asc" }],
      }),
    ),
};
