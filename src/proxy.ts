import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { BETA_COOKIE, loadAccessConfig, verifyToken } from "@/lib/shared/access";

/**
 * Protected-beta invite gate, enforced on the server before any page or API
 * route runs. Off unless BETA_ACCESS_CODES is set. The AI routes check the same
 * cookie again themselves (api-helpers.ts), so a mistake in this matcher cannot
 * expose the paid endpoints.
 */
const OPEN = new Set(["/beta", "/api/beta/enter", "/api/status", "/privacy", "/terms", "/contact"]);

export async function proxy(request: NextRequest) {
  const access = loadAccessConfig();
  if (!access.gateEnabled) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (OPEN.has(pathname)) return NextResponse.next();
  const isApi = pathname.startsWith("/api/");

  if (access.misconfigured) {
    return isApi
      ? NextResponse.json({ error: { code: "unavailable", message: "The beta gate is misconfigured." } }, { status: 503 })
      : new NextResponse("The beta gate is misconfigured on this server.", { status: 503 });
  }

  if (await verifyToken("beta", request.cookies.get(BETA_COOKIE)?.value, access.signingSecret)) return NextResponse.next();

  if (isApi) return NextResponse.json({ error: { code: "unauthorized", message: "This beta is invite-only." } }, { status: 401 });
  const url = request.nextUrl.clone();
  url.pathname = "/beta";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next's static assets and the icon.
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
