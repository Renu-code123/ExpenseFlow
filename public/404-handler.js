// 404-handler.js - Add this to all your HTML files

// List of all valid pages in your project
const VALID_PAGES = [
    'index.html',
    'signup.html', 
    'login.html',
    'dashboard.html',
    'analytics.html',
    'goals.html',
    'settings.html',
    'Monthlysummary.html',
    'CurrencyConverter.html',
    'feedback.html',
    'schemes.html',
    'AboutUs.html',
    'PrivacyPolicy.html',
    'terms_service.html',
    'Help-Center.html',
    '404.html'
];

// Don't run on the 404 page itself
if (!window.location.pathname.includes('404.html')) {
    document.addEventListener('DOMContentLoaded', function() {
        
        // ========== 1. HANDLE LINK CLICKS ==========
        document.addEventListener('click', async function(e) {
            const link = e.target.closest('a[href]');
            if (!link) return;
            
            const href = link.getAttribute('href');
            
            // Skip external links
            if (href.startsWith('http') && !href.startsWith(window.location.origin)) {
                return;
            }
            
            // Skip anchors, mailto, etc.
            if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
                return;
            }
            
            // Only handle .html files
            if (href.endsWith('.html') || href.includes('.html?')) {
                e.preventDefault();
                
                // Extract filename
                const filename = href.split('/').pop().split('?')[0];
                
                // Quick check: Is this a valid page?
                if (!VALID_PAGES.includes(filename)) {
                    // Not a valid page, go to 404
                    sessionStorage.setItem('attemptedUrl', href);
                    window.location.href = '404.html';
                    return;
                }
                
                // Show loading state
                link.classList.add('loading');
                
                try {
                    // Try to fetch the page
                    const response = await fetch(href, { method: 'HEAD' });
                    
                    if (response.ok) {
                        // Page exists, navigate normally
                        window.location.href = href;
                    } else {
                        // Page not found
                        sessionStorage.setItem('attemptedUrl', href);
                        window.location.href = '404.html';
                    }
                } catch (error) {
                    // Network error or other issue
                    console.error('Navigation error:', error);
                    sessionStorage.setItem('attemptedUrl', href);
                    window.location.href = '404.html';
                }
            }
        });
        
        // ========== 2. CHECK CURRENT PAGE ==========
        // Check if current page is valid
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        
        // Don't check index, login, signup pages
        if (!['', 'index.html', 'login.html', 'signup.html'].includes(currentPage)) {
            if (!VALID_PAGES.includes(currentPage)) {
                // Current page is not valid, redirect to 404
                setTimeout(() => {
                    sessionStorage.setItem('attemptedUrl', window.location.href);
                    window.location.href = '404.html';
                }, 100);
            }
        }
        
        // ========== 3. HANDLE BROWSER NAVIGATION ==========
        window.addEventListener('popstate', function() {
            // Check page when user goes back/forward
            setTimeout(() => {
                const page = window.location.pathname.split('/').pop() || 'index.html';
                if (!VALID_PAGES.includes(page) && !page.includes('?')) {
                    sessionStorage.setItem('attemptedUrl', window.location.href);
                    window.location.href = '404.html';
                }
            }, 50);
        });
    });
}

// Add loading animation styles
const style = document.createElement('style');
style.textContent = `
    a.loading {
        position: relative;
        pointer-events: none;
        opacity: 0.7;
    }
    
    a.loading::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        width: 16px;
        height: 16px;
        margin: -8px 0 0 -8px;
        border: 2px solid rgba(100, 255, 218, 0.3);
        border-top-color: #64ffda;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
    }
    
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);