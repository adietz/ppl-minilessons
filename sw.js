/* Offline cache: app shell + content, cache-first, refreshed in the background. */
const CACHE = 'pilot-minis-v3';
const ASSETS = ['./','./index.html','./styles.css','./app.js','./data.js','./manifest.webmanifest',
  './icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-512-maskable.png',
  './img/fig3-lift.svg',
  './img/fig4-forces.svg',
  './img/fig5-turn.svg',
  './img/fig6-stall.svg',
  './img/fig7-axes.svg',
  './img/fig9-da.svg',
  './img/fig11-wb.svg',
  './img/fig14-pitot.svg',
  './img/fig16a-asi.svg',
  './img/fig16b-alt.svg',
  './img/fig16c-vsi.svg',
  './img/fig17a-ai.svg',
  './img/fig17b-tc.svg',
  './img/fig17c-hi.svg',
  './img/fig17d-compass.svg',
  './img/fig18a-tach.svg',
  './img/fig18b-mp.svg',
  './img/fig18c-oil.svg',
  './img/fig18d-egt.svg',
  './img/fig19a-fuel.svg',
  './img/fig19b-elec.svg',
  './img/fig19c-suction.svg',
  './img/fig19d-clockflap.svg',
  './img/fig20-pattern.svg',
  './img/fig21a-runway.svg',
  './img/fig21b-ends.svg',
  './img/fig22a-intersection.svg',
  './img/fig22b-signs.svg',
  './img/fig23-airspace.svg',
  './img/fig24-clouds.svg',
  './img/fig26-chart.svg',
  './img/fig27-plotter.svg',
  './img/fig29-hl.svg',
  './img/fig30a-stability.svg',
  './img/fig30b-front.svg',
  './img/fig31-tstorm.svg',
  './img/fig43-tfr.svg',
  './img/fig44-route.svg'];
self.addEventListener('install', e=>{ e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS.map(u=>new Request(u,{cache:'reload'})))).then(()=>self.skipWaiting())); });
self.addEventListener('activate', e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch', e=>{
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, {ignoreSearch:true}).then(hit=>{
    const net = fetch(e.request).then(res=>{ if (res && res.ok && new URL(e.request.url).origin === location.origin){ const cp=res.clone(); caches.open(CACHE).then(c=>c.put(e.request, cp)); } return res; }).catch(()=>hit);
    return hit || net;
  }));
});
