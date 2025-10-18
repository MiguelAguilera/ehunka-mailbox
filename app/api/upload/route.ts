// app/api/upload/route.ts
export const runtime = "nodejs"; // ensure Node runtime (not edge), needed for FormData file streaming

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const note = (form.get("note") as string | null) || "";
    if (!file) {
      return new Response(JSON.stringify({ error: "no file" }), { status: 400 });
    }

    const BOT = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT = process.env.TARGET_CHAT_ID;
    if (!BOT || !CHAT) {
      return new Response(JSON.stringify({ error: "missing env vars" }), { status: 500 });
    }

    const caption =
      `📥 Audio received (${new Date().toISOString()})` + (note ? `\n📝 ${note}` : "");

    // Forward to Telegram as a document (broad format support)
    const tgURL = `https://api.telegram.org/bot${BOT}/sendDocument`;
    const tgForm = new FormData();
    tgForm.append("chat_id", CHAT);
    tgForm.append("caption", caption);
    // Pass through the uploaded File object directly
    tgForm.append("document", file, (file as any).name || "audio.webm");

    const tgRes = await fetch(tgURL, { method: "POST", body: tgForm });
    const tgJson = await tgRes.json().catch(() => ({}));

    if (!tgRes.ok) {
      return new Response(
        JSON.stringify({ error: "telegram failed", details: tgJson }),
        { status: 502 }
      );
    }

    return Response.json({ status: "ok" });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || String(e) }), { status: 400 });
  }
}
