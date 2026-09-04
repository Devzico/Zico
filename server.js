// =======================================================================
//  server.js - خادم Zeko Social الحقيقي
//  Express + Socket.io + تخزين ملفات JSON على القرص + رفع صور/فيديوهات
//  يعمل عند رفعه على أي استضافة تدعم Node.js (Railway, Render, VPS...)
//  ويكون البيانات مشتركة بين كل الزوار وليس فقط متصفح واحد.
// =======================================================================

require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const db = require('./db');
const { JWT_SECRET } = require('./middleware/auth');
const { securityHeaders } = require('./middleware/security');
const chatLogic = require('./lib/chatLogic');
const { pushNotification } = require('./utils');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.set('io', io);

const PORT = process.env.PORT || 3000;

// ===== Middleware عام =====
app.use(securityHeaders);
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ===== ملفات ثابتة =====
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ===== مسارات الـ API =====
app.use('/api/auth', require('./routes/auth'));
app.use('/api/accounts', require('./routes/accounts'));
app.use('/api/posts', require('./routes/posts'));
app.use('/api/chats', require('./routes/chats'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/emojis', require('./routes/emojis'));
app.use('/api/search', require('./routes/search'));

app.get('/api/health', (req, res) => res.json({ ok: true, time: Date.now() }));

// أي مسار غير معروف يرجّع للواجهة (SPA)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== معالجة أخطاء الرفع (multer) وغيرها بشكل موحّد =====
app.use((err, req, res, next) => {
  if (err) {
    console.error(err.message);
    return res.status(400).json({ error: err.message || 'حدث خطأ غير متوقع' });
  }
  next();
});

// =======================================================================
//  Socket.io - الدردشة اللحظية الحقيقية
// =======================================================================
io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (!token) return next(new Error('يجب تسجيل الدخول'));
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    socket.username = payload.username;
    next();
  } catch (e) {
    next(new Error('جلسة غير صالحة'));
  }
});

// خريطة: اسم المستخدم -> عدد الاتصالات المفتوحة (لدعم أكثر من تبويب/جهاز)
const onlineUsers = new Map();

function broadcastPresence(username, online) {
  io.emit('presence:update', { username, online });
}

io.on('connection', (socket) => {
  const username = socket.username;
  socket.join('user:' + username);

  onlineUsers.set(username, (onlineUsers.get(username) || 0) + 1);
  if (onlineUsers.get(username) === 1) broadcastPresence(username, true);

  socket.on('disconnect', () => {
    const count = (onlineUsers.get(username) || 1) - 1;
    if (count <= 0) {
      onlineUsers.delete(username);
      broadcastPresence(username, false);
    } else {
      onlineUsers.set(username, count);
    }
  });

  // ===== إرسال رسالة دردشة =====
  socket.on('chat:send', async (payload, ack) => {
    try {
      const data = db.readDb();
      const chat = chatLogic.getOrCreateChat(data, username, payload.toUsername);
      const { blocked } = chatLogic.isBlockedBetween(data, chat, username);
      if (blocked) return ack && ack({ error: 'لا يمكن إرسال رسائل في هذه المحادثة' });

      const text = (payload.text || '').trim();
      if (!text && !payload.media) return ack && ack({ error: 'الرسالة فارغة' });

      const msg = chatLogic.sendMessage(data, chat, username, {
        text,
        replyTo: payload.replyTo || null,
        media: payload.media || null
      });

      pushNotification(data, payload.toUsername, `💬 رسالة جديدة من ${username}`, 'message');
      await db.writeDb(data);

      io.to('user:' + payload.toUsername).emit('chat:message', { chatId: chat.id, message: msg });
      ack && ack({ ok: true, message: msg, chatId: chat.id });
    } catch (e) {
      console.error(e);
      ack && ack({ error: 'خطأ في الخادم' });
    }
  });

  // ===== تفاعل بإيموجي =====
  socket.on('chat:react', async (payload, ack) => {
    try {
      const data = db.readDb();
      const chat = data.chats.find(c => c.id === payload.chatId);
      if (!chat || !chat.participants.includes(username)) return ack && ack({ error: 'المحادثة غير موجودة' });

      const msg = chatLogic.toggleReaction(chat, payload.msgId, username, payload.emoji);
      if (!msg) return ack && ack({ error: 'الرسالة غير موجودة' });

      await db.writeDb(data);
      const otherUsername = chat.participants.find(p => p !== username);
      io.to('user:' + otherUsername).emit('chat:reaction', { chatId: chat.id, message: msg });
      ack && ack({ ok: true, message: msg });
    } catch (e) {
      console.error(e);
      ack && ack({ error: 'خطأ في الخادم' });
    }
  });

  // ===== حذف رسالة =====
  socket.on('chat:delete', async (payload, ack) => {
    try {
      const data = db.readDb();
      const chat = data.chats.find(c => c.id === payload.chatId);
      if (!chat || !chat.participants.includes(username)) return ack && ack({ error: 'المحادثة غير موجودة' });

      const msg = chatLogic.deleteMessage(chat, payload.msgId, username, !!payload.forEveryone);
      if (!msg) return ack && ack({ error: 'غير مصرح' });

      await db.writeDb(data);
      if (payload.forEveryone) {
        const otherUsername = chat.participants.find(p => p !== username);
        io.to('user:' + otherUsername).emit('chat:delete', { chatId: chat.id, messageId: msg.id });
      }
      ack && ack({ ok: true });
    } catch (e) {
      console.error(e);
      ack && ack({ error: 'خطأ في الخادم' });
    }
  });

  // ===== مؤشر الكتابة =====
  socket.on('chat:typing', (payload) => {
    if (!payload || !payload.toUsername) return;
    io.to('user:' + payload.toUsername).emit('chat:typing', { fromUsername: username });
  });

  // ===== حظر مستخدم أثناء الدردشة (لتحديث الواجهة فورًا لدى الطرفين) =====
  socket.on('chat:block-changed', (payload) => {
    if (!payload || !payload.targetUsername) return;
    io.to('user:' + payload.targetUsername).emit('chat:block-changed', { byUsername: username });
  });
});

server.listen(PORT, () => {
  console.log(`🐾 Zeko Social يعمل الآن على http://localhost:${PORT}`);
});
