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
      const response = await Auth.apiRequest("/auth/me", {
        method: "PATCH",
        auth: true,
        body: { bio: bio },
      });

      const user = response.data?.user || response.data;
      if (!user) {
        throw new Error("Réponse profil invalide.");
      }

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
