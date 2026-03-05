// server.js
// Main API Gateway server
const express = require('express');
const bodyParser = require('body-parser');
const { authenticate } = require('./auth');
const { rateLimiter } = require('./rateLimiter');
const { enforcePolicy } = require('./policyEngine');
const { routeRequest } = require('./routes');
const { logRequest } = require('./logging');
const { monitor } = require('./monitoring');

const app = express();
app.use(bodyParser.json());
app.use(logRequest);
app.use(monitor);
app.use(authenticate);
app.use(rateLimiter);
app.use(enforcePolicy);
app.use(routeRequest);

app.listen(4000, () => {
  console.log('API Gateway running on http://localhost:4000');
});
