// Service Worker for Reports Page - Performance optimization
const CACHE_NAME = 'expenseflow-reports-v1';
const STATIC_CACHE = 'expenseflow-reports-static-v1';

// Files to cache for reports page
const STATIC_FILES = [
    '/reports-performance.html',
    '/reports-min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

// Install event
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => cache.addAll(STATIC_FILES))
            .then(() => self.skipWaiting())
    );
});

// Activate event
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== STATIC_CACHE && cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch event
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    // Cache first strategy for static assets
    if (event.request.url.includes('.css') ||
        event.request.url.includes('.js') ||
        event.request.url.includes('font-awesome') ||
        event.request.url.includes('fonts.googleapis.com')) {

        event.respondWith(
            caches.match(event.request)
                .then(response => {
                    if (response) return response;

                    return fetch(event.request)
                        .then(response => {
                            if (response.status === 200) {
                                const responseClone = response.clone();
                                caches.open(STATIC_CACHE)
                                    .then(cache => cache.put(event.request, responseClone));
                            }
                            return response;
                        });
                })
        );
    }
});