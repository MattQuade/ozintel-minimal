"use client";

export default function OperationsIndexPage() {
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
      <h1 style={{ color: "#3b82f6" }}>Operations</h1>
      <p style={{ color: "#94a3b8" }}>Choose a module.</p>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          alignItems: "center",
          marginTop: 24,
        }}
      >
        <a
          href="/operations/pub"
          style={{
            display: "block",
            width: "90%",
            maxWidth: 400,
            padding: 20,
            fontSize: "1.3rem",
            borderRadius: 12,
            background: "#1d4ed8",
            color: "white",
            textDecoration: "none",
            fontWeight: "bold",
            boxSizing: "border-box",
            textAlign: "center",
          }}
        >
          Pub Operations
        </a>
        <a
          href="/operations/forestry"
          style={{
            display: "block",
            width: "90%",
            maxWidth: 400,
            padding: 20,
            fontSize: "1.3rem",
            borderRadius: 12,
            background: "#15803d",
            color: "white",
            textDecoration: "none",
            fontWeight: "bold",
            boxSizing: "border-box",
            textAlign: "center",
          }}
        >
          Forestry Operations
        </a>
        <a
          href="/operations/logistics"
          style={{
            display: "block",
            width: "90%",
            maxWidth: 400,
            padding: 20,
            fontSize: "1.3rem",
            borderRadius: 12,
            background: "#0f766e",
            color: "white",
            textDecoration: "none",
            fontWeight: "bold",
            boxSizing: "border-box",
            textAlign: "center",
          }}
        >
          Logistics Operations
        </a>
      </div>
    </main>
  );
}
