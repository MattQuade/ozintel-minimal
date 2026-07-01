const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// ====================== PERSISTENT DISK ======================
const USERS_FILE = '/var/data/users.json';
const KEGS_FILE = '/var/data/keg_entries.json';

let users = [];
let kegEntries = [];
let blockedEmails = new Set();

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (e) { users = []; }
}

function saveUsers() {
  try { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); } catch (e) {}
}

function loadKegEntries() {
  try {
    if (fs.existsSync(KEGS_FILE)) kegEntries = JSON.parse(fs.readFileSync(KEGS_FILE, 'utf8'));
    else fs.writeFileSync(KEGS_FILE, JSON.stringify([], null, 2));
  } catch (e) { kegEntries = []; }
}

function saveKegEntries() {
  try { fs.writeFileSync(KEGS_FILE, JSON.stringify(kegEntries, null, 2)); } catch (e) {}
}

loadUsers();
loadKegEntries();

// ====================== ADMIN PASSWORD ======================
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function requireAdminPassword(req, res, next) {
  const password = req.body.password || req.query.password;
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ success: false, message: 'Invalid admin password' });
  next();
}

// ====================== MESSAGEMEDIA ======================
async function sendSMS(message, destinationNumber) {
  const apiKey = process.env.MESSAGEMEDIA_API_KEY;
  const apiSecret = process.env.MESSAGEMEDIA_API_SECRET;
  if (!apiKey || !apiSecret) return false;
  try {
    await axios.post('https://api.messagemedia.com/v1/messages', {
      messages: [{ content: message, destination_number: destinationNumber, format: 'SMS' }]
    }, { auth: { username: apiKey, password: apiSecret } });
    return true;
  } catch (e) { return false; }
}

// ====================== REGISTRATION ======================
app.post('/request-access', async (req, res) => {
  const { name, email, phone } = req.body;
  if (!name || !email) return res.json({ success: false, message: 'Name and email required' });

  const newUser = { id: Date.now(), name: name.trim(), email: email.trim().toLowerCase(), phone: phone?.trim() || '', status: 'pending', createdAt: new Date().toISOString() };
  users.push(newUser);
  saveUsers();

  await sendSMS(`New OzIntel Signup\nName: ${newUser.name}\nEmail: ${newUser.email}\nPhone: ${newUser.phone || 'N/A'}`, '+61416619600');
  res.json({ success: true });
});

// ====================== KEG COUNTER ======================
app.post('/keg/add', (req, res) => {
  const { email, type, amount } = req.body;
  if (!email || !type || !amount) return res.json({ success: false });

  const entry = {
    id: Date.now(),
    email: email.toLowerCase(),
    type,
    amount: parseInt(amount),
    date: new Date().toISOString().split('T')[0]
  };

  kegEntries.push(entry);
  saveKegEntries();
  res.json({ success: true });
});

app.get('/keg/entries', (req, res) => {
  const { email } = req.query;
  if (!email) return res.json([]);
  const userEntries = kegEntries.filter(e => e.email === email.toLowerCase()).sort((a, b) => b.id - a.id);
  res.json(userEntries);
});

app.post('/keg/delete', (req, res) => {
  const { id, email } = req.body;
  kegEntries = kegEntries.filter(e => !(e.id === id && e.email === email.toLowerCase()));
  saveKegEntries();
  res.json({ success: true });
});

// ====================== ADMIN ROUTES ======================
app.get('/admin/users', requireAdminPassword, (req, res) => {
  const usersWithStatus = users.map(user => ({ ...user, blocked: blockedEmails.has(user.email) }));
  res.json(usersWithStatus);
});

app.post('/admin/approve', requireAdminPassword, (req, res) => {
  const { id } = req.body;
  const user = users.find(u => u.id === id);
  if (user) { user.status = 'approved'; user.approvedAt = new Date().toISOString(); saveUsers(); res.json({ success: true }); }
  else res.json({ success: false });
});

app.post('/admin/delete', requireAdminPassword, (req, res) => {
  users = users.filter(u => u.id !== req.body.id); saveUsers(); res.json({ success: true });
});

app.post('/admin/block', requireAdminPassword, (req, res) => {
  if (req.body.email) blockedEmails.add(req.body.email.toLowerCase()); res.json({ success: true });
});

app.post('/admin/unblock', requireAdminPassword, (req, res) => {
  if (req.body.email) blockedEmails.delete(req.body.email.toLowerCase()); res.json({ success: true });
});

// ====================== ACTIVATE ======================
app.post('/activate-user', (req, res) => {
  const { email } = req.body;
  const user = users.find(u => u.email === email?.toLowerCase() && u.status === 'approved');
  res.json(user ? { success: true, user } : { success: false, message: 'Not approved' });
});

// ====================== ALERTS ======================
app.post('/send-safe-alert', async (req, res) => {
  const { contacts, message, email } = req.body;
  if (email && blockedEmails.has(email.toLowerCase())) return res.json({ success: false });
  let successCount = 0;
  for (const c of contacts) if (await sendSMS(message, c.phone)) successCount++;
  res.json({ success: successCount > 0 });
});

app.post('/send-emergency-alert', async (req, res) => {
  const { contacts, message, email } = req.body;
  if (email && blockedEmails.has(email.toLowerCase())) return res.json({ success: false });
  let successCount = 0;
  for (const c of contacts) if (await sendSMS(message, c.phone)) successCount++;
  res.json({ success: successCount > 0 });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Backend running on port ${PORT}`));
