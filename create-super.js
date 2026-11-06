const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
(async()=>{
  const prisma = new PrismaClient();
  const hashed = await bcrypt.hash('Admin@123', 10);
  const user = await prisma.storeUser.upsert({
    where:{email:'super@quflati.sa'},
    update:{ password:hashed, role:'SUPER_ADMIN' },
    create:{ email:'super@quflati.sa', password:hashed, role:'SUPER_ADMIN', name:'Super Admin' }
  });
  console.log('✅ SUPER_ADMIN:', user.email, 'role:', user.role);
  await prisma.$disconnect();
})();
