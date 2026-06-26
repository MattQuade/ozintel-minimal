const twilio = require('twilio');

const accountSid = 'AC9ceaa4251e9c7c47e788e0989eca9f66';
const authToken = '99d6f4346a8bba4f0d791f12009e5efc';
const client = twilio(accountSid, authToken);

client.messages.create({
    body: 'Test from OzIntel - Verification',
    from: '+16062380495',
    to: '+61416619600' // Put YOUR real number here for the test
})
.then(message => console.log('✅ Success! SID:', message.sid))
.catch(err => console.error('❌ Error:', err.message));