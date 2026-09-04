// =======================================================================
//  socketClient.js - الاتصال اللحظي (Socket.io) للدردشة والحضور
// =======================================================================
function connectSocket() {
    if (State.socket) State.socket.disconnect();

    State.socket = io({ auth: { token: State.token } });

    State.socket.on('connect_error', (err) => {
        console.warn('Socket connect error:', err.message);
    });

    // ===== رسالة جديدة واردة =====
    State.socket.on('chat:message', ({ chatId, message }) => {
        if (State.activeChatId === chatId) {
            appendIncomingMessageToRoom(message);
            markChatRead(chatId);
        } else {
            showToast(`💬 رسالة جديدة من ${message.from}`);
        }
        updateChatUnreadBadge();
        if (document.getElementById('chatListView').classList.contains('active')) renderChatList();
    });

    // ===== تفاعل على رسالة =====
    State.socket.on('chat:reaction', ({ chatId, message }) => {
        if (State.activeChatId === chatId) updateMessageInRoom(message);
    });

    // ===== حذف رسالة لدى الجميع =====
    State.socket.on('chat:delete', ({ chatId, messageId }) => {
        if (State.activeChatId === chatId) removeMessageFromRoom(messageId);
    });

    // ===== مؤشر الكتابة =====
    State.socket.on('chat:typing', ({ fromUsername }) => {
        if (fromUsername !== State.activeChatUsername) return;
        const indicator = document.getElementById('chatTypingIndicator');
        if (!indicator) return;
        indicator.textContent = 'يكتب الآن...';
        clearTimeout(State.typingTimeout);
        State.typingTimeout = setTimeout(() => { indicator.textContent = ''; }, 2500);
    });

    // ===== تغيّر حالة الحظر أثناء الدردشة =====
    State.socket.on('chat:block-changed', ({ byUsername }) => {
        if (byUsername === State.activeChatUsername) openChat(State.activeChatUsername, true);
    });

    // ===== حالة الاتصال (متصل الآن) =====
    State.socket.on('presence:update', ({ username, online }) => {
        if (online) State.onlinePeers.add(username);
        else State.onlinePeers.delete(username);
        if (username === State.activeChatUsername) updateChatPeerPresence();
    });
}
