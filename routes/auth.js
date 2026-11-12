const 【entity-express¦canonical_name=express】 = require('【entity-express¦canonical_name=express】');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = 【entity-express¦canonical_name=express】.Router();
const db = require('./db');

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      phone: user.phone,
      email: user.email || null,
      name: user.name || null
    },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: 'لا يوجد توكن' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'التوكن منتهي أو غير صالح' });
  }
}

router.post('/register', async (req, res) => {
  try {
    const { name, phone, email, password } = req.body;
    if (!name || !phone || !password) {
      return res.status(400).json({ message: 'أكمل كل البيانات' });
    }
    const existing = await db.query('SELECT id FROM users WHERE phone = $1', [phone]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'هذا الرقم مسجل من قبل' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.query(
      `INSERT INTO users (name, phone, email, password, role, status, created_at)
       VALUES ($1, $2, $3, $4, 'customer', 'active', NOW())
       RETURNING id, name, phone, email, role, status`,
      [name, phone, email || null, hashedPassword]
    );
    const user = result.rows[0];
    const token = createToken(user);
    res.json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في السيرفر' });
  }
});

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
    delete user.password;
    const token = createToken(user);
    res.json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في السيرفر' });
  }
});

router.get('/me', verifyToken, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, phone, email, role, status, created_at FROM users WHERE id = $1',
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

router.delete('/delete-account', verifyToken, async (req, res) => {
  try {
    await db.query('DELETE FROM users WHERE id = $1', [req.user.id]);
    res.json({ message: 'تم حذف الحساب نهائياً' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في السيرفر' });
  }
});

module.exports = { router, verifyToken, createToken };
