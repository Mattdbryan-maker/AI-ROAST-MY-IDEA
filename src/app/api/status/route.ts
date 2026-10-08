import { connection } from "next/server";
import { publicStatus } from "@/lib/ai";

/** Tells the UI whether it's talking to a live model or the demo panel. Never exposes keys or hosts. */
export async function GET() {
  await connection();
  return Response.json(publicStatus(), { headers: { "Cache-Control": "no-store" } });
}
