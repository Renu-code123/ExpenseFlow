
    // Recurring Modal Control
    function openRecurringModal() {
      const modal = document.getElementById('recurring-modal');
      if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
        document.getElementById('recurring-modal-title').textContent = 'Add Recurring Expense';
        document.getElementById('recurring-form').reset();
      }
    }

    function closeRecurringModal() {
      const modal = document.getElementById('recurring-modal');
      if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
      }
    }

    // Initialize recurring button
    document.addEventListener('DOMContentLoaded', function () {
      const addBtn = document.getElementById('add-recurring-btn');
      if (addBtn) {
        addBtn.addEventListener('click', openRecurringModal);
      }

      const closeBtn = document.getElementById('recurring-modal-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', closeRecurringModal);
      }

      const cancelBtn = document.getElementById('recurring-cancel-btn');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', closeRecurringModal);
      }

      // Close modal when clicking outside
      const modal = document.getElementById('recurring-modal');
      if (modal) {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) {
            closeRecurringModal();
          }
        });
      }
    });

    // Load supported currencies on page load
    async function loadSupportedCurrencies() {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const response = await fetch('/api/currency/supported', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        const data = await response.json();
        if (data.success) {
          supportedCurrencies = data.data.currencies;
          populateCurrencySelects();
        }
      } catch (error) {
        console.error('Error loading currencies:', error);
      }
    }


      document.addEventListener("DOMContentLoaded", () => {
        const container = document.getElementById("cursor-trail");
        for (let i = 0; i < 8; i++) {
          const dot = document.createElement("div");
          dot.className = "trail-dot";
          container.appendChild(dot);
        }
      });
      // Currency Management Functions
      let supportedCurrencies = [];
      let currentUserCurrency = (window.i18n?.getCurrency?.() && window.i18n.getCurrency()) || 'INR';
      window.currentUserCurrency = currentUserCurrency;

      // Load supported currencies on page load
      async function loadSupportedCurrencies() {
        try {
          const token = localStorage.getItem('token');
          if (!token) return;

          const response = await fetch('/api/currency/supported', {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          const data = await response.json();
          if (data.success) {
            supportedCurrencies = data.data.currencies;
            populateCurrencySelects();
          }
        } catch (error) {
          console.error('Error loading currencies:', error);
        }
      }
      const closeBtn = document.getElementById('recurring-modal-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', closeRecurringModal);
      }

      const cancelBtn = document.getElementById('recurring-cancel-btn');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', closeRecurringModal);
      }

      // Close modal when clicking outside
      const modal = document.getElementById('recurring-modal');
      if (modal) {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) {
            closeRecurringModal();
          }
        });
      }
      // Load supported currencies on page load
      async function loadSupportedCurrencies() {
        try {
          const token = localStorage.getItem('token');
          if (!token) return;

          const response = await fetch('/api/currency/supported', {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          const data = await response.json();
          if (data.success) {
            supportedCurrencies = data.data.currencies;
            populateCurrencySelects();
          }
        } catch (error) {
          console.error('Error loading currencies:', error);
        }
      }

      // Populate currency dropdowns
      function populateCurrencySelects() {
        const currencySelect = document.getElementById('currency');
        const preferredCurrencySelect = document.getElementById('preferred-currency');

        if (currencySelect && supportedCurrencies.length > 0) {
          currencySelect.innerHTML = supportedCurrencies.map(curr =>
            `<option value="${curr.code}">${curr.symbol} ${curr.code} - ${curr.name}</option>`
          ).join('');
          currencySelect.value = currentUserCurrency;
        }

        if (preferredCurrencySelect && supportedCurrencies.length > 0) {
          preferredCurrencySelect.innerHTML = supportedCurrencies.map(curr =>
            `<option value="${curr.code}">${curr.symbol} ${curr.code} - ${curr.name}</option>`
          ).join('');
          preferredCurrencySelect.value = currentUserCurrency;
        }
      }

      // Load user's currency preference
      async function loadUserCurrencyPreference() {
        try {
          const token = localStorage.getItem('token');
          if (!token) return;

          const data = await response.json();
          if (data.success) {
            currentUserCurrency = data.data.preferredCurrency;
            window.currentUserCurrency = currentUserCurrency;
            if (window.i18n?.setCurrency) {
              window.i18n.setCurrency(currentUserCurrency);
            }
            document.getElementById('current-currency').textContent = currentUserCurrency;
            populateCurrencySelects();
          }
        } catch (error) {
          console.error('Error loading currency preference:', error);
        }
        const response = await fetch('/api/currency/preference', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        const data = await response.json();
        if (data.success) {
          currentUserCurrency = data.data.preferredCurrency;
          const currentCurrencyEl = document.getElementById('current-currency');
          if (currentCurrencyEl) currentCurrencyEl.textContent = currentUserCurrency;
          populateCurrencySelects();
        }
      }



      // Open currency settings modal
      function openCurrencyModal() {
        const modal = document.getElementById('currency-modal');
        if (modal) {
          modal.style.display = 'flex';
          loadExchangeRateInfo();
        }
      }

      // Close currency settings modal
      function closeCurrencyModal() {
        const modal = document.getElementById('currency-modal');
        if (modal) {
          modal.style.display = 'none';
        }
      }

      // Load exchange rate information
      async function loadExchangeRateInfo() {
        try {
          const token = localStorage.getItem('token');
          const response = await fetch(`/api/currency/rates?base=${currentUserCurrency}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          const data = await response.json();
          if (data.success) {
            const rateInfo = document.getElementById('exchange-rate-info');
            if (!rateInfo) return;

            const rates = data.data.rates;
            const popularCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'AUD'];

            let html = '<div class="rate-list">';
            popularCurrencies.forEach(curr => {
              if (rates[curr]) {
                html += `<div class="rate-item">
                <span class="rate-currency">${curr}</span>
                <span class="rate-value">${rates[curr].toFixed(4)}</span>
              </div>`;
              }
            });

            const data = await response.json();
            if (data.success) {
              currentUserCurrency = newCurrency;
              window.currentUserCurrency = newCurrency;
              if (window.i18n?.setCurrency) {
                window.i18n.setCurrency(newCurrency);
              }
              document.getElementById('current-currency').textContent = newCurrency;
              closeCurrencyModal();
              // Reload transactions to show in new currency
              location.reload();
            } else {
              alert('Failed to update currency preference');
            }
          } else {
            rateInfo.innerHTML = '<p>Failed to load exchange rates.</p>';
          }
        } catch (error) {
          console.error('Error loading exchange rates:', error);
        }
      }

      // Save currency preference
      async function saveCurrencyPreference() {
        try {
          const token = localStorage.getItem('token');
          const prefSelect = document.getElementById('preferred-currency');
          if (!prefSelect) return;

          const newCurrency = prefSelect.value;

          const response = await fetch('/api/currency/preference', {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ currency: newCurrency })
          });

          const data = await response.json();
          if (data.success) {
            currentUserCurrency = newCurrency;
            const currentCurrencyEl = document.getElementById('current-currency');
            if (currentCurrencyEl) currentCurrencyEl.textContent = newCurrency;
            closeCurrencyModal();
            // Reload transactions to show in new currency
            location.reload();
          } else {
            alert('Failed to update currency preference');
          }
        }

        catch (error) {
          console.error('Error saving currency preference:', error);
          alert('Error saving currency preference');
        }
      };


