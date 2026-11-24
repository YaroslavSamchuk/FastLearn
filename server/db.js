import { MongoClient } from 'mongodb';

let client;
let database;

export async function connectDatabase() {
  if (database) return database;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not configured');

  client = new MongoClient(uri);
  await client.connect();
  database = client.db(process.env.DB_NAME || 'fastlearn');

  await Promise.all([
    database.collection('users').createIndex({ googleSub: 1 }, { unique: true }),
    database.collection('sessions').createIndex({ tokenHash: 1 }, { unique: true }),
    database.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    database.collection('oauth_states').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    database.collection('workspaces').createIndex({ ownerId: 1 }, { unique: true }),
  ]);

  return database;
}

export function getDatabase() {
  if (!database) throw new Error('MongoDB is not connected');
  return database;
}

export async function closeDatabase() {
  if (client) await client.close();
  client = undefined;
  database = undefined;
}
