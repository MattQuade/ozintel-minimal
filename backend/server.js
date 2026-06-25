require("dotenv").config();
const express = require("express");
const cors = require("cors");
const twilio = require("twilio");

// DEBUG: Check if variables are detected by the Node process
console.log("--- DEBUG: CHECKING ENVIRONMENT VARIABLES ---");
console.log("SID exists:", !!process.env.TWILIO_ACCOUNT_SID);
console.log("TOKEN exists:", !!process.env.TWILIO_AUTH_TOKEN);
console.log("---------------------------------------------");

const app = express();
app.use(cors());
app.use(express.json());

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const TWILIO_NUMBER = "+16062380495";

app.post("/send-safe-alert", async (req, res) => {
  console.log("🚨 Alert request received:", new Date().toISOString());
  
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
      console.log(`✅ Sent to ${contact.phone} | SID: ${response.sid}`);
      sentCount++;
    }
    res.json({ success: true, sent: sentCount });
  } catch (error) {
    console.error("Twilio Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ OzIntel backend running on port ${PORT}`);
});