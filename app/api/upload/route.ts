export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return json(400, { error: "no file" });

    const BOT = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT = process.env.TARGET_CHAT_ID;
    const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME;
    if (!BOT || !CHAT) return json(500, { error: "missing env vars" });

    const filename = (file as any).name || "audio.bin";
    const mime = file.type || "";
    const isOgg = mime.includes("audio/ogg") || filename.toLowerCase().endsWith(".ogg");

    const endpoint = isOgg ? "sendVoice" : "sendDocument";
    const fieldName = isOgg ? "voice" : "document";

    // Mention bot in caption if username is available
    const mention = BOT_USERNAME ? `@${BOT_USERNAME}` : "";
    const caption = `📥 Audio received ${mention}\n${new Date().toISOString()}`;

    const tgForm = new FormData();
    tgForm.append("chat_id", CHAT);
    tgForm.append("caption", caption);
    tgForm.append(fieldName, file, filename);

    const tgURL = `https://api.telegram.org/bot${BOT}/${endpoint}`;
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), 20000);

    const tgRes = await fetch(tgURL, {
      method: "POST",
      body: tgForm,
      signal: controller.signal,
    });
    clearTimeout(to);

    const raw = await tgRes.text();
    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { raw };
    }

    if (!tgRes.ok || parsed?.ok === false)
      return json(502, { error: "telegram_failed", details: parsed });

    return json(200, { status: "ok", mode: isOgg ? "voice" : "document" });
  } catch (e: any) {
    return json(400, { error: e?.message || String(e) });
  }
}

