/* Backup automático em uma pasta do computador + backup manual.
   - Automático: o cliente escolhe uma pasta uma vez. A cada alteração (com
     alguns segundos de espera) o sistema grava "<id>-backup-AAAA-MM-DD.json"
     nessa pasta. Fica um arquivo por dia (histórico).
   - Manual: baixar o arquivo e restaurar a partir de um arquivo.
   Precisa de Chrome ou Edge (File System Access API). */
window.Backup = (function () {
  "use strict";
  var suportaPasta = "showDirectoryPicker" in window;
  var timer = null;
  var estado = { pasta: null, nomePasta: "", ativo: false, ultimo: null, erro: "" };

  function avisar() { document.dispatchEvent(new CustomEvent("backup-status", { detail: estado })); }

  function hoje() { return new Date().toISOString().slice(0, 10); }
  function nomeArquivo() { return APP.id + "-backup-" + hoje() + ".json"; }

  async function permissao(handle, pedir) {
    var opts = { mode: "readwrite" };
    if ((await handle.queryPermission(opts)) === "granted") return true;
    if (pedir && (await handle.requestPermission(opts)) === "granted") return true;
    return false;
  }

  async function iniciar() {
    estado.ultimo = await DB.getConfig("ultimoBackup");
    if (suportaPasta) {
      var h = await DB.getConfig("pastaBackup");
      if (h) {
        estado.pasta = h; estado.nomePasta = h.name;
        // Depois de reabrir o navegador, o Chrome pode pedir para confirmar a pasta de novo (precisa de um clique).
        estado.ativo = await permissao(h, false);
      }
    }
    avisar();
    document.addEventListener("dados-alterados", agendar);
  }

  // Sistemas com banco na nuvem: cada backup lê todos os dados do servidor,
  // então o automático roda no máximo a cada APP.backupIntervaloMin minutos.
  function agendar() {
    if (!estado.pasta) return;
    clearTimeout(timer);
    var espera = 3000;
    var minimo = (APP.backupIntervaloMin || 0) * 60000;
    if (minimo && estado.ultimo) {
      var falta = new Date(estado.ultimo).getTime() + minimo - Date.now();
      if (falta > espera) espera = falta;
    }
    timer = setTimeout(salvarNaPasta, espera);
  }

  async function salvarNaPasta() {
    if (!estado.pasta) return false;
    try {
      if (!(await permissao(estado.pasta, false))) { estado.ativo = false; avisar(); return false; }
      var dados = await DB.exportar();
      var arq = await estado.pasta.getFileHandle(nomeArquivo(), { create: true });
      var w = await arq.createWritable();
      await w.write(JSON.stringify(dados));
      await w.close();
      estado.ativo = true; estado.erro = ""; estado.ultimo = new Date().toISOString();
      await DB.setConfig("ultimoBackup", estado.ultimo);
      avisar();
      return true;
    } catch (e) {
      estado.erro = "Não foi possível salvar o backup na pasta. Escolha a pasta de novo.";
      avisar();
      return false;
    }
  }

  return {
    suportaPasta: suportaPasta,
    estado: function () { return estado; },
    iniciar: iniciar,

    // Chamar a partir de um clique do usuário
    escolherPasta: async function () {
      var h = await window.showDirectoryPicker({ id: APP.id + "-backup", mode: "readwrite" });
      await DB.setConfig("pastaBackup", h);
      estado.pasta = h; estado.nomePasta = h.name; estado.ativo = true;
      return salvarNaPasta();
    },
    // Chamar a partir de um clique, quando o navegador pedir para reativar
    reativar: async function () {
      if (!estado.pasta) return false;
      estado.ativo = await permissao(estado.pasta, true);
      avisar();
      return estado.ativo ? salvarNaPasta() : false;
    },
    salvarAgora: salvarNaPasta,

    baixar: async function () {
      var dados = await DB.exportar();
      var blob = new Blob([JSON.stringify(dados, null, 1)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = nomeArquivo();
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    },
    restaurar: async function (arquivo) {
      var texto = await arquivo.text();
      var dados;
      try { dados = JSON.parse(texto); } catch (e) { throw new Error("Arquivo inválido ou corrompido."); }
      await DB.importar(dados);
    }
  };
})();
