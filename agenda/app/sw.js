/* Service worker: deixa o app abrindo sem internet.
   IMPORTANTE: a cada versão nova publicada, aumente o número em VERSAO. */
var VERSAO = "booster-agenda-v1.1.0-a26";
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
  "manifest.webmanifest",
  "central.html",
  "js/central.js",
  "manifest-central.webmanifest"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSAO).then(function (c) { return c.addAll(ARQUIVOS.map(function (u) { return new Request(u, { cache: "reload" }); })); }).then(function () { return self.skipWaiting(); }));
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

// Avisos no celular (Central do dono): mostra a notificação e abre a Central ao tocar
self.addEventListener("push", function (e) {
  var d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { titulo: "Central Sitebooster", texto: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.titulo || "Central Sitebooster", {
    body: d.texto || "", icon: "icone-192.png", badge: "icone-192.png", tag: d.tag || undefined, renotify: !!d.tag,
    data: { url: d.url || "central.html" }
  }));
});
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var alvo = new URL((e.notification.data && e.notification.data.url) || "central.html", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (lista) {
    for (var i = 0; i < lista.length; i++) if (lista[i].url.indexOf("central.html") >= 0 && "focus" in lista[i]) { lista[i].navigate && lista[i].navigate(alvo); return lista[i].focus(); }
    return self.clients.openWindow(alvo);
  }));
});
