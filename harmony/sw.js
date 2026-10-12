const CACHE_PREFIX='harmony:'+self.registration.scope+':';
const CACHE=CACHE_PREFIX+'v2.1.2-section-generator-1';
const ASSETS=['./','./index.html','./style.css?v=2.1.2','./app.js?v=2.1.2','./music.js?v=2.1.2','./audio.js?v=2.1.2','./project.js?v=2.1.2','./pattern-browser.js?v=2.1.2','./recommendations.js?v=2.1.2','./composer.css?v=2.1.2','./sections.js?v=2.1.2','./composition.js?v=2.1.2','./section-generator.js?v=2.1.2','./icon.svg?v=2.1.2','./icon-180.png?v=2.1.2','./icon-192.png?v=2.1.2','./icon-512.png?v=2.1.2','./manifest.webmanifest?v=2.1.2'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||!e.request.url.startsWith(self.registration.scope))return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const clone=r.clone();caches.open(CACHE).then(c=>c.put(e.request,clone));}return r;}).catch(()=>caches.match(e.request)));});
