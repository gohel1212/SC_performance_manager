import { createClient } from '@vercel/kv';
import Redis from 'ioredis';
import fs from 'fs';
import path from 'path';

let inMemoryData = null;

let dbType = null; // 'kv' or 'redis' or null
let kvClient = null;
let redisClient = null;

const hasREST = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
const hasTCP = !!process.env.REDIS_URL;

if (hasREST) {
  try {
    kvClient = createClient({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN
    });
    dbType = 'kv';
    console.log('Using Vercel KV REST client');
  } catch (e) {
    console.error('Failed to create KV client:', e);
  }
} else if (hasTCP) {
  try {
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      connectTimeout: 5000,
      enableOfflineQueue: false
    });
    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err.message);
    });
    dbType = 'redis';
    console.log('Using ioredis TCP client');
  } catch (e) {
    console.error('Failed to create Redis client:', e);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const key = 'stackcode_performance_data';

  if (req.method === 'GET') {
    // Debug endpoint to safely check environment variables keys and connection status
    if (req.url && req.url.includes('debug=1')) {
      const keys = Object.keys(process.env).filter(k => 
        k.startsWith('KV') || k.startsWith('REDIS') || k.startsWith('UPSTASH')
      );
      return res.status(200).json({ 
        envKeys: keys, 
        dbType,
        hasREST,
        hasTCP,
        redisStatus: redisClient ? redisClient.status : 'not_initialized'
      });
    }

    try {
      if (dbType === 'kv' && kvClient) {
        const data = await kvClient.get(key);
        return res.status(200).json(data || {});
      } else if (dbType === 'redis' && redisClient) {
        const raw = await redisClient.get(key);
        let data = {};
        if (raw) {
          try {
            data = JSON.parse(raw);
          } catch (e) {
            console.error('Failed to parse JSON from Redis:', e);
          }
        }
        return res.status(200).json(data);
      } else {
        const localPath = path.join(process.cwd(), 'data.json');
        let fileData = {};
        if (fs.existsSync(localPath)) {
          const raw = fs.readFileSync(localPath, 'utf8');
          fileData = JSON.parse(raw);
        } else if (inMemoryData) {
          fileData = inMemoryData;
        }
        
        return res.status(200).json({
          ...fileData,
          _dbWarning: process.env.VERCEL ? 'Vercel KV or Upstash Redis database is not connected. Data will not persist.' : null
        });
      }
    } catch (error) {
      console.error('Fetch error:', error);
      return res.status(500).json({ error: 'Database get error: ' + error.message });
    }
  }

  if (req.method === 'POST') {
    try {
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (e) {
          return res.status(400).json({ error: 'Invalid JSON body string' });
        }
      }

      if (dbType === 'kv' && kvClient) {
        await kvClient.set(key, body);
        return res.status(200).json({ success: true });
      } else if (dbType === 'redis' && redisClient) {
        await redisClient.set(key, JSON.stringify(body));
        return res.status(200).json({ success: true });
      } else {
        inMemoryData = body;
        try {
          const localPath = path.join(process.cwd(), 'data.json');
          fs.writeFileSync(localPath, JSON.stringify(body, null, 2), 'utf8');
        } catch (e) {
          console.warn('Could not write to local file, using in-memory store:', e.message);
        }
        return res.status(200).json({ 
          success: true, 
          warning: process.env.VERCEL ? 'Vercel KV or Upstash Redis is not connected. Data will be lost on cold starts.' : null 
        });
      }
    } catch (error) {
      console.error('Save error:', error);
      return res.status(500).json({ error: 'Database save error: ' + error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
