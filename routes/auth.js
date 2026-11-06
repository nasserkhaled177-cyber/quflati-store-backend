const express = require('express')
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')
const prisma = new PrismaClient()
const router = express.Router()

async function findAny(q){
  const qq = (q||"").trim()
  if(!qq) return null
  const [supplier, storeUser, technician] = await Promise.all([
    prisma.supplier.findFirst({ where: { phone: qq } }),
    prisma.storeUser.findFirst({ where: { OR: [{ phone: qq }, { email: qq }] } }),
    prisma.technician.findFirst({ where: { phone: qq } }),
  ])
  if(supplier) return { exists:true, role:'SUPPLIER', name:supplier.name, phone:supplier.phone, user:supplier }
  if(technician) return { exists:true, role:'TECHNICIAN', name:technician.name, phone:technician.phone, user:technician }
  if(storeUser) return { exists:true, role:'CUSTOMER', name:storeUser.name, phone:storeUser.phone||storeUser.email, user:storeUser }
  return null
}

router.get('/check', async (req,res)=>{
  const r = await findAny(req.query.query)
  if(!r) return res.json({exists:false})
  res.json({exists:true, role:r.role, name:r.name, phone:r.phone})
})

router.post('/login', async (req,res)=>{
  try{
    const id = (req.body.phone || req.body.email || "").trim()
    const pass = (req.body.password || "").trim()
    console.log("LOGIN TRY:", id, "pass:", pass)
    const found = await findAny(id)
    if(!found){ console.log("not found"); return res.json({success:false, error:"حسابك غير مسجل"}) }

    const hash = found.user.password || ""
    let ok = false

    // يقبل الاثنين: نص عادي test و هاش bcrypt
    if(pass === hash) ok = true
    else {
      try{ ok = await bcrypt.compare(pass, hash) }catch(e){ console.log("bcrypt compare fail, try plain:", e.message); ok = false }
    }

    console.log("LOGIN RESULT ok=", ok, "role=", found.role)
    if(!ok) return res.json({success:false, error:"كلمة المرور خطأ - جرب test"})

    const token = require('jsonwebtoken').sign({id:found.user.id, role:found.role}, "quflati_secret_2026")
    res.json({success:true, token, user:{id:found.user.id, name:found.name, phone:found.phone, role:found.role}})
  }catch(e){ console.log(e); res.json({success:false, error:e.message}) }
})

router.post('/register', async (req,res)=>{
  const {name, email, phone, password, role} = req.body
  const id=(phone||email||"").trim()
  const r=(role||"CUSTOMER").toUpperCase()
  if(r==="SUPPLIER") return res.json({success:false, error:"المورد من 3006 فقط"})
  const ex=await findAny(id)
  if(ex){
    if(ex.role==="SUPPLIER") return res.json({success:false, error:`محجوز كمورد ${ex.phone}`})
    return res.json({success:false, error:`محجوز ك${ex.role}`})
  }
  const hashed=await bcrypt.hash(password,10)
  if(r==="TECHNICIAN"){
    const t=await prisma.technician.create({data:{name, phone:id, password:hashed, status:"بانتظار الموافقة"}})
    return res.json({success:true, user:t})
  }else{
    const u=await prisma.storeUser.create({data:{name, phone:!id.includes("@")?id:null, email:id.includes("@")?id:null, password:hashed, role:"CUSTOMER", city:"Riyadh"}})
    return res.json({success:true, user:u})
  }
})

module.exports = router
