"use client";

import { useEffect, useState } from "react";
import { checkAccountingAccess } from "@/lib/accounting/access";
import VoiceNavBar from "@/components/VoiceNavBar";

const previewLinks = [
  { href: "/accounting/pending?module=Accounting&section=Bank", label: "Bank" },
  {
    href: "/accounting/pending?module=Accounting&section=Chart%20of%20Accounts",
    label: "Chart of Accounts",
  },
  {
    href: "/accounting/pending?module=Accounting&section=Invoices",
    label: "Invoices",
  },
  {
    href: "/accounting/pending?module=Accounting&section=Customers",
    label: "Customers",
  },
  {
    href: "/accounting/pending?module=Accounting&section=Journal",
    label: "Journal",
  },
  {
    href: "/accounting/pending?module=Accounting&section=Transactions",
    label: "Transactions",
  },
  {
    href: "/accounting/pending?module=Accounting&section=Employees",
    label: "Employees",
  },
  {
    href: "/accounting/pending?module=Accounting&section=Reports",
    label: "Reports",
  },
];

const fullLinks = [
  { href: "/bank/accounts", label: "Bank" },
  { href: "/coa", label: "Chart of Accounts" },
  { href: "/invoices", label: "Invoices" },
  { href: "/customers", label: "Customers" },
  { href: "/journal", label: "Journal" },
  { href: "/transactions", label: "Transactions" },
  { href: "/employees", label: "Employees" },
  { href: "/reports", label: "Reports" },
];

export default function AccountingHubPage() {
  // Start as false so the page never stays forever on "Checking…"
  // if JS hydration or /api/users is delayed on mobile Safari.
  const [hasAccess, setHasAccess] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ok = await checkAccountingAccess();
        if (!cancelled) setHasAccess(ok);
      } catch {
        if (!cancelled) setHasAccess(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const links = hasAccess ? fullLinks : previewLinks;

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
        <a
          href="/"
          style={{
            display: "inline-block",
            color: "#0f172a",
            background: "#e2e8f0",
            textDecoration: "none",
            fontWeight: 600,
            padding: "10px 16px",
            borderRadius: 10,
          }}
        >
          ← Back to Alerts
        </a>
      </p>
      <h1 style={{ color: "#f97316", marginBottom: 8 }}>Accounting</h1>
      <p style={{ color: "#94a3b8" }}>
        {checking
          ? "Checking your access…"
          : hasAccess
            ? "Full access enabled for your account."
            : "Preview the modules below. Full access requires admin approval — restore your account on the Alerts home page first."}
      </p>

      <div style={{ maxWidth: 400, margin: "20px auto 0", width: "90%" }}>
        <VoiceNavBar
          variant="home"
          examples={[
            "Select customer",
            "Create new invoice",
            "Open Invoices",
            "Open Bank",
          ]}
        />
      </div>

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
