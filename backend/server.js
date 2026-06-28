const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// In-memory storage (resets on restart - you can use Excel as backup)
let users = [];

// ====================== REGISTRATION + SMS NOTIFICATION ======================
app.post('/request-access', async (req, res) => {
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

  // Send you an SMS notification
  // (We'll keep your existing sendRegistrationNotification function here if you want)

  res.json({ success: true, message: 'Request received' });
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
    console.log(`User approved: ${user.name} (${user.email})`);
    res.json({ success: true });
  } else {
    res.json({ success: false, message: 'User not found' });
  }
});

// ====================== USER ACTIVATION ======================
app.post('/activate-user', (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ success: false, message: 'Email required' });

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
    res.json({ success: false, message: 'User not found or not approved yet' });
  }
});

// ====================== ALERT ROUTES ======================
app.post('/send-safe-alert', (req, res) => {
  console.log('Safe alert received');
  res.json({ success: true });
});

app.post('/send-emergency-alert', (req, res) => {
  console.log('Emergency alert received');
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ OzIntel backend running on port ${PORT}`);
});
