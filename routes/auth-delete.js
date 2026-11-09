const express = require("express")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")

const router = express.Router()
const DELETE_CODE = process.env.DELETE_CODE || "2026QF"

function authMiddleware(req, res, next){
  const token = (req.headers.authorization || "").replace("Bearer ", "")
  if(!token) return res.status(401).json({ message:"غير مسجل دخول" })
  try{ req.user = jwt.verify(token, process.env.JWT_SECRET || "quflati-secret"); next() }
  catch(e){ return res.status(401).json({ message:"توكن منتهي" }) }
}

router.delete("/delete-account", authMiddleware, async (req, res)=>{
  try{
    const { code, password, phone, email } = req.body
    if(!code) return res.status(400).json({ message:"ادخل رمز الحذف" })
    if(!password) return res.status(400).json({ message:"ادخل كلمة السر" })
    if(String(code).trim() !== String(DELETE_CODE).trim()){
      return res.status(400).json({ message:"رمز الحذف خطأ" })
    }
    const prisma = req.app.get("prisma")
    const db = req.app.get("db")
    let user = null
    if(prisma){ user = await prisma.user.findFirst({ where:{ OR:[ { id: req.user.id }, { phone }, { email } ] } }) }
    else if(db){ user = await db.collection("users").findOne({ $or:[ { _id: req.user.id }, { phone }, { email } ] }) }
    if(!user) return res.status(404).json({ message:"الحساب غير موجود" })
    const okPass = await bcrypt.compare(password, user.password || user.passwordHash || "")
    if(!okPass) return res.status(400).json({ message:"كلمة السر خطأ" })
    if(prisma){
      const userId = user.id
      await prisma.cartItem.deleteMany({ where:{ userId } }).catch(()=>{})
      await prisma.order.deleteMany({ where:{ userId } }).catch(()=>{})
      await prisma.favorite.deleteMany({ where:{ userId } }).catch(()=>{})
      await prisma.user.delete({ where:{ id: userId } })
    } else if(db){
      await db.collection("orders").deleteMany({ userId: user._id }).catch(()=>{})
      await db.collection("users").deleteOne({ _id: user._id })
    }
    return res.json({ ok:true, message:"تم حذف الحساب نهائي" })
  }catch(e){ console.error(e); return res.status(500).json({ message:"فشل حذف الحساب" }) }
})

module.exports = router
