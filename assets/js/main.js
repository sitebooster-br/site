/* Sitebooster — interações (JavaScript puro, sem bibliotecas) */
(function () {
  "use strict";
  var doc = document.documentElement;
  doc.classList.remove("no-js");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var cfg = window.SITE_CONFIG || {};

  /* 1. Aplica a configuração (checkout, preço, Instagram) */
  if (cfg.checkoutUrl) {
    document.querySelectorAll("[data-checkout]").forEach(function (a) { a.href = cfg.checkoutUrl; });
  }
  if (cfg.price) {
    document.querySelectorAll("[data-price]").forEach(function (el) { el.textContent = cfg.price; });
  }
  if (cfg.instagram) {
    document.querySelectorAll("[data-instagram]").forEach(function (a) {
      a.href = "https://instagram.com/" + cfg.instagram;
      var t = a.querySelector("[data-instagram-handle]");
      if (t) t.textContent = "@" + cfg.instagram;
    });
  }
  if (cfg.guaranteeDays) {
    document.querySelectorAll("[data-guarantee]").forEach(function (el) { el.textContent = cfg.guaranteeDays; });
  }

  /* 2. Header com fundo ao rolar */
  var header = document.querySelector(".header");
  function onScroll() {
    if (header) header.classList.toggle("is-scrolled", window.scrollY > 10);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* 3. Menu do celular */
  var menuBtn = document.querySelector(".menu-btn");
  var nav = document.getElementById("nav");
  if (menuBtn && nav) {
    var setMenu = function (open) {
      nav.classList.toggle("is-open", open);
      menuBtn.setAttribute("aria-expanded", String(open));
      menuBtn.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
    };
    menuBtn.addEventListener("click", function () { setMenu(!nav.classList.contains("is-open")); });
    nav.addEventListener("click", function (e) { if (e.target.closest("a")) setMenu(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { setMenu(false); } });
  }

  /* 4. Elementos que surgem ao rolar */
  var revealEls = document.querySelectorAll("[data-reveal]");
  if (!reduce && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("is-in"); });
  }

  /* 5. Spotlight seguindo o mouse nos cards */
  if (window.matchMedia("(hover: hover)").matches) {
    document.addEventListener("pointermove", function (e) {
      var card = e.target.closest && e.target.closest(".card");
      if (!card) return;
      var r = card.getBoundingClientRect();
      card.style.setProperty("--mx", (e.clientX - r.left) + "px");
      card.style.setProperty("--my", (e.clientY - r.top) + "px");
    }, { passive: true });
  }

  /* 6. Mockup com parallax leve (inclina com o mouse) */
  var mock = document.querySelector(".mock");
  var mockWrap = document.querySelector(".mock-wrap");
  if (mock && mockWrap && !reduce && window.matchMedia("(hover: hover) and (min-width: 961px)").matches) {
    var raf = null;
    window.addEventListener("pointermove", function (e) {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = null;
        var x = e.clientX / window.innerWidth - 0.5;
        var y = e.clientY / window.innerHeight - 0.5;
        mock.style.setProperty("--ry", (-10 + x * 10).toFixed(2) + "deg");
        mock.style.setProperty("--rx", (6 - y * 8).toFixed(2) + "deg");
      });
    }, { passive: true });
  }

  /* 7. Mockup "vivo": simula itens entrando no caixa */
  var list = document.querySelector("[data-mock-items]");
  var totalEl = document.querySelector("[data-mock-total]");
  if (list && totalEl && !reduce) {
    var demo = [
      ["Água mineral 500ml", 3.5],
      ["Salgado assado", 7.0],
      ["Refrigerante lata", 6.0],
      ["Chocolate 90g", 8.9]
    ];
    var base = Array.prototype.slice.call(list.children);
    var i = 0;
    var brl = function (v) { return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    var baseTotal = parseFloat(totalEl.getAttribute("data-mock-total")) || 0;
    setInterval(function () {
      if (document.hidden) return;
      if (i >= demo.length) {
        list.innerHTML = "";
        base.forEach(function (n) { list.appendChild(n); });
        i = 0; totalEl.textContent = "R$ " + brl(baseTotal); totalEl.dataset.v = baseTotal;
        return;
      }
      var d = demo[i++];
      var row = document.createElement("div");
      row.className = "mock__item is-new";
      row.innerHTML = "<span></span><span>1x</span><b></b>";
      row.children[0].textContent = d[0];
      row.children[2].textContent = brl(d[1]);
      list.appendChild(row);
      if (list.children.length > 4) list.removeChild(list.children[0]);
      var t = (parseFloat(totalEl.dataset.v) || baseTotal) + d[1];
      totalEl.dataset.v = t;
      totalEl.textContent = "R$ " + brl(t);
    }, 2200);
  }

  /* 8. Calculadora "custo de não agir" (números do próprio visitante) */
  var range = document.getElementById("perda");
  if (range) {
    var out = {
      dia: document.querySelector("[data-calc='dia']"),
      mes: document.querySelector("[data-calc='mes']"),
      ano: document.querySelector("[data-calc='ano']"),
      pdv: document.querySelector("[data-calc='pdv']")
    };
    var priceNum = parseFloat(String(cfg.price || "49,90").replace(/\./g, "").replace(",", ".")) || 49.9;
    var fmt = function (v) { return "R$ " + Math.round(v).toLocaleString("pt-BR"); };
    var calc = function () {
      var v = parseInt(range.value, 10);
      var mes = v * 26; // 26 dias de trabalho no mês
      out.dia.textContent = "R$ " + v;
      out.mes.textContent = fmt(mes);
      out.ano.textContent = fmt(mes * 12);
      var dias = Math.max(1, Math.ceil(priceNum / v));
      out.pdv.textContent = dias === 1 ? "1 dia" : dias + " dias";
      range.setAttribute("aria-valuetext", "R$ " + v + " por dia");
    };
    range.addEventListener("input", calc);
    calc();
  }

  /* 9. Barra de compra fixa no celular (aparece depois do topo) */
  var buybar = document.querySelector(".buybar");
  var hero = document.querySelector(".hero");
  var offer = document.getElementById("oferta");
  if (buybar && hero && "IntersectionObserver" in window) {
    document.body.classList.add("has-buybar");
    var heroVisible = true, offerVisible = false;
    var upd = function () { buybar.classList.toggle("is-on", !heroVisible && !offerVisible); };
    new IntersectionObserver(function (e) { heroVisible = e[0].isIntersecting; upd(); }).observe(hero);
    if (offer) new IntersectionObserver(function (e) { offerVisible = e[0].isIntersecting; upd(); }).observe(offer);
  }

  /* 10. Ano atual no rodapé */
  document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
