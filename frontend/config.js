const isLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);

window.__LITLAB_CONFIG__ = {
  apiBaseUrl: isLocalhost ? "http://127.0.0.1:8000" : "/api",
  supabaseUrl: "https://uguvepoqmkauovjljytn.supabase.co",
  supabaseAnonKey: "sb_publishable_Z5e3UZno3wIAea5SVVI1zg_ukkD6HYr",
};
