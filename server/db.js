import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || 'fastlearn';

let client = null;
let db = null;

export async function getDb() {
  if (db) return db;
  try {
    client = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    });
    await client.connect();
    db = client.db(dbName);
    
    // Ensure indexes
    await db.collection('chats').createIndex({ userId: 1, language: 1, updatedAt: -1 });
    await db.collection('messages').createIndex({ chatId: 1, createdAt: 1 });
    await db.collection('words').createIndex({ userId: 1, language: 1 });
    await db.collection('transcription_cache').createIndex({ key: 1 }, { unique: true });
    
    console.log('[MongoDB] Connected & indexes verified on', dbName);
    return db;
  } catch (err) {
    console.error('[MongoDB] Connection error:', err.message);
    throw err;
  }
}

export { ObjectId };
