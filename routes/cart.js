const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const RESERVE_MINUTES = 30;

async function getReservedQty(productId){
  try{
    const res = await prisma.cartReservation.findMany({
      where: { productId, status: 'reserved', expiresAt: { gt: new Date() } }
    });
    return res.reduce((s,r)=> s + r.quantity, 0);
  }catch{ return 0; }
}

router.get('/:sessionId', async (req,res)=>{
  try{
    await prisma.cartReservation.updateMany({
      where:{ expiresAt:{ lt: new Date() }, status:'reserved' },
      data:{ status:'expired' }
    });
    const cart = await prisma.cartReservation.findMany({
      where:{ sessionId:req.params.sessionId, status:'reserved', expiresAt:{ gt:new Date() } }
    });
    res.json(cart);
  }catch(e){ res.json([]) }
});

router.post('/add', async (req,res)=>{
  try{
    const { productId, quantity, sessionId } = req.body;
    const qtyToAdd = parseInt(quantity)||1;
    const prod = await prisma.product.findUnique({where:{id:productId}});
    if(!prod) return res.status(404).json({error:'المنتج غير موجود'});

    const reserved = await getReservedQty(productId);
    const available = prod.stock - reserved;
    
    // شوف اذا العميل عنده نفس المنتج محجوز مسبقا
    const existing = await prisma.cartReservation.findFirst({
      where:{ productId, sessionId, status:'reserved', expiresAt:{ gt: new Date() } }
    });

    // الكمية الحالية للعميل نفسه لا تحتسب ضمن المحجوز العام لأننا سنستبدلها
    const availableForThisUser = available + (existing ? existing.quantity : 0);

    if(qtyToAdd > availableForThisUser) return res.status(400).json({error:`الكمية المتاحة فقط ${availableForThisUser}`});
    
    let reservation;
    if(existing){
      // زود الكمية
      reservation = await prisma.cartReservation.update({
        where:{ id: existing.id },
        data:{ 
          quantity: existing.quantity + qtyToAdd,
          expiresAt: new Date(Date.now() + RESERVE_MINUTES*60*1000)
        }
      });
    } else {
      // جديد
      reservation = await prisma.cartReservation.create({
        data: {
          productId: prod.id,
          productName: prod.name,
          quantity: qtyToAdd,
          price: prod.price,
          supplierId: prod.supplierId || 'no-supplier',
          supplierName: prod.supplierName || 'مورد غير معروف',
          sessionId: sessionId,
          image: prod.imageUrl || null,
          status: 'reserved',
          expiresAt: new Date(Date.now() + RESERVE_MINUTES*60*1000)
        }
      });
    }
    res.json(reservation);
  }catch(e){ 
    console.log('CART ADD ERROR:', e.message);
    res.status(500).json({error:e.message}) 
  }
});

router.delete('/:id', async (req,res)=>{
  try{
    await prisma.cartReservation.delete({where:{id:req.params.id}});
    res.json({ok:true});
  }catch(e){ res.status(500).json({error:e.message}) }
});

router.post('/checkout', async (req,res)=>{
  try{
    const { sessionId, customer } = req.body;
    const cart = await prisma.cartReservation.findMany({
      where:{ sessionId, status:'reserved', expiresAt:{ gt:new Date() } }
    });
    if(!cart.length) return res.status(400).json({error:'السلة فارغة او انتهى الحجز'});

    const gross = cart.reduce((s,i)=> s + (i.price*i.quantity),0);
    const appFee10 = gross*0.10; 
    const tax15 = gross*0.15; 
    const net = gross - appFee10 - tax15;
    const orderNumber = 'QUF-'+Date.now();
    const supplierIds = [...new Set(cart.map(c=>c.supplierId))];

    const masterOrder = await prisma.masterOrder.create({
      data:{
        orderNumber, 
        customerName: customer.name, 
        customerPhone: customer.phone,
        customerAddress: customer.address||'', 
        customerLat:0, customerLng:0,
        gross, appFee10, tax15, net, totalAmount: gross, status:'pending',
        items:{ create: cart.map(c=>({ 
          productId:c.productId, name:c.productName, image:c.image, 
          quantity:c.quantity, receivedQuantity:0, price:c.price, 
          supplierId:c.supplierId, supplierName:c.supplierName 
        })) },
        subOrders:{ create: supplierIds.map(sId=>{ 
          const f=cart.find(x=>x.supplierId==sId); 
          return { supplierId:sId, supplierName:f.supplierName, status:'pending' } 
        }) }
      }, include:{items:true, subOrders:true}
    });

    for(let c of cart){
      await prisma.product.update({ where:{id:c.productId}, data:{ stock: { decrement: c.quantity } } });
      await prisma.cartReservation.update({ where:{id:c.id}, data:{ status:'confirmed' } });
    }
    res.json({ invoice: masterOrder, masterOrder });
  }catch(e){ console.log(e); res.status(500).json({error:e.message}) }
});

setInterval(async ()=>{
  try{
    await prisma.cartReservation.updateMany({
      where:{ status:'reserved', expiresAt:{ lt:new Date() } },
      data:{ status:'expired' }
    });
  }catch{}
}, 60*1000);

module.exports = router;
