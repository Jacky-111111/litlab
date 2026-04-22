const authMessageEl = document.getElementById("auth-message");
const authFormEl = document.getElementById("auth-form");
const modeSwitchEl = document.getElementById("mode-switch");
const modeTitleEl = document.getElementById("auth-mode-title");
const submitButtonEl = document.getElementById("auth-submit");

let authMode = "login";
let supabaseClient = null;
let hasRedirectedAfterAuth = false;

function setAuthMessage(message, tone = "info") {
  if (!message) {
    authMessageEl.textContent = "";
    authMessageEl.hidden = true;
    return;
  }
  authMessageEl.textContent = message;
  authMessageEl.className = `message ${tone}`;
  authMessageEl.hidden = false;
}

function getSafeNextPath() {
  // Only allow same-origin, relative redirects like "/shared-collection.html?slug=abc".
  try {
    const raw = new URL(window.location.href).searchParams.get("next") || "";
    if (!raw) return "";
    if (raw.startsWith("//")) return "";
    if (!raw.startsWith("/")) return "";
    if (raw.includes("://")) return "";
    return raw;
  } catch (_error) {
    return "";
  }
}

function redirectAfterAuth() {
  if (hasRedirectedAfterAuth) return true;
  hasRedirectedAfterAuth = true;
  const next = getSafeNextPath();
  window.location.href = next || "dashboard.html";
  return true;
}

function updateModeUi() {
  const isLogin = authMode === "login";
  modeTitleEl.textContent = isLogin ? "Sign in to LitLab" : "Create your LitLab account";
  submitButtonEl.textContent = isLogin ? "Sign In" : "Create Account";
  modeSwitchEl.textContent = isLogin
    ? "Need an account? Create one"
    : "Already have an account? Sign in";
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
      redirectAfterAuth();
      return;
    }

    supabaseClient.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        localStorage.setItem("litlab_access_token", session.access_token);
        if (session.user?.email) {
          localStorage.setItem("litlab_user_email", session.user.email);
        }
        redirectAfterAuth();
      } else {
        window.LitLab.signOutLocal();
      }
    });
  } catch (error) {
    setAuthMessage(error.message, "warning");
  }
}

modeSwitchEl.addEventListener("click", () => {
  authMode = authMode === "login" ? "signup" : "login";
  updateModeUi();
  authFormEl.reset();
  setAuthMessage("");
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
      const normalized = (authResponse.error.message || "").toLowerCase();
      if (
        authMode === "signup" &&
        (normalized.includes("already registered") ||
          normalized.includes("already exists") ||
          normalized.includes("user already"))
      ) {
        setAuthMessage(
          "An account with this email already exists. Please sign in instead.",
          "error"
        );
        return;
      }
      throw authResponse.error;
    }

    if (authMode === "signup") {
      // When email confirmation is enabled, Supabase returns a fake success for
      // duplicate emails (to prevent user enumeration) but with empty identities.
      const identities = authResponse.data?.user?.identities;
      if (Array.isArray(identities) && identities.length === 0) {
        setAuthMessage(
          "An account with this email already exists. Please sign in instead.",
          "error"
        );
        return;
      }
    }

    const session = authResponse.data?.session;
    if (!session?.access_token) {
      setAuthMessage(
        "Sign-up successful. Check your email if verification is enabled, then sign in.",
        "success"
      );
      return;
    }

    localStorage.setItem("litlab_access_token", session.access_token);
    localStorage.setItem("litlab_user_email", session.user?.email || email);
    setAuthMessage("Signed in successfully. Redirecting...", "success");
    redirectAfterAuth();
  } catch (error) {
    setAuthMessage(error.message || "Authentication failed.", "error");
  }
});

updateModeUi();
initializeAuth();
