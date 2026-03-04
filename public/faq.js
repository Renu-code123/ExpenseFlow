// ==============================
// FAQ PAGE FUNCTIONALITY
// ==============================

class FAQManager {
    constructor() {
        this.faqItems = document.querySelectorAll('.faq-item');
        this.categoryBtns = document.querySelectorAll('.category-btn');
        this.categoryGroups = document.querySelectorAll('.category-group');
        this.searchInput = document.getElementById('faqSearch');
        this.currentCategory = 'general';

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupAccessibility();
    }

    setupEventListeners() {
        // Toggle FAQ items
        this.faqItems.forEach(item => {
            const question = item.querySelector('.faq-question');
            question.addEventListener('click', () => this.toggleFAQItem(item));
            question.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.toggleFAQItem(item);
                }
            });
        });

        // Category filtering
        this.categoryBtns.forEach(btn => {
            btn.addEventListener('click', () => this.switchCategory(btn));
        });

        // Search functionality
        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => this.searchFAQ(e.target.value));
        }

        // Close FAQ item when clicking on answer (to avoid accidental interactions)
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.faq-item') && !e.target.closest('.category-btn')) {
                // Optionally close all on outside click
                // this.faqItems.forEach(item => item.classList.remove('active'));
            }
        });
    }

    toggleFAQItem(item) {
        // Close other items in the same category (optional: remove for multiple opens)
        const category = item.closest('.category-group');
        const otherItems = category.querySelectorAll('.faq-item');
        
        otherItems.forEach(otherItem => {
            if (otherItem !== item) {
                otherItem.classList.remove('active');
            }
        });

        // Toggle current item
        item.classList.toggle('active');

        // Scroll into view if opened
        if (item.classList.contains('active')) {
            setTimeout(() => {
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 100);
        }
    }

    switchCategory(btn) {
        // Update active button
        this.categoryBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const category = btn.dataset.category;
        this.currentCategory = category;

        // Show/hide category groups
        this.categoryGroups.forEach(group => {
            if (group.dataset.category === category) {
                group.style.display = 'block';
                group.classList.remove('hidden');
                // Trigger animation
                setTimeout(() => {
                    group.classList.add('fadeIn');
                }, 10);
            } else {
                group.style.display = 'none';
                group.classList.add('hidden');
            }
        });

        // Reset search
        if (this.searchInput) {
            this.searchInput.value = '';
        }

        // Close all FAQ items when switching categories
        this.faqItems.forEach(item => item.classList.remove('active'));

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    searchFAQ(query) {
        const searchTerm = query.toLowerCase().trim();

        if (searchTerm === '') {
            // Show all items if search is empty
            this.faqItems.forEach(item => {
                item.style.display = 'block';
            });
            return;
        }

        // Show only matching items
        this.faqItems.forEach(item => {
            const question = item.querySelector('.question-text').textContent.toLowerCase();
            const answer = item.querySelector('.faq-answer').textContent.toLowerCase();

            if (question.includes(searchTerm) || answer.includes(searchTerm)) {
                item.style.display = 'block';
                // Auto-open matching items
                item.classList.add('active');
            } else {
                item.style.display = 'none';
                item.classList.remove('active');
            }
        });

        // Show all categories when searching
        this.categoryGroups.forEach(group => {
            group.style.display = 'block';
        });

        // Hide category buttons during search
        const searchActive = searchTerm !== '';
        const categoriesContainer = document.querySelector('.faq-categories');
        if (searchActive) {
            // Optional: Add visual indicator that search is active
            document.querySelector('.faq-categories').classList.add('search-active');
        } else {
            document.querySelector('.faq-categories').classList.remove('search-active');
        }
    }

    setupAccessibility() {
        // Make questions keyboard accessible
        this.faqItems.forEach(item => {
            const question = item.querySelector('.faq-question');
            question.setAttribute('role', 'button');
            question.setAttribute('tabindex', '0');
            question.setAttribute('aria-expanded', 'false');
        });

        // Update aria-expanded when toggling
        const originalToggle = this.toggleFAQItem.bind(this);
        this.toggleFAQItem = function(item) {
            originalToggle(item);
            const question = item.querySelector('.faq-question');
            question.setAttribute('aria-expanded', item.classList.contains('active'));
        };

        // Category buttons accessibility
        this.categoryBtns.forEach(btn => {
            btn.setAttribute('role', 'tab');
            btn.setAttribute('aria-selected', btn.classList.contains('active'));
        });
    }
}

// Initialize FAQ Manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new FAQManager();

    // Theme toggling support (if theme.js is available)
    if (window.themeManager) {
        document.addEventListener('themechange', () => {
            // Refresh if needed
        });
    }

    // Smooth scroll behavior
    document.documentElement.style.scrollBehavior = 'smooth';
});

// Add some utility functions for analytics tracking (if Google Analytics is available)
function trackFAQInteraction(action, label) {
    if (typeof gtag !== 'undefined') {
        gtag('event', 'faq_interaction', {
            'event_category': 'engagement',
            'event_label': label,
            'value': action
        });
    }
}

// Track when user opens an FAQ item
document.addEventListener('click', (e) => {
    if (e.target.closest('.faq-question')) {
        const item = e.target.closest('.faq-item');
        const question = item.querySelector('.question-text').textContent;
        trackFAQInteraction('open', question);
    }
});

// Track category switches
document.addEventListener('click', (e) => {
    if (e.target.closest('.category-btn')) {
        const btn = e.target.closest('.category-btn');
        const category = btn.dataset.category;
        trackFAQInteraction('category_switch', category);
    }
});
