// ====================== ALERT ROUTES (with actual SMS sending) ======================
app.post('/send-safe-alert', async (req, res) => {
  const { contacts, message, email } = req.body;

  if (email && blockedEmails.has(email.toLowerCase())) {
    return res.json({ success: false, message: 'Your account has been blocked' });
  }

  console.log('Safe alert received from:', email || 'unknown');

  const success = await sendSMS(message, '+61416619600'); // Your phone number
  res.json({ success });
});

app.post('/send-emergency-alert', async (req, res) => {
  const { contacts, message, email } = req.body;

  if (email && blockedEmails.has(email.toLowerCase())) {
    return res.json({ success: false, message: 'Your account has been blocked' });
  }

  console.log('Emergency alert received from:', email || 'unknown');

  const success = await sendSMS(message, '+61416619600'); // Your phone number
  res.json({ success });
});
