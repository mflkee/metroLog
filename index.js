const http = require('http');

const HOST = '0.0.0.0';
const PORT = 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Hello World');
});

server.listen(PORT, HOST, () => {
  console.log(`Server started: http://${HOST}:${PORT}`);
});
