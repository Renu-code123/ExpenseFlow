// protect.js to restrict access to authenticated users only for frontend pages
// Uses Clerk authentication instead of localStorage token

(async function(){
    try {
        // Wait for Clerk to be available (loaded async)
        if (!window.Clerk) {
            // Clerk SDK hasn't loaded yet, wait for it
            await new Promise((resolve, reject) => {
                const maxWait = 10000;
                const interval = 100;
                let waited = 0;
                const check = setInterval(() => {
                    if (window.Clerk) {
                        clearInterval(check);
                        resolve();
                    }
                    waited += interval;
                    if (waited >= maxWait) {
                        clearInterval(check);
                        reject(new Error('Clerk SDK timeout'));
                    }
                }, interval);
            });
        }

        await window.Clerk.load();

        if (!window.Clerk.user) {
            // Not signed in — redirect to login
            sessionStorage.setItem('redirectAfterLogin', window.location.pathname + window.location.search);
            window.location.href = '/login.html';
        }
    } catch (err) {
        console.error('Auth check failed:', err);
        // Don't redirect on error to avoid loops — show page anyway
    }
})();