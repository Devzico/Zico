// =======================================================================
//  nav.js - التنقل بين الشاشات (Views)
// =======================================================================
function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById(viewId);
    if (el) el.classList.add('active');

    document.querySelectorAll('.top-nav button').forEach(b => b.classList.remove('active'));
    const navMap = {
        homeView: 'navHome',
        searchView: 'navSearch',
        notificationsView: 'navNotif',
        profileView: 'navProfile',
        settingsView: 'navSettings',
        chatListView: 'navChat',
        chatRoomView: 'navChat'
    };
    if (navMap[viewId]) {
        const btn = document.getElementById(navMap[viewId]);
        if (btn) btn.classList.add('active');
    }

    if (viewId === 'homeView') renderPosts();
    if (viewId === 'searchView') handleSearch();
    if (viewId === 'editProfileView') populateEditProfileForm();
    if (viewId === 'notificationsView') renderNotifications();
    if (viewId === 'chatListView') renderChatList();
}
