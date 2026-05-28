import http from 'http';
import fs from 'fs';
import path from 'path';
import handler from './api/data.js';

const PORT = 3000;

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // Route: /api/data
  if (pathname === '/api/data') {
    const vercelReq = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: null
    };

    if (req.method === 'POST') {
      const buffers = [];
      for await (const chunk of req) {
        buffers.push(chunk);
      }
      const rawBody = Buffer.concat(buffers).toString();
      try {
        vercelReq.body = JSON.parse(rawBody);
      } catch (e) {
        vercelReq.body = {};
      }
    }

    const vercelRes = {
      statusCode: 200,
      headers: {},
      setHeader(name, value) {
        this.headers[name] = value;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        res.writeHead(this.statusCode, {
          'Content-Type': 'application/json',
          ...this.headers
        });
        res.end(JSON.stringify(data));
      },
      end(data) {
        res.writeHead(this.statusCode, this.headers);
        res.end(data);
      }
    };

    try {
      await handler(vercelReq, vercelRes);
    } catch (err) {
      console.error(err);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
    return;
  }

  // Static files serving
  let filePath = pathname === '/' ? './index.html' : `.${pathname}`;
  filePath = path.resolve(filePath);

  if (!filePath.startsWith(process.cwd())) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    let contentType = 'text/html';
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.css') contentType = 'text/css';
    else if (ext === '.js') contentType = 'application/javascript';
    else if (ext === '.json') contentType = 'application/json';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.jpg') contentType = 'image/jpeg';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
