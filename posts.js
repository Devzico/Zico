// =======================================================================
//  posts.js - الخلاصة، النشر، الإعجاب/إعادة النشر/الرد، التعديل والحذف
// =======================================================================
let feedPostsCache = [];

function timeAgo(ts) {
    if (!ts) return '';
    const diff = Math.max(0, Date.now() - ts);
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'الآن';
    if (min < 60) return `قبل ${min} د`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `قبل ${hr} س`;
    const day = Math.floor(hr / 24);
    if (day < 30) return `قبل ${day} يوم`;
    return new Date(ts).toLocaleDateString('ar-EG');
}

function getBookmarks() {
    if (!State.currentUser) return [];
    try { return JSON.parse(localStorage.getItem('zeko_bookmarks_' + State.currentUser.username)) || []; }
    catch (e) { return []; }
}
function setBookmarks(list) {
    if (!State.currentUser) return;
    localStorage.setItem('zeko_bookmarks_' + State.currentUser.username, JSON.stringify(list));
}
function toggleBookmark(postId) {
    let list = getBookmarks();
    const idx = list.indexOf(postId);
    if (idx > -1) list.splice(idx, 1); else list.push(postId);
    setBookmarks(list);
    renderPosts();
}

// ===== الخلاصة =====
async function renderPosts() {
    const container = document.getElementById('feedArea');
    if (!container) return;
    container.innerHTML = '<div class="empty-state">⏳ جارِ التحميل...</div>';
    try {
        const data = await apiGet('/posts?filter=' + State.currentFeedFilter);
        feedPostsCache = data.posts;
        if (feedPostsCache.length === 0) {
            container.innerHTML = '<div class="empty-state"><span class="empty-icon">📭</span>لا توجد منشورات متاحة</div>';
            return;
        }
        container.innerHTML = feedPostsCache.map(p => renderPostCard(p, false)).join('');
    } catch (e) {
        container.innerHTML = `<div class="empty-state">⚠️ ${e.message}</div>`;
    }
}

function setFeedFilter(type) {
    State.currentFeedFilter = type;
    document.getElementById('tabAllPosts').classList.toggle('active', type === 'all');
    document.getElementById('tabFollowing').classList.toggle('active', type === 'following');
    renderPosts();
}

function cycleVisibility(btnId) {
    let idx = State.VISIBILITY_OPTIONS.findIndex(v => v.key === State.currentVisibility);
    idx = (idx + 1) % State.VISIBILITY_OPTIONS.length;
    State.currentVisibility = State.VISIBILITY_OPTIONS[idx].key;
    document.getElementById('mainVisLabel').textContent = State.VISIBILITY_OPTIONS[idx].label;
}
function getVisibilityLabel(key) {
    const opt = State.VISIBILITY_OPTIONS.find(v => v.key === key);
    return opt ? opt.label : '🌐 عام';
}

function toggleCwInput(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = el.style.display === 'block' ? 'none' : 'block';
}
function togglePollBuilder(id) {
    const el = document.getElementById(id);
    el.style.display = el.style.display === 'block' ? 'none' : 'block';
}
function addPollOption(builderId) {
    const builder = document.getElementById(builderId);
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'poll-opt';
    input.placeholder = `الخيار ${builder.querySelectorAll('.poll-opt').length + 1}`;
    builder.insertBefore(input, builder.lastElementChild);
}

// ===== إرفاق ملف (معاينة محلية فقط، الرفع الفعلي عند النشر) =====
function handleFileSelect(event, previewId) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
        showToast('⚠️ حجم الملف كبير جداً (الحد الأقصى 50 ميجابايت).', 'error');
        event.target.value = '';
        return;
    }
    State.draftFile = file;
    const url = URL.createObjectURL(file);
    const previewDiv = document.getElementById(previewId);
    if (file.type.startsWith('image/')) previewDiv.innerHTML = `<img src="${url}" alt="مرفق">`;
    else if (file.type.startsWith('video/')) previewDiv.innerHTML = `<video controls src="${url}"></video>`;
    else if (file.type.startsWith('audio/')) previewDiv.innerHTML = `<audio controls src="${url}"></audio>`;
    else if (file.type === 'application/pdf') previewDiv.innerHTML = `<div class="pdf-badge">📄 ${file.name} (PDF)</div>`;
    else previewDiv.innerHTML = `<div class="pdf-badge">📎 ${file.name}</div>`;
}

// ===== تسجيل صوتي حقيقي، يُرفع كملف عند النشر =====
async function toggleVoiceRecording() {
    const btn = document.getElementById('recordAudioBtn');
    if (!State.isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            State.mediaRecorder = new MediaRecorder(stream);
            State.audioChunks = [];
            State.mediaRecorder.ondataavailable = e => State.audioChunks.push(e.data);
            State.mediaRecorder.onstop = () => {
                const blob = new Blob(State.audioChunks, { type: 'audio/webm' });
                State.draftFile = new File([blob], 'voice-note.webm', { type: 'audio/webm' });
                const url = URL.createObjectURL(blob);
                document.getElementById('draftAttachment').innerHTML = `<audio controls src="${url}"></audio>`;
                stream.getTracks().forEach(t => t.stop());
            };
            State.mediaRecorder.start();
            State.isRecording = true;
            btn.classList.add('recording');
        } catch (e) {
            showToast('❌ لا يمكن الوصول إلى الميكروفون.', 'error');
        }
    } else {
        if (State.mediaRecorder && State.mediaRecorder.state === 'recording') State.mediaRecorder.stop();
        State.isRecording = false;
        btn.classList.remove('recording');
    }
}

// ===== نشر منشور =====
async function publishPost() {
    const text = document.getElementById('postInput').value.trim();
    const cw = document.getElementById('mainCwInput').value.trim();
    const pollOpts = Array.from(document.querySelectorAll('#mainPollBuilder .poll-opt'))
        .map(i => i.value.trim()).filter(v => v);

    if (!text && !State.draftFile && pollOpts.length < 2) {
        showToast('✏️ الرجاء كتابة نص أو إرفاق ملف أو استطلاع.', 'error');
        return;
    }

    const btn = document.getElementById('publishBtn');
    btn.disabled = true;
    const originalLabel = btn.textContent;
    btn.innerHTML = '<span class="spinner"></span>';

    try {
        const fd = new FormData();
        fd.append('text', text);
        if (cw) fd.append('cw', cw);
        fd.append('visibility', State.currentVisibility || 'public');
        if (pollOpts.length >= 2) fd.append('pollOptions', JSON.stringify(pollOpts));
        if (State.draftFile) fd.append('media', State.draftFile);

        await apiUpload('/posts', fd);

        document.getElementById('postInput').value = '';
        document.getElementById('mainCwInput').value = '';
        document.getElementById('mainCwInput').style.display = 'none';
        document.getElementById('mainPollBuilder').style.display = 'none';
        document.querySelectorAll('#mainPollBuilder .poll-opt').forEach((el, i) => { if (i > 1) el.remove(); else el.value = ''; });
        document.getElementById('draftAttachment').innerHTML = '';
        document.getElementById('postFileInput').value = '';
        State.draftFile = null;
        State.currentVisibility = 'public';
        document.getElementById('mainVisLabel').textContent = '🌐 عام';

        renderPosts();
    } catch (e) {
        showToast('❌ ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalLabel;
    }
}

// ===== الإجراءات =====
async function likePost(postId) {
    try {
        await apiPost(`/posts/${postId}/like`, {});
        refreshAfterAction(postId);
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
}
async function repostAction(postId) {
    try {
        await apiPost(`/posts/${postId}/repost`, {});
        refreshAfterAction(postId);
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
}
async function votePoll(postId, optIdx) {
    try {
        await apiPost(`/posts/${postId}/vote`, { optionIndex: optIdx });
        refreshAfterAction(postId);
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
}
async function deletePostAction(postId) {
    if (!confirm('🗑️ هل تريد حذف هذا المنشور نهائياً؟')) return;
    try {
        await apiDelete(`/posts/${postId}`);
        if (State.activePostId === postId) closePostDetail();
        renderPosts();
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
}

function refreshAfterAction(postId) {
    renderPosts();
    if (State.activePostId === postId) renderDetailPost(postId);
}

function copyPostLink(postId) {
    const link = window.location.origin + '/#post-' + postId;
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(link).then(() => showToast('🔗 تم نسخ رابط المنشور!', 'success'));
    } else {
        const dummy = document.createElement('input');
        dummy.value = link;
        document.body.appendChild(dummy);
        dummy.select();
        document.execCommand('copy');
        document.body.removeChild(dummy);
        showToast('🔗 تم نسخ رابط المنشور!', 'success');
    }
}

function toggleMediaBlur(postId) {
    const container = document.getElementById(`media-${postId}`);
    if (!container) return;
    const mediaEl = container.querySelector('img, video');
    if (!mediaEl) return;
    mediaEl.classList.toggle('media-blurred');
    const btn = container.querySelector('.media-reveal-btn');
    if (btn) btn.innerHTML = mediaEl.classList.contains('media-blurred') ? '👁️ إظهار' : '🙈 إخفاء';
}

function toggleCwContent(btn) {
    const parent = btn.closest('.cw-spoiler');
    if (!parent) return;
    const postBody = parent.nextElementSibling;
    if (postBody && postBody.classList.contains('post-body')) {
        const hidden = postBody.style.display === 'none';
        postBody.style.display = hidden ? 'block' : 'none';
        btn.textContent = hidden ? 'إخفاء' : 'إظهار';
    }
}

// ===== تعديل منشور =====
function toggleEditPost(postId) {
    const post = feedPostsCache.find(p => p.id === postId) || (State.activeDetailPost && State.activeDetailPost.id === postId ? State.activeDetailPost : null);
    if (!post) return;
    const contentEl = document.getElementById(`post-content-${postId}`);
    if (!contentEl) return;
    contentEl.innerHTML = `
        <div class="edit-container">
            <textarea id="edit-text-${postId}">${post.text || ''}</textarea>
            <div class="edit-file-input">
                <label>تغيير المرفق (اختياري):</label>
                <input type="file" id="edit-file-${postId}" accept="image/*,audio/*,video/*,application/pdf">
            </div>
            ${post.media ? `<div style="margin-bottom:6px;"><button class="btn-toot secondary" style="font-size:0.8rem;" onclick="markRemoveEditMedia(${JSON.stringify(postId)})">🗑️ إزالة المرفق الحالي</button></div>` : ''}
            <div class="edit-actions">
                <button class="btn-toot" onclick="saveEditPost(${JSON.stringify(postId)})">💾 حفظ</button>
                <button class="btn-toot secondary" onclick="refreshAfterAction(${JSON.stringify(postId)})">إلغاء</button>
            </div>
        </div>
    `;
}
let editRemoveMediaFlag = {};
function markRemoveEditMedia(postId) {
    editRemoveMediaFlag[postId] = true;
    showToast('تم تحديد المرفق للإزالة. احفظ التغييرات لتأكيد الحذف.');
}

async function saveEditPost(postId) {
    const input = document.getElementById(`edit-text-${postId}`);
    const fileInput = document.getElementById(`edit-file-${postId}`);
    const text = input ? input.value.trim() : '';
    if (!text && !(fileInput && fileInput.files[0])) {
        showToast('النص لا يمكن أن يكون فارغاً.', 'error');
        return;
    }
    try {
        const fd = new FormData();
        fd.append('text', text);
        if (fileInput && fileInput.files[0]) fd.append('media', fileInput.files[0]);
        if (editRemoveMediaFlag[postId]) fd.append('removeMedia', 'true');
        delete editRemoveMediaFlag[postId];
        await apiUpload(`/posts/${postId}`, fd, 'PUT');
        refreshAfterAction(postId);
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
}

// ===== تفصيل المنشور =====
async function openPostDetail(postId) {
    State.activePostId = postId;
    document.getElementById('postDetailOverlay').classList.add('active');
    document.getElementById('detailReplyInput').value = '';
    await renderDetailPost(postId);
    document.getElementById('detailReplyInput').focus();
}
function closePostDetail() {
    document.getElementById('postDetailOverlay').classList.remove('active');
    State.activePostId = null;
    renderPosts();
}
async function renderDetailPost(postId) {
    const container = document.getElementById('detailScrollArea');
    container.innerHTML = '<div class="empty-state">⏳ جارِ التحميل...</div>';
    try {
        const data = await apiGet(`/posts/${postId}`);
        State.activeDetailPost = data.post;
        container.innerHTML = renderPostCard(data.post, true);
        const replyInput = document.getElementById('detailReplyInput');
        if (replyInput) {
            replyInput.onkeydown = function(e) {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitDetailReply(); }
            };
        }
        container.scrollTop = 0;
    } catch (e) {
        container.innerHTML = `<div class="empty-state">⚠️ ${e.message}</div>`;
    }
}
async function submitDetailReply() {
    const input = document.getElementById('detailReplyInput');
    const text = input.value.trim();
    if (!text) { showToast('✏️ الرجاء كتابة رد.', 'error'); return; }
    try {
        await apiPost(`/posts/${State.activePostId}/reply`, { text });
        input.value = '';
        renderDetailPost(State.activePostId);
        renderPosts();
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
}

// ===== قالب بطاقة المنشور =====
function renderPostCard(post, isDetail) {
    const authorAvatar = post.authorAvatar || State.DEFAULT_AVATAR;

    let mediaHTML = '';
    if (post.media && post.media.url) {
        const blurClass = 'media-blurred';
        if (post.media.type && post.media.type.startsWith('image/')) {
            mediaHTML = `<div class="media-container" id="media-${post.id}">
                <img src="${post.media.url}" alt="مرفق" loading="lazy" class="${blurClass}">
                <button class="media-reveal-btn" onclick="event.stopPropagation(); toggleMediaBlur('${post.id}')">👁️ إظهار</button>
            </div>`;
        } else if (post.media.type && post.media.type.startsWith('video/')) {
            mediaHTML = `<div class="media-container" id="media-${post.id}">
                <video controls src="${post.media.url}" class="${blurClass}"></video>
                <button class="media-reveal-btn" onclick="event.stopPropagation(); toggleMediaBlur('${post.id}')">👁️ إظهار</button>
            </div>`;
        } else if (post.media.type && post.media.type.startsWith('audio/')) {
            mediaHTML = `<audio controls src="${post.media.url}" style="width:100%; margin-top:8px;"></audio>`;
        } else if (post.media.type === 'application/pdf') {
            mediaHTML = `<iframe src="${post.media.url}" class="pdf-container"></iframe>`;
        } else {
            mediaHTML = `<div class="pdf-badge" style="margin-top:8px;">📎 مرفق</div>`;
        }
    }

    let pollHTML = '';
    if (post.poll) {
        const totalVotes = post.poll.options.reduce((a, o) => a + o.votes.length, 0) || 1;
        const myVoteIdx = post.poll.options.findIndex(o => o.votes.includes(State.currentUser.username));
        pollHTML = '<div class="poll-box">';
        post.poll.options.forEach((opt, idx) => {
            const pct = Math.round((opt.votes.length / totalVotes) * 100);
            pollHTML += `
                <div class="poll-option ${myVoteIdx === idx ? 'voted' : ''}" onclick="event.stopPropagation(); votePoll('${post.id}', ${idx})">
                    <div class="poll-bar" style="width:${pct}%"></div>
                    <span class="poll-text">${parseContent(opt.text)}</span>
                    <span class="poll-val">${pct}% (${opt.votes.length})</span>
                </div>`;
        });
        pollHTML += `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">${totalVotes} صوت</div></div>`;
    }

    let cwHTML = '';
    let bodyStyle = '';
    if (post.cw) {
        cwHTML = `<div class="cw-spoiler"><span>⚠️ ${parseContent(post.cw)}</span><button class="cw-toggle" onclick="event.stopPropagation(); toggleCwContent(this)">إظهار</button></div>`;
        bodyStyle = 'style="display:none;"';
    }

    const isStarred = (post.likes || []).includes(State.currentUser.username);
    const isReposted = (post.reposts || []).includes(State.currentUser.username);
    const isBookmarked = getBookmarks().includes(post.id);
    const isOwner = post.authorUsername === State.currentUser.username;
    const visLabel = getVisibilityLabel(post.visibility || 'public');
    const pid = JSON.stringify(post.id);

    const actionsHTML = `
        <div class="post-actions">
            <button class="action-item" onclick="event.stopPropagation(); ${isDetail ? '' : `openPostDetail(${pid})`}" title="رد">
                <svg viewBox="0 0 24 24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                <span class="count">${(post.replies || []).length}</span>
            </button>
            <button class="action-item ${isReposted ? 'reposted' : ''}" onclick="event.stopPropagation(); repostAction(${pid})" title="إعادة نشر">
                <svg viewBox="0 0 24 24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                <span class="count">${(post.reposts || []).length}</span>
            </button>
            <button class="action-item ${isStarred ? 'starred' : ''}" onclick="event.stopPropagation(); likePost(${pid})" title="إعجاب">
                <svg viewBox="0 0 24 24" fill="${isStarred ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                <span class="count">${(post.likes || []).length}</span>
            </button>
            <button class="action-item ${isBookmarked ? 'bookmarked' : ''}" onclick="event.stopPropagation(); toggleBookmark(${pid})" title="حفظ">
                <svg viewBox="0 0 24 24" fill="${isBookmarked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            </button>
            <button class="action-item" onclick="event.stopPropagation(); copyPostLink(${pid})" title="نسخ الرابط">
                <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            </button>
            ${isOwner ? `
            <button class="action-item" onclick="event.stopPropagation(); toggleEditPost(${pid})" title="تعديل">
                <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="action-item danger" onclick="event.stopPropagation(); deletePostAction(${pid})" title="حذف">
                <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </button>` : ''}
        </div>
    `;

    let repliesHTML = '';
    if (isDetail && post.replies && post.replies.length > 0) {
        repliesHTML = `<div class="reply-thread" style="margin-top:12px;">` + post.replies.map(r => `
            <div class="reply-item">
                <img src="${r.authorAvatar || State.DEFAULT_AVATAR}" class="avatar tiny reply-avatar" onerror="this.src='${State.DEFAULT_AVATAR}'">
                <div class="reply-bubble">
                    <div class="reply-author">
                        <span class="rname">${parseContent(r.authorName || r.authorUsername)}</span>
                        <span class="ruser">${r.authorUsername}</span>
                        <span style="color:var(--text-muted);font-size:0.7rem;">${timeAgo(r.time)}</span>
                    </div>
                    <div class="reply-text">${parseContent(r.text)}</div>
                </div>
            </div>
        `).join('') + `</div>`;
    }

    return `
        <div class="post" id="post-${post.id}" onclick="${isDetail ? '' : `openPostDetail(${pid})`}">
            <div class="post-header">
                <img src="${authorAvatar}" class="avatar" onclick="event.stopPropagation(); openProfile('${post.authorUsername}')" onerror="this.src='${State.DEFAULT_AVATAR}'">
                <div class="user-info">
                    <div class="name-row">
                        <span class="name" onclick="event.stopPropagation(); openProfile('${post.authorUsername}')">${parseContent(post.authorName || post.authorUsername)}</span>
                        ${post.authorVerified ? '<span class="verified-badge">✓</span>' : ''}
                        <span class="username">${post.authorUsername}</span>
                        <span class="post-visibility">${visLabel}</span>
                    </div>
                </div>
                <span class="post-time">${timeAgo(post.createdAt)}${post.editedAt ? ' · معدَّل' : ''}</span>
            </div>
            ${cwHTML}
            <div class="post-body" ${bodyStyle} id="post-body-${post.id}">
                <div class="post-content" id="post-content-${post.id}">${parseContent(post.text)}</div>
                ${mediaHTML}
                ${pollHTML}
            </div>
            ${actionsHTML}
            ${repliesHTML}
        </div>
    `;
}
