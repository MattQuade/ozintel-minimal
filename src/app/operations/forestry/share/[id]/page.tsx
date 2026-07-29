"use client";

import { use, useState } from "react";

type SharePageProps = {
  params: Promise<{ id: string }>;
};

type VerifiedReport = {
  id: string;
  clientName: string;
  notes: string;
  createdAt: string;
  capturedAt: string;
  latitude: number | null;
  longitude: number | null;
};

export default function ForestrySharePage({ params }: SharePageProps) {
  const { id } = use(params);
  return <ShareViewer id={id} />;
}

function ShareViewer({ id }: { id: string }) {
  const [accessCode, setAccessCode] = useState("");
  const [report, setReport] = useState<VerifiedReport | null>(null);
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);

  const verifyAccess = async () => {
    setIsChecking(true);
    setError("");
    try {
      const res = await fetch(`/api/operations/forestry/reports/${id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Access denied");
        setReport(null);
      } else {
        setReport(data.report);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to verify access code");
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0f172a",
        color: "white",
        padding: 24,
        fontFamily: "system-ui",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <h1 style={{ color: "#22c55e", marginBottom: 8 }}>Forestry Photo Report</h1>
        {!report && (
          <div
            style={{
              background: "#1e2937",
              border: "1px solid #334155",
              borderRadius: 12,
              padding: 20,
              marginTop: 24,
            }}
          >
            <p style={{ color: "#cbd5e1" }}>
              Enter the access code to view this report.
            </p>
            <input
              type="password"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              placeholder="Access code"
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: "1px solid #475569",
                background: "#0f172a",
                color: "white",
              }}
            />
            <button
              onClick={verifyAccess}
              disabled={isChecking || !accessCode.trim()}
              style={{
                marginTop: 12,
                padding: "12px 18px",
                background: "#22c55e",
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: isChecking ? "not-allowed" : "pointer",
                opacity: isChecking ? 0.7 : 1,
                fontWeight: 700,
              }}
            >
              {isChecking ? "Checking..." : "Open report"}
            </button>
            {error && <p style={{ color: "#fca5a5", marginTop: 12 }}>{error}</p>}
          </div>
        )}

        {report && (
          <div
            style={{
              background: "#1e2937",
              border: "1px solid #334155",
              borderRadius: 12,
              padding: 20,
              marginTop: 24,
            }}
          >
            <img
              src={`/api/operations/forestry/photos/${id}?code=${encodeURIComponent(
                accessCode
              )}`}
              alt="Forestry report"
              style={{
                width: "100%",
                maxHeight: 520,
                objectFit: "contain",
                borderRadius: 10,
                background: "#0b1120",
              }}
            />
            <div style={{ marginTop: 20, lineHeight: 1.6 }}>
              <p>
                <strong>Client:</strong> {report.clientName}
              </p>
              <p>
                <strong>Captured:</strong>{" "}
                {new Date(report.capturedAt).toLocaleString("en-AU", {
                  timeZone: "Australia/Sydney",
                })}
              </p>
              <p>
                <strong>Uploaded:</strong>{" "}
                {new Date(report.createdAt).toLocaleString("en-AU", {
                  timeZone: "Australia/Sydney",
                })}
              </p>
              <p>
                <strong>Location:</strong>{" "}
                {report.latitude != null && report.longitude != null ? (
                  <a
                    href={`https://maps.google.com/?q=${report.latitude},${report.longitude}&z=18`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#38bdf8" }}
                  >
                    {report.latitude.toFixed(6)}, {report.longitude.toFixed(6)}
                  </a>
                ) : (
                  "Location unavailable"
                )}
              </p>
              <div>
                <strong>Notes:</strong>
                <p
                  style={{
                    marginTop: 8,
                    whiteSpace: "pre-wrap",
                    background: "#0f172a",
                    padding: 12,
                    borderRadius: 8,
                  }}
                >
                  {report.notes}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
