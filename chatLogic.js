const { genId } = require('../utils');

function getAccount(data, username) {
  return data.accounts.find(a => a.username === username);
}

function getOrCreateChat(data, userA, userB) {
  let chat = data.chats.find(c => c.participants.includes(userA) && c.participants.includes(userB));
  if (!chat) {
    chat = {
      id: genId('chat'),
      participants: [userA, userB],
      messages: [],
      lastReadBy: {}
    };
    data.chats.push(chat);
  }
  if (!chat.lastReadBy) chat.lastReadBy = {};
  return chat;
}

function isBlockedBetween(data, chat, username) {
  const other = chat.participants.find(p => p !== username);
  const me = getAccount(data, username);
  const otherAcc = getAccount(data, other);
  const iBlockedThem = me && (me.blockedUsers || []).includes(other);
  const theyBlockedMe = otherAcc && (otherAcc.blockedUsers || []).includes(username);
  return { blocked: !!(iBlockedThem || theyBlockedMe), iBlockedThem: !!iBlockedThem, theyBlockedMe: !!theyBlockedMe, other };
}

function sendMessage(data, chat, fromUsername, { text, replyTo, media }) {
  const msg = {
    id: genId('msg'),
    from: fromUsername,
    text: (text || '').trim(),
    media: media || null,
    time: Date.now(),
    replyTo: replyTo || null,
    reactions: {},
    deletedFor: [],
    deletedForEveryone: false
  };
  chat.messages.push(msg);
  return msg;
}

function toggleReaction(chat, msgId, username, emoji) {
  const msg = chat.messages.find(m => m.id === msgId);
  if (!msg || msg.deletedForEveryone) return null;
  if (!msg.reactions) msg.reactions = {};
  if (!msg.reactions[emoji]) msg.reactions[emoji] = [];

  const idx = msg.reactions[emoji].indexOf(username);
  if (idx > -1) {
    msg.reactions[emoji].splice(idx, 1);
  } else {
    Object.keys(msg.reactions).forEach(e => {
      msg.reactions[e] = msg.reactions[e].filter(u => u !== username);
    });
    msg.reactions[emoji].push(username);
  }
  return msg;
}

function deleteMessage(chat, msgId, username, forEveryone) {
  const msg = chat.messages.find(m => m.id === msgId);
  if (!msg) return null;
  if (forEveryone) {
    if (msg.from !== username) return null;
    msg.deletedForEveryone = true;
    msg.text = '';
    msg.media = null;
    msg.reactions = {};
  } else {
    if (!msg.deletedFor) msg.deletedFor = [];
    if (!msg.deletedFor.includes(username)) msg.deletedFor.push(username);
  }
  return msg;
}

// نسخة رسالة آمنة تُرسَل للعميل: تخفي محتوى الرسائل المحذوفة لدى المستخدم الطالب
function sanitizeMessagesFor(chat, username) {
  return chat.messages
    .filter(m => !(m.deletedFor || []).includes(username))
    .map(m => ({ ...m }));
}

module.exports = { getOrCreateChat, isBlockedBetween, sendMessage, toggleReaction, deleteMessage, sanitizeMessagesFor, getAccount };
