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
let contactSearchQuery = "";
let messageSearchQuery = "";
let messagesCacheByConversation = {};
let contactsLoading = false;
let contactsLoadError = null;
let messagesLoading = false;
let editingMessageId = null;
let chatToastTimer = null;
let unreadByConversation = {};
let contextMenuMessageId = null;
let previewReadyConversations = new Set();

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

      messageInput.disabled = true;
      try {
        await sendChatMessage(content);
        messageInput.value = "";
      } catch (error) {
        showChatToast(error.message || "Impossible d'envoyer le message.", true);
      } finally {
        messageInput.disabled = false;
      }
    });
  }

  initImageUpload();

  initMessageSearch();
  initContactSearch();
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
    if (activeConversationId) {
      await loadMessages(activeConversationId, { silent: true });
    }
    renderContactList({ silent: true });
  } catch (error) {
    console.error(error);
  }
}

async function refreshConversationPreviews() {
  if (conversations.length === 0) return;

  await Promise.all(
    conversations.map(function (conv) {
      if (activeConversationId && String(conv.id) === String(activeConversationId)) {
        return Promise.resolve();
      }
      return syncConversationPreview(conv.id);
    })
  );

  if (contactSearchQuery) {
    renderContactList({ silent: true });
  }
}

async function syncConversationPreview(conversationId) {
  try {
    const res = await Auth.apiRequest("/conversations/" + conversationId + "/messages", {
      auth: true,
    });
    const messages = res.data?.messages || res.data || [];
    if (!Array.isArray(messages) || messages.length === 0) return;

    cacheConversationMessages(conversationId, messages);

    const latest = messages[messages.length - 1];
    const previous = getLastMessage(
      conversations.find(function (conv) {
        return String(conv.id) === String(conversationId);
      })
    );
    const previousKey = previous ? getMessageKey(previous) : "";
    updateConversationLastMessage(conversationId, latest);

    if (getMessageKey(latest) !== previousKey && !isCurrentUser(latest.sender || {})) {
      unreadByConversation[String(conversationId)] = getMessageKey(latest);
    }
  } catch (error) {
    // Ignorer les erreurs de prévisualisation en arrière-plan.
  } finally {
    markConversationPreviewReady(conversationId);
  }
}

function markConversationPreviewReady(conversationId) {
  if (conversationId) previewReadyConversations.add(String(conversationId));
}

function isConversationPreviewReady(conversationId) {
  return previewReadyConversations.has(String(conversationId));
}

async function loadContacts(options) {
  const silent = options && options.silent;
  const showLoading = options && options.showLoading;

  if (showLoading) {
    contactsLoading = true;
    contactsLoadError = null;
    renderContactList();
  }

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
    conversations.forEach(function (conv) {
      if (getLastMessage(conv)) markConversationPreviewReady(conv.id);
    });
    contactsLoadError = null;
  } catch (error) {
    contactsLoadError = error.message || "Impossible de charger les contacts.";
    if (!silent) {
      renderContactList();
    }
    throw error;
  } finally {
    contactsLoading = false;
  }
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

    if (incomingLast && existingLast) {
      if (
        getConversationTimestamp({ lastMessage: existingLast }) >
        getConversationTimestamp({ lastMessage: incomingLast })
      ) {
        incoming.lastMessage = existingLast;
      }
    } else if (!incomingLast && existingLast) {
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

function hasUnreadConversation(conversation) {
  if (!conversation) return false;
  if (activeConversationId && String(conversation.id) === String(activeConversationId)) return false;
  return Boolean(unreadByConversation[String(conversation.id)]);
}

function markConversationAsRead(conversationId) {
  if (!conversationId) return;
  delete unreadByConversation[String(conversationId)];
}

function getLastMessagePreview(conversation) {
  if (!conversation) return "Commencer la conversation";
  const last = getLastMessage(conversation);
  if (last && last.content) {
    return Cloudinary.getMessagePreviewLabel(last.content);
  }
  if (!isConversationPreviewReady(conversation.id)) return "Chargement…";
  return "Aucun message";
}

async function sendChatMessage(content) {
  if (!content || !activeConversationId) {
    throw new Error("Ouvrez une conversation pour envoyer un message.");
  }
  if (activeContact && isCurrentUser(activeContact)) {
    throw new Error("Impossible d'envoyer un message à vous-même.");
  }

  await Auth.apiRequest("/conversations/" + activeConversationId + "/messages", {
    method: "POST",
    auth: true,
    body: { content: content },
  });

  await loadMessages(activeConversationId, { silent: true, force: true });
  await refreshChatData();
}

function initImageUpload() {
  const fileInput = document.getElementById("messageImageInput");
  const pickBtn = document.getElementById("messageImageBtn");
  const preview = document.getElementById("messageImagePreview");
  const icon = document.getElementById("messageImageIcon");
  const spinner = document.getElementById("messageImageSpinner");

  if (!fileInput || !pickBtn) return;

  let previewObjectUrl = null;

  function clearImagePreview() {
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = null;
    }
    if (preview) {
      preview.src = "";
      preview.classList.add("hidden");
    }
    if (icon) icon.classList.remove("hidden");
    if (spinner) spinner.classList.add("hidden");
    pickBtn.classList.remove("chat-image-pick-btn--busy");
  }

  function showImagePreview(file) {
    clearImagePreview();
    previewObjectUrl = URL.createObjectURL(file);
    if (preview) {
      preview.src = previewObjectUrl;
      preview.classList.remove("hidden");
    }
    if (icon) icon.classList.add("hidden");
  }

  function showImageUploading() {
    if (icon) icon.classList.add("hidden");
    if (spinner) spinner.classList.remove("hidden");
    pickBtn.classList.add("chat-image-pick-btn--busy");
  }

  pickBtn.addEventListener("click", function () {
    if (pickBtn.disabled) return;
    if (!activeConversationId) {
      showChatToast("Choisissez un contact avant d'envoyer une photo.", true);
      return;
    }
    if (activeContact && isCurrentUser(activeContact)) {
      showChatToast("Impossible d'envoyer une photo à vous-même.", true);
      return;
    }
    fileInput.click();
  });

  fileInput.addEventListener("change", async function () {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!file) return;

    showImagePreview(file);
    pickBtn.disabled = true;
    showImageUploading();

    try {
      const imageUrl = await Cloudinary.uploadImageToCloudinary(file);
      await sendChatMessage(imageUrl);
      showChatToast("Photo envoyée.");
    } catch (error) {
      showChatToast(error.message || "Impossible d'envoyer la photo.", true);
    } finally {
      clearImagePreview();
      pickBtn.disabled = false;
    }
  });
}

function buildMessageBodyHtml(content) {
  if (Cloudinary.isImageMessageContent(content)) {
    return (
      '<div class="chat-message-image-wrap">' +
      '<img src="' +
      escapeAttr(content.trim()) +
      '" alt="Photo" class="chat-message-image" loading="lazy">' +
      "</div>"
    );
  }

  return (
    '<p class="text-sm leading-relaxed chat-message-content">' + escapeHtml(content || "") + "</p>"
  );
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

function cacheConversationMessages(conversationId, messages) {
  if (!conversationId || !Array.isArray(messages)) return;
  messagesCacheByConversation[String(conversationId)] = messages;
}

function messageContentMatchesQuery(content, query) {
  if (!query) return false;
  const text = (content || "").toLowerCase();
  if (Cloudinary.isImageMessageContent(content || "")) {
    return ("photo image " + text).includes(query);
  }
  return text.includes(query);
}

function conversationMatchesMessageSearch(conversationId, query) {
  if (!query || !conversationId) return false;
  const messages = messagesCacheByConversation[String(conversationId)];
  if (!Array.isArray(messages) || messages.length === 0) return false;

  return messages.some(function (msg) {
    return messageContentMatchesQuery(msg.content || "", query);
  });
}

function matchesContactSearch(user) {
  if (!contactSearchQuery) return true;
  const name = (user.fullName || "").toLowerCase();
  const email = (user.email || "").toLowerCase();
  const conversation = getConversationWithUser(user.id);
  const preview = getLastMessagePreview(conversation).toLowerCase();

  if (
    name.includes(contactSearchQuery) ||
    email.includes(contactSearchQuery) ||
    preview.includes(contactSearchQuery)
  ) {
    return true;
  }

  if (conversation && conversationMatchesMessageSearch(conversation.id, contactSearchQuery)) {
    return true;
  }

  return false;
}

function filterContacts(users) {
  return users.filter(matchesContactSearch);
}

function initContactSearch() {
  const searchInput = document.getElementById("contactSearchInput");
  if (!searchInput) return;

  searchInput.addEventListener("input", function () {
    contactSearchQuery = searchInput.value.trim().toLowerCase();
    renderContactList();
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

  if (contactsLoading) {
    nav.innerHTML = buildChatStateHtml("loading", {
      title: "Chargement…",
      text: "Récupération des contacts et conversations",
    });
    lastContactListOrderKey = "";
    return;
  }

  if (contactsLoadError) {
    nav.innerHTML = buildChatStateHtml("error", {
      title: "Erreur de chargement",
      text: contactsLoadError,
    });
    lastContactListOrderKey = "";
    return;
  }

  const sortedUsers = sortUsersByRecentActivity(workspaceUsers);
  const visibleUsers = filterContacts(sortedUsers);

  if (sortedUsers.length === 0) {
    if (!nav.querySelector(".chat-contact-btn")) {
      nav.innerHTML = buildChatStateHtml("empty", {
        title: "Aucun contact",
        text: "Aucun autre utilisateur inscrit pour le moment.",
      });
    }
    lastContactListOrderKey = "";
    return;
  }

  if (visibleUsers.length === 0) {
    nav.innerHTML = buildChatStateHtml("empty", {
      title: "Aucun résultat",
      text: "Aucune conversation ne correspond à votre recherche.",
    });
    lastContactListOrderKey = "";
    return;
  }

  const emptyState = nav.querySelector(":scope > .chat-state");
  if (emptyState) emptyState.remove();

  const existingButtons = new Map();
  nav.querySelectorAll(".chat-contact-btn").forEach(function (btn) {
    existingButtons.set(btn.dataset.userId, btn);
  });

  visibleUsers.forEach(function (user) {
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
    syncContactListOrder(nav, visibleUsers);
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

  const avatarWrap = Avatars.buildAvatarSlot(user, "profile-avatar-wrap--md");

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
  btn.appendChild(avatarWrap);
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
  const name = Avatars.getUserDisplayName(user);
  const preview = getLastMessagePreview(conversation);
  const time = getLastMessageTime(conversation);
  const unread = hasUnreadConversation(conversation);

  btn.classList.toggle("chat-item-active", !!isActive);
  btn.classList.toggle("chat-contact-unread", unread);

  const avatarWrap = btn.querySelector(".profile-avatar-wrap");
  if (avatarWrap) {
    Avatars.applyAvatarSlot({
      wrap: avatarWrap,
      img: avatarWrap.querySelector(".profile-avatar-img"),
      initials: avatarWrap.querySelector(".profile-avatar-initials"),
      name: name,
      avatarUrl: user.avatarUrl,
    });
  }

  const nameEl = btn.querySelector("[data-contact-name]");
  if (nameEl) {
    if (nameEl.textContent !== name) nameEl.textContent = name;
    nameEl.classList.toggle("font-bold", unread);
  }

  const timeEl = btn.querySelector("[data-contact-time]");
  if (timeEl) {
    if (timeEl.textContent !== time) timeEl.textContent = time;
    timeEl.classList.toggle("chat-muted", !unread);
    timeEl.classList.toggle("font-semibold", unread);
  }

  const previewEl = btn.querySelector("[data-contact-preview]");
  if (previewEl) {
    if (previewEl.textContent !== preview) previewEl.textContent = preview;
    const isLoadingPreview = preview === "Chargement…";
    previewEl.classList.toggle("chat-muted", !unread || isLoadingPreview);
    previewEl.classList.toggle("chat-unread-preview", unread);
    previewEl.classList.toggle("font-semibold", unread);
    previewEl.classList.toggle("chat-preview-loading", isLoadingPreview);
  }
}

function syncContactListOrder(nav, sortedUsers) {
  sortedUsers.forEach(function (user) {
    const btn = nav.querySelector('.chat-contact-btn[data-user-id="' + user.id + '"]');
    if (btn) nav.appendChild(btn);
  });
}

async function openChatWithUser(user) {
  if (isCurrentUser(user)) return;

  closeMessageSearch();
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
    markConversationAsRead(activeConversationId);
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
  const name = Avatars.getUserDisplayName(user);
  setText("chatHeaderName", name);
  setText("chatHeaderStatus", user.email || "");
  Avatars.applyAvatarSlot({
    wrap: document.getElementById("chatHeaderAvatarWrap"),
    img: document.getElementById("chatHeaderAvatar"),
    initials: document.getElementById("chatHeaderInitials"),
    name: name,
    avatarUrl: user.avatarUrl,
  });
  showChatArea();
}

function updateContactInfo(user) {
  const name = Avatars.getUserDisplayName(user);
  setText("contactInfoName", name);
  setText("contactInfoEmail", user.email || "—");
  setText("contactInfoBio", user.bio || "—");
  Avatars.applyAvatarSlot({
    wrap: document.getElementById("contactInfoAvatarWrap"),
    img: document.getElementById("contactInfoAvatar"),
    initials: document.getElementById("contactInfoInitials"),
    name: name,
    avatarUrl: user.avatarUrl,
  });

  const conversation = getConversationWithUser(user.id);
  const deleteWrap = document.getElementById("deleteConversationWrap");
  if (deleteWrap) {
    deleteWrap.classList.toggle("hidden", !conversation);
  }
}

function initContactInfoActions() {
  const deleteBtn = document.getElementById("deleteConversationBtn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", deleteActiveConversation);
  }
}

async function deleteActiveConversation() {
  if (!activeConversationId) return;

  if (!globalThis.confirm("Supprimer cette conversation ? Tous les messages seront effacés.")) {
    return;
  }

  const conversationId = activeConversationId;

  try {
    await Auth.apiRequest("/conversations/" + conversationId, {
      method: "DELETE",
      auth: true,
    });

    conversations = conversations.filter(function (conv) {
      return String(conv.id) !== String(conversationId);
    });
    delete unreadByConversation[String(conversationId)];
    previewReadyConversations.delete(String(conversationId));

    activeConversationId = null;
    activeContact = null;
    currentMessages = [];
    editingMessageId = null;
    renderedMessageKeys = [];
    lastContactListOrderKey = "";

    closeMessageSearch();
    closeContactInfoPanel();
    showEmptyChat();
    await refreshChatData();
    showChatToast("Conversation supprimée.");
  } catch (error) {
    showChatToast(error.message || "Impossible de supprimer la conversation.", true);
  }
}

function closeContactInfoPanel() {
  const toggle = document.getElementById("toggle-profile-info");
  if (toggle) toggle.checked = false;
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

async function loadMessages(conversationId, options) {
  const silent = options && options.silent;
  const force = options && options.force;

  if (!silent) {
    messagesLoading = true;
    editingMessageId = null;
    showMessagesPanelState("loading");
  }

  try {
    const res = await Auth.apiRequest("/conversations/" + conversationId + "/messages", {
      auth: true,
    });

    const messages = res.data?.messages || res.data || [];
    const list = Array.isArray(messages) ? messages : [];
    currentMessages = list;
    cacheConversationMessages(conversationId, list);

    if (list.length > 0) {
      updateConversationLastMessage(conversationId, list[list.length - 1]);
    }

    if (activeConversationId === conversationId) {
      markConversationAsRead(conversationId);
    }

    markConversationPreviewReady(conversationId);

    if (!force && silent && activeConversationId === conversationId && syncRenderedMessages(list)) {
      if (messageSearchQuery) applyMessageSearch();
      return;
    }

    renderMessages(list);
  } catch (error) {
    if (!silent) {
      showMessagesPanelState("error", error.message || "Impossible de charger les messages.");
    }
    throw error;
  } finally {
    messagesLoading = false;
  }
}

function getMessageKey(message) {
  if (message.id) return String(message.id);
  return String(message.createdAt || "") + "|" + String(message.content || "");
}

function syncRenderedMessages(messages) {
  const container = document.getElementById("messagesContainer");
  if (!container) return false;

  const panelState = container.querySelector(":scope > .chat-state");
  if (panelState) return false;

  if (messages.length < renderedMessageKeys.length) {
    return false;
  }

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
  const messageId = msg.id ? String(msg.id) : "";
  const isEdited = msg.updatedAt && msg.createdAt && msg.updatedAt !== msg.createdAt;
  const isEditing = editingMessageId && messageId && editingMessageId === messageId;
  const bubble = document.createElement("div");
  bubble.className = "flex " + (isSent ? "justify-end" : "justify-start");
  bubble.dataset.messageKey = getMessageKey(msg);
  if (messageId) bubble.dataset.messageId = messageId;

  if (isEditing) {
    bubble.innerHTML =
      '<div class="chat-bubble-row chat-bubble-row--sent">' +
      '<div class="chat-bubble-wrap">' +
      '<div class="chat-sent chat-bubble-inner max-w-full px-4 py-3 rounded-2xl rounded-br-sm">' +
      '<textarea class="chat-edit-input" data-edit-input="1"></textarea>' +
      '<div class="chat-edit-actions">' +
      '<button type="button" class="chat-edit-btn" data-action="save-edit" data-message-id="' +
      escapeAttr(messageId) +
      '">Enregistrer</button>' +
      '<button type="button" class="chat-edit-btn" data-action="cancel-edit">Annuler</button>' +
      "</div></div></div></div>";
    return bubble;
  }

  const menuBtn =
    isSent && messageId && editingMessageId !== messageId
      ? '<button type="button" class="chat-message-more-btn" data-action="open-menu" aria-label="Options du message">' +
        '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
        '<circle cx="12" cy="5" r="1.75"/><circle cx="12" cy="12" r="1.75"/><circle cx="12" cy="19" r="1.75"/>' +
        "</svg></button>"
      : "";

  bubble.innerHTML =
    '<div class="chat-bubble-row' +
    (isSent ? " chat-bubble-row--sent" : "") +
    '">' +
    menuBtn +
    '<div class="chat-bubble-wrap">' +
    '<div class="' +
    (isSent ? "chat-sent" : "chat-received") +
    " chat-bubble-inner max-w-full px-4 py-3 rounded-2xl " +
    (isSent ? "rounded-br-sm" : "rounded-bl-sm") +
    '">' +
    buildMessageBodyHtml(msg.content || "") +
    (isEdited ? '<span class="chat-message-edited block text-right mt-1">Modifié</span>' : "") +
    '<span class="' +
    (isSent ? "opacity-70" : "chat-muted") +
    ' text-xs mt-2 block text-right">' +
    escapeHtml(formatMessageDate(msg.createdAt)) +
    "</span>" +
    "</div></div></div>";

  return bubble;
}

function renderMessages(messages) {
  const container = document.getElementById("messagesContainer");
  if (!container) return;

  container.innerHTML = "";
  renderedMessageKeys = [];
  hideSearchEmptyState();

  if (messages.length === 0) {
    showMessagesPanelState("empty");
    return;
  }

  messages.forEach(function (msg) {
    container.appendChild(createMessageBubble(msg));
    renderedMessageKeys.push(getMessageKey(msg));
  });

  container.scrollTop = container.scrollHeight;

  if (messageSearchQuery) applyMessageSearch();
}

function initMessageSearch() {
  const searchInput = document.getElementById("messageSearchInput");
  const toggleSearch = document.getElementById("toggle-search");

  if (searchInput) {
    searchInput.addEventListener("input", function () {
      messageSearchQuery = searchInput.value.trim().toLowerCase();
      applyMessageSearch();
    });
  }

  if (toggleSearch) {
    toggleSearch.addEventListener("change", function () {
      if (toggleSearch.checked && searchInput) {
        searchInput.focus();
        return;
      }
      clearMessageSearch();
    });
  }
}

function closeMessageSearch() {
  const toggleSearch = document.getElementById("toggle-search");
  if (toggleSearch) toggleSearch.checked = false;
  clearMessageSearch();
}

function clearMessageSearch() {
  messageSearchQuery = "";
  const searchInput = document.getElementById("messageSearchInput");
  if (searchInput) searchInput.value = "";
  applyMessageSearch();
}

function applyMessageSearch() {
  const container = document.getElementById("messagesContainer");
  if (!container) return;

  const bubbles = container.querySelectorAll("[data-message-key]");
  let firstMatch = null;
  let matchCount = 0;

  bubbles.forEach(function (bubble) {
    const messageKey = bubble.dataset.messageKey;
    const message = currentMessages.find(function (item) {
      return getMessageKey(item) === messageKey;
    });
    const content = message ? message.content || "" : "";
    const isImage = Cloudinary.isImageMessageContent(content);
    const contentEl = bubble.querySelector(".chat-message-content");

    if (!messageSearchQuery) {
      bubble.classList.remove("hidden");
      if (contentEl) contentEl.innerHTML = escapeHtml(content);
      return;
    }

    let matches = false;

    if (isImage) {
      matches = messageContentMatchesQuery(content, messageSearchQuery);
    } else if (contentEl) {
      matches = content.toLowerCase().includes(messageSearchQuery);
      contentEl.innerHTML = matches ? highlightSearchText(content, messageSearchQuery) : escapeHtml(content);
    }

    bubble.classList.toggle("hidden", !matches);

    if (matches) {
      matchCount++;
      if (!firstMatch) firstMatch = bubble;
    }
  });

  toggleSearchEmptyState(matchCount === 0 && messageSearchQuery.length > 0);

  if (firstMatch) {
    firstMatch.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function toggleSearchEmptyState(show) {
  const el = document.getElementById("messageSearchEmpty");
  if (!el) return;
  el.classList.toggle("hidden", !show);
}

function hideSearchEmptyState() {
  toggleSearchEmptyState(false);
}

function highlightSearchText(text, query) {
  if (!query) return escapeHtml(text);

  let result = "";
  let remaining = text;
  let lowerRemaining = text.toLowerCase();

  while (remaining.length > 0) {
    const index = lowerRemaining.indexOf(query);
    if (index === -1) {
      result += escapeHtml(remaining);
      break;
    }

    result += escapeHtml(remaining.slice(0, index));
    result +=
      '<mark class="chat-search-highlight">' +
      escapeHtml(remaining.slice(index, index + query.length)) +
      "</mark>";
    remaining = remaining.slice(index + query.length);
    lowerRemaining = lowerRemaining.slice(index + query.length);
  }

  return result;
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

function showMessagesPanelState(type, customText) {
  const container = document.getElementById("messagesContainer");
  if (!container) return;

  const presets = {
    loading: {
      title: "Chargement…",
      text: "Récupération des messages",
    },
    empty: {
      title: "Aucun message",
      text: "Envoyez le premier message pour démarrer la conversation.",
    },
    error: {
      title: "Erreur de chargement",
      text: customText || "Impossible de charger les messages.",
    },
  };

  container.innerHTML = buildChatStateHtml(type, presets[type] || { text: customText || "" });
  renderedMessageKeys = [];
  hideSearchEmptyState();
}

function initMessageActions() {
  const container = document.getElementById("messagesContainer");
  const menu = document.getElementById("messageContextMenu");
  if (!container || !menu) return;

  container.addEventListener("click", function (event) {
    const editTarget = event.target.closest("[data-action]");
    if (editTarget) {
      const action = editTarget.dataset.action;
      const messageId = editTarget.dataset.messageId;

      if (action === "open-menu" && !editingMessageId) {
        const bubble = editTarget.closest("[data-message-id]");
        if (bubble && bubble.dataset.messageId) {
          event.stopPropagation();
          openMessageContextMenu(bubble, event, editTarget);
          return;
        }
      }

      if (action === "save-edit" && messageId) {
        saveEditMessage(messageId);
        return;
      }
      if (action === "cancel-edit") {
        cancelEditMessage();
        return;
      }
    }

    if (event.target.closest("#messageContextMenu")) return;
    closeMessageContextMenu();
  });

  menu.addEventListener("click", function (event) {
    const target = event.target.closest("[data-action]");
    if (!target || !contextMenuMessageId) return;

    const action = target.dataset.action;

    if (action === "edit") {
      closeMessageContextMenu();
      startEditMessage(contextMenuMessageId);
      return;
    }

    if (action === "delete") {
      showMessageDeleteConfirm();
      return;
    }

    if (action === "confirm-delete") {
      const messageId = contextMenuMessageId;
      closeMessageContextMenu();
      confirmDeleteMessage(messageId);
      return;
    }

    if (action === "cancel-delete") {
      hideMessageDeleteConfirm();
    }
  });

  document.addEventListener("click", function (event) {
    if (
      !event.target.closest("#messageContextMenu") &&
      !event.target.closest(".chat-message-more-btn")
    ) {
      closeMessageContextMenu();
    }
  });

  container.addEventListener("scroll", closeMessageContextMenu, { passive: true });
}

function openMessageContextMenu(bubble, event, anchorEl) {
  const menu = document.getElementById("messageContextMenu");
  const chatArea = document.getElementById("chatActiveArea");
  if (!menu || !chatArea) return;

  contextMenuMessageId = bubble.dataset.messageId;
  hideMessageDeleteConfirm();

  const anchor = anchorEl || bubble;
  const rect = anchor.getBoundingClientRect();
  const areaRect = chatArea.getBoundingClientRect();
  const menuWidth = 152;
  let left = rect.left - areaRect.left - menuWidth - 4;
  let top = rect.top - areaRect.top;

  if (left < 8) left = rect.right - areaRect.left + 4;
  if (top + 120 > areaRect.height) top = areaRect.height - 128;
  if (top < 8) top = 8;

  menu.style.left = left + "px";
  menu.style.top = top + "px";
  menu.classList.remove("hidden");
  menu.setAttribute("aria-hidden", "false");
}

function closeMessageContextMenu() {
  const menu = document.getElementById("messageContextMenu");
  if (!menu) return;
  menu.classList.add("hidden");
  menu.setAttribute("aria-hidden", "true");
  contextMenuMessageId = null;
  hideMessageDeleteConfirm();
}

function showMessageDeleteConfirm() {
  const actions = document.getElementById("messageContextMenuActions");
  const confirm = document.getElementById("messageContextMenuConfirm");
  if (actions) actions.classList.add("hidden");
  if (confirm) confirm.classList.remove("hidden");
}

function hideMessageDeleteConfirm() {
  const actions = document.getElementById("messageContextMenuActions");
  const confirm = document.getElementById("messageContextMenuConfirm");
  if (actions) actions.classList.remove("hidden");
  if (confirm) confirm.classList.add("hidden");
}

function findMessageBubble(messageId) {
  const container = document.getElementById("messagesContainer");
  if (!container) return null;
  return container.querySelector('[data-message-id="' + messageId + '"]');
}

function startEditMessage(messageId) {
  const message = currentMessages.find(function (item) {
    return String(item.id) === String(messageId);
  });
  if (!message || !activeConversationId) return;

  if (Cloudinary.isImageMessageContent(message.content)) {
    showChatToast("Les photos ne peuvent pas être modifiées.", true);
    return;
  }

  editingMessageId = String(messageId);
  renderMessages(currentMessages);

  const bubble = findMessageBubble(messageId);
  const textarea = bubble && bubble.querySelector("[data-edit-input]");
  if (textarea) {
    textarea.value = message.content || "";
    textarea.focus();
  }
}

function cancelEditMessage() {
  editingMessageId = null;
  renderMessages(currentMessages);
  if (messageSearchQuery) applyMessageSearch();
}

async function saveEditMessage(messageId) {
  const bubble = findMessageBubble(messageId);
  const textarea = bubble && bubble.querySelector("[data-edit-input]");
  const content = textarea ? textarea.value.trim() : "";

  if (!content || !activeConversationId) {
    showChatToast("Le message ne peut pas être vide.", true);
    return;
  }

  try {
    await Auth.apiRequest("/messages/" + messageId, {
      method: "PATCH",
      auth: true,
      body: { content: content },
    });
    editingMessageId = null;
    await loadMessages(activeConversationId, { silent: true, force: true });
    await refreshChatData();
    showChatToast("Message modifié.");
  } catch (error) {
    showChatToast(error.message || "Impossible de modifier le message.", true);
  }
}

async function confirmDeleteMessage(messageId) {
  if (!activeConversationId) return;

  try {
    await Auth.apiRequest("/messages/" + messageId, {
      method: "DELETE",
      auth: true,
    });
    editingMessageId = null;
    await loadMessages(activeConversationId, { silent: true, force: true });
    await refreshChatData();
    showChatToast("Message supprimé.");
  } catch (error) {
    showChatToast(error.message || "Impossible de supprimer le message.", true);
  }
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
