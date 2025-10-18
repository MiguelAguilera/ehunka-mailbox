"use client";

import { useEffect, useRef, useState } from "react";

export default function Home() {
  const [recording, setRecording] = useState(false);
  const [readyToSend, setReadyToSend] = useState(false);
  const [status, setStatus] = useState("Mantén pulsado para grabar");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [uploading, setUploading] = useState(false);

  const chunksRef = useRef<Blob[]>([]);
  const recRef = useRef<MediaRecorder | null>(null);
  const startTsRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);

  function formatTime(ms: number) {
    const s = Math.floor(ms / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  async function startRec() {
    try {
      // ask mic only when user holds the button (user gesture)
      if (!streamRef.current) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      const ogg = "audio/ogg;codecs=opus";
      const mimeType =
        (window as any).MediaRecorder?.isTypeSupported?.(ogg) ? ogg : "audio/webm";

      const rec = new MediaRecorder(streamRef.current!, { mimeType });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data?.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
        setReadyToSend(true);
        setStatus("Recorded. Tap SEND to upload.");
      };

      recRef.current = rec;
      startTsRef.current = Date.now();
      setDurationMs(0);
      rec.start();
      setRecording(true);
      setReadyToSend(false);
      setStatus("Recording… release to stop");

      // small haptic nudge
      if (navigator.vibrate) navigator.vibrate(10);

      // tick timer
      timerRef.current = window.setInterval(() => {
        if (startTsRef.current) setDurationMs(Date.now() - startTsRef.current);
      }, 200);
    } catch (e: any) {
      setStatus(`Mic error: ${e?.message || e}`);
    }
  }

  function stopRec() {
    if (!recording) return;
    recRef.current?.stop();
    setRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  async function postBlob(blob: Blob, filename: string) {
    setUploading(true);
    setStatus("Uploading…");
    const fd = new FormData();
    fd.append("file", blob, filename);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || res.statusText);
      setStatus("Sent ✅");
      setReadyToSend(false);
      setBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
      setDurationMs(0);
    } catch (e: any) {
      setStatus("Upload failed");
      alert("Upload failed:\n" + (e?.message || e));
    } finally {
      setUploading(false);
    }
  }

  async function sendRecording() {
    if (!blobUrl || uploading) return;
    const resp = await fetch(blobUrl);
    const blob = await resp.blob();
    const isOgg = blob.type.includes("audio/ogg");
    await postBlob(blob, isOgg ? "voice.ogg" : "voice.webm");
  }

  // press-and-hold handlers (touch + mouse)
  const onPressStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!recording) startRec();
  };
  const onPressEnd = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (recording) stopRec();
  };

  return (
    <main style={styles.main}>
      <div style={styles.header}>
        <div style={styles.title}>Pulsa para grabar</div>
        <div style={styles.timer}>{recording ? formatTime(durationMs) : readyToSend ? "Ready" : "00:00"}</div>
      </div>

      {/* Big press-and-hold record button */}
      <div
        style={{
          ...styles.recordBtn,
          ...(recording ? styles.recordBtnActive : {}),
        }}
        onTouchStart={onPressStart}
        onTouchEnd={onPressEnd}
        onTouchCancel={onPressEnd}
        onMouseDown={onPressStart}
        onMouseUp={onPressEnd}
        onMouseLeave={onPressEnd}
        role="button"
        aria-label="Hold to record"
      >
        {recording ? "Deja de pulsar para terminar" : "Hold to Record"}
      </div>

      {/* Preview (optional) */}
      <div style={styles.preview}>
        {blobUrl ? <audio src={blobUrl} controls /> : <div style={styles.hint}>Preview will appear here</div>}
      </div>

      {/* Big SEND button */}
      <button
        style={{
          ...styles.sendBtn,
          ...(readyToSend && !uploading ? {} : styles.sendBtnDisabled),
        }}
        onClick={sendRecording}
        disabled={!readyToSend || uploading}
      >
        {uploading ? "Cargando…" : "ENVIAR"}
      </button>
    </main>
  );
}

/* ---------- styles (inline, mobile-first) ---------- */

const styles: Record<string, React.CSSProperties> = {
  main: {
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    minHeight: "100svh",
    padding: "24px 16px 96px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    background: "#0b0b0c",
    color: "white",
  },
  header: {
    width: "100%",
    maxWidth: 480,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 24,
  },
  title: { fontSize: 18, opacity: 0.9 },
  timer: { fontVariantNumeric: "tabular-nums", fontSize: 18, opacity: 0.8 },

  recordBtn: {
    width: 220,
    height: 220,
    borderRadius: 999,
    background:
      "radial-gradient(60% 60% at 50% 50%, #ff4d4d 0%, #c71515 100%)",
    boxShadow: "0 12px 30px rgba(255,77,77,.25), inset 0 2px 8px rgba(255,255,255,.25)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    fontSize: 18,
    fontWeight: 600,
    userSelect: "none",
    WebkitUserSelect: "none",
    color: "white",
  },
  recordBtnActive: {
    transform: "scale(0.96)",
    boxShadow: "0 6px 16px rgba(255,77,77,.35), inset 0 4px 12px rgba(255,255,255,.35)",
  },

  preview: {
    width: "100%",
    maxWidth: 480,
    marginTop: 24,
    borderRadius: 12,
    padding: 12,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
  },
  hint: { opacity: 0.6, fontSize: 14 },

  sendBtn: {
    position: "fixed",
    left: 16,
    right: 16,
    bottom: 16,
    height: 56,
    borderRadius: 16,
    background: "#1f6feb",
    color: "white",
    fontSize: 18,
    fontWeight: 700,
    border: "none",
    boxShadow: "0 10px 30px rgba(31,111,235,.35)",
  },
  sendBtnDisabled: {
    background: "rgba(255,255,255,.2)",
    boxShadow: "none",
  },
};

