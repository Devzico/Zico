// =======================================================================
//  notifications.js - عرض الإشعارات
// =======================================================================
async function renderNotifications() {
    const container = document.getElementById('notificationsList');
    if (!container) return;
    container.innerHTML = '<div class="empty-state">⏳ جارِ التحميل...</div>';
    try {
        const data = await apiGet('/notifications');
        const notifications = data.notifications;

        const badge = document.getElementById('notifUnreadBadge');
        const unread = notifications.filter(n => !n.read).length;
        if (badge) badge.style.display = unread > 0 ? 'block' : 'none';

        if (notifications.length === 0) {
            container.innerHTML = '<div class="empty-state"><span class="empty-icon">🔔</span>لا توجد إشعارات بعد</div>';
            return;
        }

        container.innerHTML = notifications.map(n => `
            <div class="notif-item">
                <span class="notif-icon">${n.type === 'like' ? '⭐' : n.type === 'reply' ? '💬' : n.type === 'repost' ? '🔄' : n.type === 'message' ? '💌' : '📌'}</span>
                <span class="notif-text">${parseContent(n.text)}</span>
                <span class="notif-time">${timeAgo(n.time)}</span>
            </div>
        `).join('');

        apiPost('/notifications/read-all', {}).catch(() => {});
    } catch (e) {
        container.innerHTML = `<div class="empty-state">⚠️ ${e.message}</div>`;
    }
}
