let safeContacts = JSON.parse(localStorage.getItem("safeContacts")) || [];
let emergencyContacts = JSON.parse(localStorage.getItem("emergencyContacts")) || [];

function renderContacts() {
  const safeList = document.getElementById("safe-contacts-list");
  safeList.innerHTML = '';
  safeContacts.forEach((c, i) => {
    const div = document.createElement("div");
    div.className = "contact-item";
    div.innerHTML = `<span>${c.name} — ${c.phone}</span><button onclick="removeSafeContact(${i})" disabled>Remove</button>`;
    safeList.appendChild(div);
  });

  const emList = document.getElementById("emergency-contacts-list");
  emList.innerHTML = '';
  emergencyContacts.forEach((c, i) => {
    const div = document.createElement("div");
    div.className = "contact-item";
    div.innerHTML = `<span>${c.name} — ${c.phone}</span><button onclick="removeEmergencyContact(${i})" disabled>Remove</button>`;
    emList.appendChild(div);
  });
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
        body { font-family: system-ui; background:#0f172a; color:white; text-align:center; padding:50px 20px; }
        h1 { color:#22d3ee; }
        .price { font-size:2.8rem; font-weight:bold; margin:20px 0; color:#22c55e; }
        .send-btn { background:#22c55e; color:white; font-size:1.6rem; padding:20px 80px; border:none; border-radius:12px; cursor:pointer; margin-top:40px; }
        .send-btn:active { transform:scale(0.95); }
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
          result.textContent = "Sending request...";
          try {
            await fetch("https://ozintel-backend.onrender.com/request-access", {
              method: "POST",
              headers: {"Content-Type": "application/json"},
              body: JSON.stringify({ timestamp: new Date().toISOString() })
            });
            result.innerHTML = "✅ Request sent.<br>admin@ozintel will contact you soon.";
            result.style.color = "#22c55e";
          } catch(e) {
            result.textContent = "Failed. Try again.";
            result.style.color = "red";
          }
        }
      </script>
    </body>
    </html>
  `);
}

// Disabled alert functions (for visual only)
function sendSafeAlert() { alert("Access pending approval by admin@ozintel"); }
function sendEmergencyAlert() { alert("Access pending approval by admin@ozintel"); }

function addSafeContact() { alert("Access pending approval by admin@ozintel"); }
function addEmergencyContact() { alert("Access pending approval by admin@ozintel"); }

// Init
renderContacts();