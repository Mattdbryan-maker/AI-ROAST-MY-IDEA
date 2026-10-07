import { getProvider } from "@/lib/ai";
import { handleAiRequest } from "@/lib/api-helpers";
import { RoastRequestSchema, RoastSchema } from "@/lib/types";

export const maxDuration = 120;

export async function POST(request: Request) {
  return handleAiRequest(request, RoastRequestSchema, async ({ idea }, signal) => {
    const roast = await getProvider().roast(idea, signal);
    // Final belt-and-braces check: never send the UI something it can't render.
    return RoastSchema.parse(roast);
  });
}
