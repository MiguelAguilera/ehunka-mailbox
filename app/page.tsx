"use client";

import { useEffect, useRef, useState } from "react";

export default function Home() {
  const [recording, setRecording] = useState(false);
  const [readyToSend, setReadyToSend] = useState(false);
  const [status, setStatus] = useState("Not recording.");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recRef = useRef<MediaRecorder | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup object URLs
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  async function startRec() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunksRef.current = [];
    const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
    rec.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const url = URL.createObjectURL(blob);
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setReadyToSend(true);
      setStatus("Recorded. Ready to send.");
    };
    rec.start();
    recRef.current = rec;
    setRecording(true);
    setStatus("Recording…");
  }

  function stopRec() {
    recRef.current?.stop();
    setRecording(false);
  }

  async function postBlob(blob: Blob, filename: string) {
    setStatus("Uploading…");
    const fd = new FormData();
    fd.append("file", blob, filename);
    // Optional note field: fd.append("note", "from web app");

    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    setStatus("Sent ✅");
    alert("Thanks! Your audio has been sent.");
  }

  async function sendRecording() {
    if (!blobUrl) return;
    const resp = await fetch(blobUrl);
    const blob = await resp.blob();
    await postBlob(blob, "voice.webm");
  }

  async function sendSelectedFile() {
    const f = fileRef.current?.files?.[0];
    if (!f) {
      alert("Choose a file first.");
      return;
    }
    await postBlob(f, f.name || "audio.bin");
  }

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 720, margin: "24px auto", padding: "0 12px" }}>
      <h2>Send an audio message</h2>

      <div style={{ margin: "12px 0" }}>
        <button onClick={() => (recording ? stopRec() : startRec())}
                style={{ padding: "10px 14px", border: 0, borderRadius: 10 }}>
          {recording ? "⏹️ Stop" : "🎙️ Start recording"}
        </button>{" "}
        <button onClick={sendRecording} disabled={!readyToSend}
                style={{ padding: "10px 14px", border: 0, borderRadius: 10 }}>
          📤 Send recording
        </button>
      </div>

      <div style={{ margin: "12px 0" }}>
        <label>…or upload a file</label><br />
        <input ref={fileRef} type="file" accept="audio/*" />
        <button onClick={sendSelectedFile}
                style={{ marginLeft: 8, padding: "10px 14px", border: 0, borderRadius: 10 }}>
          📤 Send file
        </button>
      </div>

      <div style={{ margin: "12px 0" }}>
        <audio src={blobUrl ?? undefined} controls />
      </div>

      <div style={{ margin: "12px 0", opacity: 0.8 }}>{status}</div>
    </main>
  );
}
