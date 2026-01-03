// MongoDB initialization script
db = db.getSiblingDB('recommendations');

// Create application user
db.createUser({
  user: 'rec_service',
  pwd: 'rec_password',
  roles: [
    {
      role: 'readWrite',
      db: 'recommendations'
    }
  ]
});

print('✅ MongoDB initialized with user: rec_service');

