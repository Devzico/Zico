// =======================================================================
//  chat.js - الدردشة اللحظية: قائمة المحادثات، الرسائل، التفاعلات، الرد، الحذف، الحظر
// =======================================================================
let activeChatMessages = [];
let activeChatBlockedInfo = { blocked: false };

function openChatList() {
    switchView('chatListView');
}

async function renderChatList() {
    const area = document.getElementById('chatListArea');
    if (!area) return;
    area.innerHTML = '<div class="empty-state">⏳ جارِ التحميل...</div>';
    try {
        const data = await apiGet('/chats');
        if (data.chats.length === 0) {
            area.innerHTML = `<div class="chat-list-empty">💬 لا توجد محادثات بعد.<br>ابدأ محادثة من صفحة أي مستخدم.</div>`;
            return;
        }
        area.innerHTML = data.chats.map(c => {
            const other = c.otherUser;
            let preview = 'لا توجد رسائل بعد';
            if (c.lastMessage) {
                preview = c.lastMessage.deletedForEveryone ? 'تم حذف الرسالة' : (c.lastMessage.text || '📎 مرفق');
                if (c.lastMessage.from === State.currentUser.username) preview = 'أنت: ' + preview;
            }
            const timeLabel = c.lastMessage ? timeAgo(c.lastMessage.time) : '';
            const online = State.onlinePeers.has(other.username);
            return `
                <div class="chat-list-item" onclick="openChat('${other.username}')">
                    <img class="avatar" src="${other.avatar || State.DEFAULT_AVATAR}" onerror="this.src='${State.DEFAULT_AVATAR}'">
                    <span class="presence-dot ${online ? 'online' : ''}"></span>
                    <div class="chat-list-info">
                        <div class="chat-list-name">${parseContent(other.name)}</div>
                        <div class="chat-list-preview">${parseContent(preview)}${c.unread > 0 ? ` · <b style="color:var(--accent-color);">${c.unread} جديدة</b>` : ''}</div>
                    </div>
                    <div class="chat-list-time">${timeLabel}</div>
                </div>
            `;
        }).join('');
        updateChatUnreadBadge();
    } catch (e) {
        area.innerHTML = `<div class="empty-state">⚠️ ${e.message}</div>`;
    }
}

async function updateChatUnreadBadge() {
    const badge = document.getElementById('chatUnreadBadge');
    if (!badge || !State.currentUser) return;
    try {
        const data = await apiGet('/chats');
        const unread = data.chats.reduce((sum, c) => sum + c.unread, 0);
        if (unread > 0) {
            badge.textContent = unread > 99 ? '99+' : unread;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    } catch (e) { /* تجاهل */ }
}

async function openChat(username, silent) {
    if (username === State.currentUser.username) return;
    State.activeChatUsername = username;
    State.pendingReplyMsgId = null;
    cancelChatReply();
    document.getElementById('chatMenuDropdown').style.display = 'none';

    if (!silent) switchView('chatRoomView');

    try {
        const data = await apiGet(`/chats/${encodeURIComponent(username)}`);
        State.activeChatId = data.chatId;
        activeChatMessages = data.messages;
        activeChatBlockedInfo = data;

        document.getElementById('chatPeerAvatar').src = data.otherUser.avatar || State.DEFAULT_AVATAR;
        document.getElementById('chatPeerName').textContent = data.otherUser.name;
        document.getElementById('chatPeerUsername').textContent = data.otherUser.username;
        updateChatPeerPresence();

        const blockLabel = document.getElementById('chatMenuBlockLabel');
        if (blockLabel) blockLabel.textContent = data.iBlockedThem ? '✅ إلغاء حظر المستخدم' : '🚫 حظر المستخدم';

        renderChatMessages();
        updateChatUnreadBadge();

        const msgInput = document.getElementById('chatMessageInput');
        msgInput.onkeydown = function(e) {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
        };
        msgInput.oninput = function() {
            if (State.socket && State.activeChatUsername) {
                State.socket.emit('chat:typing', { toUsername: State.activeChatUsername });
            }
        };
    } catch (e) {
        showToast('❌ ' + e.message, 'error');
    }
}

function updateChatPeerPresence() {
    const dot = document.getElementById('chatPeerPresence');
    if (dot) dot.classList.toggle('online', State.onlinePeers.has(State.activeChatUsername));
}

function renderChatMessages() {
    const area = document.getElementById('chatMessagesArea');
    if (!area) return;

    if (activeChatMessages.length === 0) {
        area.innerHTML = `<div class="chat-list-empty">👋 ابدأ المحادثة بإرسال أول رسالة!</div>`;
    } else {
        area.innerHTML = activeChatMessages.map(msg => renderChatMessageRow(msg)).join('');
    }
    area.scrollTop = area.scrollHeight;

    const inputRow = document.querySelector('#chatRoomView .chat-input-row');
    const existingBanner = document.querySelector('#chatRoomView .chat-blocked-banner');
    if (existingBanner) existingBanner.remove();

    if (activeChatBlockedInfo.blocked) {
        inputRow.style.display = 'none';
        const banner = document.createElement('div');
        banner.className = 'chat-blocked-banner';
        banner.textContent = activeChatBlockedInfo.iBlockedThem
            ? '🚫 لقد قمت بحظر هذا المستخدم. لا يمكنكما تبادل الرسائل.'
            : '🚫 لا يمكنك مراسلة هذا المستخدم.';
        document.getElementById('chatRoomView').insertBefore(banner, inputRow);
    } else {
        inputRow.style.display = 'flex';
    }
}

function renderChatMessageRow(msg) {
    const mine = msg.from === State.currentUser.username;
    let replyHTML = '';
    if (msg.replyTo) {
        const original = activeChatMessages.find(m => m.id === msg.replyTo);
        if (original) {
            replyHTML = `<div class="chat-reply-quote">${original.deletedForEveryone ? 'رسالة محذوفة' : parseContent(original.text || '📎 مرفق')}</div>`;
        }
    }

    const reactions = msg.reactions || {};
    let reactionsHTML = '';
    const reactionEntries = Object.entries(reactions).filter(([, users]) => users.length > 0);
    if (reactionEntries.length > 0) {
        reactionsHTML = `<div class="chat-msg-reactions">` + reactionEntries.map(([emoji, users]) => `
            <span class="reaction-pill ${users.includes(State.currentUser.username) ? 'mine-reacted' : ''}" onclick="event.stopPropagation(); toggleReaction('${msg.id}','${emoji}')">${emoji} ${users.length}</span>
        `).join('') + `</div>`;
    }

    let mediaHTML = '';
    if (msg.media && msg.media.url && !msg.deletedForEveryone) {
        if (msg.media.type.startsWith('image/')) mediaHTML = `<img src="${msg.media.url}" style="max-width:100%; border-radius:10px; margin-bottom:4px; display:block;">`;
        else if (msg.media.type.startsWith('video/')) mediaHTML = `<video controls src="${msg.media.url}" style="max-width:100%; border-radius:10px; margin-bottom:4px; display:block;"></video>`;
        else if (msg.media.type.startsWith('audio/')) mediaHTML = `<audio controls src="${msg.media.url}" style="margin-bottom:4px;"></audio>`;
    }

    const time = new Date(msg.time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    const bubbleClass = msg.deletedForEveryone ? 'chat-bubble chat-msg-deleted' : 'chat-bubble';
    const bodyText = msg.deletedForEveryone ? '🚫 تم حذف هذه الرسالة' : parseContent(msg.text || '');

    return `
        <div class="chat-msg-row ${mine ? 'mine' : 'theirs'}" id="msgrow-${msg.id}">
            <div class="${bubbleClass}" onclick="toggleMsgActions('${msg.id}')">
                ${replyHTML}
                ${mediaHTML}
                ${bodyText}
            </div>
            ${reactionsHTML}
            <div class="chat-msg-meta">${time}</div>
            ${msg.deletedForEveryone ? '' : `
            <div class="chat-msg-actions">
                ${State.REACTION_EMOJIS.map(e => `<span onclick="event.stopPropagation(); toggleReaction('${msg.id}','${e}')">${e}</span>`).join('')}
                <span onclick="event.stopPropagation(); startReply('${msg.id}')" title="رد">↩️</span>
                ${mine ? `<span onclick="event.stopPropagation(); deleteMessage('${msg.id}')" title="حذف">🗑️</span>` : ''}
            </div>`}
        </div>
    `;
}

function toggleMsgActions(msgId) {
    document.querySelectorAll('.chat-msg-row.actions-open').forEach(r => {
        if (r.id !== 'msgrow-' + msgId) r.classList.remove('actions-open');
    });
    const row = document.getElementById('msgrow-' + msgId);
    if (row) row.classList.toggle('actions-open');
}

// ===== إرسال ملف في الدردشة =====
function handleChatFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
        showToast('⚠️ حجم الملف كبير جداً (الحد الأقصى 50 ميجابايت).', 'error');
        event.target.value = '';
        return;
    }
    State.chatDraftFile = file;
    showToast('📎 تم إرفاق الملف: ' + file.name);
}

// ===== إرسال رسالة (عبر REST لدعم المرفقات، وSocket.io للرسائل النصية اللحظية) =====
async function sendChatMessage() {
    const input = document.getElementById('chatMessageInput');
    const text = input.value.trim();
    if (!text && !State.chatDraftFile) return;
    if (activeChatBlockedInfo.blocked) return;

    input.value = '';
    const replyTo = State.pendingReplyMsgId;
    cancelChatReply();

    try {
        if (State.chatDraftFile) {
            const fd = new FormData();
            fd.append('text', text);
            if (replyTo) fd.append('replyTo', replyTo);
            fd.append('media', State.chatDraftFile);
            State.chatDraftFile = null;
            document.getElementById('chatFileInput').value = '';
            const data = await apiUpload(`/chats/${State.activeChatId}/messages`, fd);
            activeChatMessages.push(data.message);
        } else {
            const ack = await new Promise((resolve) => {
                State.socket.emit('chat:send', { toUsername: State.activeChatUsername, text, replyTo }, resolve);
            });
            if (ack.error) throw new Error(ack.error);
            State.activeChatId = ack.chatId;
            activeChatMessages.push(ack.message);
        }
        renderChatMessages();
        markChatRead(State.activeChatId);
    } catch (e) {
        showToast('❌ ' + e.message, 'error');
    }
}

function appendIncomingMessageToRoom(message) {
    activeChatMessages.push(message);
    renderChatMessages();
}
function updateMessageInRoom(message) {
    const idx = activeChatMessages.findIndex(m => m.id === message.id);
    if (idx > -1) activeChatMessages[idx] = message;
    renderChatMessages();
}
function removeMessageFromRoom(messageId) {
    const msg = activeChatMessages.find(m => m.id === messageId);
    if (msg) { msg.deletedForEveryone = true; msg.text = ''; msg.media = null; msg.reactions = {}; }
    renderChatMessages();
}

async function markChatRead(chatId) {
    try { await apiPost(`/chats/${chatId}/read`, {}); } catch (e) { /* تجاهل */ }
    updateChatUnreadBadge();
}

function startReply(msgId) {
    State.pendingReplyMsgId = msgId;
    const msg = activeChatMessages.find(m => m.id === msgId);
    const preview = document.getElementById('chatReplyPreview');
    const previewText = document.getElementById('chatReplyPreviewText');
    if (msg && preview && previewText) {
        previewText.textContent = msg.deletedForEveryone ? 'رسالة محذوفة' : (msg.text || '📎 مرفق');
        preview.style.display = 'flex';
        document.getElementById('chatMessageInput').focus();
    }
    document.querySelectorAll('.chat-msg-row.actions-open').forEach(r => r.classList.remove('actions-open'));
}
function cancelChatReply() {
    State.pendingReplyMsgId = null;
    const preview = document.getElementById('chatReplyPreview');
    if (preview) preview.style.display = 'none';
}

async function toggleReaction(msgId, emoji) {
    try {
        const ack = await new Promise((resolve) => {
            State.socket.emit('chat:react', { chatId: State.activeChatId, msgId, emoji }, resolve);
        });
        if (ack.error) throw new Error(ack.error);
        updateMessageInRoom(ack.message);
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
}

function deleteMessage(msgId) {
    const choice = confirm('اضغط "موافق" لحذف الرسالة لدى الجميع، أو "إلغاء" لحذفها لديك فقط.');
    State.socket.emit('chat:delete', { chatId: State.activeChatId, msgId, forEveryone: choice }, (ack) => {
        if (ack && ack.error) { showToast('❌ ' + ack.error, 'error'); return; }
        if (choice) {
            removeMessageFromRoom(msgId);
        } else {
            activeChatMessages = activeChatMessages.filter(m => m.id !== msgId);
            renderChatMessages();
        }
    });
}

async function clearChatConversation() {
    if (!confirm('هل تريد حذف كل رسائل هذه المحادثة لديك؟')) return;
    try {
        await apiDelete(`/chats/${State.activeChatId}`);
        activeChatMessages = [];
        renderChatMessages();
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
    document.getElementById('chatMenuDropdown').style.display = 'none';
}

function toggleChatMenu() {
    const menu = document.getElementById('chatMenuDropdown');
    if (menu) menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
}

document.addEventListener('click', function(e) {
    if (!e.target.closest('#navChat') && !e.target.closest('.chat-menu-dropdown') && !e.target.closest('[onclick="toggleChatMenu()"]')) {
        const menu = document.getElementById('chatMenuDropdown');
        if (menu) menu.style.display = 'none';
    }
});
