const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
router.get('/', async (req,res)=>{ const t = await prisma.technician.findMany(); res.json(t); });
router.post('/', async (req,res)=>{ try{ const t = await prisma.technician.create({data:{name:req.body.name, phone:req.body.phone, password:req.body.password, specialty:req.body.specialty||'تركيب'}}); res.json(t); }catch(e){ res.status(400).json({error:e.message}) } });
module.exports = router;
