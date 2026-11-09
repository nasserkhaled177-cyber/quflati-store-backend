const express = require("express")
const router = express.Router()

function authMiddleware(req, res, next){
  const token = (req.headers.authorization || "").replace("Bearer ", "")
  if(!token) return res.status(401).json({ message:"غير مسجل دخول" })
  // ✅ التوكن حقك token-<id> - مو JWT
  if(token.startsWith("token-")){ req.user = { id: token.replace("token-", "") }; return next() }
  try{ req.user = require("jsonwebtoken").verify(token, process.env.JWT_SECRET || "quflati-secret"); return next() }
  catch(e){ return res.status(401).json({ message:"توكن منتهي" }) }
}

router.get("/me", authMiddleware, async (req, res)=>{
  try{
    const prisma = req.app.get("prisma")
    const db = req.app.get("db")
    let user = null
    if(prisma){ user = await prisma.user.findUnique({ where:{ id: req.user.id } }) }
    else if(db){ user = await db.collection("users").findOne({ _id: req.user.id }) }
    if(!user) return res.status(401).json({ message:"الحساب غير موجود" })
    delete user.password; delete user.passwordHash
    return res.json({ user })
  }catch(e){ return res.status(500).json({ message:"فشل" }) }
})

router.put("/me", authMiddleware, async (req, res)=>{
  try{
    const prisma = req.app.get("prisma")
    const db = req.app.get("db")
    const patch = { ...(req.body || {}) }
    delete patch.password; delete patch.passwordHash; delete patch.id
    if(prisma){ await prisma.user.update({ where:{ id: req.user.id }, data: patch }) }
    else if(db){ await db.collection("users").updateOne({ _id: req.user.id }, { $set: patch }) }
    return res.json({ ok:true })
  }catch(e){ return res.status(500).json({ message:"فشل الحفظ" }) }
})

module.exports = router
