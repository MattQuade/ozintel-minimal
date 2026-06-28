const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// ====================== SEND SMS VIA MESSAGEMEDIA ======================
async function sendSMS(message, destinationNumber) {
  const apiKey = process.env.MESSAGEMEDIA_API_KEY;
  const apiSecret = process.env.MESSAGEMEDIA_API_SECRET;

  if (!apiKey || !apiSecret) {
    console.log('MessageMedia credentials missing');
    return false;
  }

  try {
    await axios.post('https://api.messagemedia.com/v1/messages', {
      messages: [{
        content: message,
        destination_number: destinationNumber,
        format: 'SMS'
      }]
    }, {
      auth: {
        username: apiKey,
        password: apiSecret
      }
    });
    console.log('SMS sent successfully');
    return true;
  } catch (error) {
    console.error('Failed to send SMS:', error.response?.data || error.message);
    return false;
  }
}

// ====================== ALERT ROUTES ======================
app.post('/send-safe-alert', async (req, res) => {
  console.log('Safe alert received');

  const { message } = req.body;
  const success = await sendSMS(message, '+61416619600'); // Your phone

  res.json({ success });
});

app.post('/send-emergency-alert', async (req, res) => {
  console.log('Emergency alert received');

  const { message } = req.body;
  const success = await sendSMS(message, '+61416619600'); // Your phone

  res.json({ success });
});

// ====================== REGISTRATION ======================
app.post('/request-access', async (req, res) => {
  const { name, email, phone } = req.body;

  if (!name || !email) {
    return res.json({ success: false, message: 'Name and email required' });
  }

  const newUser = {
    id: Date.now(),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    phone: phone ? phone.trim() : '',
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  console.log('New registration request:', newUser);

  // Send you an SMS when someone registers
  const regMessage = `New OzIntel Signup\nName: ${newUser.name}\nEmail: ${newUser.email}\nPhone: ${newUser.phone || 'N/A'}`;
  await sendSMS(regMessage, '+61416619600');

  res.json({ success: true });
});

// ====================== ADMIN ======================
app.get('/admin/users', (req, res) => {
  // For now returning empty array since we're not persisting users
  res.json([]);
});

app.post('/admin/approve', (req, res) => {
  res.json({ success: true });
});

// ====================== ACTIVATE (kept for compatibility) ======================
app.post('/activate-user', (req, res) => {
  res.json({ success: false, message: 'Activation disabled in simplified mode' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ OzIntel backend running on port ${PORT}`);
});
