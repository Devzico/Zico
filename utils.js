const crypto = require('crypto');

function genId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

// يزيل كلمة المرور المشفّرة قبل إرسال بيانات الحساب للعميل
function sanitizeAccount(acc) {
  if (!acc) return null;
  const { passwordHash, ...safe } = acc;
  return safe;
}

const DEFAULT_AVATAR = '/img/default-avatar.svg';
const DEFAULT_HEADER = '/img/default-header.svg';

function newAccount({ username, name, passwordHash }) {
  return {
    username,
    name: name || username.replace('@', ''),
    bio: '',
    avatar: DEFAULT_AVATAR,
    header: DEFAULT_HEADER,
    verified: false,
    followers: [],
    following: [],
    blockedUsers: [],
    passwordHash,
    createdAt: Date.now()
  };
}

function pushNotification(db, targetUsername, text, type) {
  db.notifications.push({
    id: genId('notif'),
    for: targetUsername,
    text,
    type,
    time: Date.now(),
    read: false
  });
  if (db.notifications.length > 2000) {
    db.notifications = db.notifications.slice(-2000);
  }
}

module.exports = { genId, sanitizeAccount, newAccount, pushNotification, DEFAULT_AVATAR, DEFAULT_HEADER };
