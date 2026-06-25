require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const MESSAGEMEDIA_KEY = process.env.MESSAGEMEDIA_API_KEY;
const MESSAGEMEDIA_SECRET = process.env.MESSAGEMEDIA_API_SECRET;

console.log("Backend started. MessageMedia Key present:", !!MESSAGEMEDIA_KEY);

// ======================
// REQUEST ACCESS ENDPOINT
// ======================
app.post("/request-access", async (req, res) => {
  console.log("📧 New Access Request Received at:", new Date().toISOString());

  try {
    const myPhone = "+61416619600";   // ← CHANGE THIS TO YOUR REAL NUMBER

    const payload = {
      messages: [{
        content: `🔔 NEW OZINTEL ACCESS REQUEST\n\nTime: ${new Date().toISOString()}\nSource: alert.ozintel.com.au\n\nPlease check Supabase → profiles table to approve the user.`,
        destination_number: myPhone
      }]
    };

    const auth = Buffer.from(`${MESSAGEMEDIA_KEY}:${MESSAGEMEDIA_SECRET}`).toString("base64");

    const response = await fetch("https://api.messagemedia.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${auth}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    console.log("MessageMedia Response:", response.status, data);

    if (response.ok) {
      console.log("✅ Request notification sent successfully");
      res.json({ success: true });
    } else {
      console.log("❌ MessageMedia failed:", data);
      res.status(500).json({ success: false, error: data });
    }
  } catch (error) {
    console.error("❌ Critical error in request-access:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Existing send-safe-alert endpoint (unchanged)
app.post("/send-safe-alert", async (req, res) => {
  console.log("🚨 Alert request received:", new Date().toISOString());
  
  const { contacts, message } = req.body;
  
  if (!contacts || contacts.length === 0) {
    return res.status(400).json({ success: false, error: "No contacts" });
  }

  try {
    const auth = Buffer.from(`${MESSAGEMEDIA_KEY}:${MESSAGEMEDIA_SECRET}`).toString("base64");
    let sentCount = 0;

    for (const contact of contacts) {
      const payload = {
        messages: [{
          content: message,
          destination_number: contact.phone,
          delivery_report: true
        }]
      };

      const response = await fetch("https://api.messagemedia.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${auth}`
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) sentCount++;
    }

    res.json({ success: true, sent: sentCount });
  } catch (error) {
    console.error("SMS Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ OzIntel backend running on port ${PORT}`);
});