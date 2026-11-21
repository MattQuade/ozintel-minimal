"use client";

import { useEffect, useState } from "react";

type InAppAlert = {
  id: string;
  at: string;
  fromName: string;
  kind: "SAFE ARRIVAL" | "EMERGENCY";
  body: string;
};

/** Safe Arrival and SEND HELP, shown in the app. No text message. */
export default function AlertInbox() {
  const [messages, setMessages] = useState<InAppAlert[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void fetch("/api/alerts/inbox", { credentials: "include", cache: "no-store" })
        .then(async (res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled || !Array.isArray(data?.messages)) return;
          setMessages(data.messages);
        })
        .catch(() => undefined);
    };
    load();
    const onShow = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onShow);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, []);

  if (!messages.length) return null;

  return (
    <div style={{ margin: "0 auto 16px", maxWidth: 420, textAlign: "left" }}>
      {messages.map((message) => {
        const emergency = message.kind === "EMERGENCY";
        return (
          <div
            key={message.id}
            style={{
              marginBottom: 10,
              padding: 12,
              borderRadius: 12,
              background: emergency ? "#450a0a" : "#14532d",
              border: `1px solid ${emergency ? "#fca5a5" : "#86efac"}`,
              color: "#f8fafc",
            }}
          >
            <p style={{ margin: "0 0 6px", fontWeight: 700 }}>
              {emergency ? "Emergency" : "Safe arrival"} from {message.fromName}
            </p>
            <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.4 }}>
              {message.body}
            </p>
          </div>
        );
      })}
    </div>
  );
}
