require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());

const USERS_FILE = './users.json';
const KEY = process.env.MESSAGEMEDIA_API_KEY;
const SECRET = process.env.MESSAGEMEDIA_API_SECRET;
const MY_PHONE = "+61416619600";   // Your personal number

function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (e) {
    return { pending: [], approved: [] };
  }
}

function saveUsers(data) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}

// Submit Access Request + Notify You
app.post("/request-access", async (req, res) => {
  const { name, email, phone } = req.body || {};
  if (!name || !email) {
    return res.status(400).json({ success: false, error: "Name and email required" });
  }

  const users = loadUsers();
  users.pending.push({
    id: Date.now(),
    name,
    email,
    phone: phone || "",
    requestedAt: new Date().toISOString()
  });

  saveUsers(users);

  // Send SMS notification to you
  if (KEY && SECRET) {
    try {
      const auth = Buffer.from(`${KEY}:${SECRET}`).toString("base64");
      const notifyMsg = `🔔 New OzIntel Signup Request\nName: ${name}\nEmail: ${email}\nPhone: ${phone || 'Not provided'}\nTime: ${new Date().toISOString()}`;

      await fetch("https://api.messagemedia.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${auth}`
        },
        body: JSON.stringify({
          messages: [{
            content: notifyMsg,
            destination_number: MY_PHONE
          }]
        })
      });
      console.log("✅ Notification SMS sent to your phone");
    } catch (e) {
      console.error("Failed to send notification SMS:", e.message);
    }
  }

  console.log("📩 New request from:", name);
  res.json({ success: true });
});

// Get users for admin
app.get("/admin/users", (req, res) => res.json(loadUsers()));

// Approve user
app.post("/admin/approve", async (req, res) => {
  const { id } = req.body;
  const users = loadUsers();
  const index = users.pending.findIndex(u => u.id === id);
  if (index === -1) return res.status(404).json({ success: false });

  const user = users.pending.splice(index, 1)[0];
  user.approvedAt = new Date().toISOString();
  users.approved.push(user);
  saveUsers(users);

  // Optional: Send approval SMS to the user
  if (user.phone && KEY && SECRET) {
    try {
      const auth = Buffer.from(`${KEY}:${SECRET}`).toString("base64");
      await fetch("https://api.messagemedia.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Basic ${auth}` },
        body: JSON.stringify({
          messages: [{ 
            content: "✅ OzIntel Access Approved!\nYou can now use the Safe Arrival and Emergency buttons.", 
            destination_number: user.phone 
          }]
        })
      });
    } catch (e) {}
  }

  res.json({ success: true });
});

// Alert endpoint
app.post("/send-safe-alert", async (req, res) => {
  console.log("🚨 Alert request received");
  const { contacts, message } = req.body;
  if (!contacts || contacts.length === 0) {
    return res.status(400).json({ success: false, error: "No contacts" });
  }
  res.json({ success: true, sent: contacts.length });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Backend running on port ${PORT}`));