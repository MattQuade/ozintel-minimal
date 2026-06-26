let lastSafeTime = localStorage.getItem("lastSafeTime");
let lastSafeLat = parseFloat(localStorage.getItem("lastSafeLat"));
let lastSafeLon = parseFloat(localStorage.getItem("lastSafeLon"));

async function sendAlert(type) {
  const status = document.getElementById("status");
  status.textContent = "Getting location...";

  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
    });

    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    const mapsLink = `https://www.google.com/maps?q=${lat.toFixed(6)},${lon.toFixed(6)}`;

    let extraInfo = "";

    if (type === 'safe') {
      if (lastSafeTime) {
        const timeDiff = timeSince(new Date(lastSafeTime));
        const distance = lastSafeLat && lastSafeLon 
          ? calculateDistance(lastSafeLat, lastSafeLon, lat, lon).toFixed(1) 
          : "0";
        
        extraInfo = `\n\nPrevious alert: ${timeDiff} ago\nDistance from previous: ${distance} km`;
      }

      // Save current location as last safe
      localStorage.setItem("lastSafeTime", new Date().toISOString());
      localStorage.setItem("lastSafeLat", lat);
      localStorage.setItem("lastSafeLon", lon);
    }

    const message = type === 'safe' 
      ? `✅ OzIntel - Matt Quade - SAFE ARRIVAL\nI'm OK. Current location: ${mapsLink}${extraInfo}`
      : `🚨 OzIntel - Matt Quade - EMERGENCY\nI need help! Current location: ${mapsLink}`;

    status.textContent = "Sending SMS...";

    const res = await fetch("https://ozintel-backend.onrender.com/send-safe-alert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        contacts: [{ name: "Test", phone: "+61416619600" }], 
        message 
      })
    });

    const data = await res.json();
    status.textContent = data.success ? "✅ SMS Sent!" : "❌ Failed";
  } catch (e) {
    status.textContent = "❌ Error: " + e.message;
  }
}

// Helper functions
function timeSince(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  let interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + "h";
  interval = seconds / 60;
  return Math.floor(interval) + "m";
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function sendSafeAlert() { sendAlert('safe'); }
function sendEmergencyAlert() { sendAlert('emergency'); }