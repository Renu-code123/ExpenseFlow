// Configuration and Setup Scripts
// Server/client config, environment variables

const dotenv = require('dotenv');
dotenv.config();

module.exports = {
    serverPort: process.env.SERVER_PORT || 9000,
    serverHost: process.env.SERVER_HOST || 'localhost',
    clientId: process.env.CLIENT_ID || null
};
