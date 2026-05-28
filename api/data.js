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
        if (fs.existsSync(localPath)) {
          const raw = fs.readFileSync(localPath, 'utf8');
          return res.status(200).json(JSON.parse(raw));
        }
        return res.status(200).json(inMemoryData || {});
      }
    } catch (error) {
      console.error('Fetch error:', error);
      return res.status(200).json(inMemoryData || {});
    }
  }

  if (req.method === 'POST') {
    try {
      const body = req.body;
      if (hasKV) {
        await kv.set(key, body);
      } else {
        inMemoryData = body;
        try {
          const localPath = path.join(process.cwd(), 'data.json');
          fs.writeFileSync(localPath, JSON.stringify(body, null, 2), 'utf8');
        } catch (e) {
          console.warn('Could not write to local file, using in-memory store:', e.message);
        }
      }
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Save error:', error);
      return res.status(500).json({ error: 'Failed to save data' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
