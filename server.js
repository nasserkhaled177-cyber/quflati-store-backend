require('dotenv').config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use("/uploads", express.static("uploads"));
//app.use(express.static(path.join(__dirname, "public")));
app.use('/api/dashboard', require('./routes/dashboard'));
// ✅ ربط تلقائي - اي ملف تحطه في routes ينشبك لحاله
// يعني لو اضفت suppliers.js, brands.js, coupons.js ما تحتاج ترجع هنا
const routesPath = path.join(__dirname, "routes");
fs.readdirSync(routesPath).forEach(file => {
  if (file.endsWith('.js')) {
    const routeName = file.replace('.js','');
    try {
      app.use(`/api/${routeName}`, require(`./routes/${file}`));
      console.log(`✅ Route mounted: /api/${routeName}`);
    } catch(e){ console.log(`❌ failed ${file}:`, e.message) }
  }
});

app.get("/api", (req,res)=> res.json({ message: "Quflati Store API ✅ - auto routes", port: 3003 }));
// واجهة المتجر - لازم يكون اخر شي
//app.get("*", (req,res)=>{
  //res.sendFile(path.join(__dirname, "public", "index.html"), (err)=>{
    //if(err) res.json({ message: "Quflati Store API ✅", port: 3003 });
  //});
//});

const PORT = process.env.PORT || 3003;
app.get("/", (req,res)=> res.json({ message: "Quflati Store API ✅ - auto routes", port: 3003 }));

app.listen(PORT, () => console.log(`🚀 Backend on port ${PORT}`));
