const runtimeConfig = window.__LITLAB_CONFIG__ || {};

const LitLabConfig = {
  apiBaseUrl: runtimeConfig.apiBaseUrl || "http://127.0.0.1:8000",
  supabaseUrl: runtimeConfig.supabaseUrl || "",
  supabaseAnonKey: runtimeConfig.supabaseAnonKey || "",
};

let cachedSupabaseClient = null;
let refreshInFlight = null;

function initSupabaseClient() {
  if (cachedSupabaseClient) {
    return cachedSupabaseClient;
  }
  if (!window.supabase) {
    throw new Error("Supabase script is not loaded.");
  }
  if (!LitLabConfig.supabaseUrl || !LitLabConfig.supabaseAnonKey) {
    throw new Error("Missing frontend config. Set supabaseUrl and supabaseAnonKey in frontend/config.js.");
  }
  cachedSupabaseClient = window.supabase.createClient(LitLabConfig.supabaseUrl, LitLabConfig.supabaseAnonKey);
  return cachedSupabaseClient;
}

function getSupabaseClientOrNull() {
  try {
    return initSupabaseClient();
  } catch (_error) {
    return null;
  }
}

function getAccessToken() {
  return localStorage.getItem("litlab_access_token") || "";
}

function applySessionToLocalStorage(session) {
  const accessToken = session?.access_token || "";
  if (accessToken) {
    localStorage.setItem("litlab_access_token", accessToken);
  } else {
    localStorage.removeItem("litlab_access_token");
  }

  const email = session?.user?.email || "";
  if (email) {
    localStorage.setItem("litlab_user_email", email);
  }
}

async function getSessionAccessToken() {
  const supabaseClient = getSupabaseClientOrNull();
  if (!supabaseClient) {
    return "";
  }

  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) {
      return "";
    }
    const session = data?.session || null;
    if (session?.access_token) {
      applySessionToLocalStorage(session);
      return session.access_token;
    }
  } catch (_error) {
    // Ignore session lookup errors and fallback to local storage token.
  }

  return "";
}

async function refreshAccessToken() {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    const supabaseClient = getSupabaseClientOrNull();
    if (!supabaseClient) {
      return "";
    }

    try {
      const { data, error } = await supabaseClient.auth.refreshSession();
      if (error) {
        return "";
      }
      const refreshed = data?.session || null;
      if (!refreshed?.access_token) {
        return "";
      }
      applySessionToLocalStorage(refreshed);
      return refreshed.access_token;
    } catch (_error) {
      return "";
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

function isIndexPage() {
  const page = window.location.pathname.split("/").pop() || "index.html";
  return page === "index.html" || page === "";
}

function redirectToLoginIfNeeded() {
  if (!isIndexPage()) {
    window.location.href = "index.html";
  }
}

async function fetchWithAuth(path, options, token) {
  return fetch(`${LitLabConfig.apiBaseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

async function apiFetch(path, options = {}) {
  let token = getAccessToken();
  if (!token) {
    token = await getSessionAccessToken();
  }

  let response = await fetchWithAuth(path, options, token);

  if (response.status === 401) {
    const refreshedToken = await refreshAccessToken();
    if (refreshedToken) {
      response = await fetchWithAuth(path, options, refreshedToken);
    }
  }

  if (!response.ok) {
    let message = "Request failed";
    try {
      const payload = await response.json();
      message = payload.detail || payload.message || message;
    } catch (_err) {
      // Keep generic message when backend response is not JSON.
    }
    if (response.status === 401) {
      signOutLocal();
      redirectToLoginIfNeeded();
      throw new Error("Session expired. Please sign in again.");
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
void getSessionAccessToken();

window.LitLab = {
  LitLabConfig,
  initSupabaseClient,
  getAccessToken,
  apiFetch,
  requireAuth,
  signOutLocal,
  getFrameworkBadgeClass,
};
