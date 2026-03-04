/* collab-budget-utils.js
   Utility functions for collaborative budget editor
*/
export function formatCurrency(amount) {
  return '$' + amount.toFixed(2);
}

export function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleString();
}

export function generateId() {
  return 'id-' + Math.random().toString(36).substr(2, 9);
}

export function debounce(fn, delay) {
  let timer = null;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

export function throttle(fn, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function isEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function sortByAmount(items) {
  return items.slice().sort((a, b) => b.amount - a.amount);
}

export function sortByName(items) {
  return items.slice().sort((a, b) => a.name.localeCompare(b.name));
}

export function filterByUser(items, userId) {
  return items.filter(item => item.userId === userId);
}

export function filterByDate(items, date) {
  return items.filter(item => {
    const d = new Date(item.timestamp);
    return d.toDateString() === date.toDateString();
  });
}
