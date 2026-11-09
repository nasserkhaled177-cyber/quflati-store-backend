const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'quflati-secret-change-me';
function makeToken(u){ return jwt.sign({ id: u.id, name: u.name, phone: u.phone, email: u.email, role: u.role || 'CUSTOMER' }, SECRET, { expiresIn: '7d' }); }
const prisma = new PrismaClient();

const normPhone = (p)=> String(p||'').replace(/\s/g,'').replace(/^\+966/,'0').replace(/^\+967/,'0');
const normEmail = (e)=> String(e||'').trim().toLowerCase();

// ===== فحص - هل الحساب موجود؟ - للبوابة =====
router.post('/check', async (req,res)=>{
  const { email, phone } = req.body;
  const e = normEmail(email), p = normPhone(phone);
  const byEmail = e ? await prisma.storeUser.findUnique({where:{email:e}}).catch(()=>null) : null;
  const byPhone = p ? await prisma.storeUser.findUnique({where:{phone:p}}).catch(()=>null) : null;
  if(byEmail) return res.json({ exists:true, by:'email', user:{id:byEmail.id, name:byEmail.name, email:byEmail.email, phone:byEmail.phone} });
  if(byPhone) return res.json({ exists:true, by:'phone', user:{id:byPhone.id, name:byPhone.name, email:byPhone.email, phone:byPhone.phone} });
  return res.json({ exists:false });
});

// ===== تسجيل عميل - الايميل + الجوال اجباري - الجوال هو المفتاح =====
router.post('/register', async (req,res)=>{
  try{
    const { name, email, phone, password, mode, city } = req.body;
    const e = normEmail(email);
    const p = normPhone(phone);
    if(!e || !e.includes('@')) return res.status(400).json({ message:'الايميل اجباري' });
    if(!p) return res.status(400).json({ message:'رقم الجوال اجباري - هو مفتاح حسابك' });
    if(!password || password.length<6) return res.status(400).json({ message:'كلمة المرور 6 احرف على الاقل' });

    // 1 - نفس الايميل مسجل قبل
    const byEmail = await prisma.storeUser.findUnique({where:{email:e}}).catch(()=>null);
    if(byEmail) return res.status(409).json({ message:'هذا الايميل مسجل قبل - سجل دخول' });

    // 2 - نفس الرقم مربوط بايميل ثاني
    const byPhone = await prisma.storeUser.findUnique({where:{phone:p}}).catch(()=>null);
    if(byPhone){
      if(byPhone.email && byPhone.email !== e) return res.status(409).json({ message:`هذا الرقم مربوط بايميل اخر (${byPhone.email}) - ما تقدر تسجل فيه مرة ثانية` });
      return res.status(409).json({ message:'هذا الرقم مسجل قبل - سجل دخول' });
    }

    const hashed = await bcrypt.hash(password, 10).catch(()=>password);
    const user = await prisma.storeUser.create({ data:{
      name: (name||'عميل').trim(), email:e, phone:p, password:hashed, role:'CUSTOMER', city: city||'Riyadh'
    }});
    const { password:_, ...safe } = user;
    return res.json({ token: makeToken(user), user: safe });
  }catch(err){ console.log('register err', err); return res.status(500).json({ message: err.message }); }
});

// ===== دخول - بايميل او جوال - يرجع id فعلي =====
router.post('/login', async (req,res)=>{
  try{
    const { email, phone, password, qq, id } = req.body;
    const raw = normEmail(email || qq || id || phone);
    const p = normPhone(phone || qq || id || '');
    let user = null;
    if(raw.includes('@')) user = await prisma.storeUser.findUnique({where:{email:raw}}).catch(()=>null);
    if(!user && p) user = await prisma.storeUser.findUnique({where:{phone:p}}).catch(()=>null);
    if(!user && raw) user = await prisma.storeUser.findFirst({where:{OR:[{email:raw},{phone:raw}]}}).catch(()=>null);
    if(!user) return res.status(404).json({ message:'الحساب غير موجود - سجل جديد' });
    const ok = await bcrypt.compare(password||'', user.password).catch(()=> password===user.password);
    if(!ok) return res.status(401).json({ message:'كلمة المرور خطأ' });
    const { password:_, ...safe } = user;
    return res.json({ token: makeToken(user), user: safe });
  }catch(err){ return res.status(500).json({ message: err.message }); }
});

// ===== فحص - وش المحفوظ - مؤقت =====
router.get('/debug-users', async (req,res)=>{
  const list = await prisma.storeUser.findMany({ select:{id:true, name:true, email:true, phone:true, role:true, createdAt:true}, orderBy:{createdAt:'desc'} }).catch(e=>[]);
  return res.json({ count:list.length, users:list });
});

module.exports = router;
