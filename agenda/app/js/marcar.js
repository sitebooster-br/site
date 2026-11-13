/* Página pública: o cliente final escolhe serviço, profissional, dia e horário livre e marca. Não precisa de login. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = U.esc;
  var app = FB.initializeApp(APP.firebase, "publico");
  var db = FB.initializeFirestore(app, { localCache: FB.memoryLocalCache() });

  var slug = U.slugify(new URLSearchParams(location.search).get("s") || "");
  var pag = null;
  var esc_ = { servico: null, prof: null, dia: null, hora: null, livresPorHora: {} };
  var el = $("#pagina");

  function cabecalho() {
    return '<header class="pub__cab"><div class="pub__avatar" aria-hidden="true">' + esc((pag.nome || "?").trim().charAt(0).toUpperCase()) + "</div>" +
      "<div><h1>" + esc(pag.nome) + "</h1>" +
      (pag.endereco ? '<p class="sub">' + esc(pag.endereco) + "</p>" : "") + "</div></header>" +
      (pag.recado ? '<p class="pub__recado">' + esc(pag.recado) + "</p>" : "");
  }
  function botaoZap(texto, rotulo) {
    return '<a class="btn btn--zap btn--bloco" href="' + U.linkZap(pag.whatsapp, texto) + '" target="_blank" rel="noopener">' + Icone("whatsapp") + esc(rotulo || "Chamar no WhatsApp") + "</a>";
  }
  function erroTela(titulo, texto, zap) {
    el.innerHTML = (pag ? cabecalho() : "") + '<section class="pub__caixa pub__caixa--centro"><h2>' + esc(titulo) + "</h2><p>" + esc(texto) + "</p>" +
      (zap && pag && pag.whatsapp ? botaoZap("Olá! Gostaria de marcar um horário.") : "") + "</section>";
  }

  function diaAberto(iso) {
    var h = (pag.horarios || {})[U.diaSemana(iso)];
    if (!h || !h.ativo) return false;
    return !(pag.bloqueios || []).some(function (b) { return b.data === iso && b.diaInteiro; });
  }
  // Profissionais que fazem o serviço (lista vazia = faz todos)
  function profsDoServico(sid) {
    return (pag.profissionais || []).filter(function (p) { return !p.servicos || !p.servicos.length || p.servicos.indexOf(sid) !== -1; });
  }
  // Tempo do serviço com aquele profissional (cada um pode ter o seu)
  function durDe(pid, serv) {
    var p = (pag.profissionais || []).find(function (x) { return x.id === pid; });
    return Number((p && p.duracoes && p.duracoes[serv.id]) || serv.duracao) || 30;
  }
  function folga() { return Number(pag.intervalo) || 0; }
  function profNome(id) { var p = (pag.profissionais || []).find(function (x) { return x.id === id; }); return p ? p.nome : ""; }

  var naPrincipal = false;
  function desenhar() {
    naPrincipal = true;
    var servs = (pag.servicos || []).filter(function (s) { return profsDoServico(s.id).length; });
    var hoje = U.hojeISO(), dias = [];
    for (var i = 0; i <= (pag.diasAFrente || 30); i++) { var d = U.somaDias(hoje, i); if (diaAberto(d)) dias.push(d); }
    var n = 1;

    el.innerHTML = cabecalho() + minhasReservasHTML() +
      '<p class="pub__passos">Escolha o serviço' + ((pag.profissionais || []).length > 1 ? ", o profissional" : "") + ", o dia e o horário. Depois é só colocar seu nome e WhatsApp.</p>" +
      '<section class="pub__passo"><h2><span class="num">' + (n++) + '</span>Escolha o serviço</h2><div class="servs" role="radiogroup" aria-label="Serviço">' +
      servs.map(function (s) {
        return '<button class="serv" role="radio" aria-checked="false" data-serv="' + esc(s.id) + '"><span class="serv__nome">' + esc(s.nome) + "</span>" +
          '<span class="serv__info">' + Icone("relogio") + U.duracaoTexto(s.duracao) + (s.mostrarPreco ? " · " + U.brl(s.preco) : "") + "</span></button>";
      }).join("") + "</div></section>" +
      '<section class="pub__passo" id="passoProf" hidden><h2><span class="num">' + (n++) + '</span>Com quem?</h2><div class="servs" id="profs" role="radiogroup" aria-label="Profissional"></div></section>' +
      '<section class="pub__passo" id="passoDia" hidden><h2><span class="num" id="numDia"></span>Escolha o dia</h2>' +
      (dias.length ? '<div class="dias-pub" role="radiogroup" aria-label="Dia">' + dias.map(function (d) {
        var dt = U.dataDe(d);
        return '<button class="dia-pub" role="radio" aria-checked="false" data-dia="' + d + '"><span>' + (d === hoje ? "Hoje" : d === U.somaDias(hoje, 1) ? "Amanhã" : U.DIAS_C[dt.getDay()]) + "</span><b>" + dt.getDate() + "</b><small>" + U.MESES[dt.getMonth()].slice(0, 3) + "</small></button>";
      }).join("") + "</div>" : "<p>Sem dias disponíveis no momento.</p>") + "</section>" +
      '<section class="pub__passo" id="passoHora" hidden><h2><span class="num" id="numHora"></span>Escolha o horário</h2><div id="horas"></div></section>' +
      '<section class="pub__passo" id="passoDados" hidden><h2><span class="num" id="numDados"></span>Seus dados</h2>' +
      '<form id="formDados" novalidate><div class="pub__resumo" id="resumo"></div>' +
      '<label for="cNome">Seu nome e sobrenome</label><input id="cNome" autocomplete="name" required maxlength="80" placeholder="Ex.: Maria Souza">' +
      '<label for="cZap">Seu WhatsApp (com DDD)</label><input id="cZap" type="tel" inputmode="tel" autocomplete="tel" required maxlength="20" placeholder="(11) 98765-4321">' +
      '<label for="cObs">Observação <span class="opc">(opcional)</span></label><input id="cObs" maxlength="300">' +
      '<label class="check pub__aceita"><input type="checkbox" id="cAceita"> Quero receber pelo WhatsApp avisos de horários livres e novidades deste salão</label>' +
      '<p class="erro" id="dErro" role="alert"></p><button class="btn btn--pri btn--bloco" type="submit" id="btnMarcar">Confirmar agendamento</button></form></section>' +
      (pag.whatsapp ? '<p class="pub__duvida">Dúvidas? <a href="' + U.linkZap(pag.whatsapp, "Olá! Tenho uma dúvida sobre os horários.") + '" target="_blank" rel="noopener">Chame no WhatsApp</a></p>' : "");

    function numerar() {
      var k = 2 + ($("#passoProf").hidden ? 0 : 1);
      $("#numDia").textContent = k; $("#numHora").textContent = k + 1; $("#numDados").textContent = k + 2;
    }

    el.onclick = function (e) {
      var b = e.target.closest("button"); if (!b) return;
      if (b.dataset.serv) {
        esc_.servico = servs.find(function (s) { return s.id === b.dataset.serv; }); esc_.hora = null; esc_.prof = null;
        marcarGrupo(b); $("#passoDados").hidden = true; $("#passoHora").hidden = true;
        var ps = profsDoServico(esc_.servico.id);
        if (ps.length > 1) {
          $("#profs").innerHTML = '<button class="serv" role="radio" aria-checked="false" data-prof="*"><span class="serv__nome">Qualquer um disponível</span><span class="serv__info">mais horários</span></button>' +
            ps.slice().sort(function (a, b) { return (b.id === ultimoProf()) - (a.id === ultimoProf()); }).map(function (p) {
              return '<button class="serv" role="radio" aria-checked="false" data-prof="' + esc(p.id) + '"><span class="serv__nome">' + esc(p.nome) + "</span>" +
                (p.id === ultimoProf() ? '<span class="serv__info serv__pref">Seu último atendimento</span>' : "") + "</button>";
            }).join("");
          $("#passoProf").hidden = false; $("#passoDia").hidden = true;
          numerar();
          $("#passoProf").scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
          esc_.prof = ps[0] ? ps[0].id : "*";
          $("#passoProf").hidden = true; $("#passoDia").hidden = false; numerar();
          if (esc_.dia) carregarHoras(); else $("#passoDia").scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
      if (b.dataset.prof) {
        esc_.prof = b.dataset.prof; esc_.hora = null; marcarGrupo(b);
        $("#passoDia").hidden = false; $("#passoDados").hidden = true; numerar();
        if (esc_.dia) carregarHoras(); else $("#passoDia").scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (b.dataset.dia) { esc_.dia = b.dataset.dia; esc_.hora = null; marcarGrupo(b); $("#passoDados").hidden = true; carregarHoras(); }
      if (b.dataset.hora) {
        esc_.hora = b.dataset.hora; marcarGrupo(b);
        var quem = esc_.prof === "*" ? esc_.livresPorHora[esc_.hora][0] : esc_.prof;
        $("#resumo").innerHTML = "<b>" + esc(esc_.servico.nome) + "</b><span>" + esc(U.dataLonga(esc_.dia)) + " às " + esc_.hora + ((pag.profissionais || []).length > 1 ? " · com " + esc(profNome(quem)) : "") + "</span>";
        $("#passoDados").hidden = false; $("#passoDados").scrollIntoView({ behavior: "smooth", block: "start" }); $("#cNome").focus({ preventScroll: true });
      }
    };
    $("#formDados").onsubmit = marcar;
    try { var salvo = JSON.parse(localStorage.getItem("ba-cliente") || "null"); if (salvo) { $("#cNome").value = salvo.nome || ""; $("#cZap").value = salvo.zap || ""; } } catch (e) {}
  }

  // Lembra (só neste aparelho) com quem o cliente marcou da última vez neste salão
  function ultimoProf() { try { return localStorage.getItem("ba-prof-" + slug) || ""; } catch (e) { return ""; } }
  function vence(iso, dias) { return FB.Timestamp.fromMillis(new Date(iso + "T12:00:00").getTime() + dias * 864e5); }
  function marcarGrupo(b) { b.parentNode.querySelectorAll("[role=radio]").forEach(function (x) { x.setAttribute("aria-checked", x === b ? "true" : "false"); }); }

  async function carregarHoras() {
    var box = $("#horas");
    $("#passoHora").hidden = false;
    box.innerHTML = '<p class="sub">Buscando horários livres...</p>';
    try {
      var snap = await FB.getDocs(FB.query(FB.collection(db, "paginas", slug, "ocupados"), FB.where("data", "==", esc_.dia)));
      var ocupados = new Set(snap.docs.map(function (d) { return d.id; }));
      var candidatos = esc_.prof === "*" ? profsDoServico(esc_.servico.id).map(function (p) { return p.id; }) : [esc_.prof];
      var porHora = {};
      candidatos.forEach(function (pid) {
        U.horariosLivres({
          data: esc_.dia, duracao: durDe(pid, esc_.servico), folga: folga(), horario: pag.horarios[U.diaSemana(esc_.dia)], profId: pid,
          ocupados: ocupados, bloqueios: pag.bloqueios, antecedenciaHoras: pag.antecedenciaHoras
        }).forEach(function (h) { (porHora[h] = porHora[h] || []).push(pid); });
      });
      esc_.livresPorHora = porHora;
      var livres = Object.keys(porHora).sort();
      box.innerHTML = livres.length
        ? '<div class="horas" role="radiogroup" aria-label="Horário">' + livres.map(function (h) { return '<button class="hora" role="radio" aria-checked="false" data-hora="' + h + '">' + h + "</button>"; }).join("") + "</div>"
        : '<p class="pub__sem">Nenhum horário livre neste dia. Escolha outro dia' + (esc_.prof !== "*" && profsDoServico(esc_.servico.id).length > 1 ? " ou outro profissional" : "") + ".</p>";
      $("#passoHora").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      console.error(e);
      box.innerHTML = '<p class="erro">Não foi possível buscar os horários. Confira a internet e tente de novo.</p>';
    }
  }

  async function marcar(e) {
    e.preventDefault();
    var nome = $("#cNome").value.trim(), zap = $("#cZap").value.trim(), obs = $("#cObs").value.trim();
    if (!/^\S+(\s+\S+)+$/.test(nome)) { $("#dErro").textContent = "Digite o seu nome e sobrenome (ex.: Maria Souza)."; $("#cNome").focus(); return; }
    if (U.soDigitos(zap).length < 10 || U.soDigitos(zap).length > 13) { $("#dErro").textContent = "Digite o WhatsApp com DDD. Ex.: (11) 98765-4321"; $("#cZap").focus(); return; }
    if (!esc_.servico || !esc_.dia || !esc_.hora) { $("#dErro").textContent = "Escolha o serviço, o dia e o horário."; return; }
    $("#dErro").textContent = "";
    var btn = $("#btnMarcar"); btn.disabled = true; btn.textContent = "Marcando...";

    var s = esc_.servico;
    var aceita = !!($("#cAceita") && $("#cAceita").checked);
    var tentativas = esc_.prof === "*" ? (esc_.livresPorHora[esc_.hora] || []).slice() : [esc_.prof];
    // "Qualquer um": tenta primeiro quem atendeu da última vez
    tentativas.sort(function (a, b) { return (b === ultimoProf()) - (a === ultimoProf()); });
    for (var i = 0; i < tentativas.length; i++) {
      var pid = tentativas[i];
      var ref = FB.doc(FB.collection(db, "saloes", pag.salaoId, "agendamentos"));
      var fim = U.hhmm(U.min(esc_.hora) + durDe(pid, s));
      var slots = U.slots(esc_.dia, esc_.hora, U.hhmm(Math.min(U.min(fim) + folga(), 24 * 60 - 1)), pid);
      var tk = U.codigo(22);
      var ag = {
        data: esc_.dia, inicio: esc_.hora, fim: fim, servicoId: s.id, servicoNome: s.nome, preco: Number(s.preco) || 0,
        profId: pid, profNome: profNome(pid),
        clienteNome: nome, clienteWhats: zap, status: "marcado", origem: "online", obs: obs, slots: slots, slug: slug, criadoEm: new Date().toISOString(),
        apagarEm: vence(esc_.dia, 367), tk: tk, aceitaNovidades: aceita
      };
      var b = FB.writeBatch(db);
      b.set(ref, ag);
      // Comprovante público (sem dados pessoais além do primeiro nome) para confirmar ou desmarcar depois
      b.set(FB.doc(db, "paginas", slug, "reservas", tk), { ag: ref.id, data: esc_.dia, inicio: esc_.hora, fim: fim, servicoNome: s.nome, profNome: profNome(pid), nome: nome.split(" ")[0].slice(0, 30), status: "marcado", slots: slots, apagarEm: vence(esc_.dia, 2) });
      slots.forEach(function (sl) { b.set(FB.doc(db, "paginas", slug, "ocupados", sl), { ag: ref.id, data: esc_.dia, profId: pid, apagarEm: vence(esc_.dia, 2) }); });
      try {
        await b.commit();
        try { localStorage.setItem("ba-cliente", JSON.stringify({ nome: nome, zap: zap })); localStorage.setItem("ba-prof-" + slug, pid); } catch (x) {}
        guardarReserva(tk, ag);
        return sucesso(ag, tk);
      } catch (err) {
        console.error(err);
        if (err.code !== "permission-denied") {
          btn.disabled = false; btn.textContent = "Confirmar agendamento";
          $("#dErro").textContent = "Não foi possível marcar agora. Confira a internet e tente de novo.";
          return;
        }
      }
    }
    btn.disabled = false; btn.textContent = "Confirmar agendamento";
    $("#dErro").textContent = "Esse horário acabou de ser ocupado por outra pessoa. Escolha outro horário.";
    $("#passoDados").hidden = true; esc_.hora = null; carregarHoras();
  }

  // Horários que esta pessoa já marcou neste aparelho: botão direto para ver, confirmar ou desmarcar
  function minhasReservasHTML() {
    var l = [];
    try { l = JSON.parse(localStorage.getItem("ba-reservas-" + slug) || "[]").filter(function (x) { return x.data >= U.hojeISO(); }); } catch (e) {}
    if (!l.length) return "";
    return '<section class="pub__caixa pub__minhas"><h2>Seus horários marcados</h2>' + l.map(function (x) {
      return '<a class="btn btn--sec btn--bloco" href="' + linkReserva(x.tk) + '">' + Icone("calendario") + "<span>" + esc(x.servico || "Horário") + " · " + esc(U.dataCurta(x.data)) + " às " + esc(x.inicio) + '</span><small>Ver, confirmar ou desmarcar</small></a>';
    }).join("") + "</section>";
  }
  function linkReserva(tk) { return location.href.split("?")[0] + "?s=" + encodeURIComponent(slug) + "&r=" + tk; }
  function guardarReserva(tk, ag) {
    try {
      var l = JSON.parse(localStorage.getItem("ba-reservas-" + slug) || "[]").filter(function (x) { return x.data >= U.hojeISO(); });
      l.push({ tk: tk, data: ag.data, inicio: ag.inicio, servico: ag.servicoNome });
      localStorage.setItem("ba-reservas-" + slug, JSON.stringify(l.slice(-10)));
    } catch (e) {}
  }
  function sucesso(ag, tk) {
    naPrincipal = false;
    var comQuem = (pag.profissionais || []).length > 1 && ag.profNome ? " com " + ag.profNome : "";
    var msg = "Olá! Acabei de agendar pelo link: " + ag.servicoNome + comQuem + ", " + U.dataLonga(ag.data) + " às " + ag.inicio + ". Nome: " + ag.clienteNome + ".";
    setTimeout(function () {
      var bc = $("#copiarRes"); if (!bc) return;
      bc.onclick = function () { navigator.clipboard && navigator.clipboard.writeText(linkReserva(tk)).then(function () { bc.textContent = "Link copiado!"; }); };
    }, 0);
    el.innerHTML = cabecalho() +
      '<section class="pub__caixa pub__caixa--centro"><div class="pub__ok" aria-hidden="true">' + Icone("check") + "</div><h2>Horário marcado!</h2>" +
      '<p class="pub__confirma"><b>' + esc(ag.servicoNome) + "</b>" + esc(comQuem) + "<br>" + esc(U.dataLonga(ag.data)) + " às " + ag.inicio + "</p>" +
      "<p>Precisa <b>confirmar ou desmarcar</b> depois? Use o botão abaixo. Ele também aparece aqui sempre que você abrir a agenda neste celular.</p>" +
      '<a class="btn btn--pri btn--bloco" href="' + linkReserva(tk) + '">' + Icone("calendario") + "Ver ou desmarcar meu horário</a>" +
      '<a class="btn btn--sec btn--bloco" style="margin-top:10px" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent("Meu horário em " + pag.nome + ": " + ag.servicoNome + ", " + U.dataLonga(ag.data) + " às " + ag.inicio + ". Para confirmar ou desmarcar: " + linkReserva(tk)) + '">' + Icone("whatsapp") + "Guardar no meu WhatsApp</a>" +
      '<button class="btn btn--sec btn--bloco" id="copiarRes" type="button" style="margin-top:10px">' + Icone("copiar") + "Copiar link</button>" +
      "<p>Se quiser, avise " + esc(pag.nome) + " pelo WhatsApp.</p>" +
      (pag.whatsapp ? botaoZap(msg, "Avisar no WhatsApp") : "") +
      '<button class="btn btn--sec btn--bloco" id="outro" style="margin-top:10px">Marcar outro horário</button></section>';
    $("#outro").onclick = function () { esc_ = { servico: null, prof: null, dia: null, hora: null, livresPorHora: {} }; desenhar(); window.scrollTo(0, 0); };
    window.scrollTo(0, 0);
  }

  /* ---------- Confirmar ou desmarcar pelo link (?r=codigo) ---------- */
  async function telaReserva(tk) {
    var refR = FB.doc(db, "paginas", slug, "reservas", tk), r;
    try { var d = await FB.getDoc(refR); if (!d.exists()) return erroTela("Horário não encontrado", "Este link não é mais válido. O horário pode ter sido apagado ou o link está incompleto.", true); r = d.data(); }
    catch (e) { return erroTela("Horário não encontrado", "Não foi possível abrir este horário. Confira o link.", true); }
    var passou = r.data < U.hojeISO();
    var st = { marcado: "Marcado", confirmado: "Confirmado ✓", cancelado: "Desmarcado" }[r.status] || r.status;
    el.innerHTML = cabecalho() + '<section class="pub__caixa pub__caixa--centro"><h2>' + (r.nome ? "Olá, " + esc(r.nome) + "!" : "Seu horário") + "</h2>" +
      '<p class="pub__confirma"><b>' + esc(r.servicoNome) + "</b>" + (r.profNome && (pag.profissionais || []).length > 1 ? " com " + esc(r.profNome) : "") + "<br>" + esc(U.dataLonga(r.data)) + " às " + esc(r.inicio) + "</p>" +
      '<p class="pub__status pub__status--' + esc(r.status) + '">' + esc(st) + "</p>" +
      (passou || r.status === "cancelado" ? "" :
        (r.status !== "confirmado" ? '<button class="btn btn--pri btn--bloco" id="rConf">' + Icone("check") + "Confirmar presença</button>" : "") +
        '<button class="btn btn--sec btn--bloco" id="rDesm" style="margin-top:10px">Desmarcar horário</button>') +
      (r.status === "cancelado" ? '<a class="btn btn--pri btn--bloco" href="?s=' + encodeURIComponent(slug) + '">Marcar outro horário</a>' : "") +
      (pag.whatsapp ? '<div style="margin-top:10px">' + botaoZap("Olá! Sobre o meu horário de " + r.servicoNome + " em " + U.dataBR(r.data) + " às " + r.inicio + ".", "Falar com o salão") + "</div>" : "") +
      "</section>";
    async function responder(status, motivo) {
      var refA = FB.doc(db, "saloes", pag.salaoId, "agendamentos", r.ag);
      var b = FB.writeBatch(db), quando = new Date().toISOString();
      var upd = { status: status, prova: tk, respondidoEm: quando };
      if (status === "cancelado" && motivo) upd.motivoCliente = String(motivo).slice(0, 200);
      if (status === "cancelado") upd.slots = [];
      b.update(refA, upd);
      b.update(refR, { status: status, respondidoEm: quando });
      if (status === "cancelado") (r.slots || []).forEach(function (sl) { b.delete(FB.doc(db, "paginas", slug, "ocupados", sl)); });
      try {
        await b.commit();
        if (status === "cancelado") try { localStorage.setItem("ba-reservas-" + slug, JSON.stringify(JSON.parse(localStorage.getItem("ba-reservas-" + slug) || "[]").filter(function (x) { return x.tk !== tk; }))); } catch (x) {}
        telaReserva(tk);
      }
      catch (e) { console.error(e); alert("Não foi possível " + (status === "cancelado" ? "desmarcar" : "confirmar") + " agora. Confira a internet ou fale com o salão pelo WhatsApp."); }
    }
    if ($("#rConf")) $("#rConf").onclick = function () { this.disabled = true; responder("confirmado"); };
    if ($("#rDesm")) $("#rDesm").onclick = function () {
      var bt = this; bt.hidden = true; if ($("#rConf")) $("#rConf").hidden = true;
      var motivos = ["Tive um imprevisto", "Não estou bem de saúde", "Vou remarcar para outro dia", "Outro motivo"];
      bt.insertAdjacentHTML("afterend", '<form class="pub__desmarcar" id="fDesm"><p><b>Por que vai desmarcar?</b> Assim ' + esc(pag.nome) + ' pode te ajudar a remarcar.</p>' +
        motivos.map(function (m, i) { return '<label class="pub__opcao"><input type="radio" name="motivo" value="' + esc(m) + '"' + (i === 0 ? " checked" : "") + "> " + esc(m) + "</label>"; }).join("") +
        '<label class="pub__opcao-txt">Quer explicar? (opcional)<input name="obs" maxlength="140" autocomplete="off"></label>' +
        '<button class="btn btn--perigo btn--bloco" type="submit">Desmarcar horário</button>' +
        '<button class="btn btn--sec btn--bloco" type="button" id="fDesmVoltar" style="margin-top:10px">Voltar, não quero desmarcar</button></form>');
      $("#fDesmVoltar").onclick = function () { $("#fDesm").remove(); bt.hidden = false; if ($("#rConf")) $("#rConf").hidden = false; };
      $("#fDesm").onsubmit = function (ev) {
        ev.preventDefault(); var f = ev.target, m = (f.motivo.value || "").trim(), o = (f.obs.value || "").trim();
        f.querySelector("button[type=submit]").disabled = true;
        responder("cancelado", o ? (m && m !== "Outro motivo" ? m + ": " : "") + o : m);
      };
    };
  }

  async function iniciar() {
    if (!slug) return erroTela("Link incompleto", "Este endereço de agendamento está incompleto. Peça o link certo ao profissional.");
    try {
      var s = await FB.getDoc(FB.doc(db, "paginas", slug));
      if (!s.exists()) return erroTela("Agenda não encontrada", "Não encontramos esta agenda. Confira se o link está certo.");
      pag = s.data();
    } catch (e) {
      console.error(e);
      return erroTela("Sem conexão", "Não foi possível abrir a agenda. Confira a internet e recarregue a página.");
    }
    document.title = "Agendar com " + pag.nome;
    if (window.Tema && Tema.cor) Tema.cor(pag.cor || "dourado", false);
    if (!pag.ativo) return erroTela("Agendamento online pausado", "No momento os horários estão sendo marcados direto pelo WhatsApp.", true);
    var tkR = new URLSearchParams(location.search).get("r");
    if (tkR) return telaReserva(tkR);
    if (!(pag.servicos || []).length || !(pag.profissionais || []).length) return erroTela("Agenda em preparação", "Esta agenda ainda está sendo montada. Chame no WhatsApp para marcar.", true);
    desenhar();
    // Tempo real: se o salão mudar algo (novo profissional, serviço, horário), a página se atualiza sozinha
    var primeira = true;
    if (FB.onSnapshot) FB.onSnapshot(FB.doc(db, "paginas", slug), function (d) {
      if (primeira) { primeira = false; return; }
      if (!d.exists()) return;
      pag = d.data();
      if (window.Tema && Tema.cor) Tema.cor(pag.cor || "dourado", false);
      if (naPrincipal && !esc_.servico) desenhar();   // ainda não escolheu nada: redesenha tudo
      // se já está escolhendo, as listas usam os dados novos no próximo toque
    }, function () {});
  }
  iniciar();
})();
