/* Vivaah Ledger — Service Worker v2 */
var CACHE = 'vivaah-v2';
var ASSETS = ['/', '/index.html', '/manifest.json', '/icon-192.svg', '/icon-512.svg'];

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(ASSETS); }));
  self.skipWaiting();
});

self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));
  }));
  self.clients.claim();
});

self.addEventListener('fetch', function(e){
  /* Always go to network for Google APIs (auth/sheets) */
  if(e.request.url.includes('googleapis') || e.request.url.includes('google.com') || e.request.url.includes('gstatic.com')){
    e.respondWith(fetch(e.request));
    return;
  }
  /* Network-first for HTML — always get latest index.html */
  if(e.request.url.endsWith('.html') || e.request.url.endsWith('/')){
    e.respondWith(
      fetch(e.request).then(function(response){
        if(response.ok){
          var clone = response.clone();
          caches.open(CACHE).then(function(c){ c.put(e.request, clone); });
        }
        return response;
      }).catch(function(){
        return caches.match(e.request);
      })
    );
    return;
  }
  /* Cache-first for other assets (icons, manifest) */
  e.respondWith(
    caches.match(e.request).then(function(cached){
      return cached || fetch(e.request).then(function(response){
        if(response.ok && e.request.method==='GET'){
          var clone = response.clone();
          caches.open(CACHE).then(function(c){ c.put(e.request, clone); });
        }
        return response;
      });
    }).catch(function(){
      return caches.match('/index.html');
    })
  );
});
