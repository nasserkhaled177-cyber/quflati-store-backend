const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ===== نضمن وجود جدول الوسوم حتى لو ما سويت migrate =====
(async ()=>{
  try{
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS Tag (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE,
        nameAr TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }catch(e){}
})();

// فاضي - انت تضيف والمورد يختار
// GET /api/categories -> يرجع الفئات فقط
router.get('/', async (req,res)=>{
  try{
    const cats = await prisma.category.findMany({orderBy:{createdAt:'desc'}}).catch(()=>[]);
    const out = cats.map(c=>({
      id: c.id,
      _id: c.id,
      name: c.name,
      nameAr: c.nameAr || c.name,
      title: c.nameAr || c.name,
      slug: c.slug,
      type: 'category'
    }));
    res.json(out); // فاضي لين تضيف انت
  }catch{ res.json([]) }
});

// GET /api/categories/tags -> يرجع الوسوم فقط
router.get('/tags', async (req,res)=>{
  try{
    let tags = [];
    try{ tags = await prisma.tag.findMany({orderBy:{createdAt:'desc'}}); } 
    catch{ 
      try{ tags = await prisma.$queryRawUnsafe(`SELECT * FROM Tag ORDER BY createdAt DESC`); }
      catch{ tags = [] }
    }
    const out = tags.map(t=>({
      id: t.id,
      _id: t.id,
      name: t.name,
      nameAr: t.nameAr || t.name,
      title: t.nameAr || t.name,
      type: 'tag'
    }));
    res.json(out);
  }catch{ res.json([]) }
});

// GET /api/categories/all -> يرجع الاثنين مع بعض للمورد
router.get('/all', async (req,res)=>{
  try{
    const cats = await prisma.category.findMany().catch(()=>[]);
    let tags = [];
    try{ tags = await prisma.tag.findMany(); }
    catch{ try{ tags = await prisma.$queryRawUnsafe(`SELECT * FROM Tag`); }catch{ tags=[] } }

    res.json({
      categories: cats.map(c=>({id:c.id, name:c.name, nameAr:c.nameAr||c.name})),
      tags: tags.map(t=>({id:t.id, name:t.name, nameAr:t.nameAr||t.name}))
    });
  }catch(e){ res.json({categories:[], tags:[]}) }
});

// POST /api/categories -> إضافة فئة
router.post('/', async (req,res)=>{
  try{
    const raw = (req.body.name || req.body.title || req.body.nameAr || '').trim();
    if(!raw) return res.status(400).json({error:'الاسم فاضي'});

    const id = 'cat_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
    const slug = raw.replace(/\s+/g,'-')+'-'+Date.now();

    let cat = null;
    try{ cat = await prisma.category.create({data:{id, name:raw, nameAr:raw, slug}}); }
    catch{
      try{ 
        await prisma.$executeRawUnsafe(`INSERT INTO Category (id, name, nameAr, slug, createdAt, updatedAt) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`, id, raw, raw, slug);
        cat = {id, name:raw, nameAr:raw, slug};
      }catch(e){ return res.status(500).json({error:e.message}) }
    }
    res.json({...cat, _id:cat.id, title:cat.nameAr||cat.name, type:'category'});
  }catch(e){ res.status(500).json({error:e.message}) }
});

// POST /api/categories/tags -> إضافة وسم
router.post('/tags', async (req,res)=>{
  try{
    const raw = (req.body.name || req.body.title || '').trim();
    if(!raw) return res.status(400).json({error:'الوسم فاضي'});
    const id = 'tag_'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
    
    let tag = null;
    try{ tag = await prisma.tag.create({data:{id, name:raw, nameAr:raw}}); }
    catch{
      try{
        await prisma.$executeRawUnsafe(`INSERT INTO Tag (id, name, nameAr) VALUES (?, ?, ?)`, id, raw, raw);
        tag = {id, name:raw, nameAr:raw};
      }catch(e){
        // لو Tag model مو موجود في schema - نحفظه كـ Category من نوع tag
        try{
          await prisma.$executeRawUnsafe(`INSERT INTO Category (id, name, nameAr, slug, createdAt, updatedAt) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`, id, raw, raw, 'tag-'+id);
          tag = {id, name:raw, nameAr:raw};
        }catch(err){ return res.status(500).json({error:err.message}) }
      }
    }
    res.json({...tag, _id:tag.id, title:tag.nameAr||tag.name, type:'tag'});
  }catch(e){ res.status(500).json({error:e.message}) }
});

// DELETE
router.delete('/:id', async (req,res)=>{
  try{ await prisma.category.delete({where:{id:req.params.id}}); res.json({ok:true}); }
  catch{ try{ await prisma.$executeRawUnsafe(`DELETE FROM Category WHERE id = ?`, req.params.id); res.json({ok:true}); }catch(e){ res.status(500).json({error:e.message}) } }
});

router.delete('/tags/:id', async (req,res)=>{
  try{ 
    try{ await prisma.tag.delete({where:{id:req.params.id}}); }
    catch{ await prisma.$executeRawUnsafe(`DELETE FROM Tag WHERE id = ?`, req.params.id); }
    res.json({ok:true}); 
  }catch(e){ res.status(500).json({error:e.message}) }
});

module.exports = router;
