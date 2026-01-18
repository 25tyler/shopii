// Script to update all cached products with AI-generated estimated prices
// Force reload environment variables BEFORE importing anything else
import { config } from 'dotenv';
config({ override: true }); // Override any cached env vars

import { PrismaClient } from '@prisma/client';
import { estimateProductPrice } from './src/services/product-extraction.service.js';

const prisma = new PrismaClient();

async function updatePrices() {
  console.log('Fetching all cached products...');
  const products = await prisma.cachedProduct.findMany();
  console.log(`Found ${products.length} cached products`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const product of products) {
    try {
      console.log(`\n[${updated + skipped + failed + 1}/${products.length}] ${product.name}`);

      // Use AI to generate a specific price estimate
      const estimatedPrice = await estimateProductPrice(
        product.name,
        product.brand || '',
        product.category || 'General',
        product.description || ''
      );

      // Update the product with AI-estimated price
      await prisma.cachedProduct.update({
        where: { id: product.id },
        data: { estimatedPrice },
      });

      console.log(`  ✓ Price: ${estimatedPrice} (AI-generated)`);
      updated++;

      // Add small delay to avoid rate limiting OpenAI API
      await new Promise(resolve => setTimeout(resolve, 50));
    } catch (error: any) {
      console.error(`  ✗ Failed: ${error.message}`);
      failed++;
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Done! Updated ${updated} products, skipped ${skipped}, failed ${failed}`);
  await prisma.$disconnect();
}

updatePrices();
