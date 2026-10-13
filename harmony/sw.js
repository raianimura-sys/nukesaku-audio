const CACHE='harmony-studio-v16';
const ASSETS=['./','./index.html','./style.css?v=2.3.0','./app.js?v=2.3.0','./music.js?v=2.3.0','./audio.js?v=2.3.0','./project.js?v=2.3.0','./storage.js?v=2.3.0','./pattern-browser.js?v=2.3.0','./recommendations.js?v=2.3.0','./composer.css?v=2.3.0','./sections.js?v=2.3.0','./composition.js?v=2.3.0','./section-generator.js?v=2.3.0','./icon.svg?v=2.3.0','./icon-180.png?v=2.3.0','./icon-192.png?v=2.3.0','./icon-512.png?v=2.3.0','./manifest.webmanifest?v=2.3.0'];
ASSETS.push('./motion.js?v=2.3.0','./motion.css?v=2.3.0');
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('harmony-studio-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const clone=r.clone();caches.open(CACHE).then(c=>c.put(e.request,clone));}return r;}).catch(()=>caches.match(e.request)));});
