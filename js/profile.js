document.addEventListener("DOMContentLoaded", async function () {
  // Redirige vers login si pas de token
  if (!Auth.isAuthenticated()) {    globalThis.location.href = "index.html";
    return;
  }

  // Déconnexion : API + nettoyage localStorage
  document.querySelectorAll("[data-logout]").forEach(function (btn) {    btn.addEventListener("click", async function (event) {
      event.preventDefault();
      await Auth.logout();
      globalThis.location.href = "index.html";
    });
  });

  // Active les boutons bio et photo avant le chargement du profil
  initBioEditor();
  initAvatarEditor();

  // Charge le profil depuis l'API (ou cache local en secours)
  try {    const response = await Auth.apiRequest("/auth/me", { auth: true });
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

// Affiche nom, email, bio et avatars dans le panneau profil + sidebar
function displayProfile(user) {
  const name = Avatars.getUserDisplayName(user);
  const email = user.email || "—";
  const bio = user.bio && user.bio.trim() ? user.bio.trim() : "Aucune bio pour le moment.";

  Avatars.applyAvatarSlot({
    wrap: document.getElementById("profilePanelAvatarWrap"),
    img: document.getElementById("profilePanelAvatar"),
    initials: document.getElementById("profilePanelInitials"),
    name: name,
    avatarUrl: user.avatarUrl,
  });

  Avatars.applyAvatarSlot({
    wrap: document.getElementById("profileBtnAvatarWrap"),
    img: document.getElementById("profileBtnAvatar"),
    initials: document.getElementById("profileBtnInitials"),
    name: name,
    avatarUrl: user.avatarUrl,
  });

  setText("profileBtnName", name);
  setText("profilePanelName", name);
  setText("profilePanelEmail", email);
  setText("profilePanelBio", bio);
}

// Cache le message d'erreur sous l'avatar
function hideProfileAvatarError() {
  const el = document.getElementById("profileAvatarError");
  if (!el) return;
  el.textContent = "";
  el.classList.add("hidden");
}

// Affiche une erreur d'upload photo sous l'avatar
function showProfileAvatarError(message) {
  const el = document.getElementById("profileAvatarError");
  if (!el) return;
  el.textContent = message;
  el.classList.remove("hidden");
}

// Bouton + :  fichier → Cloudinary → sauvegarde avatarUrl sur l'API
function initAvatarEditor() {
  const pickBtn = document.getElementById("profileAvatarBtn");
  const fileInput = document.getElementById("profileAvatarInput");

  if (!pickBtn || !fileInput) return;

  pickBtn.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    hideProfileAvatarError();
    if (!pickBtn.disabled) fileInput.click();
  });

  fileInput.addEventListener("change", async function () {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!file) return;

    pickBtn.disabled = true;

    try {
      const imageUrl = await Cloudinary.uploadImageToCloudinary(file);
      const user = await updateUserProfile({ avatarUrl: imageUrl });
      Auth.saveUser(user);
      displayProfile(user);
      hideProfileAvatarError();
      document.dispatchEvent(
        new CustomEvent("egmon-profile-updated", {
          detail: user,
        })
      );
    } catch (error) {
      showProfileAvatarError(error.message || "Impossible de mettre à jour la photo.");
    } finally {
      pickBtn.disabled = false;
    }
  });
}

// Envoie bio ou avatarUrl à l'API 
async function updateUserProfile(fields) {
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
        body: fields,
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
    throw lastError || new Error("Impossible de mettre à jour le profil.");
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

// Modal « Modifier ma bio » : ouverture, enregistrement, annulation
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
      const user = await updateUserProfile({ bio: bio });
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

// Ouvre la modal d'édition de la bio
function openBioModal() {
  const modal = document.getElementById("bioEditModal");
  const input = document.getElementById("bioEditInput");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  if (input) input.focus();
}

// Ferme la modal d'édition de la bio
function closeBioModal() {
  const modal = document.getElementById("bioEditModal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  hideBioEditError();
}

// Message d'erreur dans la modal bio
function showBioEditError(message) {
  const el = document.getElementById("bioEditError");
  if (!el) return;
  el.textContent = message;
  el.classList.remove("hidden");
}

// Efface le message d'erreur de la modal bio
function hideBioEditError() {
  const el = document.getElementById("bioEditError");
  if (!el) return;
  el.textContent = "";
  el.classList.add("hidden");
}

// Met à jour le texte d'un élément HTML par son id
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// Met à jour un attribut HTML par id DS
function setAttr(id, attr, value) {
  const el = document.getElementById(id);
  if (el) el.setAttribute(attr, value);
}
