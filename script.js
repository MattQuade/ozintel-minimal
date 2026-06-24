let safeContacts = JSON.parse(localStorage.getItem("safeContacts")) || [];
let emergencyContacts = JSON.parse(localStorage.getItem("emergencyContacts")) || [];
let username = localStorage.getItem("ozintelUsername") || "You";

function renderContacts() {
  // Safe Contacts
  const safeList = document.getElementById("safe-contacts-list");
  safeList.innerHTML = '';
  safeContacts.forEach((contact, index) => {
    const div = document.createElement("div");
    div.className = "contact-item";
    div.innerHTML = `
      <span>${contact.name} — ${contact.phone}</span>
      <button onclick="removeSafeContact(${index})" style="background:#ef4444;color:white;padding:4px 8px;font-size:0.9rem;">Remove</button>
    `;
    safeList.appendChild(div);
  });

  // Emergency Contacts
  const emergencyList = document.getElementById("emergency-contacts-list");
  emergencyList.innerHTML = '';
  emergencyContacts.forEach((contact, index) => {
    const div = document.createElement("div");
    div.className = "contact-item";
    div.innerHTML = `
      <span>${contact.name} — ${contact.phone}</span>
      <button onclick="removeEmergencyContact(${index})" style="background:#ef4444;color:white;padding:4px 8px;font-size:0.9rem;">Remove</button>
    `;
    emergencyList.appendChild(div);
  });
}

function saveUsername() {
  username = document.getElementById("username-input").value.trim() || "You";
  localStorage.setItem("ozintelUsername", username);
}

function addSafeContact() {
  const phone = document.getElementById("new-safe-phone").value.trim();
  const name = document.getElementById("new-safe-name").value.trim() || "Contact";
  if (!phone) return alert("Please enter a phone number");
  
  safeContacts.push({ name, phone });
  localStorage.setItem("safeContacts", JSON.stringify(safeContacts));
  renderContacts();
  document.getElementById("new-safe-phone").value = "";
  document.getElementById("new-safe-name").value = "";
}

function addEmergencyContact() {
  const phone = document.getElementById("new-emergency-phone").value.trim();
  const name = document.getElementById("new-emergency-name").value.trim() || "Contact";
  if (!phone) return alert("Please enter a phone number");
  
  emergencyContacts.push({ name, phone });
  localStorage.setItem("emergencyContacts", JSON.stringify(emergencyContacts));
  renderContacts();
  document.getElementById("new-emergency-phone").value = "";
  document.getElementById("new-emergency-name").value = "";
}

function removeSafeContact(index) {
  safeContacts.splice(index, 1);
  localStorage.setItem("safeContacts", JSON.stringify(safeContacts));
  renderContacts();
}

function removeEmergencyContact(index) {
  emergencyContacts.splice(index, 1);
  localStorage.setItem("emergencyContacts", JSON.stringify(emergencyContacts));
  renderContacts();
}

async function sendAlert(type) {
  const contacts = type === 'safe' ? safeContacts : emergencyContacts;
  const btns = document.querySelectorAll('button');
  const status = document.getElementById("status");
  
  if (contacts.length === 0) {
    alert(`Please add at least one ${type === 'safe' ? 'Safe' : 'Emergency'} Contact`);
    return;
  }

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

    let message = '';
    if (type === 'safe') {
      message = `✅ OzIntel - ${username} - SAFE ARRIVAL\nI'm OK. Current location: ${mapsLink}`;
    } else {
      message = `🚨 OzIntel - ${username} - EMERGENCY\nI need help! Current location: ${mapsLink}`;
    }

    status.textContent = "Sending SMS alerts...";

    const response = await fetch("https://ozintel-backend.onrender.com/send-safe-alert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contacts, message })
    });

    const result = await response.json();
    
    if (result.success) {
      status.textContent = `✅ ${type === 'safe' ? 'Safe Arrival' : 'Emergency'} alert sent to ${result.sent} contacts!`;
      status.style.color = "#22c55e";
    } else {
      throw new Error(result.error);
    }
  } catch (err) {
    status.textContent = "❌ Error: " + err.message;
    status.style.color = "#ef4444";
    console.error(err);
  } finally {
    btns.forEach(b => b.disabled = false);
  }
}

function sendSafeAlert() {
  sendAlert('safe');
}

function sendEmergencyAlert() {
  sendAlert('emergency');
}

// Init
document.getElementById("username-input").value = username;
renderContacts();