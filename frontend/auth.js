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
  modeTitleEl.textContent = isLogin ? "Sign in to LitLab" : "Create your LitLab account";
  submitButtonEl.textContent = isLogin ? "Sign In" : "Create Account";
  modeSwitchEl.textContent = isLogin
    ? "Need an account? Create one"
    : "Already have an account? Sign in";
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
    const { data } = await supabaseClient.auth.getSession();
    const existingSession = data?.session || null;
    if (existingSession?.access_token) {
      localStorage.setItem("litlab_access_token", existingSession.access_token);
      if (existingSession.user?.email) {
        localStorage.setItem("litlab_user_email", existingSession.user.email);
      }
    }

    supabaseClient.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        localStorage.setItem("litlab_access_token", session.access_token);
        if (session.user?.email) {
          localStorage.setItem("litlab_user_email", session.user.email);
        }
      } else {
        window.LitLab.signOutLocal();
      }
      bindLoggedInState();
    });
    setAuthMessage("Enter your credentials to continue.");
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

  setAuthMessage(authMode === "login" ? "Signing in..." : "Creating account...", "info");

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
    localStorage.setItem("litlab_user_email", session.user?.email || email);
    setAuthMessage("Signed in successfully.", "success");
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
