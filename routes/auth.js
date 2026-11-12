const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();

// نفس الفني بالضبط - بريزما، مو db
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ============================
// 1. صنع التوكن - نفس الفني بالضبط
// ============================
function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role, // CUSTOMER في الستور، TECHNICIAN في الفني
      phone: user.phone,
      email: user.email || null,
      name: user.name || null
    },
    process.env.JWT_SECRET, // لازم يكون نفس السكريت في الاثنين في ريندر
    { expiresIn: '30d' }
  );
}

// ============================
// 2. التحقق من التوكن - نفس الفني بالضبط
// ============================
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

// ============================
// 3. تسجيل عميل جديد
// ============================
router.post('/register', async (req, res) => {
  try {
    const { name, phone, email, password } = req.body;
    if (!name || !phone || !password) {
      return res.status(400).json({ message: 'أكمل كل البيانات' });
    }

    const existing = await prisma.storeUser.findFirst({ where: { phone } });
    if (existing) {
      return res.status(400).json({ message: 'هذا الرقم مسجل من قبل' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.storeUser.create({
      data: {
        name,
        phone,
        email: email || null,
        password: hashedPassword,
        role: 'CUSTOMER'
      },
      select: { id: true, name: true, phone: true, email: true, role: true, createdAt: true }
    });

    const token = createToken(user);
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
    const user = await prisma.storeUser.findFirst({ where: { phone } });
    if (!user) {
      return res.status(400).json({ message: 'الحساب غير موجود' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'كلمة السر غلط' });
    }
    const { password: _, ...safeUser } = user;
    const token = createToken(safeUser);
    res.json({ token, user: safeUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في السيرفر' });
  }
});

// ============================
// 5. قراءة الحساب - تاب حسابي
// ============================
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await prisma.storeUser.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, phone: true, email: true, role: true, createdAt: true }
    });
    if (!user) {
      return res.status(404).json({ message: 'الحساب غير موجود' });
    }
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في السيرفر' });
  }
});

// ============================
// 6. حذف الحساب
// ============================
router.delete('/delete-account', verifyToken, async (req, res) => {
  try {
    await prisma.storeUser.delete({ where: { id: req.user.id } });
    res.json({ message: 'تم حذف الحساب نهائياً' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في السيرفر' });
  }
});

module.exports = { router, verifyToken, createToken };
