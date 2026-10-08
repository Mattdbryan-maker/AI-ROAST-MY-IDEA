/**
 * A stand-in Ollama server that speaks the real /api/chat protocol (NDJSON
 * streaming, `format`, `think`, `message.thinking`, `done_reason`, usage
 * counters) but generates its answers from the offline demo engine.
 *
 * It exists to test the Ollama integration end to end without a GPU or a
 * multi-gigabyte model, and to simulate slow or broken models. It is NOT AI:
 * its model is called "mock-qwen" so nothing it says is mistaken for a real run.
 *
 *   npm run mock:ollama -- --port 11500 --cps 120 --first-token-ms 1500
 *   AI_PROVIDER=ollama OLLAMA_HOST=127.0.0.1:11500 OLLAMA_MODEL=mock-qwen npm run dev
 */
import { createServer, type Server } from "node:http";
import { demoFix, demoRoast, demoRoastJson } from "../src/lib/ai/demo/engine";
import { PERSONAS, PERSONA_ORDER } from "../src/lib/personas";

export interface MockOllamaOptions {
  port?: number;
  models?: string[];
  /** Output speed in characters per second (≈ 4 characters per token). 0 = as fast as possible. */
  cps?: number;
  /** Delay before the first chunk: simulates prompt processing / model load. */
  firstTokenMs?: number;
  /** Stream reasoning in `message.thinking` first when the request enables thinking. */
  thinkingChars?: number;
  /** Leak `<think>…</think>` into `message.content` (an old-runtime bug the client must survive). */
  leakThinkTags?: boolean;
  /** Reject requests that send `think` (an older server / model without a thinking switch). */
  rejectThink?: boolean;
  /** Fail mid-stream after this many characters: "cut" drops the connection, "error" sends an error line. */
  failAfterChars?: number;
  failMode?: "cut" | "error";
  /** Stop sending (without closing) after this many characters. */
  stallAfterChars?: number;
  /** Return content that isn't valid JSON. */
  malformed?: boolean;
  /** Finish with done_reason "length" (the model hit its output cap). */
  truncate?: boolean;
}

export interface MockOllama {
  url: string;
  port: number;
  requests: { path: string; body: Record<string, unknown> }[];
  /** Chat responses currently streaming (connection still open). */
  activeStreams(): number;
  close(): Promise<void>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function pitchFrom(text: string): string {
  return text.match(/<(?:pitch|original_pitch)>\s*([\s\S]*?)\s*<\/(?:pitch|original_pitch)>/)?.[1] ?? text;
}

/** Works out what kind of answer the request wants and produces it from the demo engine. */
function answerFor(body: Record<string, unknown>): string {
  const messages = (body.messages as { role: string; content: string }[]) ?? [];
  const user = messages.find((m) => m.role === "user")?.content ?? "";
  const idea = pitchFrom(user);
  const format = body.format as { properties?: Record<string, unknown> } | undefined;
  const props = format?.properties ?? {};

  if ("changes" in props) {
    const roast = demoRoast(idea);
    const { title, tagline, pitch, changes, firstSteps, projectedScores } = demoFix(idea, roast);
    return JSON.stringify({ title, tagline, pitch, changes, firstSteps, projectedScores });
  }
  if ("takes" in props) {
    const full = JSON.parse(demoRoastJson(idea)) as Record<string, unknown>;
    if (!("debate" in props)) delete full.debate;
    return JSON.stringify(full);
  }
  // A plain-text debate turn: answer as the speaker named in the request.
  const speakerName = user.match(/You are (STERLING|KERNEL|HYPE|WALLET)/)?.[1];
  const speaker = PERSONA_ORDER.find((id) => PERSONAS[id].name === speakerName) ?? "investor";
  const line = demoRoast(idea).debate.find((d) => d.speaker === speaker)?.line;
  return line ?? `${PERSONAS[speaker].name} has heard enough and wants to see the numbers.`;
}

export function startMockOllama(options: MockOllamaOptions = {}): Promise<MockOllama> {
  const models = options.models ?? ["mock-qwen", "mock-qwen:latest"];
  const requests: MockOllama["requests"] = [];
  let active = 0;
  const known = (name: unknown) => typeof name === "string" && models.includes(name);

  const server: Server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    let body: Record<string, unknown> = {};
    try {
      body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "invalid JSON" }));
      return;
    }
    requests.push({ path: req.url ?? "", body });
    const json = (status: number, data: unknown) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(data));

    if (req.url === "/api/version") return json(200, { version: "0.0.0-mock" });
    if (req.url === "/api/tags") return json(200, { models: models.map((name) => ({ name, model: name, details: { family: "mock", parameter_size: "0B" } })) });
    if (req.url === "/api/ps") return json(200, { models: [] });
    if (req.url === "/api/show") {
      if (!known(body.model)) return json(404, { error: `model '${String(body.model)}' not found` });
      return json(200, { details: { family: "mock", parameter_size: "0B", quantization_level: "none" }, capabilities: ["completion", "thinking"] });
    }
    if (req.url !== "/api/chat") return json(404, { error: "not found" });

    if (!known(body.model)) return json(404, { error: `model '${String(body.model)}' not found, try pulling it first` });
    if (options.rejectThink && "think" in body) return json(400, { error: `"${String(body.model)}" does not support thinking` });

    let content = options.malformed ? "Sure! Here is the roast you asked for:\n{ not json at all" : answerFor(body);
    if (options.leakThinkTags) content = `<think>Let me consider the pitch carefully first.</think>${content}`;
    const thinking = body.think && body.think !== false ? "Weighing the market, the build and the customer. ".repeat(Math.ceil((options.thinkingChars ?? 0) / 50)).slice(0, options.thinkingChars ?? 0) : "";

    if (body.stream === false) {
      await sleep(options.firstTokenMs ?? 0);
      return json(200, { model: body.model, message: { role: "assistant", content, thinking }, done: true, done_reason: "stop", eval_count: Math.ceil(content.length / 4) });
    }

    res.writeHead(200, { "Content-Type": "application/x-ndjson" });
    active++;
    res.on("close", () => active--);
    const write = (data: unknown) => res.write(`${JSON.stringify(data)}\n`);
    const cps = options.cps ?? 400;
    let closed = false;
    req.on("close", () => (closed = true));
    res.on("close", () => (closed = true));

    await sleep(options.firstTokenMs ?? 0);
    const started = Date.now();
    for (let i = 0; i < thinking.length && !closed; i += 12) {
      write({ model: body.model, message: { role: "assistant", content: "", thinking: thinking.slice(i, i + 12) }, done: false });
      if (cps) await sleep((12 / cps) * 1000);
    }
    let sent = 0;
    while (sent < content.length && !closed) {
      if (options.failAfterChars !== undefined && sent >= options.failAfterChars) {
        if (options.failMode === "error") {
          write({ error: "an error was encountered while running the model: unexpected EOF" });
          res.end();
        } else {
          res.destroy();
        }
        return;
      }
      if (options.stallAfterChars !== undefined && sent >= options.stallAfterChars) {
        // Hang without closing until the client gives up.
        await new Promise<void>((r) => req.on("close", () => r()));
        return;
      }
      const size = 4 + Math.floor(Math.random() * 8);
      const piece = content.slice(sent, sent + size);
      sent += piece.length;
      write({ model: body.model, message: { role: "assistant", content: piece }, done: false });
      if (cps) await sleep((piece.length / cps) * 1000);
    }
    if (closed) return;
    const elapsedNs = (Date.now() - started) * 1e6;
    write({
      model: body.model,
      message: { role: "assistant", content: "" },
      done: true,
      done_reason: options.truncate ? "length" : "stop",
      total_duration: elapsedNs,
      load_duration: 0,
      prompt_eval_count: Math.ceil(JSON.stringify(body.messages).length / 4),
      prompt_eval_duration: 0,
      eval_count: Math.ceil(content.length / 4),
      eval_duration: elapsedNs,
    });
    res.end();
  });

  return new Promise((resolve) => {
    server.listen(options.port ?? 0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        port,
        requests,
        activeStreams: () => active,
        close: () =>
          new Promise<void>((r) => {
            server.closeAllConnections();
            server.close(() => r());
          }),
      });
    });
  });
}

// CLI: `tsx scripts/mock-ollama.ts --port 11500 --cps 120 --first-token-ms 1500`
if (process.argv[1]?.endsWith("mock-ollama.ts")) {
  const arg = (name: string) => {
    const i = process.argv.indexOf(`--${name}`);
    return i === -1 ? undefined : process.argv[i + 1];
  };
  const options: MockOllamaOptions = {
    port: Number(arg("port") ?? 11500),
    cps: arg("cps") !== undefined ? Number(arg("cps")) : 250,
    firstTokenMs: Number(arg("first-token-ms") ?? 600),
    thinkingChars: Number(arg("thinking-chars") ?? 0),
  };
  void startMockOllama(options).then((m) =>
    console.log(`Mock Ollama (NOT a real model) listening on ${m.url} — use OLLAMA_MODEL=mock-qwen. ${options.cps} chars/s, first token after ${options.firstTokenMs}ms.`),
  );
}
