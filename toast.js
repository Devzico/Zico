// =======================================================================
//  toast.js - رسائل تنبيه صغيرة أسفل الشاشة بدل alert() في كل مكان
// =======================================================================
function showToast(message, type = 'normal') {
    const stack = document.getElementById('toastStack');
    if (!stack) { console.log(message); return; }
    const el = document.createElement('div');
    el.className = 'toast' + (type === 'error' ? ' error' : type === 'success' ? ' success' : '');
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 3500);
}
