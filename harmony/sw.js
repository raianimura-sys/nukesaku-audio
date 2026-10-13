const CACHE='harmony-studio-v17';
const ASSETS=['./','./index.html','./style.css?v=2.3.1','./app.js?v=2.3.1','./music.js?v=2.3.1','./audio.js?v=2.3.1','./project.js?v=2.3.1','./storage.js?v=2.3.1','./pattern-browser.js?v=2.3.1','./recommendations.js?v=2.3.1','./composer.css?v=2.3.1','./sections.js?v=2.3.1','./composition.js?v=2.3.1','./section-generator.js?v=2.3.1','./icon.svg?v=2.3.1','./icon-180.png?v=2.3.1','./icon-192.png?v=2.3.1','./icon-512.png?v=2.3.1','./manifest.webmanifest?v=2.3.1'];
ASSETS.push('./motion.js?v=2.3.1','./motion.css?v=2.3.1');
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('harmony-studio-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const clone=r.clone();caches.open(CACHE).then(c=>c.put(e.request,clone));}return r;}).catch(()=>caches.match(e.request)));});
