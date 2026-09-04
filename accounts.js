const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { sanitizeAccount, pushNotification } = require('../utils');
const { uploadAvatar, uploadHeader } = require('../middleware/upload');

// ===== عرض حساب مستخدم =====
router.get('/:username', optionalAuth, (req, res) => {
  const data = db.readDb();
  const account = data.accounts.find(a => a.username === req.params.username);
  if (!account) return res.status(404).json({ error: 'المستخدم غير موجود' });

  const postsCount = data.posts.filter(p => p.authorUsername === account.username && !p.deleted).length;
  res.json({ user: sanitizeAccount(account), postsCount });
});

// ===== تحديث الاسم والبايو =====
router.put('/me/profile', requireAuth, async (req, res) => {
  const data = db.readDb();
  const account = data.accounts.find(a => a.username === req.username);
  if (!account) return res.status(404).json({ error: 'الحساب غير موجود' });

  if (typeof req.body.name === 'string' && req.body.name.trim()) account.name = req.body.name.trim();
  if (typeof req.body.bio === 'string') account.bio = req.body.bio.trim();

  await db.writeDb(data);
  res.json({ user: sanitizeAccount(account) });
});

// ===== رفع صورة البروفايل =====
router.post('/me/avatar', requireAuth, uploadAvatar.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'لم يتم إرفاق صورة' });
  const data = db.readDb();
  const account = data.accounts.find(a => a.username === req.username);
  if (!account) return res.status(404).json({ error: 'الحساب غير موجود' });

  account.avatar = '/uploads/avatars/' + req.file.filename;
  await db.writeDb(data);
  res.json({ user: sanitizeAccount(account) });
});

// ===== رفع صورة الغلاف =====
router.post('/me/header', requireAuth, uploadHeader.single('header'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'لم يتم إرفاق صورة' });
  const data = db.readDb();
  const account = data.accounts.find(a => a.username === req.username);
  if (!account) return res.status(404).json({ error: 'الحساب غير موجود' });

  account.header = '/uploads/headers/' + req.file.filename;
  await db.writeDb(data);
  res.json({ user: sanitizeAccount(account) });
});

// ===== متابعة / إلغاء متابعة =====
router.post('/:username/follow', requireAuth, async (req, res) => {
  const target = req.params.username;
  if (target === req.username) return res.status(400).json({ error: 'لا يمكنك متابعة نفسك' });

  const data = db.readDb();
  const me = data.accounts.find(a => a.username === req.username);
  const targetAcc = data.accounts.find(a => a.username === target);
  if (!me || !targetAcc) return res.status(404).json({ error: 'المستخدم غير موجود' });

  if (!me.following) me.following = [];
  if (!targetAcc.followers) targetAcc.followers = [];

  const idx = me.following.indexOf(target);
  let following;
  if (idx > -1) {
    me.following.splice(idx, 1);
    targetAcc.followers = targetAcc.followers.filter(u => u !== me.username);
    following = false;
  } else {
    me.following.push(target);
    targetAcc.followers.push(me.username);
    pushNotification(data, target, `✅ بدأ ${me.username} بمتابعتك`, 'general');
    following = true;
  }

  await db.writeDb(data);
  res.json({ following, user: sanitizeAccount(me) });
});

// ===== حظر / إلغاء حظر =====
router.post('/:username/block', requireAuth, async (req, res) => {
  const target = req.params.username;
  if (target === req.username) return res.status(400).json({ error: 'لا يمكنك حظر نفسك' });

  const data = db.readDb();
  const me = data.accounts.find(a => a.username === req.username);
  if (!me) return res.status(404).json({ error: 'الحساب غير موجود' });
  if (!me.blockedUsers) me.blockedUsers = [];

  const idx = me.blockedUsers.indexOf(target);
  let blocked;
  if (idx > -1) {
    me.blockedUsers.splice(idx, 1);
    blocked = false;
  } else {
    me.blockedUsers.push(target);
    blocked = true;
  }

  await db.writeDb(data);
  res.json({ blocked, user: sanitizeAccount(me) });
});

// ===== قائمة المتابعين / المتابَعين =====
router.get('/:username/followers', (req, res) => {
  const data = db.readDb();
  const account = data.accounts.find(a => a.username === req.params.username);
  if (!account) return res.status(404).json({ error: 'المستخدم غير موجود' });
  const list = (account.followers || []).map(u => sanitizeAccount(data.accounts.find(a => a.username === u))).filter(Boolean);
  res.json({ users: list });
});

router.get('/:username/following', (req, res) => {
  const data = db.readDb();
  const account = data.accounts.find(a => a.username === req.params.username);
  if (!account) return res.status(404).json({ error: 'المستخدم غير موجود' });
  const list = (account.following || []).map(u => sanitizeAccount(data.accounts.find(a => a.username === u))).filter(Boolean);
  res.json({ users: list });
});

module.exports = router;
