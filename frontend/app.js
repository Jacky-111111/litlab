const runtimeConfig = window.__LITLAB_CONFIG__ || {};

const LitLabConfig = {
  apiBaseUrl: runtimeConfig.apiBaseUrl || "http://127.0.0.1:8000",
  supabaseUrl: runtimeConfig.supabaseUrl || "",
  supabaseAnonKey: runtimeConfig.supabaseAnonKey || "",
};

function initSupabaseClient() {
  if (!window.supabase) {
    throw new Error("Supabase script is not loaded.");
  }
  if (!LitLabConfig.supabaseUrl || !LitLabConfig.supabaseAnonKey) {
    throw new Error("Missing frontend config. Set supabaseUrl and supabaseAnonKey in frontend/config.js.");
  }
  return window.supabase.createClient(LitLabConfig.supabaseUrl, LitLabConfig.supabaseAnonKey);
}

function getAccessToken() {
  return localStorage.getItem("litlab_access_token") || "";
}

async function apiFetch(path, options = {}) {
  const token = getAccessToken();
  const response = await fetch(`${LitLabConfig.apiBaseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    let message = "Request failed";
    try {
      const payload = await response.json();
      message = payload.detail || payload.message || message;
    } catch (_err) {
      // Keep generic message when backend response is not JSON.
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }
  return response.json();
}

function requireAuth() {
  if (!getAccessToken()) {
    window.location.href = "index.html";
    throw new Error("Authentication required");
  }
}

function signOutLocal() {
  localStorage.removeItem("litlab_access_token");
  localStorage.removeItem("litlab_user_email");
}

function getFrameworkBadgeClass(name) {
  if (name === "IMRAD") return "badge blue";
  if (name === "Review / Survey") return "badge teal";
  if (name === "Theoretical Paper") return "badge violet";
  return "badge gray";
}

function injectGlobalFooter() {
  if (document.querySelector(".site-footer")) return;

  const footerEl = document.createElement("footer");
  footerEl.className = "site-footer";
  footerEl.innerHTML = `
    <div class="container">
      <p>Jack Yu ©️2026. Built with help of Cursor.</p>
    </div>
  `;
  document.body.appendChild(footerEl);
}

injectGlobalFooter();

window.LitLab = {
  LitLabConfig,
  initSupabaseClient,
  getAccessToken,
  apiFetch,
  requireAuth,
  signOutLocal,
  getFrameworkBadgeClass,
};
