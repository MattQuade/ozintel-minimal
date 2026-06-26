require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());

const USERS_FILE = './users.json';

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

// Submit Access Request
app.post("/request-access", (req, res) => {
  const { name, email, phone } = req.body;
  const users = loadUsers();
  
  users.pending.push({
    id: Date.now(),
    name,
    email,
    phone,
    requestedAt: new Date().toISOString()
  });
  
  saveUsers(users);
  console.log("New access request:", name, email);
  res.json({ success: true });
});

// Get all users (for admin page)
app.get("/admin/users", (req, res) => {
  const users = loadUsers();
  res.json(users);
});

// Approve user
app.post("/admin/approve", (req, res) => {
  const { id } = req.body;
  const users = loadUsers();
  
  const userIndex = users.pending.findIndex(u => u.id === id);
  if (userIndex !== -1) {
    const user = users.pending.splice(userIndex, 1)[0];
    user.approvedAt = new Date().toISOString();
    users.approved.push(user);
    saveUsers(users);
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false });
  }
});

// MessageMedia SMS endpoint
app.post("/send-safe-alert", async (req, res) => {
  // ... your existing MessageMedia code here (keep it as is)
  console.log("Alert received");
  res.json({ success: true, sent: 1 });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Backend running on ${PORT}`));