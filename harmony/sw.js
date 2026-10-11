const CACHE_PREFIX='harmony:'+self.registration.scope+':';
const CACHE=CACHE_PREFIX+'v1.7.1-icon-1';
const ASSETS=['./','./index.html','./style.css?v=1.7.1','./app.js?v=1.7.1','./music.js?v=1.7.1','./audio.js?v=1.7.1','./project.js?v=1.7.1','./pattern-browser.js?v=1.7.1','./recommendations.js?v=1.7.1','./icon.svg?v=1.7.1','./icon-180.png?v=1.7.1','./icon-192.png?v=1.7.1','./icon-512.png?v=1.7.1','./manifest.webmanifest?v=1.7.1'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||!e.request.url.startsWith(self.registration.scope))return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const clone=r.clone();caches.open(CACHE).then(c=>c.put(e.request,clone));}return r;}).catch(()=>caches.match(e.request)));});
