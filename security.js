// =======================================================================
//  security.js - حماية بسيطة: تحديد محاولات الدخول + رؤوس أمان أساسية
// =======================================================================

// ===== تحديد معدل محاولات تسجيل الدخول/التسجيل لمنع هجمات التخمين =====
const attempts = new Map(); // key: ip+username -> { count, firstAttempt }
const WINDOW_MS = 10 * 60 * 1000; // 10 دقائق
const MAX_ATTEMPTS = 10;

function loginRateLimiter(req, res, next) {
    const key = req.ip + ':' + (req.body.username || '');
    const now = Date.now();
    const entry = attempts.get(key);

    if (!entry || now - entry.firstAttempt > WINDOW_MS) {
        attempts.set(key, { count: 1, firstAttempt: now });
        return next();
    }

    if (entry.count >= MAX_ATTEMPTS) {
        const waitMin = Math.ceil((WINDOW_MS - (now - entry.firstAttempt)) / 60000);
        return res.status(429).json({ error: `محاولات كثيرة جداً. حاول مرة أخرى بعد ${waitMin} دقيقة.` });
    }

    entry.count++;
    next();
}

// تنظيف دوري لمنع تضخم الذاكرة
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of attempts.entries()) {
        if (now - entry.firstAttempt > WINDOW_MS) attempts.delete(key);
    }
}, WINDOW_MS);

// ===== رؤوس أمان أساسية بدون الحاجة لمكتبة helmet =====
function securityHeaders(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
}

module.exports = { loginRateLimiter, securityHeaders };
