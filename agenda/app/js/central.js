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
    var W = 640, H = 170, P = 30, max = Math.max.apply(null, pontos.map(function (p) { return p.v; }).concat([op.min || 1]));
    var x = function (i) { return op.barras ? P + (i + 0.5) * (W - 2 * P) / pontos.length : P + (pontos.length === 1 ? (W - 2 * P) / 2 : i * (W - 2 * P) / (pontos.length - 1)); }, y = function (v) { return H - P - (v / max) * (H - 2 * P); };
    var dica = function (p) { return "<title>" + esc(p.r + ": " + (op.fmt ? op.fmt(p.v) : num(p.v))) + "</title>"; };
    var corpo = op.barras
      ? pontos.map(function (p, i) { var w = Math.max(6, (W - 2 * P) / pontos.length * 0.6); return '<rect x="' + (x(i) - w / 2) + '" y="' + y(p.v) + '" width="' + w + '" height="' + (H - P - y(p.v)) + '" rx="3" fill="var(--ouro-2)">' + dica(p) + "</rect>"; }).join("")
      : '<polyline fill="none" stroke="var(--ouro-2)" stroke-width="3" points="' + pontos.map(function (p, i) { return x(i) + "," + y(p.v); }).join(" ") + '"/>' + pontos.map(function (p, i) { return '<circle cx="' + x(i) + '" cy="' + y(p.v) + '" r="4" fill="var(--ouro-2)">' + dica(p) + "</circle>"; }).join("");
    var rot = pontos.map(function (p, i) { return (pontos.length <= 8 || i % Math.ceil(pontos.length / 8) === 0) ? '<text x="' + x(i) + '" y="' + (H - 8) + '" font-size="11" text-anchor="middle" fill="var(--txt-2)">' + esc(p.r) + "</text>" : ""; }).join("");
    return '<svg class="grafico" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(op.titulo || "gráfico") + '"><line x1="' + P + '" y1="' + (H - P) + '" x2="' + (W - P) + '" y2="' + (H - P) + '" stroke="var(--linha-2)"/>' +
      '<text x="' + P + '" y="14" font-size="11" fill="var(--txt-2)">máx. ' + esc(op.fmt ? op.fmt(max) : num(max)) + "</text>" + corpo + rot + "</svg>";
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
    var desde = FB.Timestamp.fromMillis(Date.now() - 90 * D), pega = function (p) { return p.catch(function () { return []; }); };
    var r = await Promise.all([
      pega(lista(col("saloes"))), pega(lista(col("usuarios"))), pega(lista(col("sugestoes"))), pega(lista(col("comunicados"))), pega(lista(col("pagamentosPendentes"))),
      pega(lista(FB.query(col("central", "dados", "eventos"), FB.where("quando", ">=", desde)))), pega(lista(col("central", "dados", "trocas"))),
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
  var ABAS = [["geral", "Visão geral", "grafico"], ["saloes", "Salões", "usuarios"], ["uso", "Uso do banco", "nuvem"], ["comunicados", "Comunicados", "whatsapp"], ["sugestoes", "Sugestões", "estrela"], ["atividade", "Atividade", "lista"]];
  function rota() { var h = (location.hash || "#geral").slice(1).split("/"); return { tela: h[0] || "geral", id: h[1] ? decodeURIComponent(h[1]) : "" }; }
  async function iniciar() {
    var nav = $("#cenNav"); nav.hidden = false;
    nav.innerHTML = ABAS.map(function (a) { return '<a href="#' + a[0] + '" data-aba="' + a[0] + '">' + Icone(a[2]) + "<span>" + a[1] + "</span></a>"; }).join("");
    if (iniciado) { desenhar(); return; }
    iniciado = true;
    C.innerHTML = '<p class="sub">Carregando os números...</p>';
    await carregar(); desenhar(); buscarUso();
    setInterval(buscarUso, 60000);                        // uso do banco: atualiza sozinho a cada minuto
    setInterval(function () { if (rota().tela !== "salao") carregar().then(desenhar); }, 5 * 60000);
    aoVivo();
    window.onhashchange = desenhar;
  }

  // Feed ao vivo: escuta pagamentos, sugestões e salões novos sem precisar recarregar
  var FEED = [];
  function aoVivo() {
    desligar.forEach(function (f) { f(); }); desligar = [];
    var inicio = Date.now(), semana = FB.Timestamp.fromMillis(Date.now() - 7 * D);
    function mostrarFeed() { FEED.sort(function (a, b) { return ms(b.quando) - ms(a.quando); }); FEED = FEED.slice(0, 60); var f = $("#feed"); if (f) f.innerHTML = feedHTML(); }
    function novo(txt, quando, recarrega) { FEED.push({ txt: txt, quando: quando || Date.now() }); if (ms(quando) > inicio - 5000) { aviso(txt); if (recarrega) carregar().then(desenhar); } }
    try {
      desligar.push(FB.onSnapshot(FB.query(col("central", "dados", "eventos"), FB.where("quando", ">=", semana)), function (q) {
        q.docChanges().forEach(function (c) {
          if (c.type !== "added") return; var e = c.doc.data();
          var t = e.acao === "pago" ? "💰 Pagamento: " + e.email + " (" + ((PLANOS[e.plano] || {}).nome || e.plano || "") + ")" : e.acao === "estornado" ? "⚠️ Estorno: " + e.email : e.acao === "cancelado" ? "↩️ Cancelamento: " + e.email : e.acao === "atrasado" ? "⏰ Pagamento atrasado: " + e.email : "• " + (e.evento || "evento") + (e.email ? ": " + e.email : "");
          novo(t, e.quando, true);
        });
        mostrarFeed();
      }, function () {}));
      desligar.push(FB.onSnapshot(col("sugestoes"), function (q) {
        q.docChanges().forEach(function (c) { var x = c.doc.data(); if (c.type === "added" && ms(x.quando) > Date.now() - 7 * D) novo("💬 " + (x.tipo === "problema" ? "Problema relatado" : "Nova sugestão") + ": " + String(x.texto || "").slice(0, 60), x.quando, false); });
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
    var T = { geral: telaGeral, saloes: telaSaloes, salao: telaSalao, uso: telaUso, comunicados: telaComunicados, sugestoes: telaSugestoes, atividade: telaAtividade }[r.tela] || telaGeral;
    T(r.id);
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
    var n = numeros(), al = alertas(), dia = DADOS.diario.slice(-60);
    C.innerHTML =
      '<section class="painel"><h2>' + Icone("alerta") + "Alertas</h2>" +
      (al.length ? al.map(function (t) { return '<div class="alerta-c">' + Icone("alerta") + "<div>" + t + "</div></div>"; }).join("") : '<div class="alerta-c alerta-c--ok">' + Icone("check") + "<div>Tudo certo. Nada precisa da sua atenção agora.</div></div>") + "</section>" +
      '<div class="cen-duas"><section class="painel"><h2>' + Icone("nuvem") + "Saúde do sistema</h2>" + saudeHTML() + "</section>" +
      '<section class="painel"><h2>' + Icone("relogio") + 'Ao vivo <span class="pisca" aria-hidden="true"></span></h2><div id="feed">' + feedHTML() + "</div></section></div>" +
      '<section class="painel"><h2>' + Icone("grafico") + "Números do negócio</h2><div class=\"kpis\">" +
      kpi(brl(n.mrr), "receita por mês (assinaturas ativas)") + kpi(brl(n.liquido), "o que sobra depois da taxa da Kiwify (aprox.)") +
      kpi(n.ativos, "salões assinantes") + kpi(n.testes, "em teste grátis" + (n.testesFim ? " (" + n.testesFim + " acabando em 5 dias)" : "")) +
      kpi(n.conversao + "%", "dos salões criados já pagaram") + kpi(n.cancelando, "cancelaram (usando até o fim do mês)") +
      kpi(n.vendasMes, "pagamentos nos últimos 30 dias") + kpi(n.cancelMes + " / " + n.estornosMes, "cancelamentos / estornos (30 dias)") +
      "</div><p class=\"sub\">Por plano: " + (Object.keys(n.porPlano).map(function (k) { return k + " " + n.porPlano[k]; }).join(" · ") || "nenhum ainda") + " · Encerrados: " + n.encerrados + " · Bloqueados: " + n.bloqueados + "</p></section>" +
      '<div class="cen-duas"><section class="painel"><h2>' + Icone("dinheiro") + "Receita por mês (evolução)</h2>" +
      grafico(dia.map(function (d) { return { r: d.id.slice(8, 10) + "/" + d.id.slice(5, 7), v: d.mrr || 0 }; }), { fmt: brl, titulo: "receita por mês" }) + "</section>" +
      '<section class="painel"><h2>' + Icone("usuarios") + "Assinantes (evolução)</h2>" +
      grafico(dia.map(function (d) { return { r: d.id.slice(8, 10) + "/" + d.id.slice(5, 7), v: (d.ativos || 0) }; }), { titulo: "assinantes" }) +
      '<p class="sub">Hoje: ' + n.ativos + " assinantes e " + n.testes + " em teste.</p></section></div>";
  }

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
    C.innerHTML = html;
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
      (linhas.length ? linhas.map(function (x) { var a = x.s.assinatura || {}; return '<tr data-id="' + esc(x.s.id) + '" tabindex="0"><td><b>' + esc(x.s.nome || "(sem nome)") + '</b><br><span class="sub">/' + esc(x.s.slug || "sem link") + "</span></td><td>" + esc(x.dono.email || "-") + "</td><td>" + tag(x.st) + "</td><td>" + esc((PLANOS[a.plano] || {}).nome || "-") + "</td><td>" + data(a.status === "ativa" ? a.pagoAte : a.testeAte) + "</td><td>" + data(x.s.criadoEm) + "</td></tr>"; }).join("") : '<tr><td colspan="6" class="sub">Nenhum salão com esse filtro.</td></tr>') +
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
    var mes = new Date().toISOString().slice(0, 7), pega = function (p) { return p.catch(function () { return []; }); };
    var r = await Promise.all([
      pega(lista(col("saloes", sid, "profissionais"))), pega(lista(col("saloes", sid, "servicos"))), pega(lista(col("saloes", sid, "clientes"))),
      pega(lista(FB.query(col("saloes", sid, "agendamentos"), FB.where("data", ">=", mes + "-01")))), pega(lista(col("saloes", sid, "resumos"))),
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
      '<button class="btn btn--sec btn--peq" id="aCortesia">Dar dias de cortesia</button>' +
      '<button class="btn btn--sec btn--peq" id="aPlano">Mudar plano / vagas</button>' +
      (a.bloqueado ? '<button class="btn btn--pri btn--peq" id="aDesbloq">Desbloquear</button>' : '<button class="btn btn--perigo btn--peq" id="aBloq">Bloquear acesso</button>') +
      '<button class="btn btn--sec btn--peq" id="aAviso">Mandar aviso só para este salão</button></div>' +
      '<p class="sub">Tudo o que você faz aqui fica registrado no histórico do salão.</p></section>' +

      '<section class="painel"><h2>' + Icone("dinheiro") + "Pagamentos e eventos</h2>" +
      (evs.length ? '<ul class="feed">' + evs.slice(0, 12).map(function (e) { return "<li><span>" + esc(e.acao || e.evento || "") + " · " + esc((PLANOS[e.plano] || {}).nome || e.plano || "") + '</span><span class="sub">' + dataHora(e.quando) + "</span></li>"; }).join("") + "</ul>" : '<p class="sub">Nenhum pagamento nos últimos 90 dias.</p>') + "</section></div>" +

      '<div class="cen-duas"><section class="painel"><h2>' + Icone("usuarios") + "Equipe</h2>" +
      (profs.length ? '<table class="tab">' + profs.map(function (x) { return "<tr><td><b>" + esc(x.nome || "") + "</b>" + (x.ehDono ? " (dono)" : "") + "</td><td>" + (x.removido ? "removido" : x.ativo ? (x.uid ? "ativo" : "convite pendente") : "desativado") + "</td></tr>"; }).join("") + "</table>" : '<p class="sub">Nenhum profissional.</p>') +
      '<h3 class="cen-h3">Serviços</h3>' + (servs.length ? '<p class="sub">' + servs.map(function (x) { return esc(x.nome) + " (" + brl(x.preco) + ", " + (x.duracao || "?") + " min)"; }).join(" · ") + "</p>" : '<p class="sub">Nenhum serviço.</p>') + "</section>" +
      '<section class="painel"><h2>' + Icone("grafico") + "Faturamento do salão por mês</h2>" +
      grafico(resumos.slice(-12).map(function (x) { return { r: x.id.slice(5, 7) + "/" + x.id.slice(2, 4), v: x.fat || 0 }; }).concat([{ r: "atual", v: fatMes }]), { barras: true, fmt: brl, titulo: "faturamento" }) +
      '<p class="sub">Atendimentos concluídos. Os meses passados vêm dos resumos mensais que o app guarda para sempre.</p></section></div>' +

      '<div class="cen-duas"><section class="painel"><h2>' + Icone("estrela") + "Sugestões deste salão</h2>" +
      (sugs.length ? sugs.map(function (x) { return '<div class="sug"><span class="tag">' + (x.tipo === "problema" ? "Problema" : "Sugestão") + '</span> <span class="sub" style="display:inline">' + dataHora(x.quando) + " · " + esc(x.status || "nova") + "</span><p>" + esc(x.texto) + "</p></div>"; }).join("") : '<p class="sub">Nenhuma.</p>') + "</section>" +
      '<section class="painel"><h2>' + Icone("lista") + "Histórico de ações da Central</h2>" +
      (aud.length ? '<ul class="feed">' + aud.map(function (x) { return "<li><span>" + esc(x.acao) + (x.detalhe ? ": " + esc(x.detalhe) : "") + '</span><span class="sub">' + dataHora(x.quando) + " · " + esc(x.por) + "</span></li>"; }).join("") + "</ul>" : '<p class="sub">Nenhuma ação ainda.</p>') + "</section></div>";
    ligarFicha(s);
  }

  async function salvarAssinatura(s, mud, acao, detalhe) {
    var a = Object.assign({}, s.assinatura || {}, mud);
    try { await FB.updateDoc(FB.doc(db, "saloes", s.id), { assinatura: a }); s.assinatura = a; await registrar(acao, s.id, detalhe); aviso("Salvo e registrado."); telaSalao(s.id); }
    catch (e) { alert("Não deu para salvar: " + e.message); }
  }
  function ligarFicha(s) {
    var a = s.assinatura || {};
    $("#aCortesia").onclick = function () {
      var dias = Number(prompt("Quantos dias de cortesia para \"" + (s.nome || s.id) + "\"? (1 a 90)\nO acesso é estendido a partir de hoje ou do fim atual, o que for maior.", "7"));
      if (!dias || dias < 1 || dias > 90) return;
      var campo = a.status === "ativa" ? "pagoAte" : "testeAte", mud = {};
      if (a.status !== "ativa" && a.status !== "teste") { mud.status = "teste"; campo = "testeAte"; }
      mud[campo] = FB.Timestamp.fromMillis(Math.max(Date.now(), ms(a[campo])) + dias * D);
      mud.cortesias = (a.cortesias || []).concat([{ dias: dias, em: FB.Timestamp.fromMillis(Date.now()), por: auth.currentUser.email }]);
      mud.avisoApagar = null;
      salvarAssinatura(s, mud, "cortesia", dias + " dias");
    };
    $("#aPlano").onclick = function () {
      var k = prompt("Plano (escreva: essencial, equipe ou salao). Atual: " + (a.plano || "essencial"), a.plano || "essencial"); if (!k) return;
      k = k.trim().toLowerCase().replace("ã", "a"); if (!PLANOS[k]) { alert("Plano inválido."); return; }
      var v = Number(prompt("Quantas vagas de profissional? (padrão do plano: " + PLANOS[k].limite + ")", String(PLANOS[k].limite)));
      if (!v || v < 1 || v > 50) return;
      salvarAssinatura(s, { plano: k, limiteProf: v }, "plano manual", PLANOS[k].nome + ", " + v + " vagas");
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
})();
