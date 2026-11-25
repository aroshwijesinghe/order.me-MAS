import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { Factory } from './engine.js';
const factory = new Factory();
const clients = new Set();
function broadcast() { for (const client of clients) client.write(`data: ${JSON.stringify(factory.state())}\n\n`); }
setInterval(() => { if (factory.running) { factory.step(); broadcast(); } }, 1200);
const assets = { '/':['index.html','text/html'], '/app.js':['app.js','text/javascript'], '/routing.js':['routing.js','text/javascript'], '/roads.js':['roads.js','text/javascript'], '/style.css':['style.css','text/css'], '/assets/network-atlas.png':['assets/network-atlas.png','image/png'], '/assets/customer-visitor.png':['assets/customer-visitor.png','image/png'] };
const server = http.createServer(async (req,res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (req.method === 'GET' && pathname === '/events') {
    res.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
    clients.add(res);
    res.write(`data: ${JSON.stringify(factory.state())}\n\n`);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (req.method === 'GET' && pathname === '/api/state') {
    res.writeHead(200, {'Content-Type':'application/json'}); res.end(JSON.stringify(factory.state())); return;
  }
  if (req.method === 'POST' && pathname === '/api/action') {
    try {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 10000) throw new Error('Request too large'); }
      const action = JSON.parse(body);
      switch (action.type) {
        case 'scenario': factory.scenario(action.name); break;
        case 'reset': factory.reset(); break;
        case 'step': factory.step(); break;
        case 'play': factory.running = !factory.running; break;
        case 'station': factory.toggleStation(action.id); break;
        case 'truck': factory.toggleTruck(action.id); break;
        case 'workers': factory.setWorkers(action.count); break;
        case 'restock': factory.restock(action.quantity); break;
        case 'road': factory.toggleRoad(); break;
        case 'visit': factory.queueCustomer(action.order); break;
        case 'order': factory.addOrder(action.order); break;
        default: throw new Error('Unknown action');
      }
      broadcast(); res.writeHead(200, {'Content-Type':'application/json'}); res.end(JSON.stringify(factory.state()));
    } catch(error) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:error.message})); }
    return;
  }
  const asset = assets[pathname];
  if (req.method === 'GET' && asset) {
    try { res.writeHead(200, {'Content-Type':asset[1]}); res.end(await readFile(new URL(`../frontend/${asset[0]}`, import.meta.url))); }
    catch { res.end('Asset unavailable'); }
    return;
  }
  res.writeHead(404); res.end('Not found');
});
const port = Number(process.env.PORT || 3000);
server.listen(port, '127.0.0.1', () => console.log(`Order.me running at http://localhost:${port}`));
