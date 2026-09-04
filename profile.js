// =======================================================================
//  profile.js - عرض/تعديل الملف الشخصي، المتابعة، الحظر
// =======================================================================
let currentProfileTab = 'posts';

function openOwnProfile() {
    openProfile(State.currentUser.username);
}

async function openProfile(username) {
    State.viewedProfileUsername = username;
    switchView('profileView');

    try {
        const data = await apiGet(`/accounts/${encodeURIComponent(username)}`);
        const user = data.user;
        State.viewedProfileData = user;

        document.getElementById('profHeader').src = user.header || State.DEFAULT_HEADER;
        document.getElementById('profHeader').onerror = function() { this.src = State.DEFAULT_HEADER; };
        document.getElementById('profAvatar').src = user.avatar || State.DEFAULT_AVATAR;
        document.getElementById('profAvatar').onerror = function() { this.src = State.DEFAULT_AVATAR; };

        document.getElementById('profName').innerHTML = parseContent(user.name);
        document.getElementById('profVerified').style.display = user.verified ? 'inline' : 'none';
        document.getElementById('profUsername').textContent = user.username;
        document.getElementById('profBio').innerHTML = parseContent(user.bio || '');

        document.getElementById('statPosts').textContent = data.postsCount;
        document.getElementById('statFollowers').textContent = (user.followers || []).length;
        document.getElementById('statFollowing').textContent = (user.following || []).length;

        const actionArea = document.getElementById('profActionArea');
        if (username === State.currentUser.username) {
            actionArea.innerHTML = `<button class="btn-toot secondary" onclick="switchView('editProfileView')">✏️ تعديل</button>`;
        } else {
            const isFollowing = (State.currentUser.following || []).includes(username);
            const isBlocked = (State.currentUser.blockedUsers || []).includes(username);
            actionArea.innerHTML = `
                <button class="btn-toot secondary" onclick="openChat('${username}')" style="margin-left:6px;">💬 رسالة</button>
                <button class="btn-follow ${isFollowing ? 'following' : ''}" ${isBlocked ? 'disabled style="opacity:0.5;"' : ''} onclick="toggleFollow('${username}')">${isFollowing ? '✅ متابع' : '➕ متابعة'}</button>
                <button class="btn-toot secondary" style="margin-right:6px; ${isBlocked ? 'color:var(--bookmark-green);' : 'color:var(--danger);'}" onclick="toggleBlockUser('${username}')">${isBlocked ? '✅ إلغاء الحظر' : '🚫 حظر'}</button>
            `;
        }

        switchProfileTab(currentProfileTab || 'posts');
    } catch (e) {
        showToast('❌ ' + e.message, 'error');
    }
}

async function switchProfileTab(tab, tabEl) {
    currentProfileTab = tab;
    document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
    if (tabEl) tabEl.classList.add('active');
    else {
        const match = document.querySelector(`.profile-tab[data-tab="${tab}"]`);
        if (match) match.classList.add('active');
    }

    const content = document.getElementById('profileTabContent');
    content.innerHTML = '<div class="empty-state">⏳ جارِ التحميل...</div>';
    const username = State.viewedProfileUsername;

    if (tab === 'followers' || tab === 'following') {
        try {
            const data = await apiGet(`/accounts/${encodeURIComponent(username)}/${tab}`);
            if (data.users.length === 0) {
                content.innerHTML = '<div class="empty-state">لا يوجد أحد هنا بعد</div>';
                return;
            }
            content.innerHTML = data.users.map(u => `
                <div class="user-card">
                    <div class="user-info-card" onclick="openProfile('${u.username}')">
                        <img src="${u.avatar || State.DEFAULT_AVATAR}" class="avatar small" onerror="this.src='${State.DEFAULT_AVATAR}'">
                        <div>
                            <div style="font-weight:bold;">${parseContent(u.name)}</div>
                            <div style="color:var(--text-muted);font-size:0.8rem;">${u.username}</div>
                        </div>
                    </div>
                </div>
            `).join('');
        } catch (e) {
            content.innerHTML = `<div class="empty-state">⚠️ ${e.message}</div>`;
        }
        return;
    }

    // posts / media
    try {
        const data = await apiGet('/posts?filter=all');
        let list = data.posts.filter(p => p.authorUsername === username);
        if (tab === 'media') list = list.filter(p => p.media);
        if (list.length === 0) {
            content.innerHTML = '<div class="empty-state"><span class="empty-icon">📭</span>لا توجد منشورات</div>';
            return;
        }
        content.innerHTML = list.map(p => renderPostCard(p, false)).join('');
    } catch (e) {
        content.innerHTML = `<div class="empty-state">⚠️ ${e.message}</div>`;
    }
}

function populateEditProfileForm() {
    document.getElementById('editName').value = State.currentUser.name || '';
    document.getElementById('editBio').value = State.currentUser.bio || '';
    document.getElementById('profileSaveStatus').textContent = '';
}

async function saveProfile() {
    const name = document.getElementById('editName').value.trim();
    const bio = document.getElementById('editBio').value.trim();
    const avatarFile = document.getElementById('editAvatarFile').files[0];
    const headerFile = document.getElementById('editHeaderFile').files[0];
    const status = document.getElementById('profileSaveStatus');
    status.textContent = '⏳ جارِ الحفظ...';

    try {
        const data = await apiPut('/accounts/me/profile', { name, bio });
        State.currentUser = data.user;

        if (avatarFile) {
            const fd = new FormData();
            fd.append('avatar', avatarFile);
            const r = await apiUpload('/accounts/me/avatar', fd);
            State.currentUser = r.user;
        }
        if (headerFile) {
            const fd = new FormData();
            fd.append('header', headerFile);
            const r = await apiUpload('/accounts/me/header', fd);
            State.currentUser = r.user;
        }

        document.getElementById('editAvatarFile').value = '';
        document.getElementById('editHeaderFile').value = '';
        status.textContent = '✅ تم حفظ التغييرات بنجاح!';
        showToast('✅ تم حفظ التغييرات بنجاح!', 'success');
        setTimeout(() => { status.textContent = ''; }, 4000);
        openProfile(State.currentUser.username);
    } catch (e) {
        status.textContent = '';
        showToast('❌ ' + e.message, 'error');
    }
}

async function toggleFollow(targetUsername) {
    try {
        const data = await apiPost(`/accounts/${encodeURIComponent(targetUsername)}/follow`, {});
        State.currentUser = data.user;
        openProfile(targetUsername);
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
}

async function toggleBlockUser(usernameArg) {
    const username = usernameArg || State.activeChatUsername;
    if (!username) return;
    const wasBlocked = (State.currentUser.blockedUsers || []).includes(username);
    if (!wasBlocked && !confirm(`هل تريد حظر ${username}؟ لن يتمكن من مراسلتك.`)) return;

    try {
        const data = await apiPost(`/accounts/${encodeURIComponent(username)}/block`, {});
        State.currentUser = data.user;
        showToast(data.blocked ? `🚫 تم حظر ${username}` : `✅ تم إلغاء حظر ${username}`, 'success');

        if (State.socket) State.socket.emit('chat:block-changed', { targetUsername: username });

        const menu = document.getElementById('chatMenuDropdown');
        if (menu) menu.style.display = 'none';
        const blockLabel = document.getElementById('chatMenuBlockLabel');
        if (blockLabel) blockLabel.textContent = data.blocked ? '✅ إلغاء حظر المستخدم' : '🚫 حظر المستخدم';

        if (State.activeChatId) openChat(username, true);
        if (State.viewedProfileUsername === username) openProfile(username);
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
}
