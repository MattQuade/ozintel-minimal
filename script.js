const supabaseUrl = 'https://qxisbataovfkkiavci.supabase.co';
const supabaseKey = 'sb_publishable_3WxLu8ayfbS99TgA7Nt-HA_x5ruYGgZ';
const supabase = Supabase.createClient(supabaseUrl, supabaseKey);

let currentUser = null;
let safeContacts = [];
let emergencyContacts = [];

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

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: email,
      options: { emailRedirectTo: window.location.origin }
    });

    if (error) throw error;

    status.textContent = "✅ Magic link sent! Check your email and click the link.";
    status.style.color = "#22c55e";
  } catch (err) {
    status.textContent = "Error: " + err.message;
    status.style.color = "#ef4444";
  }
}

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

  // Load user name
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
  document.getElementById('user-name').textContent = profile ? `${profile.first_name} ${profile.last_name}` : currentUser.email;

  await loadContacts();
}

async function loadContacts() {
  const { data: safe } = await supabase.from('safe_contacts').select('*').eq('user_id', currentUser.id);
  const { data: emergency } = await supabase.from('emergency_contacts').select('*').eq('user_id', currentUser.id);

  safeContacts = safe || [];
  emergencyContacts = emergency || [];

  renderContacts();
}

function renderContacts() {
  // Safe contacts
  const safeList = document.getElementById("safe-contacts-list");
  safeList.innerHTML = '';
  safeContacts.forEach((c, i) => {
    const div = document.createElement("div");
    div.className = "contact-item";
    div.innerHTML = `<span>${c.name} — ${c.phone}</span><button onclick="removeSafeContact(${i})">Remove</button>`;
    safeList.appendChild(div);
  });

  // Emergency contacts
  const emList = document.getElementById("emergency-contacts-list");
  emList.innerHTML = '';
  emergencyContacts.forEach((c, i) => {
    const div = document.createElement("div");
    div.className = "contact-item";
    div.innerHTML = `<span>${c.name} — ${c.phone}</span><button onclick="removeEmergencyContact(${i})">Remove</button>`;
    emList.appendChild(div);
  });
}

// Add / Remove functions + sendAlert functions (same as before but using Supabase)

async function addSafeContact() {
  const name = document.getElementById("new-safe-name").value.trim() || "Contact";
  const phone = document.getElementById("new-safe-phone").value.trim();
  if (!phone) return alert("Phone required");

  await supabase.from('safe_contacts').insert({ user_id: currentUser.id, name, phone });
  loadContacts();
  document.getElementById("new-safe-name").value = "";
  document.getElementById("new-safe-phone").value = "";
}

async function addEmergencyContact() {
  const name = document.getElementById("new-emergency-name").value.trim() || "Contact";
  const phone = document.getElementById("new-emergency-phone").value.trim();
  if (!phone) return alert("Phone required");

  await supabase.from('emergency_contacts').insert({ user_id: currentUser.id, name, phone });
  loadContacts();
  document.getElementById("new-emergency-name").value = "";
  document.getElementById("new-emergency-phone").value = "";
}

async function removeSafeContact(index) {
  const contact = safeContacts[index];
  await supabase.from('safe_contacts').delete().eq('id', contact.id);
  loadContacts();
}

async function removeEmergencyContact(index) {
  const contact = emergencyContacts[index];
  await supabase.from('emergency_contacts').delete().eq('id', contact.id);
  loadContacts();
}

// sendAlert function (same as previous version)
async function sendAlert(type) {
  const contacts = type === 'safe' ? safeContacts : emergencyContacts;
  const status = document.getElementById("status");
  if (contacts.length === 0) return alert(`Add at least one ${type} contact`);

  // ... (same geolocation + fetch to backend logic as before)
  // For now I'll leave a placeholder - tell me when you want the full sendAlert implemented
  status.textContent = `✅ ${type} alert would be sent (backend connection next)`;
}

function logout() {
  supabase.auth.signOut();
  location.reload();
}

// Init
checkAuth();