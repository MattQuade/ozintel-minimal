let safeContacts = JSON.parse(localStorage.getItem("safeContacts")) || [];
let emergencyContacts = JSON.parse(localStorage.getItem("emergencyContacts")) || [];

function renderContacts() {
  // Simple render for now
  console.log("Contacts rendered");
}

async function sendAlert(type) {
  const status = document.getElementById("alert-status") || document.createElement("p");
  status.textContent = "Getting location...";
  
  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject);
    });

    const lat = position.coords.latitude.toFixed(6);
    const lon = position.coords.longitude.toFixed(6);
    const mapsLink = `https://www.google.com/maps?q=${lat},${lon}`;

    const message = type === 'safe' 
      ? `✅ OzIntel - Test User - SAFE ARRIVAL\nI'm OK. Location: ${mapsLink}`
      : `🚨 OzIntel - Test User - EMERGENCY\nI need help! Location: ${mapsLink}`;

    const response = await fetch("https://ozintel-backend.onrender.com/send-safe-alert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        contacts: [{ name: "Test", phone: "+61416619600" }], 
        message 
      })
    });

    const result = await response.json();
    status.textContent = result.success ? "✅ Alert sent via Twilio!" : "❌ Failed";
  } catch (err) {
    status.textContent = "❌ Error: " + err.message;
    console.error(err);
  }
}

function sendSafeAlert() { sendAlert('safe'); }
function sendEmergencyAlert() { sendAlert('emergency'); }

// Init
console.log("✅ Script loaded - buttons should work");
renderContacts();