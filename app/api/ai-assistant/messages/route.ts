import { sendAiMessageAction } from "@/components/ai-assistant/actions";

export const runtime = "nodejs";

const encoder = new TextEncoder();

function event(value: unknown) {
  return encoder.encode(`${JSON.stringify(value)}\n`);
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return new Response("Unsupported content type", { status: 415 });

  const raw = await request.text();
  if (raw.length > 5_000) return new Response("Request too large", { status: 413 });
  let input: unknown;
  try { input = JSON.parse(raw); } catch { return new Response("Invalid JSON", { status: 400 }); }
  if (!input || typeof input !== "object" || Array.isArray(input)) return new Response("Invalid request", { status: 400 });
  const row = input as Record<string, unknown>;
  if ((row.conversationId !== null && typeof row.conversationId !== "string") || typeof row.message !== "string" || (row.pagePath !== undefined && typeof row.pagePath !== "string")) return new Response("Invalid request", { status: 400 });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(event({ type: "progress", message: "Checking permissions…" }));
      void (async () => {
        controller.enqueue(event({ type: "progress", message: "Checking your workspace…" }));
        const result = await sendAiMessageAction({ conversationId: row.conversationId as string | null, message: row.message as string, pagePath: row.pagePath as string | undefined });
        controller.enqueue(event({ type: "result", result }));
        controller.close();
      })().catch((error) => {
        console.error("AI Assistant stream failed", error);
        controller.enqueue(event({ type: "result", result: { ok: false, error: "The AI Assistant could not answer right now. Please try again." } }));
        controller.close();
      });
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
