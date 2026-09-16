"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import AccountingGate from "@/components/AccountingGate";
import type { ApprovedMerchant } from "@/lib/accounting/approvedMerchants";

const field: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: 12,
  borderRadius: 8,
  border: "1px solid #475569",
  background: "#0f172a",
  color: "white",
  fontSize: "1rem",
};

export default function ShopsPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [merchants, setMerchants] = useState<ApprovedMerchant[]>([]);
  const [status, setStatus] = useState("Loading suppliers…");
  const [alias, setAlias] = useState("");
  const [label, setLabel] = useState("");
  const [bankTerms, setBankTerms] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res = await fetch("/api/merchants", { cache: "no-store" });
      const data = await res.json();
      const list = Array.isArray(data.merchants) ? data.merchants : [];
      setMerchants(list);
      setStatus(`${list.length} supplier${list.length === 1 ? "" : "s"}`);
    } catch {
      setStatus("Could not load suppliers");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const saveList = async (next: ApprovedMerchant[], message: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/merchants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchants: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Save failed");
      setMerchants(Array.isArray(data.merchants) ? data.merchants : next);
      setStatus(message);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const addShop = async (e: FormEvent) => {
    e.preventDefault();
    const nextLabel = label.trim();
    const nextAlias = alias.trim().toLowerCase().replace(/[^a-z0-9]/g, "") ||
      nextLabel.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!nextLabel || !nextAlias) {
      setStatus("Supplier name is required");
      return;
    }
    const terms = bankTerms
      .split(/[|,;]/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const shop: ApprovedMerchant = {
      alias: nextAlias,
      label: nextLabel,
      bankTerms: terms.length ? terms : [nextLabel.toLowerCase(), nextAlias],
      ocrKeys: [nextAlias, nextLabel.toLowerCase().replace(/[^a-z0-9]/g, "")],
    };
    const next = [
      ...merchants.filter((m) => m.alias !== shop.alias),
      shop,
    ].sort((a, b) => a.label.localeCompare(b.label, "en"));
    await saveList(next, `Saved ${shop.label}`);
    setAlias("");
    setLabel("");
    setBankTerms("");
  };

  const removeShop = async (shopAlias: string) => {
    const next = merchants.filter((m) => m.alias !== shopAlias);
    await saveList(next, "Supplier removed");
  };

  const loadDefaults = async () => {
    if (!confirm("Replace this account’s suppliers with the OzIntel starter list?")) {
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/merchants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "syncDefaults" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error("Could not load defaults");
      setMerchants(Array.isArray(data.merchants) ? data.merchants : []);
      setStatus("Loaded starter suppliers");
    } catch {
      setStatus("Could not load starter suppliers");
    } finally {
      setSaving(false);
    }
  };

  const uploadFile = async (file: File) => {
    const text = await file.text();
    setSaving(true);
    try {
      const res = await fetch("/api/merchants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "upload", text }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Upload failed");
      }
      setMerchants(Array.isArray(data.merchants) ? data.merchants : []);
      setStatus(`Uploaded ${data.merchants.length} suppliers`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSaving(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <AccountingGate section="Suppliers" backHref="/accounting" backLabel="← Back to Accounting">
      <main
        style={{
          fontFamily: "system-ui",
          background: "#0f172a",
          color: "white",
          minHeight: "100vh",
          padding: 24,
          maxWidth: 520,
          margin: "0 auto",
        }}
      >
        <h1 style={{ color: "#fb923c", marginTop: 0 }}>Suppliers</h1>
        <p style={{ color: "#94a3b8" }}>
          These chips appear on Capture Receipt for this account only. CSV:
          alias,label,bankTerms — or a JSON list.
        </p>
        <p style={{ color: saving ? "#fbbf24" : "#86efac", fontWeight: 600 }}>
          {status}
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            style={{
              flex: 1,
              padding: 12,
              borderRadius: 10,
              border: "none",
              background: "#ea580c",
              color: "white",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Upload suppliers
          </button>
          <button
            type="button"
            onClick={() => void loadDefaults()}
            style={{
              flex: 1,
              padding: 12,
              borderRadius: 10,
              border: "none",
              background: "#334155",
              color: "white",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Load starter list
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.csv,.txt,application/json,text/csv,text/plain"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadFile(file);
          }}
        />

        <form onSubmit={addShop} style={{ display: "grid", gap: 8, marginBottom: 20 }}>
          <input
            style={field}
            placeholder="Chip name e.g. Woolworths"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <input
            style={field}
            placeholder="Alias e.g. ww (optional)"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
          />
          <input
            style={field}
            placeholder="Bank terms e.g. woolworths, woolies"
            value={bankTerms}
            onChange={(e) => setBankTerms(e.target.value)}
          />
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: 12,
              borderRadius: 10,
              border: "none",
              background: "#16a34a",
              color: "white",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Add supplier
          </button>
        </form>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[...merchants]
            .sort((a, b) => a.label.localeCompare(b.label, "en"))
            .map((m) => (
              <div
                key={m.alias}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                  background: "#1e2937",
                  border: "1px solid #334155",
                  borderRadius: 10,
                  padding: "10px 12px",
                }}
              >
                <div>
                  <strong>{m.label}</strong>
                  <div style={{ color: "#94a3b8", fontSize: "0.8rem" }}>
                    {m.alias}
                    {m.bankTerms?.length ? ` · ${m.bankTerms.join(", ")}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void removeShop(m.alias)}
                  style={{
                    background: "#7f1d1d",
                    color: "white",
                    border: "none",
                    borderRadius: 8,
                    padding: "8px 10px",
                    cursor: "pointer",
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
        </div>
      </main>
    </AccountingGate>
  );
}
