const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ====================== IN-MEMORY STORAGE ======================
let users = [];
let blockedEmails = new Set(); // Blocked email addresses

// ====================== REGISTRATION ======================
app.post('/request-access', (req, res) => {
  const { name, email, phone } = req.body;

  if (!name || !email) {
    return res.json({ success: false, message: 'Name and email are required' });
  }

  const newUser = {
    id: Date.now(),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    phone: phone ? phone.trim() : '',
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  console.log('New registration request:', newUser);

  res.json({ success: true, message: 'Request submitted for approval' });
});

// ====================== ADMIN ======================
app.get('/admin/users', (req, res) => {
  res.json(users);
});

app.post('/admin/approve', (req, res) => {
  const { id } = req.body;
  const user = users.find(u => u.id === id);

  if (user) {
    user.status = 'approved';
    user.approvedAt = new Date().toISOString();
    console.log(`User approved: ${user.email}`);
    res.json({ success: true });
  } else {
    res.json({ success: false, message: 'User not found' });
  }
});

// ====================== ACTIVATE USER ======================
app.post('/activate-user', (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ success: false, message: 'Email is required' });

  const user = users.find(u => 
    u.email === email.toLowerCase() && u.status === 'approved'
  );

  if (user) {
    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone
      }
    });
  } else {
    res.json({ success: false, message: 'User not found or not yet approved' });
  }
});

// ====================== ALERT ROUTES (with blocking) ======================
app.post('/send-safe-alert', (req, res) => {
  const { email } = req.body;

  if (email && blockedEmails.has(email.toLowerCase())) {
    return res.json({ success: false, message: 'Your account has been blocked' });
  }

  console.log('Safe alert received from:', email || 'unknown');
  res.json({ success: true });
});

app.post('/send-emergency-alert', (req, res) => {
  const { email } = req.body;

  if (email && blockedEmails.has(email.toLowerCase())) {
    return res.json({ success: false, message: 'Your account has been blocked' });
  }

  console.log('Emergency alert received from:', email || 'unknown');
  res.json({ success: true });
});

// ====================== BLOCK / UNBLOCK ======================
app.post('/admin/block', (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ success: false, message: 'Email required' });

  blockedEmails.add(email.toLowerCase());
  console.log(`Email blocked: ${email}`);
  res.json({ success: true });
});

app.post('/admin/unblock', (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ success: false, message: 'Email required' });

  blockedEmails.delete(email.toLowerCase());
  console.log(`Email unblocked: ${email}`);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ OzIntel backend running on port ${PORT}`);
});
