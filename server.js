require('dotenv').config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const app = express();
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
async function safeCount(model){
  try{
    if(!model || typeof model.count !== "function") return 0
    return await model.count()
  }catch{ return 0 }
}

app.get('/', async (req, res) => {
  // STORE_ROOT_FINAL - مضمون على schema.prisma الحقيقي
  try {
    const products = await prisma.product.count().catch(()=>0)
    const orders = await prisma.order.count().catch(()=>0)
    const storeUsers = await prisma.storeUser.count().catch(()=>0)
    const suppliers = await prisma.supplier.count().catch(()=>0)
    const categories = await prisma.category.count().catch(()=>0)
    const tags = await prisma.tag.count().catch(()=>0)
    const payouts = await prisma.payout.count().catch(()=>0)
    const sampleProducts = await prisma.product.findMany({ take: 3, select: { id:true, name:true, price:true } }).catch(()=>[])
    return res.json({ ok:true, service:'quflati-store-backend', message:'Store backend شغال ✅', time:new Date().toISOString(), counts:{ products, orders, storeUsers, suppliers, categories, tags, payouts }, sampleProducts })
  } catch(e){
    return res.json({ ok:true, service:'quflati-store-backend', message:'Store backend شغال ✅', time:new Date().toISOString(), counts:{}, warning:e.message })
  }
})