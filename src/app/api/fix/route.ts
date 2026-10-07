import { getProvider } from "@/lib/ai";
import { handleAiRequest } from "@/lib/api-helpers";
import { FixRequestSchema, FixResultSchema } from "@/lib/types";

export const maxDuration = 120;

export async function POST(request: Request) {
  return handleAiRequest(request, FixRequestSchema, async ({ idea, roast }, signal) => {
    const fix = await getProvider().fix(idea, roast, signal);
    return FixResultSchema.parse(fix);
  });
}
