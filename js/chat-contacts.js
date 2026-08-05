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
}

async function syncConversationPreview(conversationId) {
  try {
    const res = await Auth.apiRequest("/conversations/" + conversationId + "/messages", {
      auth: true,
    });
    const messages = res.data?.messages || res.data || [];
    if (!Array.isArray(messages) || messages.length === 0) return;

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
  const visibleUsers = sortedUsers;

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
  const buttons = sortedUsers
    .map(function (user) {
      return nav.querySelector('.chat-contact-btn[data-user-id="' + user.id + '"]');
    })
    .filter(Boolean);

  const current = Array.from(nav.querySelectorAll(".chat-contact-btn"));
  const sameOrder =
    buttons.length === current.length && buttons.every(function (btn, index) {
      return btn === current[index];
    });

  if (sameOrder) return;

  buttons.forEach(function (btn) {
    nav.appendChild(btn);
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

    scrollMessagesToBottom();

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
  const backdrop = document.getElementById("deleteConversationModalBackdrop");
  const cancelBtn = document.getElementById("deleteConversationCancel");
  const confirmBtn = document.getElementById("deleteConversationConfirm");

  if (deleteBtn) {
    deleteBtn.addEventListener("click", openDeleteConversationModal);
  }
  if (backdrop) {
    backdrop.addEventListener("click", closeDeleteConversationModal);
  }
  if (cancelBtn) {
    cancelBtn.addEventListener("click", closeDeleteConversationModal);
  }
  if (confirmBtn) {
    confirmBtn.addEventListener("click", executeDeleteActiveConversation);
  }
}

function openDeleteConversationModal() {
  if (!activeConversationId) return;
  const modal = document.getElementById("deleteConversationModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeDeleteConversationModal() {
  const modal = document.getElementById("deleteConversationModal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

async function executeDeleteActiveConversation() {
  if (!activeConversationId) return;

  closeDeleteConversationModal();
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
