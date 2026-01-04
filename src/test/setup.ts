import './test-env'; // MUST be first to set env vars before any other imports
import { MongoMemoryServer } from 'mongodb-memory-server';

// Mock ioredis with ioredis-mock for all tests
// This replaces the real Redis client with an in-memory mock
jest.mock('ioredis', () => {
  return require('ioredis-mock');
});

let mongoServer: MongoMemoryServer;

// Setup before all tests
beforeAll(async () => {
  try {
    // Start in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    // Update the environment variable
    process.env.MONGODB_URI = mongoUri;

    console.log('✅ MongoDB Memory Server started:', mongoUri);

    // Get the Redis client (now using ioredis-mock) and connect it
    const { redisClient } = require('../storage/redis');
    await redisClient.connect();
    console.log('✅ Mock Redis (ioredis-mock) connected for tests');
  } catch (error) {
    console.error('❌ Test setup failed:', error);
    throw error;
  }
}, 60000);

// Cleanup after all tests
afterAll(async () => {
  try {
    // Disconnect mock Redis
    try {
      const { redisClient } = require('../storage/redis');
      await redisClient.disconnect();
      console.log('✅ Mock Redis disconnected');
    } catch (error) {
      console.warn('⚠️  Mock Redis disconnect error:', error);
    }

    // Stop MongoDB
    if (mongoServer) {
      await mongoServer.stop();
      console.log('✅ MongoDB Memory Server stopped');
    }
  } catch (error) {
    console.error('⚠️  Test cleanup error:', error);
  }
}, 60000);

// Clear Redis data before each test for isolation
beforeEach(async () => {
  const { redisClient } = require('../storage/redis');
  if (redisClient && redisClient.isConnected()) {
    // Clear all keys using FLUSHDB
    const client = redisClient.getClient();
    await client.flushdb();
  }
});
