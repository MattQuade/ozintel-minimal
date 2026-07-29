"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function PendingContent() {
  const searchParams = useSearchParams();
  const section = searchParams.get("section");

  return (
    <main
      style={{
        fontFamily: "system-ui",
        background: "#0f172a",
        color: "white",
        minHeight: "100vh",
        padding: 24,
        textAlign: "center",
      }}
    >
      <p style={{ margin: "0 0 16px" }}>
        <a href="/accounting" style={{ color: "#38bdf8" }}>
          ← Back to Accounting
        </a>
      </p>
      <h1 style={{ color: "#f97316", marginBottom: 8 }}>Accounting</h1>
      {section && (
        <p style={{ color: "#cbd5e1", marginTop: 0, fontSize: "1.1rem" }}>
          {section}
        </p>
      )}
      <div
        style={{
          background: "#78350f",
          border: "1px solid #f59e0b",
          borderRadius: 12,
          padding: 24,
          margin: "32px auto",
          maxWidth: 420,
        }}
      >
        <p style={{ margin: 0, fontSize: "1.15rem", lineHeight: 1.5 }}>
          Pending approval from Admin
        </p>
        <p style={{ margin: "16px 0 0", color: "#fde68a", fontSize: "0.95rem" }}>
          This section is coming soon. Contact your administrator if you need
          early access.
        </p>
      </div>
      <p style={{ marginTop: 24 }}>
        <a href="/" style={{ color: "#94a3b8" }}>
          Return to Alert System
        </a>
      </p>
    </main>
  );
}

export default function AccountingPendingPage() {
  return (
    <Suspense
      fallback={
        <main
          style={{
            fontFamily: "system-ui",
            background: "#0f172a",
            color: "white",
            minHeight: "100vh",
            padding: 24,
            textAlign: "center",
          }}
        >
          <p style={{ color: "#94a3b8" }}>Loading...</p>
        </main>
      }
    >
      <PendingContent />
    </Suspense>
  );
}
