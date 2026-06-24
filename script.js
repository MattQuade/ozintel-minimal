const supabase = Supabase.createClient(
  'https://qxisbataovfkkiavci.supabase.co',
  'sb_publishable_3WxLu8ayfbS99TgA7Nt-HA_x5ruYGgZ'
);

async function signUp() {
  const email = document.getElementById('email').value.trim();
  const status = document.getElementById('status');

  if (!email) {
    status.textContent = "Please enter email";
    return;
  }

  status.textContent = "Sending magic link...";

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: email,
      options: { emailRedirectTo: window.location.origin }
    });

    if (error) throw error;

    status.textContent = "✅ Magic link sent! Check your email.";
    status.style.color = "lime";
  } catch (err) {
    console.error(err);
    status.textContent = "Failed: " + err.message;
    status.style.color = "red";
  }
}

console.log("✅ Script loaded successfully");