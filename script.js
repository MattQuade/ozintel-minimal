// ====================== ONE-TIME ACTIVATION ======================
async function activateProfile() {
  const email = document.getElementById("activate-email").value.trim();
  if (!email) return alert("Please enter your email");

  const status = document.getElementById("status");
  status.textContent = "Activating profile...";

  try {
    const res = await fetch("https://ozintel-backend.onrender.com/activate-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });

    const data = await res.json();

    if (data.success && data.user) {
      localStorage.setItem("currentUser", JSON.stringify(data.user));
      currentUser = data.user;
      username = data.user.name;

      document.getElementById("activation-section").style.display = "none";
      status.textContent = `✅ Profile activated as ${username}`;
      
      // Reload contacts if needed
      renderContacts();
    } else {
      status.textContent = "❌ " + (data.message || "Activation failed");
    }
  } catch (e) {
    status.textContent = "❌ Error activating profile";
  }
}

// Show activation section if no user is saved
function checkActivation() {
  if (!currentUser) {
    document.getElementById("activation-section").style.display = "block";
  }
}

// Call this at the end of your init
checkActivation();
