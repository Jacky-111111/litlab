const hostname = window.location.hostname;
const isPrivateIpv4 =
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
  /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
  /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname);
const isLocalhost = ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(hostname);
const isLocalLikeHost = isLocalhost || isPrivateIpv4 || hostname.endsWith(".local");

window.__LITLAB_CONFIG__ = {
  apiBaseUrl: isLocalLikeHost ? "http://127.0.0.1:8000" : "/api",
  supabaseUrl: "https://uguvepoqmkauovjljytn.supabase.co",
  supabaseAnonKey: "sb_publishable_Z5e3UZno3wIAea5SVVI1zg_ukkD6HYr",
};
