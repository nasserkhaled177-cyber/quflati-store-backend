const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// قائمة
router.get('/', async (req,res)=>{ 
  try{
    const where={};
    if(req.query.countryCode) where.countryCode=req.query.countryCode;
    else if(req.query.country) where.country=req.query.country;
    if(req.query.city) where.city=req.query.city;
    if(req.query.province) where.province=req.query.province;
    const s = await prisma.supplier.findMany({where, orderBy:{createdAt:'desc'}}); 
    res.json(s.map(x=>({...x,_id:x.id}))); 
  }catch(e){ res.json([]) }
});

// اضافة
router.post('/', async (req,res)=>{ 
  try{ 
    const s = await prisma.supplier.create({data:{name:req.body.name, phone:req.body.phone, password:req.body.password, city:req.body.city||'الرياض', country:req.body.country||'', countryCode:req.body.countryCode||'', province:req.body.province||req.body.city||'الرياض', status:'نشط'}}); 
    res.json({...s,_id:s.id}); 
  }catch(e){ res.status(400).json({error:e.message}) } 
});

// دخول - مصلح من الكراش
router.post('/login', async (req,res)=>{
  try{
    const supplier = await prisma.supplier.findUnique({where:{email:req.body.email}});
    if(!supplier) return res.status(404).json({error:'المورد غير موجود'});
    
    res.json({ 
      ...supplier, 
      isFrozen: supplier.status === 'مجمد',
      canAdd: supplier.status !== 'مجمد'
    });
  }catch(e){ res.status(500).json({error:e.message}) }
});

// ✅ 1- حذف مع تصفية حساب
router.delete('/:id', async (req,res)=>{
  try{
    const id = req.params.id
    const supplier = await prisma.supplier.findUnique({where:{id}})
    if(!supplier) return res.status(404).json({error:'غير موجود'})
    try{ await prisma.product.deleteMany({where:{supplierId:id}}) }catch{}
    try{ await prisma.order.deleteMany({where:{supplierId:id}}) }catch{}
    await prisma.supplier.delete({where:{id}})
    res.json({message:'تمت التصفية والحذف', supplier})
  }catch(e){ res.status(500).json({error:e.message}) }
})

// ✅ 2- تجميد / تنشيط - مصلح
router.post('/:id/status', async (req,res)=>{
  try{
    const { status } = req.body // نشط او مجمد
    const updated = await prisma.supplier.update({
      where:{ id: req.params.id },
      data:{ status }
    });
    
    // لما يتجمد اخفي منتجاته بالطريقة الصحيحة حسب الـ schema حقك
    if(status === 'مجمد'){
      await prisma.product.updateMany({
        where:{ supplierId: req.params.id },
        data:{ isApproved:false, isActive:false, status:'مخفي' }
      });
    } else {
      await prisma.product.updateMany({
        where:{ supplierId: req.params.id },
        data:{ isApproved:true, isActive:true, status:'approved' }
      });
    }
    res.json(updated);
  }catch(e){ res.status(500).json({error:e.message}) }
})

// ✅ 3- كشف حساب
router.get('/:id/account', async (req,res)=>{
  try{
    const id = req.params.id
    const supplier = await prisma.supplier.findUnique({where:{id}})
    let products=[], orders=[]
    try{ products = await prisma.product.findMany({where:{supplierId:id}}) }catch{}
    try{ orders = await prisma.order.findMany({where:{supplierId:id}, orderBy:{createdAt:'desc'}}) }catch{}
    const totalSales = orders.reduce((a,o)=> a + (o.total||o.totalPrice||0), 0)
    res.json({ supplier, products, orders, stats:{ productsCount:products.length, ordersCount:orders.length, totalSales } })
  }catch(e){ res.status(500).json({error:e.message}) }
})

router.get('/:id/export', async (req,res)=>{
  const id = req.params.id
  const supplier = await prisma.supplier.findUnique({where:{id}})
  let orders=[]; try{ orders = await prisma.order.findMany({where:{supplierId:id}}) }catch{}
  res.json({ supplier, orders, exportedAt: new Date() })
})


// تعديل بيانات المورد - الدولة / المدينة
router.put('/:id', async (req,res)=>{
  try{
    const data={};
    if(req.body.name!==undefined) data.name=req.body.name;
    if(req.body.phone!==undefined) data.phone=req.body.phone;
    if(req.body.city!==undefined) data.city=req.body.city;
    if(req.body.country!==undefined) data.country=req.body.country;
    if(req.body.countryCode!==undefined) data.countryCode=req.body.countryCode;
    if(req.body.province!==undefined) data.province=req.body.province;
    if(req.body.status!==undefined) data.status=req.body.status;
    const s = await prisma.supplier.update({where:{id:req.params.id}, data});
    res.json({...s,_id:s.id});
  }catch(e){ res.status(500).json({error:e.message}) }
});

module.exports = router;
