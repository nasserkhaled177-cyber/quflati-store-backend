const express=require('express');
const router=express.Router();
const {PrismaClient}=require('@prisma/client');
const prisma=new PrismaClient();
router.post('/', async(req,res)=>{
  try{
    const b=req.body;
    const entry=await prisma.supplierLedger.create({data:{
      supplierId:b.supplierId, productId:b.productId||null, productName:b.productName||'',
      action:b.action||'ADD_PRODUCT', description:b.description||'',
      qtyBefore:b.qtyBefore!=null?parseInt(b.qtyBefore):null,
      qtyAfter:b.qtyAfter!=null?parseInt(b.qtyAfter):null,
      delta:b.delta!=null?parseInt(b.delta):null,
      amount:b.amount?parseFloat(b.amount):0
    }});
    res.json(entry);
  }catch(e){ res.status(500).json({error:e.message}) }
});
router.get('/:supplierId', async(req,res)=>{
  const list=await prisma.supplierLedger.findMany({where:{supplierId:req.params.supplierId}, orderBy:{createdAt:'desc'}});
  res.json(list);
});
module.exports=router;
