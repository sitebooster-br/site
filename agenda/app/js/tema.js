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
  try { window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", aplicar); } catch (e) {}
  window.Tema = {
    escolha: escolha,
    definir: function (v) { try { localStorage.setItem(CHAVE, v); } catch (e) {} aplicar(); }
  };
})();
