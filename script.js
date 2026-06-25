console.log("✅ OzIntel script loaded - Twilio mode");

let safeContacts = JSON.parse(localStorage.getItem("safeContacts")) || [];
let emergencyContacts = JSON.parse(localStorage.getItem("emergencyContacts")) || [];

function renderContacts() {
  // Safe Contacts
  const safeList = document.getElementById("safe-contacts-list");
  safeList.innerHTML = '';
  safeContacts.forEach((c, i) => {
    const div = document.createElement("div");
    div.className = "contact-item";
    div.innerHTML = `<span>${c.name} — ${c.phone}</span><button onclick="removeSafeContact(${i})">Remove</button>`;
    safeList.appendChild(div);
  });

  // Emergency Contacts
  const emList = document.getElementById("emergency-contacts-list");
  emList.innerHTML = '';
  emergencyContacts.forEach((c, i) => {
    const div = document.createElement("div");
    div.className = "contact-item";
    div.innerHTML = `<span>${c.name} — ${c.phone}</span><button onclick="removeEmergencyContact(${i})">Remove</button>`;
    emList.appendChild(div);
  });
}

function addSafeContact() {
  const name = document.getElementById("new-safe-name").value.trim() || "Contact";
  const phone = document.getElementById("new-safe-phone").value.trim();
  if (!phone) return alert("Please enter a phone number");
  
  safeContacts.push({name, phone});
  localStorage.setItem("safeContacts", JSON.stringify(safeContacts));
  renderContacts();
  document.getElementById("new-safe-name").value = "";
  document.getElementById("new-safe-phone").value = "";
}

function addEmergencyContact() {
  const name = document.getElementById("new-emergency-name").value.trim() || "Contact";
  const phone = document.getElementById("new-emergency-phone").value.trim();
  if (!phone) return alert("Please enter a phone number");
  
  emergencyContacts.push({name, phone});
  localStorage.setItem("emergencyContacts", JSON.stringify(emergencyContacts));
  renderContacts();
  document.getElementById("new-emergency-name").value = "";
  document.getElementById("new-emergency-phone").value = "";
}

function removeSafeContact(i) {
  safeContacts.splice(i, 1);
  localStorage.setItem("safeContacts", JSON.stringify(safeContacts));
  renderContacts();
}

function removeEmergencyContact(i) {
  emergencyContacts.splice(i, 1);
  localStorage.setItem("emergencyContacts", JSON.stringify(emergencyContacts));
  renderContacts();
}

async function sendAlert(type) {
  const contacts = type === 'safe' ? safeContacts : emergencyContacts;
  const status = document.getElementById("alert-status");
  
  if (contacts.length === 0) {
    return alert("Please add at least one contact first");
  }

  const btns = document.querySelectorAll('.safe-btn, .emergency-btn');
  btns.forEach(b => b.disabled = true);
  status.textContent = "Getting location...";
  status.style.color = "#eab308";

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
    });

    const lat = position.coords.latitude.toFixed(6);
    const lon = position.coords.longitude.toFixed(6);
    const mapsLink = `https://www.google.com/maps?q=${lat},${lon}`;

    let message = type === 'safe' 
      ? `✅ OzIntel - Test User - SAFE ARRIVAL\nI'm OK. Current location: ${mapsLink}`
      : `🚨 OzIntel - Test User - EMERGENCY\nI need help! Current location: ${mapsLink}`;

    status.textContent = "Sending via Twilio...";

    const response = await fetch("https://ozintel-backend.onrender.com/send-safe-alert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contacts, message })
    });

    const result = await response.json();
    
    if (result.success) {
      status.textContent = `✅ Alert sent successfully to ${result.sent} contact(s)!`;
      status.style.color = "#22c55e";
    } else {
      throw new Error(result.error || "Unknown error");
    }
  } catch (err) {
    console.error(err);
    status.textContent = "❌ Failed: " + err.message;
    status.style.color = "#ef4444";
  } finally {
    btns.forEach(b => b.disabled = false);
  }
}

function sendSafeAlert() { sendAlert('safe'); }
function sendEmergencyAlert() { sendAlert('emergency'); }

// Init
renderContacts();