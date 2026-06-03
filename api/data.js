import { kv } from '@vercel/kv';
import fs from 'fs';
import path from 'path';

let inMemoryData = null;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const key = 'stackcode_performance_data';
  const hasKV = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN;

  if (req.method === 'GET') {
    try {
      if (hasKV) {
        const data = await kv.get(key);
        return res.status(200).json(data || {});
      } else {
        const localPath = path.join(process.cwd(), 'data.json');
        let fileData = {};
        if (fs.existsSync(localPath)) {
          const raw = fs.readFileSync(localPath, 'utf8');
          fileData = JSON.parse(raw);
        } else if (inMemoryData) {
          fileData = inMemoryData;
        }
        
        // Return a database warning in the response if KV is not linked in Vercel production
        return res.status(200).json({
          ...fileData,
          _dbWarning: process.env.VERCEL ? 'Vercel KV is not connected. Data will not persist between page refreshes in production.' : null
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

      if (hasKV) {
        await kv.set(key, body);
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
          warning: process.env.VERCEL ? 'Vercel KV is not connected. Data is stored in memory and will be lost on cold starts.' : null 
        });
      }
    } catch (error) {
      console.error('Save error:', error);
      return res.status(500).json({ error: 'Database save error: ' + error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
