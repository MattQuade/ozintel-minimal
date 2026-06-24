const supabaseUrl = 'https://qxisbataovfkkiavci.supabase.co';
const supabaseKey = 'sb_publishable_3WxLu8ayfbS99TgA7Nt-HA_x5ruYGgZ';
const supabase = Supabase.createClient(supabaseUrl, supabaseKey);

let currentUser = null;

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
    const { data, error } = await supabase.auth.signInWithOtp({
      email: email,
      options: {
        emailRedirectTo: window.location.origin + '/'
      }
    });

    if (error) throw error;

    // Create profile
    await supabase.from('profiles').upsert({
      id: (await supabase.auth.getUser()).data.user?.id,
      first_name: firstName,
      last_name: lastName,
      phone: phone
    });

    status.textContent = "✅ Magic link sent! Check your email.";
    status.style.color = "#22c55e";
  } catch (err) {
    status.textContent = "Error: " + err.message;
    status.style.color = "#ef4444";
  }
}

// Check if user is already logged in
async function checkAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    currentUser = session.user;
    loadMainApp();
  }
}

function loadMainApp() {
  document.getElementById('auth-screen').style.display = 'none';
  // For now we'll show a placeholder - we'll expand this in next step
  document.getElementById('main-app').innerHTML = `
    <h2>Welcome, ${currentUser.email}</h2>
    <p>Logged in successfully. Building main alert screen...</p>
  `;
  document.getElementById('main-app').style.display = 'block';
}

// Init
checkAuth();