// secure-analytics-utils.js
// Utility functions for privacy-preserving analytics

function encodeValue(value) {
  return btoa(value.toString());
}

function decodeValue(encoded) {
  return parseFloat(atob(encoded));
}

function logCompliance(event, details) {
  console.log(`[COMPLIANCE] ${event}:`, details);
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleString();
}

function generateId(prefix = 'id') {
  return prefix + '-' + Math.random().toString(36).substr(2, 9);
}

function debounce(fn, delay) {
  let timer = null;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function throttle(fn, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function isEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export {
  encodeValue,
  decodeValue,
  logCompliance,
  formatDate,
  generateId,
  debounce,
  throttle,
  deepClone,
  isEqual
};
