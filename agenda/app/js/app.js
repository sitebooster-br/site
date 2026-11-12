/* BoosterAgenda: telas e navegação do app do profissional. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = U.esc, brl = U.brl;
  var S = Nuvem.estado;

  var STATUS = {
    marcado: { nome: "Marcado", classe: "st-marcado" },
    confirmado: { nome: "Confirmado", classe: "st-confirmado" },
    concluido: { nome: "Concluído", classe: "st-concluido" },
    faltou: { nome: "Faltou", classe: "st-faltou" },
    cancelado: { nome: "Cancelado", classe: "st-cancelado" }
  };
  var CORES = ["#f0a500", "#3ddc97", "#5aa9ff", "#c084fc", "#ff7a6b", "#2dd4bf", "#f472b6", "#a3e635"];
  var MSG_LEMBRETE = "Olá, {cliente}! Passando para lembrar do seu horário de {servico} {quando} às {hora} no {negocio}. Posso confirmar?";
  var HORARIOS_PADRAO = {
    0: { ativo: false, abre: "09:00", fecha: "18:00", pausaIni: "", pausaFim: "" },
    1: { ativo: true, abre: "09:00", fecha: "18:00", pausaIni: "12:00", pausaFim: "13:00" },
    2: { ativo: true, abre: "09:00", fecha: "18:00", pausaIni: "12:00", pausaFim: "13:00" },
    3: { ativo: true, abre: "09:00", fecha: "18:00", pausaIni: "12:00", pausaFim: "13:00" },
    4: { ativo: true, abre: "09:00", fecha: "18:00", pausaIni: "12:00", pausaFim: "13:00" },
    5: { ativo: true, abre: "09:00", fecha: "18:00", pausaIni: "12:00", pausaFim: "13:00" },
    6: { ativo: true, abre: "09:00", fecha: "13:00", pausaIni: "", pausaFim: "" }
  };

  /* ---------- Componentes ---------- */
  var nGrad = 0;
  function marcaHTML() {
    var gid = "gm" + (++nGrad);
    var dentro = APP.icone
      ? '<svg x="16" y="16" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' + (ICONES[APP.icone] || "") + "</svg>"
      : '<text x="32" y="45" text-anchor="middle" font-family="Poppins, Arial, sans-serif" font-weight="800" font-size="36" fill="#fff">' + esc(APP.letra) + "</text>";
    return '<svg class="marca__simbolo" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffc21a"/><stop offset=".5" stop-color="#f0a500"/><stop offset="1" stop-color="#e8730c"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#' + gid + ')"/>' + dentro + "</svg>" +
      '<span class="marca__nome">' + esc(APP.nome) + "<b>" + esc(APP.sufixo) + "</b></span>";
  }

  function aviso(msg, tipo) {
    var d = document.createElement("div");
    d.className = "aviso aviso--" + (tipo || "ok");
    d.innerHTML = Icone(tipo === "erro" ? "alerta" : tipo === "info" ? "calendario" : "check") + "<span>" + esc(msg) + "</span>";
    $("#avisos").appendChild(d);
    setTimeout(function () { d.classList.add("sai"); setTimeout(function () { d.remove(); }, 400); }, tipo === "info" ? 7000 : 3600);
  }

  // Abre uma janela. Devolve { form, resultado } — resultado resolve com os valores ou null.
  function janelaAbrir(titulo, campos, textoOk, perigo, semOk) {
    var dlg = $("#janela"), form = $("#janelaForm");
    form.onclick = null; form.onchange = null;
    form.innerHTML = "<h2>" + esc(titulo) + "</h2>" + (campos || "") +
      '<p class="erro" role="alert"></p><div class="janela__botoes">' +
      '<button class="btn btn--sec" value="cancelar" type="submit" formnovalidate>' + (semOk ? "Fechar" : "Cancelar") + "</button>" +
      (semOk ? "" : '<button class="btn ' + (perigo ? "btn--perigo" : "btn--pri") + '" value="ok" type="submit">' + esc(textoOk || "Salvar") + "</button>") + "</div>";
    if (dlg.open) dlg.close();
    dlg.showModal();
    var primeiro = form.querySelector("input:not([type=hidden]), select, textarea");
    if (primeiro && !semOk) primeiro.focus();
    var resultado = new Promise(function (resolve) {
      form.onsubmit = function (e) {
        var botao = e.submitter && e.submitter.value;
        if (botao !== "ok") { dlg.close(); resolve(null); return; }
        e.preventDefault();
        var inval = form.querySelector(":invalid");
        if (inval) { $(".erro", form).textContent = inval.dataset.erro || "Preencha os campos obrigatórios."; inval.focus(); return; }
        var dados = {};
        form.querySelectorAll("[name]").forEach(function (c) {
          if (c.type === "checkbox") dados[c.name] = c.checked;
          else if (c.type === "radio") { if (c.checked) dados[c.name] = c.value; }
          else dados[c.name] = c.type === "number" ? (c.value === "" ? null : Number(c.value)) : c.value.trim();
        });
        dlg.close(); resolve(dados);
      };
      dlg.oncancel = function () { resolve(null); };
    });
    return { form: form, resultado: resultado };
  }
  function janela(titulo, campos, textoOk, perigo) { return janelaAbrir(titulo, campos, textoOk, perigo).resultado; }
  function confirmar(titulo, texto, textoOk, perigo) {
    return janela(titulo, "<p>" + esc(texto) + "</p>", textoOk || "Apagar", perigo !== false).then(function (r) { return r !== null; });
  }

  function servico(id) { return S.servicos.find(function (s) { return s.id === id; }); }
  function dono() { return Nuvem.ehDono(); }
  function prof(id) { return S.profissionais.find(function (p) { return p.id === id; }); }
  function profs() {
    return S.profissionais.filter(function (p) { return p.ativo; })
      .sort(function (a, b) { return (a.vaga || 99) - (b.vaga || 99) || a.nome.localeCompare(b.nome, "pt-BR"); });
  }
  function equipeVisivel() { return dono() && profs().length > 1; }
  function chipProf(id) {
    var p = prof(id); if (!p) return "";
    return '<span class="chip-prof" style="--pc:' + esc(p.cor || "#5aa9ff") + '">' + esc(p.nome.split(" ")[0]) + "</span>";
  }
  function servicosDoProf(pid) {
    var p = prof(pid), lista = S.servicos.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, "pt-BR"); });
    if (!p || !p.servicos || !p.servicos.length) return lista;
    return lista.filter(function (s) { return p.servicos.indexOf(s.id) !== -1; });
  }
  function cliente(id) { return S.clientes.find(function (c) { return c.id === id; }); }
  // Concluído, falta e cancelado: só o dono altera (protege relatório e comissões)
  function podeMexer(a) { return dono() || !a || !a.status || a.status === "marcado" || a.status === "confirmado"; }
  function corDe(ag) { var s = servico(ag.servicoId); return (s && s.cor) || "#5aa9ff"; }
  function horarioDo(iso) { var h = (S.perfil && S.perfil.horarios) || HORARIOS_PADRAO; return h[U.diaSemana(iso)] || { ativo: false }; }
  function nomeNegocio() { return (S.perfil && S.perfil.nome) || "BoosterAgenda"; }
  function urlLink(slug) {
    var base = APP.urlPublica || new URL("marcar.html", location.href).href.split("?")[0].split("#")[0];
    return base + "?s=" + encodeURIComponent(slug);
  }
  function tagStatus(s) { var x = STATUS[s] || STATUS.marcado; return '<span class="tag ' + x.classe + '">' + x.nome + "</span>"; }

  function linkReserva(ag) { return ag && ag.tk && S.perfil && S.perfil.slug ? urlLink(S.perfil.slug) + "&r=" + ag.tk : ""; }
  function mensagemLembrete(ag) {
    var t = (S.perfil && S.perfil.msgLembrete) || MSG_LEMBRETE;
    var lk = linkReserva(ag);
    if (lk && t.indexOf("{link}") === -1) t += "\n\nConfirme ou desmarque aqui: {link}";
    var primeiroNome = String(ag.clienteNome || "").split(" ")[0];
    return t.replace(/\{cliente\}/g, primeiroNome).replace(/\{servico\}/g, ag.servicoNome || "")
      .replace(/\{quando\}/g, U.quandoTexto(ag.data)).replace(/\{data\}/g, U.dataBR(ag.data))
      .replace(/\{hora\}/g, ag.inicio).replace(/\{negocio\}/g, nomeNegocio()).replace(/\{link\}/g, lk);
  }

  function folgaMin() { return Number(S.perfil && S.perfil.intervalo) || 0; }
  function comFolga(fim) { return U.hhmm(Math.min(U.min(fim) + folgaMin(), 24 * 60 - 1)); }
  // Tempo do serviço com aquele profissional
  function durDe(pid, s) { var p = prof(pid); return Number((p && p.duracoes && s && p.duracoes[s.id]) || (s && s.duracao)) || 30; }
  // Avisos de conflito antes de salvar um horário
  function conflitos(ag) {
    var msgs = [];
    S.ags.forEach(function (x) {
      if (x.id !== ag.id && x.data === ag.data && (x.profId || "") === (ag.profId || "") && Nuvem.OCUPA[x.status] && U.sobrepoe(ag.inicio, comFolga(ag.fim), x.inicio, comFolga(x.fim)))
        msgs.push("Já tem " + x.clienteNome + " (" + x.servicoNome + ") das " + x.inicio + " às " + x.fim + (x.profNome ? " com " + x.profNome : "") + ".");
    });
    S.bloqueios.forEach(function (b) {
      if (b.data === ag.data && (!b.profId || b.profId === ag.profId) && (b.diaInteiro || U.sobrepoe(ag.inicio, ag.fim, b.inicio, b.fim)))
        msgs.push("Esse horário está bloqueado" + (b.motivo ? " (" + b.motivo + ")" : "") + ".");
    });
    var h = horarioDo(ag.data);
    if (!h.ativo) msgs.push("Você marcou este dia como fechado.");
    else {
      if (U.min(ag.inicio) < U.min(h.abre) || U.min(ag.fim) > U.min(h.fecha)) msgs.push("Fica fora do horário de funcionamento (" + h.abre + " às " + h.fecha + ").");
      if (h.pausaIni && h.pausaFim && U.sobrepoe(ag.inicio, ag.fim, h.pausaIni, h.pausaFim)) msgs.push("Cai no intervalo (" + h.pausaIni + " às " + h.pausaFim + ").");
    }
    return msgs;
  }

  /* ---------- Novo / editar agendamento ---------- */
  async function editarAg(ag, padrao) {
    ag = ag || {};
    padrao = padrao || {};
    if (!S.servicos.length) {
      if (!dono()) { aviso("O dono do salão ainda não cadastrou os serviços.", "erro"); return; }
      if (await confirmar("Cadastre um serviço primeiro", "Para marcar um horário, cadastre pelo menos um serviço (nome, duração e preço).", "Cadastrar serviço", false)) location.hash = "#servicos";
      return;
    }
    var equipe = profs();
    if (!equipe.length) {
      if (await confirmar("Ninguém atendendo ainda", "Para marcar horários, ligue \"Eu também atendo\" ou convide um profissional na tela Equipe.", "Ir para Equipe", false)) location.hash = "#equipe";
      return;
    }
    var pid = dono() ? (ag.profId || padrao.profId || (vista.prof !== "todos" && vista.prof) || equipe[0].id) : Nuvem.meuProfId();
    if (dono() && !prof(pid)) pid = equipe[0].id;
    var servs = servicosDoProf(pid);
    if (!servs.length) servs = S.servicos.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, "pt-BR"); });
    var sid = ag.servicoId || padrao.servicoId || servs[0].id;
    var s0 = servico(sid) || servs[0];
    var dur = (ag.inicio && ag.fim) ? U.min(ag.fim) - U.min(ag.inicio) : Number(s0.duracao) || 30;
    var c0 = ag.clienteId ? cliente(ag.clienteId) : null;
    var lista = S.clientes.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, "pt-BR"); });
    var durs = [15, 30, 45, 60, 75, 90, 105, 120, 150, 180, 210, 240, 300, 360, 480];
    if (durs.indexOf(dur) === -1) durs.push(dur);
    durs.sort(function (a, b) { return a - b; });

    var j = janelaAbrir(ag.id ? "Editar horário" : "Novo horário",
      '<label>Cliente (nome e sobrenome)<input name="clienteNome" list="listaClientes" required maxlength="80" autocomplete="off" pattern="\\S+(\\s+\\S+)+\\s*" data-erro="Digite o nome e o sobrenome do cliente (ex.: Carlos Souza)." value="' + esc(ag.clienteNome || (c0 && c0.nome) || "") + '" placeholder="Digite o nome"></label>' +
      '<datalist id="listaClientes">' + lista.map(function (c) { return '<option value="' + esc(c.nome) + '">'; }).join("") + "</datalist>" +
      '<label>WhatsApp do cliente <span class="opc">(para o lembrete)</span><input name="clienteWhats" type="tel" inputmode="tel" maxlength="20" value="' + esc(ag.clienteWhats || (c0 && c0.whatsapp) || "") + '" placeholder="(11) 98765-4321"></label>' +
      (equipe.length > 1 && dono()
        ? '<label>Profissional<select name="profId">' + equipe.map(function (p) { return '<option value="' + p.id + '"' + (p.id === pid ? " selected" : "") + ">" + esc(p.nome) + "</option>"; }).join("") + "</select></label>"
        : '<input type="hidden" name="profId" value="' + esc(pid) + '">') +
      '<label>Serviço<select name="servicoId">' + servs.map(function (s) { return '<option value="' + s.id + '"' + (s.id === sid ? " selected" : "") + ">" + esc(s.nome) + " · " + U.duracaoTexto(s.duracao) + "</option>"; }).join("") + "</select></label>" +
      '<div class="duas"><label>Dia<input name="data" type="date" required data-erro="Escolha o dia." value="' + esc(ag.data || padrao.data || U.hojeISO()) + '"></label>' +
      '<label>Horário<input name="inicio" type="time" step="300" required data-erro="Escolha o horário." value="' + esc(ag.inicio || padrao.inicio || "09:00") + '"></label></div>' +
      '<div class="duas"><label>Duração<select name="duracao">' + durs.map(function (d) { return '<option value="' + d + '"' + (d === dur ? " selected" : "") + ">" + U.duracaoTexto(d) + "</option>"; }).join("") + "</select></label>" +
      (dono()
        ? '<label>Valor (R$)<input name="preco" type="number" min="0" step="0.01" inputmode="decimal" value="' + esc(ag.preco != null ? ag.preco : s0.preco) + '"></label></div>'
        : '<label>Valor<input name="precoVer" value="' + esc(brl(ag.preco != null ? ag.preco : s0.preco)) + '" readonly aria-readonly="true"><span class="sub">Definido pelo dono do salão</span></label></div>') +
      '<label>Situação<select name="status">' + ["marcado", "confirmado", "concluido", "faltou"].map(function (k) { return '<option value="' + k + '"' + ((ag.status || "marcado") === k ? " selected" : "") + ">" + STATUS[k].nome + "</option>"; }).join("") + "</select></label>" +
      '<label>Observação <span class="opc">(opcional)</span><input name="obs" maxlength="300" value="' + esc(ag.obs) + '"></label>' +
      '<p class="sub" id="dicaPref" hidden></p>' +
      (dono() && ag.id ? '<details class="historico"><summary>Histórico de alterações</summary><ul id="listaHist"><li>Carregando...</li></ul></details>' : ""),
      ag.id ? "Salvar" : "Marcar horário");

    var f = j.form;
    var profMexido = !!(ag.id || padrao.profId);
    // Ao escolher um cliente que já existe, preenche o WhatsApp e sugere o profissional preferido
    $("[name=clienteNome]", f).addEventListener("change", function (e) {
      var c = S.clientes.find(function (x) { return x.nome.toLowerCase() === e.target.value.trim().toLowerCase(); });
      if (c && !$("[name=clienteWhats]", f).value) $("[name=clienteWhats]", f).value = c.whatsapp || "";
      var dica = $("#dicaPref", f), pp = c && c.profPreferido && prof(c.profPreferido);
      if (pp && pp.ativo && profs().length > 1) {
        dica.hidden = false;
        dica.textContent = c.nome.split(" ")[0] + " costuma ser atendido(a) por " + pp.nome + ".";
        var sp = $("select[name=profId]", f);
        if (sp && !profMexido && sp.value !== pp.id) { sp.value = pp.id; sp.dispatchEvent(new Event("change")); }
      } else dica.hidden = true;
    });
    if (c0) $("[name=clienteNome]", f).dispatchEvent(new Event("change"));
    if ($("#listaHist", f)) Nuvem.historicoDoAg(ag.id).then(function (hs) {
      $("#listaHist", f).innerHTML = hs.length ? hs.map(function (h) {
        var dt = new Date(h.em);
        return "<li><b>" + esc(h.acao) + "</b> · " + esc(h.nome) + ' <span class="sub">' + dt.toLocaleDateString("pt-BR") + " " + dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) + "</span>" +
          (h.antes && h.depois && h.antes.preco !== h.depois.preco ? ' <span class="sub">(' + brl(h.antes.preco) + " → " + brl(h.depois.preco) + ")</span>" : "") + "</li>";
      }).join("") : "<li>Sem alterações registradas.</li>";
    }).catch(function () { $("#listaHist", f).innerHTML = "<li>Não foi possível carregar.</li>"; });
    // Ao trocar o profissional, mostra só os serviços que ele faz
    var selProf = $("select[name=profId]", f);
    if (selProf) selProf.addEventListener("change", function (ev) {
      if (ev.isTrusted) profMexido = true;
      var sel = $("[name=servicoId]", f), atual = sel.value, lista = servicosDoProf(selProf.value);
      if (!lista.length) lista = S.servicos;
      sel.innerHTML = lista.map(function (s) { return '<option value="' + s.id + '"' + (s.id === atual ? " selected" : "") + ">" + esc(s.nome) + " · " + U.duracaoTexto(s.duracao) + "</option>"; }).join("");
      sel.dispatchEvent(new Event("change"));
    });
    // Ao trocar o serviço, ajusta duração e valor
    $("[name=servicoId]", f).addEventListener("change", function (e) {
      var s = servico(e.target.value); if (!s) return;
      var sel = $("[name=duracao]", f), sp = $("select[name=profId]", f), d = durDe(sp ? sp.value : (ag.profId || Nuvem.meuProfId()), s);
      if (!sel.querySelector('option[value="' + d + '"]')) sel.insertAdjacentHTML("beforeend", '<option value="' + d + '">' + U.duracaoTexto(d) + "</option>");
      sel.value = String(d);
      if ($("[name=preco]", f)) $("[name=preco]", f).value = s.preco;
      if ($("[name=precoVer]", f)) $("[name=precoVer]", f).value = brl(s.preco);
    });

    var r = await j.resultado;
    if (!r) return;
    var s = servico(r.servicoId);
    var fim = U.hhmm(Math.min(U.min(r.inicio) + Number(r.duracao), 24 * 60 - 1));

    // Cliente: acha pelo nome ou WhatsApp, ou cadastra
    var nomeC = r.clienteNome, zapC = r.clienteWhats;
    var c = (c0 && c0.nome.toLowerCase() === nomeC.toLowerCase()) ? c0 : S.clientes.find(function (x) {
      return x.nome.toLowerCase() === nomeC.toLowerCase() || (zapC && x.whatsapp && U.zap(x.whatsapp) === U.zap(zapC));
    });
    var novoAg = Object.assign({}, ag, {
      clienteNome: nomeC, clienteWhats: zapC, servicoId: r.servicoId, servicoNome: s ? s.nome : "", profId: r.profId,
      data: r.data, inicio: r.inicio, fim: fim, preco: dono() ? (r.preco == null ? 0 : r.preco) : (ag.preco != null && ag.servicoId === r.servicoId ? ag.preco : (s ? s.preco : 0)), status: r.status, obs: r.obs, visto: true
    });

    var avisosC = conflitos(novoAg);
    if (avisosC.length && !(await confirmar("Atenção", avisosC.join(" "), "Marcar mesmo assim", false))) return editarAg(novoAg);

    if (c) {
      novoAg.clienteId = c.id;
      if (zapC && !c.whatsapp) Nuvem.salvar("clientes", Object.assign({}, c, { whatsapp: zapC }));
    } else {
      var nc = await Nuvem.salvar("clientes", { nome: nomeC, whatsapp: zapC, obs: "", visitas: 0, totalGasto: 0, faltas: 0 });
      novoAg.clienteId = nc.id;
    }
    await Nuvem.salvarAg(novoAg, ag.id ? ag : null);
    aviso(ag.id ? "Horário atualizado." : "Horário marcado.");
    redesenhar();
  }

  async function mudarStatus(ag, st) {
    await Nuvem.salvarAg(Object.assign({}, ag, { status: st, visto: true }), ag);
    aviso(STATUS[st].nome + ": " + ag.clienteNome + ".");
    redesenhar();
  }

  /* ---------- Telas ---------- */
  var TELAS = {};
  var vista = { modo: "dia", dia: U.hojeISO(), prof: "todos" };

  function cartaoAg(a, compacto) {
    var novo = a.origem === "online" && !a.visto;
    var conf = conflitos(a).length && Nuvem.OCUPA[a.status];
    var zapOk = U.soDigitos(a.clienteWhats).length >= 10;
    if (compacto) {
      return '<button class="ag-mini ' + (STATUS[a.status] || STATUS.marcado).classe + '" data-abrir="' + a.id + '" style="--cor:' + corDe(a) + '">' +
        "<b>" + a.inicio + "</b> " + esc(a.clienteNome) + '<small>' + esc(a.servicoNome) + (equipeVisivel() && a.profNome ? " · " + esc(a.profNome.split(" ")[0]) : "") + "</small>" + (novo ? '<span class="ponto-novo" title="Novo pelo link"></span>' : "") + "</button>";
    }
    return '<article class="ag" style="--cor:' + corDe(a) + '" data-id="' + a.id + '">' +
      '<div class="ag__hora"><strong>' + a.inicio + "</strong><span>" + a.fim + "</span></div>" +
      '<div class="ag__corpo">' +
      '<div class="ag__linha1"><h3>' + esc(a.clienteNome) + "</h3>" + tagStatus(a.status) + (equipeVisivel() && vista.prof === "todos" ? chipProf(a.profId) : "") +
      (novo ? '<span class="tag tag--novo">Novo pelo link</span>' : "") + (conf ? '<span class="tag tag--erro">Conflito</span>' : "") + "</div>" +
      '<p class="ag__serv">' + esc(a.servicoNome) + " · " + brl(a.preco) + (a.clienteWhats ? " · " + esc(U.foneBonito(a.clienteWhats)) : "") + "</p>" +
      (a.obs ? '<p class="ag__obs">' + esc(a.obs) + "</p>" : "") +
      '<div class="ag__acoes">' +
      (zapOk ? '<a class="btn-p btn-p--zap" href="' + U.linkZap(a.clienteWhats, mensagemLembrete(a)) + '" target="_blank" rel="noopener">' + Icone("whatsapp") + "Lembrar</a>" : "") +
      (a.status === "marcado" ? '<button class="btn-p" data-st="confirmado">' + Icone("check") + "Confirmar</button>" : "") +
      (a.status === "marcado" || a.status === "confirmado" ? '<button class="btn-p" data-st="concluido">' + Icone("estrela") + "Concluído</button><button class=\"btn-p\" data-st=\"faltou\">" + Icone("x") + "Faltou</button>" : "") +
      ((a.status === "concluido" || a.status === "faltou") && dono() ? '<button class="btn-p" data-st="marcado">Desfazer</button>' : "") +
      (novo ? '<button class="btn-p" data-visto="1">' + Icone("olho") + "Ok, vi</button>" : "") +
      (podeMexer(a) ? '<button class="btn-p" data-editar="1">' + Icone("editar") + "Editar</button>" +
        '<button class="btn-p btn-p--perigo" data-cancelar="1">' + Icone("lixo") + "Cancelar</button>"
        : '<span class="ag__trava">' + Icone("cadeado") + "Só o dono altera</span>") +
      "</div></div></article>";
  }

  // Linha do tempo de um dia para um profissional (agendamentos, bloqueios, intervalo e horários livres)
  function linhaTempo(dia, ags, pid) {
    var h = horarioDo(dia);
    var bl = S.bloqueios.filter(function (b) { return b.data === dia && (!b.profId || b.profId === pid); });
    var itens = ags.map(function (a) { return { ini: a.inicio, fim: a.fim, tipo: "ag", a: a }; });
    bl.forEach(function (b) { itens.push({ ini: b.diaInteiro ? "00:00" : b.inicio, fim: b.diaInteiro ? "23:59" : b.fim, tipo: "bloq", b: b }); });
    if (h.ativo && h.pausaIni && h.pausaFim) itens.push({ ini: h.pausaIni, fim: h.pausaFim, tipo: "pausa" });
    itens.sort(function (x, y) { return x.ini.localeCompare(y.ini); });
    var linhas = [];
    function livre(a, b) { return { tipo: "livre", ini: U.hhmm(a), fim: U.hhmm(b) }; }
    if (h.ativo) {
      var cursor = U.min(h.abre);
      itens.forEach(function (it) {
        if (U.min(it.ini) - cursor >= 30 && U.min(it.ini) <= U.min(h.fecha)) linhas.push(livre(cursor, U.min(it.ini)));
        linhas.push(it);
        cursor = Math.max(cursor, U.min(it.fim));
      });
      if (U.min(h.fecha) - cursor >= 30) linhas.push(livre(cursor, U.min(h.fecha)));
    } else linhas = itens;
    if (!linhas.length) return '<p class="vazio-box">' + Icone("calendario") + "Fechado neste dia." + (dono() ? ' <a href="#horarios">Mudar horários</a>' : "") + "</p>";
    return '<div class="linha-tempo">' + linhas.map(function (it) {
      if (it.tipo === "ag") return cartaoAg(it.a);
      if (it.tipo === "pausa") return '<div class="faixa faixa--pausa">' + Icone("relogio") + "<span><b>" + it.ini + " às " + it.fim + "</b> · Intervalo</span></div>";
      if (it.tipo === "bloq") return '<div class="faixa faixa--bloq">' + Icone("cadeado") + "<span><b>" + (it.b.diaInteiro ? "Dia inteiro" : it.ini + " às " + it.fim) + "</b> · " + (it.b.profId ? "Folga" : "Salão fechado") + (it.b.motivo ? " (" + esc(it.b.motivo) + ")" : "") + "</span></div>";
      return '<button class="faixa faixa--livre" data-livre="' + it.ini + '" data-prof="' + esc(pid || "") + '">' + Icone("mais") + "<span><b>" + it.ini + " às " + it.fim + "</b> · Livre. Clique para marcar</span></button>";
    }).join("") + "</div>";
  }

  // Horários desmarcados (pelo cliente ou pelo salão): ficam visíveis para o dono e o profissional poderem chamar a pessoa
  function desmarcadosHTML(lista, modo) {
    return '<section class="desmarcados"><h2>' + Icone("x") + "Desmarcados " + (modo === "dia" ? "neste dia" : "nesta semana") + " (" + lista.length + ')</h2><ul>' +
      lista.map(function (a) {
        var peloCliente = !!a.prova || a.canceladoPor === "cliente";
        var quem = peloCliente ? "O cliente desmarcou pelo link" : "Cancelado pelo salão";
        var motivo = peloCliente ? a.motivoCliente : a.motivo;
        var msg = "Olá, " + (a.clienteNome || "").split(" ")[0] + "! Vi que o seu horário de " + (a.servicoNome || "") + " em " + U.dataBR(a.data) + " às " + a.inicio +
          " foi desmarcado. Quer escolher outro dia? Estou à disposição.";
        return "<li><div><b>" + esc(a.clienteNome || "Cliente") + "</b> · " + esc(a.servicoNome || "") + (a.profNome && equipeVisivel() ? " com " + esc(a.profNome) : "") +
          '<span class="sub">' + (modo === "dia" ? "" : esc(U.dataCurta(a.data)) + " · ") + esc(a.inicio || "") + " · " + quem +
          (a.respondidoEm ? " em " + esc(new Date(a.respondidoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })) : "") + "</span>" +
          (motivo ? '<span class="desmarcados__motivo">Motivo: ' + esc(motivo) + "</span>" : (peloCliente ? '<span class="sub">Não informou o motivo.</span>' : "")) + "</div>" +
          (a.clienteWhats ? '<a class="btn btn--sec btn--peq" target="_blank" rel="noopener" href="' + U.linkZap(a.clienteWhats, msg) + '">' + Icone("whatsapp") + "Chamar</a>" : "") + "</li>";
      }).join("") + "</ul></section>";
  }

  TELAS.agenda = async function (el) {
    if (!dono()) vista.prof = Nuvem.meuProfId();
    else if (vista.prof !== "todos" && !prof(vista.prof)) vista.prof = "todos";
    var equipe = profs();
    var dia = vista.dia, modo = vista.modo;
    var de = modo === "dia" ? dia : U.inicioSemana(dia), ate = modo === "dia" ? dia : U.somaDias(U.inicioSemana(dia), 6);
    var todosAgs = await Nuvem.agsEntre(de, ate);
    var desmarcados = todosAgs.filter(function (a) { return a.status === "cancelado" && (vista.prof === "todos" || a.profId === vista.prof); })
      .sort(function (a, b) { return (a.data + a.inicio).localeCompare(b.data + b.inicio); });
    var ags = todosAgs.filter(function (a) { return a.status !== "cancelado" && (vista.prof === "todos" || a.profId === vista.prof); })
      .sort(function (a, b) { return (a.data + a.inicio).localeCompare(b.data + b.inicio); });
    var novosLink = 0; S.ags.forEach(function (a) { if (a.origem === "online" && !a.visto && a.status !== "cancelado") novosLink++; });
    var titulo = modo === "dia" ? U.dataLonga(dia) : "Semana de " + U.dataCurta(de) + " a " + U.dataCurta(ate);

    el.innerHTML =
      '<header class="topo"><div><h1>' + (dono() ? "Agenda" : "Minha agenda") + '</h1><p class="sub">' + esc(titulo) + (dia === U.hojeISO() && modo === "dia" ? " · hoje" : "") + "</p></div>" +
      '<div class="grupo grupo--acoes"><button class="btn btn--pri" id="novoAg">' + Icone("mais") + "Novo horário</button>" +
      '<button class="btn btn--sec" id="btnLembrar" title="Abre o WhatsApp de cada cliente de amanhã com o lembrete pronto">' + Icone("whatsapp") + "Lembrar amanhã</button>" +
      '<button class="btn btn--sec" id="btnAtraso" title="Avisa os próximos clientes de hoje que você vai atrasar">' + Icone("relogio") + "Estou atrasado</button></div></header>" + passosHTML() +
      (equipeVisivel() ? '<div class="filtro-prof" role="group" aria-label="Profissional"><button data-fprof="todos" aria-pressed="' + (vista.prof === "todos") + '">Todos</button>' +
        equipe.map(function (p) { return '<button data-fprof="' + p.id + '" aria-pressed="' + (vista.prof === p.id) + '" style="--pc:' + esc(p.cor || "#5aa9ff") + '"><i></i>' + esc(p.nome.split(" ")[0]) + "</button>"; }).join("") + "</div>" : "") +
      '<div class="barra-agenda">' +
      '<div class="grupo"><button class="btn-ic" id="ant" aria-label="Anterior">' + Icone("esq") + '</button><button class="btn btn--sec btn--peq" id="hoje">Hoje</button><button class="btn-ic" id="prox" aria-label="Próximo">' + Icone("dir") + "</button>" +
      '<input type="date" id="irData" value="' + dia + '" aria-label="Ir para o dia"></div>' +
      '<div class="alternar" role="group" aria-label="Ver por"><button data-modo="dia" aria-pressed="' + (modo === "dia") + '">Dia</button><button data-modo="semana" aria-pressed="' + (modo === "semana") + '">Semana</button></div></div>' +
      (novosLink ? '<p class="nota nota--novo">' + Icone("link") + "<span><strong>" + novosLink + (novosLink > 1 ? " agendamentos novos" : " agendamento novo") + "</strong> pelo link. Eles aparecem marcados como \"Novo pelo link\".</span></p>" : "") +
      '<div id="corpoAgenda"></div>';

    var corpo = $("#corpoAgenda");
    if (modo === "dia") {
      var h = horarioDo(dia);
      var previsto = ags.filter(function (a) { return a.status !== "faltou"; }).reduce(function (t, a) { return t + (Number(a.preco) || 0); }, 0);
      var html = '<div class="cards cards--mini">' +
        '<div class="card"><span class="card__rot">Atendimentos</span><strong class="card__num">' + ags.length + "</strong></div>" +
        '<div class="card"><span class="card__rot">Previsto no dia</span><strong class="card__num card__num--p">' + brl(previsto) + "</strong></div>" +
        '<div class="card"><span class="card__rot">Funcionamento</span><strong class="card__num card__num--p">' + (h.ativo ? h.abre + " às " + h.fecha : "Fechado") + "</strong>" + (h.ativo && h.pausaIni ? '<span class="sub">Intervalo ' + h.pausaIni + " às " + h.pausaFim + "</span>" : "") + "</div></div>";
      if (vista.prof === "todos" && equipe.length > 1) {
        html += '<div class="colunas-prof" style="--n:' + equipe.length + '">' + equipe.map(function (p) {
          var meus = ags.filter(function (a) { return a.profId === p.id; });
          return '<section class="coluna-prof"><h2 class="coluna-prof__cab" style="--pc:' + esc(p.cor || "#5aa9ff") + '"><i></i>' + esc(p.nome) + "<small>" + meus.length + " hoje</small></h2>" + linhaTempo(dia, meus, p.id) + "</section>";
        }).join("") + "</div>";
        // agendamentos antigos sem profissional (versão anterior)
        var semProf = ags.filter(function (a) { return !a.profId || !prof(a.profId); });
        if (semProf.length) html += '<h2 class="sub" style="margin:18px 0 8px">Sem profissional definido</h2><div class="linha-tempo">' + semProf.map(function (a) { return cartaoAg(a); }).join("") + "</div>";
      } else {
        var pidDia = vista.prof === "todos" ? (equipe[0] && equipe[0].id) : vista.prof;
        html += linhaTempo(dia, ags, pidDia);
      }
      corpo.innerHTML = html;
    } else {
      var col = [];
      for (var i = 0; i < 7; i++) {
        var d = U.somaDias(de, i), hd = horarioDo(d);
        var doDia = ags.filter(function (a) { return a.data === d; });
        var bq = S.bloqueios.filter(function (b) { return b.data === d && (vista.prof === "todos" || !b.profId || b.profId === vista.prof); });
        col.push('<div class="semana__dia' + (d === U.hojeISO() ? " semana__dia--hoje" : "") + '">' +
          '<button class="semana__cab" data-ir="' + d + '"><span>' + U.DIAS_C[U.diaSemana(d)] + "</span><b>" + U.dataCurta(d) + "</b>" + (doDia.length ? "<small>" + doDia.length + "</small>" : "") + "</button>" +
          (!hd.ativo ? '<p class="semana__fechado">Fechado</p>' : "") +
          bq.map(function (b) { return '<p class="semana__bloq">' + Icone("cadeado") + (b.diaInteiro ? "Dia inteiro" : b.inicio + "–" + b.fim) + (b.profId && equipeVisivel() ? " · " + esc((prof(b.profId) || {}).nome || "") : "") + "</p>"; }).join("") +
          doDia.map(function (a) { return cartaoAg(a, true); }).join("") + "</div>");
      }
      corpo.innerHTML = '<div class="semana">' + col.join("") + "</div>";
    }
    if (desmarcados.length) corpo.insertAdjacentHTML("beforeend", desmarcadosHTML(desmarcados, modo));

    function mover(n) { vista.dia = U.somaDias(vista.dia, n); TELAS.agenda(el); }
    $("#ant").onclick = function () { mover(modo === "dia" ? -1 : -7); };
    $("#prox").onclick = function () { mover(modo === "dia" ? 1 : 7); };
    $("#hoje").onclick = function () { vista.dia = U.hojeISO(); TELAS.agenda(el); };
    $("#irData").onchange = function (e) { if (e.target.value) { vista.dia = e.target.value; TELAS.agenda(el); } };
    $$("[data-modo]", el).forEach(function (b) { b.onclick = function () { vista.modo = b.dataset.modo; TELAS.agenda(el); }; });
    $$("[data-fprof]", el).forEach(function (b) { b.onclick = function () { vista.prof = b.dataset.fprof; TELAS.agenda(el); }; });
    $("#novoAg").onclick = function () { editarAg(null, { data: vista.dia }); };
    $("#btnLembrar").onclick = lembrarAmanha; ligarPassos(el);
    $("#btnAtraso").onclick = function () { avisarAtraso(vista.prof !== "todos" ? vista.prof : null); };
    if (vista.dia === U.hojeISO()) verificarAtraso(el);

    corpo.onclick = async function (e) {
      var t = e.target.closest("button"); if (!t) return;
      if (t.dataset.ir) { vista.dia = t.dataset.ir; vista.modo = "dia"; return TELAS.agenda(el); }
      if (t.dataset.livre) return editarAg(null, { data: vista.dia, inicio: t.dataset.livre, profId: t.dataset.prof });
      if (t.dataset.abrir) {
        var x = ags.find(function (a) { return a.id === t.dataset.abrir; });
        if (!podeMexer(x)) { aviso("Este horário já foi " + (STATUS[x.status] || {}).nome.toLowerCase() + ". Só o dono pode alterar.", "erro"); return; }
        return editarAg(x);
      }
      var card = t.closest(".ag"); if (!card) return;
      var a = ags.find(function (y) { return y.id === card.dataset.id; }); if (!a) return;
      if (t.dataset.st) return mudarStatus(a, t.dataset.st);
      if (t.dataset.editar) return editarAg(a);
      if (t.dataset.visto) { await Nuvem.salvarAg(Object.assign({}, a, { visto: true }), a); return redesenhar(); }
      if (t.dataset.cancelar) {
        var rc = await janela("Cancelar horário?",
          "<p>" + esc(a.clienteNome + " · " + a.servicoNome + " · " + U.dataCurta(a.data) + " às " + a.inicio) + ". O horário fica livre de novo.</p>" +
          '<label>Motivo' + (dono() ? ' <span class="opc">(opcional)</span>' : "") + '<input name="motivo" maxlength="200" ' + (dono() ? "" : 'required minlength="3" data-erro="Escreva o motivo (ex.: cliente desmarcou)." ') + 'placeholder="Ex.: cliente desmarcou"></label>',
          "Cancelar horário", true);
        if (rc) { await Nuvem.apagarAg(a, (rc.motivo || "").trim()); aviso("Horário cancelado."); redesenhar(); }
      }
    };
  };

  TELAS.clientes = async function (el) {
    var filtro = el.dataset.filtro || "todos";
    var limite = U.somaDias(U.hojeISO(), -60);
    var todos = S.clientes.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, "pt-BR"); });
    var sumidos = todos.filter(function (c) { return c.ultimaVisita && c.ultimaVisita < limite; });
    el.innerHTML =
      '<header class="topo"><div><h1>Clientes</h1><p class="sub">' + todos.length + " cliente" + (todos.length === 1 ? "" : "s") + ". Visitas e valores contam os atendimentos marcados como concluídos.</p></div>" +
      '<div class="grupo">' + (dono() ? '<button class="btn btn--sec" id="importar">' + Icone("importar") + "Importar</button>" : "") +
      '<button class="btn btn--pri" id="novo">' + Icone("mais") + "Novo cliente</button></div></header>" +
      '<div class="barra-agenda"><div class="busca">' + Icone("busca") + '<input id="busca" type="search" placeholder="Buscar por nome ou WhatsApp" aria-label="Buscar cliente"></div>' +
      '<div class="alternar" role="group" aria-label="Filtro"><button data-f="todos" aria-pressed="' + (filtro === "todos") + '">Todos</button><button data-f="sumidos" aria-pressed="' + (filtro === "sumidos") + '">Sumidos (' + sumidos.length + ")</button></div></div>" +
      (filtro === "sumidos" ? '<p class="nota nota--alerta">' + Icone("alerta") + "<span>Clientes que não voltam há mais de 60 dias. Que tal mandar uma mensagem?</span></p>" : "") +
      '<div class="tabela-wrap"><table class="tabela tabela--resp"><thead><tr><th>Nome</th><th>WhatsApp</th><th>Última visita</th><th class="num">Visitas</th>' + (dono() ? '<th class="num">Total gasto</th>' : "") + '<th class="num">Faltas</th><th><span class="sr">Ações</span></th></tr></thead><tbody id="linhas"></tbody></table></div>';

    function desenhar(txt) {
      var f = (txt || "").toLowerCase(), fd = U.soDigitos(txt);
      var base = filtro === "sumidos" ? sumidos : todos;
      var lista = base.filter(function (c) { return c.nome.toLowerCase().indexOf(f) !== -1 || (fd && U.soDigitos(c.whatsapp).indexOf(fd) !== -1); });
      $("#linhas").innerHTML = lista.length ? lista.map(function (c) {
        var zapOk = U.soDigitos(c.whatsapp).length >= 10;
        return "<tr><td data-r=\"Nome\"><button class=\"link-btn link-btn--forte\" data-hist=\"" + c.id + "\">" + esc(c.nome) + "</button>" + (c.obs ? '<small class="sub">' + esc(c.obs) + "</small>" : "") + "</td>" +
          '<td data-r="WhatsApp">' + (c.whatsapp ? esc(U.foneBonito(c.whatsapp)) : '<span class="sub">-</span>') + "</td>" +
          '<td data-r="Última visita">' + (c.ultimaVisita ? U.dataBR(c.ultimaVisita) : '<span class="sub">-</span>') + "</td>" +
          '<td class="num" data-r="Visitas">' + (c.visitas || 0) + "</td>" + (dono() ? '<td class="num" data-r="Total gasto">' + brl(c.totalGasto) + "</td>" : "") + '<td class="num" data-r="Faltas">' + (c.faltas || 0) + "</td>" +
          '<td class="acoes">' + (zapOk ? '<a class="btn-ic" href="' + U.linkZap(c.whatsapp, "Olá, " + c.nome.split(" ")[0] + "! ") + '" target="_blank" rel="noopener" aria-label="WhatsApp de ' + esc(c.nome) + '">' + Icone("whatsapp") + "</a>" : "") +
          '<button class="btn-ic" data-editar="' + c.id + '" aria-label="Editar ' + esc(c.nome) + '">' + Icone("editar") + "</button>" +
          (dono() ? '<button class="btn-ic btn-ic--perigo" data-apagar="' + c.id + '" aria-label="Apagar ' + esc(c.nome) + '">' + Icone("lixo") + "</button>" : "") + "</td></tr>";
      }).join("") : '<tr><td colspan="7" class="vazio">' + (base.length ? "Nada encontrado." : filtro === "sumidos" ? "Nenhum cliente sumido. Ótimo sinal!" : "Nenhum cliente ainda. Eles entram sozinhos quando você marca um horário.") + "</td></tr>";
    }

    async function editar(c) {
      c = c || {};
      var r = await janela(c.id ? "Editar cliente" : "Novo cliente",
        '<label>Nome e sobrenome<input name="nome" required maxlength="80" pattern="\\S+(\\s+\\S+)+\\s*" autocomplete="off" data-erro="Digite o nome e o sobrenome do cliente (ex.: Carlos Souza)." value="' + esc(c.nome) + '"></label>' +
        '<label>WhatsApp<input name="whatsapp" type="tel" inputmode="tel" maxlength="20" value="' + esc(c.whatsapp) + '" placeholder="(11) 98765-4321"></label>' +
        '<label>Observações <span class="opc">(alergias, preferências...)</span><input name="obs" maxlength="300" value="' + esc(c.obs) + '"></label>' +
        '<label class="check"><input type="checkbox" name="aceitaNovidades"' + (c.aceitaNovidades ? " checked" : "") + '> Aceita receber avisos de horários livres e novidades pelo WhatsApp</label>');
      if (!r) return;
      await Nuvem.salvar("clientes", Object.assign({ visitas: 0, totalGasto: 0, faltas: 0 }, c, r));
      aviso(c.id ? "Cliente atualizado." : "Cliente cadastrado.");
    }

    async function historico(c) {
      var j = janelaAbrir(c.nome, '<p class="sub">Carregando histórico...</p>', "", false, true);
      var lista = (await Nuvem.agsDoCliente(c.id)).sort(function (a, b) { return (b.data + b.inicio).localeCompare(a.data + a.inicio); });
      var form = j.form;
      form.querySelector("p.sub").outerHTML =
        '<p class="hist__resumo">' + (c.visitas || 0) + " visita(s) · " + (dono() ? brl(c.totalGasto) + " · " : "") + (c.faltas || 0) + " falta(s)" + (c.whatsapp ? " · " + esc(U.foneBonito(c.whatsapp)) : "") + "</p>" +
        (lista.length ? '<ul class="hist">' + lista.map(function (a) {
          return "<li><span>" + U.dataBR(a.data) + " " + a.inicio + "</span><span>" + esc(a.servicoNome) + "</span><span>" + brl(a.preco) + "</span>" + tagStatus(a.status) + "</li>";
        }).join("") + "</ul>" : '<p class="sub">Nenhum atendimento ainda.</p>');
    }

    desenhar();
    $("#busca").addEventListener("input", function (e) { desenhar(e.target.value); });
    $("#novo").onclick = function () { editar(); };
    $$("[data-f]", el).forEach(function (b) { b.onclick = function () { el.dataset.filtro = b.dataset.f; TELAS.clientes(el); }; });
    if ($("#importar", el)) $("#importar", el).onclick = function () { importarClientes(function () { TELAS.clientes(el); }); };
    $("#linhas").addEventListener("click", async function (e) {
      var b = e.target.closest("button"); if (!b) return;
      var c = cliente(b.dataset.editar || b.dataset.apagar || b.dataset.hist); if (!c) return;
      if (b.dataset.hist) return historico(c);
      if (b.dataset.editar) return editar(c);
      if (b.dataset.apagar && await confirmar("Apagar cliente?", "\"" + c.nome + "\" será apagado da lista. Os horários já marcados continuam na agenda.")) {
        await Nuvem.apagar("clientes", c.id); aviso("Cliente apagado.");
      }
    });
  };

  TELAS.equipe = async function (el) {
    if (!dono()) { location.hash = "#agenda"; return; }
    var a = Nuvem.assinatura();
    var removidos = S.profissionais.filter(function (p) { return p.removido; }).length;
    var todos = S.profissionais.filter(function (p) { return !p.removido; }).sort(function (x, y) { return (y.ativo - x.ativo) || ((x.vaga || 99) - (y.vaga || 99)) || x.nome.localeCompare(y.nome, "pt-BR"); });
    var ativos = todos.filter(function (p) { return p.ativo; });
    var euAtendo = ativos.some(function (p) { return p.ehDono; });
    var servs = S.servicos.slice().sort(function (x, y) { return x.nome.localeCompare(y.nome, "pt-BR"); });

    el.innerHTML =
      '<header class="topo"><div><h1>Equipe</h1><p class="sub">Quem atende no salão. Cada profissional tem login próprio e vê só a agenda dele.</p></div>' +
      '<button class="btn btn--pri" id="convidar">' + Icone("mais") + "Convidar profissional</button></header>" +
      '<div class="vagas"><div><strong>' + ativos.length + " de " + a.limite + "</strong> vagas usadas · Plano " + esc(a.planoNome) + '</div><div class="vagas__barra"><i style="width:' + Math.min(100, ativos.length / a.limite * 100) + '%"></i></div>' +
      (ativos.length >= a.limite ? '<p class="sub">Todas as vagas estão ocupadas. Para mais profissionais, troque de plano (Equipe: até 5 · Salão: até 10).</p>' : "") + "</div>" +
      '<section class="painel"><label class="check check--grande" style="margin:0"><input type="checkbox" id="euAtendo"' + (euAtendo ? " checked" : "") + "> Eu também atendo clientes</label>" +
      '<p>Ligado: você aparece na agenda e no link, e ocupa uma vaga do plano. Desligado: você só administra.</p></section>' +
      '<div class="tabela-wrap"><table class="tabela tabela--resp"><thead><tr><th>Profissional</th><th>E-mail</th><th>Situação</th><th>Serviços</th><th><span class="sr">Ações</span></th></tr></thead><tbody id="linhas">' +
      (todos.length ? todos.map(function (p) {
        var sit = !p.ativo ? '<span class="tag tag--cinza">Desativado</span>' : p.ehDono ? '<span class="tag tag--ok">Você</span>' : p.uid ? '<span class="tag tag--ok">Ativo</span>' : '<span class="tag tag--alerta">Aguardando aceitar o convite</span>';
        var nServ = p.servicos && p.servicos.length ? p.servicos.length + " de " + servs.length : "Todos";
        var rf = regraFutura(p);
        return '<tr><td data-r="Profissional">' + (p.ativo ? chipProf(p.id) + " " : "") + esc(p.nome) +
          (p.ehDono ? "" : '<span class="sub linha-com">' + esc(regraTexto(regraEm(p, U.hojeISO()))) + (rf ? " · muda em " + U.dataCurta(rf.desde) : "") + "</span>") + "</td>" +
          '<td data-r="E-mail">' + esc(p.email || "-") + '</td><td data-r="Situação">' + sit + '</td><td data-r="Serviços">' + nServ + "</td>" +
          '<td class="acoes">' +
          (p.ativo ? '<button class="btn-ic" data-editar="' + p.id + '" aria-label="Editar ' + esc(p.nome) + '">' + Icone("editar") + "</button>" : "") +
          (p.ativo && !p.uid && !p.ehDono ? '<button class="btn-ic" data-convite="' + p.id + '" aria-label="Enviar convite de novo">' + Icone("whatsapp") + "</button>" : "") +
          (p.ativo && !p.ehDono ? '<button class="btn-ic btn-ic--perigo" data-desativar="' + p.id + '" aria-label="Desativar ' + esc(p.nome) + '">' + Icone("x") + "</button>" : "") +
          (!p.ativo && !p.ehDono ? '<button class="btn btn--sec btn--peq" data-reativar="' + p.id + '">Reativar</button>' : "") +
          (!p.ativo && !p.ehDono ? '<button class="btn btn--sec btn--peq btn--perigo-txt" data-remover="' + p.id + '">Remover da equipe</button>' : "") +
          "</td></tr>";
      }).join("") : '<tr><td colspan="5" class="vazio">Ninguém na equipe ainda. Ligue "Eu também atendo" ou convide um profissional.</td></tr>') +
      "</tbody></table></div>" +
      (removidos ? '<p class="nota-info" style="margin-top:12px">' + Icone("usuarios") + "<span>" + removidos + (removidos > 1 ? " pessoas removidas" : " pessoa removida") + ' da equipe. Os atendimentos e o faturamento delas continuam no <a href="#relatorio">Relatório</a>.</span></p>' : "") +
      '<p class="sub" style="margin-top:12px">A comissão de cada profissional você define no lápis de editar. O acerto fica em <a href="#comissoes">Comissões</a>.</p>';

    function checksServicos(sel) {
      if (!servs.length) return '<p class="sub">Cadastre os serviços para escolher o que cada um faz. Por enquanto: todos.</p>';
      return '<fieldset class="checks"><legend>Serviços que faz <span class="opc">(nenhum marcado = todos)</span></legend>' + servs.map(function (s) {
        return '<label class="check"><input type="checkbox" name="serv_' + s.id + '"' + (sel && sel.indexOf(s.id) !== -1 ? " checked" : "") + "> " + esc(s.nome) + "</label>";
      }).join("") + "</fieldset>";
    }
    function lerServicos(r) { return servs.filter(function (s) { return r["serv_" + s.id]; }).map(function (s) { return s.id; }); }

    function mostrarConvite(nome, zap, link) {
      var msg = "Olá, " + nome.split(" ")[0] + "! Você foi convidado(a) para a agenda do " + nomeNegocio() + ". Crie sua senha por este link: " + link;
      janelaAbrir("Convite pronto",
        "<p>Envie este link para <strong>" + esc(nome) + "</strong>. Ele(a) cria a senha com o e-mail convidado e já entra na agenda. O link vale por 14 dias.</p>" +
        '<p class="sub">Sem o link também funciona: ele(a) abre a mesma tela de entrada do app, toca em <b>Criar minha conta</b> e usa o e-mail que você cadastrou. O sistema encontra o convite sozinho.</p>' +
        '<div class="link-box"><code id="linkConvite">' + esc(link) + "</code></div>" +
        '<div class="atalhos"><a class="btn btn--zap" href="' + (zap ? U.linkZap(zap, msg) : "https://wa.me/?text=" + encodeURIComponent(msg)) + '" target="_blank" rel="noopener">' + Icone("whatsapp") + "Enviar no WhatsApp</a>" +
        '<button type="button" class="btn btn--sec" id="copiarConvite">' + Icone("copiar") + "Copiar link</button></div>", "", false, true);
      $("#copiarConvite").onclick = function () { (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () { aviso("Link copiado."); }, function () { aviso("Selecione e copie o link.", "erro"); }); };
    }

    $("#euAtendo").onchange = async function (e) {
      var liga = e.target.checked;
      if (!liga && !(await confirmar("Parar de atender?", "Você sai da agenda e do link e libera uma vaga. Seus horários já marcados continuam na agenda.", "Parar de atender", false))) { e.target.checked = true; return; }
      try { await Nuvem.donoAtende(liga); aviso(liga ? "Pronto: você aparece na agenda." : "Pronto: você só administra."); }
      catch (err) { e.target.checked = !liga; aviso(err.message || Nuvem.traduzir(err), "erro"); }
    };

    $("#convidar").onclick = async function () {
      if (ativos.length >= a.limite) { aviso("Todas as vagas do plano " + a.planoNome + " estão ocupadas.", "erro"); return; }
      if (!navigator.onLine) { aviso("Conecte-se à internet para convidar.", "erro"); return; }
      var r = await janela("Convidar profissional",
        '<label>Nome e sobrenome<input name="nome" required maxlength="60" pattern="\\S+(\\s+\\S+)+\\s*" data-erro="Digite o nome e o sobrenome do profissional (ex.: Carlos Souza)."></label>' +
        '<label>E-mail <span class="opc">(ele vai entrar com este e-mail)</span><input name="email" type="email" required data-erro="Digite o e-mail do profissional."></label>' +
        '<label>WhatsApp <span class="opc">(para enviar o convite)</span><input name="whatsapp" type="tel" inputmode="tel" maxlength="20"></label>' +
        checksServicos([]), "Criar convite");
      if (!r) return;
      try {
        var res = await Nuvem.convidarProfissional({ nome: r.nome, email: r.email, whatsapp: r.whatsapp, servicos: lerServicos(r) });
        mostrarConvite(r.nome, r.whatsapp, res.link);
      } catch (err) { aviso(err.message || Nuvem.traduzir(err), "erro"); }
    };

    $("#linhas").onclick = async function (e) {
      var b = e.target.closest("button"); if (!b) return;
      var p = prof(b.dataset.editar || b.dataset.convite || b.dataset.desativar || b.dataset.reativar || b.dataset.remover); if (!p) return;
      try {
        if (b.dataset.editar) {
          var jp = janelaAbrir("Editar " + p.nome,
            '<label>Nome e sobrenome<input name="nome" required maxlength="60" pattern="\\S+(\\s+\\S+)+\\s*" data-erro="Digite o nome e o sobrenome (ex.: Carlos Souza)." value="' + esc(p.nome) + '"></label>' +
            '<label>WhatsApp<input name="whatsapp" type="tel" inputmode="tel" maxlength="20" value="' + esc(p.whatsapp) + '"></label>' +
            '<fieldset class="cores"><legend>Cor na agenda</legend>' + Nuvem.CORES.map(function (c, i) {
              return '<label class="cor"><input type="radio" name="cor" value="' + c + '"' + (p.cor === c ? " checked" : "") + '><span style="background:' + c + '"></span><span class="sr">Cor ' + (i + 1) + "</span></label>";
            }).join("") + "</fieldset>" + checksServicos(p.servicos || []) + camposDuracoes(p) + (p.ehDono ? "" : camposComissao(p)));
          ligarCamposComissao(jp.form);
          var r = await jp.resultado;
          if (!r) return;
          var listaCom = p.ehDono ? null : novaListaComissoes(p, r);
          var dadosP = { nome: r.nome, whatsapp: r.whatsapp, cor: r.cor || p.cor, servicos: lerServicos(r), duracoes: lerDuracoes(r) };
          if (listaCom) dadosP.comissoes = listaCom;
          await Nuvem.salvarProfissional(Object.assign({}, p, dadosP));
          var nv = listaCom && listaCom[listaCom.length - 1];
          aviso(nv && nv.desde > U.hojeISO() ? "Salvo. A nova comissão vale a partir de " + U.dataCurta(nv.desde) + " e " + p.nome.split(" ")[0] + " vai receber o aviso." : "Profissional atualizado.");
        }
        if (b.dataset.convite) mostrarConvite(p.nome, p.whatsapp, await Nuvem.novoConvite(p));
        if (b.dataset.desativar && await confirmar("Desativar " + p.nome + "?", "Ele(a) perde o acesso, sai do link e libera uma vaga. Os horários já marcados continuam na agenda. Dá para reativar depois.", "Desativar")) {
          await Nuvem.desativarProfissional(p); aviso("Profissional desativado.");
        }
        if (b.dataset.reativar) { await Nuvem.reativarProfissional(p); aviso("Profissional reativado."); }
        if (b.dataset.remover && await confirmar("Remover " + p.nome + " da equipe?",
            "Ele(a) sai desta lista e não poderá ser reativado(a). Se voltar a trabalhar com você, é só mandar um convite novo. " +
            "Nada se perde: os atendimentos, o faturamento e as faltas dele(a) continuam guardados e aparecem no Relatório, em \"Por profissional\", nos meses em que trabalhou.",
            "Remover da equipe")) {
          await Nuvem.removerProfissional(p); aviso(p.nome + " foi removido(a) da equipe. O histórico continua no Relatório.");
        }
      } catch (err) { aviso(err.message || Nuvem.traduzir(err), "erro"); }
    };
  };

  TELAS.servicos = async function (el) {
    var todos = S.servicos.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, "pt-BR"); });
    el.innerHTML =
      '<header class="topo"><div><h1>Serviços</h1><p class="sub">O que você faz, quanto tempo leva e quanto custa. Aparecem no seu link de agendamento.</p></div>' +
      '<button class="btn btn--pri" id="novo">' + Icone("mais") + "Novo serviço</button></header>" +
      '<div class="tabela-wrap"><table class="tabela tabela--resp"><thead><tr><th>Serviço</th><th>Duração</th><th class="num">Preço</th><th>No link</th><th><span class="sr">Ações</span></th></tr></thead><tbody>' +
      (todos.length ? todos.map(function (s) {
        return '<tr><td data-r="Serviço"><span class="bolinha" style="background:' + esc(s.cor || CORES[0]) + '"></span>' + esc(s.nome) + "</td>" +
          '<td data-r="Duração">' + U.duracaoTexto(s.duracao) + '</td><td class="num" data-r="Preço">' + brl(s.preco) + "</td>" +
          '<td data-r="No link">' + (s.publico !== false ? '<span class="tag tag--ok">Aparece</span>' : '<span class="tag tag--cinza">Escondido</span>') + "</td>" +
          '<td class="acoes"><button class="btn-ic" data-editar="' + s.id + '" aria-label="Editar ' + esc(s.nome) + '">' + Icone("editar") + "</button>" +
          '<button class="btn-ic btn-ic--perigo" data-apagar="' + s.id + '" aria-label="Apagar ' + esc(s.nome) + '">' + Icone("lixo") + "</button></td></tr>";
      }).join("") : '<tr><td colspan="5" class="vazio">Nenhum serviço ainda. Clique em "Novo serviço" e cadastre o primeiro (ex.: Corte, 30 min, R$ 35).</td></tr>') +
      "</tbody></table></div>";

    async function editar(s) {
      s = s || { duracao: 30, cor: CORES[todos.length % CORES.length], publico: true, mostrarPreco: true };
      var durs = [15, 30, 45, 60, 75, 90, 105, 120, 150, 180, 210, 240, 300, 360, 480];
      var r = await janela(s.id ? "Editar serviço" : "Novo serviço",
        '<label>Nome do serviço<input name="nome" required maxlength="60" data-erro="Digite o nome do serviço." value="' + esc(s.nome) + '" placeholder="Ex.: Corte masculino"></label>' +
        '<div class="duas"><label>Duração<select name="duracao">' + durs.map(function (d) { return '<option value="' + d + '"' + (d === Number(s.duracao) ? " selected" : "") + ">" + U.duracaoTexto(d) + "</option>"; }).join("") + "</select></label>" +
        '<label>Preço (R$)<input name="preco" type="number" min="0" step="0.01" inputmode="decimal" required data-erro="Digite o preço (pode ser 0)." value="' + esc(s.preco) + '"></label></div>' +
        '<fieldset class="cores"><legend>Cor na agenda</legend>' + CORES.map(function (c, i) {
          return '<label class="cor"><input type="radio" name="cor" value="' + c + '"' + ((s.cor || CORES[0]) === c ? " checked" : "") + '><span style="background:' + c + '"></span><span class="sr">Cor ' + (i + 1) + "</span></label>";
        }).join("") + "</fieldset>" +
        '<label class="check"><input type="checkbox" name="publico"' + (s.publico !== false ? " checked" : "") + "> Mostrar no meu link de agendamento</label>" +
        '<label class="check"><input type="checkbox" name="mostrarPreco"' + (s.mostrarPreco !== false ? " checked" : "") + "> Mostrar o preço no link</label>");
      if (!r) return;
      r.duracao = Number(r.duracao);
      await Nuvem.salvar("servicos", Object.assign({}, s, r));
      aviso(s.id ? "Serviço atualizado." : "Serviço cadastrado.");
    }

    $("#novo").onclick = function () { editar(); };
    el.querySelector("tbody").onclick = async function (e) {
      var b = e.target.closest("button"); if (!b) return;
      var s = servico(b.dataset.editar || b.dataset.apagar); if (!s) return;
      if (b.dataset.editar) return editar(s);
      if (await confirmar("Apagar serviço?", "\"" + s.nome + "\" sai da lista e do seu link. Os horários já marcados continuam na agenda.")) {
        await Nuvem.apagar("servicos", s.id); aviso("Serviço apagado.");
      }
    };
  };

  TELAS.horarios = async function (el) {
    var p = S.perfil || {};
    var h = Object.assign({}, HORARIOS_PADRAO, p.horarios || {});
    var hoje = U.hojeISO();
    var bloqs = S.bloqueios.filter(function (b) { return b.data >= hoje && (dono() || b.profId === Nuvem.meuProfId()); }).sort(function (a, b) { return (a.data + (a.inicio || "")).localeCompare(b.data + (b.inicio || "")); });
    var ordem = [1, 2, 3, 4, 5, 6, 0];
    var ante = [0, 1, 2, 3, 6, 12, 24, 48], frente = [7, 15, 30, 60, 90];

    var formHor = !dono() ? "" :
      '<form class="painel" id="formHor"><h2>' + Icone("relogio") + "Horário de funcionamento</h2>" +
      '<p class="sub">Arrume o primeiro dia aberto e toque em <b>Copiar para os outros dias</b> para não precisar repetir.</p>' +
      '<button type="button" class="btn btn--sec btn--peq" id="copiarDias" style="margin-bottom:12px">' + Icone("copiar") + "Copiar o 1º dia aberto para os outros dias abertos</button>" +
      '<div class="dias">' + ordem.map(function (d) {
        var x = h[d] || {};
        return '<div class="dia' + (x.ativo ? "" : " dia--fechado") + '" data-dia="' + d + '">' +
          '<label class="check dia__nome"><input type="checkbox" name="ativo"' + (x.ativo ? " checked" : "") + "> " + U.DIAS[d] + "</label>" +
          '<div class="dia__campos"><label>Abre<input type="time" name="abre" value="' + esc(x.abre || "09:00") + '"></label>' +
          '<label>Fecha<input type="time" name="fecha" value="' + esc(x.fecha || "18:00") + '"></label>' +
          '<label>Intervalo de <span class="opc">(opcional)</span><input type="time" name="pausaIni" value="' + esc(x.pausaIni || "") + '"></label>' +
          '<label>até<input type="time" name="pausaFim" value="' + esc(x.pausaFim || "") + '"></label></div></div>';
      }).join("") + "</div>" +
      '<h2 style="margin-top:22px">' + Icone("link") + "Regras do link de agendamento</h2>" +
      '<div class="duas"><label>Antecedência mínima<select name="antecedenciaHoras">' + ante.map(function (n) { return '<option value="' + n + '"' + (Number(p.antecedenciaHoras || 0) === n ? " selected" : "") + ">" + (n === 0 ? "Sem antecedência" : n + (n === 1 ? " hora" : " horas") + " antes") + "</option>"; }).join("") + "</select></label>" +
      '<label>Cliente pode marcar até<select name="diasAFrente">' + frente.map(function (n) { return '<option value="' + n + '"' + (Number(p.diasAFrente || 30) === n ? " selected" : "") + ">" + n + " dias à frente</option>"; }).join("") + "</select></label></div>" +
      '<label>Intervalo entre atendimentos<select name="intervalo">' + [0, 5, 10, 15, 20, 30].map(function (n) { return '<option value="' + n + '"' + (Number(p.intervalo || 0) === n ? " selected" : "") + ">" + (n ? n + " minutos de folga" : "Sem intervalo") + "</option>"; }).join("") + "</select></label>" +
      '<p class="sub">A folga entre um cliente e outro ajuda a não atrasar (limpar, arrumar, respirar). O link de agendamento respeita.</p>' +
      '<p class="erro" id="horErro" role="alert"></p><div class="atalhos"><button class="btn btn--pri" type="submit">' + Icone("check") + "Salvar horários</button></div></form>";
    el.innerHTML =
      '<header class="topo"><div><h1>' + (dono() ? "Horários" : "Minhas folgas") + '</h1><p class="sub">' + (dono() ? "Quando o salão atende. O link de agendamento só mostra horários dentro disso." : "Marque seus dias de folga e horários em que não vai atender. Ninguém consegue marcar com você nesses horários.") + "</p></div></header>" +
      formHor +
      '<section class="painel" id="painelBloq"><div class="painel__cab"><h2>' + Icone("cadeado") + 'Folgas e bloqueios</h2><button class="btn btn--sec" id="novoBloq">' + Icone("mais") + "Bloquear dia ou horário</button></div>" +
      "<p>Use para feriado, folga, consulta médica, curso... Nesses horários ninguém consegue marcar pelo link.</p>" +
      (bloqs.length ? '<ul class="lista-bloq">' + bloqs.map(function (b) {
        return "<li><span><b>" + U.dataLonga(b.data) + "</b> · " + (b.diaInteiro ? "Dia inteiro" : b.inicio + " às " + b.fim) + (dono() ? " · " + (b.profId ? esc((prof(b.profId) || {}).nome || "Profissional") : "Salão inteiro") : "") + (b.motivo ? " · " + esc(b.motivo) : "") + '</span><button class="btn-ic btn-ic--perigo" data-apagar="' + b.id + '" aria-label="Apagar bloqueio">' + Icone("lixo") + "</button></li>";
      }).join("") + "</ul>" : '<p class="sub">Nenhum bloqueio marcado.</p>') + "</section>";

    $$(".dia [name=ativo]", el).forEach(function (c) { c.onchange = function () { c.closest(".dia").classList.toggle("dia--fechado", !c.checked); }; });

    if ($("#copiarDias")) $("#copiarDias").onclick = function () {
      var dias = $$("#formHor .dia").filter(function (d) { return $("[name=ativo]", d).checked; });
      if (dias.length < 2) { aviso("Marque pelo menos dois dias abertos."); return; }
      var base = dias[0], campos = $$("input[type=time]", base);
      dias.slice(1).forEach(function (d) { $$("input[type=time]", d).forEach(function (inp, i) { if (campos[i]) inp.value = campos[i].value; }); });
      aviso("Copiado para " + (dias.length - 1) + " dia(s). Agora é só salvar.", "ok");
    };
    if ($("#formHor")) $("#formHor").onsubmit = async function (e) {
      e.preventDefault();
      var novo = {}, erro = "";
      $$(".dia", el).forEach(function (d) {
        var v = function (n) { return $("[name=" + n + "]", d).value; };
        var x = { ativo: $("[name=ativo]", d).checked, abre: v("abre"), fecha: v("fecha"), pausaIni: v("pausaIni"), pausaFim: v("pausaFim") };
        if (x.ativo && (!x.abre || !x.fecha || U.min(x.fecha) <= U.min(x.abre))) erro = U.DIAS[d.dataset.dia] + ": o horário de fechar precisa ser depois do de abrir.";
        if (x.ativo && (!!x.pausaIni !== !!x.pausaFim)) erro = U.DIAS[d.dataset.dia] + ": preencha o início e o fim do intervalo (ou deixe os dois vazios).";
        novo[d.dataset.dia] = x;
      });
      if (erro) { $("#horErro").textContent = erro; return; }
      $("#horErro").textContent = "";
      await Nuvem.salvarPerfil({ horarios: novo, antecedenciaHoras: Number($("[name=antecedenciaHoras]", el).value), diasAFrente: Number($("[name=diasAFrente]", el).value), intervalo: Number($("[name=intervalo]", el).value) || 0, horariosConferidos: true });
      aviso("Horários salvos.");
    };

    $("#novoBloq").onclick = async function () {
      var equipe = profs();
      var j = janelaAbrir("Bloquear dia ou horário",
        (dono() ? '<label>Para quem<select name="profId"><option value="">Salão inteiro (fechado)</option>' + equipe.map(function (p) { return '<option value="' + p.id + '">Folga de ' + esc(p.nome) + "</option>"; }).join("") + "</select></label>" : "") +
        '<label>Dia<input type="date" name="data" required min="' + hoje + '" value="' + hoje + '" data-erro="Escolha o dia."></label>' +
        '<label class="check"><input type="checkbox" name="diaInteiro" checked> Dia inteiro</label>' +
        '<div class="duas" id="bqHoras" hidden><label>De<input type="time" name="inicio" value="12:00"></label><label>Até<input type="time" name="fim" value="13:00"></label></div>' +
        '<label>Motivo <span class="opc">(só você vê)</span><input name="motivo" maxlength="60" placeholder="Ex.: Feriado, médico, curso"></label>', "Bloquear");
      $("[name=diaInteiro]", j.form).onchange = function (e) { $("#bqHoras").hidden = e.target.checked; };
      var r = await j.resultado;
      if (!r) return;
      if (!r.diaInteiro && U.min(r.fim) <= U.min(r.inicio)) { aviso("O horário final precisa ser depois do inicial.", "erro"); return; }
      if (r.diaInteiro) { r.inicio = ""; r.fim = ""; }
      if (!dono()) r.profId = Nuvem.meuProfId();
      r.profId = r.profId || null;
      await Nuvem.salvarBloqueio(r);
      var n = 0; S.ags.forEach(function (a) { if (a.data === r.data && (!r.profId || a.profId === r.profId) && Nuvem.OCUPA[a.status] && (r.diaInteiro || U.sobrepoe(a.inicio, a.fim, r.inicio, r.fim))) n++; });
      aviso(n ? "Bloqueado. Atenção: já existe(m) " + n + " horário(s) marcado(s) nesse período." : "Bloqueio salvo.", n ? "erro" : "ok");
    };
    $("#painelBloq").onclick = async function (e) {
      var b = e.target.closest("[data-apagar]"); if (!b) return;
      var bq = S.bloqueios.find(function (x) { return x.id === b.dataset.apagar; }); if (!bq) return;
      if (await confirmar("Tirar bloqueio?", "O horário volta a ficar disponível no link.", "Tirar bloqueio")) { await Nuvem.apagarBloqueio(bq); aviso("Bloqueio removido."); }
    };
  };

  // QR Code (biblioteca pequena e local, carregada só quando precisa) e cartaz para imprimir
  var qrPronto = null;
  function carregarQR() {
    if (window.qrcode) return Promise.resolve();
    if (!qrPronto) qrPronto = new Promise(function (ok, erro) { var sc = document.createElement("script"); sc.src = "js/vendor/qrcode.js"; sc.onload = ok; sc.onerror = erro; document.head.appendChild(sc); });
    return qrPronto;
  }
  function qrSVG(url) { var q = window.qrcode(0, "M"); q.addData(url); q.make(); return q.createSvgTag({ cellSize: 8, margin: 2, scalable: true }); }
  async function ligarQR(url, p) {
    try { await carregarQR(); } catch (e) { var z = $("#qrImg"); if (z) z.textContent = "Não deu para gerar o QR Code (sem internet?)."; return; }
    var box = $("#qrImg"); if (!box) return;
    box.innerHTML = qrSVG(url);
    $("#btnBaixarQR").onclick = function () {
      var blob = new Blob([qrSVG(url).replace("<svg ", '<svg width="800" height="800" ')], { type: "image/svg+xml" });
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "qrcode-" + (p.slug || "agenda") + ".svg"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    };
    $("#btnCartaz").onclick = function () {
      if (!(S.perfil || {}).linkDivulgado) Nuvem.salvarPerfil({ linkDivulgado: true });
      var c = $("#cartaz"); if (!c) { c = document.createElement("div"); c.id = "cartaz"; document.body.appendChild(c); }
      c.innerHTML = '<div class="cartaz__in"><p class="cartaz__chama">Marque seu horário pelo celular</p><h1>' + esc(p.nome || nomeNegocio()) + "</h1>" +
        '<div class="cartaz__qr">' + qrSVG(url) + '</div><p class="cartaz__passo">Aponte a câmera do celular para o código<br>e escolha o serviço e o horário.</p>' +
        '<p class="cartaz__url">' + esc(url.replace(/^https?:\/\//, "")) + "</p>" + (p.whatsapp ? '<p class="cartaz__zap">Dúvidas? WhatsApp ' + esc(p.whatsapp) + "</p>" : "") +
        '<p class="cartaz__rod">Agendamento por BoosterAgenda</p></div>';
      document.body.classList.add("imprimindo-cartaz");
      setTimeout(function () { window.print(); }, 50);
    };
  }
  window.addEventListener("afterprint", function () { document.body.classList.remove("imprimindo-cartaz"); });

  TELAS.link = async function (el) {
    var p = S.perfil || {};
    var url = p.slug ? urlLink(p.slug) : "";
    el.innerHTML =
      '<header class="topo"><div><h1>Meu link de agendamento</h1><p class="sub">Coloque na bio do Instagram e mande no WhatsApp. O cliente escolhe o serviço e o horário livre, e o horário some na hora para os outros.</p></div></header>' +
      (p.slug ?
        '<section class="painel painel--link"><h2>' + Icone("link") + "Seu link</h2>" +
        '<div class="link-box"><code id="urlLink">' + esc(url) + "</code></div>" +
        '<div class="atalhos"><button class="btn btn--pri" id="copiar">' + Icone("copiar") + 'Copiar link</button><a class="btn btn--sec" href="' + esc(url) + '" target="_blank" rel="noopener">' + Icone("olho") + "Ver como o cliente vê</a>" +
        '<a class="btn btn--sec" href="https://wa.me/?text=' + encodeURIComponent("Agende seu horário comigo por aqui: " + url) + '" target="_blank" rel="noopener">' + Icone("whatsapp") + "Enviar no WhatsApp</a></div>" +
        '<label class="check check--grande"><input type="checkbox" id="linkAtivo"' + (p.publico !== false ? " checked" : "") + "> Link ligado: clientes podem marcar sozinhos</label>" +
        (!S.servicos.some(function (s) { return s.publico !== false; }) ? '<p class="nota nota--alerta">' + Icone("alerta") + '<span>Nenhum serviço aparece no link. <a href="#servicos">Cadastre um serviço</a>.</span></p>' : "") +
        "</section>" +
        '<section class="painel"><h2>' + Icone("link") + "QR Code para o balcão</h2>" +
        '<div class="qr-bloco"><div class="qr-img" id="qrImg" aria-label="QR Code do seu link"></div><div><p>Imprima e deixe no balcão, no espelho ou na porta. O cliente aponta a câmera do celular e já cai na sua página de agendamento.</p>' +
        '<div class="atalhos"><button class="btn btn--pri" id="btnCartaz">' + Icone("baixar") + "Imprimir cartaz</button>" +
        '<button class="btn btn--sec" id="btnBaixarQR">' + Icone("baixar") + "Baixar só o QR Code</button></div>" +
        '<p class="sub">Dica: na janela de impressão, escolha "Salvar como PDF" para mandar para uma gráfica ou imprimir depois.</p></div></div></section>'
        :
        '<form class="painel" id="formEndereco"><h2>' + Icone("link") + "Criar o seu link</h2><p>Escolha um nome curto para o endereço. Só letras, números e hífen.</p>" +
        '<label>Endereço<input name="slug" required minlength="3" maxlength="40" value="' + esc(U.slugify(p.nome)) + '" data-erro="Digite pelo menos 3 letras."></label>' +
        '<p class="sub" id="previa"></p><p class="erro" id="endErro" role="alert"></p><div class="atalhos"><button class="btn btn--pri" type="submit">Criar meu link</button></div></form>') +
      '<form class="painel" id="formPerfil"><h2>' + Icone("usuario") + "O que aparece na página</h2>" +
      '<label>Nome do negócio<input name="nome" required maxlength="60" value="' + esc(p.nome) + '" data-erro="Digite o nome do negócio."></label>' +
      '<div class="duas"><label>WhatsApp<input name="whatsapp" type="tel" inputmode="tel" required maxlength="20" value="' + esc(p.whatsapp) + '" data-erro="Digite o seu WhatsApp."></label>' +
      '<label>Endereço do local <span class="opc">(opcional)</span><input name="endereco" maxlength="120" value="' + esc(p.endereco) + '" placeholder="Rua, número, bairro"></label></div>' +
      '<label>Recado para o cliente <span class="opc">(opcional)</span><input name="recado" maxlength="200" value="' + esc(p.recado) + '" placeholder="Ex.: Tolerância de 10 minutos de atraso."></label>' +
      '<h2 style="margin-top:22px">' + Icone("whatsapp") + "Mensagem de lembrete</h2>" +
      '<p>Texto que abre no WhatsApp quando você clica em "Lembrar". Pode usar: <code>{cliente}</code> <code>{servico}</code> <code>{quando}</code> <code>{data}</code> <code>{hora}</code> <code>{negocio}</code> <code>{link}</code> (link para o cliente confirmar ou desmarcar; se não usar, ele vai no fim)</p>' +
      '<textarea name="msgLembrete" rows="3" maxlength="500">' + esc(p.msgLembrete || MSG_LEMBRETE) + "</textarea>" +
      '<p class="erro" role="alert" id="perfErro"></p><div class="atalhos"><button class="btn btn--pri" type="submit">' + Icone("check") + "Salvar</button>" +
      (p.slug ? '<button class="btn btn--sec" type="button" id="trocarEnd">Trocar o endereço do link</button>' : "") + "</div></form>";

    if (p.slug) {
      ligarQR(url, p);
      $("#copiar").onclick = function () {
        if (!(S.perfil || {}).linkDivulgado) Nuvem.salvarPerfil({ linkDivulgado: true });
        (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { aviso("Link copiado."); }, function () {
          var r = document.createRange(); r.selectNodeContents($("#urlLink")); var s = getSelection(); s.removeAllRanges(); s.addRange(r); aviso("Selecione e copie o link.", "erro");
        });
      };
      $("#linkAtivo").onchange = async function (e) {
        await Nuvem.salvarPerfil({ publico: e.target.checked });
        aviso(e.target.checked ? "Link ligado." : "Link desligado. Clientes veem um aviso para chamar no WhatsApp.");
      };
      $("#trocarEnd").onclick = async function () {
        var r = await janela("Trocar o endereço do link", '<p>Atenção: o link antigo para de funcionar. Atualize a bio do Instagram depois.</p><label>Novo endereço<input name="slug" required minlength="3" maxlength="40" value="' + esc(p.slug) + '"></label>', "Trocar");
        if (!r) return;
        try { await Nuvem.definirEndereco(r.slug); aviso("Endereço trocado."); TELAS.link(el); } catch (err) { aviso(err.message, "erro"); }
      };
    } else {
      var inp = $("#formEndereco [name=slug]");
      var prev = function () { $("#previa").textContent = "Seu link vai ficar: " + urlLink(U.slugify(inp.value) || "..."); };
      inp.oninput = prev; prev();
      $("#formEndereco").onsubmit = async function (e) {
        e.preventDefault();
        if (!navigator.onLine) { $("#endErro").textContent = "Conecte-se à internet para criar o link."; return; }
        $("#endErro").textContent = "Criando...";
        try { await Nuvem.definirEndereco(inp.value); aviso("Link criado!"); TELAS.link(el); }
        catch (err) { $("#endErro").textContent = err.message || Nuvem.traduzir(err); }
      };
    }
    $("#formPerfil").onsubmit = async function (e) {
      e.preventDefault();
      var f = e.target, inval = f.querySelector(":invalid");
      if (inval) { $("#perfErro").textContent = inval.dataset.erro || "Preencha os campos obrigatórios."; inval.focus(); return; }
      $("#perfErro").textContent = "";
      var d = {}; ["nome", "whatsapp", "endereco", "recado", "msgLembrete"].forEach(function (n) { d[n] = f[n].value.trim(); });
      await Nuvem.salvarPerfil(d);
      aviso("Salvo.");
    };
  };

  function relatorioResumo(el, r, d0, ir) {
    el.innerHTML =
      '<header class="topo"><div><h1>Relatório do mês</h1><p class="sub">' + (r ? "Resumo guardado. Os detalhes de cada atendimento são apagados automaticamente depois de 12 meses." : "Os detalhes deste mês já foram apagados automaticamente (mais de 12 meses) e não há resumo guardado.") + "</p></div>" +
      '<div class="grupo"><button class="btn-ic" id="mAnt" aria-label="Mês anterior">' + Icone("esq") + '</button><strong class="mes">' + U.MESES[d0.getMonth()] + " de " + d0.getFullYear() + '</strong><button class="btn-ic" id="mProx" aria-label="Próximo mês">' + Icone("dir") + "</button></div></header>" +
      (r ? '<div class="cards">' +
        '<div class="card"><span class="card__rot">Faturamento</span><strong class="card__num">' + brl(r.fat) + '</strong><span class="sub">Ticket médio ' + brl(r.concluidos ? r.fat / r.concluidos : 0) + "</span></div>" +
        '<div class="card"><span class="card__rot">Atendimentos concluídos</span><strong class="card__num">' + r.concluidos + "</strong></div>" +
        '<div class="card"><span class="card__rot">Faltas</span><strong class="card__num">' + r.faltas + "</strong></div>" +
        '<div class="card"><span class="card__rot">Marcados pelo link</span><strong class="card__num">' + r.online + '</strong><span class="sub">' + r.cancelados + " cancelado(s) · " + r.novosClientes + " cliente(s) novo(s)</span></div></div>" +
        '<section class="painel" style="margin-top:16px"><h2>' + Icone("estrela") + "Serviços mais feitos</h2>" +
        (r.porServ.length ? '<ul class="ranking">' + r.porServ.slice().sort(function (a, b) { return b.n - a.n; }).map(function (x) { return '<li><span class="ranking__nome">' + esc(x.nome) + '</span><span class="ranking__n">' + x.n + "x · " + brl(x.v) + "</span></li>"; }).join("") + "</ul>" : "<p>Nenhum atendimento concluído.</p>") + "</section>" +
        (r.porProf.length > 1 ? '<section class="painel"><h2>' + Icone("usuarios") + 'Por profissional</h2><div class="tabela-wrap"><table class="tabela tabela--resp"><thead><tr><th>Profissional</th><th class="num">Atendimentos</th><th class="num">Faturamento</th><th class="num">Faltas</th></tr></thead><tbody>' +
          r.porProf.map(function (x) { return '<tr><td data-r="Profissional">' + esc(x.nome) + '</td><td class="num" data-r="Atendimentos">' + x.n + '</td><td class="num" data-r="Faturamento">' + brl(x.v) + '</td><td class="num" data-r="Faltas">' + x.f + "</td></tr>"; }).join("") + "</tbody></table></div></section>" : "")
        : "");
    $("#mAnt").onclick = function () { ir(-1); };
    $("#mProx").onclick = function () { ir(1); };
  }

  TELAS.relatorio = async function (el) {
    var mes = el.dataset.mes || U.hojeISO().slice(0, 7);
    var de = mes + "-01", ate = mes + "-31";
    var d0 = U.dataDe(de);
    el.innerHTML = '<header class="topo"><div><h1>Relatório do mês</h1><p class="sub">Carregando...</p></div></header>';
    var ags = await Nuvem.agsEntre(de, ate);
    function ir(n) { var d = U.dataDe(de); d.setMonth(d.getMonth() + n); el.dataset.mes = U.isoDe(d).slice(0, 7); TELAS.relatorio(el); }
    // Mês antigo cujos detalhes já foram apagados (12 meses): mostra o resumo guardado
    var limite = (function () { var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 11); return U.isoDe(d).slice(0, 7); })();
    if (dono() && (mes < limite || !ags.length)) {
      var rs = await Nuvem.lerResumo(mes);
      if (rs && (mes < limite || rs.concluidos || rs.faltas)) return relatorioResumo(el, rs, d0, ir);
      if (mes < limite) return relatorioResumo(el, null, d0, ir);
    }
    var concl = ags.filter(function (a) { return a.status === "concluido"; });
    var faltas = ags.filter(function (a) { return a.status === "faltou"; });
    var canc = ags.filter(function (a) { return a.status === "cancelado"; });
    var pend = ags.filter(function (a) { return a.status === "marcado" || a.status === "confirmado"; });
    var online = ags.filter(function (a) { return a.origem === "online" && a.status !== "cancelado"; });
    var fat = concl.reduce(function (t, a) { return t + (Number(a.preco) || 0); }, 0);
    var baseFalta = concl.length + faltas.length;
    var porServ = {};
    concl.forEach(function (a) { var k = a.servicoNome || "(sem serviço)"; var x = porServ[k] || (porServ[k] = { n: 0, v: 0 }); x.n++; x.v += Number(a.preco) || 0; });
    var ranking = Object.keys(porServ).map(function (k) { return { nome: k, n: porServ[k].n, v: porServ[k].v }; }).sort(function (a, b) { return b.n - a.n || b.v - a.v; });
    var novosClientes = S.clientes.filter(function (c) { return c.criadoEm && c.criadoEm.slice(0, 7) === mes; }).length;
    var maxN = ranking.length ? ranking[0].n : 1;
    // Por profissional (só o dono vê)
    // Entra quem está ativo e também quem saiu (desativado ou removido) mas trabalhou neste mês
    var idsMes = {};
    concl.concat(faltas, pend).forEach(function (a) { if (a.profId) idsMes[a.profId] = a.profNome || "Profissional"; });
    var listaProf = profs().slice();
    Object.keys(idsMes).forEach(function (id) {
      if (listaProf.some(function (p) { return p.id === id; })) return;
      listaProf.push(prof(id) || { id: id, nome: idsMes[id], ativo: false, removido: true });
    });
    var porProf = listaProf.map(function (p) {
      var c = concl.filter(function (a) { return a.profId === p.id; });
      return { p: p, n: c.length, v: c.reduce(function (t, a) { return t + (Number(a.preco) || 0); }, 0), f: faltas.filter(function (a) { return a.profId === p.id; }).length };
    });
    function saiu(p) { return p.ativo ? "" : ' <span class="tag tag--cinza">' + (p.removido ? "Saiu da equipe" : "Desativado") + "</span>"; }

    el.innerHTML =
      '<header class="topo"><div><h1>' + (dono() ? "Relatório do mês" : "Meus números do mês") + '</h1><p class="sub">Faturamento conta só os atendimentos marcados como "Concluído".</p></div>' +
      '<div class="grupo"><button class="btn-ic" id="mAnt" aria-label="Mês anterior">' + Icone("esq") + '</button><strong class="mes">' + U.MESES[d0.getMonth()] + " de " + d0.getFullYear() + '</strong><button class="btn-ic" id="mProx" aria-label="Próximo mês">' + Icone("dir") + "</button></div></header>" +
      '<div class="cards">' +
      '<div class="card"><span class="card__rot">' + (dono() ? "Faturamento" : "Meus atendimentos somam") + '</span><strong class="card__num">' + brl(fat) + '</strong><span class="sub">Ticket médio ' + brl(concl.length ? fat / concl.length : 0) + "</span></div>" +
      '<div class="card"><span class="card__rot">Atendimentos concluídos</span><strong class="card__num">' + concl.length + "</strong>" + (pend.length ? '<span class="sub">+ ' + pend.length + " ainda marcado(s)</span>" : "") + "</div>" +
      '<div class="card"><span class="card__rot">Faltas</span><strong class="card__num">' + faltas.length + '</strong><span class="sub">' + (baseFalta ? Math.round(faltas.length / baseFalta * 100) : 0) + "% dos atendimentos</span></div>" +
      '<div class="card"><span class="card__rot">Marcados pelo link</span><strong class="card__num">' + online.length + '</strong><span class="sub">' + canc.length + " cancelado(s) · " + novosClientes + " cliente(s) novo(s)</span></div></div>" +
      '<section class="painel" style="margin-top:16px"><h2>' + Icone("estrela") + "Serviços mais feitos</h2>" +
      (ranking.length ? '<ul class="ranking">' + ranking.map(function (r) {
        return '<li><span class="ranking__nome">' + esc(r.nome) + '</span><span class="ranking__barra"><i style="width:' + Math.max(6, r.n / maxN * 100) + '%"></i></span><span class="ranking__n">' + r.n + "x · " + brl(r.v) + "</span></li>";
      }).join("") + "</ul>" : "<p>Nenhum atendimento concluído neste mês ainda.</p>") + "</section>" +
      (dono() && porProf.length > 1 ? '<section class="painel"><h2>' + Icone("usuarios") + "Por profissional</h2>" +
        '<div class="tabela-wrap"><table class="tabela tabela--resp"><thead><tr><th>Profissional</th><th class="num">Atendimentos</th><th class="num">Faturamento</th><th class="num">Faltas</th></tr></thead><tbody>' +
        porProf.map(function (x) { return '<tr><td data-r="Profissional">' + chipProf(x.p.id) + " " + esc(x.p.nome) + saiu(x.p) + '</td><td class="num" data-r="Atendimentos">' + x.n + '</td><td class="num" data-r="Faturamento">' + brl(x.v) + '</td><td class="num" data-r="Faltas">' + x.f + "</td></tr>"; }).join("") +
        "</tbody></table></div><p class=\"sub\" style=\"margin-top:10px\">O acerto com comissões chega na próxima atualização.</p></section>" : "");

    $("#mAnt").onclick = function () { ir(-1); };
    $("#mProx").onclick = function () { ir(1); };
  };

  // Abas da tela Conta: cada assunto no seu lugar, com uma linha explicando
  var abaConta = "";
  function abasConta(L) {
    if (!L.some(function (x) { return x[0] === abaConta; })) abaConta = L[0][0];
    return '<nav class="abas-conta" role="tablist" aria-label="Partes da conta">' + L.map(function (x) {
      return '<button type="button" role="tab" data-aba-btn="' + x[0] + '" aria-selected="' + (x[0] === abaConta) + '"><b>' + x[1] + "</b><small>" + x[2] + "</small></button>";
    }).join("") + "</nav>";
  }
  function ligarAbasConta(el) {
    function mostra() { $$("[data-aba]", el).forEach(function (d) { d.hidden = d.dataset.aba !== abaConta; }); $$("[data-aba-btn]", el).forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.abaBtn === abaConta)); }); }
    $$("[data-aba-btn]", el).forEach(function (b) { b.onclick = function () { abaConta = b.dataset.abaBtn; mostra(); }; });
    mostra();
  }
  TELAS.conta = async function (el) {
    var a = Nuvem.assinatura();
    var contaHTML = '<section class="painel"><h2>' + Icone("usuario") + "Sua conta</h2><p>Você entrou como <strong>" + esc(Nuvem.Conta.email()) + "</strong>" +
      (dono() ? ", dono(a) do salão." : ", profissional do salão <strong>" + esc(nomeNegocio()) + "</strong>.") + "</p>" +
      '<div class="atalhos"><button class="btn btn--sec" id="trocaSenha">' + Icone("chave") + 'Receber e-mail para trocar a senha</button><button class="btn btn--sec" id="sair">' + Icone("sair") + "Sair deste aparelho</button></div></section>";
    if (!dono()) {
      el.innerHTML = '<header class="topo"><div><h1>Minha conta</h1><p class="sub">Seu acesso, aparência do app e ajuda.</p></div></header>' +
        abasConta([["conta", "Minha conta", "Acesso e senha"], ["aparencia", "Aparência", "Tema, sons, instalar"], ["ajuda", "Ajuda", "Dúvidas e sugestões"]]) +
        '<div data-aba="conta">' + contaHTML + '</div><div data-aba="aparencia">' + aparenciaHTML() + '</div><div data-aba="ajuda">' + ajudaHTML() + "</div>";
      ligarConta(); ligarAjuda(); ligarAparencia(); ligarAbasConta(el);
      return;
    }
    el.innerHTML =
      '<header class="topo"><div><h1>Conta</h1><p class="sub">Plano, seu acesso, aparência, ajuda e cópia dos dados. Toque numa aba.</p></div></header>' +
      abasConta([["plano", "Plano", "Assinatura e pagamento"], ["conta", "Minha conta", "Acesso e senha"], ["aparencia", "Aparência", "Tema, sons, instalar"], ["ajuda", "Ajuda", "Dúvidas e sugestões"], ["dados", "Dados", "Backup e privacidade"]]) +
      '<div data-aba="plano"><section class="painel"><h2>' + Icone("estrela") + "Seu plano</h2>" +
      "<p><strong>" + esc(a.planoNome) + "</strong> · até " + a.limite + " profissionais" + (a.status === "teste" ? " · grátis" : " · " + brl(a.preco) + " por mês") + "<br>" +
      statusAssinatura(a, true).texto + "</p>" +
      planosHTML(a) + "</section></div>" +
      '<div data-aba="conta">' + contaHTML + '</div><div data-aba="aparencia">' + aparenciaHTML() + '</div><div data-aba="ajuda">' + ajudaHTML() + "</div>" +
      '<div data-aba="dados"><section class="painel"><h2>' + Icone("pasta") + 'Backup automático <span class="opc">(computador)</span></h2><div id="bkAuto"></div></section>' +
      '<section class="painel"><h2>' + Icone("baixar") + "Backup manual</h2><p>Baixe uma cópia de todos os dados ou restaure a partir de um arquivo de backup.</p>" +
      '<div class="atalhos"><button class="btn btn--sec" id="bkBaixar">' + Icone("baixar") + "Baixar backup agora</button>" +
      '<label class="btn btn--sec">' + Icone("enviar") + 'Restaurar de um arquivo<input type="file" id="bkArquivo" accept=".json,application/json" hidden></label></div></section>' +
      '<section class="painel"><h2>' + Icone("cadeado") + 'Privacidade</h2><p><a href="termos.html" target="_blank">Termos de Uso</a> · <a href="privacidade.html" target="_blank">Política de Privacidade</a></p>' +
      '<details class="zona-perigo"><summary>Excluir minha conta</summary><p>Apaga <b>todos</b> os dados do salão: agenda, clientes, equipe, comissões e relatórios. O acesso é bloqueado na hora, a página de agendamento sai do ar e tudo é apagado em até 7 dias. <b>Não dá para desfazer.</b> Baixe um backup antes, se quiser guardar uma cópia.</p>' +
      '<p>Isso não cancela a cobrança: cancele também a assinatura na Kiwify.</p><button class="btn btn--perigo" id="btnExcluir">' + Icone("lixo") + "Excluir minha conta</button></details></section></div>";
    ligarAbasConta(el);

    function desenharAuto() {
      var b = Backup.estado(), box = $("#bkAuto");
      if (!box) return;
      if (!Backup.suportaPasta) {
        box.innerHTML = '<p class="nota nota--alerta">' + Icone("alerta") + "<span>Neste aparelho não dá para ligar o backup automático em pasta (só no Chrome ou Edge do computador). Seus dados continuam seguros na nuvem, e você pode baixar um backup manual abaixo.</span></p>";
        return;
      }
      if (!b.pasta) {
        box.innerHTML = "<p>Escolha uma pasta do computador. O sistema grava uma cópia sozinho quando algo mudar (no máximo a cada " + APP.backupIntervaloMin + " minutos).</p>" +
          '<button class="btn btn--pri" id="bkEscolher">' + Icone("pasta") + "Escolher pasta de backup</button>";
      } else if (!b.ativo) {
        box.innerHTML = '<p class="nota nota--alerta">' + Icone("alerta") + "<span>O navegador pediu para confirmar a pasta <strong>" + esc(b.nomePasta) + "</strong> de novo.</span></p>" +
          '<button class="btn btn--pri" id="bkReativar">Reativar backup automático</button> <button class="btn btn--sec" id="bkEscolher">Escolher outra pasta</button>';
      } else {
        box.innerHTML = '<p class="nota nota--ok">' + Icone("check") + "<span>Ligado. Pasta: <strong>" + esc(b.nomePasta) + "</strong> · Último backup: " + (b.ultimo ? new Date(b.ultimo).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "nunca") + "</span></p>" +
          '<button class="btn btn--sec" id="bkEscolher">Trocar pasta</button>';
      }
      if (b.erro) box.insertAdjacentHTML("beforeend", '<p class="erro">' + esc(b.erro) + "</p>");
      var e1 = $("#bkEscolher"), e2 = $("#bkReativar");
      if (e1) e1.onclick = function () { Backup.escolherPasta().then(function (ok) { if (ok) aviso("Backup automático ligado."); }).catch(function () {}); };
      if (e2) e2.onclick = function () { Backup.reativar().then(function (ok) { if (ok) aviso("Backup automático reativado."); }); };
    }
    desenharAuto();
    document.addEventListener("backup-status", desenharAuto);

    ligarConta();
    $("#bkBaixar").onclick = function () { Backup.baixar().then(function () { aviso("Backup baixado."); }, function (e) { aviso(Nuvem.traduzir(e), "erro"); }); };
    $("#bkArquivo").onchange = async function (e) {
      var arq = e.target.files[0]; e.target.value = "";
      if (!arq) return;
      if (!(await confirmar("Restaurar backup?", "Os dados atuais serão substituídos pelos dados do arquivo \"" + arq.name + "\".", "Restaurar"))) return;
      try { aviso("Restaurando, aguarde..."); await Backup.restaurar(arq); aviso("Backup restaurado."); } catch (err) { aviso(err.message, "erro"); }
    };
  };

  // Planos e botões de assinar (pagamento pela Kiwify; o robô libera o acesso sozinho)
  function planosHTML(a) {
    if (!dono()) return "";
    var mail = encodeURIComponent(Nuvem.Conta.email() || "");
    var nAtivos = S.profissionais.filter(function (p) { return p.ativo; }).length;
    return '<div class="planos">' + Object.keys(Nuvem.PLANOS).map(function (k) {
      var p = Nuvem.PLANOS[k], link = (APP.checkout || {})[k], atual = a.status === "ativa" && a.plano === k && !a.cancelada;
      var cabe = nAtivos <= p.limite;
      return '<div class="plano' + (atual ? " plano--atual" : "") + '"><b>' + esc(p.nome) + '</b><span class="plano__preco">' + (p.cheio ? '<s class="sub">' + brl(p.cheio) + '</s> ' : '') + brl(p.preco) + '<small>/mês</small></span><span class="sub">até ' + p.limite + " profissionais</span>" +
        (atual ? '<span class="tag tag--ok">Seu plano</span>'
          : !cabe ? '<span class="sub">Você tem ' + nAtivos + " pessoas ativas. Desative alguém antes.</span>"
          : link ? '<a class="btn btn--pri btn--peq" href="' + esc(link) + (link.indexOf("?") === -1 ? "?" : "&") + "email=" + mail + '" target="_blank" rel="noopener">' + (a.status === "ativa" && !a.cancelada ? "Trocar para este" : "Assinar") + "</a>"
          : '<span class="sub">Assinatura em breve</span>') + "</div>";
    }).join("") + "</div>" +
      '<p class="nota nota--ok"><b>Preço de fundador:</b> quem assina agora mantém este valor enquanto continuar assinando.</p>' +
      '<div class="nota" style="margin-top:12px;display:block"><p style="margin:0 0 8px"><b>Importante:</b> na tela de pagamento, use este e-mail:</p>' +
      '<p style="margin:0 0 8px;display:flex;flex-wrap:wrap;gap:8px;align-items:center"><strong style="font-size:1.05rem;word-break:break-all">' + esc(Nuvem.Conta.email() || "") + '</strong>' +
      '<button type="button" class="btn btn--sec btn--peq" id="btnCopiarEmail">' + Icone("copiar") + 'Copiar e-mail</button></p>' +
      '<p class="sub" style="margin:0">É o mesmo e-mail que você usa para entrar no BoosterAgenda. É por ele que o sistema reconhece o seu pagamento e libera o plano em poucos minutos. Se usar outro e-mail, o pagamento não chega até o seu salão.</p></div>' +
      cancelarHTML(a);
  }
  // Cancelar e trocar de plano: o próprio cliente faz na página da Kiwify (sem depender da Sitebooster)
  function cancelarHTML(a) {
    var antigos = Object.keys(a.gerenciar || {}).filter(function (k) { return k !== a.plano && a.gerenciar[k]; });
    var h = "";
    if (a.status === "ativa" && antigos.length) h += '<div class="nota" style="margin-top:12px;display:block"><p style="margin:0 0 8px"><b>Trocou de plano?</b> Cancele o plano antigo para não pagar os dois:</p><div class="atalhos">' +
      antigos.map(function (k) { return '<a class="btn btn--sec btn--peq" href="' + esc(a.gerenciar[k]) + '" target="_blank" rel="noopener">' + Icone("sair") + "Cancelar o plano " + esc((Nuvem.PLANOS[k] || {}).nome || k) + "</a>"; }).join("") + "</div></div>";
    if (a.status === "ativa" && !a.cancelada) h += '<p class="sub" style="margin-top:14px">Para trocar de plano, assine o novo acima' + (antigos.length ? "" : " e depois cancele o antigo pelo botão que vai aparecer aqui") + '.</p>' +
      '<div class="atalhos" style="margin-top:10px"><button type="button" class="btn btn--sec" id="btnCancelarAss">' + Icone("sair") + "Cancelar minha assinatura</button></div>";
    return h;
  }
  function ligarCancelar() {
    var b = $("#btnCancelarAss"); if (!b) return;
    b.onclick = async function () {
      var a = Nuvem.assinatura(), link = (a.gerenciar || {})[a.plano], ate = new Date(a.fim).toLocaleDateString("pt-BR");
      var passos = link
        ? "<p>Vamos abrir a página da sua assinatura na <b>Kiwify</b> (quem cuida dos pagamentos). Lá, toque nos <b>três pontinhos ⋮</b> e depois em <b>Cancelar assinatura</b>.</p>"
        : "<p>O cancelamento é feito na <b>Kiwify</b> (quem cuida dos pagamentos):</p><ol><li>Abra o e-mail da Kiwify <b>“pagamento da sua assinatura foi aprovado”</b>.</li><li>Toque em <b>Gerenciar assinatura</b>.</li><li>Toque nos <b>três pontinhos ⋮</b> e em <b>Cancelar assinatura</b>.</li></ol>" +
          '<p class="sub">Não acha o e-mail? Escreva para <b>' + esc(APP.suporte || "") + "</b> que a gente ajuda.</p>";
      var jn = janelaAbrir("Cancelar a assinatura", passos +
        "<p>Depois de cancelar, você <b>continua usando até " + ate + "</b> e não é cobrado de novo. Seus dados ficam guardados se quiser voltar.</p>" +
        '<p class="sub">Comprou há menos de 7 dias? Você tem direito ao reembolso integral (Código de Defesa do Consumidor). Peça pelo e-mail ' + esc(APP.suporte || "") + ".</p>",
        link ? "Abrir a página de cancelamento" : "Entendi", false);
      $$("#janela button").forEach(function (x) { if (x.textContent.trim() === "Cancelar") x.textContent = "Voltar"; });
      var ok = await jn.resultado;
      if (ok && link) window.open(link, "_blank", "noopener");
    };
  }
  // Aparência (claro/escuro/automático, salvo neste aparelho) e instalar o app
  var pedidoInstalar = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); pedidoInstalar = e; var b = $("#btnInstalar"); if (b) b.hidden = false; });
  window.addEventListener("appinstalled", function () { pedidoInstalar = null; aviso("App instalado! Procure o ícone do BoosterAgenda na tela do aparelho."); });
  function instalado() { try { return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; } catch (e) { return false; } }
  function ehIphone() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }
  function aparenciaHTML() {
    var t = window.Tema ? Tema.escolha() : "auto";
    var op = function (v, rot, ic) { return '<button type="button" data-tema="' + v + '" aria-pressed="' + (t === v) + '">' + Icone(ic) + rot + "</button>"; };
    var inst = instalado() ? '<p class="sub">' + Icone("check") + " O app já está instalado neste aparelho.</p>"
      : ehIphone() ? '<p class="sub">No iPhone: abra no <b>Safari</b>, toque em <b>Compartilhar</b> (o quadrado com a seta) e depois em <b>Adicionar à Tela de Início</b>.</p>'
      : '<p class="sub">Instale para abrir direto pela tela do celular ou do computador, como um aplicativo.</p><div class="atalhos"><button type="button" class="btn btn--sec" id="btnInstalar"' + (pedidoInstalar ? "" : " hidden") + ">" + Icone("baixar") + "Instalar o app</button></div>" +
        (pedidoInstalar ? "" : '<p class="sub" id="dicaInstalar">Se o botão não aparecer: no Chrome, toque no menu <b>⋮</b> e em <b>Instalar app</b> (ou <b>Adicionar à tela inicial</b>).</p>');
    return '<section class="painel"><h2>' + Icone("estrela") + "Aparência e app</h2>" +
      '<p style="margin:0 0 8px">Cores do app neste aparelho:</p><div class="alternar tema-op" role="group" aria-label="Aparência">' +
      op("auto", "Automático", "relogio") + op("claro", "Claro", "estrela") + op("escuro", "Escuro", "olho") + "</div>" +
      '<p class="sub" style="margin-top:6px">Automático segue o modo do celular ou do computador.</p>' +
      '<h3 style="margin:16px 0 6px;font-size:1rem">Sons de aviso</h3>' +
      '<div class="alternar som-op" role="group" aria-label="Sons de aviso"><button type="button" data-som="1" aria-pressed="' + Som.ligado() + '">' + Icone("check") + 'Ligados</button><button type="button" data-som="0" aria-pressed="' + !Som.ligado() + '">' + Icone("x") + "Desligados</button></div>" +
      '<p class="sub" style="margin-top:6px">Toca um som quando um cliente marca, confirma ou desmarca pelo link (com o app aberto). <button type="button" class="link-btn" id="testarSom">Ouvir os sons</button></p>' +
      '<h3 style="margin:16px 0 6px;font-size:1rem">Instalar o app</h3>' + inst + "</section>";
  }
  function ligarAparencia() {
    $$(".tema-op button").forEach(function (b) {
      b.onclick = function () { Tema.definir(b.dataset.tema); $$(".tema-op button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); };
    });
    $$(".som-op button").forEach(function (b) {
      b.onclick = function () { Som.definir(b.dataset.som === "1"); $$(".som-op button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); if (b.dataset.som === "1") Som.tocar("novo"); };
    });
    var ts = $("#testarSom"); if (ts) ts.onclick = function () { Som.tocar("novo", true); setTimeout(function () { Som.tocar("desmarcou", true); }, 900); };
    var bi = $("#btnInstalar"); if (bi) bi.onclick = async function () {
      if (!pedidoInstalar) return;
      pedidoInstalar.prompt(); try { await pedidoInstalar.userChoice; } catch (e) {} pedidoInstalar = null; bi.hidden = true;
    };
  }

  // Ajuda, sugestões e Sobre (dono e profissional)
  function ajudaHTML() {
    var sup = APP.suporte || "";
    return '<section class="painel" id="ajuda"><h2>' + Icone("estrela") + "Ajuda e sugestões</h2>" +
      "<p>Ficou com dúvida, encontrou um problema ou tem uma ideia para melhorar o BoosterAgenda? Conta pra gente: cada mensagem é lida.</p>" +
      '<div class="atalhos"><button type="button" class="btn btn--pri" id="btnSugestao">' + Icone("mais") + "Enviar sugestão ou problema</button>" +
      '<a class="btn btn--sec" href="mailto:' + esc(sup) + '?subject=' + encodeURIComponent("Suporte BoosterAgenda - " + nomeNegocio()) + '">' + Icone("copiar") + "Escrever para o suporte</a></div>" +
      (dono() ? '<div class="atalhos" style="margin-top:8px"><button type="button" class="btn btn--sec" id="btnVerGuia">' + Icone("estrela") + "Ver o guia de primeiros passos de novo</button></div>" : "") +
      '<p class="sub" style="margin-top:10px">Suporte por e-mail: <b>' + esc(sup) + "</b>. A gente responde por e-mail.</p>" +
      '<hr style="border:0;border-top:1px solid rgba(127,127,127,.2);margin:16px 0">' +
      "<h3 style=\"margin:0 0 6px;font-size:1rem\">Sobre</h3>" +
      '<p class="sub" style="margin:0">BoosterAgenda <b>v' + esc(APP.versao || "") + "</b> · um sistema da <b>Sitebooster</b> (sitebooster.com.br)<br>Criado por Antolin Jr.</p>" +
      '<p class="sub" style="margin:8px 0 0"><a href="termos.html" target="_blank" rel="noopener">Termos de Uso</a> · <a href="privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a></p></section>';
  }
  function ligarAjuda() {
    var g = $("#btnVerGuia"); if (g) g.onclick = async function () { await Nuvem.salvarPerfil({ ocultarPassos: false, verPassos: true, passosPulados: [] }); location.hash = "#agenda"; };
    var b = $("#btnSugestao"); if (!b) return;
    b.onclick = async function () {
      var r = await janela("Enviar sugestão ou problema",
        '<label>O que você quer mandar?<select name="tipo"><option value="sugestao">Uma sugestão ou ideia</option><option value="problema">Um problema (algo não funcionou)</option></select></label>' +
        '<label>Escreva aqui<textarea name="texto" rows="5" maxlength="2000" required data-erro="Escreva sua mensagem." placeholder="Ex.: seria ótimo poder... / Quando eu toco em ..., acontece ..."></textarea></label>' +
        '<p class="sub">Se for um problema, conte o que você fez e o que apareceu na tela. Se quiser resposta, escreva também pelo e-mail ' + esc(APP.suporte || "") + ".</p>", "Enviar");
      if (!r || !String(r.texto || "").trim()) return;
      try { await Nuvem.enviarSugestao(String(r.texto).trim(), r.tipo, telaAtual); aviso("Recebemos sua mensagem. Obrigado por ajudar a melhorar o BoosterAgenda!"); }
      catch (e) { aviso("Não deu para enviar agora (sem internet?). Tente de novo ou escreva para " + (APP.suporte || "o suporte") + ".", "erro"); }
    };
  }
  function ligarExcluir() {
    var b = $("#btnExcluir"); if (!b) return;
    b.onclick = async function () {
      var r = await janela("Excluir a conta do salão?",
        "<p>Todos os dados de <b>" + esc(nomeNegocio()) + "</b> serão apagados. Para confirmar, digite <b>EXCLUIR</b> abaixo.</p>" +
        '<label>Confirmação<input name="conf" autocomplete="off" required pattern="EXCLUIR" data-erro="Digite EXCLUIR, em letras maiúsculas."></label>', "Excluir para sempre", true);
      if (!r || r.conf !== "EXCLUIR") return;
      try { await Nuvem.pedirExclusao(); await janela("Conta excluída", "<p>O acesso foi bloqueado e os dados serão apagados em até 7 dias. Obrigado por ter usado o BoosterAgenda.</p><p>Lembre-se de cancelar a assinatura na Kiwify, se tiver uma.</p>", "", false, true); }
      catch (e) { aviso(e.message || Nuvem.traduzir(e), "erro"); return; }
      await Nuvem.Conta.sair(); location.href = location.pathname;
    };
  }
  function ligarConta() {
    var bce = $("#btnCopiarEmail"); if (bce) bce.onclick = function () { var em = Nuvem.Conta.email() || ""; (navigator.clipboard ? navigator.clipboard.writeText(em) : Promise.reject()).then(function () { aviso("E-mail copiado. Cole na tela de pagamento."); }, function () { prompt("Copie o e-mail:", em); }); };
      ligarExcluir(); ligarCancelar(); ligarAjuda(); ligarAparencia();
    $("#trocaSenha").onclick = async function () {
      try { await Nuvem.Conta.recuperar(Nuvem.Conta.email()); aviso("Enviamos um e-mail para trocar a senha."); }
      catch (e) { aviso(Nuvem.traduzir(e), "erro"); }
    };
    $("#sair").onclick = async function () {
      if (await confirmar("Sair deste aparelho?", "Para voltar, entre de novo com o seu e-mail e senha. Seus dados continuam guardados na nuvem.", "Sair", false)) { await Nuvem.Conta.sair(); location.href = location.pathname; }
    };
  }

  /* ---------- Importar clientes (planilha, caderno digitado ou CSV) ---------- */
  function lerListaClientes(texto) {
    var linhas = String(texto || "").replace(/\r/g, "").split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
    var out = [];
    linhas.forEach(function (l, i) {
      var partes = l.split(/\t|;|,(?=\s*[\d(+])/).map(function (x) { return x.trim().replace(/^"|"$/g, ""); }).filter(function (x) { return x !== ""; });
      var nome = "", zap = "", resto = [];
      partes.forEach(function (x) {
        var dig = x.replace(/\D/g, "");
        if (!zap && dig.length >= 10 && dig.length <= 13 && /^[\d\s()+.-]+$/.test(x)) zap = x;
        else if (!nome && /[a-zà-ú]/i.test(x)) nome = x; else resto.push(x);
      });
      if (!nome && !zap) return;
      if (i === 0 && /^nome$/i.test(nome) && !zap) return;              // cabeçalho
      if (/^(nome|cliente)$/i.test(nome) && /whats|telefone|celular/i.test(resto.join(" "))) return;
      out.push({ nome: nome || "Cliente " + zap, whatsapp: zap, obs: resto.join(" · ") });
    });
    return out;
  }
  async function importarClientes(depois) {
    var j = janelaAbrir("Importar clientes",
      "<p>Cole a lista abaixo, <b>um cliente por linha</b>, com nome e WhatsApp. Pode copiar direto do Excel, do Google Planilhas ou de um bloco de notas.</p>" +
      '<p class="sub">Exemplo:<br>Maria Souza; (11) 98888-7777<br>João Lima	11977776666</p>' +
      '<label>Lista de clientes<textarea name="lista" rows="8" placeholder="Nome; WhatsApp"></textarea></label>' +
      '<label>Ou escolha um arquivo .csv <span class="opc">(no Excel: Salvar como → CSV)</span><input type="file" id="arqCsv" accept=".csv,.txt,text/csv,text/plain"></label>' +
      '<p class="sub" id="previa"></p>', "Importar");
    var f = j.form, ta = $("[name=lista]", f);
    function previa() { var l = lerListaClientes(ta.value); $("#previa", f).textContent = l.length ? l.length + " cliente(s) encontrados. Repetidos (mesmo WhatsApp) são ignorados." : ""; }
    ta.addEventListener("input", previa);
    $("#arqCsv", f).addEventListener("change", function (e) {
      var arq = e.target.files[0]; if (!arq) return;
      var rd = new FileReader(); rd.onload = function () { ta.value = rd.result; previa(); }; rd.readAsText(arq, "utf-8");
    });
    var r = await j.resultado; if (!r) return;
    var lista = lerListaClientes(r.lista);
    if (!lista.length) { aviso("Não encontrei clientes na lista. Use um por linha: nome e WhatsApp.", "erro"); return; }
    try {
      var res = await Nuvem.importarClientes(lista);
      aviso(res.importados + " cliente(s) importados" + (res.repetidos ? " e " + res.repetidos + " repetido(s) ignorados" : "") + ".");
      if (depois) setTimeout(depois, 500);
    } catch (e) { aviso(e.message || Nuvem.traduzir(e), "erro"); }
  }

  /* ---------- A3: lembrar amanhã, atrasos e trazer clientes ---------- */
  function camposDuracoes(p) {
    if (!S.servicos.length) return "";
    return '<fieldset class="comissao"><legend>Tempo de cada serviço com ' + esc(p.nome.split(" ")[0]) + '</legend><p class="sub">Deixe em branco para usar o tempo padrão do serviço. Ajuda a agenda a não atrasar.</p><div class="duas">' +
      S.servicos.map(function (s) {
        var v = (p.duracoes || {})[s.id];
        return '<label>' + esc(s.nome) + ' <span class="opc">(padrão ' + U.duracaoTexto(s.duracao) + ')</span><input name="dur_' + s.id + '" type="number" min="5" max="480" step="5" inputmode="numeric" placeholder="' + s.duracao + '" value="' + (v ? v : "") + '"></label>';
      }).join("") + "</div></fieldset>";
  }
  function lerDuracoes(r) {
    var d = {};
    S.servicos.forEach(function (s) { var v = Number(r["dur_" + s.id]); if (v && v !== Number(s.duracao)) d[s.id] = Math.min(480, Math.max(5, v)); });
    return d;
  }

  // Lista dos clientes de amanhã com a mensagem pronta (cada toque abre o WhatsApp)
  async function lembrarAmanha() {
    var dia = U.somaDias(U.hojeISO(), 1);
    var ags = (await Nuvem.agsEntre(dia, dia)).filter(function (a) { return (a.status === "marcado" || a.status === "confirmado") && (dono() || a.profId === Nuvem.meuProfId()); })
      .sort(function (a, b) { return a.inicio < b.inicio ? -1 : 1; });
    var corpo = ags.length
      ? '<p>Toque em cada cliente para abrir o WhatsApp com a mensagem pronta (com o link para confirmar ou desmarcar).</p><ul class="lista-zap">' +
        ags.map(function (a) {
          var zapOk = U.soDigitos(a.clienteWhats).length >= 10;
          return '<li><div><b>' + esc(a.inicio) + " · " + esc(a.clienteNome) + '</b><span class="sub">' + esc(a.servicoNome) + (a.profNome && equipeVisivel() ? " · " + esc(a.profNome) : "") +
            (a.status === "confirmado" ? " · confirmado ✓" : a.lembradoEm ? " · lembrado ✓" : "") + "</span></div>" +
            (zapOk ? '<a class="btn btn--zap btn--peq" data-lembrar="' + a.id + '" href="' + U.linkZap(a.clienteWhats, mensagemLembrete(a)) + '" target="_blank" rel="noopener">' + Icone("whatsapp") + "Lembrar</a>" : '<span class="sub">sem WhatsApp</span>') + "</li>";
        }).join("") + "</ul>"
      : "<p>Ninguém marcado para amanhã" + (dono() ? "" : " com você") + ".</p>";
    var j = janelaAbrir("Lembrar clientes de amanhã", corpo, "", false, true);
    j.form.onclick = function (e) {
      var b = e.target.closest("[data-lembrar]"); if (!b) return;
      var a = ags.find(function (x) { return x.id === b.dataset.lembrar; }); if (!a) return;
      Nuvem.marcarLembrado(a); b.classList.add("feito"); b.innerHTML = Icone("check") + "Enviado";
    };
  }

  // Avisar os próximos clientes de um atraso (não muda a agenda)
  async function avisarAtraso(pidPadrao, minPadrao) {
    var hoje = U.hojeISO(), agoraMin = new Date().getHours() * 60 + new Date().getMinutes();
    var opcoesProf = dono() ? equipe() : [prof(Nuvem.meuProfId())].filter(Boolean);
    var pid = pidPadrao || (dono() ? (opcoesProf[0] || {}).id : Nuvem.meuProfId());
    var j = janelaAbrir("Avisar atraso",
      (opcoesProf.length > 1 ? '<label>Quem está atrasado<select name="prof">' + opcoesProf.map(function (p) { return '<option value="' + p.id + '"' + (p.id === pid ? " selected" : "") + ">" + esc(p.nome) + "</option>"; }).join("") + "</select></label>" : "") +
      '<label>Atraso de<select name="min">' + [10, 15, 20, 30, 45].map(function (n) { return '<option value="' + n + '"' + (n === (minPadrao || 15) ? " selected" : "") + ">" + n + " minutos</option>"; }).join("") + "</select></label>" +
      '<div id="listaAtraso"></div><p class="sub">A agenda não muda sozinha: cada cliente decide se vem mais tarde.</p>', "", false, true);
    var f = j.form;
    function desenhar() {
      var p = $("[name=prof]", f) ? $("[name=prof]", f).value : pid, mins = Number($("[name=min]", f).value);
      var prox = Array.from(S.ags.values()).filter(function (a) { return a.data === hoje && a.profId === p && (a.status === "marcado" || a.status === "confirmado") && U.min(a.inicio) >= agoraMin - 5; })
        .sort(function (a, b) { return a.inicio < b.inicio ? -1 : 1; }).slice(0, 4);
      // Atendimento em andamento: estender o fim para o link parar de oferecer esse tempo
      var atual = Array.from(S.ags.values()).filter(function (a) { return a.data === hoje && a.profId === p && (a.status === "marcado" || a.status === "confirmado") && U.min(a.inicio) <= agoraMin && U.min(a.fim) + 60 >= agoraMin; })
        .sort(function (a, b) { return a.inicio < b.inicio ? 1 : -1; })[0];
      var novoFim = atual ? U.hhmm(Math.max(U.min(atual.fim), agoraMin) + mins) : null;
      var blocoAtual = atual ? '<div class="nota-info estender">' + Icone("relogio") + "<span>Atendimento agora: <b>" + esc(atual.clienteNome) + "</b> (" + atual.inicio + "–" + atual.fim + "). " +
        'Estender até <b>' + novoFim + '</b>? O link para de oferecer esse tempo e os próximos horários livres se ajustam.</span><button type="button" class="btn btn--pri btn--peq" id="btnEstender">Estender</button></div>' : "";
      prox = prox.filter(function (a) { return !atual || a.id !== atual.id; });
      $("#listaAtraso", f).innerHTML = blocoAtual + (prox.length ? '<ul class="lista-zap">' + prox.map(function (a) {
        var nova = U.hhmm(U.min(a.inicio) + mins);
        var msg = "Olá, " + a.clienteNome.split(" ")[0] + "! Aqui é do " + nomeNegocio() + ". Estou com uns " + mins + " minutos de atraso hoje. Seu horário das " + a.inicio + " pode ser às " + nova + "? Se preferir, me avise que a gente remarca. Desculpe!";
        return "<li><div><b>" + esc(a.inicio) + " · " + esc(a.clienteNome) + '</b><span class="sub">passaria para ' + nova + "</span></div>" +
          (U.soDigitos(a.clienteWhats).length >= 10 ? '<a class="btn btn--zap btn--peq" href="' + U.linkZap(a.clienteWhats, msg) + '" target="_blank" rel="noopener">' + Icone("whatsapp") + "Avisar</a>" : '<span class="sub">sem WhatsApp</span>') + "</li>";
      }).join("") + "</ul>" : "<p>Não há próximos clientes hoje.</p>");
      if ($("#btnEstender", f)) $("#btnEstender", f).onclick = async function () {
        this.disabled = true;
        try {
          var r = await Nuvem.salvarAg(Object.assign({}, atual, { fim: novoFim }), atual);
          await r._envio; aviso("Agenda ajustada: " + atual.clienteNome + " até " + novoFim + ". Agora avise os próximos clientes.");
          this.outerHTML = '<span class="tag tag--ok">' + Icone("check") + "Estendido</span>";
        } catch (e) { aviso(Nuvem.traduzir(e), "erro"); this.disabled = false; }
      };
    }
    f.onchange = desenhar; desenhar();
  }
  function equipe() { return profs().filter(function (p) { return p.ativo; }); }

  // Pergunta sozinha: passou do fim e não concluiu, e tem cliente logo em seguida
  var atrasoPerguntado = {};
  function verificarAtraso(el) {
    var hoje = U.hojeISO(), agora = new Date().getHours() * 60 + new Date().getMinutes();
    var meus = Array.from(S.ags.values()).filter(function (a) { return a.data === hoje && (a.status === "marcado" || a.status === "confirmado") && (dono() || a.profId === Nuvem.meuProfId()); });
    var achado = null;
    meus.forEach(function (a) {
      if (achado || atrasoPerguntado[a.id]) return;
      var fim = U.min(a.fim);
      if (agora < fim + 5 || agora > fim + 60 || U.min(a.inicio) > agora) return;
      var prox = meus.find(function (x) { return x.profId === a.profId && x.id !== a.id && U.min(x.inicio) >= fim && U.min(x.inicio) <= agora + 45; });
      if (prox) achado = { a: a, atraso: agora - fim };
    });
    if (!achado) return;
    var a = achado.a, quem = a.profNome && equipeVisivel() ? a.profNome.split(" ")[0] + " passou" : "Passou";
    var box = document.createElement("div");
    box.className = "nota nota--alerta nota-atraso";
    box.innerHTML = Icone("relogio") + "<span>" + esc(quem) + " do horário de " + esc(a.clienteNome) + " (" + a.inicio + "–" + a.fim + "). Atrasou? Avise os próximos clientes.</span>" +
      '<button class="btn btn--pri btn--peq" data-av="1">Avisar</button><button class="btn btn--sec btn--peq" data-av="0">Já terminou</button>';
    var topo = $(".topo", el); if (topo) topo.insertAdjacentElement("afterend", box);
    box.onclick = async function (e) {
      var b = e.target.closest("[data-av]"); if (!b) return;
      atrasoPerguntado[a.id] = 1; box.remove();
      if (b.dataset.av === "1") avisarAtraso(a.profId, Math.max(10, Math.ceil(achado.atraso / 5) * 5));
      else { await Nuvem.salvarAg(Object.assign({}, a, { status: "concluido" }), a); aviso("Marcado como concluído."); }
    };
  }

  TELAS.trazer = async function (el) {
    var dias = Number(el.dataset.sumidos) || 45;
    var hoje = U.hojeISO(), limite = U.somaDias(hoje, -dias), quinzena = U.somaDias(hoje, -15);
    var futuros = new Set(Array.from(S.ags.values()).filter(function (a) { return a.data >= hoje && a.clienteId && Nuvem.OCUPA[a.status]; }).map(function (a) { return a.clienteId; }));
    var sumidos = S.clientes.filter(function (c) { return c.ultimaVisita && c.ultimaVisita < limite && !futuros.has(c.id) && U.soDigitos(c.whatsapp).length >= 10; })
      .sort(function (a, b) { return a.ultimaVisita < b.ultimaVisita ? 1 : -1; });
    var aceitam = S.clientes.filter(function (c) { return c.aceitaNovidades && U.soDigitos(c.whatsapp).length >= 10; });
    var link = S.perfil && S.perfil.slug ? urlLink(S.perfil.slug) : "";

    // Horários livres de amanhã (todos os profissionais), com o serviço mais curto
    var amanha = U.somaDias(hoje, 1), h = horarioDo(amanha);
    var ocup = new Set(); Array.from(S.ags.values()).forEach(function (a) { if (a.data === amanha && Nuvem.OCUPA[a.status]) (a.slots && a.slots.length ? a.slots : U.slots(a.data, a.inicio, comFolga(a.fim), a.profId)).forEach(function (x) { ocup.add(x); }); });
    S.bloqueios.forEach(function (b) { if (b.data === amanha && b.profId && !b.diaInteiro) U.slots(b.data, b.inicio, b.fim, b.profId).forEach(function (x) { ocup.add(x); }); });
    var curto = S.servicos.slice().sort(function (a, b) { return a.duracao - b.duracao; })[0];
    var livresSet = {};
    if (curto) equipe().forEach(function (p) {
      if (S.bloqueios.some(function (b) { return b.data === amanha && b.diaInteiro && (!b.profId || b.profId === p.id); })) return;
      U.horariosLivres({ data: amanha, duracao: durDe(p.id, curto), folga: folgaMin(), horario: h, profId: p.id, ocupados: ocup, bloqueios: S.bloqueios.filter(function (b) { return !b.profId; }) })
        .forEach(function (x) { livresSet[x] = 1; });
    });
    var livres = Object.keys(livresSet).sort();
    var horasTxt = livres.length > 8 ? livres.slice(0, 8).join(", ") + " e outros" : livres.join(", ");
    var msgVagos = "Olá! Aqui é do " + nomeNegocio() + ". Temos horários livres amanhã (" + U.dataLonga(amanha) + "): " + horasTxt + ". Quer garantir o seu? Marque aqui: " + link;

    el.innerHTML =
      '<header class="topo"><div><h1>Trazer clientes</h1><p class="sub">Encha a agenda com quem já conhece o salão. As mensagens saem pelo seu WhatsApp, uma por uma, sem custo.</p></div></header>' +
      // 1. Sumidos
      '<section class="painel"><h2>' + Icone("usuarios") + "Clientes sumidos</h2>" +
      '<div class="alternar" role="group" aria-label="Há quanto tempo">' + [30, 45, 60].map(function (n) { return '<button data-dias="' + n + '" aria-pressed="' + (n === dias) + '">' + n + " dias</button>"; }).join("") + "</div>" +
      '<p class="sub">Quem não volta há mais de ' + dias + " dias e não tem horário marcado. " + sumidos.length + " cliente(s).</p>" +
      (sumidos.length ? '<ul class="lista-zap">' + sumidos.slice(0, 50).map(function (c) {
        var recente = c.contatadoEm && c.contatadoEm.slice(0, 10) >= quinzena;
        var msg = "Olá, " + c.nome.split(" ")[0] + "! Tudo bem? Faz um tempinho que você não vem ao " + nomeNegocio() + ". Que tal marcar seu horário? É só escolher aqui: " + link;
        return "<li><div><b>" + esc(c.nome) + '</b><span class="sub">última visita ' + U.dataCurta(c.ultimaVisita) + (recente ? " · contatado em " + U.dataCurta(c.contatadoEm.slice(0, 10)) : "") + "</span></div>" +
          '<a class="btn ' + (recente ? "btn--sec" : "btn--zap") + ' btn--peq" data-contato="' + c.id + '" href="' + U.linkZap(c.whatsapp, msg) + '" target="_blank" rel="noopener">' + Icone("whatsapp") + (recente ? "Chamar de novo" : "Chamar") + "</a></li>";
      }).join("") + "</ul>" : "<p>Nenhum cliente sumido. Ótimo sinal!</p>") + "</section>" +
      // 2. Horários vagos
      '<section class="painel"><h2>' + Icone("calendario") + "Horários vagos amanhã</h2>" +
      (livres.length ? "<p><b>" + livres.length + " horário(s) livre(s)</b>: " + esc(horasTxt) + "</p>" +
        '<label>Mensagem<textarea id="msgVagos" rows="3">' + esc(msgVagos) + "</textarea></label>" +
        '<div class="atalhos"><button class="btn btn--sec btn--peq" id="copiarVagos">' + Icone("copiar") + 'Copiar para o Status do WhatsApp</button></div>' +
        '<p class="sub">Clientes que aceitaram receber avisos: ' + aceitam.length + ". Postar no Status do WhatsApp alcança todo mundo de uma vez, sem mandar mensagem a quem não pediu.</p>" +
        (aceitam.length ? '<ul class="lista-zap">' + aceitam.slice(0, 50).map(function (c) {
          return "<li><div><b>" + esc(c.nome) + "</b></div>" + '<a class="btn btn--zap btn--peq" data-vago="' + c.id + '" target="_blank" rel="noopener">' + Icone("whatsapp") + "Enviar</a></li>";
        }).join("") + "</ul>" : "")
        : "<p>Amanhã está cheio (ou o salão não abre). Nada a divulgar.</p>") + "</section>" +
      // 3. Ser encontrado
      '<section class="painel"><h2>' + Icone("link") + "Ser encontrado por clientes novos</h2>" +
      '<p>Coloque o seu link de agendamento onde as pessoas procuram um salão:</p>' +
      (link ? '<div class="link-box"><code>' + esc(link) + '</code><button class="btn btn--sec btn--peq" id="copiarLinkT">' + Icone("copiar") + "Copiar</button></div>" : "") +
      '<ol class="guia">' +
        "<li><b>Google (Perfil da Empresa):</b> no Google Maps ou em business.google.com, edite o perfil do salão e cole o link no campo de <b>site</b> ou de <b>agendamento/reservas</b>. Quem procura “salão perto de mim” já marca direto.</li>" +
        "<li><b>Instagram:</b> Editar perfil → Links → Adicionar link externo → cole o link com o título “Agende aqui”. Nos Stories, use a figurinha “Link”.</li>" +
        "<li><b>WhatsApp Business:</b> Ferramentas comerciais → Mensagem de ausência e Mensagem de saudação → inclua o link. Assim, quem chama fora do horário já marca sozinho.</li>" +
        "<li><b>No salão:</b> imprima o cartaz com QR Code (em <a href=\"#link\">Meu link</a> → Imprimir cartaz) e deixe no balcão e no espelho.</li>" +
      "</ol></section>";

    $$("[data-dias]", el).forEach(function (b) { b.onclick = function () { el.dataset.sumidos = b.dataset.dias; TELAS.trazer(el); }; });
    el.onclick = function (e) {
      var b = e.target.closest("[data-contato]");
      if (b) { var c = S.clientes.find(function (x) { return x.id === b.dataset.contato; }); if (c) Nuvem.marcarContatado(c); }
      var v = e.target.closest("[data-vago]");
      if (v) { var c2 = S.clientes.find(function (x) { return x.id === v.dataset.vago; }); var txt = $("#msgVagos", el) ? $("#msgVagos", el).value : msgVagos; v.href = U.linkZap(c2.whatsapp, txt); }
    };
    function copiar(t, b) { if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { aviso("Copiado!"); }); }
    if ($("#copiarVagos", el)) $("#copiarVagos", el).onclick = function () { copiar($("#msgVagos", el).value); };
    if ($("#copiarLinkT", el)) $("#copiarLinkT", el).onclick = function () { copiar(link); if (!(S.perfil || {}).linkDivulgado) Nuvem.salvarPerfil({ linkDivulgado: true }); };
  };

  /* ---------- Comissões e acerto (A2) ---------- */
  var TIPOS_COM = { nenhuma: "Sem comissão", percentual: "Porcentagem do serviço", fixo: "Valor fixo por atendimento", aluguel: "Aluguel de cadeira" };
  var PERIODOS = { dia: "Diário", semana: "Semanal", quinzena: "Quinzenal", mes: "Mensal" };
  var AVISO_DIAS = 7;
  // Regra que vale numa data (a mais recente com "desde" até aquele dia)
  function regraEm(p, iso) {
    var r = null;
    ((p && p.comissoes) || []).forEach(function (c) { if (c.desde <= iso && (!r || c.desde >= r.desde)) r = c; });
    return r;
  }
  function regraFutura(p) {
    var hoje = U.hojeISO();
    return ((p && p.comissoes) || []).filter(function (c) { return c.desde > hoje; }).sort(function (a, b) { return a.desde < b.desde ? -1 : 1; })[0] || null;
  }
  function regraTexto(r) {
    if (!r || r.tipo === "nenhuma") return "Sem comissão";
    var v = r.tipo === "percentual" ? String(r.valor).replace(".", ",") + "% de cada serviço"
      : r.tipo === "fixo" ? brl(r.valor) + " por atendimento"
      : "Aluguel de " + brl(r.valor) + " por período";
    return v + " · acerto " + (PERIODOS[r.periodo] || "Mensal").toLowerCase();
  }
  function ultimoDia(ano, mes) { return new Date(ano, mes + 1, 0).getDate(); }
  function periodoDe(iso, tipo) {
    var d = U.dataDe(iso), a = d.getFullYear(), m = d.getMonth(), dia = d.getDate(), de, ate;
    if (tipo === "dia") { de = ate = iso; }
    else if (tipo === "semana") { var dw = (d.getDay() + 6) % 7; de = U.somaDias(iso, -dw); ate = U.somaDias(de, 6); }
    else if (tipo === "quinzena") {
      de = U.isoDe(new Date(a, m, dia <= 15 ? 1 : 16));
      ate = U.isoDe(new Date(a, m, dia <= 15 ? 15 : ultimoDia(a, m)));
    } else { de = U.isoDe(new Date(a, m, 1)); ate = U.isoDe(new Date(a, m, ultimoDia(a, m))); }
    var rot = de === ate ? U.dataCurta(de) : U.dataCurta(de) + " a " + U.dataCurta(ate);
    if (tipo === "mes") { rot = U.MESES[m] + " de " + a; rot = rot.charAt(0).toUpperCase() + rot.slice(1); }
    return { de: de, ate: ate, rotulo: rot, tipo: tipo };
  }
  function moverPeriodo(per, n) {
    var base = n < 0 ? U.somaDias(per.de, -1) : U.somaDias(per.ate, 1);
    return periodoDe(base, per.tipo);
  }
  // Calcula o acerto de um profissional num período (só atendimentos concluídos, valor cheio)
  function calcularAcerto(p, ags, per) {
    var linhas = ags.filter(function (a) { return a.profId === p.id && a.status === "concluido" && a.data >= per.de && a.data <= per.ate; })
      .sort(function (x, y) { return (x.data + x.inicio) < (y.data + y.inicio) ? -1 : 1; })
      .map(function (a) {
        var r = regraEm(p, a.data), v = Number(a.preco) || 0, c = 0;
        if (r && r.tipo === "percentual") c = Math.round(v * (Number(r.valor) || 0)) / 100;
        else if (r && r.tipo === "fixo") c = Math.min(v, Number(r.valor) || 0);
        else if (r && r.tipo === "aluguel") c = v;
        return { a: a, valor: v, comissao: c, regra: r };
      });
    var total = linhas.reduce(function (t, l) { return t + l.valor; }, 0);
    var parteProf = linhas.reduce(function (t, l) { return t + l.comissao; }, 0);
    var rFim = regraEm(p, per.ate);
    var aluguel = rFim && rFim.tipo === "aluguel" ? Number(rFim.valor) || 0 : 0;
    return { linhas: linhas, n: linhas.length, total: total, parteProf: parteProf, parteSalao: total - parteProf, aluguel: aluguel, regra: rFim };
  }
  function camposComissao(p) {
    var r = regraFutura(p) || regraEm(p, U.hojeISO()) || { tipo: "nenhuma", valor: "", periodo: "mes" };
    var temRegra = !!((p.comissoes || []).length);
    return '<fieldset class="comissao"><legend>Comissão</legend>' +
      '<label>Como você acerta com ' + esc(p.nome.split(" ")[0]) + '<select name="comTipo">' + Object.keys(TIPOS_COM).map(function (k) { return '<option value="' + k + '"' + (r.tipo === k ? " selected" : "") + ">" + TIPOS_COM[k] + "</option>"; }).join("") + "</select></label>" +
      '<div class="duas"><label><span id="comRot">Valor</span><input name="comValor" type="number" min="0" step="0.01" inputmode="decimal" value="' + esc(r.valor) + '"></label>' +
      '<label>Acerto<select name="comPeriodo">' + Object.keys(PERIODOS).map(function (k) { return '<option value="' + k + '"' + ((r.periodo || "mes") === k ? " selected" : "") + ">" + PERIODOS[k] + "</option>"; }).join("") + "</select></label></div>" +
      '<p class="sub" id="comExplica"></p>' +
      (temRegra ? '<p class="nota-info">' + Icone("alerta") + "<span>Mudanças valem a partir de <b>" + U.dataCurta(U.somaDias(U.hojeISO(), AVISO_DIAS)) + "</b> (" + AVISO_DIAS + " dias de aviso). " + esc(p.nome.split(" ")[0]) + " recebe o aviso no app e confirma que está ciente.</span></p>" : "") +
      "</fieldset>";
  }
  function ligarCamposComissao(f) {
    var t = $("[name=comTipo]", f); if (!t) return;
    function atualiza() {
      var k = t.value, v = $("[name=comValor]", f);
      $("#comRot", f).textContent = k === "percentual" ? "Porcentagem (%)" : k === "aluguel" ? "Aluguel por período (R$)" : "Valor (R$)";
      v.disabled = k === "nenhuma"; v.max = k === "percentual" ? "100" : "";
      $("#comExplica", f).textContent = {
        nenhuma: "O profissional não recebe comissão por aqui.",
        percentual: "Ex.: 40% → num corte de R$ 50, o profissional fica com R$ 20 e o salão com R$ 30. Conta o valor cheio do serviço.",
        fixo: "Ex.: R$ 10 → o profissional recebe R$ 10 por atendimento concluído, seja qual for o serviço.",
        aluguel: "O profissional paga um valor fixo ao salão por período e fica com tudo o que atender."
      }[k];
    }
    t.addEventListener("change", atualiza); atualiza();
  }
  // Monta a nova lista de regras: a primeira vale hoje; mudanças valem em 7 dias
  function novaListaComissoes(p, r) {
    var nova = { tipo: r.comTipo || "nenhuma", valor: r.comTipo === "nenhuma" ? 0 : Math.max(0, Number(r.comValor) || 0), periodo: r.comPeriodo || "mes" };
    if (nova.tipo === "percentual") nova.valor = Math.min(100, nova.valor);
    var lista = (p.comissoes || []).slice(), hoje = U.hojeISO();
    var vigente = regraEm(p, hoje);
    var igual = function (a, b) { return a && b && a.tipo === b.tipo && Number(a.valor) === Number(b.valor) && a.periodo === b.periodo; };
    var futura = regraFutura(p);
    if (igual(futura || vigente, nova)) return null;           // nada mudou
    lista = lista.filter(function (c) { return c.desde <= hoje; }); // troca mudança ainda não vigente
    if (igual(vigente, nova)) return lista;                    // voltou para a regra atual: cancela a mudança
    nova.desde = lista.length ? U.somaDias(hoje, AVISO_DIAS) : hoje;
    nova.definidaEm = new Date().toISOString();
    lista.push(nova);
    return lista;
  }

  TELAS.comissoes = async function (el) {
    var souDono = dono();
    var lista = souDono ? S.profissionais.filter(function (p) { return !p.removido && !p.ehDono; }) : [prof(Nuvem.meuProfId())].filter(Boolean);
    if (!lista.length) {
      el.innerHTML = '<header class="topo"><div><h1>Comissões</h1><p class="sub">Acerto com cada profissional.</p></div></header>' +
        '<section class="painel"><p>Você ainda não tem profissionais na equipe. Convide em <a href="#equipe">Equipe</a> e defina a comissão de cada um.</p></section>';
      return;
    }
    var pid = el.dataset.prof && lista.some(function (p) { return p.id === el.dataset.prof; }) ? el.dataset.prof : lista[0].id;
    var p = prof(pid);
    var regraHoje = regraEm(p, U.hojeISO());
    var tipoPer = el.dataset.tper || (regraHoje && regraHoje.periodo) || "mes";
    var per = el.dataset.de ? periodoDe(el.dataset.de, tipoPer) : periodoDe(U.hojeISO(), tipoPer);
    el.innerHTML = '<header class="topo"><div><h1>' + (souDono ? "Comissões" : "Meus ganhos") + '</h1><p class="sub">Carregando...</p></div></header>';
    var ags = await Nuvem.agsEntre(per.de, per.ate);
    var ac = calcularAcerto(p, ags, per);
    var pago = await Nuvem.lerAcerto(p.id, per.de);
    var fut = regraFutura(p), ciente = fut && p.ciente && p.ciente[fut.desde];
    var hojeNoPeriodo = U.hojeISO() >= per.de && U.hojeISO() <= per.ate;
    var primeiro = (p.nome || "").split(" ")[0];

    el.innerHTML =
      '<header class="topo"><div><h1>' + (souDono ? "Comissões" : "Meus ganhos") + '</h1><p class="sub">' +
      (souDono ? "Quanto cada profissional recebe. Conta só atendimentos <b>concluídos</b>, pelo valor cheio do serviço." : "O que você atendeu e quanto recebe. Quem define a comissão é o dono do salão.") + "</p></div></header>" +
      (souDono && lista.length > 1 ? '<div class="filtro-prof" role="group" aria-label="Profissional">' + lista.map(function (x) {
        return '<button data-p="' + x.id + '" aria-pressed="' + (x.id === pid) + '">' + chipProf(x.id) + esc(x.nome) + "</button>"; }).join("") + "</div>" : "") +
      (fut ? '<div class="nota-info nota-com">' + Icone("alerta") + "<span><b>" + (souDono ? "Mudança marcada para " + esc(primeiro) : "Sua comissão vai mudar") + ":</b> a partir de " + U.dataCurta(fut.desde) + ", " + esc(regraTexto(fut)) + ". " +
        (ciente ? "✓ " + (souDono ? esc(primeiro) + " confirmou que está ciente." : "Você confirmou que está ciente.") : (souDono ? esc(primeiro) + " ainda não confirmou." : "")) + "</span>" +
        (!souDono && !ciente ? '<button class="btn btn--pri btn--peq" id="btnCiente">' + Icone("check") + "Estou ciente</button>" : "") + "</div>" : "") +
      '<section class="painel"><div class="acerto-topo"><div><h2>' + Icone("dinheiro") + esc(p.nome) + '</h2><p class="sub">Regra atual: ' + esc(regraTexto(regraHoje)) +
      (souDono ? ' · <button class="btn-link" id="btnRegra">Alterar</button>' : "") + "</p></div>" +
      '<div class="grupo"><button class="btn-ic" id="pAnt" aria-label="Período anterior">' + Icone("esq") + '</button><strong class="mes">' + esc(per.rotulo) + '</strong><button class="btn-ic" id="pProx" aria-label="Próximo período">' + Icone("dir") + "</button>" +
      '<select id="tPer" aria-label="Tipo de período">' + Object.keys(PERIODOS).map(function (k) { return '<option value="' + k + '"' + (k === tipoPer ? " selected" : "") + ">" + PERIODOS[k] + "</option>"; }).join("") + "</select></div></div>" +
      '<div class="cards cards--mini">' +
        '<div class="card"><span class="card__rot">Atendimentos</span><strong class="card__num">' + ac.n + "</strong></div>" +
        '<div class="card"><span class="card__rot">Total atendido</span><strong class="card__num card__num--p">' + brl(ac.total) + "</strong></div>" +
        (ac.regra && ac.regra.tipo === "aluguel"
          ? '<div class="card"><span class="card__rot">Aluguel a pagar ao salão</span><strong class="card__num card__num--p">' + brl(ac.aluguel) + "</strong></div>"
          : '<div class="card card--destaque"><span class="card__rot">' + (souDono ? "Pagar a " + esc(primeiro) : "Você recebe") + '</span><strong class="card__num card__num--p">' + brl(ac.parteProf) + "</strong></div>") +
      "</div>" +
      (ac.regra && ac.regra.tipo !== "aluguel" && souDono ? '<p class="sub">Fica para o salão: <b>' + brl(ac.parteSalao) + "</b></p>" : "") +
      '<div class="acerto-status">' + (pago
        ? '<span class="tag tag--ok">' + Icone("check") + "Pago em " + new Date(pago.pagoEm).toLocaleDateString("pt-BR") + "</span>" + (souDono ? '<button class="btn btn--sec btn--peq" id="btnDesfazer">Desfazer</button>' : "")
        : (hojeNoPeriodo ? '<span class="tag tag--cinza">Período em andamento</span>' : '<span class="tag tag--alerta">Ainda não acertado</span>') +
          (souDono && ac.n ? '<button class="btn btn--pri btn--peq" id="btnPago">' + Icone("check") + "Marcar como pago</button>" : "")) +
      (souDono && ac.n && p.whatsapp ? '<a class="btn btn--zap btn--peq" id="btnZap" target="_blank" rel="noopener">' + Icone("whatsapp") + "Enviar resumo</a>" : "") + "</div>" +
      (ac.n ? '<div class="tabela-wrap"><table class="tabela tabela--resp"><thead><tr><th>Dia</th><th>Cliente</th><th>Serviço</th><th class="num">Valor</th><th class="num">' + (ac.regra && ac.regra.tipo === "aluguel" ? "Fica com o profissional" : "Comissão") + "</th></tr></thead><tbody>" +
        ac.linhas.map(function (l) {
          return '<tr><td data-r="Dia">' + U.dataCurta(l.a.data) + " " + esc(l.a.inicio) + '</td><td data-r="Cliente">' + esc(l.a.clienteNome) + '</td><td data-r="Serviço">' + esc(l.a.servicoNome) +
            '</td><td class="num" data-r="Valor">' + brl(l.valor) + '</td><td class="num" data-r="Comissão">' + brl(l.comissao) + "</td></tr>";
        }).join("") + "</tbody></table></div>"
        : '<p class="vazio">Nenhum atendimento concluído neste período.</p>') +
      "</section>" +
      (!regraHoje && souDono ? '<p class="nota nota--alerta">' + Icone("alerta") + "<span>" + esc(primeiro) + ' ainda não tem comissão definida. Clique em "Alterar" acima.</span></p>' : "");

    function ir(novo) { el.dataset.de = novo.de; el.dataset.tper = novo.tipo; TELAS.comissoes(el); }
    $("#pAnt").onclick = function () { ir(moverPeriodo(per, -1)); };
    $("#pProx").onclick = function () { ir(moverPeriodo(per, 1)); };
    $("#tPer").onchange = function () { ir(periodoDe(per.de, this.value)); };
    $$("[data-p]", el).forEach(function (b) { b.onclick = function () { el.dataset.prof = b.dataset.p; el.dataset.de = ""; el.dataset.tper = ""; TELAS.comissoes(el); }; });
    if ($("#btnCiente")) $("#btnCiente").onclick = async function () {
      try { await Nuvem.marcarCiente(fut.desde); aviso("Obrigado! O dono do salão vai ver que você está ciente."); setTimeout(function () { TELAS.comissoes(el); }, 600); }
      catch (e) { aviso(Nuvem.traduzir(e), "erro"); }
    };
    if ($("#btnRegra")) $("#btnRegra").onclick = function () { editarComissao(p, function () { TELAS.comissoes(el); }); };
    if ($("#btnPago")) $("#btnPago").onclick = async function () {
      var txt = ac.regra && ac.regra.tipo === "aluguel" ? "Confirmar que " + primeiro + " pagou " + brl(ac.aluguel) + " de aluguel (" + per.rotulo + ")?" : "Confirmar que você pagou " + brl(ac.parteProf) + " a " + primeiro + " (" + per.rotulo + ")?";
      if (!await confirmar("Marcar como pago?", txt, "Marcar como pago")) return;
      try {
        await Nuvem.salvarAcerto({ profId: p.id, profNome: p.nome, de: per.de, ate: per.ate, periodo: per.tipo, regra: ac.regra ? { tipo: ac.regra.tipo, valor: ac.regra.valor } : null, atendimentos: ac.n, total: ac.total, parteProf: ac.parteProf, parteSalao: ac.parteSalao, aluguel: ac.aluguel });
        aviso("Acerto marcado como pago."); TELAS.comissoes(el);
      } catch (e) { aviso(e.message || Nuvem.traduzir(e), "erro"); }
    };
    if ($("#btnDesfazer")) $("#btnDesfazer").onclick = async function () {
      if (!await confirmar("Desfazer pagamento?", "O acerto de " + per.rotulo + " volta para \"ainda não acertado\".", "Desfazer")) return;
      await Nuvem.desfazerAcerto(p.id, per.de); TELAS.comissoes(el);
    };
    if ($("#btnZap")) {
      var msg = "Olá, " + primeiro + "! Resumo do acerto (" + per.rotulo + "):\n" +
        ac.n + " atendimento(s) · total " + brl(ac.total) + "\n" +
        (ac.regra && ac.regra.tipo === "aluguel" ? "Aluguel do período: " + brl(ac.aluguel) : "Sua parte: " + brl(ac.parteProf)) +
        "\nDetalhes em Meus ganhos, no app. " + (S.perfil.nome || "");
      $("#btnZap").href = U.linkZap(p.whatsapp, msg);
    }
  };

  async function editarComissao(p, depois) {
    var j = janelaAbrir("Comissão de " + p.nome, camposComissao(p), "Salvar"); ligarCamposComissao(j.form);
    var r = await j.resultado;
    if (!r) return;
    var lista = novaListaComissoes(p, r);
    if (!lista) { aviso("Nada mudou."); return; }
    await Nuvem.salvarProfissional(Object.assign({}, p, { comissoes: lista }));
    var nova = lista[lista.length - 1];
    aviso(nova && nova.desde > U.hojeISO() ? "Mudança marcada para " + U.dataCurta(nova.desde) + ". " + p.nome.split(" ")[0] + " vai receber o aviso no app." : "Comissão salva.");
    if (depois) depois();
  }

  /* ---------- Meu salão (configurações agrupadas) e primeiros passos ---------- */
  TELAS.salao = function (el) {
    var p = S.perfil || {}, nEq = S.profissionais.filter(function (x) { return x.ativo; }).length;
    var url = p.slug ? urlLink(p.slug) : "";
    function card(href, icone, titulo, texto) { return '<a class="card-salao" href="' + href + '">' + Icone(icone) + "<div><b>" + titulo + '</b><span class="sub">' + texto + "</span></div>" + Icone("dir") + "</a>"; }
    el.innerHTML = '<header class="topo"><div><h1>Meu salão</h1><p class="sub">Tudo o que você configura uma vez e muda quando precisar.</p></div></header>' +
      '<div class="grade-salao">' +
      card("#servicos", "tesoura", "Serviços", S.servicos.length ? S.servicos.length + " serviço(s) cadastrado(s)" : "Cadastre o que você faz, tempo e preço") +
      card("#horarios", "relogio", "Horários", "Funcionamento, intervalo entre clientes, folgas e feriados") +
      card("#link", "link", "Meu link de agendamento", url ? "Pronto para divulgar" : "Crie o link para os clientes marcarem sozinhos") +
      card("#equipe", "usuarios", "Equipe", nEq > 1 ? nEq + " pessoas na equipe" : "Convide profissionais quando quiser") +
      "</div>";
  };
  // Primeiros passos: guia do primeiro uso para o dono, um passo de cada vez, com o porquê de cada um
  function passosItens() {
    var p = S.perfil || {}, pul = p.passosPulados || [];
    var lista = [
      { id: "servicos", ok: S.servicos.length > 0, titulo: "Cadastre seus serviços", href: "#servicos", botao: "Cadastrar serviços",
        txt: "Coloque o que você faz (corte, escova, unha...), com <b>preço</b> e <b>tempo</b> de cada um. É a lista que o cliente vê na hora de marcar." },
      { id: "horarios", ok: !!p.horariosConferidos, titulo: "Confira seus dias e horários", href: "#horarios", botao: "Conferir horários",
        txt: "Diga em quais dias você atende, de que horas a que horas e o intervalo do almoço. Toque em <b>Salvar</b> no fim da tela. O cliente só consegue marcar dentro desses horários." },
      { id: "equipe", ok: temEquipe() || !!p.soEuAtendo, titulo: "Monte sua equipe (ou diga que é só você)", href: "#equipe", botao: "Convidar profissional", extra: '<button type="button" class="btn btn--sec btn--peq" id="passoSoEu">Só eu atendo</button>',
        txt: "Trabalha com outros profissionais? Mande um convite para cada um: eles entram com o próprio celular e veem a própria agenda. Se só você atende, toque em <b>Só eu atendo</b>." },
      { id: "teste", ok: S.ags.size > 0 || !!p.fezTeste, titulo: "Marque um horário de teste", botao: "Marcar horário de teste", acao: "teste",
        txt: "Marque um horário de mentirinha para ver como fica na agenda. Depois é só tocar nele e cancelar." },
      { id: "link", ok: !!p.slug, titulo: "Crie seu link e divulgue", href: "#link", botao: "Criar meu link",
        txt: "Seu salão ganha um endereço próprio. Mande no WhatsApp, coloque no Instagram e no Google, ou imprima o QR Code para o balcão: o cliente escolhe o serviço e o horário sozinho, e você recebe na agenda." }
    ];
    lista.forEach(function (i) { i.pulado = !i.ok && pul.indexOf(i.id) >= 0; });
    return lista;
  }
  function passoFeito(i) { return i.ok || i.pulado; }
  function proximoPasso() { return passosItens().filter(function (i) { return !passoFeito(i); })[0] || null; }
  function guiaAtivo() { var p = S.perfil || {}; return dono() && !p.ocultarPassos && (!!p.verPassos || !!proximoPasso()); }
  function passosHTML() {
    var p = S.perfil || {};
    if (!guiaAtivo()) return "";
    var itens = passosItens(), feitos = itens.filter(passoFeito).length, prox = proximoPasso();
    if (!prox) return '<section class="painel passos"><div class="passos__topo"><h2>' + Icone("check") + "Seu salão está pronto!</h2>" +
      '<button class="btn-link" id="ocultarPassos">Fechar o guia</button></div><p class="sub">Você concluiu os primeiros passos. Para ver o guia de novo: Conta → Ajuda.</p></section>';
    return '<section class="painel passos"><div class="passos__topo"><h2>' + Icone("estrela") + "Primeiros passos: deixe seu salão pronto</h2>" +
      '<button class="btn-link" id="ocultarPassos">Ocultar o guia</button></div>' +
      '<p class="sub">' + feitos + " de " + itens.length + ' feitos · leva uns 10 minutos</p><div class="passos__barra"><span style="width:' + Math.round(feitos / itens.length * 100) + '%"></span></div><ol>' +
      itens.map(function (it, n) {
        var aberto = !!prox && it.id === prox.id;
        return '<li class="' + (it.ok ? "ok" : it.pulado ? "pulado" : "") + (aberto ? " aberto" : "") + '"><details' + (aberto ? " open" : "") + '><summary>' + (it.ok ? Icone("check") : "<span>" + (n + 1) + "</span>") + esc(it.titulo) + (it.pulado ? ' <em class="sub" style="display:inline">(pulado)</em>' : "") + "</summary>" +
          (it.ok ? "" : '<div class="passos__corpo"><p>' + it.txt + '</p><div class="atalhos">' +
            (it.acao ? '<button type="button" class="btn btn--pri btn--peq" data-passo="' + it.acao + '">' + esc(it.botao) + "</button>" : '<a class="btn btn--pri btn--peq" href="' + it.href + '">' + esc(it.botao) + "</a>") +
            (it.extra || "") + (it.pulado ? "" : '<button type="button" class="btn-link" data-pular="' + it.id + '">Pular este passo</button>') + "</div></div>") + "</details></li>";
      }).join("") + '</ol><p class="sub" style="margin-top:10px">Dúvidas? Veja <a href="#conta">Conta → Ajuda</a> ou escreva para ' + esc(APP.suporte || "") + ".</p></section>";
  }
  function ligarPassos(el) {
    var b = $("#ocultarPassos", el); if (b) b.onclick = function () { Nuvem.salvarPerfil({ ocultarPassos: true, verPassos: false }); b.closest(".passos").remove(); };
    var so = $("#passoSoEu", el); if (so) so.onclick = async function () { await Nuvem.salvarPerfil({ soEuAtendo: true }); aviso("Combinado: só você atende. Dá para convidar alguém depois em Meu salão → Equipe."); redesenharJa(); };
    var t = $("[data-passo=teste]", el); if (t) t.onclick = function () { var n = $("#novoAg"); if (n) n.click(); };
    $$("[data-pular]", el).forEach(function (x) { x.onclick = async function () {
      var pul = ((S.perfil || {}).passosPulados || []).concat([x.dataset.pular]);
      await Nuvem.salvarPerfil({ passosPulados: pul }); redesenharJa();
    }; });
  }
  // Barra do guia nas telas dos passos: mostra em que passo está e leva para o próximo sozinho quando este é concluído
  var passoAntes = null, inicioGuia = Date.now();
  function barraPassos(nome) {
    var el = $("#conteudo"); if (!el || !guiaAtivo()) return;
    var itens = passosItens(), atual = itens.filter(function (i) { return i.href === "#" + nome; })[0];
    if (!atual) return;
    var prox = proximoPasso(), n = itens.indexOf(atual) + 1;
    var d = document.createElement("div"); d.className = "nota nota-info barra-guia"; d.style.marginBottom = "14px";
    d.innerHTML = Icone("estrela") + "<span>" + (passoFeito(atual)
      ? "<b>Passo " + n + " concluído!</b> " + (prox ? "Próximo: " + esc(prox.titulo) + '. <a href="' + (prox.href || "#agenda") + '" class="btn btn--pri btn--peq" style="margin-left:6px">Ir para o próximo passo</a>' : 'Tudo pronto. <a href="#agenda">Voltar para a agenda</a>')
      : "<b>Primeiros passos · passo " + n + " de " + itens.length + ":</b> " + esc(atual.titulo) + '. <a href="#agenda">Ver o guia</a>') + "</span>";
    el.insertBefore(d, el.firstChild);
  }
  var timerVolta = null;
  function voltarAgendaDepois() {
    clearTimeout(timerVolta);
    timerVolta = setTimeout(function tentar() {
      var j = $("#janela");
      if (j && j.open) { timerVolta = setTimeout(tentar, 700); return; }   // espera fechar a janela que estiver aberta
      if (location.hash !== "#agenda") location.hash = "#agenda"; else irPara();
    }, 1600);
  }
  // Quando um passo é concluído em qualquer tela, avisa e oferece o próximo
  function conferirPassos() {
    if (!guiaAtivo()) { passoAntes = null; return; }
    var prox = proximoPasso(), id = prox ? prox.id : "fim";
    if (passoAntes && passoAntes !== id && Date.now() - inicioGuia > 4000) {
      if (prox) aviso("Passo concluído! Voltando para a agenda: próximo passo é " + prox.titulo + ".");
      else aviso("Pronto! Seu salão está configurado. Agora é divulgar o link.");
      var bg = $(".barra-guia"); if (bg && TELAS[telaAtual]) { bg.remove(); barraPassos(telaAtual); }
      // volta sozinho para a agenda (tela de início), onde o guia já abre o próximo passo
      voltarAgendaDepois();
    }
    passoAntes = id;
  }
  function redesenharJa() { if (TELAS[telaAtual]) TELAS[telaAtual]($("#conteudo")); }

  /* ---------- Navegação ---------- */
  var VIVAS = { agenda: 1, clientes: 1, servicos: 1, equipe: 1, relatorio: 1, comissoes: 1, trazer: 1, salao: 1, conta: 1, horarios: 1, link: 1 }; // todas se atualizam sozinhas
  // Não redesenha enquanto a pessoa digita ou tem um formulário com mudança não salva (redesenha quando ela terminar)
  function editando() {
    var c = $("#conteudo"), at = document.activeElement;
    if (at && c && c.contains(at) && /INPUT|TEXTAREA|SELECT/.test(at.tagName)) return true;
    return !!(c && c.querySelector("form[data-sujo]"));
  }
  document.addEventListener("input", function (e) { var f = e.target && e.target.closest && e.target.closest("#conteudo form"); if (f) f.setAttribute("data-sujo", "1"); }, true);
  document.addEventListener("submit", function (e) { var f = e.target; setTimeout(function () { if (f && f.removeAttribute) f.removeAttribute("data-sujo"); }, 60); }, true);
  document.addEventListener("focusout", function () { setTimeout(function () { if (redesenharDepois && !editando() && !$("#janela").open) { redesenharDepois = false; redesenhar(); } }, 300); });
  var telaAtual = "agenda";
  function irPara() {
    var nome = (location.hash || "#agenda").slice(1);
    var soDono = { equipe: 1, servicos: 1, link: 1, trazer: 1, salao: 1 };
    if (!TELAS[nome] || (soDono[nome] && !dono())) nome = "agenda";
    telaAtual = nome;
    var marcado = dono() && TELAS_SALAO[nome] ? "salao" : nome;
    $$("[data-tela]").forEach(function (a) { if (a.dataset.tela === marcado) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    var el = $("#conteudo");
    el.innerHTML = "";
    el.dataset.filtro = ""; el.dataset.mes = ""; el.onclick = null;
    Promise.resolve(TELAS[nome](el)).then(function () { barraPassos(nome); conferirPassos(); });
    window.scrollTo(0, 0);
  }
  var timerRed = null, redesenharDepois = false;
  // Se os dados mudaram com uma janela aberta, atualiza a tela quando ela fechar
  $("#janela").addEventListener("close", function () { if (redesenharDepois) { redesenharDepois = false; redesenhar(); } });
  function redesenhar() {
    clearTimeout(timerRed);
    timerRed = setTimeout(function () {
      if (!VIVAS[telaAtual]) return;
      if ($("#janela").open || editando()) { redesenharDepois = true; return; }
      var y = window.scrollY, el = $("#conteudo");
      var busca = $("#busca"), txt = busca && busca.value;
      Promise.resolve(TELAS[telaAtual](el)).then(function () {
        window.scrollTo(0, y);
        if (txt && $("#busca")) { $("#busca").value = txt; $("#busca").dispatchEvent(new Event("input")); }
      });
    }, 150);
  }

  function rede() {
    var r = $("#rede");
    r.innerHTML = navigator.onLine ? Icone("nuvem") + "Online" : Icone("semNet") + "Offline";
    r.className = "rede " + (navigator.onLine ? "" : "rede--off");
    r.title = navigator.onLine ? "Conectado à nuvem" : "Sem internet: continua funcionando e envia as alterações quando a conexão voltar";
  }

  /* ---------- Início ---------- */
  function mostrar(id) { ["telaCarregando", "telaAtivacao", "telaSemLicenca", "telaBoasVindas", "app"].forEach(function (t) { $("#" + t).hidden = t !== id; }); }

  var params = new URLSearchParams(location.search);
  var CONVITE = params.get("convite") || "";
  var EMAIL_CONVITE = (params.get("email") || "").toLowerCase();
  function emailValido(e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || "").trim()); }

  var modoCriar = !!CONVITE;
  function prepararLogin() {
    var f = $("#formAtivacao");
    if (CONVITE) {
      $("#ativConvite").hidden = false;
      $("#ativConvite").innerHTML = Icone("usuarios") + "<span>Você recebeu um convite para entrar na agenda de um salão. Crie sua senha com o e-mail <strong>" + esc(EMAIL_CONVITE) + "</strong>. Se já tem conta, clique em \"Já tenho conta\".</span>";
      if (EMAIL_CONVITE) $("#ativEmail").value = EMAIL_CONVITE;
    }
    function atualizar() {
      $("#tAtiv").textContent = modoCriar ? "Criar a sua conta" : "Entrar na sua agenda";
      $("#ativTexto").textContent = modoCriar ? "Crie uma senha com pelo menos 6 caracteres." : "Use o seu e-mail e a sua senha. Funciona no celular e no computador.";
      $("#ativConfirma").hidden = !modoCriar;
      $("#ativSenha").autocomplete = modoCriar ? "new-password" : "current-password";
      $("#ativBotao").textContent = modoCriar ? "Criar conta e entrar" : "Entrar";
      $("#ativTrocar").textContent = modoCriar ? "Já tenho conta. Entrar" : "Primeira vez? Criar minha conta";
      $("#ativEsqueci").hidden = modoCriar;
      $("#ativErro").textContent = ""; $("#ativOk").textContent = "";
    }
    $("#ativTrocar").onclick = function () { modoCriar = !modoCriar; atualizar(); };
    $("#ativEsqueci").onclick = async function () {
      var em = $("#ativEmail").value;
      if (!emailValido(em)) { $("#ativErro").textContent = "Digite o seu e-mail no campo acima."; return; }
      try { await Nuvem.Conta.recuperar(em); $("#ativErro").textContent = ""; $("#ativOk").textContent = "Enviamos um e-mail com o link para criar uma senha nova. Confira também o spam."; }
      catch (err) { $("#ativErro").textContent = Nuvem.traduzir(err); }
    };
    f.onsubmit = async function (e) {
      e.preventDefault();
      var em = $("#ativEmail").value.trim(), senha = $("#ativSenha").value;
      if (!emailValido(em)) { $("#ativErro").textContent = "Digite um e-mail válido."; return; }
      if (!senha || (modoCriar && senha.length < 6)) { $("#ativErro").textContent = "A senha precisa ter pelo menos 6 caracteres."; return; }
      if (modoCriar && senha !== $("#ativSenha2").value) { $("#ativErro").textContent = "As duas senhas não são iguais."; return; }
      $("#ativErro").textContent = ""; $("#ativOk").textContent = "Aguarde...";
      try {
        if (modoCriar) await Nuvem.Conta.criar(em, senha); else await Nuvem.Conta.entrar(em, senha);
      } catch (err) { $("#ativOk").textContent = ""; $("#ativErro").textContent = Nuvem.traduzir(err); return; }
      $("#ativOk").textContent = "";
      $("#ativSenha").value = ""; $("#ativSenha2").value = "";
      fluxo();
    };
    atualizar();
  }

  function telaCriarSalao() {
    mostrar("telaBoasVindas");
    $("#formBoasVindas").onsubmit = async function (e) {
      e.preventDefault();
      var nome = $("#bvNome").value.trim(), pessoa = $("#bvPessoa").value.trim(), zap = $("#bvZap").value.trim();
      if (nome.length < 2) { $("#bvErro").textContent = "Digite o nome do seu negócio."; return; }
      if (pessoa.length < 2) { $("#bvErro").textContent = "Digite o seu nome."; return; }
      if (U.soDigitos(zap).length < 10) { $("#bvErro").textContent = "Digite o WhatsApp com DDD."; return; }
      if (!navigator.onLine) { $("#bvErro").textContent = "Conecte-se à internet para criar o salão."; return; }
      $("#bvErro").textContent = "";
      var btn = e.submitter || $("#formBoasVindas button[type=submit]"); btn.disabled = true;
      try {
        await Nuvem.criarSalao({ nome: nome, nomePessoa: pessoa, whatsapp: zap, atende: $("#bvAtende").checked, horarios: HORARIOS_PADRAO, msgLembrete: MSG_LEMBRETE, origem: params.get("utm_source") || params.get("origem") || "" });
      } catch (err) {
        btn.disabled = false;
        $("#bvErro").textContent = err.code === "permission-denied" ? "Este e-mail já usou o teste grátis. Fale com a Sitebooster para assinar." : Nuvem.traduzir(err);
        return;
      }
      await Nuvem.iniciar();
      abrirApp();
      aviso("Tudo pronto! Seu teste grátis de 30 dias começou. Siga os Primeiros passos na sua agenda.");
      if (location.hash === "#agenda") irPara(); else location.hash = "#agenda";
    };
  }

  async function fluxo() {
    mostrar("telaCarregando");
    var sessao;
    try { sessao = await Nuvem.carregarSessao(); }
    catch (e) { aviso(Nuvem.traduzir(e), "erro"); sessao = null; }
    if (!sessao) { prepararLogin(); mostrar("telaAtivacao"); $(EMAIL_CONVITE ? "#ativSenha" : "#ativEmail").focus(); return; }

    if (Nuvem.ehDemo) Nuvem.ehDemo().then(function (v) { window.__demo = v; if (v) try { atualizarMenu(); } catch (e) {} });
    if (sessao.semSalao) {
      // Funcionário que entrou pela tela normal, sem o link: o sistema acha o convite pelo e-mail dele
      if (!CONVITE && Nuvem.conviteParaMim) CONVITE = (await Nuvem.conviteParaMim()) || "";
      if (CONVITE) {
        try {
          var r = await Nuvem.aceitarConvite(CONVITE, "");
          history.replaceState(null, "", location.pathname);
          CONVITE = "";
          aviso("Bem-vindo(a) à equipe do " + (r.salaoNome || "salão") + "!");
        } catch (err) {
          aviso(err.message || Nuvem.traduzir(err), "erro");
          await Nuvem.Conta.sair();
          location.href = location.pathname;
          return;
        }
      } else return telaCriarSalao();
    }

    await Nuvem.iniciar();
    if (!S.perfil) { aviso("Não encontramos os dados do salão. Fale com a Sitebooster.", "erro"); return; }
    if (S.perfil.exclusao) { aviso("Esta conta foi excluída a pedido do dono. Os dados estão sendo apagados.", "erro"); await Nuvem.Conta.sair(); setTimeout(function () { location.href = location.pathname; }, 3500); return; }
    abrirApp();
    setTimeout(function () {
      Nuvem.prepararLimpeza().then(Nuvem.garantirResumos).catch(function (e) { console.warn("Resumo/limpeza:", e); });
    }, 4000);
  }

  // Texto do andamento da assinatura (usado na faixa do topo e na tela Conta)
  function statusAssinatura(a, completo) {
    var d = function (ms) { return new Date(ms).toLocaleDateString("pt-BR"); };
    if (a.bloqueado) return { nivel: "erro", texto: "O acesso deste salão foi <strong>suspenso pela Sitebooster</strong>. Você ainda vê a agenda, mas não consegue marcar nem alterar. Fale com o suporte: " + esc(APP.suporte || "") + "." };
    var dd = function (n) { return n <= 0 ? "hoje" : n === 1 ? "amanhã" : "em " + n + " dias"; };
    if (a.status === "teste") {
      if (!a.emDia) return { nivel: "erro", texto: "Seu teste grátis <strong>terminou</strong>. Assine para continuar marcando horários." + (a.avisoApagar ? " <strong>Atenção: os dados do salão serão apagados em " + new Date(a.avisoApagar).toLocaleDateString("pt-BR") + "</strong> (6 meses sem assinatura)." : "") };
      return { nivel: a.dias <= 7 ? "aviso" : "info", texto: "Teste grátis com <strong>tudo liberado</strong> (até " + a.limite + " profissionais): " + (a.dias === 1 ? "falta <strong>1 dia</strong>" : "faltam <strong>" + a.dias + " dias</strong>") + (a.fim ? " (até " + d(a.fim) + ")." : ".") };
    }
    if (a.status === "ativa" && a.emDia) {
      if (a.testeAte && a.testeAte > Date.now() && !a.cancelada) return { nivel: "info", texto: "Plano <strong>" + esc(a.planoNome) + "</strong> já garantido. Você ainda está nos <strong>dias grátis até " + d(a.testeAte) + "</strong>; o plano " + esc(a.planoNome) + " começa a contar depois disso e vai até <strong>" + d(a.fim) + "</strong>. Nenhum dia grátis foi perdido." };
      if (a.cancelada) return { nivel: "aviso", texto: "Assinatura <strong>cancelada</strong>. Você ainda pode usar por <strong>" + a.dias + " dia(s)</strong>: o acesso expira em <strong>" + d(a.fim) + "</strong>." + (completo ? " Para continuar depois disso, assine de novo abaixo." : "") };
      if (a.atrasada) return { nivel: "aviso", texto: "<strong>Pagamento atrasado</strong> na Kiwify. Regularize para não perder o acesso em " + d(a.fim) + "." };
      if (a.proxima) return { nivel: a.diasRenova <= 3 ? "aviso" : "info", texto: "Assinatura <strong>ativa</strong>. Sua assinatura renova <strong>" + dd(a.diasRenova) + "</strong> (" + d(a.proxima) + "), automaticamente pela Kiwify." };
      return { nivel: "info", texto: "Assinatura <strong>ativa</strong>, com renovação automática pela Kiwify. Acesso garantido até " + d(a.fim) + "." };
    }
    var apagar = a.avisoApagar ? " <strong>Atenção: os dados do salão serão apagados em " + d(a.avisoApagar) + "</strong> (6 meses sem assinatura). Assine para manter ou baixe um backup." : "";
    if (a.status === "teste" && apagar) return { nivel: "erro", texto: "Seu teste grátis <strong>terminou</strong>." + apagar };
    if (a.status === "cancelada") return { nivel: "erro", texto: "Sua assinatura foi <strong>encerrada</strong>. Você ainda vê a agenda, mas não consegue marcar nem alterar." + apagar };
    if (apagar) return { nivel: "erro", texto: "Sua assinatura está <strong>pendente</strong>." + apagar };
    return { nivel: "erro", texto: "Sua assinatura está <strong>pendente</strong>. Você ainda vê a agenda, mas não consegue marcar nem alterar." };
  }
  // Aviso publicado pela Central: aparece até a pessoa fechar (lembra no aparelho)
  function mostrarComunicado() {
    if (!Nuvem.comunicados) return;
    Nuvem.comunicados().then(function (lista) {
      var f = $("#faixaComunicado"); if (!f) return;
      var vistos; try { vistos = JSON.parse(localStorage.getItem("bs-avisos-vistos") || "[]"); } catch (e) { vistos = []; }
      // Avisos da Central ficam fixos: só a Sitebooster tira (botão "Desligar" na Central)
      var ord = lista.slice().sort(function (a, b) { return (b.criadoEm && b.criadoEm.toMillis ? b.criadoEm.toMillis() : 0) - (a.criadoEm && a.criadoEm.toMillis ? a.criadoEm.toMillis() : 0); });
      if (!ord.length) { f.hidden = true; return; }
      f.hidden = false;
      f.innerHTML = ord.slice(0, 3).map(function (c) { return '<div class="comunicado">' + Icone("sino") + "<div><b>Aviso da Sitebooster</b><span>" + esc(c.texto) + "</span></div></div>"; }).join("");
    });
  }
  function faixaAssinatura() {
    var f = $("#faixaAssinatura"); if (!f) return;
    var a = Nuvem.assinatura(), st = statusAssinatura(a, false);
    // Para o dono, a faixa mostra sempre o andamento; para o profissional, só quando o salão está bloqueado
    if (!a.emDia) {
      f.hidden = false; f.className = "faixa-assinatura faixa-assinatura--erro";
      f.innerHTML = Icone("alerta") + "<span>" + st.texto + (dono() ? ' <a href="#conta">Assinar agora</a>' : " Avise o dono do salão.") + "</span>";
    } else if (dono()) {
      f.hidden = false; f.className = "faixa-assinatura" + (st.nivel === "info" ? " faixa-assinatura--info" : "");
      f.innerHTML = Icone(st.nivel === "info" ? "estrela" : "relogio") + "<span>" + st.texto + ' <a href="#conta">Ver plano</a></span>';
    } else f.hidden = true;
  }

  var aberto = false;
  // Menu: Comissões só aparece quando há equipe; no celular, barra embaixo com o principal + "Mais"
  function temEquipe() { return S.profissionais.some(function (p) { return !p.ehDono && !p.removido; }); }
  var TELAS_SALAO = { salao: 1, servicos: 1, horarios: 1, link: 1, equipe: 1 };
  function atualizarMenu() {
    // Faixa no topo deixando claro quem está usando: painel do dono (administração) ou agenda do colaborador
    var pf = $("#papelFaixa");
    if (pf) {
      var eu = dono() ? null : S.profissionais.filter(function (p) { return p.id === Nuvem.meuProfId(); })[0];
      pf.hidden = false; pf.className = "papel-faixa " + (dono() ? "papel-faixa--dono" : "papel-faixa--prof");
      pf.innerHTML = dono()
        ? Icone("tesoura") + "<div><b>Painel do salão · " + esc(nomeNegocio()) + (window.__demo ? ' <span class="tag tag--info">DEMONSTRAÇÃO</span>' : "") + "</b><span>" + (window.__demo ? "Conta de demonstração: nada aqui vai para a Central" : "Administração: agenda de todos, equipe, plano e configurações") + "</span></div>"
        : Icone("calendario") + "<div><b>Agenda do colaborador · " + esc((eu && eu.nome) || "Profissional") + "</b><span>" + esc(nomeNegocio()) + " · seus horários, clientes e comissões</span></div>";
    }
    if (pf && window.__demo && dono()) {
      pf.insertAdjacentHTML("beforeend", '<button type="button" class="btn btn--sec btn--peq papel-faixa__demo" id="recomecarDemo">' + Icone("recarregar") + "Recomeçar demonstração</button>");
      pf.classList.add("papel-faixa--demo");
      $("#recomecarDemo").onclick = async function () {
        if (!confirm("Recomeçar a demonstração?\nApaga TUDO desta conta de demonstração (agenda, clientes, equipe, serviços) e volta para o começo do tutorial.")) return;
        this.disabled = true; this.textContent = "Apagando...";
        try { await Nuvem.recomecarDemo(); location.href = location.pathname; } catch (e) { aviso("Não deu para recomeçar: " + e.message, "erro"); this.disabled = false; }
      };
    }
    $$(".menu__sub").forEach(function (m) { var t = dono() ? m.dataset.subDono : m.dataset.subProf; m.textContent = t || ""; m.hidden = !t; });
    $$("[data-so-dono]").forEach(function (a) { a.hidden = !dono(); });
    $$("[data-so-prof]").forEach(function (a) { a.hidden = dono(); });
    $$("[data-so-equipe]").forEach(function (a) { a.hidden = dono() && !temEquipe(); });
    var nb = $("#navBaixo"); if (!nb) return;
    var principais = $$(".menu a[data-principal]").filter(function (a) { return !a.hidden; });
    var semSub = function (a) { var c = a.cloneNode(true); $$(".menu__sub", c).forEach(function (x) { x.remove(); }); return c.innerHTML; };
    nb.innerHTML = principais.map(function (a) { return '<a href="' + a.getAttribute("href") + '" data-tela="' + a.dataset.tela + '">' + semSub(a) + "</a>"; }).join("") +
      '<button type="button" id="navMais">' + Icone("lista") + "Mais</button>";
    $("#navMais").onclick = function () {
      var outros = $$(".menu a").filter(function (a) { return !a.hidden && !a.hasAttribute("data-principal"); });
      var j = janelaAbrir("Menu", '<nav class="menu-mais">' + outros.map(function (a) { return '<a href="' + a.getAttribute("href") + '">' + a.innerHTML + "</a>"; }).join("") + "</nav>", "", false, true);
      j.form.onclick = function (e) { if (e.target.closest("a")) $("#janela").close(); };
    };
  }
  function abrirApp() {
    mostrar("app");
    atualizarMenu();
    $$("[data-rotulo-comissoes]").forEach(function (s) { s.textContent = dono() ? "Comissões" : "Meus ganhos"; });
    faixaAssinatura(); mostrarComunicado();
    if (aberto) return irPara();
    aberto = true;
    window.addEventListener("hashchange", irPara);
    document.addEventListener("nuvem", function (e) { setTimeout(conferirPassos, 50); if (e.detail && e.detail.tabela === "perfil") faixaAssinatura(); if (e.detail && e.detail.tabela === "profissionais") atualizarMenu(); redesenhar(); });
    document.addEventListener("nuvem-erro", function (e) { aviso(e.detail, "erro"); });
    document.addEventListener("resposta-cliente", function (e) {
      var a = e.detail; Som.tocar(a.status === "cancelado" ? "desmarcou" : "ok");
      aviso(a.clienteNome + (a.status === "cancelado" ? " desmarcou" : " confirmou") + " pelo link: " + U.quandoTexto(a.data) + " às " + a.inicio + (a.profNome && equipeVisivel() ? " com " + a.profNome : "") + "." + (a.status === "cancelado" && a.motivoCliente ? " Motivo: " + a.motivoCliente + "." : ""), a.status === "cancelado" ? "erro" : "info");
    });
    document.addEventListener("novo-online", function (e) {
      var a = e.detail; Som.tocar("novo");
      aviso("Novo agendamento pelo link: " + a.clienteNome + ", " + U.quandoTexto(a.data) + " às " + a.inicio + (a.profNome && equipeVisivel() ? " com " + a.profNome : "") + ".", "info");
    });
    if (dono()) Backup.iniciar();
    irPara();
    // Profissional: avisa se a comissão vai mudar e ele ainda não confirmou
    if (!dono()) setTimeout(function () {
      var eu = prof(Nuvem.meuProfId()), f = regraFutura(eu);
      if (f && !(eu.ciente && eu.ciente[f.desde])) aviso("Sua comissão vai mudar em " + U.dataCurta(f.desde) + ". Veja em Meus ganhos e confirme que está ciente.", "info");
    }, 1500);
  }

  async function iniciar() {
    document.title = APP.nome + APP.sufixo;
    $$("[data-marca]").forEach(function (m) { m.innerHTML = marcaHTML(); });
    $$("[data-icone]").forEach(function (s) { s.outerHTML = Icone(s.dataset.icone); });
    $("#versao").textContent = "v" + APP.versao;
    rede(); window.addEventListener("online", rede); window.addEventListener("offline", rede);
    if ("serviceWorker" in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register("sw.js").catch(function () {});
    await fluxo();
  }

  iniciar().catch(function (e) {
    console.error(e);
    document.body.insertAdjacentHTML("afterbegin", '<p class="erro" style="padding:20px">Não foi possível abrir o sistema: ' + esc(e.message) + "</p>");
  });
})();
