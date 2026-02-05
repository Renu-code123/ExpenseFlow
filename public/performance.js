// Performance Dashboard - Additional JavaScript functionality

class PerformanceMonitor {
    constructor() {
        this.metrics = {
            loadTime: 0,
            lcp: 0,
            fid: 0,
            cls: 0,
            resources: [],
            memory: null
        };
        this.charts = {};
        this.intervals = {};
    }

    init() {
        this.setupPerformanceObservers();
        this.setupMemoryMonitoring();
        this.setupNetworkMonitoring();
        this.generatePerformanceReport();
    }

    setupPerformanceObservers() {
        if ('PerformanceObserver' in window) {
            // Largest Contentful Paint
            const lcpObserver = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                this.metrics.lcp = entries[entries.length - 1].startTime;
                this.updateMetricDisplay('lcp', this.metrics.lcp.toFixed(0) + 'ms');
            });
            lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

            // First Input Delay
            const fidObserver = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                entries.forEach(entry => {
                    this.metrics.fid = entry.processingStart - entry.startTime;
                    this.updateMetricDisplay('fid', this.metrics.fid.toFixed(0) + 'ms');
                });
            });
            fidObserver.observe({ entryTypes: ['first-input'] });

            // Cumulative Layout Shift
            const clsObserver = new PerformanceObserver((list) => {
                let clsValue = 0;
                const entries = list.getEntries();
                entries.forEach(entry => {
                    if (!entry.hadRecentInput) {
                        clsValue += entry.value;
                    }
                });
                this.metrics.cls = clsValue;
                this.updateMetricDisplay('cls', clsValue.toFixed(4));
            });
            clsObserver.observe({ entryTypes: ['layout-shift'] });

            // Resource timing
            const resourceObserver = new PerformanceObserver((list) => {
                list.getEntries().forEach(entry => {
                    this.metrics.resources.push({
                        name: entry.name,
                        type: this.getResourceType(entry.initiatorType),
                        size: entry.transferSize || 0,
                        loadTime: entry.responseEnd - entry.requestStart,
                        cached: entry.transferSize === 0
                    });
                });
                this.updateResourceTable();
            });
            resourceObserver.observe({ entryTypes: ['resource'] });
        }
    }

    setupMemoryMonitoring() {
        if ('memory' in performance) {
            this.intervals.memory = setInterval(() => {
                const memory = performance.memory;
                this.metrics.memory = {
                    used: Math.round(memory.usedJSHeapSize / 1024 / 1024),
                    total: Math.round(memory.totalJSHeapSize / 1024 / 1024),
                    limit: Math.round(memory.jsHeapSizeLimit / 1024 / 1024)
                };
                this.updateMemoryDisplay();
            }, 1000);
        }
    }

    setupNetworkMonitoring() {
        if ('connection' in navigator) {
            const connection = navigator.connection;
            this.updateNetworkDisplay(connection);

            connection.addEventListener('change', () => {
                this.updateNetworkDisplay(connection);
            });
        }
    }

    getResourceType(initiatorType) {
        const types = {
            'link': 'CSS',
            'script': 'JS',
            'img': 'Image',
            'fetch': 'API',
            'xmlhttprequest': 'XHR',
            'beacon': 'Analytics'
        };
        return types[initiatorType] || 'Other';
    }

    updateMetricDisplay(metricId, value) {
        const element = document.getElementById(metricId);
        if (element) {
            element.textContent = value;
            this.updateMetricStatus(metricId, value);
        }
    }

    updateMetricStatus(metricId, value) {
        const card = document.getElementById(metricId)?.closest('.metric-card');
        if (!card) return;

        const statusElement = card.querySelector('.metric-status');
        if (!statusElement) return;

        let status = 'status-good';
        let statusText = 'Good';

        switch (metricId) {
            case 'loadTime':
                const loadTime = parseInt(value);
                if (loadTime > 3000) {
                    status = 'status-error';
                    statusText = 'Slow';
                } else if (loadTime > 1500) {
                    status = 'status-warning';
                    statusText = 'Average';
                }
                break;
            case 'lcp':
                const lcp = parseInt(value);
                if (lcp > 2500) {
                    status = 'status-error';
                    statusText = 'Poor';
                } else if (lcp > 1200) {
                    status = 'status-warning';
                    statusText = 'Needs Work';
                }
                break;
            case 'fid':
                const fid = parseInt(value);
                if (fid > 100) {
                    status = 'status-error';
                    statusText = 'Poor';
                } else if (fid > 50) {
                    status = 'status-warning';
                    statusText = 'Average';
                }
                break;
            case 'cls':
                const cls = parseFloat(value);
                if (cls > 0.25) {
                    status = 'status-error';
                    statusText = 'Poor';
                } else if (cls > 0.1) {
                    status = 'status-warning';
                    statusText = 'Needs Work';
                }
                break;
        }

        statusElement.className = `metric-status ${status}`;
        statusElement.textContent = statusText;
    }

    updateMemoryDisplay() {
        if (!this.metrics.memory) return;

        const memoryCard = document.querySelector('.metric-card:nth-child(5)');
        if (memoryCard) {
            memoryCard.querySelector('.metric-value').textContent =
                `${this.metrics.memory.used}/${this.metrics.memory.limit} MB`;
        }
    }

    updateNetworkDisplay(connection) {
        const networkInfo = document.createElement('div');
        networkInfo.innerHTML = `
            <div style="position:fixed;bottom:20px;right:20px;background:rgba(0,0,0,.8);padding:10px;border-radius:8px;font-size:12px;z-index:1000">
                <div>Network: ${connection.effectiveType || 'unknown'}</div>
                <div>Downlink: ${connection.downlink || 0} Mbps</div>
                <div>RTT: ${connection.rtt || 0} ms</div>
            </div>
        `;
        document.body.appendChild(networkInfo);

        setTimeout(() => networkInfo.remove(), 3000);
    }

    updateResourceTable() {
        const tbody = document.getElementById('resourceTable');
        if (!tbody) return;

        tbody.innerHTML = '';

        this.metrics.resources.slice(-10).forEach(resource => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td style="padding:1rem;border-bottom:1px solid rgba(255,255,255,.05)">
                    ${resource.name.split('/').pop().substring(0, 30)}...
                </td>
                <td style="padding:1rem;border-bottom:1px solid rgba(255,255,255,.05)">
                    ${resource.type}
                </td>
                <td style="padding:1rem;border-bottom:1px solid rgba(255,255,255,.05)">
                    ${resource.size ? (resource.size / 1024).toFixed(1) + ' KB' : 'Unknown'}
                </td>
                <td style="padding:1rem;border-bottom:1px solid rgba(255,255,255,.05)">
                    ${resource.loadTime.toFixed(0)} ms
                </td>
                <td style="padding:1rem;border-bottom:1px solid rgba(255,255,255,.05)">
                    <span class="${resource.cached ? 'status-good' : 'status-warning'}">
                        ${resource.cached ? 'Cached' : 'Network'}
                    </span>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    generatePerformanceReport() {
        setTimeout(() => {
            const report = {
                timestamp: new Date().toISOString(),
                url: window.location.href,
                userAgent: navigator.userAgent,
                metrics: this.metrics,
                recommendations: this.generateRecommendations()
            };

            console.log('Performance Report:', report);
            this.displayRecommendations(report.recommendations);
        }, 3000);
    }

    generateRecommendations() {
        const recommendations = [];

        if (this.metrics.loadTime > 3000) {
            recommendations.push({
                type: 'critical',
                title: 'Slow Page Load',
                description: 'Page load time is too slow. Consider implementing code splitting and lazy loading.',
                action: 'Implement code splitting and optimize bundle size'
            });
        }

        if (this.metrics.lcp > 2500) {
            recommendations.push({
                type: 'critical',
                title: 'Poor LCP Score',
                description: 'Largest Contentful Paint is too slow. Optimize images and critical rendering path.',
                action: 'Optimize images and inline critical CSS'
            });
        }

        if (this.metrics.cls > 0.1) {
            recommendations.push({
                type: 'warning',
                title: 'Layout Shift Issues',
                description: 'Page has layout shifts. Reserve space for dynamic content.',
                action: 'Add dimensions to images and reserve space for dynamic content'
            });
        }

        if (this.metrics.resources.length > 50) {
            recommendations.push({
                type: 'warning',
                title: 'Too Many Resources',
                description: 'Page loads too many resources. Consider bundling and caching.',
                action: 'Bundle resources and implement aggressive caching'
            });
        }

        return recommendations;
    }

    displayRecommendations(recommendations) {
        const tipsGrid = document.getElementById('optimizationTips');
        if (!tipsGrid) return;

        recommendations.forEach(rec => {
            const tipCard = document.createElement('div');
            tipCard.className = 'tip-card';
            tipCard.innerHTML = `
                <div class="tip-title">${rec.title}</div>
                <div class="tip-desc">${rec.description}</div>
                <div class="tip-action">${rec.action}</div>
            `;
            tipsGrid.appendChild(tipCard);
        });
    }

    runPerformanceTest() {
        return new Promise((resolve) => {
            // Simulate comprehensive performance test
            setTimeout(() => {
                const testResults = {
                    loadTime: performance.now() - perfStart,
                    domContentLoaded: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd || 0,
                    firstPaint: performance.getEntriesByType('paint')[0]?.startTime || 0,
                    resourcesLoaded: performance.getEntriesByType('resource').length,
                    cacheHitRate: Math.random() * 100
                };

                resolve(testResults);
            }, 2000);
        });
    }

    clearCache() {
        // Clear all caches
        if ('caches' in window) {
            caches.keys().then(names => {
                return Promise.all(names.map(name => caches.delete(name)));
            });
        }

        // Clear storage
        localStorage.clear();
        sessionStorage.clear();

        // Clear service worker cache
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(registrations => {
                registrations.forEach(registration => {
                    registration.unregister();
                });
            });
        }

        // Reset metrics
        this.metrics = {
            loadTime: 0,
            lcp: 0,
            fid: 0,
            cls: 0,
            resources: [],
            memory: null
        };

        return Promise.resolve();
    }

    updateChartPeriod(period) {
        // Update chart data based on selected period
        console.log(`Updating chart for period: ${period}`);

        // In a real implementation, this would fetch data for the selected period
        // For now, we'll just update the display
        const chartContainer = document.querySelector('.perf-chart .chart-container');
        if (chartContainer) {
            const performanceData = {
                loadTime: this.metrics.loadTime || performance.now() - perfStart,
                lcp: this.metrics.lcp || 0,
                fid: this.metrics.fid || 0,
                cls: this.metrics.cls || 0
            };

            chartContainer.innerHTML = `
                <div style="height:300px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,rgba(102,126,234,.1),rgba(118,75,162,.1));border-radius:8px;border:1px solid rgba(255,255,255,.1)">
                    <div style="text-align:center">
                        <div style="font-size:3rem;margin-bottom:1rem">📊</div>
                        <div style="font-size:1.2rem;font-weight:600;margin-bottom:.5rem">Performance Chart (${period})</div>
                        <div style="color:#a0a0a0">Performance metrics for ${period}</div>
                        <div style="margin-top:1rem">
                            <div style="display:inline-block;margin:0 .5rem;padding:.5rem 1rem;background:#667eea;border-radius:20px;font-size:.8rem">Load: ${performanceData.loadTime.toFixed(0)}ms</div>
                            <div style="display:inline-block;margin:0 .5rem;padding:.5rem 1rem;background:#4caf50;border-radius:20px;font-size:.8rem">LCP: ${performanceData.lcp.toFixed(0) || '--'}ms</div>
                            <div style="display:inline-block;margin:0 .5rem;padding:.5rem 1rem;background:#ff9800;border-radius:20px;font-size:.8rem">FID: ${performanceData.fid.toFixed(0) || '--'}ms</div>
                        </div>
                    </div>
                </div>
            `;
        }
    }
}

// Export for global use
window.PerformanceMonitor = PerformanceMonitor;