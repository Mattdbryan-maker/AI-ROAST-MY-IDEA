import { connection } from "next/server";
import { errorResponse } from "@/lib/api-helpers";
import { safeEqual } from "@/lib/shared/access";
import { readStats } from "@/lib/shared/stats";
import { getStore } from "@/lib/shared/store";

/**
 * Operator-only aggregate counters (requests, failures, turned-away requests, tokens, estimated cost).
 * Needs `Authorization: Bearer <ADMIN_STATS_TOKEN>`. With no token configured the route does not exist.
 */
export async function GET(request: Request) {
  await connection();
  const token = process.env.ADMIN_STATS_TOKEN?.trim();
  if (!token || token.length < 24) return new Response("Not found", { status: 404 });
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!safeEqual(given, token)) return errorResponse("unauthorized", "Unauthorized.");
  const days = Number(new URL(request.url).searchParams.get("days") ?? "7");
  try {
    const stats = await readStats(Number.isFinite(days) ? days : 7, getStore());
    return Response.json({ store: getStore().kind, ...stats }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return errorResponse("unavailable", "The counter store is unreachable.");
  }
}
