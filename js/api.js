const API_BASE_URL = "https://kadea-chat-api.onrender.com";
const API_TOKEN = "wksp_e1e2e8a2322c93416eafda8998712f28";

function apiFetch(endpoint, options = {}) {
  return fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "x-api-key": API_TOKEN,
      ...options.headers,
    },
  }).then((res) => res.json());
}

