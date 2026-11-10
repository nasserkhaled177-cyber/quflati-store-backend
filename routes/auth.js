const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();

// هنا توصل قاعدة البيانات حقك
// غيّر هذا السطر حسب قاعدة بياناتك - Postgres / MySQL / Supabase
const db = require('./db');
const SECRET = process.env.JWT_SECRET;
// ============================
// 1. صنع التوكن - القاعدة الرئيسية
// ============================
function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role, // customer أو technician
      phone: user.phone
    },
    process.env.JWT_SECRET, // السر اللي تحطه في ملف .env
    { expiresIn: '30d' }
  );
}

// ============================
// 2. التحقق من التوكن - هذا اللي يستخدمه تاب حسابي
// ============================
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: 'لا يوجد توكن' });
  }

  const token = authHeader.split(' ')[1]; // ياخذ التوكن بعد كلمة Bearer

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // هنا يصير عندك id و role و phone
    next();
  } catch (err) {
    return res.status(401).json({ message: 'التوكن منتهي أو غير صالح' });
  }
}

// ============================
// 3. تسجيل عميل جديد - من البوابة quflati-auth-frontend
// ============================
router.post('/register', async (req, res) => {
  try {
    const { name, phone, password } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({ message: 'أكمل كل البيانات' });
    }

    // هل الرقم مسجل من قبل؟
    const existing = await db.query('SELECT id FROM users WHERE phone = $1', [phone]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'هذا الرقم مسجل من قبل' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.query(
      `INSERT INTO users (name, phone, password, role, status, created_at)
       VALUES ($1, $2, $3, 'customer', 'active', NOW())
       RETURNING id, name, phone, role, status`,
      [name, phone, hashedPassword]
    );

    const user = result.rows[0];
    const token = createToken(user);

    // هذا اللي ترسله البوابة وتحفظه في localStorage باسم quflati_token
    res.json({ token, user });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في السيرفر' });
  }
});

// ============================
// 4. تسجيل الدخول
// ============================
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    const result = await db.query('SELECT * FROM users WHERE phone = $1', [phone]);
    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'الحساب غير موجود' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'كلمة السر غلط' });
    }

    // لا ترجع كلمة السر للواجهة أبداً
    delete user.password;

    const token = createToken(user);
    res.json({ token, user });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في السيرفر' });
  }
});

// ============================
// 5. قراءة الحساب - هذا اللي يقراه تاب حسابي
// GET /auth/me
// يرسل التوكن في الهيدر: Authorization: Bearer quflati_token
// ============================
router.get('/me', verifyToken, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, phone, role, status, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'الحساب غير موجود' });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في السيرفر' });
  }
});

// ============================
// 6. حذف الحساب كامل مع التوكن
// DELETE /auth/delete-account
// ============================
router.delete('/delete-account', verifyToken, async (req, res) => {
  try {
    await db.query('DELETE FROM users WHERE id = $1', [req.user.id]);
    res.json({ message: 'تم حذف الحساب نهائياً' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في السيرفر' });
  }
});

module.exports = { router, verifyToken, createToken };
