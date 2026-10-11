const CACHE_PREFIX='harmony:'+self.registration.scope+':';
const CACHE=CACHE_PREFIX+'v1.5.0-composer-1';
const ASSETS=['./','./index.html','./style.css?v=1.5.0','./app.js?v=1.5.0','./music.js?v=1.5.0','./audio.js?v=1.5.0','./project.js?v=1.5.0','./pattern-browser.js?v=1.5.0','./recommendations.js?v=1.5.0','./icon.svg','./icon-180.png','./icon-192.png','./icon-512.png','./manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||!e.request.url.startsWith(self.registration.scope))return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const clone=r.clone();caches.open(CACHE).then(c=>c.put(e.request,clone));}return r;}).catch(()=>caches.match(e.request)));});
