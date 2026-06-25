let safeContacts = JSON.parse(localStorage.getItem("safeContacts")) || [];
let emergencyContacts = JSON.parse(localStorage.getItem("emergencyContacts")) || [];

function renderContacts() {
  const safeList = document.getElementById("safe-contacts-list");
  safeList.innerHTML = '';
  safeContacts.forEach((c, i) => {
    const div = document.createElement("div");
    div.className = "contact-item";
    div.innerHTML = `<span>${c.name} — ${c.phone}</span><button onclick="removeSafeContact(${i})">Remove</button>`;
    safeList.appendChild(div);
  });

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
  if (!phone) return alert("Phone required");
  safeContacts.push({name, phone});
  localStorage.setItem("safeContacts", JSON.stringify(safeContacts));
  renderContacts();
  document.getElementById("new-safe-name").value = "";
  document.getElementById("new-safe-phone").value = "";
}

function addEmergencyContact() {
  const name = document.getElementById("new-emergency-name").value.trim() || "Contact";
  const phone = document.getElementById("new-emergency-phone").value.trim();
  if (!phone) return alert("Phone required");
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

function showPricingPage() {
  const newWindow = window.open('', '_blank');
  newWindow.document.write(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>OzIntel Access</title>
      <style>
        body { font-family: system-ui, sans-serif; background: #0f172a; color: white; text-align: center; padding: 50px 20px; }
        h1 { color: #22d3ee; margin-bottom: 10px; }
        .price { font-size: 2.8rem; font-weight: bold; margin: 20px 0; color: #22c55e; }
        .send-btn { background: #22c55e; color: white; font-size: 1.6rem; padding: 20px 80px; border: none; border-radius: 12px; cursor: pointer; margin-top: 40px; }
        .send-btn:active { transform: scale(0.95); }
        #result { margin-top: 30px; font-size: 1.1rem; }
      </style>
    </head>
    <body>
      <h1>Safe/Emergency Location Alerts</h1>
      <p class="price">$AUD11 / month</p>
      <button class="send-btn" onclick="sendRequest()">Send</button>
      <p id="result"></p>

      <script>
        async function sendRequest() {
          const result = document.getElementById('result');
          result.textContent = "Sending request to admin@ozintel...";
          
          try {
            await fetch("https://ozintel-backend.onrender.com/request-access", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ timestamp: new Date().toISOString() })
            });
            result.innerHTML = "✅ Request sent successfully.<br>admin@ozintel will contact you soon.";
            result.style.color = "#22c55e";
          } catch(e) {
            result.textContent = "❌ Failed to send request. Please try again.";
            result.style.color = "red";
          }
        }
      </script>
    </body>
    </html>
  `);
}

async function sendAlert(type) {
  const contacts = type === 'safe' ? safeContacts : emergencyContacts;
  const status = document.getElementById("alert-status");
  
  if (contacts.length === 0) {
    return alert(`Please add at least one ${type === 'safe' ? 'Safe' : 'Emergency'} contact`);
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
      ? `✅ OzIntel - Guest User - SAFE ARRIVAL\nI'm OK. Current location: ${mapsLink}`
      : `🚨 OzIntel - Guest User - EMERGENCY\nI need help! Current location: ${mapsLink}`;

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
      throw new Error(result.error || "Unknown error");
    }
  } catch (err) {
    status.textContent = "❌ Error: " + err.message;
    status.style.color = "#ef4444";
  } finally {
    btns.forEach(b => b.disabled = false);
  }
}

function sendSafeAlert() { sendAlert('safe'); }
function sendEmergencyAlert() { sendAlert('emergency'); }

// Init
renderContacts();