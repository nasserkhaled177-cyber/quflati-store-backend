require('dotenv').config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3003
// ✅ 1. لازم json و cors قبل أي راوتر
const allowedOrigins = [
  'https://quflati-admin-frontend.vercel.app',
  'https://quflaty-admin-frontend.vercel.app',
  'https://quflati-supplier-frontend.vercel.app',
  'https://quflati-supplier-portal.vercel.app',
  'https://quflati-store-frontend.vercel.app',
  'https://quflati-technician-frontend.vercel.app',
  'https://quflati-auth-frontend.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
];

const corsOptions = {
  origin: function(origin, callback){
    if(!origin) return callback(null, true);
    if(allowedOrigins.includes(origin)) return callback(null, true);
    console.log('⚠️ CORS - دومين جديد مو في القايمة:', origin);
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions)); // ✅ بدال '*' - لان '*' يكسر Express 5

app.use(express.json());

// ✅ سجل كل حركة - JSON - يطلع كل شي
app.use((req, res, next) => {
  console.log(JSON.stringify({
    time: new Date().toISOString(),
    method: req.method,
    url: req.url,
    origin: req.headers.origin || 'no-origin',
    ip: req.ip,
    headers: {
      contentType: req.headers['content-type'],
      authorization: req.headers.authorization ? 'Bearer ***' : 'no-token',
      userAgent: req.headers['user-agent'],
    },
    query: req.query,
    params: req.params,
    body: req.body || {},
  }, null, 2));
  next();
});

app.use("/uploads", express.static("uploads"));
const suppliersRouter = require('./routes/suppliers');
app.use('/api/suppliers', suppliersRouter);
// 2. ربط الـ auth - نفك الـ { router } لأن الملف يصدر أوبجكت
const { router: authRouter } = require("./routes/auth");
app.use("/auth", authRouter);
app.use("/api/auth", authRouter);

app.use('/api/dashboard', require('./routes/dashboard'));

// 3. ربط تلقائي - استثني auth و dashboard و auth-delete عشان ما يتربط مرتين - هذا كان الغلط الثاني
const routesPath = path.join(__dirname, "routes");
fs.readdirSync(routesPath).forEach(file => {
  if (file.endsWith('.js')) {
    const routeName = file.replace('.js','');
    if(routeName === 'auth' || routeName === 'dashboard' || routeName === 'auth-delete') return;
    try {
      app.use(`/api/${routeName}`, require(`./routes/${file}`));
      console.log(`✅ Route mounted: /api/${routeName}`);
    } catch(e){ console.log(`❌ failed ${file}:`, e.message) }
  }
});

app.get("/api", (req,res)=> res.json({ message: "Quflati Store API ✅ - auto routes", port: 3003 }));
app.get('/', async (req, res) => {
  try {
    const data = {
      message: "Quflati Store API ✅ - auto routes",
      port: 3003,
      time: new Date().toISOString(),
      counts: {
        products: await prisma.product.count(),
        orders: await prisma.order.count(),
        storeUsers: await prisma.storeUser.count(),
        suppliers: await prisma.supplier.count(),
        technicians: await prisma.technician.count(),
        categories: await prisma.category.count(),
        tags: await prisma.tag.count(),
        payouts: await prisma.payout.count(),
        masterOrders: await prisma.masterOrder.count(),
        masterOrderItems: await prisma.masterOrderItem.count(),
        subOrders: await prisma.subOrder.count(),
        cartReservations: await prisma.cartReservation.count(),
        supplierLedger: await prisma.supplierLedger.count(),
      },
      products: await prisma.product.findMany({ take: 100 }),
      orders: await prisma.order.findMany({ take: 100 }),
      storeUsers: await prisma.storeUser.findMany({ take: 100, select: { id: true, email: true, phone: true, name: true, city: true, country: true, countryCode: true, province: true, role: true, createdAt: true } }),
      suppliers: await prisma.supplier.findMany({ take: 100, select: { id: true, name: true, phone: true, city: true, country: true, countryCode: true, province: true, status: true, createdAt: true } }),
      technicians: await prisma.technician.findMany({ take: 100, select: { id: true, name: true, phone: true, specialty: true, city: true, country: true, countryCode: true, province: true, status: true, rating: true, createdAt: true } }),
      categories: await prisma.category.findMany({ take: 100 }),
      tags: await prisma.tag.findMany({ take: 100 }),
      payouts: await prisma.payout.findMany({ take: 100 }),
      masterOrders: await prisma.masterOrder.findMany({ take: 100, include: { items: true, subOrders: true } }),
      subOrders: await prisma.subOrder.findMany({ take: 100 }),
      cartReservations: await prisma.cartReservation.findMany({ take: 100 }),
      supplierLedger: await prisma.supplierLedger.findMany({ take: 100, orderBy: { createdAt: 'desc' } }),
    };
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
const PORT = process.env.PORT || 3003;
app.listen(PORT, () => console.log(`🚀 Backend on port ${PORT}`));
