// ===== Loan Calculator - ExpenseFlow =====

(function () {
    'use strict';

    // ===== DOM Elements =====
    const loanAmountInput = document.getElementById('loan-amount');
    const loanAmountSlider = document.getElementById('loan-amount-slider');
    const interestRateInput = document.getElementById('interest-rate');
    const interestRateSlider = document.getElementById('interest-rate-slider');
    const loanTenureInput = document.getElementById('loan-tenure');
    const loanTenureSlider = document.getElementById('loan-tenure-slider');
    const calculateBtn = document.getElementById('calculate-btn');
    const resetBtn = document.getElementById('reset-btn');
    const exportBtn = document.getElementById('export-btn');

    // Result elements
    const emiValueEl = document.getElementById('emi-value');
    const principalValueEl = document.getElementById('principal-value');
    const interestValueEl = document.getElementById('interest-value');
    const totalValueEl = document.getElementById('total-value');

    // Amortization
    const amortBody = document.getElementById('amort-body');
    const amortViewSelect = document.getElementById('amort-view');
    const downloadScheduleBtn = document.getElementById('download-schedule');

    // Chart
    let paymentChart = null;
    let yearlyChart = null;
    let currentChartType = 'doughnut';

    // State
    let tenureUnit = 'years';
    let currentLoanType = 'personal';

    // Loan presets
    const loanPresets = {
        personal: { amount: 500000, rate: 10.5, tenure: 5 },
        home: { amount: 5000000, rate: 7.5, tenure: 20 },
        car: { amount: 800000, rate: 8.5, tenure: 5 },
        education: { amount: 1000000, rate: 6.5, tenure: 7 },
        business: { amount: 2000000, rate: 12.0, tenure: 5 }
    };

    // ===== Utility Functions =====
    function formatCurrency(amount) {
        return '$' + amount.toLocaleString('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
    }

    function formatCurrencyDetailed(amount) {
        return '$' + amount.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    // ===== EMI Calculation =====
    function calculateEMI(principal, annualRate, tenureMonths) {
        if (annualRate === 0) {
            return principal / tenureMonths;
        }
        const monthlyRate = annualRate / 12 / 100;
        const emi = principal * monthlyRate * Math.pow(1 + monthlyRate, tenureMonths)
            / (Math.pow(1 + monthlyRate, tenureMonths) - 1);
        return emi;
    }

    // ===== Get Tenure in Months =====
    function getTenureMonths() {
        const val = parseFloat(loanTenureInput.value) || 0;
        return tenureUnit === 'years' ? val * 12 : val;
    }

    // ===== Generate Amortization Schedule =====
    function generateAmortization(principal, annualRate, tenureMonths, emi) {
        const monthlyRate = annualRate / 12 / 100;
        let balance = principal;
        const schedule = [];

        for (let m = 1; m <= tenureMonths; m++) {
            const interestPaid = balance * monthlyRate;
            const principalPaid = emi - interestPaid;
            balance = Math.max(0, balance - principalPaid);

            schedule.push({
                month: m,
                emi: emi,
                principal: principalPaid,
                interest: interestPaid,
                balance: balance
            });
        }

        return schedule;
    }

    // ===== Render Amortization Table =====
    function renderAmortTable(schedule) {
        const view = amortViewSelect.value;
        amortBody.innerHTML = '';

        if (view === 'yearly') {
            // Group by year
            const years = {};
            schedule.forEach(item => {
                const year = Math.ceil(item.month / 12);
                if (!years[year]) {
                    years[year] = { emi: 0, principal: 0, interest: 0, balance: 0 };
                }
                years[year].emi += item.emi;
                years[year].principal += item.principal;
                years[year].interest += item.interest;
                years[year].balance = item.balance;
            });

            Object.keys(years).forEach(year => {
                const data = years[year];
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>Year ${year}</td>
                    <td>${formatCurrencyDetailed(data.emi)}</td>
                    <td>${formatCurrencyDetailed(data.principal)}</td>
                    <td>${formatCurrencyDetailed(data.interest)}</td>
                    <td>${formatCurrencyDetailed(data.balance)}</td>
                `;
                amortBody.appendChild(row);
            });
        } else {
            schedule.forEach(item => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>Month ${item.month}</td>
                    <td>${formatCurrencyDetailed(item.emi)}</td>
                    <td>${formatCurrencyDetailed(item.principal)}</td>
                    <td>${formatCurrencyDetailed(item.interest)}</td>
                    <td>${formatCurrencyDetailed(item.balance)}</td>
                `;
                amortBody.appendChild(row);
            });
        }
    }

    // ===== Render Payment Chart =====
    function renderPaymentChart(principal, totalInterest) {
        const ctx = document.getElementById('paymentChart').getContext('2d');

        if (paymentChart) {
            paymentChart.destroy();
        }

        const config = {
            type: currentChartType,
            data: {
                labels: ['Principal', 'Interest'],
                datasets: [{
                    data: [principal, totalInterest],
                    backgroundColor: [
                        'rgba(102, 126, 234, 0.85)',
                        'rgba(255, 107, 157, 0.85)'
                    ],
                    borderColor: [
                        '#667eea',
                        '#ff6b9d'
                    ],
                    borderWidth: 2,
                    hoverOffset: currentChartType === 'doughnut' ? 15 : 0,
                    borderRadius: currentChartType === 'bar' ? 8 : 0,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: currentChartType === 'doughnut' ? '65%' : undefined,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15, 15, 35, 0.9)',
                        titleColor: '#64ffda',
                        bodyColor: '#ffffff',
                        borderColor: 'rgba(100, 255, 218, 0.2)',
                        borderWidth: 1,
                        cornerRadius: 10,
                        padding: 12,
                        callbacks: {
                            label: function (ctx) {
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = ((ctx.parsed / total) * 100).toFixed(1);
                                return `${ctx.label}: ${formatCurrency(ctx.parsed)} (${pct}%)`;
                            }
                        }
                    }
                },
                scales: currentChartType === 'bar' ? {
                    x: {
                        grid: { color: 'rgba(255,255,255,0.03)' },
                        ticks: { color: '#a0a0b8' }
                    },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.03)' },
                        ticks: {
                            color: '#a0a0b8',
                            callback: v => formatCurrency(v)
                        }
                    }
                } : undefined
            }
        };

        paymentChart = new Chart(ctx, config);
    }

    // ===== Render Yearly Chart =====
    function renderYearlyChart(schedule) {
        const ctx = document.getElementById('yearlyChart').getContext('2d');

        if (yearlyChart) {
            yearlyChart.destroy();
        }

        // Group by year
        const years = {};
        schedule.forEach(item => {
            const year = Math.ceil(item.month / 12);
            if (!years[year]) {
                years[year] = { principal: 0, interest: 0, balance: 0 };
            }
            years[year].principal += item.principal;
            years[year].interest += item.interest;
            years[year].balance = item.balance;
        });

        const labels = Object.keys(years).map(y => `Year ${y}`);
        const principalData = Object.values(years).map(y => y.principal);
        const interestData = Object.values(years).map(y => y.interest);
        const balanceData = Object.values(years).map(y => y.balance);

        yearlyChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Principal',
                        data: principalData,
                        backgroundColor: 'rgba(102, 126, 234, 0.7)',
                        borderColor: '#667eea',
                        borderWidth: 1,
                        borderRadius: 6,
                        order: 2
                    },
                    {
                        label: 'Interest',
                        data: interestData,
                        backgroundColor: 'rgba(255, 107, 157, 0.7)',
                        borderColor: '#ff6b9d',
                        borderWidth: 1,
                        borderRadius: 6,
                        order: 3
                    },
                    {
                        label: 'Balance',
                        data: balanceData,
                        type: 'line',
                        borderColor: '#64ffda',
                        backgroundColor: 'rgba(100, 255, 218, 0.1)',
                        borderWidth: 2,
                        pointBackgroundColor: '#64ffda',
                        pointBorderColor: '#64ffda',
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        fill: true,
                        tension: 0.4,
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: '#c0c0d8',
                            usePointStyle: true,
                            pointStyle: 'circle',
                            padding: 18,
                            font: { family: 'Inter', size: 12 }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 15, 35, 0.9)',
                        titleColor: '#64ffda',
                        bodyColor: '#ffffff',
                        borderColor: 'rgba(100, 255, 218, 0.2)',
                        borderWidth: 1,
                        cornerRadius: 10,
                        padding: 12,
                        callbacks: {
                            label: function (ctx) {
                                return `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        grid: { color: 'rgba(255,255,255,0.03)' },
                        ticks: { color: '#a0a0b8', font: { family: 'Inter', size: 11 } }
                    },
                    y: {
                        stacked: false,
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: {
                            color: '#a0a0b8',
                            font: { family: 'Inter', size: 11 },
                            callback: v => formatCurrency(v)
                        }
                    }
                }
            }
        });
    }

    // ===== Update Comparison =====
    function updateComparison(principal, rate, tenureYears) {
        // Current
        const months1 = tenureYears * 12;
        const emi1 = calculateEMI(principal, rate, months1);
        const total1 = emi1 * months1;

        document.getElementById('comp-rate-1').textContent = rate + '%';
        document.getElementById('comp-tenure-1').textContent = tenureYears + ' Years';
        document.getElementById('comp-emi-1').textContent = formatCurrency(emi1);
        document.getElementById('comp-total-1').textContent = 'Total: ' + formatCurrency(total1);

        // Lower Rate (-1%)
        const lowerRate = Math.max(0.5, rate - 1);
        const emi2 = calculateEMI(principal, lowerRate, months1);
        const total2 = emi2 * months1;
        const savings2 = total1 - total2;

        document.getElementById('comp-rate-2').textContent = lowerRate + '%';
        document.getElementById('comp-tenure-2').textContent = tenureYears + ' Years';
        document.getElementById('comp-emi-2').textContent = formatCurrency(emi2);
        document.getElementById('comp-total-2').textContent = 'Total: ' + formatCurrency(total2);
        const savingsEl2 = document.getElementById('comp-savings-2');
        savingsEl2.textContent = 'Save ' + formatCurrency(savings2);
        savingsEl2.className = 'comp-savings savings';

        // Longer Tenure (+5 years, or double if already long)
        const longerTenure = Math.min(30, tenureYears + 5);
        const months3 = longerTenure * 12;
        const emi3 = calculateEMI(principal, rate, months3);
        const total3 = emi3 * months3;
        const diff3 = total3 - total1;

        document.getElementById('comp-rate-3').textContent = rate + '%';
        document.getElementById('comp-tenure-3').textContent = longerTenure + ' Years';
        document.getElementById('comp-emi-3').textContent = formatCurrency(emi3);
        document.getElementById('comp-total-3').textContent = 'Total: ' + formatCurrency(total3);
        const savingsEl3 = document.getElementById('comp-savings-3');
        if (diff3 > 0) {
            savingsEl3.textContent = 'Pay ' + formatCurrency(diff3) + ' more';
            savingsEl3.className = 'comp-savings extra';
        } else {
            savingsEl3.textContent = 'Save ' + formatCurrency(Math.abs(diff3));
            savingsEl3.className = 'comp-savings savings';
        }
    }

    // ===== Main Calculate =====
    function calculate() {
        const principal = parseFloat(loanAmountInput.value) || 0;
        const rate = parseFloat(interestRateInput.value) || 0;
        const tenureMonths = getTenureMonths();

        if (principal <= 0 || rate <= 0 || tenureMonths <= 0) return;

        const emi = calculateEMI(principal, rate, tenureMonths);
        const totalPayment = emi * tenureMonths;
        const totalInterest = totalPayment - principal;

        // Update display
        emiValueEl.textContent = formatCurrency(emi);
        principalValueEl.textContent = formatCurrency(principal);
        interestValueEl.textContent = formatCurrency(totalInterest);
        totalValueEl.textContent = formatCurrency(totalPayment);

        // Generate amortization
        const schedule = generateAmortization(principal, rate, tenureMonths, emi);
        renderAmortTable(schedule);

        // Charts
        renderPaymentChart(principal, totalInterest);
        renderYearlyChart(schedule);

        // Comparison
        const tenureYears = tenureUnit === 'years'
            ? parseFloat(loanTenureInput.value)
            : parseFloat(loanTenureInput.value) / 12;
        updateComparison(principal, rate, Math.round(tenureYears));
    }

    // ===== Sync Sliders & Inputs =====
    function syncSliderToInput(slider, input) {
        slider.addEventListener('input', () => {
            input.value = slider.value;
            calculate();
        });
        input.addEventListener('input', () => {
            slider.value = input.value;
            calculate();
        });
    }

    syncSliderToInput(loanAmountSlider, loanAmountInput);
    syncSliderToInput(interestRateSlider, interestRateInput);
    syncSliderToInput(loanTenureSlider, loanTenureInput);

    // ===== Calculate Button =====
    calculateBtn.addEventListener('click', calculate);

    // ===== Tenure Toggle =====
    document.querySelectorAll('.tenure-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tenure-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            tenureUnit = btn.dataset.unit;

            // Adjust slider range
            if (tenureUnit === 'months') {
                loanTenureSlider.max = 360;
                loanTenureInput.max = 360;
                loanTenureSlider.value = parseFloat(loanTenureInput.value) * 12;
                loanTenureInput.value = parseFloat(loanTenureInput.value) * 12;
                document.querySelector('.range-labels:last-child span:first-child') &&
                    (document.querySelectorAll('.input-group')[2].querySelector('.range-labels span:last-child').textContent = '360');
            } else {
                const months = parseFloat(loanTenureInput.value);
                loanTenureSlider.max = 30;
                loanTenureInput.max = 30;
                loanTenureSlider.value = Math.round(months / 12);
                loanTenureInput.value = Math.round(months / 12);
            }
            calculate();
        });
    });

    // ===== Loan Type Tabs =====
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentLoanType = btn.dataset.type;
            const preset = loanPresets[currentLoanType];

            if (preset) {
                loanAmountInput.value = preset.amount;
                loanAmountSlider.value = preset.amount;
                interestRateInput.value = preset.rate;
                interestRateSlider.value = preset.rate;

                // Reset to years
                tenureUnit = 'years';
                document.querySelectorAll('.tenure-btn').forEach(b => b.classList.remove('active'));
                document.querySelector('.tenure-btn[data-unit="years"]').classList.add('active');
                loanTenureSlider.max = 30;
                loanTenureInput.max = 30;

                loanTenureInput.value = preset.tenure;
                loanTenureSlider.value = preset.tenure;

                calculate();
            }
        });
    });

    // ===== Chart Toggle =====
    document.querySelectorAll('.chart-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentChartType = btn.dataset.chart;
            calculate();
        });
    });

    // ===== Amortization View Toggle =====
    amortViewSelect.addEventListener('change', () => {
        const principal = parseFloat(loanAmountInput.value) || 0;
        const rate = parseFloat(interestRateInput.value) || 0;
        const tenureMonths = getTenureMonths();
        const emi = calculateEMI(principal, rate, tenureMonths);
        const schedule = generateAmortization(principal, rate, tenureMonths, emi);
        renderAmortTable(schedule);
    });

    // ===== Reset =====
    resetBtn.addEventListener('click', () => {
        const preset = loanPresets.personal;
        loanAmountInput.value = preset.amount;
        loanAmountSlider.value = preset.amount;
        interestRateInput.value = preset.rate;
        interestRateSlider.value = preset.rate;
        loanTenureInput.value = preset.tenure;
        loanTenureSlider.value = preset.tenure;

        tenureUnit = 'years';
        document.querySelectorAll('.tenure-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.tenure-btn[data-unit="years"]').classList.add('active');
        loanTenureSlider.max = 30;
        loanTenureInput.max = 30;

        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.tab-btn[data-type="personal"]').classList.add('active');
        currentLoanType = 'personal';

        amortViewSelect.value = 'yearly';

        calculate();
    });

    // ===== Export =====
    exportBtn.addEventListener('click', () => {
        const principal = parseFloat(loanAmountInput.value);
        const rate = parseFloat(interestRateInput.value);
        const tenureMonths = getTenureMonths();
        const emi = calculateEMI(principal, rate, tenureMonths);
        const totalPayment = emi * tenureMonths;
        const totalInterest = totalPayment - principal;

        let csv = 'Loan Calculator Report\n\n';
        csv += `Loan Amount,${formatCurrencyDetailed(principal)}\n`;
        csv += `Interest Rate,${rate}%\n`;
        csv += `Tenure,${loanTenureInput.value} ${tenureUnit}\n`;
        csv += `Monthly EMI,${formatCurrencyDetailed(emi)}\n`;
        csv += `Total Interest,${formatCurrencyDetailed(totalInterest)}\n`;
        csv += `Total Payment,${formatCurrencyDetailed(totalPayment)}\n\n`;

        csv += 'Month,EMI,Principal,Interest,Balance\n';
        const schedule = generateAmortization(principal, rate, tenureMonths, emi);
        schedule.forEach(item => {
            csv += `${item.month},${item.emi.toFixed(2)},${item.principal.toFixed(2)},${item.interest.toFixed(2)},${item.balance.toFixed(2)}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `loan-calculator-${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    });

    // ===== Download Amortization Schedule =====
    downloadScheduleBtn.addEventListener('click', () => {
        exportBtn.click();
    });

    // ===== Cursor Trail =====
    (function initCursorTrail() {
        const container = document.getElementById('cursor-trail');
        const dots = [];
        const DOT_COUNT = 12;

        for (let i = 0; i < DOT_COUNT; i++) {
            const dot = document.createElement('div');
            dot.className = 'trail-dot';
            dot.style.opacity = '0';
            container.appendChild(dot);
            dots.push({ el: dot, x: 0, y: 0 });
        }

        let mouseX = 0, mouseY = 0;

        document.addEventListener('mousemove', e => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        });

        function animate() {
            let prevX = mouseX, prevY = mouseY;

            dots.forEach((dot, i) => {
                const speed = 0.35 - (i * 0.02);
                dot.x += (prevX - dot.x) * speed;
                dot.y += (prevY - dot.y) * speed;

                dot.el.style.left = dot.x + 'px';
                dot.el.style.top = dot.y + 'px';
                dot.el.style.opacity = (1 - i / DOT_COUNT) * 0.6;
                dot.el.style.transform = `translate(-50%, -50%) scale(${1 - i * 0.06})`;

                prevX = dot.x;
                prevY = dot.y;
            });

            requestAnimationFrame(animate);
        }

        animate();
    })();

    // ===== Initial Calculation =====
    calculate();

})();
