// utils.js
// Utility functions for gateway
function validateInput(input, schema) {
  // Simulate input validation
  return true;
}

function encodeData(data) {
  return Buffer.from(JSON.stringify(data)).toString('base64');
}

function decodeData(encoded) {
  return JSON.parse(Buffer.from(encoded, 'base64').toString());
}

function handleError(res, error) {
  res.status(500).json({ error: error.message });
}

module.exports = { validateInput, encodeData, decodeData, handleError };
