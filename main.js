// =======================================================================
//  main.js - نقطة انطلاق التطبيق
// =======================================================================
document.addEventListener('DOMContentLoaded', () => {
    // إغلاق قوائم الإيموجي المنسدلة عند الضغط خارجها
    document.addEventListener('click', function(e) {
        document.querySelectorAll('.emoji-picker.active').forEach(picker => {
            if (!picker.contains(e.target) && !e.target.closest('.icon-btn')) {
                picker.classList.remove('active');
            }
        });
    });

    // دعم Enter لتسجيل الدخول/إنشاء الحساب
    ['authUsername', 'authPassword', 'authPasswordConfirm', 'authName'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); submitAuth(); }
        });
    });

    setAuthMode('login');
    tryResumeSession();
});
