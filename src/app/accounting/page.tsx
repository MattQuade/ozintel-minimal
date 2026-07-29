"use client";

export default function AccountingHubPage() {
  const links = [
    { href: "/accounting/pending?section=Bank", label: "Bank" },
    { href: "/accounting/pending?section=Chart%20of%20Accounts", label: "Chart of Accounts" },
    { href: "/accounting/pending?section=Journal", label: "Journal" },
    { href: "/accounting/pending?section=Transactions", label: "Transactions" },
    { href: "/accounting/pending?section=Employees", label: "Employees" },
    { href: "/accounting/pending?section=Reports", label: "Reports" },
  ];

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
      <h1 style={{ color: "#f97316", marginBottom: 8 }}>Accounting</h1>
      <p style={{ color: "#94a3b8" }}>
        Preview the modules below. Full access requires admin approval.
      </p>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          alignItems: "center",
          marginTop: 24,
        }}
      >
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            style={{
              display: "block",
              width: "90%",
              maxWidth: 400,
              padding: 16,
              borderRadius: 12,
              background: "#9a3412",
              color: "white",
              textDecoration: "none",
              fontWeight: "bold",
            }}
          >
            {link.label}
          </a>
        ))}
      </div>
    </main>
  );
}
