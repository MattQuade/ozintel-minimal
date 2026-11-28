"use client";

import { useEffect, useState } from "react";

type FeedStatus = {
  url: string;
  secretSet: boolean;
  secretHint: string;
};

export default function BankFeedCard() {
  const [feed, setFeed] = useState<FeedStatus | null>(null);
  const [secret, setSecret] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/accounting/bank/feed", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (!data?.url) {
          setFailed(true);
          return;
        }
        setFeed({
          url: String(data.url),
          secretSet: Boolean(data.secretSet),
          secretHint: String(data.secretHint || ""),
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const saveSecret = async () => {
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch("/api/accounting/bank/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "secret", signingSecret: secret }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setStatus(data.error || "Could not save the signing secret");
        return;
      }
      setFeed({
        url: String(data.url || feed?.url || ""),
        secretSet: true,
        secretHint: String(data.secretHint || ""),
      });
      setSecret("");
      setStatus("Signing secret saved. Redbark can send to this address.");
    } catch {
      setStatus("Could not save the signing secret");
    } finally {
      setBusy(false);
    }
  };

  const renewAddress = async () => {
    if (
      !window.confirm(
        "Create a new address? The current one will stop working, and Redbark will need the new address."
      )
    ) {
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch("/api/accounting/bank/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rotate" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setStatus(data.error || "Could not create a new address");
        return;
      }
      setFeed({
        url: String(data.url),
        secretSet: Boolean(data.secretSet),
        secretHint: String(data.secretHint || ""),
      });
      setStatus("New address ready. Paste it into Redbark.");
    } catch {
      setStatus("Could not create a new address");
    } finally {
      setBusy(false);
    }
  };

  const copyUrl = async () => {
    if (!feed?.url) return;
    try {
      await navigator.clipboard.writeText(feed.url);
      setStatus("Address copied.");
    } catch {
      setStatus(feed.url);
    }
  };

  return (
    <div className="mb-8 rounded-3xl border border-gray-200 bg-white px-5 py-6 shadow-xl">
      <h2 className="text-xl font-semibold mb-2">Redbark bank feed</h2>
      <p className="text-gray-600 mb-4">
        Paste this address into Redbark as a webhook destination, then paste the
        signing secret Redbark shows you.         New transactions land in the batch on this page. A Redbark account
        uses the OzIntel bank account of the same name, and a new bank account
        is added when that name is not there yet. You still code the lines and
        commit them to the journal.
      </p>
      {feed?.url ? (
        <>
          <p className="break-all rounded-2xl bg-gray-50 px-4 py-3 text-sm font-mono">
            {feed.url}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copyUrl}
              className="rounded-2xl border border-gray-300 px-4 py-2 text-sm font-semibold"
            >
              Copy address
            </button>
            <button
              type="button"
              onClick={renewAddress}
              disabled={busy}
              className="rounded-2xl border border-gray-300 px-4 py-2 text-sm font-semibold disabled:text-gray-400"
            >
              New address
            </button>
          </div>
          <label className="block text-sm font-medium mt-5 mb-2">
            Redbark signing secret
            {feed.secretSet
              ? ` (saved, ending ${feed.secretHint})`
              : ""}
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="password"
              value={secret}
              autoComplete="off"
              onChange={(event) => setSecret(event.target.value)}
              placeholder={feed.secretSet ? "Paste a new secret to replace it" : "Paste the signing secret"}
              className="w-full rounded-2xl border border-gray-300 px-4 py-3"
            />
            <button
              type="button"
              onClick={saveSecret}
              disabled={busy || secret.trim().length < 8}
              className="rounded-2xl bg-green-600 px-5 py-3 font-semibold text-white disabled:bg-gray-400"
            >
              {busy ? "Saving…" : "Save secret"}
            </button>
          </div>
        </>
      ) : (
        <p className="text-gray-500">
          {failed
            ? "The feed address could not be loaded."
            : "Loading the feed address…"}
        </p>
      )}
      {status && <p className="mt-4 text-sm font-medium">{status}</p>}
    </div>
  );
}
