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
      if (!content || !activeConversationId || (activeContact && isCurrentUser(activeContact))) return;

      messageInput.disabled = true;
      try {
        await Auth.apiRequest("/conversations/" + activeConversationId + "/messages", {
          method: "POST",
          auth: true,
          body: { content: content },
        });
        messageInput.value = "";
        await loadMessages(activeConversationId);
        await refreshChatData();
      } catch (error) {
        console.error(error);
      } finally {
        messageInput.disabled = false;
        messageInput.focus();
      }
    });
  }

  await refreshChatData();
  showEmptyChat();
  startAutoRefresh();

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
    await loadContacts();
    prefetchMissingPreviews();
    if (activeConversationId) {
      await loadMessages(activeConversationId, { silent: true });
    }
    renderContactList({ silent: true });
  } catch (error) {
    console.error(error);
  }
}

function prefetchMissingPreviews() {
  conversations.forEach(function (conv) {
    if (getLastMessage(conv)) return;

    Auth.apiRequest("/conversations/" + conv.id + "/messages", { auth: true })
      .then(function (res) {
        const messages = res.data?.messages || res.data || [];
        if (!Array.isArray(messages) || messages.length === 0) return;
        updateConversationLastMessage(conv.id, messages[messages.length - 1]);
        renderContactList({ silent: true });
      })
      .catch(function () {});
  });
}

async function loadContacts() {
  try {
    const [usersRes, convRes] = await Promise.all([
      Auth.apiRequest("/users", { auth: true }),
      Auth.apiRequest("/conversations", { auth: true }),
    ]);

    const allUsers = usersRes.data?.users || usersRes.data || [];
    workspaceUsers = allUsers.filter(function (user) {
      return !isCurrentUser(user) && !isBlockedUser(user);
    });

    const incoming = convRes.data?.conversations || convRes.data || [];
    const nextConversations = Array.isArray(incoming) ? incoming.slice() : [];
    mergeConversationPreviews(nextConversations);
    conversations = nextConversations;
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
    const participants = (conv.participants || []).map(function (p) {
      return p.user || p;
    });
    const otherParticipants = participants.filter(function (participant) {
      return !isCurrentUser(participant);
    });
    if (otherParticipants.length !== 1) return false;
    return String(otherParticipants[0].id) === String(userId);
  });
}

function mergeConversationPreviews(incomingConversations) {
  incomingConversations.forEach(function (incoming) {
    const existing = conversations.find(function (conv) {
      return String(conv.id) === String(incoming.id);
    });
    const incomingLast = getLastMessage(incoming);
    const existingLast = existing ? getLastMessage(existing) : null;

    if (existingLast && (!incomingLast || getConversationTimestamp({ lastMessage: existingLast }) > getConversationTimestamp({ lastMessage: incomingLast }))) {
      incoming.lastMessage = existingLast;
    }
  });
}

function getLastMessage(conversation) {
  if (!conversation) return null;
  return conversation.lastMessage || conversation.latestMessage || null;
}

function updateConversationLastMessage(conversationId, message) {
  if (!message) return;
  const conversation = conversations.find(function (conv) {
    return String(conv.id) === String(conversationId);
  });
  if (conversation) {
    conversation.lastMessage = message;
  }
}

function getLastMessagePreview(conversation) {
  const last = getLastMessage(conversation);
  if (last && last.content) return last.content;
  return "Aucun message";
}

function getLastMessageTime(conversation) {
  const last = getLastMessage(conversation);
  if (!last || !last.createdAt) return "";
  return formatMessageDate(last.createdAt);
}

function getConversationTimestamp(conversation) {
  const last = getLastMessage(conversation);
  if (last && last.createdAt) return new Date(last.createdAt).getTime();
  if (conversation && conversation.updatedAt) return new Date(conversation.updatedAt).getTime();
  return 0;
}

function sortUsersByRecentActivity(users) {
  return users.slice().sort(function (a, b) {
    const convA = getConversationWithUser(a.id);
    const convB = getConversationWithUser(b.id);
    return getConversationTimestamp(convB) - getConversationTimestamp(convA);
  });
}

function getContactListOrderKey() {
  return sortUsersByRecentActivity(workspaceUsers)
    .map(function (user) {
      const conversation = getConversationWithUser(user.id);
      return String(user.id) + ":" + getConversationTimestamp(conversation);
    })
    .join("|");
}

function renderContactList(options) {
  const silent = options && options.silent;
  const nav = document.getElementById("contactsList");
  if (!nav) return;

  const sortedUsers = sortUsersByRecentActivity(workspaceUsers);

  if (sortedUsers.length === 0) {
    if (!nav.querySelector(".chat-contact-btn")) {
      nav.innerHTML =
        '<p class="chat-muted text-sm p-4 text-center">Aucun autre utilisateur inscrit pour le moment.</p>';
    }
    lastContactListOrderKey = "";
    return;
  }

  const emptyState = nav.querySelector(":scope > p.text-center");
  if (emptyState) emptyState.remove();

  const existingButtons = new Map();
  nav.querySelectorAll(".chat-contact-btn").forEach(function (btn) {
    existingButtons.set(btn.dataset.userId, btn);
  });

  sortedUsers.forEach(function (user) {
    const userId = String(user.id);
    const conversation = getConversationWithUser(user.id);
    const isActive = activeContact && String(activeContact.id) === userId;
    let btn = existingButtons.get(userId);

    if (btn) {
      updateContactListItem(btn, user, conversation, isActive);
      existingButtons.delete(userId);
    } else {
      btn = createContactListItem(user, conversation, isActive);
      nav.appendChild(btn);
    }
  });

  existingButtons.forEach(function (btn) {
    btn.remove();
  });

  const orderKey = getContactListOrderKey();
  if (!silent || orderKey !== lastContactListOrderKey) {
    syncContactListOrder(nav, sortedUsers);
    lastContactListOrderKey = orderKey;
  }
}

function createContactListItem(user, conversation, isActive) {
  const userId = String(user.id);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className =
    "chat-item chat-contact-btn flex items-center gap-3 p-3 rounded-xl cursor-pointer transition w-full";
  btn.dataset.userId = userId;

  const img = document.createElement("img");
  img.className = "w-11 h-11 rounded-full object-cover shrink-0";
  img.dataset.contactAvatar = "1";

  const body = document.createElement("div");
  body.className = "flex-1 min-w-0 text-left";

  const row = document.createElement("div");
  row.className = "flex items-center justify-between gap-2";

  const nameEl = document.createElement("span");
  nameEl.className = "font-semibold text-sm truncate";
  nameEl.dataset.contactName = "1";

  const timeEl = document.createElement("span");
  timeEl.className = "chat-muted text-xs shrink-0";
  timeEl.dataset.contactTime = "1";

  const previewEl = document.createElement("p");
  previewEl.className = "chat-muted text-sm truncate";
  previewEl.dataset.contactPreview = "1";

  row.appendChild(nameEl);
  row.appendChild(timeEl);
  body.appendChild(row);
  body.appendChild(previewEl);
  btn.appendChild(img);
  btn.appendChild(body);

  btn.addEventListener("click", function () {
    const contact = workspaceUsers.find(function (item) {
      return String(item.id) === userId;
    });
    if (contact) openChatWithUser(contact);
  });

  updateContactListItem(btn, user, conversation, isActive);
  return btn;
}

function updateContactListItem(btn, user, conversation, isActive) {
  const name = user.fullName || user.email || "Utilisateur";
  const preview = getLastMessagePreview(conversation);
  const time = getLastMessageTime(conversation);
  const avatarUrl = getAvatarUrl(user);

  btn.classList.toggle("chat-item-active", !!isActive);

  const img = btn.querySelector("[data-contact-avatar]");
  if (img) {
    if (img.getAttribute("src") !== avatarUrl) img.setAttribute("src", avatarUrl);
    if (img.getAttribute("alt") !== name) img.setAttribute("alt", name);
  }

  const nameEl = btn.querySelector("[data-contact-name]");
  if (nameEl && nameEl.textContent !== name) nameEl.textContent = name;

  const timeEl = btn.querySelector("[data-contact-time]");
  if (timeEl && timeEl.textContent !== time) timeEl.textContent = time;

  const previewEl = btn.querySelector("[data-contact-preview]");
  if (previewEl && previewEl.textContent !== preview) previewEl.textContent = preview;
}

function syncContactListOrder(nav, sortedUsers) {
  sortedUsers.forEach(function (user) {
    const btn = nav.querySelector('.chat-contact-btn[data-user-id="' + user.id + '"]');
    if (btn) nav.appendChild(btn);
  });
}

async function openChatWithUser(user) {
  if (isCurrentUser(user)) return;

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
    renderedMessageKeys = [];
    await loadMessages(activeConversationId);
    renderContactList({ silent: true });

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

async function loadMessages(conversationId, options) {
  const silent = options && options.silent;
  const res = await Auth.apiRequest("/conversations/" + conversationId + "/messages", {
    auth: true,
  });

  const messages = res.data?.messages || res.data || [];
  const list = Array.isArray(messages) ? messages : [];

  if (list.length > 0) {
    updateConversationLastMessage(conversationId, list[list.length - 1]);
  }

  if (silent && activeConversationId === conversationId && appendNewMessages(list)) {
    return;
  }

  renderMessages(list);
}

function getMessageKey(message) {
  if (message.id) return String(message.id);
  return String(message.createdAt || "") + "|" + String(message.content || "");
}

function appendNewMessages(messages) {
  const container = document.getElementById("messagesContainer");
  if (!container) return false;

  const emptyState = container.querySelector(":scope > p.text-center");
  if (emptyState) return false;

  if (messages.length < renderedMessageKeys.length) return false;

  for (let i = 0; i < renderedMessageKeys.length; i++) {
    if (getMessageKey(messages[i]) !== renderedMessageKeys[i]) return false;
  }

  if (messages.length === renderedMessageKeys.length) return true;

  const wasAtBottom =
    container.scrollHeight - container.scrollTop - container.clientHeight < 80;

  for (let i = renderedMessageKeys.length; i < messages.length; i++) {
    container.appendChild(createMessageBubble(messages[i]));
    renderedMessageKeys.push(getMessageKey(messages[i]));
  }

  if (wasAtBottom) {
    container.scrollTop = container.scrollHeight;
  }

  return true;
}

function createMessageBubble(msg) {
  const sender = msg.sender || {};
  const isSent = isCurrentUser(sender);
  const bubble = document.createElement("div");
  bubble.className = "flex " + (isSent ? "justify-end" : "justify-start");
  bubble.dataset.messageKey = getMessageKey(msg);

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
    escapeHtml(formatMessageDate(msg.createdAt)) +
    "</span>" +
    "</div>";

  return bubble;
}

function renderMessages(messages) {
  const container = document.getElementById("messagesContainer");
  if (!container) return;

  container.innerHTML = "";
  renderedMessageKeys = [];

  if (messages.length === 0) {
    container.innerHTML =
      '<p class="chat-muted text-sm text-center py-8">Aucun message. Envoyez le premier !</p>';
    return;
  }

  messages.forEach(function (msg) {
    container.appendChild(createMessageBubble(msg));
    renderedMessageKeys.push(getMessageKey(msg));
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
