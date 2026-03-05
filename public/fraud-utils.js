// fraud-utils.js
// Utility functions for fraud detection and analytics

function normalizeAmount(amount) {
  return Math.log(1 + amount);
}

function riskScore(user) {
  let score = 0.5;
  if (user.isFlagged) score += 0.3;
  if (user.deviceRisk > 0.7) score += 0.2;
  return Math.min(score, 1.0);
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
  normalizeAmount,
  riskScore,
  formatDate,
  generateId,
  debounce,
  throttle,
  deepClone,
  isEqual
};
