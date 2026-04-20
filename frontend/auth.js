const authMessageEl = document.getElementById("auth-message");
const authFormEl = document.getElementById("auth-form");
const modeSwitchEl = document.getElementById("mode-switch");
const modeTitleEl = document.getElementById("auth-mode-title");
const submitButtonEl = document.getElementById("auth-submit");
const logoutButtonEl = document.getElementById("logout-btn");
const startButtonEl = document.getElementById("start-btn");

let authMode = "login";
let supabaseClient = null;

function setAuthMessage(message, tone = "info") {
  authMessageEl.textContent = message;
  authMessageEl.className = `message ${tone}`;
}

function updateModeUi() {
  const isLogin = authMode === "login";
  modeTitleEl.textContent = isLogin ? "Log in to LitLab" : "Create your LitLab account";
  submitButtonEl.textContent = isLogin ? "Log In" : "Sign Up";
  modeSwitchEl.textContent = isLogin
    ? "Need an account? Sign up"
    : "Already have an account? Log in";
}

function bindLoggedInState() {
  const email = localStorage.getItem("litlab_user_email");
  if (email) {
    startButtonEl.hidden = false;
    logoutButtonEl.hidden = false;
    setAuthMessage(`Signed in as ${email}`, "success");
  } else {
    startButtonEl.hidden = true;
    logoutButtonEl.hidden = true;
  }
}

async function initializeAuth() {
  try {
    supabaseClient = window.LitLab.initSupabaseClient();
    setAuthMessage("Ready. You can sign up or log in.");
  } catch (error) {
    setAuthMessage(error.message, "warning");
  }
  bindLoggedInState();
}

modeSwitchEl.addEventListener("click", () => {
  authMode = authMode === "login" ? "signup" : "login";
  updateModeUi();
});

authFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabaseClient) {
    setAuthMessage("Configure Supabase first.", "error");
    return;
  }

  const formData = new FormData(authFormEl);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  if (!email || !password) {
    setAuthMessage("Email and password are required.", "error");
    return;
  }

  setAuthMessage("Processing...", "info");

  try {
    const authResponse =
      authMode === "login"
        ? await supabaseClient.auth.signInWithPassword({ email, password })
        : await supabaseClient.auth.signUp({ email, password });

    if (authResponse.error) {
      throw authResponse.error;
    }

    const session = authResponse.data?.session;
    if (!session?.access_token) {
      setAuthMessage(
        "Sign-up successful. Check your email if verification is enabled, then log in.",
        "success"
      );
      return;
    }

    localStorage.setItem("litlab_access_token", session.access_token);
    localStorage.setItem("litlab_user_email", email);
    setAuthMessage("Logged in successfully.", "success");
    bindLoggedInState();
  } catch (error) {
    setAuthMessage(error.message || "Authentication failed.", "error");
  }
});

logoutButtonEl.addEventListener("click", async () => {
  if (supabaseClient) {
    await supabaseClient.auth.signOut();
  }
  window.LitLab.signOutLocal();
  window.location.reload();
});

startButtonEl.addEventListener("click", () => {
  window.location.href = "dashboard.html";
});

updateModeUi();
initializeAuth();
