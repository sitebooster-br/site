/* Medição da Sitebooster (páginas de vendas).
   - Google Ads: tag AW (guarda o clique do anúncio para contar o cadastro feito no app).
   - Google Analytics 4 e Microsoft Clarity: ficam ligados quando você colocar o ID abaixo.
   - Guarda de onde a pessoa veio (utm/gclid) e repassa para o botão "Testar grátis",
     para o app registrar a origem de cada salão.
   Não coleta nome, e-mail nem telefone nesta página. */
(function () {
  var CFG = window.SB_MEDICAO = window.SB_MEDICAO || {
    ads: "AW-18574402849",   // Google Ads (conta 312-239-3256)
    ga4: "",                 // Google Analytics 4: cole aqui o ID "G-XXXXXXX" quando criar
    clarity: ""              // Microsoft Clarity: cole aqui o ID do projeto quando criar
  };

  /* ---------- 1. Origem da visita (utm / gclid) ---------- */
  var CHAVES = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "gbraid", "wbraid", "fbclid"];
  var qs = new URLSearchParams(location.search), origem = {};
  CHAVES.forEach(function (k) { var v = qs.get(k); if (v) origem[k] = v.slice(0, 120); });
  try {
    if (Object.keys(origem).length) {
      origem.chegou = new Date().toISOString();
      origem.pagina = location.pathname;
      localStorage.setItem("sb_origem", JSON.stringify(origem));   // vale para as próximas visitas também
    } else {
      origem = JSON.parse(localStorage.getItem("sb_origem") || "{}");
    }
  } catch (e) {}

  // Repassa a origem para os links de cadastro no app
  function marcarLinks() {
    document.querySelectorAll('a[href*="app/?criar=1"]').forEach(function (a) {
      try {
        var u = new URL(a.getAttribute("href"), location.href);
        CHAVES.forEach(function (k) { if (origem[k] && !u.searchParams.get(k)) u.searchParams.set(k, origem[k]); });
        a.setAttribute("href", u.pathname.replace(/^.*\/agenda\//, "") + u.search);
      } catch (e) {}
    });
  }

  /* ---------- 2. Google tag (Ads + GA4) ---------- */
  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;
  var idPrincipal = CFG.ga4 || CFG.ads;
  if (idPrincipal) {
    var s = document.createElement("script");
    s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + idPrincipal;
    document.head.appendChild(s);
    gtag("js", new Date());
    if (CFG.ads) gtag("config", CFG.ads);
    if (CFG.ga4) gtag("config", CFG.ga4);
  }

  /* ---------- 3. Microsoft Clarity (gravação de sessões e mapa de calor) ---------- */
  if (CFG.clarity) {
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1; t.src = "https://www.clarity.ms/tag/" + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, "clarity", "script", CFG.clarity);
    if (origem.utm_source) try { clarity("set", "origem", origem.utm_source); clarity("set", "termo", origem.utm_term || ""); } catch (e) {}
  }

  /* ---------- 4. Eventos da página ---------- */
  function evento(nome, dados) {
    dados = dados || {};
    try { gtag("event", nome, dados); } catch (e) {}
    try { if (window.clarity) clarity("event", nome); } catch (e) {}
  }
  window.sbEvento = evento;

  function textoDo(el) { return (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60); }
  function secaoDo(el) { var s = el.closest("section[id], header, footer, [id]"); return s ? (s.id || s.tagName.toLowerCase()) : ""; }

  document.addEventListener("click", function (e) {
    var a = e.target.closest("a, button, summary, details");
    if (!a) return;
    var href = a.getAttribute && a.getAttribute("href") || "";
    if (/app\/\?criar=1/.test(href)) evento("clique_testar_gratis", { texto: textoDo(a), secao: secaoDo(a) });
    else if (/^app\/?$/.test(href)) evento("clique_ja_tenho_conta", { secao: secaoDo(a) });
    else if (/kiwify/.test(href)) evento("clique_assinar", { texto: textoDo(a), secao: secaoDo(a) });
    else if (/wa\.me|whatsapp/.test(href)) evento("clique_whatsapp", { secao: secaoDo(a) });
    else if (/^mailto:/.test(href)) evento("clique_email", { secao: secaoDo(a) });
    else if (/^#/.test(href)) evento("clique_menu", { destino: href });
    else if (a.tagName === "SUMMARY" || a.closest("summary")) evento("abriu_duvida", { pergunta: textoDo(a) });
  }, true);

  // Até onde a pessoa rolou a página
  var marcos = [25, 50, 75, 90, 100], feitos = {};
  function rolagem() {
    var h = document.documentElement, pct = Math.round((h.scrollTop + innerHeight) / h.scrollHeight * 100);
    marcos.forEach(function (m) { if (pct >= m && !feitos[m]) { feitos[m] = 1; evento("rolou_" + m); } });
  }
  addEventListener("scroll", rolagem, { passive: true });

  // Quais partes da página a pessoa viu
  if ("IntersectionObserver" in window) {
    var vistas = {};
    var obs = new IntersectionObserver(function (itens) {
      itens.forEach(function (it) {
        var id = it.target.id;
        if (it.isIntersecting && id && !vistas[id]) { vistas[id] = 1; evento("viu_secao", { secao: id }); }
      });
    }, { threshold: 0.4 });
    document.querySelectorAll("section[id]").forEach(function (s) { obs.observe(s); });
  }

  // Usou a calculadora de faltas
  var calcUsada = false;
  ["faltas", "ticket"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("change", function () { if (!calcUsada) { calcUsada = true; evento("usou_calculadora"); } });
  });

  // Tempo na página
  var inicio = Date.now(), tempos = [15, 30, 60, 120, 300], tempoFeito = {};
  setInterval(function () {
    var s = (Date.now() - inicio) / 1000;
    tempos.forEach(function (t) { if (s >= t && !tempoFeito[t] && document.visibilityState === "visible") { tempoFeito[t] = 1; evento("ficou_" + t + "s"); } });
  }, 5000);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", marcarLinks); else marcarLinks();
})();
