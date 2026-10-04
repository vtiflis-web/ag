// აგრო AI: chat endpoint for the agromart.ge site widget.
// POST { session?: string, messages: [{role, content}], image?: {media_type, data} }
// → text/plain stream of the assistant's answer.
//
// Secrets (supabase secrets set ...): ANTHROPIC_API_KEY, ALLOWED_ORIGINS
// ("https://agromart.ge,https://www.agromart.ge"). Optional: AGRO_MODEL, AGRO_EFFORT.
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by Supabase and used for chat_logs.

import Anthropic from "npm:@anthropic-ai/sdk@0.131.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import { KNOWLEDGE, RULES } from "./prompt.ts";

const MODEL = Deno.env.get("AGRO_MODEL") ?? "claude-opus-5-5";
const EFFORT = (Deno.env.get("AGRO_EFFORT") ?? "low") as "low" | "medium" | "high";
const ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://agromart.ge,https://www.agromart.ge")
  .split(",").map((s) => s.trim()).filter(Boolean);

const MAX_TURNS = 16;
const MAX_CHARS = 2000;
const MAX_IMAGE_B64 = 2_000_000; // ≈1.5 MB; the widget sends ≤1024 px JPEG
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

// Best-effort per-isolate limit; chat_logs gives the durable picture.
const RATE = { windowMs: 10 * 60_000, max: 30 };
const hits = new Map<string, number[]>();

const anthropic = new Anthropic();
const db = Deno.env.get("SUPABASE_URL") && Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  ? createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
  : null;

function cors(origin: string | null): Record<string, string> {
  const allow = origin && ORIGINS.includes(origin) ? origin : ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
    "Vary": "Origin",
  };
}

function limited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < RATE.windowMs);
  list.push(now);
  hits.set(ip, list);
  return list.length > RATE.max;
}

type Turn = { role: "user" | "assistant"; content: string };
type Body = { session?: unknown; messages?: unknown; image?: unknown };

function parse(body: Body): { session: string; turns: Turn[]; image: { media_type: ImageType; data: string } | null } | string {
  if (!Array.isArray(body.messages) || body.messages.length === 0) return "messages required";
  const turns = body.messages.slice(-MAX_TURNS) as unknown[];
  const out: Turn[] = [];
  for (const t of turns) {
    const r = (t as Turn)?.role, c = (t as Turn)?.content;
    if ((r !== "user" && r !== "assistant") || typeof c !== "string" || !c.trim()) return "bad turn";
    out.push({ role: r, content: c.slice(0, MAX_CHARS) });
  }
  while (out.length && out[0].role !== "user") out.shift();
  if (!out.length || out[out.length - 1].role !== "user") return "last turn must be user";
  let image = null;
  if (body.image) {
    const im = body.image as { media_type?: string; data?: string };
    if (!IMAGE_TYPES.includes(im.media_type as ImageType) || typeof im.data !== "string" || im.data.length > MAX_IMAGE_B64) {
      return "bad image";
    }
    image = { media_type: im.media_type as ImageType, data: im.data };
  }
  const session = typeof body.session === "string" ? body.session.slice(0, 64) : "";
  return { session, turns: out, image };
}

function toMessages(turns: Turn[], image: { media_type: ImageType; data: string } | null): Anthropic.Beta.BetaMessageParam[] {
  // Merge consecutive same-role turns (a failed reply can leave two user turns in a row).
  const merged: Turn[] = [];
  for (const t of turns) {
    const last = merged[merged.length - 1];
    if (last && last.role === t.role) last.content += "\n\n" + t.content;
    else merged.push({ ...t });
  }
  return merged.map((t, i) => {
    if (i === merged.length - 1 && image) {
      return {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: image.media_type, data: image.data } },
          { type: "text", text: t.content },
        ],
      };
    }
    return { role: t.role, content: t.content };
  });
}

const FALLBACK_TEXT =
  "ამ კითხვაზე ახლა ვერ გიპასუხებთ. მოგვწერეთ Viber-ში და კონსულტანტი დაგეხმარებათ.\n[[viber]]";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers });
  if (origin && !ORIGINS.includes(origin)) return new Response("forbidden", { status: 403, headers });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (limited(ip)) return new Response("rate limited", { status: 429, headers });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400, headers });
  }
  const p = parse(body);
  if (typeof p === "string") return new Response(p, { status: 400, headers });

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(ctl) {
      let answer = "";
      let usage: unknown = null;
      let stop: string | null = null;
      try {
        const s = anthropic.beta.messages.stream({
          model: MODEL,
          max_tokens: 4096,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          thinking: { type: "adaptive" },
          output_config: { effort: EFFORT },
          system: [
            { type: "text", text: RULES },
            { type: "text", text: KNOWLEDGE, cache_control: { type: "ephemeral" } },
          ],
          messages: toMessages(p.turns, p.image),
        });
        for await (const ev of s) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            answer += ev.delta.text;
            ctl.enqueue(enc.encode(ev.delta.text));
          }
        }
        const final = await s.finalMessage();
        stop = final.stop_reason;
        usage = final.usage;
        if (stop === "refusal" || !answer.trim()) {
          // A refusal mid-stream may leave a partial answer on screen; the widget
          // replaces the bubble with whatever follows the \u001e marker.
          const tail = (answer ? "\n\u001e" : "") + FALLBACK_TEXT;
          answer = FALLBACK_TEXT;
          ctl.enqueue(enc.encode(tail));
        }
      } catch (err) {
        const msg = err instanceof Anthropic.RateLimitError
          ? "ახლა ბევრი კითხვაა. სცადეთ ერთ წუთში."
          : "ტექნიკური შეფერხებაა. სცადეთ თავიდან ან მოგვწერეთ Viber-ში.\n[[viber]]";
        console.error("agro-chat", err instanceof Anthropic.APIError ? `${err.status ?? "network"} ${err.message}` : err);
        ctl.enqueue(enc.encode((answer ? "\n\u001e" : "") + msg));
        stop = "error";
      }
      if (db) {
        const last = p.turns[p.turns.length - 1].content;
        await db.from("chat_logs").insert({
          session_id: p.session || null,
          question: last,
          has_image: !!p.image,
          answer,
          model: MODEL,
          stop_reason: stop,
          usage,
        }).then(({ error }) => error && console.error("chat_logs", error.message));
      }
      ctl.close();
    },
  });

  return new Response(stream, {
    headers: { ...headers, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
});
