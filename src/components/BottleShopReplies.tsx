"use client";

import { useEffect, useState } from "react";
import { enableBottleShopPush } from "@/lib/client/bottleShopPush";

type Reply = {
  id: string;
  pubReply: string;
  pubReplyAt: string;
  lines: string[];
};

/**
 * Pub replies for the restored login. Asks for a phone alert only if they tap.
 * Does not collect a phone number.
 */
export default function BottleShopReplies({
  heading = "Message from the pub",
}: {
  heading?: string;
}) {
  const [messages, setMessages] = useState<Reply[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [alertNote, setAlertNote] = useState("");
  const [alerting, setAlerting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/bottleshop/messages", {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (cancelled || !Array.isArray(data?.messages)) return;
        setSignedIn(true);
        setMessages(data.messages);
        if (data.messages.length && "serviceWorker" in navigator) {
          void navigator.serviceWorker.getRegistration().then((reg) => {
            reg?.active?.postMessage({
              type: "CLEAR_NOTIFICATIONS",
              tag: "bottleshop-reply",
            });
          });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") {
      return;
    }
    void enableBottleShopPush("customer").catch(() => undefined);
  }, []);

  const alertsOn =
    typeof Notification !== "undefined" && Notification.permission === "granted";

  if (!signedIn) return null;
  if (!messages.length && alertsOn) return null;

  const allowAlerts = async () => {
    setAlerting(true);
    setAlertNote("");
    try {
      await enableBottleShopPush("customer");
      setAlertNote("Alerts are on. The next pub reply will show on this phone.");
    } catch (error) {
      setAlertNote(
        error instanceof Error ? error.message : "Could not turn alerts on"
      );
    } finally {
      setAlerting(false);
    }
  };

  return (
    <div
      style={{
        width: "90%",
        maxWidth: 400,
        margin: "0 auto 16px",
        textAlign: "left",
        padding: 14,
        borderRadius: 12,
        background: "#1e2937",
        border: "1px solid #334155",
      }}
    >
      {messages.length ? (
        <p style={{ margin: "0 0 8px", color: "#fbbf24", fontWeight: 700 }}>
          {heading}
        </p>
      ) : (
        <p style={{ margin: "0 0 8px", color: "#cbd5e1", fontSize: "0.9rem" }}>
          Want a phone alert when the pub replies? No phone number needed.
        </p>
      )}
      {messages.map((message) => (
        <div key={message.id} style={{ marginBottom: 10 }}>
          <p style={{ margin: "0 0 4px", color: "white" }}>{message.pubReply}</p>
          {message.lines.length ? (
            <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.8rem" }}>
              {message.lines.join(", ")}
            </p>
          ) : null}
        </div>
      ))}
      {alertsOn ? null : (
        <button
          type="button"
          onClick={() => void allowAlerts()}
          disabled={alerting}
          style={{
            marginTop: 4,
            padding: "8px 10px",
            borderRadius: 8,
            border: "none",
            background: "#334155",
            color: "white",
            fontWeight: 700,
            cursor: alerting ? "default" : "pointer",
          }}
        >
          {alerting ? "Turning alerts on…" : "Alert me on this phone"}
        </button>
      )}
      {alertNote ? (
        <p style={{ margin: "8px 0 0", color: "#cbd5e1", fontSize: "0.85rem" }}>
          {alertNote}
        </p>
      ) : null}
    </div>
  );
}
