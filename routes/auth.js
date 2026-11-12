// routes/auth.js - التسجيل / الدخول - بدون كلمة سر - OTP بس + جوجل
const express = require('express');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();

// ✅ كود تجريبي - في التطوير بس - 123456 - قبل ما نربط خدمة الرسائل الحقيقية
const DEV_OTP = '123456';
const isDev = process.env.NODE_ENV !== 'production';

// ✅ نعرف من المربع الواحد - هل حط ايميل او جوال؟
function detectInput(input) {
  const v = String(input || '').trim();
  if (v.includes('@')) return { type: 'email', value: v.toLowerCase() };
  // جوال - نشيل المسافات والـ + و 00 - ونخليه ارقام بس
  const phone = v.replace(/[\s\-\(\)]/g, '').replace(/^\+/, '').replace(/^00/, '');
  return { type: 'phone', value: phone };
}

// ✅ نطلع توكن - بعد التحقق
function makeToken(user) {
  return jwt.sign(
    { id: user.id, phone: user.phone, email: user.email, role: user.role },
    process.env.JWT_SECRET || 'quflati-secret',
    { expiresIn: '30d' }
  );
}

// ------------------------------------------------
// 1 - الصفحة الاولى - يحط ايميل او جوال - ويضغط متابعة
// POST /api/auth/start - body: { input }
// ------------------------------------------------
router.post('/start', async (req, res) => {
  try {
    const { input } = req.body;
    if (!input) return res.status(400).json({ error: 'حط ايميل او جوال' });

    const { type, value } = detectInput(input);

    if (type === 'email') {
      // نبحث - هل الايميل مربوط بجوال مسجل عندنا؟
      const user = await prisma.storeUser.findFirst({ where: { email: value } });
      if (user && user.phone) {
        // مربوط - نرسل OTP على الجوال المربوط - ويدخل مباشرة
        await prisma.otpCode.create({
          data: { phone: user.phone, code: DEV_OTP, purpose: 'login', expiresAt: new Date(Date.now() + 5 * 60 * 1000) }
        });
        return res.json({ next: 'otp', phone: user.phone, message: 'ارسلنا كود على جوالك المربوط بهذا الايميل' });
      }
      // مو مربوط - نطلب منه الجوال في الصفحة الثانية
      return res.json({ next: 'need_phone', email: value, message: 'حط رقم جوالك عشان نكمل' });
    }

    // دخل بجوال بس - نرسل OTP عليه
    await prisma.otpCode.create({
      data: { phone: value, code: DEV_OTP, purpose: 'login', expiresAt: new Date(Date.now() + 5 * 60 * 1000) }
    });
    return res.json({ next: 'otp', phone: value, message: 'ارسلنا كود على جوالك' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'خطأ في السيرفر' });
  }
});

// ------------------------------------------------
// 2 - التحقق بالـ OTP - ويدخل - او يكمل تسجيله
// POST /api/auth/verify-otp - body: { phone, code, name?, email?, city? }
// ------------------------------------------------
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, code, name, email, city } = req.body;
    if (!phone || !code) return res.status(400).json({ error: 'حط الجوال والكود' });

    // ✅ في التطوير - نقبل 123456 - في الانتاج - نتحقق من جدول OtpCode
    let otpOk = false;
    if (isDev && code === DEV_OTP) otpOk = true;
    else {
      const otp = await prisma.otpCode.findFirst({
        where: { phone, code, used: false, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' }
      });
      if (otp) {
        otpOk = true;
        await prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } });
      }
    }
    if (!otpOk) return res.status(400).json({ error: 'الكود غلط او انتهى' });

    // هل الجوال مسجل من قبل؟
    let user = await prisma.storeUser.findFirst({ where: { phone } });

    if (user) {
      // موجود - نحدث phoneVerified - وندخله مباشرة - بدون ما نطلب اسم تاني
      user = await prisma.storeUser.update({
        where: { id: user.id },
        data: { phoneVerified: true }
      });
      return res.json({ token: makeToken(user), user, isNew: false });
    }

    // جديد - لازم اسم - اذا ما جاب اسم من جوجل - لازم يحطه يدوي في الصفحة الثانية
    if (!name) {
      return res.json({ next: 'need_name', phone, message: 'حط اسمك عشان نكمل' });
    }

    // نسجل جديد - المدينة تنحفظ وتثبت من اول مرة
    user = await prisma.storeUser.create({
      data: {
        phone,
        email: email ? String(email).toLowerCase() : null,
        name,
        city: city || '',
        cityLocked: !!city, // اذا جاب مدينة - نثبتها - اذا ما جاب - نطلبها بعدين مرة وحدة بس
        phoneVerified: true,
        authProvider: email ? 'phone+google' : 'phone',
      }
    });
    return res.json({ token: makeToken(user), user, isNew: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'خطأ في السيرفر' });
  }
});

// ------------------------------------------------
// 3 - جوجل - بعد ما يختار حسابه في جوجل
// POST /api/auth/google - body: { email, name, avatar, googleId, consent: 'allow' | 'deny' }
// consent = سماح - نسحب الاسم + الصورة - رفض - ما نسحب شي
// ------------------------------------------------
router.post('/google', async (req, res) => {
  try {
    const { email, name, avatar, googleId, consent } = req.body;
    if (!email) return res.status(400).json({ error: 'ما وصل الايميل من جوجل' });

    const allow = consent === 'allow';

    // هل الايميل مسجل من قبل؟
    let user = await prisma.storeUser.findFirst({ where: { email: String(email).toLowerCase() } });

    if (user) {
      // اذا وافق - نحدث الاسم + الصورة من جوجل - اذا رفض - ما نلمسهم
      if (allow) {
        user = await prisma.storeUser.update({
          where: { id: user.id },
          data: { name: name || user.name, avatar: avatar || user.avatar, googleId: googleId || user.googleId, authProvider: user.phone ? 'phone+google' : 'google' }
        });
      }
      // اذا عنده جوال - نرسل OTP على جواله ويدخل - اذا ما عنده جوال - نطلب منه الجوال في الصفحة الثانية
      if (user.phone) {
        await prisma.otpCode.create({
          data: { phone: user.phone, code: DEV_OTP, purpose: 'login', expiresAt: new Date(Date.now() + 5 * 60 * 1000) }
        });
        return res.json({ next: 'otp', phone: user.phone, user });
      }
      return res.json({ next: 'need_phone', email: user.email, user, googleName: allow ? name : null, googleAvatar: allow ? avatar : null });
    }

    // جديد من جوجل - نرجع له - الصفحة الثانية - تطلب جوال بس اذا وافق - او جوال + اسم اذا رفض
    return res.json({
      next: 'need_phone',
      email: String(email).toLowerCase(),
      googleId: googleId || null,
      googleName: allow ? name : null,
      googleAvatar: allow ? avatar : null,
      consent,
      message: allow ? 'سحبنا الاسم والصورة من جوجل - حط جوالك بس' : 'رفضت السحب - حط جوالك واسمك يدوي'
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'خطأ في السيرفر' });
  }
});

// ------------------------------------------------
// 4 - تاب حسابي - تعديل الاسم + الصورة بس - الجوال + المدينة ثابتين
// PUT /api/auth/me - headers: Authorization: Bearer <token> - body: { name?, avatar? }
// ------------------------------------------------
router.put('/me', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'ما فيه توكن' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'quflati-secret');
    const { name, avatar } = req.body;
    // ✅ ممنوع يغير phone او email او city من هنا - بس name و avatar
    const user = await prisma.storeUser.update({
      where: { id: decoded.id },
      data: { ...(name ? { name } : {}), ...(avatar !== undefined ? { avatar } : {}) }
    });
    res.json({ user });
  } catch (e) {
    res.status(401).json({ error: 'التوكن غلط' });
  }
});

// ------------------------------------------------
// 5 - اضافة ايميل - من حسابي - زر اضافة ايميل - مع تحقق OTP على الجوال
// POST /api/auth/add-email - body: { phone, email, code }
// ------------------------------------------------
router.post('/add-email', async (req, res) => {
  try {
    const { phone, email, code } = req.body;
    if (!phone || !email || !code) return res.status(400).json({ error: 'حط الجوال والايميل والكود' });
    if (isDev && code !== DEV_OTP) return res.status(400).json({ error: 'الكود غلط' });

    const user = await prisma.storeUser.findFirst({ where: { phone } });
    if (!user) return res.status(404).json({ error: 'الحساب مو موجود' });

    const updated = await prisma.storeUser.update({
      where: { id: user.id },
      data: { email: String(email).toLowerCase(), emailVerified: true, authProvider: 'phone+google' }
    });
    res.json({ user: updated, message: 'تم ربط الايميل بجوالك - الحين تقدر تدخل بالجوال او الايميل' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'خطأ في السيرفر' });
  }
});

module.exports = router;
