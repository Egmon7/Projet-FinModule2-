async function sendChatMessage(content) {
  if (!content || !activeConversationId) {
    throw new Error("Ouvrez une conversation pour envoyer un message.");
  }
  if (activeContact && isCurrentUser(activeContact)) {
    throw new Error("Impossible d'envoyer un message à vous-même.");
  }
  if (sendingMessage) {
    throw new Error("Un message est déjà en cours d'envoi.");
  }

  sendingMessage = true;
  const optimisticKey = appendOptimisticMessage(content);

  try {
    await Auth.apiRequest("/conversations/" + activeConversationId + "/messages", {
      method: "POST",
      auth: true,
      body: { content: content },
    });

    await loadMessages(activeConversationId, { silent: true, force: true });
    refreshChatData();
  } catch (error) {
    removeOptimisticMessage(optimisticKey);
    throw error;
  } finally {
    sendingMessage = false;
  }
}

function createOptimisticMessage(content) {
  return {
    content: content,
    createdAt: new Date().toISOString(),
    sender: currentUser || {},
    _pending: true,
  };
}

function appendOptimisticMessage(content) {
  const container = document.getElementById("messagesContainer");
  if (!container) return "";

  const panelState = container.querySelector(":scope > .chat-state");
  if (panelState) panelState.remove();

  const msg = createOptimisticMessage(content);
  const optimisticKey = "pending:" + Date.now() + ":" + Math.random().toString(36).slice(2, 8);
  msg._optimisticKey = optimisticKey;

  const bubble = createMessageBubble(msg);
  bubble.dataset.messageKey = optimisticKey;
  bubble.classList.add("chat-message-pending");

  container.appendChild(bubble);
  renderedMessageKeys.push(optimisticKey);
  currentMessages.push(msg);
  scrollMessagesToBottom();

  return optimisticKey;
}

function removeOptimisticMessage(optimisticKey) {
  if (!optimisticKey) return;

  const container = document.getElementById("messagesContainer");
  if (container) {
    const bubble = container.querySelector('[data-message-key="' + optimisticKey + '"]');
    if (bubble) bubble.remove();
  }

  renderedMessageKeys = renderedMessageKeys.filter(function (key) {
    return key !== optimisticKey;
  });

  currentMessages = currentMessages.filter(function (msg) {
    return msg._optimisticKey !== optimisticKey;
  });
}

function scrollMessagesToBottom() {
  const container = document.getElementById("messagesContainer");
  if (!container) return;

  function scrollNow() {
    container.scrollTop = container.scrollHeight;
  }

  scrollNow();
  requestAnimationFrame(function () {
    scrollNow();
    requestAnimationFrame(scrollNow);
  });

  container.querySelectorAll(".chat-message-image").forEach(function (img) {
    if (!img.complete) {
      img.addEventListener("load", scrollNow, { once: true });
    }
  });
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
    scrollMessagesToBottom();
  }

  return true;
}

function createMessageBubble(msg) {
  const sender = msg.sender || {};
  const isSent = isCurrentUser(sender);
  const messageId = msg.id ? String(msg.id) : "";
  const isEdited = msg.updatedAt && msg.createdAt && msg.updatedAt !== msg.createdAt;
  const isEditing = editingMessageId && messageId && editingMessageId === messageId;
  const isImage = Cloudinary.isImageMessageContent(msg.content || "");
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
    " chat-bubble-inner max-w-full rounded-2xl " +
    (isImage ? "chat-bubble-inner--image " : "px-4 py-3 ") +
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

  scrollMessagesToBottom();

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
      const haystack = ("photo image " + content).toLowerCase();
      matches = haystack.includes(messageSearchQuery);
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
