import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { PERSONAS, PERSONA_ORDER } from "@/lib/personas";
import { VERDICT_COPY } from "@/lib/scoring";
import { decodeShare, type SharePayload } from "@/lib/share";

/**
 * Renders the shareable verdict card as a PNG.
 *   /api/card?d=<share payload>&f=story   1080×1350 (Instagram/TikTok friendly)
 *   /api/card?d=<share payload>&f=og      1200×630  (link previews)
 */

const FONT_DIR = join(process.cwd(), "src/assets/fonts");
let fontsPromise: Promise<{ name: string; data: Buffer; weight: 400 | 500 | 700; style: "normal" }[]> | null = null;

function loadFonts() {
  fontsPromise ??= Promise.all([
    readFile(join(FONT_DIR, "anton-400.woff")).then((data) => ({ name: "Anton", data, weight: 400 as const, style: "normal" as const })),
    readFile(join(FONT_DIR, "space-grotesk-500.woff")).then((data) => ({ name: "Grotesk", data, weight: 500 as const, style: "normal" as const })),
    readFile(join(FONT_DIR, "space-grotesk-700.woff")).then((data) => ({ name: "Grotesk", data, weight: 700 as const, style: "normal" as const })),
    readFile(join(FONT_DIR, "jetbrains-mono-500.woff")).then((data) => ({ name: "Mono", data, weight: 500 as const, style: "normal" as const })),
  ]);
  return fontsPromise;
}

type Payload = SharePayload & { d: NonNullable<SharePayload["d"]> };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const payload = decodeShare(url.searchParams.get("d"));
  if (!payload) return new Response("Invalid share payload", { status: 400 });

  const format = url.searchParams.get("f") === "og" ? "og" : "story";
  const host = (process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL).host : url.host).replace(/^www\./, "");
  const size = format === "og" ? { width: 1200, height: 630 } : { width: 1080, height: 1350 };

  return new ImageResponse(format === "og" ? <OgCard p={payload} host={host} /> : <StoryCard p={payload} host={host} />, {
    ...size,
    fonts: await loadFonts(),
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  });
}

function Background({ rgb }: { rgb: string }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        backgroundColor: "#050507",
        backgroundImage: `radial-gradient(ellipse 80% 55% at 50% 0%, rgb(${rgb} / 0.35), transparent 70%), radial-gradient(ellipse 70% 40% at 50% 110%, rgb(${rgb} / 0.18), transparent 70%)`,
      }}
    />
  );
}

function Stamp({ p, fontSize }: { p: Payload; fontSize: number }) {
  const v = VERDICT_COPY[p.d];
  return (
    <div
      style={{
        display: "flex",
        border: `${Math.round(fontSize / 16)}px solid ${v.color}`,
        borderRadius: 18,
        padding: `0 ${Math.round(fontSize / 4)}px`,
        color: v.color,
        fontFamily: "Anton",
        fontSize,
        lineHeight: 1.15,
        transform: "rotate(-4deg)",
        background: `rgb(${v.rgb} / 0.1)`,
        boxShadow: `0 0 60px rgb(${v.rgb} / 0.45)`,
      }}
    >
      {v.label}
    </div>
  );
}

function Bars({ p, nameSize, gap }: { p: Payload; nameSize: number; gap: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap, width: "100%" }}>
      {PERSONA_ORDER.map((id, i) => {
        const persona = PERSONAS[id];
        return (
          <div key={id} style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ display: "flex", width: nameSize * 4.6, fontFamily: "Anton", fontSize: nameSize, color: persona.color, letterSpacing: 1 }}>
              {persona.name}
            </div>
            <div style={{ display: "flex", flex: 1, height: nameSize / 3, borderRadius: 99, background: "rgba(255,255,255,0.08)" }}>
              <div style={{ display: "flex", width: `${p.p[i]}%`, height: "100%", borderRadius: 99, background: persona.color }} />
            </div>
            <div style={{ display: "flex", width: nameSize * 1.8, justifyContent: "flex-end", fontFamily: "Anton", fontSize: nameSize, color: "#f2efe8" }}>
              {p.p[i]}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StoryCard({ p, host }: { p: Payload; host: string }) {
  const v = VERDICT_COPY[p.d];
  const quoted = PERSONAS[p.w];
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: 72, backgroundColor: "#050507", color: "#f2efe8", fontFamily: "Grotesk", position: "relative" }}>
      <Background rgb={v.rgb} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", fontFamily: "Anton", fontSize: 40, letterSpacing: 1 }}>
          AI ROAST&nbsp;<span style={{ color: v.color }}>MY IDEA</span>
        </div>
        <div style={{ display: "flex", fontFamily: "Mono", fontSize: 22, letterSpacing: 6, color: "#8b8b9a" }}>THE VERDICT</div>
      </div>

      <div style={{ display: "flex", marginTop: 64, fontFamily: "Anton", fontSize: p.t.length > 28 ? 76 : 96, lineHeight: 1, textTransform: "uppercase" }}>
        {p.t}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 40 }}>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <div style={{ display: "flex", fontFamily: "Anton", fontSize: 300, lineHeight: 0.9, color: v.color, textShadow: `0 0 80px rgb(${v.rgb} / 0.6)` }}>
            {String(p.s)}
          </div>
          <div style={{ display: "flex", fontFamily: "Mono", fontSize: 40, color: "#8b8b9a", marginLeft: 12, marginBottom: 28 }}>/100</div>
        </div>
        <Stamp p={p} fontSize={110} />
      </div>

      <div style={{ display: "flex", marginTop: 56, width: "100%" }}>
        <Bars p={p} nameSize={34} gap={22} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 56, paddingLeft: 28, borderLeft: `6px solid ${quoted.color}` }}>
        <div style={{ display: "flex", fontSize: 38, fontWeight: 700, lineHeight: 1.2 }}>“{p.q}”</div>
        <div style={{ display: "flex", marginTop: 14, fontFamily: "Mono", fontSize: 22, letterSpacing: 3, color: quoted.color }}>
          — {quoted.name}, {quoted.role.toUpperCase()}
        </div>
      </div>

      <div style={{ display: "flex", flex: 1 }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "Mono", fontSize: 22, color: "#8b8b9a", letterSpacing: 2 }}>
        <span>Think yours is better?</span>
        <span style={{ color: "#f2efe8" }}>{host}</span>
      </div>
    </div>
  );
}

function OgCard({ p, host }: { p: Payload; host: string }) {
  const v = VERDICT_COPY[p.d];
  const quoted = PERSONAS[p.w];
  return (
    <div style={{ display: "flex", width: "100%", height: "100%", padding: 56, backgroundColor: "#050507", color: "#f2efe8", fontFamily: "Grotesk", position: "relative" }}>
      <Background rgb={v.rgb} />
      <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingRight: 40 }}>
        <div style={{ display: "flex", fontFamily: "Anton", fontSize: 30 }}>
          AI ROAST&nbsp;<span style={{ color: v.color }}>MY IDEA</span>
        </div>
        <div style={{ display: "flex", marginTop: 28, fontFamily: "Anton", fontSize: p.t.length > 28 ? 60 : 74, lineHeight: 1, textTransform: "uppercase" }}>
          {p.t}
        </div>
        <div style={{ display: "flex", marginTop: 28, fontSize: 28, fontWeight: 700, lineHeight: 1.25 }}>“{p.q}”</div>
        <div style={{ display: "flex", marginTop: 10, fontFamily: "Mono", fontSize: 18, letterSpacing: 2, color: quoted.color }}>— {quoted.name}</div>
        <div style={{ display: "flex", flex: 1 }} />
        <div style={{ display: "flex", fontFamily: "Mono", fontSize: 20, color: "#8b8b9a" }}>Put your idea on trial → {host}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 380 }}>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <div style={{ display: "flex", fontFamily: "Anton", fontSize: 220, lineHeight: 0.9, color: v.color }}>{String(p.s)}</div>
          <div style={{ display: "flex", fontFamily: "Mono", fontSize: 30, color: "#8b8b9a", marginBottom: 20, marginLeft: 6 }}>/100</div>
        </div>
        <div style={{ display: "flex", marginTop: 30 }}>
          <Stamp p={p} fontSize={78} />
        </div>
      </div>
    </div>
  );
}
