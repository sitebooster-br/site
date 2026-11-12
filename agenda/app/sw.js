/* Service worker: deixa o app abrindo sem internet.
   IMPORTANTE: a cada versão nova publicada, aumente o número em VERSAO. */
var VERSAO = "booster-agenda-v1.1.0-a8";
var ARQUIVOS = [
  "./",
  "index.html",
  "marcar.html",
  "termos.html",
  "privacidade.html",
  "css/legal.css",
  "css/app.css",
  "css/agenda.css",
  "css/marcar.css",
  "js/config.js",
  "js/vendor/firebase.js",
  "js/util.js",
  "js/icones.js",
  "js/nuvem.js",
  "js/backup.js",
  "js/app.js",
  "js/tema.js",
  "js/vendor/qrcode.js",
  "js/marcar.js",
  "icone.svg",
  "icone-192.png",
  "icone-512.png",
  "manifest.webmanifest"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSAO).then(function (c) { return c.addAll(ARQUIVOS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (nomes) {
    return Promise.all(nomes.filter(function (n) { return n !== VERSAO; }).map(function (n) { return caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});

// Só cuida dos arquivos do próprio app e das fontes do Google.
// O banco (Firebase) passa direto: ele tem a própria cópia offline.
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  var fonte = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (url.origin !== location.origin && !fonte) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (r) {
    if (r) return r;
    return fetch(e.request).then(function (resp) {
      if (resp && resp.ok && fonte) { var copia = resp.clone(); caches.open(VERSAO).then(function (c) { c.put(e.request, copia); }); }
      return resp;
    }).catch(function () { if (e.request.mode === "navigate") return caches.match("index.html"); });
  }));
});
