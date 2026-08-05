document.addEventListener("DOMContentLoaded", async function () {
  if (!Auth.isAuthenticated()) {
    globalThis.location.href = "index.html";
    return;
  }

  try {
    const profileRes = await Auth.apiRequest("/auth/me", { auth: true });
    const currentUser = profileRes.data?.user || profileRes.data;

    if (!currentUser) {
      throw new Error("Profil introuvable.");
    }

    Auth.saveUser(currentUser);
    await initChat(currentUser);
  } catch (error) {
    if (error.status === 401) {
      Auth.clearAuth();
      globalThis.location.href = "index.html";
    }
  }
});

let currentUser = null;
let workspaceUsers = [];
let conversations = [];
let activeContact = null;
let activeConversationId = null;
let refreshTimer = null;
let renderedMessageKeys = [];
let lastContactListOrderKey = "";
let currentMessages = [];
let messageSearchQuery = "";
let contactsLoading = false;
let contactsLoadError = null;
let messagesLoading = false;
let editingMessageId = null;
let chatToastTimer = null;
let unreadByConversation = {};
let contextMenuMessageId = null;
let previewReadyConversations = new Set();
let sendingMessage = false;

const REFRESH_INTERVAL_MS = 1500;

function isCurrentUser(user) {
  if (!user || !currentUser) return false;
  if (user.id && currentUser.id && String(user.id) === String(currentUser.id)) return true;
  if (user.email && currentUser.email && user.email.toLowerCase() === currentUser.email.toLowerCase()) {
    return true;
  }
  return false;
}

async function initChat(user) {
  currentUser = user;

  const messageForm = document.getElementById("messageForm");
  const messageInput = document.getElementById("messageInput");

  if (messageForm && messageInput) {
    messageForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      const content = messageInput.value.trim();
      if (!content) return;

      messageInput.value = "";

      try {
        await sendChatMessage(content);
      } catch (error) {
        showChatToast(error.message || "Impossible d'envoyer le message.", true);
      } finally {
        messageInput.focus();
      }
    });
  }

  initImageUpload();

  initMessageSearch();
  initMessageActions();
  initContactInfoActions();

  try {
    await loadContacts({ showLoading: true });
    renderContactList();
    await refreshConversationPreviews();
    renderContactList({ silent: true });
  } catch (error) {
    console.error(error);
  }

  showEmptyChat();
  startAutoRefresh();
  initProfileUpdateListener();

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      stopAutoRefresh();
    } else {
      refreshChatData();
      startAutoRefresh();
    }
  });
}

function startAutoRefresh() {
  stopAutoRefresh();
  refreshTimer = setInterval(refreshChatData, REFRESH_INTERVAL_MS);
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

async function refreshChatData() {
  try {
    await loadContacts({ silent: true });
    await refreshConversationPreviews();
    if (activeConversationId && !sendingMessage) {
      await loadMessages(activeConversationId, { silent: true });
    }
    renderContactList({ silent: true });
  } catch (error) {
    console.error(error);
  }
}

function initProfileUpdateListener() {
  document.addEventListener("egmon-profile-updated", function (event) {
    const user = event.detail;
    if (!user) return;

    currentUser = user;

    if (activeContact && isCurrentUser(activeContact)) {
      updateContactInfo(activeContact);
    }

    refreshChatData();
  });
}

function getMessageKey(message) {
  if (message.id) return String(message.id);
  return String(message.createdAt || "") + "|" + String(message.content || "");
}

function buildChatStateHtml(type, options) {
  const title = options.title || "";
  const text = options.text || "";
  const spinner = type === "loading" ? '<span class="chat-state-spinner" aria-hidden="true"></span>' : "";
  const icon =
    type === "empty"
      ? '<svg class="chat-state-icon" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>'
      : type === "error"
        ? '<svg class="chat-state-icon" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>'
        : "";

  return (
    '<div class="chat-state" data-state="' +
    type +
    '">' +
    (spinner || icon) +
    (title ? '<p class="chat-state-title">' + escapeHtml(title) + "</p>" : "") +
    (text ? '<p class="chat-state-text">' + escapeHtml(text) + "</p>" : "") +
    "</div>"
  );
}

function showChatToast(message, isError) {
  const toast = document.getElementById("chatToast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.remove("hidden", "chat-toast--error");
  if (isError) toast.classList.add("chat-toast--error");

  if (chatToastTimer) clearTimeout(chatToastTimer);
  chatToastTimer = setTimeout(function () {
    toast.classList.add("hidden");
  }, 3200);
}

function showEmptyChat() {
  const empty = document.getElementById("chatEmptyState");
  const active = document.getElementById("chatActiveArea");
  if (empty) empty.classList.remove("hidden");
  if (active) active.classList.add("hidden");
}

function showChatArea() {
  const empty = document.getElementById("chatEmptyState");
  const active = document.getElementById("chatActiveArea");
  if (empty) empty.classList.add("hidden");
  if (active) active.classList.remove("hidden");
}

function formatMessageDate(dateStr) {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - 6);

    if (date >= startOfToday) {
      return date.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    if (date >= startOfYesterday) {
      return "Hier";
    }
    if (date >= startOfWeek) {
      return date.toLocaleDateString("fr-FR", { weekday: "short" });
    }
    return date.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  } catch (error) {
    return "";
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setAttr(id, attr, value) {
  const el = document.getElementById(id);
  if (el) el.setAttribute(attr, value);
}
