require('dotenv').config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const app = express();

// 1. لازم json و cors قبل أي راوتر - هذا كان الغلط الأول
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use("/uploads", express.static("uploads"));

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
app.get("/", (req,res)=> res.json({ message: "Quflati Store API ✅ - auto routes", port: 3003 }));

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => console.log(`🚀 Backend on port ${PORT}`));
