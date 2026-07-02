const API_BASE_URL = "https://kadea-chat-api.onrender.com";
const API_KEY = "wksp_e1e2e8a2322c93416eafda8998712f28";

const STORAGE_KEYS = {
  TOKEN: "egmon_token",
  USER: "egmon_user",
};

/* ─── Local Storage ─── */

function saveToken(token) {
  localStorage.setItem(STORAGE_KEYS.TOKEN, token);
}

function getToken() {
  return localStorage.getItem(STORAGE_KEYS.TOKEN);
}

function saveUser(user) {
  localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
}

function getUser() {
  const data = localStorage.getItem(STORAGE_KEYS.USER);
  return data ? JSON.parse(data) : null;
}

function clearAuth() {
  localStorage.removeItem(STORAGE_KEYS.TOKEN);
  localStorage.removeItem(STORAGE_KEYS.USER);
}

function isAuthenticated() {
  return getToken() !== null;
}

async function logout() {
  try {
    await apiRequest("/auth/logout", {
      method: "POST",
      auth: true,
    });
  } finally {
    // On nettoie toujours la session locale,
    // même si la requête serveur échoue.
    clearAuth();
  }
}

/* ─── Appels API ─── */

/**
 * Envoie une requête à l'API.
 * @param {string} endpoint 
 * @param {object} options 
 */
async function apiRequest(endpoint, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": API_KEY,
  };

  // Si auth = true, on ajoute le token JWT dans l'en-tête
  if (options.auth) {
    const token = getToken();
    if (!token) {
      throw { type: "auth", message: "Utilisateur non authentifié." };
    }
    headers["Authorization"] = "Bearer " + token;
  }

  let response;

  try {
    response = await fetch(API_BASE_URL + endpoint, {
      method: options.method || "GET",
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    // Erreur réseau (pas de connexion, serveur injoignable…)
    throw { type: "network", message: "Erreur réseau. Vérifiez votre connexion internet." };
  }

  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    data = {};
  }

  // L'API renvoie success: false en cas d'erreur
  if (!response.ok || data.success === false) {
    throw {
      type: "api",
      message: data.message || "Erreur serveur. Réessayez plus tard.",
      status: response.status,
      errors: data.errors || [],
    };
  }

  return data;
}

/* ─── Validation ─── */

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* ─── Helpers UX formulaire ─── */

function showFieldError(input, message) {
  clearFieldError(input);

  input.classList.add("input-error", "shake");
  input.addEventListener("animationend", () => input.classList.remove("shake"), { once: true });

  const errorEl = document.createElement("p");
  errorEl.className = "field-error";
  errorEl.textContent = message;
  errorEl.dataset.errorFor = input.id;

  input.parentElement.appendChild(errorEl);
}

function clearFieldError(input) {
  input.classList.remove("input-error");

  const existing = input.parentElement.querySelector('[data-error-for="' + input.id + '"]');
  if (existing) existing.remove();
}

function clearAllFieldErrors(form) {
  form.querySelectorAll(".input-error").forEach(function (input) {
    clearFieldError(input);
  });
}

function showFormMessage(container, message, type) {
  let el = container.querySelector(".form-message");

  if (!el) {
    el = document.createElement("p");
    el.className = "form-message";
    container.prepend(el);
  }

  el.textContent = message;
  el.className = "form-message form-message--" + type + " form-message--visible";
}

function hideFormMessage(container) {
  const el = container.querySelector(".form-message");
  if (el) el.classList.remove("form-message--visible");
}

function setButtonLoading(button, isLoading) {
  if (isLoading) {
    button.disabled = true;
    button.dataset.originalText = button.textContent;
    button.innerHTML = '<span class="btn-loader"></span> Chargement…';
    button.classList.add("btn-loading");
  } else {
    button.disabled = false;
    button.textContent = button.dataset.originalText || button.textContent;
    button.classList.remove("btn-loading");
  }
}

function redirectAfterDelay(url, delay) {
  setTimeout(function () {
    window.location.href = url;
  }, delay);
}

/* ─── Objet global accessible partout ─── */

const Auth = {
  saveToken,
  getToken,
  saveUser,
  getUser,
  clearAuth,
  logout,
  isAuthenticated,
  apiRequest,
  isValidEmail,
  showFieldError,
  clearFieldError,
  clearAllFieldErrors,
  showFormMessage,
  hideFormMessage,
  setButtonLoading,
  redirectAfterDelay,
};
