document.addEventListener("DOMContentLoaded", async function () {
  if (!Auth.isAuthenticated()) {
    globalThis.location.href = "index.html";
    return;
  }

  document.querySelectorAll("[data-logout]").forEach(function (btn) {
    btn.addEventListener("click", async function (event) {
      event.preventDefault();
      await Auth.logout();
      globalThis.location.href = "index.html";
    });
  });

  initBioEditor();
  initPasswordEditor();

  try {
    const response = await Auth.apiRequest("/auth/me", { auth: true });
    const user = response.data?.user || response.data;

    if (!user) {
      throw new Error("Profil introuvable.");
    }

    Auth.saveUser(user);
    displayProfile(user);
  } catch (error) {
    if (error.message === "Profil introuvable." || error.status === 401) {
      Auth.clearAuth();
      globalThis.location.href = "index.html";
      return;
    }

    const cachedUser = Auth.getUser();
    if (cachedUser) {
      displayProfile(cachedUser);
    }
  }
});

function displayProfile(user) {
  const name = user.fullName || "Utilisateur";
  const email = user.email || "—";
  const bio = user.bio && user.bio.trim() ? user.bio.trim() : "Aucune bio pour le moment.";
  const avatar =
    user.avatarUrl ||
    "https://ui-avatar.com/api/?name=" + encodeURIComponent(name) + "&background=111827&color=fff";

  setText("profileBtnName", name);
  setAttr("profileBtnAvatar", "src", avatar);
  setAttr("profileBtnAvatar", "alt", name);

  setAttr("profilePanelAvatar", "src", avatar);
  setAttr("profilePanelAvatar", "alt", name);
  setText("profilePanelName", name);
  setText("profilePanelEmail", email);
  setText("profilePanelBio", bio);
}

function initBioEditor() {
  const openBtn = document.getElementById("editBioBtn");
  const modal = document.getElementById("bioEditModal");
  const backdrop = document.getElementById("bioEditModalBackdrop");
  const cancelBtn = document.getElementById("bioEditCancel");
  const saveBtn = document.getElementById("bioEditSave");
  const input = document.getElementById("bioEditInput");

  if (!openBtn || !modal || !input || !saveBtn) return;

  openBtn.addEventListener("click", function () {
    const user = Auth.getUser();
    input.value = user && user.bio ? user.bio : "";
    hideBioEditError();
    openBioModal();
  });

  if (backdrop) backdrop.addEventListener("click", closeBioModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closeBioModal);

  saveBtn.addEventListener("click", async function () {
    const bio = input.value.trim();
    hideBioEditError();
    saveBtn.disabled = true;

    try {
      const user = await updateUserBio(bio);
      Auth.saveUser(user);
      displayProfile(user);
      closeBioModal();
      document.dispatchEvent(
        new CustomEvent("egmon-profile-updated", {
          detail: user,
        })
      );
    } catch (error) {
      showBioEditError(error.message || "Impossible d'enregistrer la bio.");
    } finally {
      saveBtn.disabled = false;
    }
  });
}

function initPasswordEditor() {
  const openBtn = document.getElementById("changePasswordBtn");
  const modal = document.getElementById("passwordEditModal");
  const backdrop = document.getElementById("passwordEditModalBackdrop");
  const cancelBtn = document.getElementById("passwordEditCancel");
  const saveBtn = document.getElementById("passwordEditSave");
  const currentInput = document.getElementById("currentPasswordInput");
  const newInput = document.getElementById("newPasswordInput");
  const confirmInput = document.getElementById("confirmNewPasswordInput");

  if (!openBtn || !modal || !saveBtn || !currentInput || !newInput || !confirmInput) return;

  openBtn.addEventListener("click", function () {
    currentInput.value = "";
    newInput.value = "";
    confirmInput.value = "";
    hidePasswordEditError();
    hidePasswordEditSuccess();
    openPasswordModal();
  });

  if (backdrop) backdrop.addEventListener("click", closePasswordModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closePasswordModal);

  saveBtn.addEventListener("click", async function () {
    const currentPassword = currentInput.value;
    const newPassword = newInput.value;
    const confirmPassword = confirmInput.value;

    hidePasswordEditError();
    hidePasswordEditSuccess();

    if (!currentPassword) {
      showPasswordEditError("Le mot de passe actuel est obligatoire.");
      return;
    }
    if (!newPassword) {
      showPasswordEditError("Le nouveau mot de passe est obligatoire.");
      return;
    }
    if (newPassword.length < 6) {
      showPasswordEditError("Le nouveau mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (newPassword !== confirmPassword) {
      showPasswordEditError("Les mots de passe ne correspondent pas.");
      return;
    }

    saveBtn.disabled = true;

    try {
      await changeUserPassword(currentPassword, newPassword);
      showPasswordEditSuccess("Mot de passe modifié avec succès.");
      currentInput.value = "";
      newInput.value = "";
      confirmInput.value = "";
      setTimeout(closePasswordModal, 1500);
    } catch (error) {
      showPasswordEditError(error.message || "Impossible de modifier le mot de passe.");
    } finally {
      saveBtn.disabled = false;
    }
  });
}

async function changeUserPassword(currentPassword, newPassword) {
  const bodies = [
    { currentPassword: currentPassword, newPassword: newPassword },
    { oldPassword: currentPassword, newPassword: newPassword },
    { password: currentPassword, newPassword: newPassword },
  ];

  let lastError = null;

  for (let i = 0; i < bodies.length; i++) {
    try {
      await Auth.apiRequest("/auth/change-password", {
        method: "POST",
        auth: true,
        body: bodies[i],
      });
      return;
    } catch (error) {
      lastError = error;
      if (error.status !== 400 && error.status !== 422) {
        throw error;
      }
    }
  }

  throw lastError || new Error("Impossible de modifier le mot de passe.");
}

function openPasswordModal() {
  const modal = document.getElementById("passwordEditModal");
  const input = document.getElementById("currentPasswordInput");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  if (input) input.focus();
}

function closePasswordModal() {
  const modal = document.getElementById("passwordEditModal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  hidePasswordEditError();
  hidePasswordEditSuccess();
}

function showPasswordEditError(message) {
  const el = document.getElementById("passwordEditError");
  if (!el) return;
  el.textContent = message;
  el.classList.remove("hidden");
}

function hidePasswordEditError() {
  const el = document.getElementById("passwordEditError");
  if (!el) return;
  el.textContent = "";
  el.classList.add("hidden");
}

function showPasswordEditSuccess(message) {
  const el = document.getElementById("passwordEditSuccess");
  if (!el) return;
  el.textContent = message;
  el.classList.remove("hidden");
}

function hidePasswordEditSuccess() {
  const el = document.getElementById("passwordEditSuccess");
  if (!el) return;
  el.textContent = "";
  el.classList.add("hidden");
}

async function updateUserBio(bio) {
  const body = { bio: bio };
  const candidates = [
    { method: "PATCH", path: "/auth/me" },
    { method: "PATCH", path: "/users/me" },
    { method: "PUT", path: "/auth/me" },
    { method: "PUT", path: "/users/me" },
  ];

  let response = null;
  let lastError = null;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    try {
      response = await Auth.apiRequest(candidate.path, {
        method: candidate.method,
        auth: true,
        body: body,
      });
      break;
    } catch (error) {
      lastError = error;
      if (error.status !== 404 && error.status !== 405) {
        throw error;
      }
    }
  }

  if (!response) {
    throw lastError || new Error("Impossible d'enregistrer la bio.");
  }

  const user = response.data?.user || response.data;
  if (user && user.id) {
    return user;
  }

  const meRes = await Auth.apiRequest("/auth/me", { auth: true });
  const refreshed = meRes.data?.user || meRes.data;
  if (!refreshed) {
    throw new Error("Impossible de recharger le profil.");
  }
  return refreshed;
}

function openBioModal() {
  const modal = document.getElementById("bioEditModal");
  const input = document.getElementById("bioEditInput");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  if (input) input.focus();
}

function closeBioModal() {
  const modal = document.getElementById("bioEditModal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  hideBioEditError();
}

function showBioEditError(message) {
  const el = document.getElementById("bioEditError");
  if (!el) return;
  el.textContent = message;
  el.classList.remove("hidden");
}

function hideBioEditError() {
  const el = document.getElementById("bioEditError");
  if (!el) return;
  el.textContent = "";
  el.classList.add("hidden");
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setAttr(id, attr, value) {
  const el = document.getElementById(id);
  if (el) el.setAttribute(attr, value);
}
