document.addEventListener("DOMContentLoaded", async function () {
  if (!Auth.isAuthenticated()) {
    globalThis.location.href = "index.html";
    return;
  }

  let currentUser = Auth.getUser();

  try {
    if (!currentUser) {
      const profileRes = await Auth.apiRequest("/auth/me", { auth: true });
      currentUser = profileRes.data?.user || profileRes.data;
      if (currentUser) Auth.saveUser(currentUser);
    }

    if (!currentUser) {
      throw new Error("Profil introuvable.");
    }

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

async function initChat(user) {
  currentUser = user;

  const messageForm = document.getElementById("messageForm");
  const messageInput = document.getElementById("messageInput");
  const refreshBtn = document.getElementById("refreshContactsBtn");

  if (messageForm && messageInput) {
    messageForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      const content = messageInput.value.trim();
      if (!content || !activeConversationId) return;

      messageInput.disabled = true;
      try {
        await Auth.apiRequest("/conversations/" + activeConversationId + "/messages", {
          method: "POST",
          auth: true,
          body: { content: content },
        });
        messageInput.value = "";
        await loadMessages(activeConversationId);
      } catch (error) {
        console.error(error);
      } finally {
        messageInput.disabled = false;
        messageInput.focus();
      }
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", async function () {
      await loadContacts();
      renderContactList();
    });
  }

  await loadContacts();
  renderContactList();
  showEmptyChat();
}

async function loadContacts() {
  try {
    const [usersRes, convRes] = await Promise.all([
      Auth.apiRequest("/users", { auth: true }),
      Auth.apiRequest("/conversations", { auth: true }),
    ]);

    const allUsers = usersRes.data?.users || usersRes.data || [];
    workspaceUsers = allUsers.filter(function (user) {
      return user.id !== currentUser.id;
    });

    conversations = convRes.data?.conversations || convRes.data || [];
    if (!Array.isArray(conversations)) conversations = [];
  } catch (error) {
    const nav = document.getElementById("contactsList");
    if (nav) {
      nav.innerHTML =
        '<p class="chat-muted text-sm p-4 text-center">Impossible de charger les contacts. Réessayez.</p>';
    }
    throw error;
  }
}

function getAvatarUrl(user) {
  const name = user.fullName || user.email || "U";
  if (user.avatarUrl) return user.avatarUrl;
  return "https://ui-avatar.com/api/?name=" + encodeURIComponent(name) + "&background=111827&color=fff";
}

function getConversationWithUser(userId) {
  return conversations.find(function (conv) {
    if (conv.type && conv.type !== "private") return false;
    const participants = conv.participants || [];
    return participants.some(function (p) {
      const participant = p.user || p;
      return participant.id === userId;
    });
  });
}

function getLastMessagePreview(conversation) {
  if (!conversation) return "Nouvelle conversation";
  const last = conversation.lastMessage || conversation.latestMessage;
  if (last && last.content) return last.content;
  return "Nouvelle conversation";
}

function getLastMessageTime(conversation) {
  const last = conversation && (conversation.lastMessage || conversation.latestMessage);
  if (!last || !last.createdAt) return "";
  return formatTime(last.createdAt);
}

function renderContactList() {
  const nav = document.getElementById("contactsList");
  if (!nav) return;

  nav.innerHTML = "";

  if (workspaceUsers.length === 0) {
    nav.innerHTML =
      '<p class="chat-muted text-sm p-4 text-center">Aucun autre utilisateur inscrit pour le moment.</p>';
    return;
  }

  workspaceUsers.forEach(function (user) {
    const conversation = getConversationWithUser(user.id);
    const isActive = activeContact && activeContact.id === user.id;
    const name = user.fullName || user.email || "Utilisateur";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chat-item chat-contact-btn flex items-center gap-3 p-3 rounded-xl cursor-pointer transition w-full";
    if (isActive) btn.classList.add("chat-item-active");
    btn.dataset.userId = user.id;

    btn.innerHTML =
      '<img src="' +
      escapeAttr(getAvatarUrl(user)) +
      '" alt="' +
      escapeAttr(name) +
      '" class="w-11 h-11 rounded-full object-cover shrink-0">' +
      '<div class="flex-1 min-w-0 text-left">' +
      '<div class="flex items-center justify-between gap-2">' +
      '<span class="font-semibold text-sm truncate">' +
      escapeHtml(name) +
      "</span>" +
      '<span class="chat-muted text-xs shrink-0">' +
      escapeHtml(getLastMessageTime(conversation)) +
      "</span>" +
      "</div>" +
      '<p class="chat-muted text-sm truncate">' +
      escapeHtml(getLastMessagePreview(conversation)) +
      "</p>" +
      "</div>";

    btn.addEventListener("click", function () {
      openChatWithUser(user);
    });

    nav.appendChild(btn);
  });
}

async function openChatWithUser(user) {
  activeContact = user;
  let conversation = getConversationWithUser(user.id);

  try {
    if (!conversation) {
      const res = await Auth.apiRequest("/conversations", {
        method: "POST",
        auth: true,
        body: {
          type: "private",
          participantIds: [user.id],
        },
      });
      conversation = res.data?.conversation || res.data;
      if (conversation) conversations.push(conversation);
    }

    activeConversationId = conversation.id;
    updateChatHeader(user);
    updateContactInfo(user);
    await loadMessages(activeConversationId);
    renderContactList();

    const viewChat = document.getElementById("view-chat");
    if (viewChat) viewChat.checked = true;

    const messageInput = document.getElementById("messageInput");
    if (messageInput) messageInput.focus();
  } catch (error) {
    console.error(error);
  }
}

function updateChatHeader(user) {
  const name = user.fullName || user.email || "Utilisateur";
  setText("chatHeaderName", name);
  setText("chatHeaderStatus", user.email || "");
  setAttr("chatHeaderAvatar", "src", getAvatarUrl(user));
  setAttr("chatHeaderAvatar", "alt", name);
  showChatArea();
}

function updateContactInfo(user) {
  const name = user.fullName || "Utilisateur";
  setText("contactInfoName", name);
  setText("contactInfoEmail", user.email || "—");
  setText("contactInfoBio", user.bio || "—");
  setAttr("contactInfoAvatar", "src", getAvatarUrl(user));
  setAttr("contactInfoAvatar", "alt", name);
}

async function loadMessages(conversationId) {
  const res = await Auth.apiRequest("/conversations/" + conversationId + "/messages", {
    auth: true,
  });

  const messages = res.data?.messages || res.data || [];
  renderMessages(Array.isArray(messages) ? messages : []);
}

function renderMessages(messages) {
  const container = document.getElementById("messagesContainer");
  if (!container) return;

  container.innerHTML = "";

  if (messages.length === 0) {
    container.innerHTML =
      '<p class="chat-muted text-sm text-center py-8">Aucun message. Envoyez le premier !</p>';
    return;
  }

  messages.forEach(function (msg) {
    const sender = msg.sender || {};
    const isSent = sender.id === currentUser.id;
    const bubble = document.createElement("div");
    bubble.className = "flex " + (isSent ? "justify-end" : "justify-start");

    bubble.innerHTML =
      '<div class="' +
      (isSent ? "chat-sent" : "chat-received") +
      ' max-w-[85%] md:max-w-md px-4 py-3 rounded-2xl ' +
      (isSent ? "rounded-br-sm" : "rounded-bl-sm") +
      '">' +
      '<p class="text-sm leading-relaxed">' +
      escapeHtml(msg.content || "") +
      "</p>" +
      '<span class="' +
      (isSent ? "opacity-70" : "chat-muted") +
      ' text-xs mt-2 block text-right">' +
      escapeHtml(formatTime(msg.createdAt)) +
      "</span>" +
      "</div>";

    container.appendChild(bubble);
  });

  container.scrollTop = container.scrollHeight;
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

function formatTime(dateStr) {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
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
