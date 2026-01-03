#!/usr/bin/env ts-node

/**
 * Seed Database with Sample Data
 *
 * This script generates realistic sample data for testing the recommendation engine:
 * - 500 products across 5 categories
 * - 2000 orders from 200 users
 * - Realistic product attributes and purchase patterns
 */

/* eslint-disable no-console */
import './src/test/test-env'; // Load environment
import { mongoClient } from '../src/storage/mongo';
import { Product, Order } from '../src/types';

const CATEGORIES = ['Electronics', 'Clothing', 'Books', 'Home & Garden', 'Sports'];

const PRODUCT_NAMES = {
  Electronics: [
    'Laptop',
    'Smartphone',
    'Tablet',
    'Headphones',
    'Camera',
    'Monitor',
    'Keyboard',
    'Mouse',
  ],
  Clothing: ['T-Shirt', 'Jeans', 'Jacket', 'Sneakers', 'Dress', 'Sweater', 'Hoodie', 'Shorts'],
  Books: ['Novel', 'Cookbook', 'Biography', 'Textbook', 'Comic', 'Magazine', 'Guide', 'Dictionary'],
  'Home & Garden': ['Lamp', 'Vase', 'Pillow', 'Plant', 'Tool Set', 'Furniture', 'Rug', 'Clock'],
  Sports: [
    'Basketball',
    'Yoga Mat',
    'Dumbbells',
    'Bicycle',
    'Tennis Racket',
    'Running Shoes',
    'Protein Powder',
    'Water Bottle',
  ],
};

// Generate random number in range
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomChoice<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

// Generate products
function generateProducts(count: number): Product[] {
  const products: Product[] = [];

  for (let i = 1; i <= count; i++) {
    const category = randomChoice(CATEGORIES);
    const baseName = randomChoice(PRODUCT_NAMES[category as keyof typeof PRODUCT_NAMES]);
    const variant = randomChoice(['Pro', 'Plus', 'Lite', 'Max', 'Mini', 'Standard']);

    products.push({
      _id: `${i}`,
      productId: `P${String(i).padStart(4, '0')}`,
      name: `${baseName} ${variant}`,
      category,
      technicalProperties: {
        size: randomFloat(1, 100),
        price: randomFloat(9.99, 999.99),
        weight: randomFloat(0.1, 50),
        color: randomChoice(['Black', 'White', 'Silver', 'Blue', 'Red']),
        brand: randomChoice(['BrandA', 'BrandB', 'BrandC', 'BrandD']),
        rating: randomFloat(3, 5),
      },
      createdAt: new Date(Date.now() - randomInt(0, 365) * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    });
  }

  return products;
}

// Generate orders with realistic patterns
function generateOrders(products: Product[], orderCount: number, userCount: number): Order[] {
  const orders: Order[] = [];

  // Create user preferences (some users prefer certain categories)
  const userPreferences = new Map<string, string>();
  for (let i = 1; i <= userCount; i++) {
    userPreferences.set(`U${String(i).padStart(4, '0')}`, randomChoice(CATEGORIES));
  }

  for (let i = 1; i <= orderCount; i++) {
    const userId = `U${String(randomInt(1, userCount)).padStart(4, '0')}`;
    const preferredCategory = userPreferences.get(userId);

    // Number of items in order (1-5)
    const itemCount = randomInt(1, 5);
    const orderProducts: Product[] = [];

    for (let j = 0; j < itemCount; j++) {
      // 70% chance to pick from preferred category
      let candidateProducts = products;
      if (preferredCategory && Math.random() < 0.7) {
        candidateProducts = products.filter((p) => p.category === preferredCategory);
      }

      const product = randomChoice(candidateProducts);
      orderProducts.push(product);
    }

    // Remove duplicates
    const uniqueProducts = Array.from(new Set(orderProducts.map((p) => p.productId))).map(
      (id) => orderProducts.find((p) => p.productId === id)!
    );

    const items = uniqueProducts.map((p) => ({
      productId: p.productId,
      quantity: randomInt(1, 3),
      price: (p.technicalProperties.price as number) || 0,
    }));

    const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    orders.push({
      _id: `${i}`,
      orderId: `O${String(i).padStart(5, '0')}`,
      userId,
      items,
      totalAmount,
      orderDate: new Date(Date.now() - randomInt(0, 180) * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
    });
  }

  return orders;
}

// Main seeding function
async function seedDatabase(): Promise<void> {
  console.log('🌱 Starting database seeding...\n');

  try {
    // Connect to MongoDB
    await mongoClient.connect();
    const db = mongoClient.getDb();

    // Clear existing data
    console.log('🗑️  Clearing existing data...');
    await db.collection('products').deleteMany({});
    await db.collection('orders').deleteMany({});
    await db.collection('recommendations').deleteMany({});

    // Generate and insert products
    console.log('📦 Generating 500 products...');
    const products = generateProducts(500);
    // Remove _id field - MongoDB will auto-generate ObjectId
    const productsToInsert = products.map(({ _id, ...product }) => product);
    await db.collection('products').insertMany(productsToInsert);
    console.log(`✅ Inserted ${products.length} products`);

    // Generate and insert orders
    console.log('🛒 Generating 2000 orders from 200 users...');
    const orders = generateOrders(products, 2000, 200);
    // Remove _id field - MongoDB will auto-generate ObjectId
    const ordersToInsert = orders.map(({ _id, ...order }) => order);
    await db.collection('orders').insertMany(ordersToInsert);
    console.log(`✅ Inserted ${orders.length} orders`);

    // Print statistics
    console.log('\n📊 Database Statistics:');
    console.log(`   Products: ${products.length}`);
    console.log(`   Categories: ${CATEGORIES.join(', ')}`);
    console.log(`   Orders: ${orders.length}`);
    console.log(`   Unique Users: 200`);
    console.log(
      `   Avg Items per Order: ${(orders.reduce((sum, o) => sum + o.items.length, 0) / orders.length).toFixed(2)}`
    );
    console.log(
      `   Total Revenue: $${orders.reduce((sum, o) => sum + o.totalAmount, 0).toFixed(2)}`
    );

    // Category distribution
    console.log('\n📈 Products by Category:');
    CATEGORIES.forEach((cat) => {
      const count = products.filter((p) => p.category === cat).length;
      console.log(`   ${cat}: ${count} products`);
    });

    console.log('\n✅ Database seeding completed successfully!');
    console.log('\n🚀 Next steps:');
    console.log('   1. Start the API: npm run dev');
    console.log('   2. Start the worker: npm run worker');
    console.log(
      '   3. Trigger batch job: curl -X POST http://localhost:3000/debug/v1/trigger-batch'
    );
    console.log(
      '   4. Check recommendations: curl -H "x-api-key: admin-key-123" http://localhost:3000/v1/products/P0001/similar'
    );
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await mongoClient.disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  seedDatabase().catch(console.error);
}

export { seedDatabase, generateProducts, generateOrders };
