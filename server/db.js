import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || 'fastlearn';

let client = null;
let db = null;

export async function getDb() {
  if (db && client) {
    try {
      // Fast ping check to verify socket is still alive after system sleep
      await client.db('admin').command({ ping: 1 });
      return db;
    } catch (e) {
      console.warn('[MongoDB] Connection lost or stale after sleep, reconnecting...');
      try {
        await client.close();
      } catch (err) {}
      client = null;
      db = null;
    }
  }

  try {
    client = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
    });

    client.on('error', (err) => {
      console.warn('[MongoDB Client Event Error]', err.message);
    });

    client.on('close', () => {
      console.warn('[MongoDB Client Closed]');
      client = null;
      db = null;
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
    client = null;
    db = null;
    throw err;
  }
}

export { ObjectId };
