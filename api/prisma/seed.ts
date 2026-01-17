// Seed script for development database
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001';

// Detect database type from Prisma datasource
// @ts-ignore - accessing internal prisma property
const dbProvider = prisma._engineConfig?.activeProvider || 'sqlite';
const isPostgres = dbProvider === 'postgresql';

// Helper to format arrays based on database type
const formatArray = (arr: any[]) => (isPostgres ? arr : JSON.stringify(arr));

// Sample products with ratings
const sampleProducts = [
  {
    name: 'Sony WH-1000XM5 Wireless Headphones',
    description:
      'Industry-leading noise canceling headphones with exceptional sound quality and 30-hour battery life.',
    retailer: 'Amazon',
    category: 'audio',
    brand: 'Sony',
    currentPrice: 348.0,
    imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=200',
    affiliateUrl: 'https://www.amazon.com/dp/B09XS7JWHH?tag=shopii-20',
    rating: {
      aiRating: 92,
      confidence: 0.95,
      sentimentScore: 0.85,
      reliabilityScore: 0.92,
      valueScore: 0.78,
      popularityScore: 0.95,
      sourcesAnalyzed: 847,
      pros: [
        'Best-in-class noise cancellation',
        'Exceptional sound quality',
        'All-day comfort',
        '30-hour battery life',
        'Multipoint connection',
      ],
      cons: [
        "Doesn't fold flat for storage",
        'Premium price point',
        'Touch controls can be finicky',
      ],
      summary:
        "Reddit's r/headphones community widely considers these the best overall wireless ANC headphones. YouTube reviewers praise the improved call quality over the XM4.",
    },
  },
  {
    name: 'Apple AirPods Max',
    description:
      'High-fidelity audio with Active Noise Cancellation, Transparency mode, and spatial audio.',
    retailer: 'Apple',
    category: 'audio',
    brand: 'Apple',
    currentPrice: 449.0,
    imageUrl: 'https://images.unsplash.com/photo-1625245488600-f03fef636a3c?w=200',
    affiliateUrl: 'https://www.apple.com/shop/product/MGYH3AM/A',
    rating: {
      aiRating: 88,
      confidence: 0.91,
      sentimentScore: 0.82,
      reliabilityScore: 0.88,
      valueScore: 0.65,
      popularityScore: 0.85,
      sourcesAnalyzed: 623,
      pros: [
        'Premium build quality',
        'Excellent sound reproduction',
        'Seamless Apple ecosystem integration',
        'Comfortable for extended use',
        'Great spatial audio',
      ],
      cons: [
        'Very expensive',
        'Heavy compared to competition',
        'Case design is controversial',
        'No power button',
      ],
      summary:
        "Apple fans on Reddit love these for the build quality and ecosystem benefits. Critics note the high price doesn't match the value proposition for non-Apple users.",
    },
  },
  {
    name: 'Bose QuietComfort Ultra Headphones',
    description:
      'World-class noise cancellation with immersive spatial audio and personalized sound.',
    retailer: 'Amazon',
    category: 'audio',
    brand: 'Bose',
    currentPrice: 379.0,
    imageUrl: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=200',
    affiliateUrl: 'https://www.amazon.com/dp/B0CCZ26B5V?tag=shopii-20',
    rating: {
      aiRating: 87,
      confidence: 0.89,
      sentimentScore: 0.8,
      reliabilityScore: 0.86,
      valueScore: 0.75,
      popularityScore: 0.82,
      sourcesAnalyzed: 412,
      pros: [
        'Legendary Bose comfort',
        'Excellent ANC',
        'Immersive spatial audio',
        'Good call quality',
        'Lightweight design',
      ],
      cons: [
        'Shorter battery life than Sony',
        'Pricey',
        'Plastic build feels less premium',
      ],
      summary:
        'Comfort-focused users on Reddit often prefer Bose. The new Ultra version gets praise for spatial audio but some say the QC45 was better value.',
    },
  },
  {
    name: 'MacBook Pro 14" M3 Pro',
    description:
      'Supercharged for pros with M3 Pro chip, stunning Liquid Retina XDR display, and all-day battery.',
    retailer: 'Apple',
    category: 'computing',
    brand: 'Apple',
    currentPrice: 1999.0,
    imageUrl: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=200',
    affiliateUrl: 'https://www.apple.com/shop/buy-mac/macbook-pro',
    rating: {
      aiRating: 94,
      confidence: 0.97,
      sentimentScore: 0.9,
      reliabilityScore: 0.95,
      valueScore: 0.72,
      popularityScore: 0.93,
      sourcesAnalyzed: 1203,
      pros: [
        'Incredible M3 Pro performance',
        'All-day battery life',
        'Best laptop display on the market',
        'Excellent build quality',
        'Great speakers and webcam',
      ],
      cons: [
        'Very expensive',
        'Limited to macOS',
        'Base model only 18GB RAM',
        'No touchscreen',
      ],
      summary:
        "r/macbook and tech YouTubers unanimously praise the M3 Pro's performance. Developers love the efficiency and battery. Price is the main criticism.",
    },
  },
  {
    name: 'Dell XPS 15 (2024)',
    description:
      '15.6" OLED display, 13th Gen Intel Core i7, premium aluminum build for creative professionals.',
    retailer: 'Dell',
    category: 'computing',
    brand: 'Dell',
    currentPrice: 1499.0,
    imageUrl: 'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=200',
    affiliateUrl: 'https://www.dell.com/xps-15?tag=shopii-20',
    rating: {
      aiRating: 85,
      confidence: 0.88,
      sentimentScore: 0.75,
      reliabilityScore: 0.82,
      valueScore: 0.78,
      popularityScore: 0.8,
      sourcesAnalyzed: 567,
      pros: [
        'Gorgeous OLED display option',
        'Premium aluminum design',
        'Compact form factor',
        'Strong performance',
        'Good value for specs',
      ],
      cons: [
        'Fan noise under load',
        'Webcam placement (chin cam)',
        'Coil whine on some units',
        'Dell support mixed reviews',
      ],
      summary:
        "Windows users on r/laptops often recommend this as the MacBook Pro alternative. Display is praised but thermal performance gets mixed feedback.",
    },
  },
  {
    name: 'Logitech MX Master 3S',
    description:
      'Advanced wireless mouse with 8K DPI sensor, quiet clicks, and MagSpeed electromagnetic scroll wheel.',
    retailer: 'Amazon',
    category: 'peripherals',
    brand: 'Logitech',
    currentPrice: 99.0,
    imageUrl: 'https://images.unsplash.com/photo-1527814050087-3793815479db?w=200',
    affiliateUrl: 'https://www.amazon.com/dp/B09HM94VDS?tag=shopii-20',
    rating: {
      aiRating: 91,
      confidence: 0.94,
      sentimentScore: 0.88,
      reliabilityScore: 0.91,
      valueScore: 0.85,
      popularityScore: 0.9,
      sourcesAnalyzed: 934,
      pros: [
        'Best-in-class ergonomics',
        'MagSpeed scroll is amazing',
        'Quiet clicks',
        'Multi-device switching',
        'USB-C charging',
      ],
      cons: [
        'Expensive for a mouse',
        'Not great for gaming',
        'Software can be bloated',
      ],
      summary:
        "Reddit's productivity communities swear by this mouse. The MagSpeed scroll wheel alone gets constant praise. Unanimous recommendation for office work.",
    },
  },
  {
    name: 'Keychron Q1 Pro Mechanical Keyboard',
    description:
      '75% wireless mechanical keyboard with hot-swappable switches, aluminum case, and QMK/VIA support.',
    retailer: 'Keychron',
    category: 'peripherals',
    brand: 'Keychron',
    currentPrice: 199.0,
    imageUrl: 'https://images.unsplash.com/photo-1595225476474-87563907a212?w=200',
    affiliateUrl: 'https://www.keychron.com/products/keychron-q1-pro?tag=shopii-20',
    rating: {
      aiRating: 89,
      confidence: 0.91,
      sentimentScore: 0.84,
      reliabilityScore: 0.87,
      valueScore: 0.88,
      popularityScore: 0.86,
      sourcesAnalyzed: 445,
      pros: [
        'Excellent build quality',
        'Hot-swappable switches',
        'QMK/VIA programmable',
        'Great stock typing experience',
        'Wireless with good battery',
      ],
      cons: [
        'Stock stabs could be better',
        'Heavy to carry around',
        'Keycap legends wear over time',
      ],
      summary:
        "r/MechanicalKeyboards consistently recommends this as the best value premium 75% keyboard. The gasket mount and wireless make it stand out.",
    },
  },
  {
    name: 'Samsung Odyssey G9 49" Curved Gaming Monitor',
    description:
      '49" 1000R curved display, 240Hz, 1ms response, QLED with HDR1000 for immersive gaming.',
    retailer: 'Samsung',
    category: 'monitors',
    brand: 'Samsung',
    currentPrice: 1099.0,
    imageUrl: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=200',
    affiliateUrl: 'https://www.samsung.com/us/computing/monitors/gaming/odyssey-g9?tag=shopii-20',
    rating: {
      aiRating: 86,
      confidence: 0.87,
      sentimentScore: 0.78,
      reliabilityScore: 0.75,
      valueScore: 0.7,
      popularityScore: 0.88,
      sourcesAnalyzed: 389,
      pros: [
        'Immersive ultrawide experience',
        '240Hz for competitive gaming',
        'Excellent colors',
        'Great productivity option',
        'Premium curve design',
      ],
      cons: [
        'Expensive',
        'Needs desk space',
        'Some game compatibility issues',
        'Power hungry',
      ],
      summary:
        "r/ultrawidemasterrace's favorite premium pick. Productivity users and sim racers love it. Some quality control concerns reported on older batches.",
    },
  },
];

async function main() {
  console.log('🌱 Seeding development database...\n');

  // Create dev user if not exists
  const existingUserById = await prisma.user.findUnique({
    where: { id: DEV_USER_ID },
  });

  const existingUserByEmail = await prisma.user.findUnique({
    where: { email: 'dev@shopii.test' },
  });

  if (!existingUserById && !existingUserByEmail) {
    await prisma.user.create({
      data: {
        id: DEV_USER_ID,
        email: 'dev@shopii.test',
        name: 'Dev User',
        plan: 'free',
        preferences: {
          create: {
            categories: formatArray(['electronics', 'audio', 'computing']) as any,
            budgetMin: 0,
            budgetMax: 2000,
            currency: 'USD',
            qualityPreference: 'mid-range',
            brandPreferences: formatArray([]) as any,
            brandExclusions: formatArray([]) as any,
          },
        },
      },
    });
    console.log('✅ Created dev user');
  } else if (existingUserByEmail && !existingUserById) {
    console.log('⚠️  Dev user already exists with email dev@shopii.test but different ID');
  } else {
    console.log('✅ Dev user already exists');
  }

  // Create sample products
  console.log('\n📦 Creating sample products...\n');

  for (const productData of sampleProducts) {
    const { rating, ...product } = productData;

    // Check if product exists
    const existing = await prisma.product.findFirst({
      where: { name: product.name },
    });

    if (existing) {
      console.log(`  ⏭️  Skipping "${product.name}" (already exists)`);
      continue;
    }

    const created = await prisma.product.create({
      data: {
        ...product,
        externalId: `sample-${product.name.toLowerCase().replace(/\s+/g, '-')}`,
        rating: {
          create: {
            ...rating,
            pros: formatArray(rating.pros) as any,
            cons: formatArray(rating.cons) as any,
          },
        },
      },
    });

    console.log(`  ✅ Created "${created.name}" (Rating: ${rating.aiRating}/100)`);
  }

  // Create a sponsored product
  const sponsorProduct = await prisma.product.findFirst({
    where: { category: 'audio' },
  });

  if (sponsorProduct) {
    const existingSponsored = await prisma.sponsoredProduct.findUnique({
      where: { productId: sponsorProduct.id },
    });

    if (!existingSponsored) {
      await prisma.sponsoredProduct.create({
        data: {
          productId: sponsorProduct.id,
          campaignName: 'Holiday Audio Sale',
          bidAmount: 0.25,
          dailyBudget: 100.0,
          targetingCategories: formatArray(['audio', 'electronics']) as any,
          isActive: true,
        },
      });
      console.log('\n✅ Created sponsored product campaign');
    }
  }

  // Seed cached products for "For You" page
  console.log('\n📦 Seeding cached products...');

  const cachedProductsData = [
    {
      name: 'Sony WH-1000XM5',
      brand: 'Sony',
      category: 'audio',
      description: 'Premium noise-canceling wireless headphones with industry-leading ANC',
      estimatedPrice: '$348',
      imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=200',
      retailer: 'Amazon',
      pros: ['Best-in-class noise cancellation', 'Exceptional sound quality', '30-hour battery life'],
      cons: ['Premium price', 'No folding design'],
      endorsementStrength: 'strong',
      endorsementQuotes: ['The best ANC headphones you can buy', 'Worth every penny'],
      sourceTypes: ['reddit', 'youtube', 'review'],
      qualityScore: 92,
    },
    {
      name: 'Apple AirPods Pro 2',
      brand: 'Apple',
      category: 'audio',
      description: 'True wireless earbuds with active noise cancellation and spatial audio',
      estimatedPrice: '$249',
      imageUrl: 'https://images.unsplash.com/photo-1606841837239-c5a1a4a07af7?w=200',
      retailer: 'Apple',
      pros: ['Seamless Apple integration', 'Great ANC', 'Spatial audio'],
      cons: ['Only works best with Apple devices', 'Expensive'],
      endorsementStrength: 'strong',
      endorsementQuotes: ['Best earbuds for iPhone users', 'Apple ecosystem magic'],
      sourceTypes: ['reddit', 'youtube'],
      qualityScore: 88,
    },
    {
      name: 'Framework Laptop 13',
      brand: 'Framework',
      category: 'computing',
      description: 'Modular, repairable laptop with upgradeable components',
      estimatedPrice: '$1,049',
      imageUrl: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=200',
      retailer: 'Framework',
      pros: ['Fully modular and repairable', 'Great build quality', 'Future-proof'],
      cons: ['Battery life could be better', 'Premium pricing'],
      endorsementStrength: 'strong',
      endorsementQuotes: ['The future of laptops', 'Right to repair champion'],
      sourceTypes: ['reddit', 'youtube', 'tech_blog'],
      qualityScore: 86,
    },
    {
      name: 'Anker PowerCore 20000mAh',
      brand: 'Anker',
      category: 'electronics',
      description: 'High-capacity portable power bank with fast charging',
      estimatedPrice: '$49.99',
      imageUrl: 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=200',
      retailer: 'Amazon',
      pros: ['Massive capacity', 'Fast charging', 'Reliable brand'],
      cons: ['Heavy', 'Slow to recharge itself'],
      endorsementStrength: 'moderate',
      endorsementQuotes: ['Best value power bank', 'Never runs out of juice'],
      sourceTypes: ['reddit', 'amazon'],
      qualityScore: 82,
    },
    {
      name: 'LG C3 OLED TV 55-inch',
      brand: 'LG',
      category: 'electronics',
      description: 'Premium OLED TV with perfect blacks and gaming features',
      estimatedPrice: '$1,399',
      imageUrl: 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=200',
      retailer: 'Best Buy',
      pros: ['Perfect black levels', 'Great for gaming', 'Beautiful picture'],
      cons: ['Risk of burn-in', 'Expensive'],
      endorsementStrength: 'strong',
      endorsementQuotes: ['Best TV for movies and gaming', 'OLED magic'],
      sourceTypes: ['reddit', 'youtube', 'rtings'],
      qualityScore: 90,
    },
  ];

  for (const product of cachedProductsData) {
    const normalizedKey = `${product.brand}-${product.name}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const existing = await prisma.cachedProduct.findUnique({
      where: { normalizedKey },
    });

    if (!existing) {
      await prisma.cachedProduct.create({
        data: {
          normalizedKey,
          name: product.name,
          brand: product.brand,
          category: product.category,
          description: product.description,
          estimatedPrice: product.estimatedPrice,
          imageUrl: product.imageUrl,
          retailer: product.retailer,
          pros: formatArray(product.pros) as any,
          cons: formatArray(product.cons) as any,
          endorsementStrength: product.endorsementStrength,
          endorsementQuotes: formatArray(product.endorsementQuotes) as any,
          sourceTypes: formatArray(product.sourceTypes) as any,
          sourcesCount: product.sourceTypes.length,
          qualityScore: product.qualityScore,
          searchesFoundIn: 1,
        },
      });
      console.log(`  ✅ Cached "${product.name}"`);
    } else {
      console.log(`  ⏭️  Skipping "${product.name}" (already cached)`);
    }
  }

  console.log('\n🎉 Seeding complete!\n');
  console.log('You can now run: npm run dev\n');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
