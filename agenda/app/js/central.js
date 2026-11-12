/* Central da Sitebooster: painel do dono do sistema (só contas em admins/{uid}).
   Abas: Visão geral · Salões (lista + ficha de cada salão) · Uso do banco · Comunicados · Sugestões · Atividade.
   Toda ação feita aqui fica registrada em central/dados/auditoria. */
(function () {
  "use strict";
  var PLANOS = { essencial: { nome: "Essencial", preco: 37.90, limite: 2 }, equipe: { nome: "Equipe", preco: 64.90, limite: 5 }, salao: { nome: "Salão", preco: 99.90, limite: 10 } };
  var TAXA = function (v) { return v * 0.0899 + 2.49; }; // taxa aproximada da Kiwify por venda (confira no painel da Kiwify)
  var ROBO = APP.robo || "https://booster-agenda-robo.sitebooster.workers.dev";
  var app = FB.initializeApp(APP.firebase), auth = FB.getAuth(app), db = FB.getFirestore(app);
  var esc = U.esc, brl = U.brl, D = 864e5;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var C = $("#cenConteudo");
  $("[data-marca]").innerHTML = '<svg class="marca__simbolo" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffc21a"/><stop offset="1" stop-color="#e8730c"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#g)"/><text x="32" y="43" font-size="30" font-weight="800" text-anchor="middle" fill="#fff" font-family="Poppins,sans-serif">C</text></svg><span class="marca__nome">Central <b>Sitebooster</b></span> <span class="tag tag--info" title="Sistema que esta Central está mostrando">BoosterAgenda</span>';

  /* ---------- utilidades ---------- */
  function ms(v) { return v && v.toMillis ? v.toMillis() : (v instanceof Date ? v.getTime() : (typeof v === "string" ? Date.parse(v) || 0 : (typeof v === "number" ? v : 0))); }
  function data(v) { var m = ms(v); return m ? new Date(m).toLocaleDateString("pt-BR") : "-"; }
  function dataHora(v) { var m = ms(v); return m ? new Date(m).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"; }
  function ha(v) { var m = ms(v); if (!m) return "nunca"; var s = (Date.now() - m) / 1000; if (s < 90) return "agora"; if (s < 3600) return Math.round(s / 60) + " min atrás"; if (s < 86400) return Math.round(s / 3600) + " h atrás"; return Math.round(s / 86400) + " dias atrás"; }
  function num(n) { return (Number(n) || 0).toLocaleString("pt-BR"); }
  function lista(q) { return FB.getDocs(q).then(function (r) { return r.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); }); }
  function col() { return FB.collection.apply(null, [db].concat([].slice.call(arguments))); }
  function aviso(t) { var a = document.createElement("div"); a.className = "aviso"; a.style.cssText = "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:99;max-width:92vw"; a.textContent = t; document.body.appendChild(a); setTimeout(function () { a.remove(); }, 3500); }
  function registrar(acao, salaoId, detalhe) {
    return FB.setDoc(FB.doc(col("central", "dados", "auditoria")), { acao: acao, salaoId: salaoId || "", detalhe: detalhe || "", por: (auth.currentUser || {}).email || "", quando: FB.serverTimestamp() }).catch(function () {});
  }
  function statusDe(s) {
    var a = s.assinatura || {}, fim = ms(a.status === "ativa" ? a.pagoAte : a.testeAte), ag = Date.now();
    if (s.exclusao) return { k: "excluindo", t: "Exclusão pedida", cor: "erro" };
    if (a.bloqueado) return { k: "bloqueado", t: "Bloqueado", cor: "erro" };
    if (a.status === "ativa" && fim > ag) return a.cancelada ? { k: "cancelando", t: "Cancelou (usa até o fim)", cor: "alerta" } : { k: "ativo", t: "Assinante", cor: "ok" };
    if (a.status === "teste" && fim > ag) return { k: "teste", t: "Teste grátis", cor: "info" };
    return { k: "encerrado", t: "Encerrado", cor: "erro" };
  }
  function tag(st) { return '<span class="tag tag--' + st.cor + '">' + esc(st.t) + "</span>"; }
  function barra(rotulo, valor, limite, sufixo) {
    var p = limite ? Math.min(100, valor / limite * 100) : 0, cor = p >= 90 ? "var(--erro)" : p >= 70 ? "var(--alerta)" : "var(--ok)";
    return '<div class="barra-uso"><div class="barra-uso__topo"><b>' + esc(rotulo) + "</b><span>" + esc(sufixo || (num(valor) + " de " + num(limite))) + " · <b>" + p.toFixed(1).replace(".", ",") + '%</b></span></div><div class="barra-uso__trilho"><i style="width:' + p + "%;background:" + cor + '"></i></div></div>';
  }
  // Gráfico simples (SVG, sem biblioteca): linha ou barras
  function grafico(pontos, op) {
    op = op || {}; if (!pontos.length) return '<p class="sub">Ainda sem dados. O robô guarda uma foto dos números todo dia às 6h.</p>';
    var cel = window.innerWidth < 640, W = cel ? 360 : 640, H = cel ? 210 : 190, P = cel ? 24 : 30, FS = cel ? 12 : 12, max = Math.max.apply(null, pontos.map(function (p) { return p.v; }).concat([op.min || 1]));
    var x = function (i) { return op.barras ? P + (i + 0.5) * (W - 2 * P) / pontos.length : P + (pontos.length === 1 ? (W - 2 * P) / 2 : i * (W - 2 * P) / (pontos.length - 1)); }, y = function (v) { return H - P - (v / max) * (H - 2 * P); };
    var dica = function (p) { return "<title>" + esc(p.r + ": " + (op.fmt ? op.fmt(p.v) : num(p.v))) + "</title>"; };
    var corpo = op.barras
      ? pontos.map(function (p, i) { var w = Math.max(6, (W - 2 * P) / pontos.length * 0.6); return '<rect x="' + (x(i) - w / 2) + '" y="' + y(p.v) + '" width="' + w + '" height="' + (H - P - y(p.v)) + '" rx="3" fill="var(--ouro-2)">' + dica(p) + "</rect>"; }).join("")
      : '<polyline fill="none" stroke="var(--ouro-2)" stroke-width="3" points="' + pontos.map(function (p, i) { return x(i) + "," + y(p.v); }).join(" ") + '"/>' + pontos.map(function (p, i) { return '<circle cx="' + x(i) + '" cy="' + y(p.v) + '" r="4" fill="var(--ouro-2)">' + dica(p) + "</circle>"; }).join("");
    var rot = pontos.map(function (p, i) { return (pontos.length <= 8 || i % Math.ceil(pontos.length / 8) === 0) ? '<text x="' + x(i) + '" y="' + (H - 8) + '" font-size="' + FS + '" text-anchor="middle" fill="var(--txt-2)">' + esc(p.r) + "</text>" : ""; }).join("");
    return '<svg class="grafico" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(op.titulo || "gráfico") + '"><line x1="' + P + '" y1="' + (H - P) + '" x2="' + (W - P) + '" y2="' + (H - P) + '" stroke="var(--linha-2)"/>' +
      '<text x="' + P + '" y="14" font-size="' + FS + '" fill="var(--txt-2)">máx. ' + esc(op.fmt ? op.fmt(max) : num(max)) + "</text>" + corpo + rot + "</svg>" +
      (op.barras && pontos.some(function (p) { return p.v > 0; }) ? '<ul class="graf-lista">' + pontos.filter(function (p) { return p.v > 0; }).map(function (p) { return "<li><span>" + esc(p.r) + "</span><b>" + esc(op.fmt ? op.fmt(p.v) : num(p.v)) + "</b></li>"; }).join("") + "</ul>" : "");
  }

  /* ---------- entrar ---------- */
  function telaEntrar(msg) {
    $("#cenNav").hidden = true;
    C.innerHTML = '<form class="painel" id="fEntrar" style="max-width:420px;margin:30px auto"><h2>Entrar na Central</h2>' +
      (msg ? '<p class="nota nota--alerta">' + esc(msg) + "</p>" : "") +
      '<label>E-mail<input name="email" type="email" required autocomplete="username"></label>' +
      '<label>Senha<input name="senha" type="password" required autocomplete="current-password"></label>' +
      '<div class="atalhos"><button class="btn btn--pri" type="submit">Entrar</button></div></form>';
    $("#fEntrar").onsubmit = function (e) {
      e.preventDefault(); var f = e.target;
      FB.signInWithEmailAndPassword(auth, f.email.value.trim(), f.senha.value).catch(function () { telaEntrar("E-mail ou senha incorretos."); });
    };
  }
  $("#cenSair").onclick = function () { FB.signOut(auth); };
  FB.onAuthStateChanged(auth, function (u) {
    $("#cenSair").hidden = !u; $("#cenQuem").textContent = u ? u.email : "";
    if (!u) return telaEntrar();
    FB.getDoc(FB.doc(db, "admins", u.uid)).then(function (d) {
      if (!d.exists()) return telaEntrar("Esta conta não é administradora da Central.");
      iniciar();
    }, function () { telaEntrar("Esta conta não é administradora da Central."); });
  });

  /* ---------- dados ---------- */
  var DADOS = { saloes: [], usuarios: [], sugestoes: [], comunicados: [], pendentes: [], eventos: [], trocas: [], diario: [], rotina: null, auditoria: [] };
  var USO = null, desligar = [], iniciado = false;
  async function carregar() {
    var desde = FB.Timestamp.fromMillis(Date.now() - 90 * D), desdeEv = FB.Timestamp.fromMillis(Date.now() - 400 * D), pega = function (p) { return p.catch(function () { return []; }); };
    var r = await Promise.all([
      pega(lista(col("saloes"))), pega(lista(col("usuarios"))), pega(lista(col("sugestoes"))), pega(lista(col("comunicados"))), pega(lista(col("pagamentosPendentes"))),
      pega(lista(FB.query(col("central", "dados", "eventos"), FB.where("quando", ">=", desdeEv)))), pega(lista(col("central", "dados", "trocas"))),
      pega(lista(col("central", "dados", "diario"))), FB.getDoc(FB.doc(db, "central", "dados", "rotina", "ultima")).then(function (d) { return d.exists() ? d.data() : null; }, function () { return null; }),
      pega(lista(FB.query(col("central", "dados", "auditoria"), FB.where("quando", ">=", desde))))
    ]);
    DADOS = { saloes: r[0], usuarios: r[1], sugestoes: r[2], comunicados: r[3], pendentes: r[4], eventos: r[5], trocas: r[6], diario: r[7].sort(function (a, b) { return a.id < b.id ? -1 : 1; }), rotina: r[8], auditoria: r[9] };
  }
  function donoDe(sid) { return DADOS.usuarios.filter(function (u) { return u.papel === "dono" && u.salaoId === sid; })[0] || {}; }
  async function buscarUso() {
    try {
      var tk = await auth.currentUser.getIdToken();
      var r = await fetch(ROBO + "/central/uso", { headers: { Authorization: "Bearer " + tk } });
      USO = await r.json(); USO.recebidoEm = Date.now();
    } catch (e) { USO = { erro: "sem-conexao" }; }
    var t = rota().tela; if (t === "uso" || t === "geral") desenhar();
  }

  /* ---------- navegação ---------- */
  var ABAS = [["geral", "Visão geral", "grafico"], ["notificacoes", "Notificações", "sino"], ["financeiro", "Financeiro", "dinheiro"], ["saloes", "Salões", "usuarios"], ["uso", "Uso do banco", "nuvem"], ["comunicados", "Comunicados", "whatsapp"], ["ajuda", "Ajuda", "info"]];
  function rota() { var h = (location.hash || "#geral").slice(1).split("/"); return { tela: h[0] || "geral", id: h[1] ? decodeURIComponent(h[1]) : "" }; }
  async function iniciar() {
    var nav = $("#cenNav"); nav.hidden = false;
    nav.innerHTML = ABAS.map(function (a) { return '<a href="#' + a[0] + '" data-aba="' + a[0] + '">' + Icone(a[2]) + "<span>" + a[1] + "</span></a>"; }).join("");
    if (iniciado) { desenhar(); return; }
    iniciado = true;
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});
    C.innerHTML = '<p class="sub">Carregando os números...</p>';
    await carregar(); desenhar(); buscarUso();
    setInterval(buscarUso, 60000);                        // uso do banco: atualiza sozinho a cada minuto
    setInterval(function () { var t = rota().tela; if (t === "geral" || t === "saloes") carregar().then(desenhar); }, 5 * 60000);
    ouvirLidas(); aoVivo();
    window.onhashchange = desenhar;
  }

  // Feed ao vivo: escuta pagamentos, sugestões e salões novos sem precisar recarregar
  var FEED = [];
  function aoVivo() {
    desligar.forEach(function (f) { f(); }); desligar = [];
    var inicio = Date.now(), semana = FB.Timestamp.fromMillis(Date.now() - 7 * D);
    function mostrarFeed() { atualizarBadge(); }
    function novo(txt, quando, recarrega) { FEED.push({ txt: txt, quando: quando || Date.now() }); if (ms(quando) > inicio - 5000) { aviso(txt); if (window.Som) Som.tocar(/^(⚠️|↩️|⏰)/.test(txt) ? "desmarcou" : "novo"); if (recarrega) carregar().then(function () { var t = rota().tela; if (t !== "salao") desenhar(); else atualizarBadge(); }); } }
    try {
      desligar.push(FB.onSnapshot(FB.query(col("central", "dados", "eventos"), FB.where("quando", ">=", semana)), function (q) {
        q.docChanges().forEach(function (c) {
          if (c.type !== "added") return; var e = c.doc.data();
          if (!e.acao) e.acao = { order_approved: "pago", order_refunded: "estornado", order_chargedback: "estornado", subscription_canceled: "cancelado", subscription_late: "atrasado" }[e.evento] || "";
          var t = e.acao === "pago" ? "💰 Pagamento: " + e.email + " (" + ((PLANOS[e.plano] || {}).nome || e.plano || "") + ")" : e.acao === "estornado" ? "⚠️ Estorno: " + e.email : e.acao === "cancelado" ? "↩️ Cancelamento: " + e.email : e.acao === "atrasado" ? "⏰ Pagamento atrasado: " + e.email : "• " + (e.evento || "evento") + (e.email ? ": " + e.email : "");
          novo(t, e.quando, true);
        });
        mostrarFeed();
      }, function () {}));
      desligar.push(FB.onSnapshot(col("sugestoes"), function (q) {
        q.docChanges().forEach(function (c) { var x = c.doc.data(); if (c.type === "added" && ms(x.quando) > Date.now() - 7 * D) novo("💬 " + (x.tipo === "problema" ? "Problema relatado" : "Nova sugestão") + ": " + String(x.texto || "").slice(0, 60), x.quando, true); });
        mostrarFeed();
      }, function () {}));
      desligar.push(FB.onSnapshot(col("saloes"), function (q) {
        q.docChanges().forEach(function (c) { var x = c.doc.data(); if (c.type === "added" && ms(x.criadoEm) > Date.now() - 7 * D) novo("🎉 Novo salão: " + (x.nome || "sem nome"), x.criadoEm, true); });
        mostrarFeed();
      }, function () {}));
    } catch (e) {}
  }
  function feedHTML() {
    if (!FEED.length) return '<p class="sub">Nada nos últimos 7 dias. Novos salões, pagamentos e sugestões aparecem aqui na hora, sem recarregar.</p>';
    return '<ul class="feed">' + FEED.slice(0, 15).map(function (f) { return "<li><span>" + esc(f.txt) + '</span><span class="sub">' + esc(ha(f.quando)) + "</span></li>"; }).join("") + "</ul>";
  }

  function desenhar() {
    var r = rota();
    $$("#cenNav a").forEach(function (a) { var on = a.dataset.aba === r.tela || (r.tela === "salao" && a.dataset.aba === "saloes"); if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    if (r.tela === "sugestoes" || r.tela === "atividade") { location.replace("#notificacoes/" + (r.tela === "sugestoes" ? "sugestoes" : "acoes")); return; }
    if (r.tela !== "salao") pararFat();
    var T = { geral: telaGeral, notificacoes: telaNotificacoes, financeiro: telaFinanceiro, saloes: telaSaloes, salao: telaSalao, uso: telaUso, comunicados: telaComunicados, ajuda: telaAjuda }[r.tela] || telaGeral;
    T(r.id);
    if (T === telaGeral) avisosCel().catch(function () {});
    atualizarBadge();
  }

  /* ---------- números ---------- */
  function numeros() {
    var n = { ativos: 0, testes: 0, testesFim: 0, cancelando: 0, encerrados: 0, bloqueados: 0, mrr: 0, liquido: 0, porPlano: {} }, ag = Date.now();
    DADOS.saloes.forEach(function (s) {
      var st = statusDe(s), a = s.assinatura || {}, p = PLANOS[a.plano] || PLANOS.essencial;
      if (st.k === "ativo" || st.k === "cancelando") { n.ativos++; n.porPlano[p.nome] = (n.porPlano[p.nome] || 0) + 1; }
      if (st.k === "ativo") { n.mrr += p.preco; n.liquido += p.preco - TAXA(p.preco); }
      if (st.k === "cancelando") n.cancelando++;
      if (st.k === "teste") { n.testes++; if (ms(a.testeAte) - ag < 5 * D) n.testesFim++; }
      if (st.k === "encerrado" || st.k === "excluindo") n.encerrados++;
      if (st.k === "bloqueado") n.bloqueados++;
    });
    var ev = DADOS.eventos.filter(function (e) { return ms(e.quando) > ag - 30 * D; });
    n.vendasMes = ev.filter(function (e) { return e.acao === "pago"; }).length;
    n.cancelMes = ev.filter(function (e) { return e.acao === "cancelado"; }).length;
    n.estornosMes = ev.filter(function (e) { return e.acao === "estornado"; }).length;
    var pagaram = DADOS.saloes.filter(function (s) { var a = s.assinatura || {}; return a.status === "ativa" || a.status === "cancelada"; }).length;
    n.conversao = DADOS.saloes.length ? Math.round(pagaram / DADOS.saloes.length * 100) : 0;
    return n;
  }
  // Previsão: no ritmo dos últimos dias, em quantos dias a média diária passa de 70% do limite grátis
  function previsao(dias, campo, limite) {
    var v = dias.map(function (d) { return d[campo] || 0; }); if (v.length < 2) return null;
    var rec = v.slice(-3), med = rec.reduce(function (s, x) { return s + x; }, 0) / rec.length;
    var velhos = v.slice(0, Math.max(1, v.length - 3)), ant = velhos.reduce(function (s, x) { return s + x; }, 0) / velhos.length;
    var cresc = Math.max(0, (med - ant) / Math.max(1, v.length - 2));
    if (med >= limite * 0.7) return { ja: true, med: med };
    if (cresc <= 0) return { med: med, dias: null };
    return { med: med, dias: Math.ceil((limite * 0.7 - med) / cresc) };
  }
  function alertas() {
    var out = [], ag = Date.now(), rot = DADOS.rotina;
    if (!rot || ag - ms(rot.quando) > 30 * 3600e3) out.push("A rotina diária do robô <b>não rodou nas últimas 30 horas</b>" + (rot ? " (última: " + dataHora(rot.quando) + ")" : "") + ". Me chame para verificar.");
    if (DADOS.pendentes.length) out.push("<b>" + DADOS.pendentes.length + " pagamento(s) esperando o salão criar a conta</b>: " + DADOS.pendentes.map(function (p) { return esc(p.email); }).join(", ") + ". Se continuar por vários dias, a pessoa usou outro e-mail: escreva para ela.");
    var est = DADOS.eventos.filter(function (e) { return e.acao === "estornado" && ms(e.quando) > ag - 30 * D; });
    if (est.length) out.push("<b>" + est.length + " estorno(s) ou contestação(ões)</b> nos últimos 30 dias: " + est.map(function (e) { return esc(e.email) + " (" + data(e.quando) + ")"; }).join(", "));
    var tr = DADOS.trocas.filter(function (t) { return !t.conferido; });
    if (tr.length) out.push("<b>" + tr.length + " troca(s) de plano</b>. O app já mostra ao cliente o botão de cancelar o plano antigo: " + tr.map(function (t) { return esc(t.email) + " (" + esc(t.de) + " → " + esc(t.para) + ")"; }).join(", "));
    if (USO && USO.hoje && USO.limites && !USO.erroMonitoring) {
      [["leituras", "Leituras"], ["gravacoes", "Gravações"], ["exclusoes", "Exclusões"]].forEach(function (k) {
        var p = (USO.hoje[k[0]] || 0) / USO.limites[k[0]] * 100;
        if (p >= 70) out.push("<b>" + k[1] + " de hoje em " + Math.round(p) + "%</b> do limite grátis. Se chegar a 100%, o app para de salvar e carregar até a cota zerar (" + dataHora(USO.zeraEm) + ").");
      });
      var pv = previsao(USO.dias || [], "leituras", USO.limites.leituras);
      if (pv && pv.dias && pv.dias <= 30) out.push("<b>Previsão:</b> no ritmo atual, as leituras passam de 70% do limite em <b>" + pv.dias + " dias</b>. Hora de planejar o próximo passo.");
    }
    if (USO && USO.espacoEstimadoBytes && USO.limites && USO.espacoEstimadoBytes / USO.limites.espacoBytes > 0.7) out.push("O banco está com cerca de <b>" + Math.round(USO.espacoEstimadoBytes / USO.limites.espacoBytes * 100) + "%</b> do espaço grátis.");
    return out;
  }

  /* ---------- telas ---------- */
  function kpi(v, t) { return '<div class="kpi"><b>' + esc(String(v)) + "</b><span>" + esc(t) + "</span></div>"; }
  function saudeHTML() {
    var ag = Date.now(), rot = DADOS.rotina, kw = USO && USO.saude && USO.saude.kiwify;
    var item = function (ok, nome, txt) { return '<li class="' + (ok ? "ok" : "ruim") + '">' + Icone(ok ? "check" : "alerta") + "<b>" + esc(nome) + "</b><span>" + esc(txt) + "</span></li>"; };
    return '<ul class="saude">' +
      item(!!(USO && !USO.erro), "Robô (Cloudflare)", USO ? (USO.erro ? "sem resposta" : "respondendo · " + ha(USO.recebidoEm)) : "verificando...") +
      item(!!rot && ag - ms(rot.quando) < 30 * 3600e3, "Rotina diária", rot ? "última " + dataHora(rot.quando) : "nunca rodou") +
      item(true, "Banco de dados (Firebase)", "respondendo") +
      item(true, "Avisos da Kiwify", kw ? "último " + ha(kw) : "nenhum ainda (normal antes da 1ª venda)") +
      "</ul>";
  }
  function telaGeral() {
    C.innerHTML = painelPendentes() +
      '<details class="painel painel--rec" id="avisosCel"><summary><h2>' + Icone("sino") + 'Avisos no celular <span class="sub" id="avisosCelResumo">verificando...</span></h2></summary><div id="avisosCelCorpo"></div></details>' +
      '<section class="painel"><h2>' + Icone("nuvem") + "Saúde do sistema</h2>" + saudeHTML() + "</section>" +
      resumoHoje();
    ligarNotifs($("#painelPend"), function () { telaGeral(); avisosCel().catch(function () {}); });
    var lg = $("#lerTudoGeral"); if (lg) lg.onclick = function () { marcarNotif(pendentes().map(function (n) { return n.id; }), "lida").then(function () { telaGeral(); avisosCel().catch(function () {}); }); };
  }
  function resumoHoje() {
    var n = numeros(), hoje = hojeBR(), mes = faixa({ modo: "mes", ref: hoje });
    return '<section class="painel"><h2>' + Icone("dinheiro") + "Resumo de hoje</h2>" +
      '<div class="kpis">' + kpi(brl(n.mrr), "receita mensal (assinaturas ativas)") + kpi(n.ativos, "assinantes") + kpi(n.testes, "em teste grátis") + kpi(brl(somaPagos(mes.de, mes.ate)), "recebido neste mês") + "</div>" +
      '<div class="atalhos"><a class="btn btn--sec btn--peq" href="#financeiro">' + Icone("grafico") + "Ver o financeiro completo</a></div></section>";
  }
  function telaFinanceiro() {
    C.innerHTML = painelReceita() + painelPlanos() + painelMovimento() + painelPagamentos();
    ligarPer("perRec", PER, function () { var y = window.scrollY; telaFinanceiro(); window.scrollTo(0, y); });
  }

  /* ---------- Avisos no celular (Web Push) ---------- */
  function ehIOS() { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }
  function instaladoApp() { return (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true; }
  function b64Bytes(t) { var b = atob(t.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((t.length + 3) % 4)), o = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; }
  async function avisosCel() {
    var box = $("#avisosCelCorpo"), res = $("#avisosCelResumo"), det = $("#avisosCel"); if (!box) return;
    var explica = '<p class="sub">Receba no celular, na hora: pagamento recebido, cancelamento, estorno, salão novo no teste e um resumo do dia. Funciona com o app fechado.</p>';
    function por(html, resumo, abrir) { box.innerHTML = explica + html; if (res) res.textContent = resumo || ""; if (det && abrir) det.open = true; }
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      return por(ehIOS() && !instaladoApp()
        ? '<div class="alerta-c alerta-c--info">' + Icone("info") + "<div><b>No iPhone, primeiro instale a Central:</b> abra esta página no <b>Safari</b>, toque em <b>Compartilhar</b> (quadrado com seta) → <b>Adicionar à Tela de Início</b>. Depois abra pelo ícone <b>Central</b> e volte aqui.</div></div>"
        : '<p class="sub">Este navegador não recebe avisos. Use o Chrome (Android/computador) ou a Central instalada no iPhone.</p>', "não disponível neste aparelho");
    }
    if (Notification.permission === "denied") return por('<div class="alerta-c">' + Icone("alerta") + "<div>Os avisos foram bloqueados neste aparelho. " + (ehIOS() ? "No iPhone: <b>Ajustes → Notificações → Central</b> → Permitir." : "Libere nas configurações do site (cadeado ao lado do endereço) → Notificações → Permitir.") + "</div></div>", "bloqueados neste aparelho", true);
    var reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
    if (sub) {
      por('<div class="alerta-c alerta-c--ok">' + Icone("check") + "<div><b>Ligado neste aparelho.</b></div></div>" +
        '<div class="atalhos"><button class="btn btn--sec" id="pushTeste" type="button">' + Icone("sino") + "Mandar um aviso de teste</button>" +
        '<button class="btn btn--sec" id="pushDesl" type="button">Desligar neste aparelho</button></div><p class="sub" id="pushMsg"></p>', "✅ ligados neste aparelho · toque para alterar");
      $("#pushTeste").onclick = async function () {
        this.disabled = true; $("#pushMsg").textContent = "Enviando...";
        try { await inscreverNoRobo(sub); var r = await chamarRobo("/central/push/teste"); $("#pushMsg").textContent = r.enviados ? "Enviado! Deve chegar em alguns segundos." : "Não consegui enviar (" + (r.motivo || (r.erros || []).join(", ") || "sem aparelho") + ")."; }
        catch (e) { $("#pushMsg").textContent = "Erro: " + e.message; } this.disabled = false;
      };
      $("#pushDesl").onclick = async function () { await sub.unsubscribe(); avisosCel(); };
      return;
    }
    por('<button class="btn btn--pri" id="pushLigar" type="button">' + Icone("sino") + 'Ligar avisos neste aparelho</button><p class="sub" id="pushMsg"></p>', "desligados neste aparelho", true);
    $("#pushLigar").onclick = async function () {
      var bt = this; bt.disabled = true; $("#pushMsg").textContent = "Pedindo permissão...";
      try {
        var perm = await Notification.requestPermission(); if (perm !== "granted") { avisosCel(); return; }
        var ch = (await (await fetch(ROBO + "/central/push/chave")).json()).chave;
        if (!ch) throw new Error("o robô ainda não tem a chave de avisos");
        var s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64Bytes(ch) });
        await inscreverNoRobo(s); await chamarRobo("/central/push/teste"); avisosCel();
      } catch (e) { $("#pushMsg").textContent = "Não deu certo: " + e.message; bt.disabled = false; }
    };
  }
  async function chamarRobo(caminho, corpo) {
    var tk = await auth.currentUser.getIdToken();
    var r = await fetch(ROBO + caminho, { method: "POST", headers: { Authorization: "Bearer " + tk, "Content-Type": "application/json" }, body: JSON.stringify(corpo || {}) });
    var j = await r.json().catch(function () { return {}; }); if (!r.ok) throw new Error(j.erro || ("erro " + r.status)); return j;
  }
  function inscreverNoRobo(sub) { return chamarRobo("/central/push", { inscricao: sub.toJSON(), aparelho: (ehIOS() ? "iPhone" : /Android/.test(navigator.userAgent) ? "Android" : "Computador") }); }

  function telaUso() {
    var u = USO, topo = '<section class="painel"><h2>' + Icone("nuvem") + 'Uso do banco de dados (plano grátis) <span class="pisca" aria-hidden="true"></span></h2>';
    if (!u) { C.innerHTML = topo + '<p class="sub">Buscando os números...</p></section>'; return; }
    if (u.erro) { C.innerHTML = topo + '<p class="nota nota--alerta">' + (u.erro === "sem-conexao" ? "O robô não respondeu agora. Tento de novo em 1 minuto." : "Sem permissão (" + esc(u.erro) + "). Entre de novo na Central.") + "</p></section>"; return; }
    var L = u.limites, h = u.hoje || {}, semPerm = u.erroMonitoring === "sem-permissao";
    var html = topo +
      (u.erroMonitoring ? '<p class="nota nota--alerta">' + (u.erroMonitoring === "sem-faturamento" ? "O Google só entrega leituras, gravações e exclusões ao vivo para projetos com cartão cadastrado (plano Blaze). Como o projeto está no plano grátis sem cartão, veja esses números no <a href=\"https://console.firebase.google.com/project/booster-agenda/firestore/databases/-default-/usage\" target=\"_blank\" rel=\"noopener\">painel de uso do Firebase</a>. O espaço guardado abaixo é contado pelo robô todo dia." : semPerm ? "Para ver leituras, gravações e exclusões ao vivo, falta dar ao robô a permissão <b>Visualizador de monitoramento</b> no Google Cloud." : "O Google não respondeu os números agora (" + esc(u.erroMonitoring) + ").") + "</p>" : "") +
      (!u.erroMonitoring ? barra("Leituras de hoje", h.leituras || 0, L.leituras) + barra("Gravações de hoje", h.gravacoes || 0, L.gravacoes) + barra("Exclusões de hoje", h.exclusoes || 0, L.exclusoes) : "") +
      (u.espacoEstimadoBytes != null ? barra("Espaço guardado (estimativa)", u.espacoEstimadoBytes, L.espacoBytes, (u.espacoEstimadoBytes / 1048576).toFixed(1).replace(".", ",") + " MB de 1 GB") : "") +
      '<p class="sub">A cota diária zera em <b>' + dataHora(u.zeraEm) + "</b> (meia-noite no horário do Pacífico). Atualizado " + ha(u.recebidoEm) + ", sozinho a cada minuto. Os números do Google chegam com alguns minutos de atraso.</p></section>";
    if (!u.erroMonitoring && (u.dias || []).length) {
      var pv = previsao(u.dias, "leituras", L.leituras);
      html += '<section class="painel"><h2>' + Icone("grafico") + "Leituras por dia (últimos 7 dias)</h2>" +
        grafico(u.dias.map(function (d) { return { r: d.dia.slice(8, 10) + "/" + d.dia.slice(5, 7), v: d.leituras }; }), { barras: true, titulo: "leituras por dia" }) +
        '<p class="sub">' + (pv ? (pv.ja ? "<b>Atenção:</b> a média recente já passa de 70% do limite." : pv.dias ? "<b>Previsão:</b> no ritmo atual, a média chega a 70% do limite em <b>" + pv.dias + " dias</b>." : "<b>Previsão:</b> uso estável, sem risco de chegar ao limite no ritmo atual.") + " Média recente: " + num(Math.round(pv.med)) + " leituras por dia." : "") + "</p>" +
        '<div class="rolar"><table class="tab"><tr><th>Dia</th><th>Leituras</th><th>Gravações</th><th>Exclusões</th></tr>' + u.dias.slice().reverse().map(function (d) { return "<tr><td>" + d.dia.split("-").reverse().join("/") + "</td><td>" + num(d.leituras) + "</td><td>" + num(d.gravacoes) + "</td><td>" + num(d.exclusoes) + "</td></tr>"; }).join("") + "</table></div></section>";
    }
    html += '<section class="painel"><h2>' + Icone("pasta") + "O que está guardado</h2>" +
      (u.contagem ? '<div class="kpis">' + Object.keys(u.contagem).map(function (k) { return kpi(num(u.contagem[k]), k); }).join("") + "</div>" : '<p class="sub">O robô conta os documentos todo dia às 6h.</p>') +
      '<p class="sub">Limites do plano grátis por dia: ' + num(L.leituras) + " leituras, " + num(L.gravacoes) + " gravações, " + num(L.exclusoes) + ' exclusões; 1 GB guardado. <a href="https://console.firebase.google.com/project/booster-agenda/firestore/databases/-default-/usage" target="_blank" rel="noopener">Ver no Firebase</a>.</p></section>';
    C.innerHTML = html + '<p class="sub" style="margin-top:12px">' + Icone("info") + ' O que é leitura, gravação, exclusão e espaço, e quantos salões cabem: veja a aba <a href="#ajuda">Ajuda</a>.</p>';
  }

  var filtro = { status: "", plano: "", busca: "" };
  function telaSaloes() {
    var linhas = DADOS.saloes.map(function (s) { return { s: s, st: statusDe(s), dono: donoDe(s.id) }; })
      .filter(function (x) {
        var a = x.s.assinatura || {}, t = filtro.busca.toLowerCase();
        if (filtro.status && x.st.k !== filtro.status) return false;
        if (filtro.plano && a.plano !== filtro.plano) return false;
        if (t && ((x.s.nome || "") + " " + (x.dono.email || "") + " " + (x.s.slug || "") + " " + (x.s.whatsapp || "")).toLowerCase().indexOf(t) < 0) return false;
        return true;
      }).sort(function (a, b) { return ms(b.s.criadoEm) - ms(a.s.criadoEm); });
    var opt = function (v, t, atual) { return '<option value="' + v + '"' + (atual === v ? " selected" : "") + ">" + t + "</option>"; };
    C.innerHTML = '<section class="painel"><h2>' + Icone("usuarios") + "Salões (" + DADOS.saloes.length + ")</h2>" +
      '<div class="filtros"><label>Buscar<input id="fBusca" value="' + esc(filtro.busca) + '" placeholder="nome, e-mail, link ou WhatsApp"></label>' +
      '<label>Situação<select id="fStatus">' + opt("", "Todas", filtro.status) + opt("ativo", "Assinantes", filtro.status) + opt("teste", "Teste grátis", filtro.status) + opt("cancelando", "Cancelaram", filtro.status) + opt("encerrado", "Encerrados", filtro.status) + opt("bloqueado", "Bloqueados", filtro.status) + opt("excluindo", "Exclusão pedida", filtro.status) + "</select></label>" +
      '<label>Plano<select id="fPlano">' + opt("", "Todos", filtro.plano) + Object.keys(PLANOS).map(function (k) { return opt(k, PLANOS[k].nome, filtro.plano); }).join("") + "</select></label>" +
      '<button class="btn btn--sec btn--peq" id="fCsv">' + Icone("baixar") + "Baixar planilha</button></div>" +
      '<p class="sub">Toque num salão para abrir a ficha completa.</p>' +
      '<div class="rolar"><table class="tab tab--click"><tr><th>Salão</th><th>Dono</th><th>Situação</th><th>Plano</th><th>Acesso até</th><th>Criado</th></tr>' +
      (linhas.length ? linhas.map(function (x) { var a = x.s.assinatura || {}; return '<tr data-id="' + esc(x.s.id) + '" tabindex="0"><td><b>' + esc(x.s.nome || "(sem nome)") + '</b><br><span class="sub">/' + esc(x.s.slug || "sem link") + "</span></td><td data-l=\"Dono\">" + esc(x.dono.email || "-") + "</td><td>" + tag(x.st) + "</td><td data-l=\"Plano\">" + esc((PLANOS[a.plano] || {}).nome || "-") + "</td><td data-l=\"Acesso até\">" + data(a.status === "ativa" ? a.pagoAte : a.testeAte) + "</td><td data-l=\"Criado\">" + data(x.s.criadoEm) + "</td></tr>"; }).join("") : '<tr><td colspan="6" class="sub">Nenhum salão com esse filtro.</td></tr>') +
      "</table></div></section>";
    $("#fBusca").oninput = function (e) { filtro.busca = e.target.value; var pos = e.target.selectionStart; telaSaloes(); var b = $("#fBusca"); b.focus(); b.setSelectionRange(pos, pos); };
    $("#fStatus").onchange = function (e) { filtro.status = e.target.value; telaSaloes(); };
    $("#fPlano").onchange = function (e) { filtro.plano = e.target.value; telaSaloes(); };
    $$("tr[data-id]").forEach(function (tr) { tr.onclick = tr.onkeydown = function (e) { if (e.type === "keydown" && e.key !== "Enter") return; location.hash = "#salao/" + encodeURIComponent(tr.dataset.id); }; });
    $("#fCsv").onclick = function () {
      var cab = ["salao", "link", "dono_email", "whatsapp", "situacao", "plano", "acesso_ate", "criado"];
      var csv = [cab.join(";")].concat(linhas.map(function (x) { var a = x.s.assinatura || {}; return [x.s.nome, x.s.slug, x.dono.email, x.s.whatsapp, x.st.t, (PLANOS[a.plano] || {}).nome || "", data(a.status === "ativa" ? a.pagoAte : a.testeAte), data(x.s.criadoEm)].map(function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }).join(";"); })).join("\n");
      var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" })); a.download = "saloes-" + new Date().toISOString().slice(0, 10) + ".csv"; document.body.appendChild(a); a.click(); a.remove();
    };
  }

  function urlCliente(slug) { var base = location.href.replace(/[#?].*$/, "").replace(/central\.html$/, ""); return base + "marcar.html?s=" + encodeURIComponent(slug); }
  async function telaSalao(sid) {
    var s = DADOS.saloes.filter(function (x) { return x.id === sid; })[0];
    if (!s) { C.innerHTML = '<section class="painel"><p>Salão não encontrado. <a href="#saloes">Voltar</a></p></section>'; return; }
    C.innerHTML = '<p class="sub">Carregando a ficha de ' + esc(s.nome || "") + "...</p>";
    var mes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(0, 7), pega = function (p) { return p.catch(function () { return []; }); };
    var r = await Promise.all([
      pega(lista(col("saloes", sid, "profissionais"))), pega(lista(col("saloes", sid, "servicos"))), pega(lista(col("saloes", sid, "clientes"))),
      pega(lista(FB.query(col("saloes", sid, "agendamentos"), FB.where("data", ">=", mes + "-01"), FB.where("data", "<=", mes + "-31")))), pega(lista(col("saloes", sid, "resumos"))),
      pega(lista(FB.query(col("central", "dados", "auditoria"), FB.where("salaoId", "==", sid))))
    ]);
    if (rota().tela !== "salao" || rota().id !== sid) return;   // a pessoa já saiu da ficha
    var profs = r[0], servs = r[1], clientes = r[2], agsMes = r[3], resumos = r[4].sort(function (a, b) { return a.id < b.id ? -1 : 1; }), aud = r[5].sort(function (a, b) { return ms(b.quando) - ms(a.quando); });
    var a = s.assinatura || {}, st = statusDe(s), dono = donoDe(sid), p = PLANOS[a.plano] || PLANOS.essencial;
    var evs = DADOS.eventos.filter(function (e) { return dono.email && e.email === dono.email; }).sort(function (x, y) { return ms(y.quando) - ms(x.quando); });
    var sugs = DADOS.sugestoes.filter(function (x) { return x.salaoId === sid; });
    var concl = agsMes.filter(function (x) { return x.status === "concluido"; }), fatMes = concl.reduce(function (t, x) { return t + (Number(x.preco) || 0); }, 0);
    var hojeISO = new Date().toISOString().slice(0, 10), futuros = agsMes.filter(function (x) { return x.data >= hojeISO && x.status !== "cancelado"; }).length;
    var ultimo = Math.max(ms(s.atualizadoEm), agsMes.reduce(function (m, x) { return Math.max(m, ms(x.alteradoEm || x.criadoEm)); }, 0));
    var zap = (s.whatsapp || "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
    C.innerHTML =
      '<p><a href="#saloes">← Todos os salões</a></p>' +
      '<section class="painel"><div class="ficha-topo"><div><h2 style="margin:0">' + esc(s.nome || "(sem nome)") + " " + tag(st) + '</h2><p class="sub">Criado em ' + data(s.criadoEm) + " · link /" + esc(s.slug || "sem link") + " · última atividade " + ha(ultimo) + "</p></div>" +
      '<div class="atalhos">' + (zap ? '<a class="btn btn--sec btn--peq" href="https://wa.me/55' + esc(zap) + '" target="_blank" rel="noopener">' + Icone("whatsapp") + "WhatsApp</a>" : "") +
      (dono.email ? '<a class="btn btn--sec btn--peq" href="mailto:' + esc(dono.email) + '">' + Icone("enviar") + "E-mail</a>" : "") +
      (s.slug ? '<a class="btn btn--sec btn--peq" href="' + esc(urlCliente(s.slug)) + '" target="_blank" rel="noopener">' + Icone("olho") + "Página do cliente</a>" : "") + "</div></div>" +
      '<div class="kpis">' + kpi(s.donoNome || "-", "dono: " + (dono.email || "e-mail não encontrado")) + kpi(profs.filter(function (x) { return x.ativo && !x.removido; }).length + " / " + (a.limiteProf || p.limite), "profissionais ativos / vagas") +
      kpi(servs.length, "serviços") + kpi(clientes.length, "clientes cadastrados") + kpi(agsMes.length, "agendamentos neste mês (" + futuros + " ainda vão acontecer)") + kpi(brl(fatMes), "faturamento concluído no mês") + "</div></section>" +

      '<div class="cen-duas"><section class="painel"><h2>' + Icone("estrela") + "Assinatura</h2>" +
      '<table class="tab"><tr><th>Situação</th><td>' + tag(st) + (a.bloqueado ? '<br><span class="sub">Motivo: ' + esc(a.motivoBloqueio || "-") + "</span>" : "") + "</td></tr>" +
      "<tr><th>Plano</th><td>" + esc(p.nome) + " · " + brl(p.preco) + " por mês · até " + (a.limiteProf || p.limite) + " profissionais</td></tr>" +
      "<tr><th>Teste grátis até</th><td>" + data(a.testeAte) + "</td></tr><tr><th>Pago até</th><td>" + data(a.pagoAte) + "</td></tr>" +
      "<tr><th>Próxima cobrança</th><td>" + data(a.proximaCobranca) + "</td></tr>" +
      (a.avisoApagar ? "<tr><th>Dados apagados em</th><td><b>" + data(a.avisoApagar) + "</b> (6 meses sem assinatura)</td></tr>" : "") +
      "<tr><th>Cortesias</th><td>" + ((a.cortesias || []).map(function (c) { return c.dias + " dias em " + data(c.em) + " por " + esc(c.por || ""); }).join("<br>") || "nenhuma") + "</td></tr></table>" +
      '<h3 class="cen-h3">Ações</h3><div class="atalhos">' +
      '<button class="btn btn--sec btn--peq" id="aCortesia">Dar ou tirar dias</button>' +
      '<button class="btn btn--sec btn--peq" id="aPlano">Mudar plano / vagas</button>' +
      (a.bloqueado ? '<button class="btn btn--pri btn--peq" id="aDesbloq">Desbloquear</button>' : '<button class="btn btn--perigo btn--peq" id="aBloq">Bloquear acesso</button>') +
      '<button class="btn btn--sec btn--peq" id="aAviso">Mandar aviso só para este salão</button></div>' +
      '<p class="sub">Tudo o que você faz aqui fica registrado no histórico do salão.</p></section>' +

      '<section class="painel"><h2>' + Icone("dinheiro") + "Pagamentos e eventos</h2>" +
      (evs.length ? '<ul class="feed">' + evs.slice(0, 12).map(function (e) { return "<li><span>" + esc(e.acao || e.evento || "") + " · " + esc((PLANOS[e.plano] || {}).nome || e.plano || "") + '</span><span class="sub">' + dataHora(e.quando) + "</span></li>"; }).join("") + "</ul>" : '<p class="sub">Nenhum pagamento nos últimos 90 dias.</p>') + "</section></div>" +

      '<div class="cen-duas"><section class="painel"><h2>' + Icone("usuarios") + "Equipe</h2>" +
      (profs.length ? '<table class="tab">' + profs.map(function (x) { return "<tr><td><b>" + esc(x.nome || "") + "</b>" + (x.ehDono ? " (dono)" : "") + "</td><td>" + (x.removido ? "removido" : x.ativo ? (x.uid ? "ativo" : "convite pendente") : "desativado") + "</td></tr>"; }).join("") + "</table>" : '<p class="sub">Nenhum profissional.</p>') +
      '<h3 class="cen-h3">Serviços</h3>' + (servs.length ? '<p class="sub">' + servs.map(function (x) { return esc(x.nome) + " (" + brl(x.preco) + ", " + (x.duracao || "?") + " min)"; }).join(" · ") + "</p>" : '<p class="sub">Nenhum serviço.</p>') + "</section>" +
      '<section class="painel"><h2>' + Icone("estrela") + "Dados do salão</h2>" + (s.endereco ? "<p>" + esc(s.endereco) + "</p>" : "") + '<p class="sub">Cidade, tipo de negócio e outros dados entram na próxima etapa.</p></section></div>' +
      '<section class="painel" id="fatSalao"></section>' +

      '<div class="cen-duas"><section class="painel"><h2>' + Icone("estrela") + "Sugestões deste salão</h2>" +
      (sugs.length ? sugs.map(function (x) { return '<div class="sug"><span class="tag">' + (x.tipo === "problema" ? "Problema" : "Sugestão") + '</span> <span class="sub" style="display:inline">' + dataHora(x.quando) + " · " + esc(x.status || "nova") + "</span><p>" + esc(x.texto) + "</p></div>"; }).join("") : '<p class="sub">Nenhuma.</p>') + "</section>" +
      '<section class="painel"><h2>' + Icone("lista") + "Histórico de ações da Central</h2>" +
      (aud.length ? '<ul class="feed">' + aud.map(function (x) { return "<li><span>" + esc(x.acao) + (x.detalhe ? ": " + esc(x.detalhe) : "") + '</span><span class="sub">' + dataHora(x.quando) + " · " + esc(x.por) + "</span></li>"; }).join("") + "</ul>" : '<p class="sub">Nenhuma ação ainda.</p>') + "</section></div>";
    ligarFicha(s);
    montarFaturamento(sid, profs, resumos);
  }

  async function salvarAssinatura(s, mud, acao, detalhe) {
    var a = Object.assign({}, s.assinatura || {}, mud);
    try { await FB.updateDoc(FB.doc(db, "saloes", s.id), { assinatura: a }); s.assinatura = a; await registrar(acao, s.id, detalhe); aviso("Salvo e registrado."); telaSalao(s.id); }
    catch (e) { alert("Não deu para salvar: " + e.message); }
  }
  function ligarFicha(s) {
    var a = s.assinatura || {};
    $("#aCortesia").onclick = function () {
      var dias = Number(prompt("Dias de cortesia para \"" + (s.nome || s.id) + "\"\n\n• Número positivo (ex.: 7) = DAR dias\n• Número negativo (ex.: -5) = TIRAR dias\n\nVale para o período atual (teste grátis ou plano pago). Entre -90 e 90.", "7"));
      if (!dias || dias < -90 || dias > 90) return;
      var campo = a.status === "ativa" ? "pagoAte" : "testeAte", mud = {};
      if (dias > 0 && a.status !== "ativa" && a.status !== "teste") { mud.status = "teste"; campo = "testeAte"; }
      var base = dias > 0 ? Math.max(Date.now(), ms(a[campo])) : ms(a[campo]);
      if (dias < 0 && !base) { alert("Este salão não tem dias para tirar."); return; }
      if (dias < 0 && !confirm("Tirar " + (-dias) + " dia(s) de \"" + (s.nome || s.id) + "\"?\nNovo fim: " + new Date(base + dias * D).toLocaleDateString("pt-BR") + (base + dias * D < Date.now() ? "\n\nATENÇÃO: com isso o acesso termina na hora." : ""))) return;
      mud[campo] = FB.Timestamp.fromMillis(base + dias * D);
      mud.cortesias = (a.cortesias || []).concat([{ dias: dias, em: FB.Timestamp.fromMillis(Date.now()), por: auth.currentUser.email }]);
      mud.avisoApagar = null;
      salvarAssinatura(s, mud, dias > 0 ? "cortesia" : "dias retirados", dias + " dias");
    };
    $("#aPlano").onclick = function () {
      var k = prompt("Mudar para qual situação? Escreva uma opção:\n\n• essencial, equipe ou salao  → plano pago (manual)\n• teste  → voltar para o teste grátis\n• nenhum  → sem plano (o salão só consegue ver os dados)\n\nAgora: " + statusDe(s).t + " · " + ((PLANOS[a.plano] || {}).nome || "-"), a.plano || "essencial"); if (!k) return;
      k = k.trim().toLowerCase().replace("ã", "a");
      if (k === "teste") {
        var dt = Number(prompt("Teste grátis por quantos dias a partir de hoje? (1 a 90)", "30")); if (!dt || dt < 1 || dt > 90) return;
        salvarAssinatura(s, { status: "teste", plano: "teste", limiteProf: 10, testeAte: FB.Timestamp.fromMillis(Date.now() + dt * D), cancelada: false, avisoApagar: null }, "voltou para teste", dt + " dias, tudo liberado"); return;
      }
      if (k === "nenhum" || k === "sem plano") {
        if (!confirm("Deixar \"" + (s.nome || s.id) + "\" SEM PLANO?\nO salão continua vendo os dados, mas não consegue marcar nem alterar até assinar.")) return;
        var agoraTs = FB.Timestamp.fromMillis(Date.now());
        salvarAssinatura(s, { status: "cancelada", cancelada: true, pagoAte: agoraTs, testeAte: agoraTs }, "sem plano", "acesso encerrado pela Central"); return;
      }
      if (!PLANOS[k]) { alert("Opção inválida."); return; }
      var v = Number(prompt("Quantas vagas de profissional? (padrão do plano: " + PLANOS[k].limite + ")", String(PLANOS[k].limite)));
      if (!v || v < 1 || v > 50) return;
      // Liga o plano de verdade (status "ativa"), sem perder os dias grátis que sobram: o plano conta a partir do fim do teste
      var dp = Number(prompt("Liberar o plano " + PLANOS[k].nome + " por quantos dias? (1 a 400)\n" + (a.status === "teste" && ms(a.testeAte) > Date.now() ? "Os dias grátis que sobram (até " + data(a.testeAte) + ") continuam valendo: o plano começa a contar depois deles." : "Conta a partir de hoje ou do fim atual do plano, o que for maior."), "30"));
      if (!dp || dp < 1 || dp > 400) return;
      var inicio = Math.max(Date.now(), ms(a.testeAte) || 0, a.status === "ativa" ? ms(a.pagoAte) || 0 : 0);
      salvarAssinatura(s, { status: "ativa", plano: k, limiteProf: v, pagoAte: FB.Timestamp.fromMillis(inicio + dp * D), cancelada: false, atrasada: false, avisoApagar: null }, "plano manual", PLANOS[k].nome + ", " + v + " vagas, " + dp + " dias");
    };
    var bq = $("#aBloq"); if (bq) bq.onclick = function () {
      var m = prompt("Bloquear o acesso de \"" + (s.nome || s.id) + "\"?\nO salão continua vendo os dados, mas não consegue marcar nem alterar.\n\nEscreva o motivo (fica registrado):", ""); if (m == null) return;
      salvarAssinatura(s, { bloqueado: true, motivoBloqueio: m.slice(0, 200) }, "bloqueio", m.slice(0, 200));
    };
    var dq = $("#aDesbloq"); if (dq) dq.onclick = function () { if (confirm("Desbloquear \"" + (s.nome || s.id) + "\"?")) salvarAssinatura(s, { bloqueado: false, motivoBloqueio: "" }, "desbloqueio", ""); };
    $("#aAviso").onclick = async function () {
      var t = prompt("Aviso só para \"" + (s.nome || s.id) + "\" (aparece no topo do app até tocarem em Entendi):", ""); if (!t || !t.trim()) return;
      await FB.setDoc(FB.doc(col("comunicados")), { texto: t.trim().slice(0, 300), ativo: true, salaoId: s.id, criadoEm: FB.serverTimestamp(), por: auth.currentUser.email });
      await registrar("aviso individual", s.id, t.trim().slice(0, 120)); aviso("Aviso enviado para este salão."); carregar().then(function () { telaSalao(s.id); });
    };
  }

  function nomeSalao(id) { var s = DADOS.saloes.filter(function (x) { return x.id === id; })[0]; return s ? (s.nome || id) : ""; }
  function telaComunicados() {
    C.innerHTML = '<section class="painel"><h2>' + Icone("whatsapp") + "Comunicados para os salões</h2>" +
      "<p>O aviso aparece no topo do app de todos os salões (dono e equipe) até cada pessoa tocar em <b>Entendi</b>. Use para nova versão, manutenção ou mudança nos Termos. Para avisar um salão só, use a ficha dele.</p>" +
      '<label>Texto do aviso<textarea id="comTexto" rows="2" maxlength="300" placeholder="Ex.: Nova versão no ar! Agora você pode..."></textarea></label>' +
      '<div class="atalhos"><button class="btn btn--pri" id="comEnviar">Publicar para todos</button></div>' +
      (DADOS.comunicados.length ? '<div class="rolar"><table class="tab"><tr><th>Quando</th><th>Para</th><th>Aviso</th><th></th></tr>' + DADOS.comunicados.slice().sort(function (a, b) { return ms(b.criadoEm) - ms(a.criadoEm); }).map(function (c) {
        return "<tr><td>" + data(c.criadoEm) + "</td><td>" + (c.salaoId ? esc(nomeSalao(c.salaoId)) : "todos") + "</td><td>" + esc(c.texto) + "</td><td>" + (c.ativo ? '<button class="btn btn--sec btn--peq" data-desliga="' + c.id + '">Desligar</button>' : '<span class="sub">desligado</span>') + "</td></tr>";
      }).join("") + "</table></div>" : "") + "</section>";
    $("#comEnviar").onclick = async function () {
      var t = $("#comTexto").value.trim(); if (!t) return;
      if (!confirm("Publicar este aviso para TODOS os salões?\n\n" + t)) return;
      await FB.setDoc(FB.doc(col("comunicados")), { texto: t, ativo: true, criadoEm: FB.serverTimestamp(), por: auth.currentUser.email });
      await registrar("comunicado geral", "", t.slice(0, 120)); aviso("Aviso publicado."); await carregar(); telaComunicados();
    };
    $$("[data-desliga]").forEach(function (b) { b.onclick = async function () { await FB.updateDoc(FB.doc(db, "comunicados", b.dataset.desliga), { ativo: false }); await registrar("comunicado desligado", "", b.dataset.desliga); aviso("Aviso desligado."); await carregar(); telaComunicados(); }; });
  }

  function telaSugestoes() {
    var novas = DADOS.sugestoes.filter(function (s) { return !s.status || s.status === "nova"; }).length;
    C.innerHTML = '<section class="painel"><h2>' + Icone("estrela") + "Sugestões e problemas (" + novas + " novas)</h2>" +
      (DADOS.sugestoes.length ? DADOS.sugestoes.slice().sort(function (a, b) { return ms(b.quando) - ms(a.quando); }).map(function (s) {
        return '<div class="sug"><span class="tag">' + (s.tipo === "problema" ? "Problema" : "Sugestão") + '</span> <span class="sub" style="display:inline">' + dataHora(s.quando) + ' · <a href="#salao/' + encodeURIComponent(s.salaoId) + '">' + esc(nomeSalao(s.salaoId) || "salão ?") + "</a> · " + esc(s.papel || "") + " · tela " + esc(s.tela || "-") + " · v" + esc(s.versao || "") + "</span>" +
          "<p>" + esc(s.texto) + "</p>" +
          '<select data-sug="' + s.id + '" aria-label="Situação da mensagem">' + ["nova", "lida", "vai entrar", "feito", "não vai entrar"].map(function (o) { return "<option" + ((s.status || "nova") === o ? " selected" : "") + ">" + o + "</option>"; }).join("") + "</select></div>";
      }).join("") : '<p class="sub">Nenhuma mensagem ainda.</p>') + "</section>";
    $$("[data-sug]").forEach(function (sel) { sel.onchange = async function () { await FB.updateDoc(FB.doc(db, "sugestoes", sel.dataset.sug), { status: sel.value }); var x = DADOS.sugestoes.filter(function (y) { return y.id === sel.dataset.sug; })[0]; if (x) x.status = sel.value; aviso("Situação salva."); }; });
  }

  function telaAtividade() {
    var aud = DADOS.auditoria.slice().sort(function (a, b) { return ms(b.quando) - ms(a.quando); });
    var ev = DADOS.eventos.slice().sort(function (a, b) { return ms(b.quando) - ms(a.quando); });
    C.innerHTML = '<div class="cen-duas"><section class="painel"><h2>' + Icone("dinheiro") + "Avisos da Kiwify (90 dias)</h2>" +
      (ev.length ? '<div class="rolar"><table class="tab"><tr><th>Quando</th><th>E-mail</th><th>Evento</th><th>Plano</th></tr>' + ev.map(function (e) { return "<tr><td>" + dataHora(e.quando) + "</td><td>" + esc(e.email || "") + "</td><td>" + esc(e.acao || e.evento || "") + "</td><td>" + esc((PLANOS[e.plano] || {}).nome || e.plano || "") + "</td></tr>"; }).join("") + "</table></div>" : '<p class="sub">Nenhum.</p>') + "</section>" +
      '<section class="painel"><h2>' + Icone("lista") + "Ações feitas na Central (90 dias)</h2>" +
      (aud.length ? '<div class="rolar"><table class="tab"><tr><th>Quando</th><th>Ação</th><th>Salão</th><th>Por</th></tr>' + aud.map(function (x) { return "<tr><td>" + dataHora(x.quando) + "</td><td>" + esc(x.acao) + (x.detalhe ? '<br><span class="sub">' + esc(x.detalhe) + "</span>" : "") + "</td><td>" + (x.salaoId ? '<a href="#salao/' + encodeURIComponent(x.salaoId) + '">' + esc(nomeSalao(x.salaoId) || x.salaoId) + "</a>" : "todos") + "</td><td>" + esc(x.por || "") + "</td></tr>"; }).join("") + "</table></div>" : '<p class="sub">Nenhuma ação ainda.</p>') + "</section></div>";
  }

  /* =====================================================================
     NOTIFICAÇÕES: tudo num lugar só, separado por tipo. Na Visão geral só
     ficam as que ainda não foram lidas/resolvidas. O "lido" vale em todos
     os seus aparelhos (fica em central/dados/lidas/{seu uid}).
     ===================================================================== */
  var LIDAS = {}, lidasDesliga = null;
  function ouvirLidas() {
    if (lidasDesliga) return;
    try {
      lidasDesliga = FB.onSnapshot(FB.doc(db, "central", "dados", "lidas", auth.currentUser.uid), function (d) {
        LIDAS = (d.exists() && d.data().m) || {}; atualizarBadge();
        var t = rota().tela; if (t === "geral" || t === "notificacoes") desenhar();
      }, function () {});
    } catch (e) {}
  }
  function marcarNotif(ids, estado) {
    var m = {}; ids.forEach(function (id) { m[id] = estado; LIDAS[id] = estado; });
    atualizarBadge();
    return FB.setDoc(FB.doc(db, "central", "dados", "lidas", auth.currentUser.uid), { m: m }, { merge: true }).catch(function (e) { aviso("Não salvou: " + e.message); });
  }
  function hashTxt(t) { var h = 0; t = String(t).replace(/<[^>]+>/g, ""); for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  var CATS = [["pendentes", "Pendentes", "sino"], ["kiwify", "Kiwify", "dinheiro"], ["saloes", "Salões", "usuarios"], ["alertas", "Alertas", "alerta"], ["sugestoes", "Sugestões", "estrela"], ["acoes", "Ações da Central", "lista"]];
  function notifs() {
    var L = [], salaoPorEmail = {};
    DADOS.usuarios.forEach(function (u) { if (u.papel === "dono" && u.email) salaoPorEmail[u.email] = u.salaoId; });
    DADOS.eventos.forEach(function (e) {
      var ac = e.acao || { order_approved: "pago", order_refunded: "estornado", order_chargedback: "estornado", subscription_canceled: "cancelado", subscription_late: "atrasado" }[e.evento] || "";
      if (!ac && /^ignorado/.test(e.evento || "")) return;
      var t = ac === "pago" ? "💰 Pagamento recebido: " + e.email + " · " + ((PLANOS[e.plano] || {}).nome || e.plano || "") + (PLANOS[e.plano] ? " · " + brl(PLANOS[e.plano].preco) : "")
        : ac === "estornado" ? "⚠️ Estorno / reembolso: " + e.email : ac === "cancelado" ? "↩️ Assinatura cancelada: " + e.email : ac === "atrasado" ? "⏰ Pagamento atrasado: " + e.email : "• " + (e.evento || "evento") + (e.email ? ": " + e.email : "");
      L.push({ id: "ev:" + e.id, cat: "kiwify", txt: t, quando: e.quando, salao: salaoPorEmail[e.email] || "", grave: ac === "estornado" || ac === "atrasado" });
    });
    DADOS.saloes.forEach(function (s) { if (ms(s.criadoEm) > Date.now() - 400 * D) L.push({ id: "sl:" + s.id, cat: "saloes", txt: "🎉 Novo salão no teste grátis: " + (s.nome || "sem nome") + (s.slug ? " · /" + s.slug : ""), quando: s.criadoEm, salao: s.id }); });
    DADOS.trocas.forEach(function (t) { L.push({ id: "tr:" + t.id, cat: "saloes", txt: "🔁 Troca de plano: " + t.email + " (" + ((PLANOS[t.de] || {}).nome || t.de) + " → " + ((PLANOS[t.para] || {}).nome || t.para) + ")", quando: t.quando, salao: salaoPorEmail[t.email] || "" }); });
    alertas().forEach(function (h) { L.push({ id: "al:" + hashTxt(h), cat: "alertas", html: h, quando: Date.now(), grave: true }); });
    DADOS.sugestoes.forEach(function (s) { L.push({ id: "sg:" + s.id, cat: "sugestoes", txt: (s.tipo === "problema" ? "🛠️ Problema: " : "💡 Sugestão: ") + String(s.texto || ""), quando: s.quando, salao: s.salaoId, sug: s }); });
    DADOS.auditoria.forEach(function (x) { L.push({ id: "ac:" + x.id, cat: "acoes", txt: "🧾 " + x.acao + (x.detalhe ? ": " + x.detalhe : "") + " · " + (x.salaoId ? nomeSalao(x.salaoId) || x.salaoId : "todos os salões"), quando: x.quando, salao: x.salaoId, minha: true }); });
    L.forEach(function (n) {
      n.estado = LIDAS[n.id] || (n.sug && n.sug.status && n.sug.status !== "nova" ? "lida" : "") || (n.minha ? "lida" : "");
    });
    return L.sort(function (a, b) { return ms(b.quando) - ms(a.quando); });
  }
  function pendentes(L) { return (L || notifs()).filter(function (n) { return !n.estado; }); }
  function atualizarBadge() {
    var a = $('#cenNav a[data-aba="notificacoes"]'); if (!a) return;
    var n = pendentes().length, b = a.querySelector(".badge");
    if (!b) { b = document.createElement("span"); b.className = "badge"; a.appendChild(b); }
    b.textContent = n > 99 ? "99+" : String(n); b.hidden = !n;
  }
  function itemNotif(n, compacto) {
    var cor = n.estado === "resolvida" ? "ok" : n.estado === "lida" ? "" : n.grave ? "erro" : "info";
    var est = n.estado === "resolvida" ? "resolvida" : n.estado === "lida" ? "lida" : "nova";
    return '<li class="notif notif--' + (n.estado ? "vista" : "nova") + '" data-n="' + esc(n.id) + '">' +
      '<div class="notif__txt">' + (n.html || esc(n.txt)) +
      '<span class="sub">' + (n.cat === "alertas" ? "situação atual" : dataHora(n.quando) + " · " + ha(n.quando)) +
      (n.salao ? ' · <a href="#salao/' + encodeURIComponent(n.salao) + '">abrir salão</a>' : "") + (compacto ? "" : ' · <span class="tag tag--' + (cor || "info") + '">' + est + "</span>") + "</span>" +
      (n.sug && !compacto ? '<label class="sub">Situação da mensagem <select data-sug="' + esc(n.sug.id) + '">' + ["nova", "lida", "vai entrar", "feito", "não vai entrar"].map(function (o) { return "<option" + ((n.sug.status || "nova") === o ? " selected" : "") + ">" + o + "</option>"; }).join("") + "</select></label>" : "") +
      "</div>" +
      '<div class="notif__acoes">' + (n.estado ? '<button class="btn btn--sec btn--peq" data-marca="">Voltar para pendente</button>'
        : '<button class="btn btn--sec btn--peq" data-marca="lida">' + Icone("check") + "Lida</button>" + (n.cat !== "acoes" ? '<button class="btn btn--sec btn--peq" data-marca="resolvida">Resolvida</button>' : "")) + "</div></li>";
  }
  function ligarNotifs(raiz, depois) {
    $$("[data-marca]", raiz).forEach(function (b) {
      b.onclick = function () { var li = b.closest("[data-n]"); marcarNotif([li.dataset.n], b.dataset.marca || null).then(depois); if (b.dataset.marca) li.classList.add("notif--saindo"); };
    });
    $$("[data-sug]", raiz).forEach(function (sel) { sel.onchange = async function () { await FB.updateDoc(FB.doc(db, "sugestoes", sel.dataset.sug), { status: sel.value }); var x = DADOS.sugestoes.filter(function (y) { return y.id === sel.dataset.sug; })[0]; if (x) x.status = sel.value; aviso("Situação salva."); }; });
  }
  function painelPendentes() {
    var p = pendentes(), mostra = p.slice(0, 8);
    return '<section class="painel" id="painelPend"><h2>' + Icone("sino") + "Precisa da sua atenção" + (p.length ? ' <span class="badge">' + p.length + "</span>" : "") + "</h2>" +
      (p.length ? '<ul class="notifs">' + mostra.map(function (n) { return itemNotif(n, true); }).join("") + "</ul>" +
        '<div class="atalhos"><a class="btn btn--sec btn--peq" href="#notificacoes">Ver todas as notificações</a>' + (p.length > 1 ? '<button class="btn btn--sec btn--peq" id="lerTudoGeral">Marcar todas como lidas</button>' : "") + "</div>"
        : '<div class="alerta-c alerta-c--ok">' + Icone("check") + '<div>Tudo em dia. Nada novo precisa da sua atenção. O histórico completo fica em <a href="#notificacoes">Notificações</a>.</div></div>') + "</section>";
  }
  function telaNotificacoes(sub) {
    sub = CATS.some(function (c) { return c[0] === sub; }) ? sub : "pendentes";
    var todas = notifs(), lista = sub === "pendentes" ? pendentes(todas) : todas.filter(function (n) { return n.cat === sub; });
    var conta = function (c) { return c === "pendentes" ? pendentes(todas).length : todas.filter(function (n) { return n.cat === c && !n.estado; }).length; };
    C.innerHTML = '<section class="painel"><h2>' + Icone("sino") + "Notificações</h2>" +
      '<div class="chips" role="tablist">' + CATS.map(function (c) { var n = conta(c[0]); return '<a role="tab" class="chip' + (c[0] === sub ? " chip--on" : "") + '" href="#notificacoes/' + c[0] + '">' + Icone(c[2]) + esc(c[1]) + (n ? ' <span class="badge">' + n + "</span>" : "") + "</a>"; }).join("") + "</div>" +
      '<p class="sub">' + ({ pendentes: "Só o que ainda não foi lido ou resolvido, de todos os tipos.", kiwify: "Pagamentos, cancelamentos, estornos e atrasos que a Kiwify avisou (últimos 13 meses).", saloes: "Salões novos e trocas de plano.", alertas: "Situações que pedem atenção agora (robô, limites, estornos). Somem sozinhas quando a situação acaba.", sugestoes: "Mensagens enviadas pelos salões no botão Ajuda. Mude a situação para o salão saber o andamento.", acoes: "Tudo o que foi feito aqui na Central: cortesias, planos, bloqueios, avisos." })[sub] + "</p>" +
      (lista.some(function (n) { return !n.estado; }) ? '<div class="atalhos"><button class="btn btn--sec btn--peq" id="lerTudo">' + Icone("check") + "Marcar todas desta aba como lidas</button></div>" : "") +
      (lista.length ? '<ul class="notifs">' + lista.slice(0, 200).map(function (n) { return itemNotif(n, false); }).join("") + "</ul>" : '<p class="sub">Nada aqui.</p>') + "</section>";
    ligarNotifs(C, function () { telaNotificacoes(sub); });
    var lt = $("#lerTudo"); if (lt) lt.onclick = function () { marcarNotif(lista.filter(function (n) { return !n.estado; }).map(function (n) { return n.id; }), "lida").then(function () { telaNotificacoes(sub); }); };
  }

  /* =====================================================================
     RECEITA E ASSINANTES DA SITEBOOSTER com filtro (dia, mês, ano)
     ===================================================================== */
  var PER = { modo: "mes", ref: hojeBR() };
  function hojeBR() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()); }
  function diaBR(v) { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(ms(v))); }
  var MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  function faixa(p) {  // devolve {de, ate (inclusive, AAAA-MM-DD), rotulo, partes:[{r, de, ate}], ant:{de,ate}}
    var r = p.ref, y = +r.slice(0, 4), m = +r.slice(5, 7);
    var iso = function (d) { return d.toISOString().slice(0, 10); }, U0 = function (yy, mm, dd) { return new Date(Date.UTC(yy, mm, dd)); };
    if (p.modo === "dia") { var d0 = U0(y, m - 1, +r.slice(8, 10)), ontem = iso(new Date(d0 - D)); return { de: r, ate: r, rotulo: r.split("-").reverse().join("/"), partes: [{ r: r.slice(8, 10) + "/" + r.slice(5, 7), de: r, ate: r }], ant: { de: ontem, ate: ontem }, nomeAnt: "dia anterior" }; }
    if (p.modo === "ano") { var pt = []; for (var i = 0; i < 12; i++) pt.push({ r: MESES[i], de: iso(U0(y, i, 1)), ate: iso(U0(y, i + 1, 0)) }); return { de: y + "-01-01", ate: y + "-12-31", rotulo: String(y), partes: pt, ant: { de: (y - 1) + "-01-01", ate: (y - 1) + "-12-31" }, nomeAnt: "ano anterior" }; }
    var ult = U0(y, m, 0).getUTCDate(), pd = []; for (var j = 1; j <= ult; j++) { var dd = iso(U0(y, m - 1, j)); pd.push({ r: (j < 10 ? "0" : "") + j + "/" + (m < 10 ? "0" : "") + m, de: dd, ate: dd }); }
    return { de: iso(U0(y, m - 1, 1)), ate: iso(U0(y, m, 0)), rotulo: MESES[m - 1] + " de " + y, partes: pd, ant: { de: iso(U0(y, m - 2, 1)), ate: iso(U0(y, m - 1, 0)) }, nomeAnt: "mês anterior" };
  }
  function moverPer(p, passo) {
    var y = +p.ref.slice(0, 4), m = +p.ref.slice(5, 7), d = +p.ref.slice(8, 10), dt;
    if (p.modo === "dia") dt = new Date(Date.UTC(y, m - 1, d + passo));
    else if (p.modo === "mes") dt = new Date(Date.UTC(y, m - 1 + passo, 1));
    else dt = new Date(Date.UTC(y + passo, 0, 1));
    p.ref = dt.toISOString().slice(0, 10);
  }
  function seletorPer(p, id) {
    var f = faixa(p), op = function (v, t) { return '<option value="' + v + '"' + (p.modo === v ? " selected" : "") + ">" + t + "</option>"; };
    var campo = p.modo === "dia" ? '<input type="date" data-per-ref value="' + p.ref + '" max="' + hojeBR() + '">'
      : p.modo === "mes" ? '<input type="month" data-per-ref value="' + p.ref.slice(0, 7) + '">'
      : '<input type="number" data-per-ref min="2025" max="2100" value="' + p.ref.slice(0, 4) + '" inputmode="numeric">';
    return '<div class="periodo" id="' + id + '"><select data-per-modo aria-label="Ver por">' + op("dia", "Por dia") + op("mes", "Por mês") + op("ano", "Por ano") + "</select>" +
      '<button class="btn btn--sec btn--peq" data-per-passo="-1" aria-label="Período anterior">‹</button>' + campo +
      '<button class="btn btn--sec btn--peq" data-per-passo="1" aria-label="Próximo período">›</button><b class="periodo__rot">' + esc(f.rotulo) + "</b></div>";
  }
  function ligarPer(id, p, redesenha) {
    var box = $("#" + id); if (!box) return;
    $("[data-per-modo]", box).onchange = function (e) { p.modo = e.target.value; redesenha(); };
    $$("[data-per-passo]", box).forEach(function (b) { b.onclick = function () { moverPer(p, +b.dataset.perPasso); redesenha(); }; });
    $("[data-per-ref]", box).onchange = function (e) {
      var v = e.target.value; if (!v) return;
      p.ref = p.modo === "dia" ? v : p.modo === "mes" ? v + "-01" : String(v).slice(0, 4) + "-01-01"; redesenha();
    };
  }
  function dentro(v, de, ate) { var d = diaBR(v); return d >= de && d <= ate; }
  function somaPagos(de, ate) {
    return DADOS.eventos.filter(function (e) { return e.acao === "pago" && dentro(e.quando, de, ate); })
      .reduce(function (t, e) { return t + ((PLANOS[e.plano] || {}).preco || 0); }, 0);
  }
  function contaEv(acao, de, ate) { return DADOS.eventos.filter(function (e) { return e.acao === acao && dentro(e.quando, de, ate); }).length; }
  function fotoAte(ate) { var f = null; DADOS.diario.forEach(function (d) { if (d.id <= ate) f = d; }); return f; }
  function varia(a, b, fmt) { if (!b) return a ? "novo" : "—"; var p = (a - b) / b * 100; return (p >= 0 ? "▲ " : "▼ ") + Math.abs(p).toFixed(0) + "%"; }
  function painelReceita() {
    var f = faixa(PER), rec = somaPagos(f.de, f.ate), recAnt = somaPagos(f.ant.de, f.ant.ate);
    var hoje = hojeBR(), fim = f.ate > hoje ? hoje : f.ate, foto = fotoAte(fim), fotoAnt = fotoAte(f.ant.ate), n = numeros();
    var ativosFim = fim === hoje ? n.ativos : (foto ? foto.ativos || 0 : 0), mrrFim = fim === hoje ? n.mrr : (foto ? foto.mrr || 0 : 0), testesFim = fim === hoje ? n.testes : (foto ? foto.testes || 0 : 0);
    var vendas = contaEv("pago", f.de, f.ate), canc = contaEv("cancelado", f.de, f.ate), est = contaEv("estornado", f.de, f.ate);
    var novosSal = DADOS.saloes.filter(function (s) { return dentro(s.criadoEm, f.de, f.ate); }).length;
    var pts = f.partes.map(function (x) { return { r: x.r, v: somaPagos(x.de, x.ate) }; });
    var ptsAss = f.partes.filter(function (x) { return x.de <= hoje; }).map(function (x) { var fo = fotoAte(x.ate > hoje ? hoje : x.ate); return { r: x.r, v: x.ate >= hoje ? n.ativos : (fo ? fo.ativos || 0 : 0) }; });
    return '<section class="painel" id="painelRec"><h2>' + Icone("dinheiro") + "Receita e assinantes da Sitebooster</h2>" + seletorPer(PER, "perRec") +
      '<div class="kpis">' + kpi(brl(rec), "recebido no período (pagamentos aprovados) · " + varia(rec, recAnt) + " vs " + f.nomeAnt) +
      kpi(brl(rec - vendas * 2.49 - rec * 0.0899), "líquido aprox. (depois da taxa Kiwify)") +
      kpi(brl(mrrFim), "receita mensal recorrente " + (fim === hoje ? "hoje" : "no fim do período")) +
      kpi(ativosFim, "assinantes " + (fim === hoje ? "hoje" : "no fim do período") + (fotoAnt ? " · " + varia(ativosFim, fotoAnt.ativos || 0) + " vs " + f.nomeAnt : "")) +
      kpi(testesFim, "em teste grátis") + kpi(novosSal, "salões novos no período") + kpi(vendas, "pagamentos no período") + kpi(canc + " / " + est, "cancelamentos / estornos") + "</div>" +
      (PER.modo !== "dia" ? '<div class="cen-duas"><div><h3 class="cen-h3">Recebido por ' + (PER.modo === "ano" ? "mês" : "dia") + "</h3>" + grafico(pts, { barras: true, fmt: brl, titulo: "recebido" }) + "</div>" +
        "<div><h3 class=\"cen-h3\">Assinantes</h3>" + (ptsAss.length > 1 ? grafico(ptsAss, { titulo: "assinantes" }) : '<p class="sub">Ainda sem histórico suficiente.</p>') + "</div></div>" : "") +
      '<p class="sub">Por plano hoje: ' + (Object.keys(n.porPlano).map(function (k) { return k + " " + n.porPlano[k]; }).join(" · ") || "nenhum") + " · Conversão (salões que já pagaram): " + n.conversao + "% · Encerrados: " + n.encerrados + " · Bloqueados: " + n.bloqueados + ". \"Recebido\" usa o preço de cada plano; o valor exato fica no painel da Kiwify.</p></section>";
  }

  /* =====================================================================
     FATURAMENTO DE CADA SALÃO com filtro (dia, mês, ano), em tempo real
     ===================================================================== */
  var PERS = { modo: "mes", ref: hojeBR(), prof: "", serv: "" }, fatDesliga = null;
  function pararFat() { if (fatDesliga) { try { fatDesliga(); } catch (e) {} fatDesliga = null; } }
  function montarFaturamento(sid, profs, resumos) {
    pararFat();
    var box = $("#fatSalao"); if (!box) return;
    var f = faixa(PERS), hoje = hojeBR(), mesAtual = hoje.slice(0, 7);
    // Ano: meses fechados vêm do resumo mensal (guardado para sempre); o mês atual é calculado ao vivo
    var de = PERS.modo === "ano" ? (f.ate.slice(0, 4) === hoje.slice(0, 4) ? mesAtual + "-01" : f.ate) : f.de;
    var desenhaFat = function (ags) {
      if (!$("#fatSalao")) { pararFat(); return; }
      var filtra = function (a) { return (!PERS.prof || a.profId === PERS.prof) && (!PERS.serv || a.servicoNome === PERS.serv); };
      var lista = ags.filter(filtra), concl = lista.filter(function (a) { return a.status === "concluido"; });
      var soma = function (L) { return L.reduce(function (t, a) { return t + (Number(a.preco) || 0); }, 0); };
      var pts, total, nConcl, faltas, canc;
      if (PERS.modo === "ano") {
        pts = f.partes.map(function (p) {
          var mes = p.de.slice(0, 7);
          if (mes === mesAtual) return { r: p.r, v: soma(concl.filter(function (a) { return a.data.slice(0, 7) === mes; })) };
          var rs = resumos.filter(function (x) { return x.id === mes; })[0];
          if (!rs) return { r: p.r, v: 0 };
          if (PERS.prof) { var pp = (rs.porProf || []).filter(function (x) { return x.id === PERS.prof || x.profId === PERS.prof; })[0]; return { r: p.r, v: pp ? (pp.v || pp.fat || 0) : 0 }; }
          if (PERS.serv) { var ss = (rs.porServ || []).filter(function (x) { return x.nome === PERS.serv; })[0]; return { r: p.r, v: ss ? ss.v || 0 : 0 }; }
          return { r: p.r, v: rs.fat || 0 };
        });
        total = pts.reduce(function (t, x) { return t + x.v; }, 0);
        var rsAno = resumos.filter(function (x) { return x.id.slice(0, 4) === f.de.slice(0, 4) && x.id !== mesAtual; });
        nConcl = concl.length + rsAno.reduce(function (t, x) { return t + (x.concluidos || 0); }, 0);
        faltas = lista.filter(function (a) { return a.status === "faltou"; }).length + rsAno.reduce(function (t, x) { return t + (x.faltas || 0); }, 0);
        canc = lista.filter(function (a) { return a.status === "cancelado"; }).length + rsAno.reduce(function (t, x) { return t + (x.cancelados || 0); }, 0);
      } else {
        pts = f.partes.map(function (p) { return { r: p.r, v: soma(concl.filter(function (a) { return a.data >= p.de && a.data <= p.ate; })) }; });
        total = soma(concl); nConcl = concl.length;
        faltas = lista.filter(function (a) { return a.status === "faltou"; }).length; canc = lista.filter(function (a) { return a.status === "cancelado"; }).length;
      }
      var marcados = lista.filter(function (a) { return a.status !== "cancelado" && a.data >= hoje; }).length;
      var servs = {}; ags.forEach(function (a) { if (a.servicoNome) servs[a.servicoNome] = 1; });
      var opP = '<option value="">Todos os profissionais</option>' + profs.map(function (p) { return '<option value="' + esc(p.id) + '"' + (PERS.prof === p.id ? " selected" : "") + ">" + esc(p.nome || p.id) + "</option>"; }).join("");
      var opS = '<option value="">Todos os serviços</option>' + Object.keys(servs).sort().map(function (n) { return "<option" + (PERS.serv === n ? " selected" : "") + ">" + esc(n) + "</option>"; }).join("");
      box.innerHTML = "<h2>" + Icone("dinheiro") + 'Faturamento do salão <span class="pisca" aria-hidden="true" title="ao vivo"></span></h2>' + seletorPer(PERS, "perFat") +
        '<div class="filtros"><label>Profissional<select id="fatProf">' + opP + '</select></label><label>Serviço<select id="fatServ">' + opS + "</select></label></div>" +
        '<div class="kpis">' + kpi(brl(total), "faturamento (atendimentos concluídos)") + kpi(nConcl, "atendimentos concluídos") + kpi(nConcl ? brl(total / nConcl) : "-", "tíquete médio") +
        kpi(faltas, "faltas") + kpi(canc, "cancelados / desmarcados") + (PERS.modo !== "ano" && f.ate >= hoje ? kpi(marcados, "ainda marcados no período") : "") + "</div>" +
        (PERS.modo !== "dia" ? grafico(pts, { barras: true, fmt: brl, titulo: "faturamento" }) : "") +
        '<p class="sub">Atualiza sozinho quando o salão conclui, cancela ou marca um atendimento.' + (PERS.modo === "ano" ? " Meses fechados vêm do resumo mensal que o app guarda para sempre." : "") + "</p>";
      ligarPer("perFat", PERS, function () { montarFaturamento(sid, profs, resumos); });
      $("#fatProf").onchange = function (e) { PERS.prof = e.target.value; desenhaFat(ags); };
      $("#fatServ").onchange = function (e) { PERS.serv = e.target.value; desenhaFat(ags); };
    };
    box.innerHTML = "<h2>" + Icone("dinheiro") + 'Faturamento do salão</h2><p class="sub">Carregando...</p>';
    if (de > f.ate) { desenhaFat([]); return; }
    try {
      fatDesliga = FB.onSnapshot(FB.query(col("saloes", sid, "agendamentos"), FB.where("data", ">=", de), FB.where("data", "<=", f.ate)),
        function (q) { desenhaFat(q.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); })); },
        function (e) { box.innerHTML = "<h2>" + Icone("dinheiro") + 'Faturamento do salão</h2><p class="nota nota--alerta">Não consegui ler os agendamentos deste salão (' + esc(e.code || e.message) + ").</p>"; });
    } catch (e) { desenhaFat([]); }
  }

  /* =====================================================================
     USO DO BANCO: explicação + quantos salões cabem
     ===================================================================== */
  function explicaUso(u) {
    var cont = (u && u.contagem) || {}, docs = Object.keys(cont).reduce(function (t, k) { return t + Math.max(0, cont[k] || 0); }, 0);
    var ativos = DADOS.saloes.filter(function (s) { var k = statusDe(s).k; return k === "ativo" || k === "teste" || k === "cancelando"; }).length;
    var porSalaoMB = ativos && docs ? docs * 1536 / ativos / 1048576 : 20, cabemEspaco = Math.floor(1024 / Math.max(1, porSalaoMB));
    return '<section class="painel"><h2>' + Icone("info") + "Entenda o banco de dados (leia uma vez)</h2>" +
      "<p>O banco é onde ficam guardados os dados de todos os salões. O plano grátis do Google (Firebase) tem <b>limites por dia</b>. Se um limite acabar, o sistema <b>para de salvar e carregar até zerar</b>, à 0h no horário do Pacífico, <b>5h da manhã em Brasília</b>. <b>Nada é cobrado</b>: sem cartão, o Google só bloqueia.</p>" +
      '<div class="rolar"><table class="tab"><tr><th>Nome</th><th>O que é, na prática</th><th>Exemplos</th><th>Limite grátis</th></tr>' +
      "<tr><td><b>Leitura</b></td><td>Cada dado <b>mostrado</b> para alguém</td><td>Dono abre a agenda; cliente abre o link e vê os horários; você abre a Central</td><td>50.000 por dia</td></tr>" +
      "<tr><td><b>Gravação</b></td><td>Cada dado <b>salvo ou alterado</b></td><td>Marcar, concluir ou desmarcar horário; cadastrar cliente ou serviço</td><td>20.000 por dia</td></tr>" +
      "<tr><td><b>Exclusão</b></td><td>Cada dado <b>apagado</b></td><td>Limpeza automática de dados com mais de 12 meses</td><td>20.000 por dia</td></tr>" +
      "<tr><td><b>Espaço</b></td><td>Tudo que fica <b>guardado</b></td><td>Agendamentos, clientes, histórico, resumos</td><td>1 GB no total</td></tr></table></div>" +
      '<h3 class="cen-h3">Quantos salões cabem no plano grátis?</h3>' +
      '<div class="rolar"><table class="tab"><tr><th>Limite</th><th>Gasto estimado de 1 salão pequeno (≈15 atendimentos/dia)</th><th>Cabem</th></tr>' +
      "<tr><td>Leituras</td><td>1.000 a 2.500 por dia (agenda aberta no celular do dono e da equipe + clientes abrindo o link)</td><td><b>20 a 50 salões</b> ← o primeiro a apertar</td></tr>" +
      "<tr><td>Gravações</td><td>≈ 150 por dia</td><td>≈ 130 salões</td></tr>" +
      "<tr><td>Espaço</td><td>" + (ativos && docs ? "<b>" + porSalaoMB.toFixed(1).replace(".", ",") + " MB</b> por salão hoje (medido pelo robô)" : "≈ 20 MB por salão (os detalhes somem depois de 12 meses)") + "</td><td>≈ " + num(cabemEspaco) + " salões</td></tr></table></div>" +
      "<p><b>Resumo:</b> com segurança, o plano grátis aguenta <b>uns 20 a 30 salões ativos</b>. Isso é uma estimativa: os números reais aparecem quando houver salões usando.</p>" +
      '<h3 class="cen-h3">Calcular com os números reais</h3><p class="sub">Abra o <a href="https://console.firebase.google.com/project/booster-agenda/firestore/databases/-default-/usage" target="_blank" rel="noopener">painel de uso do Firebase</a>, veja as <b>leituras de ontem</b> e digite aqui:</p>' +
      '<div class="filtros"><label>Leituras de um dia<input id="calcLeit" type="number" inputmode="numeric" min="0" placeholder="ex.: 4200"></label><label>Salões ativos<input id="calcSal" type="number" inputmode="numeric" min="1" value="' + Math.max(1, ativos) + '"></label></div><p id="calcRes" class="nota"></p>' +
      '<h3 class="cen-h3">E quando passar do limite?</h3><p>Aí vale ligar o plano pago do Firebase (Blaze), que cobra só pelo uso: algo como <b>R$ 0,30 a R$ 1,00 por salão por mês</b>, contra os <b>R$ 37,90 ou mais</b> que cada salão paga. Ou seja, o custo sai da própria receita. A Central te avisa <b>com antecedência</b> (alerta aos 70%).</p></section>';
  }
  function ligarCalc() {
    var l = $("#calcLeit"), s = $("#calcSal"), r = $("#calcRes"); if (!l) return;
    var f = function () {
      var v = +l.value, n = Math.max(1, +s.value || 1); if (!v) { r.textContent = ""; return; }
      var por = v / n, cabe = Math.floor(50000 * 0.8 / por);
      r.innerHTML = "Cada salão gasta em média <b>" + num(Math.round(por)) + " leituras por dia</b>. Com folga de 20%, o plano grátis aguenta <b>≈ " + num(cabe) + " salões</b>. Hoje você usa <b>" + Math.round(v / 50000 * 100) + "%</b> do limite diário.";
    };
    l.oninput = s.oninput = f;
  }


  /* ===================== FINANCEIRO detalhado ===================== */
  function painelPlanos() {
    var por = {}, total = 0;
    DADOS.saloes.forEach(function (s) { var a = s.assinatura || {}, k = statusDe(s).k; if (k !== "ativo" && k !== "cancelando") return; var p = PLANOS[a.plano] ? a.plano : "essencial"; por[p] = por[p] || { n: 0, v: 0 }; por[p].n++; por[p].v += PLANOS[p].preco; total += PLANOS[p].preco; });
    var linhas = ["essencial", "equipe", "salao"].map(function (k) {
      var x = por[k] || { n: 0, v: 0 }, pct = total ? Math.round(x.v / total * 100) : 0;
      return '<div class="linha-fin"><div><b>' + esc(PLANOS[k].nome) + "</b><span class=\"sub\">" + brl(PLANOS[k].preco) + "/mês · até " + PLANOS[k].limite + " profissionais</span></div>" +
        "<div class=\"linha-fin__num\"><b>" + x.n + "</b><span class=\"sub\">assinante(s)</span></div><div class=\"linha-fin__num\"><b>" + brl(x.v) + "</b><span class=\"sub\">" + pct + "% da receita</span></div>" +
        '<div class="barra-uso" style="grid-column:1/-1"><i style="width:' + pct + '%"></i></div></div>';
    }).join("");
    return '<section class="painel"><h2>' + Icone("estrela") + "Receita por plano (hoje)</h2>" + linhas + '<p class="sub">Conta os salões com assinatura ativa, inclusive os que cancelaram e ainda estão usando até o fim do mês pago.</p></section>';
  }
  function painelMovimento() {
    var f = faixa(PER), primeiro = {};
    DADOS.eventos.filter(function (e) { return e.acao === "pago"; }).sort(function (a, b) { return ms(a.quando) - ms(b.quando); }).forEach(function (e) { if (!primeiro[e.email]) primeiro[e.email] = e.id; });
    var pagos = DADOS.eventos.filter(function (e) { return e.acao === "pago" && dentro(e.quando, f.de, f.ate); });
    var novos = pagos.filter(function (e) { return primeiro[e.email] === e.id; }), renov = pagos.length - novos.length;
    var canc = contaEv("cancelado", f.de, f.ate), est = contaEv("estornado", f.de, f.ate), atras = contaEv("atrasado", f.de, f.ate);
    var fotoIni = fotoAte(f.ant.ate), baseAtivos = fotoIni ? fotoIni.ativos || 0 : 0, churn = baseAtivos ? Math.round((canc + est) / baseAtivos * 100) : 0;
    var testesNovos = DADOS.saloes.filter(function (s) { return dentro(s.criadoEm, f.de, f.ate); }).length;
    var item = function (ic, t, v, sub) { return '<div class="mov"><span class="mov__ic">' + ic + "</span><div><b>" + v + "</b><span>" + t + "</span>" + (sub ? '<small class="sub">' + sub + "</small>" : "") + "</div></div>"; };
    return '<section class="painel"><h2>' + Icone("grafico") + "Movimento no período · " + esc(f.rotulo) + "</h2>" +
      '<div class="movs">' + item("🎉", "salões começaram o teste grátis", testesNovos) + item("🆕", "primeiros pagamentos (novos assinantes)", novos.length, brl(novos.reduce(function (t, e) { return t + ((PLANOS[e.plano] || {}).preco || 0); }, 0))) +
      item("🔁", "renovações (mensalidades seguintes)", renov) + item("↩️", "cancelamentos", canc) + item("⚠️", "estornos / reembolsos", est) + item("⏰", "pagamentos atrasados", atras) +
      item("📉", "taxa de saída (cancelamentos + estornos ÷ assinantes no início)", churn + "%", baseAtivos ? "base: " + baseAtivos + " assinante(s)" : "sem base anterior ainda") + "</div></section>";
  }
  function painelPagamentos() {
    var f = faixa(PER);
    var L = DADOS.eventos.filter(function (e) { return (e.acao === "pago" || e.acao === "estornado" || e.acao === "cancelado") && dentro(e.quando, f.de, f.ate); }).sort(function (a, b) { return ms(b.quando) - ms(a.quando); });
    return '<section class="painel"><h2>' + Icone("lista") + "Lançamentos do período (" + L.length + ")</h2>" +
      (L.length ? '<ul class="lanc">' + L.slice(0, 100).map(function (e) {
        var v = (PLANOS[e.plano] || {}).preco || 0, sinal = e.acao === "pago" ? "+" : e.acao === "estornado" ? "−" : "";
        return '<li class="lanc--' + e.acao + '"><div><b>' + esc(e.email || "-") + '</b><span class="sub">' + dataHora(e.quando) + " · " + esc((PLANOS[e.plano] || {}).nome || e.plano || "") + " · " + ({ pago: "pagamento", estornado: "estorno", cancelado: "cancelamento" })[e.acao] + "</span></div><b class=\"lanc__v\">" + (sinal ? sinal + " " + brl(v) : "—") + "</b></li>";
      }).join("") + "</ul>" : '<p class="sub">Nenhum lançamento neste período.</p>') +
      '<p class="sub">Valores pelo preço de cada plano. O valor exato (com taxas) fica no painel da Kiwify.</p></section>';
  }

  /* ===================== AJUDA da Central ===================== */
  function cartaoAjuda(t, txt) { return '<div class="ajuda-c"><b>' + t + "</b><p>" + txt + "</p></div>"; }
  function telaAjuda() {
    var u = USO || {}, cont = u.contagem || {}, docs = Object.keys(cont).reduce(function (t, k) { return t + Math.max(0, cont[k] || 0); }, 0);
    var ativos = DADOS.saloes.filter(function (s) { var k = statusDe(s).k; return k === "ativo" || k === "teste" || k === "cancelando"; }).length;
    var porSalaoMB = ativos && docs ? docs * 1536 / ativos / 1048576 : 20, cabemEspaco = Math.floor(1024 / Math.max(1, porSalaoMB));
    C.innerHTML = '<section class="painel"><h2>' + Icone("info") + "Ajuda da Central</h2><p class=\"sub\">Explicações de cada parte, para consultar quando precisar. As outras abas ficam só com os números.</p></section>" +
      '<section class="painel"><h2>' + Icone("dinheiro") + "Palavras do financeiro</h2><div class=\"ajuda-g\">" +
      cartaoAjuda("Receita mensal recorrente", "Quanto entra por mês se todos os assinantes de hoje continuarem pagando. É a soma do preço do plano de cada salão ativo.") +
      cartaoAjuda("Recebido no período", "Soma dos pagamentos aprovados pela Kiwify no dia, mês ou ano escolhido.") +
      cartaoAjuda("Líquido aprox.", "O recebido menos a taxa da Kiwify (cerca de 8,99% + R$ 2,49 por venda).") +
      cartaoAjuda("Novo assinante x renovação", "Novo = primeiro pagamento daquele e-mail. Renovação = mensalidades seguintes.") +
      cartaoAjuda("Taxa de saída", "De cada 100 assinantes do começo do período, quantos cancelaram ou pediram estorno. Quanto menor, melhor.") +
      cartaoAjuda("Conversão", "De todos os salões que já criaram conta, quantos já pagaram pelo menos uma vez.") + "</div></section>" +
      '<section class="painel"><h2>' + Icone("usuarios") + "Situação dos salões</h2><div class=\"ajuda-g\">" +
      cartaoAjuda("Teste grátis", "30 dias com tudo liberado (até 10 profissionais). Sem cartão.") +
      cartaoAjuda("Assinante", "Pagou e está em dia. Se assinou durante o teste, os dias grátis que sobravam continuam valendo.") +
      cartaoAjuda("Cancelando", "Cancelou na Kiwify, mas usa até o fim do mês já pago.") +
      cartaoAjuda("Encerrado", "Sem teste e sem plano. Só consegue ver os dados. Depois de 6 meses assim, os dados são apagados (com aviso 30 dias antes).") +
      cartaoAjuda("Bloqueado", "Você suspendeu pela Central. Só vê os dados até você desbloquear.") +
      cartaoAjuda("Dar ou tirar dias", "Na ficha do salão. Número positivo dá dias; negativo tira. Vale para o teste ou para o plano, o que estiver ativo.") + "</div></section>" +
      '<section class="painel"><h2>' + Icone("nuvem") + "Banco de dados (uso do plano grátis)</h2>" +
      "<p>O plano grátis do Google tem <b>limites por dia</b>. Se um limite acabar, o sistema <b>para até zerar</b> (5h da manhã em Brasília) e <b>nada é cobrado</b>.</p><div class=\"ajuda-g\">" +
      cartaoAjuda("Leitura · 50.000 por dia", "Cada dado mostrado para alguém: o dono abrindo a agenda, o cliente vendo os horários livres, você abrindo a Central.") +
      cartaoAjuda("Gravação · 20.000 por dia", "Cada dado salvo ou alterado: marcar, concluir ou desmarcar horário, cadastrar cliente ou serviço.") +
      cartaoAjuda("Exclusão · 20.000 por dia", "Cada dado apagado, principalmente a limpeza automática de dados com mais de 12 meses.") +
      cartaoAjuda("Espaço · 1 GB no total", "Tudo que fica guardado. Não zera por dia: vai crescendo devagar.") + "</div>" +
      '<h3 class="cen-h3">Quantos salões cabem?</h3><div class="ajuda-g">' +
      cartaoAjuda("Leituras (o primeiro a apertar)", "Um salão pequeno gasta 1.000 a 2.500 por dia. Cabem uns <b>20 a 50 salões</b>.") +
      cartaoAjuda("Gravações", "Cerca de 150 por salão por dia. Cabem uns <b>130 salões</b>.") +
      cartaoAjuda("Espaço", (ativos && docs ? "Hoje cada salão ocupa <b>" + porSalaoMB.toFixed(1).replace(".", ",") + " MB</b>." : "Cerca de 20 MB por salão.") + " Cabem uns <b>" + num(cabemEspaco) + " salões</b>.") + "</div>" +
      "<p><b>Resumo:</b> com folga, o plano grátis aguenta <b>uns 20 a 30 salões ativos</b>. Acima disso, o plano pago do Google custa centavos por salão por mês, e a Central avisa antes (alerta aos 70%).</p>" +
      '<h3 class="cen-h3">Calcular com os números reais</h3><p class="sub">Veja as <b>leituras de ontem</b> no <a href="https://console.firebase.google.com/project/booster-agenda/firestore/databases/-default-/usage" target="_blank" rel="noopener">painel do Firebase</a> e digite:</p>' +
      '<div class="filtros"><label>Leituras de um dia<input id="calcLeit" type="number" inputmode="numeric" min="0" placeholder="ex.: 4200"></label><label>Salões ativos<input id="calcSal" type="number" inputmode="numeric" min="1" value="' + Math.max(1, ativos) + '"></label></div><p id="calcRes" class="nota"></p></section>' +
      '<section class="painel"><h2>' + Icone("sino") + "Notificações e avisos</h2><div class=\"ajuda-g\">" +
      cartaoAjuda("Pendentes", "O que ainda não foi lido. Aparece na Visão geral e no número vermelho do menu.") +
      cartaoAjuda("Lida x Resolvida", "Lida = você viu. Resolvida = você já tratou. As duas saem dos pendentes e ficam guardadas na aba de cada tipo.") +
      cartaoAjuda("Avisos no celular", "Chegam mesmo com a Central fechada: pagamentos, cancelamentos, estornos, salão novo, resumo das 6h e falha do robô.") +
      cartaoAjuda("Comunicados", "Mensagem que aparece fixa no topo do app dos salões. Só some quando você desliga.") + "</div></section>";
    ligarCalc();
  }

})();
