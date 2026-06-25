console.log("✅ OzIntel script loaded - Twilio ready");

let safeContacts = JSON.parse(localStorage.getItem("safeContacts")) || [];
let emergencyContacts = JSON.parse(localStorage.getItem("emergencyContacts")) || [];

function renderContacts() {
  console.log("Contacts rendered");
}

async function sendAlert(type) {
  const status = document.getElementById("alert-status") || { textContent: "" };
  const contacts = type === 'safe' ? safeContacts : emergencyContacts;

  if (contacts.length === 0) {
    alert("Please add at least one contact first");
    return;
  }

  status.textContent = "Getting location...";

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 });
    });

    const lat = position.coords.latitude.toFixed(6);
    const lon = position.coords.longitude.toFixed(6);
    const mapsLink = `https://www.google.com/maps?q=${lat},${lon}`;

    const message = type === 'safe' 
      ? `✅ OzIntel - Test - SAFE ARRIVAL\nI'm OK. Current location: ${mapsLink}`
      : `🚨 OzIntel - Test - EMERGENCY\nI need help! Current location: ${mapsLink}`;

    status.textContent = "Sending via Twilio...";

    const response = await fetch("https://ozintel-backend.onrender.com/send-safe-alert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contacts, message })
    });

    const result = await response.json();
    status.textContent = result.success ? `✅ Alert sent! (${result.sent} contacts)` : "❌ Failed";
    console.log("Response:", result);
  } catch (err) {
    console.error(err);
    status.textContent = "❌ Error: " + err.message;
  }
}

function sendSafeAlert() { sendAlert('safe'); }
function sendEmergencyAlert() { sendAlert('emergency'); }

// Init
renderContacts();
console.log("Buttons should now work");