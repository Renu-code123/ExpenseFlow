// routes.js
// Request routing and microservice proxying
const httpProxy = require('http-proxy');
const proxy = httpProxy.createProxyServer({});

const serviceMap = {
  '/api/serviceA': 'http://localhost:5001',
  '/api/serviceB': 'http://localhost:5002'
};

function routeRequest(req, res) {
  const target = serviceMap[req.path];
  if (!target) return res.status(404).json({ error: 'Service not found' });
  proxy.web(req, res, { target }, err => {
    res.status(502).json({ error: 'Proxy error', details: err.message });
  });
}

module.exports = { routeRequest };
