const cacheName='salao-v14';
const shell=['/','/index.html','/apoie.html','/app.js','/art.js','/style.css','/castle.jpg','/fonts/cinzel.ttf','/fonts/dm-sans.ttf','/cards.json','/portraits.json'];
self.addEventListener('install',e=>e.waitUntil((async()=>{
 const cache=await caches.open(cacheName);
 await cache.addAll(shell);
 const portraits=await (await cache.match('/portraits.json')).json();
 const urls=Object.values(portraits).map(p=>p.url).filter(url=>url.startsWith('/portraits/'));
 for(let index=0;index<urls.length;index+=12){
  await cache.addAll(urls.slice(index,index+12));
 }
 await self.skipWaiting();
})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{
 const keys=await caches.keys();
 await Promise.all(keys.filter(key=>key.startsWith('salao-')&&key!==cacheName).map(key=>caches.delete(key)));
 await self.clients.claim();
})()));
self.addEventListener('fetch',e=>{
 if(e.request.method==='GET'&&new URL(e.request.url).origin===location.origin){
  e.respondWith(caches.open(cacheName).then(async cache=>(await cache.match(e.request))||fetch(e.request)));
 }
});
