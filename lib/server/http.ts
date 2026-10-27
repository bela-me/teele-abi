import { NextResponse } from "next/server";
import type { ApiResult } from "../api/handlers";

export function respond(result: ApiResult): NextResponse {
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** Returns the parsed JSON body, or null when it is missing or malformed. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
