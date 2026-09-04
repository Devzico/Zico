const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { uploadEmoji } = require('../middleware/upload');

router.get('/', (req, res) => {
  const data = db.readDb();
  res.json({ emojis: data.emojis });
});

router.post('/', requireAuth, uploadEmoji.single('image'), async (req, res) => {
  const name = (req.body.name || '').trim().replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g, '');
  if (!name) return res.status(400).json({ error: 'اسم الإيموجي مطلوب' });
  if (!req.file) return res.status(400).json({ error: 'الصورة مطلوبة' });

  const data = db.readDb();
  const code = `:${name}:`;
  data.emojis[code] = '/uploads/emojis/' + req.file.filename;
  await db.writeDb(data);

  res.json({ emojis: data.emojis });
});

module.exports = router;
