const CACHE_NAME='meghalaya-together-v1';
const FILES=['./','./index.html','./cloud.js','./config.js','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(Promise.all([caches.keys().then(names=>Promise.all(names.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))),self.clients.claim()]));
});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);
 // Cache the public Supabase JavaScript SDK so the HTML remains usable offline.
 // NEVER cache responses from the Supabase API (which contain private trip data).
 if(url.origin!==self.location.origin && url.hostname!=='cdn.jsdelivr.net')return;
 if(event.request.mode==='navigate'){
  event.respondWith(fetch(event.request).then(r=>{const copy=r.clone();caches.open(CACHE_NAME).then(c=>c.put('./index.html',copy));return r}).catch(()=>caches.match('./index.html')));
  return;
 }
 event.respondWith(caches.match(event.request).then(cached=>{
  const fresh=fetch(event.request).then(r=>{if(r.ok||r.type==='opaque'){const clone=r.clone();caches.open(CACHE_NAME).then(c=>c.put(event.request,clone))}return r}).catch(()=>cached);
  return cached||fresh;
 }));
});
