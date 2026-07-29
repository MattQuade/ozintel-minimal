"use client";

export default function ForestryOperationsPage() {
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
        <a href="/" style={{ color: "#38bdf8" }}>
          ← Back to Alerts
        </a>
      </p>
      <h1 style={{ color: "#22c55e", marginBottom: 8 }}>Forestry Operations</h1>
      <p style={{ color: "#fbbf24", marginTop: 24 }}>Status: Pending Approval</p>
    </main>
  );
}
