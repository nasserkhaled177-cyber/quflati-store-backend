const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

router.get('/:supplierId', async (req, res) => {
  try {
    const { supplierId } = req.params;
    const allProducts = await prisma.product.findMany({ where: { supplierId } }).catch(() => []);
    const activeProducts = allProducts.filter(p => !p.isDeleted && !p.isPermanent);
    const deletedProducts = allProducts.filter(p => p.isDeleted && !p.isPermanent);
    const permanentProducts = allProducts.filter(p => p.isPermanent);
    const ledger = await prisma.supplierLedger.findMany({ where: { supplierId }, orderBy: { createdAt: 'asc' } }).catch(() => []);
    
    const stockLogs = ledger.map(l => {
      let installationFee = 0;
      let hasInstallation = false;
      if (l.description && l.description.includes('تركيب')) {
        const match = l.description.match(/تركيب\s*(\d+)/);
        if (match) { installationFee = Number(match[1]); hasInstallation = true; }
      }
      return {
        productId: l.productId, productName: l.productName,
        type: l.action === 'ADD_PRODUCT' ? 'اضافة' : l.action === 'SUPPLY' ? 'توريد' : l.action === 'EXPORT' ? 'تصدير' : l.action === 'SALE' ? 'تم البيع' : l.action === 'SALE_WITH_INSTALL' ? 'بيع + تركيب' : l.action === 'OFFER' ? 'عرض خاص' : l.action === 'PRICE_UPDATE' ? 'تعديل السعر' : l.action === 'DELETE_PRODUCT' ? 'محذوف' : l.action === 'DELETE_PERMANENT' ? 'محذوف نهائي' : l.action === 'RESTORE_PRODUCT' ? 'مسترجع' : l.action,
        qtyBefore: l.qtyBefore || 0, qtyAfter: l.qtyAfter || 0, delta: l.delta || 0, createdAt: l.createdAt, reason: l.description,
        installationFee, hasInstallation, installationNote: hasInstallation ? `ملاحظة: تركيب ${installationFee} ريال` : ''
      };
    });

    const allTimeline = stockLogs;
    const addedProducts = allProducts.map(p => ({ ...p, stock: p.stock || 0 }));
    const totalStockAll = activeProducts.reduce((sum, p) => sum + (p.stock || 0), 0);
    const totalInstallationFees = stockLogs.filter(l => l.hasInstallation).reduce((sum, l) => sum + l.installationFee, 0);

    const realOrders = await prisma.order.findMany({ where: { supplierId }, orderBy: { createdAt: 'desc' } }).catch(() => []);
    const pendingOrders = realOrders.filter(o => o.status === 'PENDING' || o.status === 'قيد الطلب' || !o.status || o.status === '');
    const completedOrders = realOrders.filter(o => o.status === 'COMPLETED' || o.status === 'مكتمل' || o.status === 'تم البيع');

    const counts = {
      added: activeProducts.length,
      trash: deletedProducts.length,
      stock: totalStockAll,
      sold: completedOrders.length || ledger.filter(l => l.action === 'SALE' || l.action === 'SALE_WITH_INSTALL').length,
      pending: pendingOrders.length,
      offers: allProducts.filter(p => p.isOffer).length,
      all: ledger.length,
      total: allProducts.length,
      active: activeProducts.length,
      deleted: deletedProducts.length
    };

    const totals = {
      totalVat: 0, totalCommission: 0, totalNet: 0,
      totalStock: totalStockAll, totalInstallation: totalInstallationFees,
      pendingSales: pendingOrders.reduce((s, o) => s + (o.totalPrice || 0), 0),
      totalSales: completedOrders.reduce((s, o) => s + (o.totalPrice || 0), 0)
    };

    res.json({ counts, addedProducts, deletedProducts: [...deletedProducts, ...permanentProducts], pendingOrders, completedOrders, offers: allProducts.filter(p => p.isOffer), ledger, stockLogs, allTimeline, totals });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.post('/sale-with-install', async (req, res) => {
  try {
    const { productId, supplierId, qty, installationFee } = req.body;
    const product = await prisma.product.findUnique({ where: { id: productId } });
    const oldStock = product.stock; const newStock = oldStock - qty;
    await prisma.supplierLedger.create({ data: { supplierId, productId, productName: product.name, action: 'SALE_WITH_INSTALL', type: 'بيع + تركيب', qtyBefore: oldStock, qtyAfter: newStock, delta: -qty, description: `تم البيع ${qty} + تركيب ${installationFee} ريال - ملاحظة: حق التركيب ${installationFee}` } });
    await prisma.product.update({ where: { id: productId }, data: { stock: newStock } });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
