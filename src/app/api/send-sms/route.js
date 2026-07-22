import express from "express";
import fetch from "node-fetch";

const router = express.Router();

router.post("/send-sms", async (req, res) => {
  console.log("[send-sms] Incoming request");

  const { phone, message } = req.body || {};
  console.log("[send-sms] Parsed body:", { phone, message });

  if (!phone || !message) {
    console.error("[send-sms] Missing phone or message");
    return res.status(400).json({ error: "Phone and message are required" });
  }

  const apiKey = process.env.MESSAGEMEDIA_API_KEY;
  const apiSecret = process.env.MESSAGEMEDIA_API_SECRET;

  if (!apiKey || !apiSecret) {
    console.error("[send-sms] Missing MessageMedia credentials in env");
    return res
      .status(500)
      .json({ error: "Server configuration error: Missing SMS credentials" });
  }

  const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

  const payload = {
    messages: [
      {
        content: message,
        destination_number: phone,
        format: "SMS",
      },
    ],
  };

  console.log("[send-sms] Outbound payload:", payload);

  try {
    const mmResponse = await fetch("https://api.messagemedia.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify(payload),
    });

    const status = mmResponse.status;
    const rawText = await mmResponse.text();

    console.log("[send-sms] MessageMedia status:", status);
    console.log("[send-sms] MessageMedia raw body:", rawText);

    let responseData;
    try {
      responseData = rawText ? JSON.parse(rawText) : {};
    } catch {
      responseData = { raw: rawText };
    }

    if (mmResponse.ok) {
      console.log("[send-sms] MessageMedia accepted:", responseData);
      return res.json({ success: true, data: responseData });
    } else {
      console.error("[send-sms] MessageMedia rejected:", status, responseData);
      return res.status(500).json({
        error: "MessageMedia gateway rejection",
        status,
        details: responseData,
      });
    }
  } catch (error) {
    console.error("[send-sms] Critical server error:", error);
    return res
      .status(500)
      .json({ error: "Internal server error", details: error.message });
  }
});

export default router;
