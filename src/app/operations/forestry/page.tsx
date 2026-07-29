"use client";

import { useEffect, useRef, useState } from "react";

type ForestryReport = {
  id: string;
  clientName: string;
  notes: string;
  createdAt: string;
  capturedAt: string;
  latitude: number | null;
  longitude: number | null;
};

export default function ForestryOperationsPage() {
  const [clientName, setClientName] = useState("");
  const [notes, setNotes] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [sharePayload, setSharePayload] = useState<{
    link: string;
    accessCode: string;
    clientName: string;
  } | null>(null);
  const [copyFeedback, setCopyFeedback] = useState("");
  const [reports, setReports] = useState<ForestryReport[]>([]);

  const buildShareMessage = (link: string, accessCode: string, clientName: string) =>
    `Forestry site report for ${clientName}\n\nOpen: ${link}\nAccess code: ${accessCode}`;

  const shareWithClient = async () => {
    if (!sharePayload) return;
    const { link, accessCode, clientName } = sharePayload;
    const text = buildShareMessage(link, accessCode, clientName);
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: `Forestry report – ${clientName}`,
          text,
          url: link,
        });
        setCopyFeedback("Shared.");
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        console.warn("Native share failed, falling back to copy:", err);
      }
    }
    await copyShareMessage();
  };

  const copyShareMessage = async () => {
    if (!sharePayload) return;
    const { link, accessCode, clientName } = sharePayload;
    const text = buildShareMessage(link, accessCode, clientName);
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback("Copied — paste into SMS, email, or WhatsApp.");
    } catch {
      window.prompt("Copy this message and send to your client:", text);
    }
  };

  const openSmsShare = () => {
    if (!sharePayload) return;
    const { link, accessCode, clientName } = sharePayload;
    const body = buildShareMessage(link, accessCode, clientName);
    window.location.href = `sms:?body=${encodeURIComponent(body)}`;
  };

  const copyReportLink = async (reportId: string) => {
    const link = `${window.location.origin}/operations/forestry/share/${reportId}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopyFeedback("Link copied. Client still needs the access code you set.");
    } catch {
      window.prompt("Copy this link:", link);
    }
  };

  const loadReports = async () => {
    try {
      const res = await fetch("/api/operations/forestry/reports");
      const data = await res.json();
      if (data.success) {
        setReports(data.reports || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const captureLocation = async () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      return { latitude: null, longitude: null };
    }
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 60000,
        });
      });
      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
    } catch (err) {
      console.warn("Geolocation unavailable:", err);
      return { latitude: null, longitude: null };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim() || !notes.trim() || !accessCode.trim() || !photoFile) {
      alert("Client name, notes, access code, and photo are all required.");
      return;
    }

    setIsUploading(true);
    setStatus("Capturing location and saving report...");
    setShareLink("");
    setSharePayload(null);
    setCopyFeedback("");

    try {
      const { latitude, longitude } = await captureLocation();
      const trimmedClient = clientName.trim();
      const trimmedNotes = notes.trim();
      const trimmedCode = accessCode.trim();
      const form = new FormData();
      form.append("clientName", trimmedClient);
      form.append("notes", trimmedNotes);
      form.append("accessCode", trimmedCode);
      form.append("capturedAt", new Date().toISOString());
      if (latitude != null) form.append("latitude", String(latitude));
      if (longitude != null) form.append("longitude", String(longitude));
      form.append("photo", photoFile);

      const res = await fetch("/api/operations/forestry/reports", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to save report");
      }

      const nextShareLink = `${window.location.origin}/operations/forestry/share/${data.report.id}`;
      setShareLink(nextShareLink);
      setSharePayload({
        link: nextShareLink,
        accessCode: trimmedCode,
        clientName: trimmedClient,
      });
      setStatus("✅ Forestry report saved. Use Share or Copy below to send to your client.");
      setClientName("");
      setNotes("");
      setAccessCode("");
      setPhotoFile(null);
      if (photoInputRef.current) photoInputRef.current.value = "";
      await loadReports();
    } catch (err) {
      console.error(err);
      setStatus(
        err instanceof Error ? err.message : "Failed to create forestry report"
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <main
      style={{
        fontFamily: "system-ui",
        background: "#0f172a",
        color: "white",
        minHeight: "100vh",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <p style={{ margin: "0 0 16px" }}>
          <a href="/" style={{ color: "#38bdf8" }}>
            ← Back to Alerts
          </a>
        </p>
        <h1 style={{ color: "#22c55e", marginBottom: 8 }}>Forestry Operations</h1>
        <p style={{ color: "#cbd5e1", marginTop: 0 }}>
          Capture a site photo, add notes, and generate a client link protected by
          a simple access code.
        </p>

        <form
          onSubmit={handleSubmit}
          style={{
            background: "#1e2937",
            border: "1px solid #334155",
            borderRadius: 12,
            padding: 20,
            marginTop: 24,
          }}
        >
          <div style={{ display: "grid", gap: 12 }}>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
              style={{ display: "none" }}
              aria-hidden
            />
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              style={{
                padding: "14px 20px",
                background: "#0ea5e9",
                color: "white",
                border: "none",
                borderRadius: 8,
                fontWeight: 700,
                cursor: "pointer",
                fontSize: "1rem",
              }}
            >
              Take Photo
            </button>
            <input
              type="text"
              placeholder="Client or job name"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              style={{
                padding: 12,
                borderRadius: 8,
                border: "1px solid #475569",
                background: "#0f172a",
                color: "white",
              }}
            />
            <textarea
              placeholder="Notes / description for the client"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              style={{
                padding: 12,
                borderRadius: 8,
                border: "1px solid #475569",
                background: "#0f172a",
                color: "white",
                resize: "vertical",
              }}
            />
            <input
              type="text"
              placeholder="Simple access code"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              style={{
                padding: 12,
                borderRadius: 8,
                border: "1px solid #475569",
                background: "#0f172a",
                color: "white",
              }}
            />
            <button
              type="submit"
              disabled={isUploading}
              style={{
                padding: "14px 20px",
                background: "#22c55e",
                color: "white",
                border: "none",
                borderRadius: 8,
                fontWeight: 700,
                cursor: isUploading ? "not-allowed" : "pointer",
                opacity: isUploading ? 0.7 : 1,
              }}
            >
              {isUploading ? "Saving..." : "Save report and create link"}
            </button>
          </div>
        </form>

        {status && (
          <div
            style={{
              marginTop: 16,
              background: "#1e2937",
              border: "1px solid #334155",
              borderRadius: 10,
              padding: 14,
            }}
          >
            {status}
          </div>
        )}

        {shareLink && sharePayload && (
          <div
            style={{
              marginTop: 16,
              background: "#14532d",
              border: "1px solid #22c55e",
              borderRadius: 10,
              padding: 14,
            }}
          >
            <p style={{ marginTop: 0, fontWeight: 700 }}>Send to client</p>
            <p style={{ wordBreak: "break-all", marginBottom: 12, fontSize: "0.9rem" }}>
              {shareLink}
            </p>
            <p style={{ margin: "0 0 12px", color: "#dcfce7", fontSize: "0.95rem" }}>
              Access code: <strong>{sharePayload.accessCode}</strong> (included when you share or copy)
            </p>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                justifyContent: "center",
              }}
            >
              <button
                type="button"
                onClick={shareWithClient}
                style={{
                  padding: "12px 18px",
                  background: "#22c55e",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Share with client
              </button>
              <button
                type="button"
                onClick={copyShareMessage}
                style={{
                  padding: "12px 18px",
                  background: "#0ea5e9",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Copy message
              </button>
              <button
                type="button"
                onClick={openSmsShare}
                style={{
                  padding: "12px 18px",
                  background: "#334155",
                  color: "white",
                  border: "1px solid #64748b",
                  borderRadius: 8,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Open SMS
              </button>
            </div>
            {copyFeedback && (
              <p style={{ margin: "12px 0 0", color: "#bbf7d0", fontSize: "0.9rem" }}>
                {copyFeedback}
              </p>
            )}
            <p style={{ margin: "12px 0 0", color: "#86efac", fontSize: "0.85rem" }}>
              On phone, <strong>Share with client</strong> opens your usual apps (Messages, WhatsApp, email).
            </p>
          </div>
        )}

        <section
          style={{
            marginTop: 28,
            background: "#1e2937",
            border: "1px solid #334155",
            borderRadius: 12,
            padding: 20,
          }}
        >
          <h2 style={{ marginTop: 0 }}>Recent Forestry Reports</h2>
          {reports.length === 0 ? (
            <p style={{ color: "#94a3b8" }}>No reports saved yet.</p>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {reports.map((report) => (
                <div
                  key={report.id}
                  style={{
                    background: "#0f172a",
                    borderRadius: 10,
                    padding: 14,
                    border: "1px solid #334155",
                  }}
                >
                  <p style={{ margin: "0 0 6px" }}>
                    <strong>{report.clientName}</strong>
                  </p>
                  <p style={{ margin: "0 0 6px", color: "#cbd5e1" }}>
                    {new Date(report.capturedAt).toLocaleString("en-AU", {
                      timeZone: "Australia/Sydney",
                    })}
                  </p>
                  <p style={{ margin: "0 0 8px", color: "#cbd5e1" }}>
                    {report.latitude != null && report.longitude != null
                      ? `${report.latitude.toFixed(6)}, ${report.longitude.toFixed(6)}`
                      : "Location unavailable"}
                  </p>
                  <p style={{ margin: 0, color: "#94a3b8" }}>
                    {report.notes.length > 140
                      ? `${report.notes.slice(0, 140)}...`
                      : report.notes}
                  </p>
                  <button
                    type="button"
                    onClick={() => copyReportLink(report.id)}
                    style={{
                      marginTop: 10,
                      padding: "8px 12px",
                      background: "#334155",
                      color: "#e2e8f0",
                      border: "1px solid #64748b",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontSize: "0.85rem",
                    }}
                  >
                    Copy link only
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
