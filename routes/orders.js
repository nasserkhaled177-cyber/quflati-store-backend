const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const calcNet = (p) => { const v=parseFloat(p)||0; return v - v*0.10 - v*0.15 }

router.post('/create', async (req,res)=>{
  try{
    const { orderNumber, customer, items, gross, net, status } = req.body;
    if(!orderNumber) return res.status(400).json({error:'orderNumber required'});

    // جمع الموردين
    const bySupplier = {};
    for(let it of (items||[])){
      let sid = it.supplierId || 'unknown'
      try{
        const prod = await prisma.product.findUnique({where:{id:it.productId}});
        if(prod && prod.supplierId) sid = prod.supplierId
        if(prod) await prisma.product.update({where:{id:it.productId}, data:{stock:{decrement: it.quantity||1}}}).catch(()=>{});
      }catch{}
      if(!bySupplier[sid]) bySupplier[sid] = {supplierId: sid, supplierName: it.supplierName||'', items: []}
      bySupplier[sid].items.push(it)
      if(it.supplierName) bySupplier[sid].supplierName = it.supplierName
    }

    const firstSupplier = Object.values(bySupplier)[0]
    const totalGross = (items||[]).reduce((s,it)=> s + (parseFloat(it.price)||0)*(it.quantity||1), 0)

const master = await prisma.masterOrder.create({
  data:{
    orderNumber,
    customerName: customer?.name||'عميل',
    customerPhone: customer?.phone||'',
    customerAddress: customer?.address||'',
    customerLat: customer?.lat||0, customerLng: customer?.lng||0,
    hubSupplierId: firstSupplier?.supplierId,
    hubSupplierName: firstSupplier?.supplierName||'',
    status: status||'awaiting_approval',
    overallStatus: 'جارية',
    isRated: false,
    gross: totalGross,
    appFee10: totalGross*0.10,
    tax15: totalGross*0.15,
    net: totalGross - totalGross*0.10 - totalGross*0.15,
    totalAmount: totalGross,
    // ✅ هذا اللي كان ناقصك - حفظ المنتجات
    items: {
      create: (items||[]).map(it => ({
        productId: it.productId || it.id || '',
        name: it.name || '',
        price: parseFloat(it.price)||0,
        quantity: parseInt(it.quantity)||1,
        supplierId: it.supplierId || '',
        supplierName: it.supplierName || '',
      }))
    },
    subOrders: {
      create: Object.values(bySupplier).map(g=>({
        supplierId: g.supplierId,
        supplierName: g.supplierName||'مورد',
        status: 'pending',
        note: JSON.stringify(g.items.map(i=>({name:i.name, qty:i.quantity, price:i.price})))
      }))
    }
  },
  include:{items:true, subOrders:true}
});
    res.json({ok:true, order: master});
  }catch(e){ console.error(e); res.status(500).json({error:e.message}) }
});

router.get('/', async (req,res)=>{
  try{
    const { supplierId, phone } = req.query;
    const where={};
    if(phone) where.customerPhone=phone;

    const masters = await prisma.masterOrder.findMany({
      where,
      orderBy:{createdAt:'desc'},
      include:{items:true, subOrders:true}
    });

    // لو طلب من مورد معين -> فلتر فقط منتجاته
    let filtered = masters
    if(supplierId){
      filtered = masters.filter(m => 
        m.hubSupplierId===supplierId || 
        m.items.some(it=>it.supplierId===supplierId) ||
        m.subOrders.some(s=>s.supplierId===supplierId)
      ).map(m=>{
        const myItems = m.items.filter(it=>it.supplierId===supplierId || m.hubSupplierId===supplierId || m.items.length===1)
        const myGross = myItems.reduce((s,it)=>s+it.price*it.quantity,0)
        const myNet = myItems.reduce((s,it)=>s+calcNet(it.price)*it.quantity,0)
        return {
          id: m.id,
          orderNumber: m.orderNumber,
          customerName: m.customerName,
          customerPhone: m.customerPhone,
          customerAddress: m.customerAddress,
          status: m.subOrders.find(s=>s.supplierId===supplierId)?.status || m.status,
          supplierStatus: m.status==='completed'?'completed':'ongoing',
          supplierId: supplierId,
          price: myGross,
          gross: myGross,
          net: myNet,
          items: myItems,
          productName: JSON.stringify(myItems.map(i=>({name:i.name, price:i.price, quantity:i.quantity, productId:i.productId, net: calcNet(i.price)}))),
          createdAt: m.createdAt,
          isPartial: m.items.length !== myItems.length
        }
      })
    } else {
      filtered = masters.map(m=>({
        id: m.id,
        orderNumber: m.orderNumber,
        customerName: m.customerName,
        customerPhone: m.customerPhone,
        status: m.status,
        supplierStatus: 'ongoing',
        supplierId: m.hubSupplierId,
        price: m.gross, gross: m.gross, net: m.net,
        items: m.items,
        productName: JSON.stringify(m.items.map(i=>({name:i.name, price:i.price, quantity:i.quantity, productId:i.productId, net: calcNet(i.price)}))),
        createdAt: m.createdAt
      }))
    }
    res.json(filtered);
  }catch(e){ console.error(e); res.status(500).json({error:e.message}) }
});

router.get('/by-number/:orderNumber', async (req,res)=>{
  const order = await prisma.masterOrder.findFirst({where:{orderNumber:req.params.orderNumber}, include:{items:true, subOrders:true}});
  if(!order) return res.status(404).json({error:'not found'});
  res.json(order);
});

router.get('/supplier/ongoing', async (req,res)=>{
  const { supplierId } = req.query;
  const where = supplierId ? {hubSupplierId: supplierId} : {status:{not:'completed'}};
  const masters = await prisma.masterOrder.findMany({where, orderBy:{createdAt:'desc'}, include:{items:true, subOrders:true}});
  res.json(masters);
});

router.put('/:id/status', async (req,res)=>{
  try{
    const { status, supplierId } = req.body;
    const master = await prisma.masterOrder.findFirst({where:{orderNumber:req.params.id}, include:{subOrders:true}});
    if(!master) return res.status(404).json({error:'not found'});

    // اذا مرسل supplierId -> حدث فقط subOrder تبعه
    if(supplierId){
      const sub = master.subOrders.find(s=>s.supplierId===supplierId);
      if(sub){
        await prisma.subOrder.update({where:{id:sub.id}, data:{status: status||sub.status}});
        // اذا كل subOrders مكتملة -> اكمل Master
        const allSubs = await prisma.subOrder.findMany({where:{masterOrderId: master.id}});
        const allCompleted = allSubs.every(s=> s.id===sub.id ? status==='completed' : s.status==='completed');
        if(allCompleted){
          await prisma.masterOrder.update({where:{id:master.id}, data:{status:'completed'}});
        }
      }
    } else {
      await prisma.masterOrder.update({where:{id:master.id}, data:{status: status||master.status}});
      await prisma.subOrder.updateMany({where:{masterOrderId: master.id}, data:{status: status||'pending'}});
    }
    const updated = await prisma.masterOrder.findFirst({where:{id:master.id}, include:{items:true, subOrders:true}});
    res.json(updated);
  }catch(e){ console.error(e); res.status(500).json({error:e.message}) }
});



router.put('/suborder/:id/status', async (req,res)=>{
  try{
    const { status } = req.body
    const sub = await prisma.subOrder.update({ 
      where:{id:req.params.id}, 
      data:{status} 
    })
    const master = await prisma.masterOrder.findFirst({ 
      where:{ id: sub.masterOrderId }, 
      include:{ subOrders:true } 
    })
    const allDone = master.subOrders.every(s=> s.status==='مكتمل')
    if(allDone){
      await prisma.masterOrder.update({ 
        where:{id: master.id}, 
        data:{ overallStatus:'مكتمل', status:'completed' } 
      })
    } else {
      await prisma.masterOrder.update({ 
        where:{id: master.id}, 
        data:{ overallStatus:'جارية' } 
      })
    }
    res.json({ok:true, sub, allDone})
  }catch(e){ res.status(500).json({error:e.message}) }
})
// ✅ 1 - فاتورة الادمن كاملة برقم الطلب
router.get('/admin/by-number/:orderNumber', async (req,res)=>{
  try{
    const order = await prisma.masterOrder.findFirst({
      where:{ orderNumber: req.params.orderNumber },
      include:{ items:true, subOrders:true }
    })
    if(!order) return res.status(404).json({ error:'الطلب غير موجود' })

    // تجميع حسب المورد
    const bySupplier = {}
    for(const it of order.items){
      const sid = it.supplierId || 'unknown'
      if(!bySupplier[sid]) bySupplier[sid] = { supplierId: sid, supplierName: it.supplierName || '', items: [], gross: 0 }
      bySupplier[sid].items.push(it)
      bySupplier[sid].gross += it.price * it.quantity
    }

    res.json({
      // بيانات العميل
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerAddress: order.customerAddress,
      customerLat: order.customerLat,
      customerLng: order.customerLng,
      // بيانات الطلب
      status: order.status,
      overallStatus: order.overallStatus,
      createdAt: order.createdAt,
      // المورد المجمع الحالي
      hubSupplierId: order.hubSupplierId,
      hubSupplierName: order.hubSupplierName,
      // التفاصيل
      items: order.items,
      bySupplier: Object.values(bySupplier),
      subOrders: order.subOrders,
      // الاجماليات
      gross: order.gross,
      appFee10: order.appFee10,
      tax15: order.tax15,
      net: order.net,
      totalAmount: order.totalAmount,
    })
  }catch(e){ console.error(e); res.status(500).json({ error: e.message }) }
})

// ✅ 2 - الادمن يعين عند مين يتجمع الطلب
// هذا المورد يصير هو المسؤول، وحالته هي اللي تطلع عند العميل
router.put('/admin/:orderNumber/assign-hub', async (req,res)=>{
  try{
    const { supplierId, supplierName } = req.body
    if(!supplierId) return res.status(400).json({ error:'supplierId مطلوب' })

    const order = await prisma.masterOrder.findFirst({ where:{ orderNumber: req.params.orderNumber }, include:{ subOrders:true } })
    if(!order) return res.status(404).json({ error:'الطلب غير موجود' })

    // ✅ نعين المجمع الجديد
    await prisma.masterOrder.update({
      where:{ id: order.id },
      data:{
        hubSupplierId: supplierId,
        hubSupplierName: supplierName || order.subOrders.find(s=>s.supplierId===supplierId)?.supplierName || '',
        status: 'awaiting_approval', // نرجعه لبانتظار الموافقة عند المجمع الجديد
      }
    })

    // ✅ كل الموردين الثانيين يصيرون بانتظار، والمجمع هو المسؤول
    for(const sub of order.subOrders){
      await prisma.subOrder.update({
        where:{ id: sub.id },
        data:{ status: sub.supplierId === supplierId ? 'awaiting_approval' : 'waiting_hub' }
      })
    }

    const updated = await prisma.masterOrder.findFirst({ where:{ id: order.id }, include:{ items:true, subOrders:true } })
    res.json({ ok:true, order: updated })
  }catch(e){ console.error(e); res.status(500).json({ error: e.message }) }
})

// ✅ 3 - تحديث حالة من المورد المجمع فقط - بالـ orderNumber مو بالـ id
// هذا هو اللي يخلي حالة المورد تطلع عند العميل
router.put('/:orderNumber/status', async (req,res)=>{
  try{
    const { status, supplierId } = req.body
    const master = await prisma.masterOrder.findFirst({ where:{ orderNumber: req.params.orderNumber }, include:{ subOrders:true } })
    if(!master) return res.status(404).json({ error:'not found' })

    // ✅ اذا المورد مو المجمع، لا يقدر يغير حالة الطلب كله، يغير حالته هو بس
    if(supplierId && supplierId !== master.hubSupplierId){
      const sub = master.subOrders.find(s=>s.supplierId===supplierId)
      if(sub) await prisma.subOrder.update({ where:{ id: sub.id }, data:{ status } })
      return res.json({ ok:true, onlySub: true, message:'انت مو المجمع، حدثت حالتك انت فقط' })
    }

    // ✅ المجمع يغير حالة الطلب كله، وهي اللي تطلع عند العميل
    await prisma.masterOrder.update({ where:{ id: master.id }, data:{ status } })
    if(master.hubSupplierId){
      const hubSub = master.subOrders.find(s=>s.supplierId===master.hubSupplierId)
      if(hubSub) await prisma.subOrder.update({ where:{ id: hubSub.id }, data:{ status } })
    }
    if(status === 'completed'){
      await prisma.masterOrder.update({ where:{ id: master.id }, data:{ overallStatus:'مكتمل' } })
    }

    const updated = await prisma.masterOrder.findFirst({ where:{ id: master.id }, include:{ items:true, subOrders:true } })
    res.json(updated)
  }catch(e){ console.error(e); res.status(500).json({ error: e.message }) }
})

module.exports = router;
