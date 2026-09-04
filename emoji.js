// =======================================================================
//  emoji.js - الإيموجي المخصص وتحويل النص (هاشتاجات/منشن/إيموجي)
// =======================================================================
async function loadCustomEmojis() {
    try {
        const data = await apiGet('/emojis');
        State.customEmojis = data.emojis || {};
    } catch (e) {
        State.customEmojis = {};
    }
    buildEmojiPickers();
}

function buildEmojiPickers() {
    buildOneEmojiPicker('mainEmojiPicker', 'postInput');
    buildOneEmojiPicker('chatEmojiPicker', 'chatMessageInput');
}

function buildOneEmojiPicker(pickerId, targetInputId) {
    const picker = document.getElementById(pickerId);
    if (!picker) return;
    picker.innerHTML = '';
    for (const [code, url] of Object.entries(State.customEmojis)) {
        const img = document.createElement('img');
        img.src = url;
        img.title = code;
        img.onclick = () => {
            const input = document.getElementById(targetInputId);
            if (input) input.value += ` ${code} `;
            picker.classList.remove('active');
        };
        picker.appendChild(img);
    }
}

function toggleEmojiPicker(id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active');
}

async function createCustomEmoji() {
    const file = document.getElementById('newEmojiFile').files[0];
    const name = document.getElementById('newEmojiName').value.trim();
    if (!file || !name) return showToast('⚠️ الرجاء اختيار صورة وإدخال اسم للإيموجي.', 'error');

    const fd = new FormData();
    fd.append('image', file);
    fd.append('name', name);

    try {
        const data = await apiUpload('/emojis', fd);
        State.customEmojis = data.emojis;
        buildEmojiPickers();
        showToast(`✅ تم إضافة الإيموجي :${name}: بنجاح!`, 'success');
        document.getElementById('newEmojiFile').value = '';
        document.getElementById('newEmojiName').value = '';
        switchView('homeView');
    } catch (e) {
        showToast('❌ ' + e.message, 'error');
    }
}

// ===== تحويل النص: هروب HTML + هاشتاجات + منشن + إيموجي مخصص =====
function parseContent(text) {
    if (!text) return '';
    let safe = String(text).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    safe = safe.replace(/#([\p{L}\p{N}_]+)/gu, '<a onclick="searchHashtag(\'$1\')" class="hashtag">#$1</a>');
    safe = safe.replace(/@(\w+)/g, '<a onclick="openProfile(\'@$1\')" class="mention">@$1</a>');
    safe = safe.replace(/:([a-zA-Z0-9_\u0600-\u06FF-]+):/g, (match) => {
        return State.customEmojis[match] ? `<img src="${State.customEmojis[match]}" class="custom-emoji" title="${match}">` : match;
    });
    return safe;
}

function searchHashtag(tag) {
    switchView('searchView');
    const input = document.getElementById('searchInput');
    input.value = '#' + tag;
    handleSearch();
    input.focus();
}
