const hostname = window.location.hostname;
const normalizedHostname = hostname.replace(/^\[|\]$/g, "");
const isPrivateIpv4 =
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalizedHostname) ||
  /^192\.168\.\d{1,3}\.\d{1,3}$/.test(normalizedHostname) ||
  /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(normalizedHostname);
const isLocalIpv6 = ["::1", "::", "0:0:0:0:0:0:0:1"].includes(normalizedHostname);
const isLocalhost = ["localhost", "127.0.0.1", "0.0.0.0"].includes(normalizedHostname) || isLocalIpv6;
const isLocalLikeHost = isLocalhost || isPrivateIpv4 || normalizedHostname.endsWith(".local");
const localApiBaseUrl = "http://localhost:5500";

window.__LITLAB_CONFIG__ = {
  apiBaseUrl: isLocalLikeHost ? localApiBaseUrl : "/api",
  supabaseUrl: "https://uguvepoqmkauovjljytn.supabase.co",
  supabaseAnonKey: "sb_publishable_Z5e3UZno3wIAea5SVVI1zg_ukkD6HYr",
};
