const supabaseUrl = 'https://qxisbataovfkkiavci.supabase.co';
const supabaseKey = 'sb_publishable_3WxLu8ayfbS99TgA7Nt-HA_x5ruYGgZ';

let supabase;
let currentUser = null;
let safeContacts = [];
let emergencyContacts = [];

function initSupabase() {
  supabase = Supabase.createClient(supabaseUrl, supabaseKey);
}

async function signUp() {
  const firstName = document.getElementById('first-name').value.trim();
  const lastName = document.getElementById('last-name').value.trim();
  const email = document.getElementById('email').value.trim();
  const phone = document.getElementById('phone').value.trim();

  if (!firstName || !lastName || !email) {
    alert("First name, last name and email are required");
    return;
  }

  const status = document.getElementById('status');
  status.textContent = "Sending magic link...";
  status.style.color = "#eab308";

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: email,
      options: { 
        emailRedirectTo: window.location.origin 
      }
    });

    if (error) throw error;

    status.textContent = "✅ Magic link sent! Check your email (including spam folder).";
    status.style.color = "#22c55e";
  } catch (err) {
    console.error(err);
    status.textContent = "Error: " + err.message;
    status.style.color = "#ef4444";
  }
}

// Rest of the functions remain the same...
async function checkAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    currentUser = session.user;
    loadMainApp();
  }
}

async function loadMainApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('main-app').style.display = 'block';

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
  document.getElementById('user-name').textContent = profile ? `${profile.first_name} ${profile.last_name}` : currentUser.email;

  await loadContacts();
}

// ... (keep all the other functions: loadContacts, renderContacts, addSafeContact, etc. the same as last version)

async function sendAlert(type) {
  const contacts = type === 'safe' ? safeContacts : emergencyContacts;
  const status = document.getElementById("status");
  
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
      ? `✅ OzIntel - ${document.getElementById('user-name').textContent} - SAFE ARRIVAL\nI'm OK. Current location: ${mapsLink}`
      : `🚨 OzIntel - ${document.getElementById('user-name').textContent} - EMERGENCY\nI need help! Current location: ${mapsLink}`;

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
      throw new Error(result.error || "Unknown error");
    }
  } catch (err) {
    status.textContent = "❌ Error: " + err.message;
    status.style.color = "#ef4444";
    console.error(err);
  } finally {
    btns.forEach(b => b.disabled = false);
  }
}

function sendSafeAlert() { sendAlert('safe'); }
function sendEmergencyAlert() { sendAlert('emergency'); }

function logout() {
  supabase.auth.signOut();
  location.reload();
}

// Initialize
initSupabase();
checkAuth();