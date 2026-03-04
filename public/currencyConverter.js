/* THEME TOGGLE */
function toggleTheme() {
  document.body.classList.toggle("light");
  const icon = document.querySelector('.theme-toggle');
  icon.textContent = document.body.classList.contains("light") ? "☀️" : "🌙";
  localStorage.setItem("theme", document.body.classList.contains("light") ? "light" : "dark");
}

// Load saved theme
if (localStorage.getItem("theme") === "light") {
  document.body.classList.add("light");
  document.querySelector('.theme-toggle').textContent = "☀️";
}

/* CURRENCY CONVERSION DATA */
const rates = {
  USD: {INR: 83.12, EUR: 0.92, GBP: 0.79, JPY: 145.5, AUD: 1.56, CAD: 1.34, CHF: 0.88, CNY: 7.3, SGD: 1.36},
  INR: {USD: 0.012, EUR: 0.011, GBP: 0.0095, JPY: 1.75, AUD: 0.018, CAD: 0.016, CHF: 0.011, CNY: 0.088, SGD: 0.016},
  EUR: {USD: 1.08, INR: 90.5, GBP: 0.86, JPY: 158.2, AUD: 1.70, CAD: 1.45, CHF: 0.95, CNY: 7.95, SGD: 1.48},
  GBP: {USD: 1.26, INR: 105.3, EUR: 1.16, JPY: 184.1, AUD: 1.98, CAD: 1.68, CHF: 1.11, CNY: 9.2, SGD: 1.71},
  JPY: {USD: 0.0069, INR: 0.57, EUR: 0.0063, GBP: 0.0054, AUD: 0.011, CAD: 0.0091, CHF: 0.006, CNY: 0.050, SGD: 0.0093},
  AUD: {USD: 0.64, INR: 53.2, EUR: 0.59, GBP: 0.50, JPY: 90.5, CAD: 0.85, CHF: 0.56, CNY: 4.63, SGD: 0.86},
  CAD: {USD: 0.75, INR: 62.1, EUR: 0.69, GBP: 0.60, JPY: 105.2, AUD: 1.17, CHF: 0.66, CNY: 5.42, SGD: 1.01},
  CHF: {USD: 1.14, INR: 94.2, EUR: 1.05, GBP: 0.90, JPY: 158.5, AUD: 1.79, CAD: 1.52, CNY: 8.19, SGD: 1.53},
  CNY: {USD: 0.14, INR: 11.4, EUR: 0.13, GBP: 0.11, JPY: 19.3, AUD: 0.22, CAD: 0.18, CHF: 0.12, SGD: 0.19},
  SGD: {USD: 0.73, INR: 60.5, EUR: 0.68, GBP: 0.58, JPY: 106.2, AUD: 1.17, CAD: 0.99, CHF: 0.65, CNY: 5.25}
};

// Format currency with commas
function formatCurrency(amount, currencyCode) {
  const formatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  
  // Add currency symbol based on currency code
  const symbols = {
    'USD': '$', 'EUR': '€', 'GBP': '£', 'JPY': '¥',
    'INR': '₹', 'AUD': 'A$', 'CAD': 'C$', 'CHF': 'CHF',
    'CNY': '¥', 'SGD': 'S$'
  };
  
  const symbol = symbols[currencyCode] || currencyCode;
  return `${symbol} ${formatter.format(amount)}`;
}

// Swap currencies function
function swapCurrencies() {
  const fromSelect = document.getElementById('from');
  const toSelect = document.getElementById('to');
  const temp = fromSelect.value;
  fromSelect.value = toSelect.value;
  toSelect.value = temp;
  
  // Trigger conversion after swap
  if (document.getElementById('amount').value) {
    convert();
  }
}

// Main conversion function
function convert() {
  const amount = parseFloat(document.getElementById('amount').value);
  const fromCurrency = document.getElementById('from').value;
  const toCurrency = document.getElementById('to').value;
  const resultValue = document.getElementById('resultValue');
  const resultDetails = document.getElementById('resultDetails');
  const convertedInput = document.getElementById('converted');
  
  if (!amount || amount <= 0) {
    resultValue.textContent = "—";
    resultDetails.textContent = "Please enter a valid amount";
    convertedInput.value = "";
    return;
  }
  
  // Get exchange rate
  const rate = rates[fromCurrency][toCurrency];
  if (!rate) {
    resultValue.textContent = "—";
    resultDetails.textContent = "Exchange rate not available";
    convertedInput.value = "";
    return;
  }
  
  // Calculate result
  const result = amount * rate;
  
  // Update UI
  resultValue.textContent = formatCurrency(result, toCurrency);
  convertedInput.value = formatCurrency(result, toCurrency);
  
  // Update details
  resultDetails.innerHTML = `
    <strong>1 ${fromCurrency}</strong> = <strong>${rate.toFixed(4)} ${toCurrency}</strong><br>
    <span style="font-size: 0.9em;">${formatCurrency(amount, fromCurrency)} = ${formatCurrency(result, toCurrency)}</span>
  `;
  
  // Add animation effect
  resultValue.style.transform = 'scale(1.1)';
  setTimeout(() => {
    resultValue.style.transform = 'scale(1)';
  }, 300);
}

// Auto-convert on input change
document.getElementById('amount').addEventListener('input', convert);
document.getElementById('from').addEventListener('change', convert);
document.getElementById('to').addEventListener('change', convert);

// Initialize with a conversion
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(convert, 500);
});
