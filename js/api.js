const API_BASE_URL = "https://kadea-chat-api.onrender.com";
const API_TOKEN = "wksp_e1e2e8a2322c93416eafda8998712f28";

async function apiFetch(endpoint, options = {}) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_TOKEN,
      ...options.headers,
    },
  });

  return response.json();
}
