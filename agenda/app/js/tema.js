/* Tema claro / escuro / automático (segue o aparelho). Carregado no <head> para não piscar.
   A escolha fica salva só neste aparelho. */
(function () {
  var CHAVE = "bs-tema";
  function escolha() { try { return localStorage.getItem(CHAVE) || "auto"; } catch (e) { return "auto"; } }
  function aplicar() {
    var p = escolha(), claro;
    try { claro = window.matchMedia("(prefers-color-scheme: light)").matches; } catch (e) { claro = false; }
    var tema = p === "auto" ? (claro ? "claro" : "escuro") : p;
    document.documentElement.setAttribute("data-tema", tema);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", tema === "claro" ? "#f3f6fb" : "#06142b");
  }
  aplicar();
  // Estilo de cor do salão (dourado, rosé, lilás). Vem do salão; guardado aqui só para não piscar ao abrir.
  var CORES = ["dourado", "rose", "lilas"];
  function aplicarCor(c) {
    if (CORES.indexOf(c) < 0) c = "dourado";
    if (c === "dourado") document.documentElement.removeAttribute("data-cor"); else document.documentElement.setAttribute("data-cor", c);
  }
  try { if (!/marcar\.html/.test(location.pathname)) aplicarCor(localStorage.getItem("bs-cor") || "dourado"); } catch (e) {}
  try { window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", aplicar); } catch (e) {}
  window.Tema = {
    escolha: escolha,
    definir: function (v) { try { localStorage.setItem(CHAVE, v); } catch (e) {} aplicar(); },
    cor: function (c, guardar) { aplicarCor(c); if (guardar !== false) { try { localStorage.setItem("bs-cor", c || "dourado"); } catch (e) {} } }
  };
})();
