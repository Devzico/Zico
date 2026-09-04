// =======================================================================
//  db.js - قاعدة بيانات بسيطة على شكل ملف JSON واحد على القرص
//  تُخزَّن كل بيانات الموقع (حسابات، منشورات، محادثات، إشعارات، إيموجي)
//  في data/db.json بحيث تكون متاحة لكل الزوار بعد الرفع على الاستضافة،
//  وليس فقط في متصفح المستخدم كما كانت النسخة السابقة (localStorage).
// =======================================================================

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'db.json');

const DEFAULT_DB = {
  accounts: [],
  posts: [],
  chats: [],
  notifications: [],
  emojis: {
    ':cat:': '/uploads/emojis/default-cat.svg',
    ':zico:': '/uploads/emojis/default-zico.svg',
    ':skull:': '/uploads/emojis/default-skull.svg'
  }
};

function ensureDbFile() {
  if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2), 'utf-8');
  }
}

// قفل بسيط في الذاكرة لمنع تضارب الكتابة المتزامنة من طلبات متعددة
let writeQueue = Promise.resolve();

function readDb() {
  ensureDbFile();
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  try {
    const parsed = JSON.parse(raw);
    // دمج آمن مع القيم الافتراضية لو الملف قديم وينقصه مفتاح
    return Object.assign({}, DEFAULT_DB, parsed);
  } catch (e) {
    console.error('⚠️ خطأ في قراءة قاعدة البيانات، سيتم إنشاء ملف جديد:', e.message);
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2), 'utf-8');
    return JSON.parse(JSON.stringify(DEFAULT_DB));
  }
}

function writeDb(data) {
  writeQueue = writeQueue.then(() => new Promise((resolve, reject) => {
    const tmpPath = DB_PATH + '.tmp';
    fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8', (err) => {
      if (err) return reject(err);
      fs.rename(tmpPath, DB_PATH, (err2) => {
        if (err2) return reject(err2);
        resolve();
      });
    });
  }));
  return writeQueue;
}

// دالة مساعدة: تحديث آمن يمنع فقدان تعديلات متزامنة (read-modify-write ذرّي)
async function update(mutatorFn) {
  const db = readDb();
  const result = mutatorFn(db);
  await writeDb(db);
  return result;
}

module.exports = { readDb, writeDb, update, DB_PATH };
