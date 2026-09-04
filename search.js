// =======================================================================
//  search.js - البحث عن مستخدمين ومنشورات وهاشتاجات
// =======================================================================
let searchDebounceTimer = null;

function handleSearch() {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(runSearch, 250);
}

async function runSearch() {
    const q = document.getElementById('searchInput').value.trim();
    const results = document.getElementById('searchResults');

    if (!q) {
        results.innerHTML = '<div class="empty-state"><span class="empty-icon">🔍</span>ابحث عن مستخدمين أو هاشتاجات</div>';
        return;
    }

    results.innerHTML = '<div class="empty-state">⏳ جارِ البحث...</div>';
    try {
        const data = await apiGet('/search?q=' + encodeURIComponent(q));
        let html = '';

        data.users.forEach(acc => {
            html += `
                <div class="user-card">
                    <div class="user-info-card" onclick="openProfile('${acc.username}')">
                        <img src="${acc.avatar || State.DEFAULT_AVATAR}" class="avatar small" onerror="this.src='${State.DEFAULT_AVATAR}'">
                        <div>
                            <div style="font-weight:bold;">${parseContent(acc.name)}</div>
                            <div style="color:var(--text-muted);font-size:0.8rem;">${acc.username}</div>
                        </div>
                    </div>
                </div>
            `;
        });

        const hashtagMatch = q.match(/#(\w+)/);
        if (hashtagMatch) {
            const tag = hashtagMatch[1];
            if (data.posts.length > 0) {
                html += `<div style="padding:12px 16px;color:var(--text-muted);font-weight:bold;border-bottom:1px solid var(--border-color);">📌 منشورات عن #${tag}</div>`;
                html += data.posts.map(p => renderPostCard(p, false)).join('');
            } else {
                html += `<div class="empty-state">لا توجد منشورات تحتوي على #${tag}</div>`;
            }
        }

        results.innerHTML = html || '<div class="empty-state">🔍 لا توجد نتائج</div>';
    } catch (e) {
        results.innerHTML = `<div class="empty-state">⚠️ ${e.message}</div>`;
    }
}
