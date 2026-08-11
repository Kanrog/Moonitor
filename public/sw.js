// A minimal service worker to satisfy PWA installation requirements
self.addEventListener('fetch', function(event) {
    // We intentionally leave this blank so it bypasses the service worker 
    // and fetches directly from your local network.
});