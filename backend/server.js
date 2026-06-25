require("dotenv").config();
const express = require("express");
const cors = require("cors");
const twilio = require("twilio");

const app = express();
app.use(cors());
app.use(express.json());

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_NUMBER = "+16062380495";

console.log("TWILIO_SID present:", !!TWILIO_SID);
console.log("TWILIO_TOKEN present:", !!TWILIO_TOKEN);

const client = twilio(TWILIO_SID, TWILIO_TOKEN);

app.post("/send-safe-alert", async (req, res) => {
  console.log("🚨 Alert request received");

  const { contacts, message } = req.body;
  if (!contacts || contacts.length === 0) {
    return res.status(400).json({ success: false, error: "No contacts" });
  }

  try {
    let sentCount = 0;
    for (const contact of contacts) {
      const response = await client.messages.create({
        body: message,
        from: TWILIO_NUMBER,
        to: contact.phone
      });
      console.log(`✅ Sent to ${contact.phone}`);
      sentCount++;
    }
    res.json({ success: true, sent: sentCount });
  } catch (error) {
    console.error("Twilio Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/request-access", (req, res) => {
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});