const express=require('express');
const router=express.Router();
const {PrismaClient}=require('@prisma/client');
const prisma=new PrismaClient();

// ✅ واجهة المتجر - لازم تكون أول واحد قبل /:id
router.get('/store', async(req,res)=>{
  try{
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    const {country, countryCode, city, province} = req.query;
    const whereStore={isDeleted:false, isActive:true};
    if(countryCode) whereStore.countryCode=countryCode;
    else if(country) whereStore.country=country;
    if(city) whereStore.city=city;
    if(province) whereStore.province=province;
    const all=await prisma.product.findMany({where:whereStore, orderBy:{createdAt:'desc'}});
    
    // تجميع بنفس اسم المنتج
    const grouped={};
    for(const p of all){
      const key=p.name.trim().toLowerCase();
      if(!grouped[key]){
        grouped[key]={...p, totalStock:p.stock, suppliers:[p.supplierId], suppliersCount:1};
      }else{
        grouped[key].totalStock+=p.stock;
      }
    }
    res.json(Object.values(grouped));
  }catch(e){
    console.error(e);
    res.json([]);
  }
});

router.get('/', async(req,res)=>{
  const {supplierId, deleted, forStore}=req.query;
  if(forStore==='true'){
    res.set('Cache-Control', 'no-store');
    const all=await prisma.product.findMany({where:{isDeleted:false, isActive:true}});
    const grouped={};
    for(const p of all){
      const key=p.name.trim().toLowerCase();
      if(!grouped[key]){
        grouped[key]={...p, totalStock:p.stock, suppliers:[p.supplierId], suppliersCount:1};
      }else{
        grouped[key].totalStock+=p.stock;
      }
    }
    return res.json(Object.values(grouped));
  }
  const where={};
  if(supplierId) where.supplierId=supplierId;
  if(req.query.countryCode) where.countryCode=req.query.countryCode;
  else if(req.query.country) where.country=req.query.country;
  if(req.query.city) where.city=req.query.city;
  if(req.query.province) where.province=req.query.province;
  if(req.query.countryCode) where.countryCode=req.query.countryCode;
  else if(req.query.country) where.country=req.query.country;
  if(req.query.city) where.city=req.query.city;
  if(req.query.province) where.province=req.query.province;
  if(deleted==='true'){
    where.isDeleted=true;
    try{ where.isPermanent=false }catch{}
  }else{
    where.isDeleted=false;
  }
  const list=await prisma.product.findMany({where, orderBy:{createdAt:'desc'}});
  res.json(list);
});

router.get('/trash/all', async(req,res)=>{
  const {supplierId}=req.query;
  const where={isDeleted:true};
  if(supplierId) where.supplierId=supplierId;
  try{ where.isPermanent=false }catch{}
  const list=await prisma.product.findMany({where, orderBy:{deletedAt:'desc'}});
  res.json(list);
});

router.post('/', async(req,res)=>{
  try{
    const b=req.body;
    let supplierId=b.supplierId;
    if(!supplierId || supplierId==='demo'){
      const s=await prisma.supplier.findFirst();
      supplierId=s?s.id:'cmvi5sbir0000gx9ef41ti5bo';
    }
    const nameClean=b.name.trim();
    const allProducts=await prisma.product.findMany({where:{isDeleted:false}});
    const existingSameName=allProducts.find(p=>p.name.trim().toLowerCase()===nameClean.toLowerCase());

    if(existingSameName){
      if(existingSameName.supplierId===supplierId){
        return res.status(400).json({error:`المنتج "${nameClean}" موجود لديك - استخدم توريد`, code:'DUPLICATE_SAME_SUPPLIER'});
      }
      const prod=await prisma.product.create({data:{
        name:existingSameName.name,
        description:existingSameName.description||b.description||'',
        price:existingSameName.price||parseFloat(b.price)||0,
        originalPrice:existingSameName.originalPrice||parseFloat(b.price)||0,
        stock:parseInt(b.stock)||0,
        supplierId, supplierName:b.supplierName||supplierId,
        country:b.country||existingSameName.country||'',
        countryCode:b.countryCode||existingSameName.countryCode||'',
        city:b.city||existingSameName.city||'',
        province:b.province||b.city||existingSameName.province||'',
        category:existingSameName.category||b.category||'عام',
        status:'approved', isApproved:true, isActive:true, isDeleted:false,
        isPermanent:false,
        imageUrl:existingSameName.imageUrl||b.imageUrl||'',
        images:existingSameName.images||b.images||'',
        sku:`SKU-${Date.now()}`,
      }});
      return res.json(prod);
    }

    const prod=await prisma.product.create({data:{
      name:nameClean, description:b.description||'', price:parseFloat(b.price)||0,
      originalPrice:parseFloat(b.originalPrice||b.price)||0,
      stock:parseInt(b.stock)||0, supplierId, supplierName:b.supplierName||supplierId,
      country:b.country||'', countryCode:b.countryCode||'', city:b.city||'', province:b.province||b.city||'',
      category:b.category||'عام', status:'approved', isApproved:true, isActive:true,
      isDeleted:false, isPermanent:false,
      imageUrl:b.imageUrl||'', images:b.images||'', sku:b.sku||`SKU-${Date.now()}`,
    }});
    res.json(prod);
  }catch(e){ console.error(e); res.status(500).json({error:e.message}) }
});

router.put('/:id', async(req,res)=>{
  try{
    const b=req.body; const data={};
    if(b.name!==undefined) data.name=b.name.trim();
    if(b.country!==undefined) data.country=b.country;
    if(b.countryCode!==undefined) data.countryCode=b.countryCode;
    if(b.city!==undefined) data.city=b.city;
    if(b.province!==undefined) data.province=b.province;
    if(b.country!==undefined) data.country=b.country;
    if(b.countryCode!==undefined) data.countryCode=b.countryCode;
    if(b.city!==undefined) data.city=b.city;
    if(b.province!==undefined) data.province=b.province;
    if(b.price!==undefined) data.price=parseFloat(b.price);
    if(b.stock!==undefined) data.stock=parseInt(b.stock);
    if(b.isDeleted!==undefined) data.isDeleted=b.isDeleted;
    if(b.deletedAt!==undefined) data.deletedAt=b.deletedAt?new Date(b.deletedAt):null;
    if(b.isPermanent!==undefined) data.isPermanent=b.isPermanent;
    const updated=await prisma.product.update({where:{id:req.params.id}, data});
    res.json(updated);
  }catch(e){ res.status(500).json({error:e.message}) }
});

router.delete('/:id/permanent', async(req,res)=>{
  try{
    const p=await prisma.product.findUnique({where:{id:req.params.id}});
    if(p){
      await prisma.product.update({where:{id:req.params.id}, data:{isDeleted:true, isPermanent:true, stock:0, deletedAt:new Date()}});
    }
    res.json({ok:true});
  }catch(e){ res.status(500).json({error:e.message}) }
});

module.exports=router;
