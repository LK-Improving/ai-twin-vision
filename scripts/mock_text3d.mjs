/**
 * 本地 mock 第三方「文生 3D」服务，仅用于验证 L3 适配器链路。
 * - POST /generate：记录请求体，返回一个最小合法 GLB 二进制
 * - GET  /health ：探活
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 4599;
// 请求捕获写到脚本目录下的 .tmp（已 gitignore），不再使用仓库根与绝对路径
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REQ_LOG = path.join(HERE, '.tmp', 'mock-request.json');
fs.mkdirSync(path.dirname(REQ_LOG), { recursive: true });

function makeGlb() {
  const json = JSON.stringify({
    asset: { version: '2.0', generator: 'mock-text3d' },
    scene: 0,
    scenes: [{}],
    nodes: [],
  });
  const jsonBuf = Buffer.from(json, 'utf8');
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  const jsonChunk = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);
  const binBuf = Buffer.alloc(4, 0);

  const header = Buffer.alloc(12);
  const total = 12 + 8 + jsonChunk.length + 8 + binBuf.length;
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);

  const jsonHead = Buffer.alloc(8);
  jsonHead.writeUInt32LE(jsonChunk.length, 0);
  jsonHead.write('JSON', 4, 'ascii');

  const binHead = Buffer.alloc(8);
  binHead.writeUInt32LE(binBuf.length, 0);
  binHead.write('BIN\0', 4, 'ascii');

  return Buffer.concat([header, jsonHead, jsonChunk, binHead, binBuf]);
}

const GLB = makeGlb();
console.log(`[mock] glb bytes=${GLB.length}`);

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, glbBytes: GLB.length }));
    return;
  }
  if (req.method === 'POST' && req.url === '/generate') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      fs.writeFileSync(
        REQ_LOG,
        JSON.stringify(
          {
            authorization: req.headers.authorization ?? null,
            contentType: req.headers['content-type'] ?? null,
            body: JSON.parse(body || '{}'),
          },
          null,
          2,
        ),
      );
      console.log(`[mock] /generate 收到请求，响应 ${GLB.length} 字节 GLB`);
      res.writeHead(200, { 'Content-Type': 'model/gltf-binary' });
      res.end(GLB);
    });
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, '127.0.0.1', () => console.log(`[mock] listening http://127.0.0.1:${PORT}`));
