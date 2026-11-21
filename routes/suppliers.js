const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 1. الأدمن يضيف مورد - من فرونت الأدمن
router.post('/', async (req, res) => {
  try {
    const { name, phone, password, city, country, countryCode, province } = req.body
    if(!name || !phone || !password) return res.status(400).json({ error: "الاسم والجوال وكلمة السر مطلوبة" })
    const created = await prisma.supplier.create({
      data: { name, phone, password, city: city || "", country: country || "اليمن", countryCode: countryCode || "+967", province: province || "", status: "نشط" }
    })
    const { password: _, ...safe } = created
    res.json(safe)
  } catch(e) {
    if(e.code === 'P2002') return res.status(400).json({ error: "الجوال هذا مسجل من قبل" })
    res.status(500).json({ error: e.message })
  }
})

// 2. الأدمن يعرض كل الموردين
router.get('/', async (req, res) => {
  try {
    const list = await prisma.supplier.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, name: true, phone: true, city: true, country: true, countryCode: true, province: true, status: true, createdAt: true } })
    res.json(list)
  } catch(e) { res.status(500).json({ error: e.message }) }
})

// 3. المورد يسجل دخول - من فرونت المورد
router.post('/login', async (req, res) => {
  const { phone, password } = req.body
  const supplier = await prisma.supplier.findUnique({ where: { phone } })
  if(!supplier || supplier.password !== password) return res.status(401).json({ error: "جوال أو كلمة سر غلط" })
  const token = "sup_" + supplier.id + "_" + Date.now()
  await prisma.supplier.update({ where: { id: supplier.id }, data: { token } })
  res.json({ token, supplier: { id: supplier.id, name: supplier.name, phone: supplier.phone, city: supplier.city } })
})

// 4. المورد يشوف بروفايله ومبيعاته - لازم يرسل التوكن
router.get('/me', async (req, res) => {
  const token = (req.headers.authorization || "").replace("Bearer ", "")
  if(!token) return res.status(401).json({ error: "مافي توكن" })
  const supplier = await prisma.supplier.findFirst({ where: { token } })
  if(!supplier) return res.status(401).json({ error: "توكن غلط" })
  const { password: _p, token: _t, ...safeMe } = supplier
  res.json(safeMe)
})

module.exports = router;
