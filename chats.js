const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sanitizeAccount, pushNotification } = require('../utils');
const { uploadChatMedia } = require('../middleware/upload');
const chatLogic = require('../lib/chatLogic');

// ===== قائمة كل محادثاتي =====
router.get('/', requireAuth, (req, res) => {
  const data = db.readDb();
  const myChats = data.chats.filter(c => c.participants.includes(req.username));

  const list = myChats.map(chat => {
    const otherUsername = chat.participants.find(p => p !== req.username);
    const other = chatLogic.getAccount(data, otherUsername);
    const visibleMessages = chatLogic.sanitizeMessagesFor(chat, req.username);
    const lastMsg = visibleMessages[visibleMessages.length - 1];
    const lastRead = (chat.lastReadBy && chat.lastReadBy[req.username]) || 0;
    const unread = visibleMessages.filter(m => m.from !== req.username && m.time > lastRead).length;
    return {
      chatId: chat.id,
      otherUser: sanitizeAccount(other),
      lastMessage: lastMsg || null,
      unread
    };
  });

  list.sort((a, b) => (b.lastMessage ? b.lastMessage.time : 0) - (a.lastMessage ? a.lastMessage.time : 0));
  res.json({ chats: list });
});

// ===== فتح/إنشاء محادثة مع مستخدم وجلب الرسائل =====
router.get('/:username', requireAuth, async (req, res) => {
  const target = req.params.username;
  if (target === req.username) return res.status(400).json({ error: 'لا يمكنك مراسلة نفسك' });

  const data = db.readDb();
  const other = chatLogic.getAccount(data, target);
  if (!other) return res.status(404).json({ error: 'المستخدم غير موجود' });

  const chat = chatLogic.getOrCreateChat(data, req.username, target);
  const { blocked, iBlockedThem, theyBlockedMe } = chatLogic.isBlockedBetween(data, chat, req.username);

  chat.lastReadBy[req.username] = Date.now();
  await db.writeDb(data);

  res.json({
    chatId: chat.id,
    otherUser: sanitizeAccount(other),
    messages: chatLogic.sanitizeMessagesFor(chat, req.username),
    blocked,
    iBlockedThem,
    theyBlockedMe
  });
});

// ===== إرسال رسالة (احتياطي عبر REST؛ الأساس هو Socket.io للحظية) =====
router.post('/:chatId/messages', requireAuth, uploadChatMedia.single('media'), async (req, res) => {
  const data = db.readDb();
  const chat = data.chats.find(c => c.id === req.params.chatId);
  if (!chat || !chat.participants.includes(req.username)) {
    return res.status(404).json({ error: 'المحادثة غير موجودة' });
  }

  const { blocked } = chatLogic.isBlockedBetween(data, chat, req.username);
  if (blocked) return res.status(403).json({ error: 'لا يمكن إرسال رسائل في هذه المحادثة' });

  const text = (req.body.text || '').trim();
  if (!text && !req.file) return res.status(400).json({ error: 'الرسالة فارغة' });

  const media = req.file ? { url: '/uploads/posts/' + req.file.filename, type: req.file.mimetype } : null;
  const msg = chatLogic.sendMessage(data, chat, req.username, { text, replyTo: req.body.replyTo || null, media });

  const otherUsername = chat.participants.find(p => p !== req.username);
  pushNotification(data, otherUsername, `💬 رسالة جديدة من ${req.username}`, 'message');

  await db.writeDb(data);

  const io = req.app.get('io');
  if (io) io.to('user:' + otherUsername).emit('chat:message', { chatId: chat.id, message: msg });

  res.json({ message: msg });
});

// ===== تفاعل بإيموجي على رسالة =====
router.post('/:chatId/messages/:msgId/react', requireAuth, async (req, res) => {
  const data = db.readDb();
  const chat = data.chats.find(c => c.id === req.params.chatId);
  if (!chat || !chat.participants.includes(req.username)) return res.status(404).json({ error: 'المحادثة غير موجودة' });

  const emoji = req.body.emoji;
  if (!emoji) return res.status(400).json({ error: 'الإيموجي مطلوب' });

  const msg = chatLogic.toggleReaction(chat, req.params.msgId, req.username, emoji);
  if (!msg) return res.status(404).json({ error: 'الرسالة غير موجودة' });

  await db.writeDb(data);

  const io = req.app.get('io');
  const otherUsername = chat.participants.find(p => p !== req.username);
  if (io) io.to('user:' + otherUsername).emit('chat:reaction', { chatId: chat.id, message: msg });

  res.json({ message: msg });
});

// ===== حذف رسالة =====
router.delete('/:chatId/messages/:msgId', requireAuth, async (req, res) => {
  const data = db.readDb();
  const chat = data.chats.find(c => c.id === req.params.chatId);
  if (!chat || !chat.participants.includes(req.username)) return res.status(404).json({ error: 'المحادثة غير موجودة' });

  const forEveryone = req.query.forEveryone === 'true';
  const msg = chatLogic.deleteMessage(chat, req.params.msgId, req.username, forEveryone);
  if (!msg) return res.status(404).json({ error: 'الرسالة غير موجودة أو غير مصرح لك بحذفها' });

  await db.writeDb(data);

  if (forEveryone) {
    const io = req.app.get('io');
    const otherUsername = chat.participants.find(p => p !== req.username);
    if (io) io.to('user:' + otherUsername).emit('chat:delete', { chatId: chat.id, messageId: msg.id });
  }

  res.json({ ok: true });
});

// ===== حذف كل رسائل المحادثة لدي فقط =====
router.delete('/:chatId', requireAuth, async (req, res) => {
  const data = db.readDb();
  const chat = data.chats.find(c => c.id === req.params.chatId);
  if (!chat || !chat.participants.includes(req.username)) return res.status(404).json({ error: 'المحادثة غير موجودة' });

  chat.messages.forEach(m => {
    if (!m.deletedFor) m.deletedFor = [];
    if (!m.deletedFor.includes(req.username)) m.deletedFor.push(req.username);
  });

  await db.writeDb(data);
  res.json({ ok: true });
});

// ===== تحديد المحادثة كمقروءة =====
router.post('/:chatId/read', requireAuth, async (req, res) => {
  const data = db.readDb();
  const chat = data.chats.find(c => c.id === req.params.chatId);
  if (!chat || !chat.participants.includes(req.username)) return res.status(404).json({ error: 'المحادثة غير موجودة' });

  chat.lastReadBy[req.username] = Date.now();
  await db.writeDb(data);
  res.json({ ok: true });
});

module.exports = router;
