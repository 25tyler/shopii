import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function clearPrices() {
  const result = await prisma.cachedProduct.updateMany({
    data: { estimatedPrice: null }
  });
  console.log('Cleared estimated prices for', result.count, 'products');
  await prisma.$disconnect();
}

clearPrices();
