function getUserDisplayName(user) {
  if (!user) return "Utilisateur";
  return user.fullName || user.email || "Utilisateur";
}

function getUserInitials(name) {
  const cleaned = (name || "U").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

function isValidAvatarUrl(url) {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed === "null") return false;
  return /^https?:\/\//i.test(trimmed);
}

function applyAvatarSlot(config) {
  const wrap = config.wrap;
  const img = config.img;
  const initialsEl = config.initials;
  const name = config.name || "Utilisateur";
  const avatarUrl = config.avatarUrl;

  if (!wrap || !initialsEl) return;

  const letters = getUserInitials(name);
  const nextUrl = isValidAvatarUrl(avatarUrl) ? avatarUrl.trim() : "";
  const prevUrl = wrap.dataset.avatarUrl || "";
  const prevState = wrap.dataset.avatarState || "";

  initialsEl.textContent = letters;
  if (img) img.alt = name;

  if (nextUrl === prevUrl && prevState === (nextUrl ? "image" : "initials")) {
    return;
  }

  wrap.dataset.avatarUrl = nextUrl;
  wrap.dataset.avatarState = nextUrl ? "image" : "initials";

  if (img) {
    img.onerror = showInitials;
    img.onload = function () {
      if (img.src && img.naturalWidth > 0) {
        img.classList.remove("hidden");
        initialsEl.classList.add("hidden");
        wrap.classList.remove("profile-avatar-wrap--fallback");
        wrap.dataset.avatarState = "image";
      } else {
        showInitials();
      }
    };
  }

  function showInitials() {
    wrap.dataset.avatarUrl = "";
    wrap.dataset.avatarState = "initials";
    if (img) {
      img.classList.add("hidden");
      img.removeAttribute("src");
    }
    initialsEl.classList.remove("hidden");
    wrap.classList.add("profile-avatar-wrap--fallback");
  }

  function showImage(src) {
    if (!img) {
      showInitials();
      return;
    }
    if (img.getAttribute("src") === src && !img.classList.contains("hidden")) {
      return;
    }
    initialsEl.classList.add("hidden");
    wrap.classList.remove("profile-avatar-wrap--fallback");
    if (img.getAttribute("src") !== src) {
      img.classList.add("hidden");
      img.src = src;
    } else {
      img.classList.remove("hidden");
    }
  }

  if (nextUrl) {
    showImage(nextUrl);
  } else {
    showInitials();
  }
}

function buildAvatarSlot(user, sizeClass) {
  const name = getUserDisplayName(user);
  const wrap = document.createElement("div");
  wrap.className =
    "profile-avatar-wrap " + (sizeClass || "profile-avatar-wrap--md") + " shrink-0";

  const img = document.createElement("img");
  img.className = "profile-avatar-img";
  img.dataset.contactAvatar = "1";

  const initials = document.createElement("span");
  initials.className = "profile-avatar-initials";
  initials.setAttribute("aria-hidden", "true");

  wrap.appendChild(img);
  wrap.appendChild(initials);

  applyAvatarSlot({
    wrap: wrap,
    img: img,
    initials: initials,
    name: name,
    avatarUrl: user.avatarUrl,
  });

  return wrap;
}

const Avatars = {
  getUserDisplayName,
  getUserInitials,
  isValidAvatarUrl,
  applyAvatarSlot,
  buildAvatarSlot,
};
