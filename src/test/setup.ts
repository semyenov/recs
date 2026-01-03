import './test-env'; // MUST be first to set env vars before any other imports
import { MongoMemoryServer } from 'mongodb-memory-server';

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
  } catch (error) {
    console.error('❌ Test setup failed:', error);
    throw error;
  }
}, 60000);

// Cleanup after all tests
afterAll(async () => {
  try {
    if (mongoServer) {
      await mongoServer.stop();
      console.log('✅ MongoDB Memory Server stopped');
    }
  } catch (error) {
    console.error('⚠️  Test cleanup error:', error);
  }
}, 60000);
