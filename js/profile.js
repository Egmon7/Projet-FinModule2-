document.addEventListener("DOMContentLoaded", async function () {
  // ── Garde : utilisateur non connecté ──
  if (!Auth.isAuthenticated()) {
    globalThis.location.href = "index.html";
    return;
  }

  // ── Boutons de déconnexion ──
  document.querySelectorAll("[data-logout]").forEach(function (btn) {
    btn.addEventListener("click", async function (event) {
      event.preventDefault();
      await Auth.logout();
      globalThis.location.href = "index.html";
    });
  });

  try {
    const response = await Auth.apiRequest("/auth/me", { auth: true });

    // Structure API : { success: true, data: { ...user } }
    const user = response.data?.user || response.data;

    if (!user) {
      throw new Error("Profil introuvable.");
    }

    Auth.saveUser(user);
    displayProfile(user);

  } catch (error) {
    // Token expiré ou invalide → déconnexion
    if (error.message === "Profil introuvable." || error.status === 401) {
      Auth.clearAuth();
      globalThis.location.href = "index.html";
      return;
    }

    // Sinon afficher les données en cache
    const cachedUser = Auth.getUser();
    if (cachedUser) {
      displayProfile(cachedUser);
    }
  }
});


 //Affiche les infos utilisateur 
 
function displayProfile(user) {
  const name = user.fullName || "Utilisateur";
  const email = user.email || "—";
  const avatar = user.avatarUrl || "https://ui-avatar.com/api/?name=" + encodeURIComponent(name) + "&background=111827&color=fff";

  // Bouton en bas de la sidebar
  setText("profileBtnName", name);
  setAttr("profileBtnAvatar", "src", avatar);
  setAttr("profileBtnAvatar", "alt", name);

  // Panneau latéral « Mon profil » : avatar, nom, email uniquement
  setAttr("profilePanelAvatar", "src", avatar);
  setAttr("profilePanelAvatar", "alt", name);
  setText("profilePanelName", name);
  setText("profilePanelEmail", email);
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setAttr(id, attr, value) {
  const el = document.getElementById(id);
  if (el) el.setAttribute(attr, value);
}
