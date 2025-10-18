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
        setStatus("Grabación lista. Pulsa ENVIAR.");
      };

      recRef.current = rec;
      startTsRef.current = Date.now();
      setDurationMs(0);
      rec.start();
      setRecording(true);
      setReadyToSend(false);
      setStatus("Grabando… suelta para terminar");

      if (navigator.vibrate) navigator.vibrate(10);
      timerRef.current = window.setInterval(() => {
        if (startTsRef.current) setDurationMs(Date.now() - startTsRef.current);
      }, 200);
    } catch (e: any) {
      setStatus(`Error del micrófono: ${e?.message || e}`);
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
    setStatus("Subiendo…");
    const fd = new FormData();
    fd.append("file", blob, filename);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || res.statusText);
      setStatus("¡Enviado! ✅");
      setReadyToSend(false);
      setBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
      setDurationMs(0);
    } catch (e: any) {
      setStatus("La subida ha fallado");
      alert("La subida ha fallado:\n" + (e?.message || e));
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
      {/* page decorations */}
      <div className="bg-decor" aria-hidden />

      <section style={styles.card}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.h1}>Graba tu nota de voz</h1>
            <p style={styles.sub}>Mantén pulsado para grabar. Suelta para terminar.</p>
          </div>

          <div style={styles.statusWrap} aria-live="polite" aria-atomic="true">
            <span style={styles.statusDot(recording)} className={recording ? "pulse" : ""} />
            <span style={styles.statusText}>
              {recording ? "Grabando" : readyToSend ? "Lista para enviar" : "Listo"}
            </span>
          </div>
        </header>

        {/* Timer */}
        <div style={styles.timerBar}>
          <span style={styles.timerLabel}>Duración</span>
          <span style={styles.timerValue}>
            {recording ? formatTime(durationMs) : readyToSend ? formatTime(durationMs) : "00:00"}
          </span>
        </div>

        {/* Big press-and-hold record button */}
        <div
          className={`recordButton ${recording ? "active" : ""}`}
          style={styles.recordBtn}
          onTouchStart={onPressStart}
          onTouchEnd={onPressEnd}
          onTouchCancel={onPressEnd}
          onMouseDown={onPressStart}
          onMouseUp={onPressEnd}
          onMouseLeave={onPressEnd}
          role="button"
          aria-label="Mantén pulsado para grabar"
        >
          <div className={`ring ${recording ? "show" : ""}`} />
          <div style={styles.micEmoji} aria-hidden>🎤</div>
          <div style={styles.recordText}>
            {recording ? "Suelta para terminar" : "Mantén pulsado para grabar"}
          </div>
        </div>

        {/* Preview */}
        <div style={styles.preview}>
          {blobUrl ? (
            <>
              <div style={styles.previewTitle}>Vista previa</div>
              <audio src={blobUrl} controls style={styles.audio} />
            </>
          ) : (
            <div style={styles.hint}>Tu grabación aparecerá aquí</div>
          )}
        </div>

        {/* SEND */}
        <button
          className="sendBtn"
          style={{
            ...styles.sendBtn,
            ...(readyToSend && !uploading ? styles.sendBtnReady : styles.sendBtnDisabled),
          }}
          onClick={sendRecording}
          disabled={!readyToSend || uploading}
        >
          {uploading ? "Cargando…" : "ENVIAR"}
        </button>
      </section>

      {/* keyframes & helpers */}
      <style>{`
        .bg-decor{
          position: fixed;
          inset: 0;
          background:
            radial-gradient(1200px 800px at 90% -10%, rgba(123, 198, 246, 0.18), transparent 60%),
            radial-gradient(900px 600px at -10% 10%, rgba(180, 227, 214, 0.22), transparent 60%),
            radial-gradient(800px 600px at 50% 120%, rgba(255, 221, 187, 0.18), transparent 60%);
          pointer-events: none;
          z-index: 0;
        }
        .recordButton {
          position: relative;
          transition: transform .15s ease, box-shadow .2s ease;
          will-change: transform;
        }
        .recordButton.active {
          transform: scale(0.98);
        }
        .recordButton .ring{
          content: "";
          position: absolute;
          inset: -14px;
          border-radius: 9999px;
          opacity: 0;
          transform: scale(0.95);
          transition: opacity .25s ease, transform .25s ease;
          background: radial-gradient(60% 60% at 50% 50%, rgba(120,168,255,0.18), rgba(120,168,255,0.05));
          box-shadow:
            0 0 0 2px rgba(120,168,255,0.15),
            0 12px 30px rgba(120,168,255,.20);
        }
        .recordButton .ring.show{
          opacity: 1;
          transform: scale(1);
          animation: gentlePulse 1.6s ease-in-out infinite;
        }
        .pulse{
          animation: dotPulse 1.8s ease-in-out infinite;
        }
        @keyframes gentlePulse{
          0% { box-shadow: 0 0 0 2px rgba(120,168,255,0.18), 0 12px 30px rgba(120,168,255,.20); }
          50% { box-shadow: 0 0 0 6px rgba(120,168,255,0.08), 0 18px 40px rgba(120,168,255,.28); }
          100% { box-shadow: 0 0 0 2px rgba(120,168,255,0.18), 0 12px 30px rgba(120,168,255,.20); }
        }
        @keyframes dotPulse{
          0%, 100% { transform: scale(1); opacity: .9; }
          50% { transform: scale(1.2); opacity: 1; }
        }
      `}</style>
    </main>
  );
}

/* ---------- styles (inline + classy) ---------- */

const styles: Record<string, any> = {
  main: {
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    minHeight: "100svh",
    padding: "24px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(180deg, #f7f9fc 0%, #f1f5f9 100%)",
    color: "#0f172a",
    position: "relative",
  },
  card: {
    position: "relative",
    zIndex: 1,
    width: "100%",
    maxWidth: 520,
    borderRadius: 24,
    padding: 20,
    background: "rgba(255,255,255,0.75)",
    boxShadow: "0 10px 40px rgba(2, 8, 23, 0.10)",
    backdropFilter: "saturate(180%) blur(8px)",
    border: "1px solid rgba(15, 23, 42, 0.06)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  h1: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: 0.2,
  },
  sub: {
    margin: 0,
    marginTop: 6,
    fontSize: 14,
    opacity: 0.7,
  },
  statusWrap: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(2, 132, 199, 0.08)",
    border: "1px solid rgba(2, 132, 199, 0.18)",
  },
  statusDot: (active: boolean) => ({
    width: 8, height: 8, borderRadius: 999,
    background: active ? "#0284c7" : "#94a3b8",
  }),
  statusText: { fontSize: 13, fontWeight: 600, color: "#0f172a" },

  timerBar: {
    marginTop: 8,
    marginBottom: 18,
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    background: "linear-gradient(180deg, rgba(241,245,249,.7), rgba(241,245,249,.4))",
    border: "1px solid rgba(15, 23, 42, 0.06)",
    borderRadius: 14,
    padding: "10px 12px",
  },
  timerLabel: { fontSize: 12, opacity: 0.65 },
  timerValue: { fontVariantNumeric: "tabular-nums", fontSize: 18, fontWeight: 700 },

  recordBtn: {
    width: 220,
    height: 220,
    borderRadius: 999,
    background: "linear-gradient(180deg, #cfe9ff 0%, #b8d8ff 100%)",
    boxShadow: "0 16px 40px rgba(2, 8, 23, 0.12), inset 0 2px 10px rgba(255,255,255,.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    userSelect: "none",
    WebkitUserSelect: "none",
    position: "relative",
    margin: "12px auto 8px",
    border: "1px solid rgba(15, 23, 42, 0.06)",
  },
  micEmoji: { fontSize: 42, marginBottom: 6 },
  recordText: { position: "absolute", bottom: 16, fontSize: 14, fontWeight: 600, color: "#0f172a" },

  preview: {
    width: "100%",
    marginTop: 18,
    borderRadius: 16,
    padding: 14,
    background: "linear-gradient(180deg, rgba(255,255,255,.9), rgba(255,255,255,.7))",
    border: "1px solid rgba(15, 23, 42, 0.06)",
  },
  previewTitle: { fontSize: 13, fontWeight: 700, opacity: 0.7, marginBottom: 8 },
  audio: { width: "100%" },
  hint: { opacity: 0.6, fontSize: 14, textAlign: "center", padding: "8px 0" },

  sendBtn: {
    width: "100%",
    height: 56,
    borderRadius: 16,
    border: "1px solid rgba(15,23,42,0.06)",
    marginTop: 16,
    fontSize: 16,
    fontWeight: 800,
    transition: "transform .12s ease, box-shadow .2s ease, background .2s ease",
    cursor: "pointer",
  },
  sendBtnReady: {
    background: "linear-gradient(180deg, #b7f0d8 0%, #94e2c4 100%)",
    boxShadow: "0 10px 28px rgba(16, 185, 129, .28)",
    color: "#065f46",
  },
  sendBtnDisabled: {
    background: "linear-gradient(180deg, #e9eef5 0%, #dee6f0 100%)",
    color: "#6b7280",
    boxShadow: "none",
    cursor: "not-allowed",
  },
};

