/* =========================================================
   BANCO DE DADOS NA NUVEM (Firebase / Firestore) — BoosterAgenda 1.1
   Níveis: salão (dono) > profissionais > cliente final.
   - usuarios/{uid}               quem é a pessoa e de qual salão ela é
   - saloes/{salaoId}             perfil + assinatura do salão (salaoId = uid do dono)
   - saloes/{id}/profissionais    equipe (cada ativo ocupa uma vaga do plano)
   - saloes/{id}/vagas/{n}        vagas do plano (1..limiteProf)
   - saloes/{id}/servicos|clientes|bloqueios|agendamentos
   - convites/{codigo}            convite para um profissional entrar
   - paginas/{endereco}           página pública (só dados públicos)
   - paginas/{endereco}/ocupados/{profId}_{dia}_{HHMM}
   Funciona sem internet (cópia no aparelho) e envia quando a conexão volta.
   Também expõe window.DB (exportar/importar/getConfig/setConfig) para o backup.js.
   ========================================================= */
window.Nuvem = (function () {
  "use strict";
  var app = FB.initializeApp(APP.firebase);
  var auth = FB.getAuth(app);
  var db;
  try {
    db = FB.initializeFirestore(app, { localCache: FB.persistentLocalCache({ tabManager: FB.persistentMultipleTabManager() }) });
  } catch (e) {
    db = FB.initializeFirestore(app, { localCache: FB.memoryLocalCache() });
  }

  var OCUPA = { marcado: 1, confirmado: 1, concluido: 1 };
  var PLANOS = {
    essencial: { nome: "Essencial", limite: 2, preco: 37.90, cheio: 47.90 },
    equipe: { nome: "Equipe", limite: 5, preco: 64.90, cheio: 79.90 },
    salao: { nome: "Salão", limite: 10, preco: 99.90, cheio: 129.90 }
  };
  var CORES = ["#f0a500", "#5aa9ff", "#3ddc97", "#c084fc", "#ff7a6b", "#2dd4bf", "#f472b6", "#a3e635", "#fb923c", "#93c5fd"];

  var uid = null, email = null, sid = null;
  var st = {
    eu: null,            // { papel: "dono"|"prof", salaoId, profId? }
    perfil: null,        // documento do salão
    servicos: [], clientes: [], bloqueios: [], profissionais: [], vagas: [],
    ags: new Map(), janela: null
  };
  var desligar = [];
  var ligadosOnline = new Set();

  function emitir(nome, detalhe) { document.dispatchEvent(new CustomEvent(nome, { detail: detalhe })); }
  function col(nome) { return FB.collection(db, "saloes", sid, nome); }
  function ref(nome, id) { return FB.doc(db, "saloes", sid, nome, id); }
  function refSalao() { return FB.doc(db, "saloes", sid); }
  function refPagina(slug) { return FB.doc(db, "paginas", slug); }
  function refOcupado(slug, s) { return FB.doc(db, "paginas", slug, "ocupados", s); }
  function refReserva(slug, tk) { return FB.doc(db, "paginas", slug, "reservas", tk); }
  // Fim do horário + intervalo entre atendimentos (a folga também fica ocupada)
  function fimComFolga(fim) { var f = Number(st.perfil && st.perfil.intervalo) || 0; return f ? U.hhmm(Math.min(U.min(fim) + f, 24 * 60 - 1)) : fim; }
  function novoId(nome) { return FB.doc(col(nome)).id; }
  function agora() { return new Date().toISOString(); }
  function limpar(o) { var r = {}; Object.keys(o).forEach(function (k) { if (o[k] !== undefined && k.charAt(0) !== "_") r[k] = o[k]; }); return r; }
  function ehDono() { return !!(st.eu && st.eu.papel === "dono"); }
  // Limpeza automática: o Firebase apaga sozinho o que passou da data em "apagarEm"
  var GUARDA_DIAS = 367;   // 12 meses + 1 dia
  function vence(iso, dias) { return FB.Timestamp.fromMillis(new Date((iso || U.hojeISO()) + "T12:00:00").getTime() + dias * 864e5); }
  function mesDe(iso) { return (iso || "").slice(0, 7); }
  function mesMenos(n) { var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n); return U.isoDe(d).slice(0, 7); }
  function meuNome() {
    var p = st.profissionais.find(function (x) { return x.uid === uid; });
    return (p && p.nome) || (st.perfil && st.perfil.donoNome) || email || "";
  }
  function meuProfId() { return st.eu && st.eu.profId; }

  function traduzir(e) {
    var c = (e && e.code) || "";
    var m = {
      "auth/invalid-credential": "E-mail ou senha incorretos.",
      "auth/wrong-password": "E-mail ou senha incorretos.",
      "auth/user-not-found": "Não existe conta com este e-mail. Clique em \"Criar minha conta\".",
      "auth/invalid-email": "Digite um e-mail válido.",
      "auth/email-already-in-use": "Já existe uma conta com este e-mail. Use \"Entrar\" ou \"Esqueci minha senha\".",
      "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
      "auth/too-many-requests": "Muitas tentativas. Espere alguns minutos e tente de novo.",
      "auth/network-request-failed": "Sem internet. Conecte-se para entrar.",
      "permission-denied": "Sem permissão para esta ação. Confira se a assinatura está em dia.",
      "unavailable": "Sem conexão com a nuvem. Tente de novo em instantes.",
      "failed-precondition": "O banco ainda está preparando um índice. Tente de novo em alguns minutos."
    };
    return m[c] || (e && e.message) || "Algo deu errado. Tente de novo.";
  }
  function falhou(e) { console.error(e); emitir("nuvem-erro", traduzir(e)); }

  /* ---------------- Conta ---------------- */
  var primeiraResposta = new Promise(function (resolve) {
    var u = FB.onAuthStateChanged(auth, function (user) { u(); resolve(user); });
  });

  var Conta = {
    usuario: function () { return auth.currentUser; },
    email: function () { return email || (auth.currentUser && (auth.currentUser.email || "").toLowerCase()); },
    esperar: function () { return primeiraResposta; },
    entrar: function (e, s) { return FB.signInWithEmailAndPassword(auth, e.trim(), s).then(function (r) { return r.user; }); },
    criar: function (e, s) { return FB.createUserWithEmailAndPassword(auth, e.trim(), s).then(function (r) { return r.user; }); },
    recuperar: function (e) { auth.languageCode = "pt-BR"; return FB.sendPasswordResetEmail(auth, e.trim()); },
    sair: function () { desligar.forEach(function (f) { f(); }); desligar = []; return FB.signOut(auth); },
    traduzir: traduzir
  };

  // Quem sou eu? (dono, profissional ou ainda sem salão)
  async function carregarSessao() {
    var user = auth.currentUser || await primeiraResposta;
    if (!user) return null;
    uid = user.uid; email = (user.email || "").toLowerCase();
    var s = await FB.getDoc(FB.doc(db, "usuarios", uid));
    if (!s.exists()) { st.eu = null; return { semSalao: true }; }
    st.eu = s.data();
    sid = st.eu.salaoId;
    return st.eu;
  }

  // Dono: cria o salão e começa o teste grátis de 30 dias
  async function criarSalao(d) {
    var user = auth.currentUser;
    uid = user.uid; email = (user.email || "").toLowerCase(); sid = uid;
    var testeAte = FB.Timestamp.fromMillis(Date.now() + 30 * 864e5);
    var b = FB.writeBatch(db);
    b.set(FB.doc(db, "testes", email), { criadoEm: agora() });
    var demo = await ehDemo();
    b.set(refSalao(), limpar({
      demo: demo || undefined,
      nome: d.nome, whatsapp: d.whatsapp, donoUid: uid, donoNome: d.nomePessoa || "",
      horarios: d.horarios, antecedenciaHoras: 2, diasAFrente: 30, publico: true, msgLembrete: d.msgLembrete,
      compartilharNumeros: true, origem: d.origem || "", criadoEm: agora(),
      assinatura: { status: "teste", plano: "teste", limiteProf: 10, testeAte: testeAte }
    }));
    b.set(FB.doc(db, "usuarios", uid), { papel: "dono", salaoId: uid, email: email, nome: d.nomePessoa || "", criadoEm: agora() });
    if (d.atende) {
      b.set(ref("profissionais", uid), { nome: d.nomePessoa || d.nome, email: email, whatsapp: d.whatsapp, cor: CORES[0], servicos: [], uid: uid, ehDono: true, ativo: true, vaga: 1, criadoEm: agora() });
      b.set(ref("vagas", "1"), { prof: uid });
    }
    await b.commit();
    st.eu = { papel: "dono", salaoId: uid };
    // Avisa a Central da Sitebooster (celular do dono do sistema). Se falhar, não atrapalha nada.
    try { if (APP.robo) auth.currentUser.getIdToken().then(function (tk) { return fetch(APP.robo + "/aviso/novo-salao", { method: "POST", headers: { Authorization: "Bearer " + tk } }); }).catch(function () {}); } catch (e) {}
    return st.eu;
  }

  // Conta de demonstração (o dono do sistema mostra o app para clientes; botão para recomeçar do zero)
  var demoP = null;
  function ehDemo() {
    if (demoP) return demoP;
    var mail = ((auth.currentUser && auth.currentUser.email) || "").toLowerCase();
    demoP = !mail ? Promise.resolve(false) : FB.getDoc(FB.doc(db, "demos", mail)).then(function (d) { return d.exists(); }, function () { return false; });
    return demoP;
  }
  async function recomecarDemo() {
    var tk = await auth.currentUser.getIdToken();
    var r = await fetch(APP.robo + "/demo/resetar", { method: "POST", headers: { Authorization: "Bearer " + tk } });
    var j = await r.json().catch(function () { return {}; }); if (!r.ok) throw new Error(j.erro || ("erro " + r.status));
    try { localStorage.clear(); } catch (e) {}
    return true;
  }
  // Profissional entrou pela tela normal (sem o link): procura um convite feito para o e-mail dele
  async function conviteParaMim() {
    var mail = ((auth.currentUser && auth.currentUser.email) || "").toLowerCase(); if (!mail) return null;
    try {
      var q = await FB.getDocs(FB.query(FB.collection(db, "convites"), FB.where("email", "==", mail)));
      var ok = q.docs.map(function (d) { return Object.assign({ codigo: d.id }, d.data()); })
        .filter(function (c) { return !c.usadoPor && (!c.expiraEm || c.expiraEm.toMillis() > Date.now()); })
        .sort(function (x, y) { return (y.criadoEm && y.criadoEm.toMillis ? y.criadoEm.toMillis() : 0) - (x.criadoEm && x.criadoEm.toMillis ? x.criadoEm.toMillis() : 0); });
      return ok[0] ? ok[0].codigo : null;
    } catch (e) { return null; }
  }
  // Profissional: aceita o convite recebido
  async function aceitarConvite(codigo, nomePessoa) {
    var user = auth.currentUser;
    uid = user.uid; email = (user.email || "").toLowerCase();
    var c;
    try { c = await FB.getDoc(FB.doc(db, "convites", codigo)); }
    catch (e) { throw new Error("Este convite é para outro e-mail. Entre com o e-mail que recebeu o convite."); }
    if (!c.exists()) throw new Error("Convite não encontrado. Peça um novo ao dono do salão.");
    var cv = c.data();
    if (cv.usadoPor) throw new Error("Este convite já foi usado. Se for você, é só entrar com o seu e-mail e senha.");
    if (cv.expiraEm && cv.expiraEm.toMillis() < Date.now()) throw new Error("Este convite venceu. Peça um novo ao dono do salão.");
    sid = cv.salaoId;
    var b = FB.writeBatch(db);
    b.update(FB.doc(db, "convites", codigo), { usadoPor: uid, usadoEm: agora() });
    b.set(FB.doc(db, "usuarios", uid), { papel: "prof", salaoId: cv.salaoId, profId: cv.profId, convite: codigo, email: email, nome: nomePessoa || cv.nome || "", criadoEm: agora() });
    b.update(ref("profissionais", cv.profId), { uid: uid });
    await b.commit();
    st.eu = { papel: "prof", salaoId: cv.salaoId, profId: cv.profId };
    return { salaoNome: cv.salaoNome };
  }

  /* ---------------- Assinatura ---------------- */
  function assinatura() {
    var a = (st.perfil && st.perfil.assinatura) || {};
    var plano = PLANOS[a.plano] || PLANOS.essencial;
    var fim = a.status === "ativa" ? a.pagoAte : a.testeAte;
    var fimMs = fim && fim.toMillis ? fim.toMillis() : 0;
    var dias = Math.ceil((fimMs - Date.now()) / 864e5);
    var emDia = (a.status === "teste" || a.status === "ativa") && fimMs > Date.now() && !a.bloqueado;
    // Próxima cobrança: a data que a Kiwify informou; se não veio, o fim do período pago sem os 3 dias de tolerância
    var testeMs = a.testeAte && a.testeAte.toMillis ? a.testeAte.toMillis() : 0;
    var prox = 0;
    if (a.proximaCobranca && a.proximaCobranca.toMillis) prox = a.proximaCobranca.toMillis();   // data informada pela Kiwify
    else if (a.status === "ativa" && fimMs && !testeMs) prox = fimMs - 3 * 864e5;               // estimativa (sem teste grátis no meio)
    if (prox && prox < Date.now() - 864e5) prox = 0;                                            // data já passou: não mostra
    return { status: a.status || "teste", plano: a.plano || "essencial", planoNome: a.status === "teste" ? "Teste grátis (tudo liberado)" : plano.nome, testeAte: testeMs, limite: a.limiteProf || plano.limite, preco: plano.preco, dias: dias, emDia: emDia, fim: fimMs, cancelada: !!a.cancelada, atrasada: !!a.atrasada,
      proxima: prox, diasRenova: prox ? Math.ceil((prox - Date.now()) / 864e5) : null, gerenciar: a.gerenciar || {}, avisoApagar: a.avisoApagar && a.avisoApagar.toMillis ? a.avisoApagar.toMillis() : 0, bloqueado: !!a.bloqueado };
  }

  /* ---------------- Carregar e ouvir dados ---------------- */
  // Comunicados da Central (aviso no topo do app para todos os salões)
  function comunicados() {
    return FB.getDocs(FB.query(FB.collection(db, "comunicados"), FB.where("ativo", "==", true)))
      .then(function (q) { return q.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).filter(function (c) { return !c.salaoId || c.salaoId === sid; }); }, function () { return []; });
  }

  function iniciar() {
    st.janela = U.somaDias(U.hojeISO(), -7);
    var lista = ["perfil", "servicos", "clientes", "bloqueios", "profissionais", "ags"];
    if (ehDono()) lista.push("vagas");
    var faltam = lista.length, pronto;
    var tudoPronto = new Promise(function (r) { pronto = r; });
    var primeira = {}; lista.forEach(function (k) { primeira[k] = true; });
    function um(k) { if (primeira[k]) { primeira[k] = false; if (--faltam === 0) pronto(); } }

    desligar.push(FB.onSnapshot(refSalao(), function (s) {
      st.perfil = s.exists() ? s.data() : null;
      emitir("nuvem", { tabela: "perfil" }); um("perfil");
    }, function (e) { falhou(e); um("perfil"); }));

    ["servicos", "clientes", "bloqueios", "profissionais", "vagas"].forEach(function (t) {
      if (lista.indexOf(t) === -1) return;
      desligar.push(FB.onSnapshot(col(t), function (s) {
        st[t] = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        emitir("nuvem", { tabela: t }); um(t);
      }, function (e) { falhou(e); um(t); }));
    });

    var q = ehDono()
      ? FB.query(col("agendamentos"), FB.where("data", ">=", st.janela))
      : FB.query(col("agendamentos"), FB.where("profId", "==", meuProfId()), FB.where("data", ">=", st.janela));
    var jaCarregou = false;
    desligar.push(FB.onSnapshot(q, function (s) {
      var novosOnline = [], respostas = [];
      s.docChanges().forEach(function (ch) {
        var a = Object.assign({ id: ch.doc.id }, ch.doc.data());
        var antes = st.ags.get(a.id);
        if (ch.type === "removed") st.ags.delete(a.id); else st.ags.set(a.id, a);
        if (jaCarregou && ch.type === "modified" && a.respondidoEm && (!antes || antes.respondidoEm !== a.respondidoEm) && !ch.doc.metadata.hasPendingWrites) respostas.push(a);
        if (jaCarregou && ch.type === "added" && a.origem === "online" && !ch.doc.metadata.hasPendingWrites) novosOnline.push(a);
      });
      jaCarregou = true;
      ligarClientesOnline();
      emitir("nuvem", { tabela: "agendamentos" });
      novosOnline.forEach(function (a) { emitir("novo-online", a); });
      respostas.forEach(function (a) { emitir("resposta-cliente", a); });
      um("ags");
    }, function (e) { falhou(e); um("ags"); }));

    return tudoPronto;
  }

  // Agendamento feito pelo link: liga (ou cria) o cliente pelo WhatsApp
  function ligarClientesOnline() {
    st.ags.forEach(function (a) {
      if (a.origem !== "online" || a.clienteId || ligadosOnline.has(a.id)) return;
      if (!ehDono() && a.profId !== meuProfId()) return;
      ligadosOnline.add(a.id);
      var z = U.zap(a.clienteWhats);
      var c = st.clientes.find(function (x) { return x.whatsapp && U.zap(x.whatsapp) === z; });
      var b = FB.writeBatch(db), cid;
      if (!c) {
        cid = novoId("clientes");
        b.set(ref("clientes", cid), { nome: a.clienteNome, whatsapp: a.clienteWhats, obs: "", criadoEm: agora(), atualizadoEm: agora(), visitas: 0, totalGasto: 0, faltas: 0, profPreferido: a.profId || null, aceitaNovidades: !!a.aceitaNovidades, apagarEm: vence(a.data, GUARDA_DIAS) });
      } else {
        cid = c.id;
        var extra = a.aceitaNovidades ? { aceitaNovidades: true } : {};
        b.set(ref("clientes", cid), Object.assign(extra, { profPreferido: a.profId || null, apagarEm: vence(a.data > (c.ultimaVisita || "") ? a.data : c.ultimaVisita, GUARDA_DIAS) }), { merge: true });
      }
      var upd = { clienteId: cid, alteradoPor: uid };
      if (!a.apagarEm) upd.apagarEm = vence(a.data, GUARDA_DIAS);
      b.update(ref("agendamentos", a.id), upd);
      b.commit().catch(falhou);
    });
  }

  /* ---------------- Leitura ---------------- */
  function filtroProf(q) { return ehDono() ? q : FB.query(q, FB.where("profId", "==", meuProfId())); }
  function agsEntre(de, ate) {
    var lista = [];
    st.ags.forEach(function (a) { if (a.data >= de && a.data <= ate) lista.push(a); });
    if (de >= st.janela) return Promise.resolve(lista);
    var q = filtroProf(FB.query(col("agendamentos"), FB.where("data", ">=", de), FB.where("data", "<=", ate)));
    return FB.getDocs(q).then(function (s) {
      var m = new Map();
      s.docs.forEach(function (d) { m.set(d.id, Object.assign({ id: d.id }, d.data())); });
      lista.forEach(function (a) { m.set(a.id, a); });
      return Array.from(m.values());
    });
  }
  function agsDoCliente(cid) {
    var q = filtroProf(FB.query(col("agendamentos"), FB.where("clienteId", "==", cid)));
    return FB.getDocs(q).then(function (s) {
      return s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    });
  }

  /* ---------------- Cadastros simples ---------------- */
  function salvar(tabela, obj) {
    var o = limpar(Object.assign({}, obj));
    var id = o.id || novoId(tabela);
    delete o.id;
    if (!o.criadoEm) o.criadoEm = agora();
    o.atualizadoEm = agora();
    if (tabela === "clientes" && !o.apagarEm) o.apagarEm = vence(o.ultimaVisita > U.hojeISO() ? o.ultimaVisita : U.hojeISO(), GUARDA_DIAS);
    if (tabela === "bloqueios" && o.data) o.apagarEm = vence(o.data, 30);
    var p = FB.setDoc(ref(tabela, id), o).catch(falhou);
    emitir("dados-alterados", { tabela: tabela });
    if (tabela === "servicos" || tabela === "bloqueios") publicarPagina();
    return Promise.resolve(Object.assign({ id: id, _envio: p }, o));
  }
  function apagar(tabela, id) {
    FB.deleteDoc(ref(tabela, id)).catch(falhou);
    emitir("dados-alterados", { tabela: tabela });
    if (tabela === "servicos" || tabela === "bloqueios") publicarPagina();
    return Promise.resolve();
  }

  // Bloqueio de um profissional também ocupa os blocos da página pública
  async function salvarBloqueio(b) {
    if (!ehDono()) b.profId = meuProfId();
    var r = await salvar("bloqueios", b);
    if (b.profId) ocuparBloqueio(Object.assign({}, b, { id: r.id }), true);
    return r;
  }
  async function apagarBloqueio(b) {
    if (b.profId) ocuparBloqueio(b, false);
    return apagar("bloqueios", b.id);
  }
  function blocosDoBloqueio(b) {
    var ini = b.inicio, fim = b.fim;
    if (b.diaInteiro) { ini = "00:00"; fim = "23:59"; }
    return U.slots(b.data, ini, fim, b.profId);
  }
  function ocuparBloqueio(b, ocupar) {
    var slug = st.perfil && st.perfil.slug;
    if (!slug || !b.profId) return Promise.resolve();
    var bt = FB.writeBatch(db);
    blocosDoBloqueio(b).forEach(function (s) {
      if (ocupar) bt.set(refOcupado(slug, s), { ag: "bloq" + b.id, data: b.data, profId: b.profId, apagarEm: vence(b.data, 2) });
      else bt.delete(refOcupado(slug, s));
    });
    return bt.commit().catch(falhou);
  }

  /* ---------------- Equipe (só dono) ---------------- */
  function vagaLivre() {
    var lim = assinatura().limite, usadas = new Set(st.vagas.map(function (v) { return Number(v.id); }));
    for (var n = 1; n <= lim; n++) if (!usadas.has(n)) return n;
    return 0;
  }
  function corLivre() {
    var usadas = st.profissionais.map(function (p) { return p.cor; });
    return CORES.find(function (c) { return usadas.indexOf(c) === -1; }) || CORES[st.profissionais.length % CORES.length];
  }
  function linkConvite(codigo, mail) {
    var base = new URL("index.html", location.href).href.split("?")[0].split("#")[0];
    return base + "?convite=" + encodeURIComponent(codigo) + "&email=" + encodeURIComponent(mail);
  }
  function criarConvite(b, pid, nome, mail) {
    var codigo = U.codigo(24);
    b.set(FB.doc(db, "convites", codigo), {
      salaoId: sid, profId: pid, email: mail, nome: nome, salaoNome: (st.perfil && st.perfil.nome) || "",
      criadoEm: agora(), expiraEm: FB.Timestamp.fromMillis(Date.now() + 14 * 864e5), usadoPor: null,
      apagarEm: FB.Timestamp.fromMillis(Date.now() + 44 * 864e5)
    });
    return codigo;
  }

  async function convidarProfissional(d) {
    var n = vagaLivre();
    if (!n) throw new Error("Seu plano " + assinatura().planoNome + " permite até " + assinatura().limite + " profissionais. Para adicionar mais, troque de plano.");
    var mail = String(d.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) throw new Error("Digite o e-mail do profissional.");
    if (mail === email) throw new Error("Esse é o seu e-mail. Para atender clientes, ligue \"Eu também atendo\".");
    if (st.profissionais.some(function (p) { return (p.email || "").toLowerCase() === mail && p.ativo; })) throw new Error("Já existe um profissional ativo com este e-mail.");
    var pid = novoId("profissionais");
    var b = FB.writeBatch(db);
    b.set(ref("profissionais", pid), { nome: d.nome, email: mail, whatsapp: d.whatsapp || "", cor: d.cor || corLivre(), servicos: d.servicos || [], uid: null, ehDono: false, ativo: true, vaga: n, criadoEm: agora() });
    b.set(ref("vagas", String(n)), { prof: pid });
    var codigo = criarConvite(b, pid, d.nome, mail);
    await b.commit();
    publicarPagina();
    return { profId: pid, link: linkConvite(codigo, mail) };
  }

  async function novoConvite(p) {
    var b = FB.writeBatch(db);
    var codigo = criarConvite(b, p.id, p.nome, p.email);
    await b.commit();
    return linkConvite(codigo, p.email);
  }

  // Dono que também atende ocupa uma vaga
  async function donoAtende(atende) {
    var p = st.profissionais.find(function (x) { return x.ehDono; });
    if (atende) {
      if (p && p.ativo) return;
      var n = vagaLivre();
      if (!n) throw new Error("Todas as vagas do plano estão ocupadas. Desative alguém ou troque de plano.");
      var b = FB.writeBatch(db);
      if (p) b.update(ref("profissionais", p.id), { ativo: true, vaga: n });
      else b.set(ref("profissionais", uid), { nome: (st.perfil && st.perfil.donoNome) || "Eu", email: email, whatsapp: (st.perfil && st.perfil.whatsapp) || "", cor: corLivre(), servicos: [], uid: uid, ehDono: true, ativo: true, vaga: n, criadoEm: agora() });
      b.set(ref("vagas", String(n)), { prof: p ? p.id : uid });
      await b.commit();
    } else if (p && p.ativo) {
      await desativarProfissional(p);
    }
    publicarPagina();
  }

  async function salvarProfissional(p) {
    var o = limpar(Object.assign({}, p)); var id = o.id; delete o.id;
    o.atualizadoEm = agora();
    await FB.setDoc(ref("profissionais", id), o);
    publicarPagina();
  }

  async function desativarProfissional(p) {
    var b = FB.writeBatch(db);
    b.update(ref("profissionais", p.id), { ativo: false, vaga: null, atualizadoEm: agora() });
    if (p.vaga) b.delete(ref("vagas", String(p.vaga)));
    await b.commit();
    publicarPagina();
  }

  async function reativarProfissional(p) {
    var n = vagaLivre();
    if (!n) throw new Error("Todas as vagas do plano estão ocupadas. Desative alguém ou troque de plano.");
    var b = FB.writeBatch(db);
    b.update(ref("profissionais", p.id), { ativo: true, vaga: n, atualizadoEm: agora() });
    b.set(ref("vagas", String(n)), { prof: p.id });
    await b.commit();
    publicarPagina();
  }

  // Tira da lista da Equipe quem já foi desativado. O cadastro fica guardado
  // (escondido) para o histórico continuar certo no Relatório e nos acertos.
  async function removerProfissional(p) {
    if (p.ativo) throw new Error("Desative o profissional antes de remover da equipe.");
    if (p.ehDono) throw new Error("Você não pode remover a si mesmo.");
    await FB.updateDoc(ref("profissionais", p.id), { removido: true, removidoEm: agora(), atualizadoEm: agora() });
  }

  /* ---------------- Perfil e página pública ---------------- */
  function salvarPerfil(dados) {
    var d = Object.assign({}, dados); delete d.assinatura; delete d.donoUid;
    var p = FB.setDoc(refSalao(), limpar(Object.assign({}, d, { atualizadoEm: agora() })), { merge: true }).catch(falhou);
    st.perfil = Object.assign({}, st.perfil || {}, d);
    emitir("dados-alterados", { tabela: "perfil" });
    publicarPagina();
    return p;
  }

  var timerPagina = null;
  function publicarPagina() {
    if (!ehDono()) return;
    clearTimeout(timerPagina);
    timerPagina = setTimeout(publicarAgora, 600);
  }
  function dadosPagina() {
    var p = st.perfil || {}, hoje = U.hojeISO();
    return {
      salaoId: sid,
      ativo: p.publico !== false,
      nome: p.nome || "",
      whatsapp: p.whatsapp || "",
      endereco: p.endereco || "",
      recado: p.recado || "",
      horarios: p.horarios || {},
      antecedenciaHoras: Number(p.antecedenciaHoras) || 0,
      intervalo: Number(p.intervalo) || 0,
      diasAFrente: Number(p.diasAFrente) || 30,
      servicos: st.servicos.filter(function (s) { return s.publico !== false; })
        .sort(function (a, b) { return a.nome.localeCompare(b.nome, "pt-BR"); })
        .map(function (s) { return { id: s.id, nome: s.nome, duracao: Number(s.duracao) || 30, preco: Number(s.preco) || 0, mostrarPreco: s.mostrarPreco !== false }; }),
      profissionais: st.profissionais.filter(function (x) { return x.ativo; })
        .sort(function (a, b) { return (a.vaga || 99) - (b.vaga || 99); })
        .map(function (x) { return { id: x.id, nome: x.nome, servicos: x.servicos || [], duracoes: x.duracoes || {} }; }),
      // só os bloqueios do salão inteiro; os de cada profissional viram blocos ocupados
      bloqueios: st.bloqueios.filter(function (b) { return b.data >= hoje && !b.profId; })
        .map(function (b) { return { data: b.data, inicio: b.inicio || "", fim: b.fim || "", diaInteiro: !!b.diaInteiro }; }),
      atualizadoEm: agora()
    };
  }
  function publicarAgora() {
    if (!ehDono() || !st.perfil || !st.perfil.slug) return Promise.resolve();
    return FB.setDoc(refPagina(st.perfil.slug), dadosPagina()).catch(falhou);
  }

  async function definirEndereco(novo) {
    novo = U.slugify(novo);
    if (novo.length < 3) throw new Error("O endereço precisa ter pelo menos 3 letras ou números.");
    var antigo = st.perfil && st.perfil.slug;
    if (novo === antigo) return novo;
    var s = await FB.getDoc(refPagina(novo));
    if (s.exists() && s.data().salaoId !== sid) throw new Error("Esse endereço já está em uso. Escolha outro.");
    st.perfil = Object.assign({}, st.perfil || {}, { slug: novo });
    await FB.setDoc(refPagina(novo), dadosPagina());
    await FB.setDoc(refSalao(), { slug: novo, atualizadoEm: agora() }, { merge: true });
    await reconstruirOcupados(novo);
    if (antigo) {
      var velhos = await FB.getDocs(FB.collection(db, "paginas", antigo, "ocupados"));
      await apagarEmLotes(velhos.docs.map(function (d) { return d.ref; }));
      await FB.deleteDoc(refPagina(antigo));
    }
    emitir("dados-alterados", { tabela: "perfil" });
    return novo;
  }

  async function apagarEmLotes(refs) {
    for (var i = 0; i < refs.length; i += 400) {
      var b = FB.writeBatch(db);
      refs.slice(i, i + 400).forEach(function (r) { b.delete(r); });
      await b.commit();
    }
  }

  // Refaz os blocos ocupados da página a partir dos agendamentos e bloqueios futuros (só o dono)
  async function reconstruirOcupados(slug) {
    slug = slug || (st.perfil && st.perfil.slug);
    if (!slug || !ehDono()) return;
    var hoje = U.hojeISO(), quer = new Map();
    st.ags.forEach(function (a) {
      if (a.data < hoje || !OCUPA[a.status] || !a.profId) return;
      U.slots(a.data, a.inicio, fimComFolga(a.fim), a.profId).forEach(function (s) { quer.set(s, { ag: a.id, data: a.data, profId: a.profId, apagarEm: vence(a.data, 2) }); });
    });
    st.bloqueios.forEach(function (b) {
      if (b.data < hoje || !b.profId) return;
      blocosDoBloqueio(b).forEach(function (s) { quer.set(s, { ag: "bloq" + b.id, data: b.data, profId: b.profId, apagarEm: vence(b.data, 2) }); });
    });
    var existentes = await FB.getDocs(FB.query(FB.collection(db, "paginas", slug, "ocupados"), FB.where("data", ">=", hoje)));
    var ops = [];
    existentes.docs.forEach(function (d) { if (!quer.has(d.id)) ops.push(["del", d.ref]); });
    quer.forEach(function (v, s) { ops.push(["set", refOcupado(slug, s), v]); });
    for (var i = 0; i < ops.length; i += 400) {
      var b = FB.writeBatch(db);
      ops.slice(i, i + 400).forEach(function (o) { if (o[0] === "del") b.delete(o[1]); else b.set(o[1], o[2]); });
      await b.commit();
    }
    var b2 = FB.writeBatch(db), n = 0;
    st.ags.forEach(function (a) {
      if (a.data < hoje || !a.profId) return;
      var sl = OCUPA[a.status] ? U.slots(a.data, a.inicio, fimComFolga(a.fim), a.profId) : [];
      if (JSON.stringify(sl) !== JSON.stringify(a.slots || [])) {
        b2.update(ref("agendamentos", a.id), { slots: sl, alteradoPor: uid }); n++;
        if (a.tk) { b2.set(refReserva(slug, a.tk), { slots: sl }, { merge: true }); n++; }
      }
    });
    if (n) await b2.commit();
  }

  /* ---------------- Agendamentos ---------------- */
  function efeito(a) {
    if (!a || !a.clienteId) return null;
    return { c: a.clienteId, visitas: a.status === "concluido" ? 1 : 0, gasto: a.status === "concluido" ? Number(a.preco) || 0 : 0, faltas: a.status === "faltou" ? 1 : 0 };
  }

  var IMPORTANTES = ["status", "preco", "data", "inicio", "fim", "profId", "servicoId", "clienteNome"];
  function acaoDe(a, antigo) {
    if (!antigo) return "Marcou";
    if (a.status !== antigo.status) return { cancelado: "Cancelou", concluido: "Concluiu", faltou: "Marcou falta", confirmado: "Confirmou", marcado: "Voltou para marcado" }[a.status] || "Mudou a situação";
    if (a.data !== antigo.data || a.inicio !== antigo.inicio) return "Remarcou";
    if (a.profId !== antigo.profId) return "Trocou o profissional";
    if (Number(a.preco) !== Number(antigo.preco)) return "Mudou o valor";
    return "Editou";
  }
  function foto(a) {
    if (!a) return null;
    return { status: a.status || "", preco: Number(a.preco) || 0, data: a.data || "", inicio: a.inicio || "", profNome: a.profNome || "", servicoNome: a.servicoNome || "" };
  }

  function salvarAg(novo, antigo) {
    var a = limpar(Object.assign({}, novo));
    var id = a.id || novoId("agendamentos");
    delete a.id;
    if (!ehDono()) {
      a.profId = meuProfId();
      // Profissional não define valor: vem do serviço (ou fica o que o dono já combinou)
      var sv = st.servicos.find(function (x) { return x.id === a.servicoId; });
      if (!antigo || antigo.servicoId !== a.servicoId) a.preco = sv ? sv.preco : 0; else a.preco = antigo.preco;
    }
    if (!a.criadoEm) a.criadoEm = agora();
    if (!a.origem) a.origem = "painel";
    var prof = st.profissionais.find(function (p) { return p.id === a.profId; });
    if (prof) a.profNome = prof.nome;
    a.atualizadoEm = agora();
    a.alteradoPor = uid;
    a.apagarEm = vence(a.data, GUARDA_DIAS);
    var slug = st.perfil && st.perfil.slug;
    var hoje = U.hojeISO();
    var novos = slug && a.profId && OCUPA[a.status] && a.data >= hoje ? U.slots(a.data, a.inicio, fimComFolga(a.fim), a.profId) : [];
    // Não toma blocos que já são de outro cliente (ex.: atendimento estendido por atraso encostando no próximo)
    novos = novos.filter(function (sl) {
      var dono_ = null;
      st.ags.forEach(function (x) { if (!dono_ && x.id !== id && OCUPA[x.status] && (x.slots || []).indexOf(sl) !== -1) dono_ = x; });
      return !dono_;
    });
    a.slots = novos;
    if (!a.tk) a.tk = U.codigo(22);   // link secreto para o cliente confirmar ou desmarcar

    var b = FB.writeBatch(db);
    // Histórico: só quando muda algo de horário ou dinheiro
    var mudou = !antigo || IMPORTANTES.some(function (k) { return String(a[k] == null ? "" : a[k]) !== String(antigo[k] == null ? "" : antigo[k]); });
    if (mudou) {
      var hid = novoId("historico");
      a.ultLog = hid;
      var h = { ag: id, uid: uid, nome: meuNome(), acao: acaoDe(a, antigo), em: agora(), antes: foto(antigo), depois: foto(a), apagarEm: vence(hoje, GUARDA_DIAS) };
      if (a.status === "cancelado" && a.motivo) h.acao += ": " + a.motivo;
      b.set(ref("historico", hid), h);
    }
    b.set(ref("agendamentos", id), a);
    if (slug && a.data >= hoje) b.set(refReserva(slug, a.tk), { ag: id, data: a.data, inicio: a.inicio, fim: a.fim, servicoNome: a.servicoNome || "", profNome: a.profNome || "",
      nome: String(a.clienteNome || "").split(" ")[0].slice(0, 30), status: a.status, slots: novos, apagarEm: vence(a.data, 2) });
    if (slug) {
      novos.forEach(function (s) { b.set(refOcupado(slug, s), { ag: id, data: a.data, profId: a.profId, apagarEm: vence(a.data, 2) }); });
      ((antigo && antigo.slots) || []).forEach(function (s) {
        if (novos.indexOf(s) !== -1) return;
        var outro = null;
        st.ags.forEach(function (x) { if (!outro && x.id !== id && OCUPA[x.status] && (x.slots || []).indexOf(s) !== -1) outro = x; });
        if (outro) b.set(refOcupado(slug, s), { ag: outro.id, data: outro.data, profId: outro.profId, apagarEm: vence(outro.data, 2) });
        else b.delete(refOcupado(slug, s));
      });
    }
    // Mexeu num mês já fechado? O resumo daquele mês é refeito depois
    if (ehDono()) {
      [mesDe(a.data), antigo && mesDe(antigo.data)].forEach(function (m) { if (m && m <= mesMenos(2)) b.delete(ref("resumos", m)); });
    }

    var e1 = efeito(antigo), e2 = efeito(Object.assign({ id: id }, a));
    var deltas = {};
    function soma(e, sinal) {
      if (!e) return;
      var d = deltas[e.c] || (deltas[e.c] = { visitas: 0, gasto: 0, faltas: 0 });
      d.visitas += sinal * e.visitas; d.gasto += sinal * e.gasto; d.faltas += sinal * e.faltas;
    }
    soma(e1, -1); soma(e2, 1);
    if (a.clienteId && !deltas[a.clienteId]) deltas[a.clienteId] = { visitas: 0, gasto: 0, faltas: 0 };
    Object.keys(deltas).forEach(function (cid) {
      var d = deltas[cid], upd = {};
      if (d.visitas) upd.visitas = FB.increment(d.visitas);
      if (d.gasto) upd.totalGasto = FB.increment(d.gasto);
      if (d.faltas) upd.faltas = FB.increment(d.faltas);
      var c = st.clientes.find(function (x) { return x.id === cid; });
      if (e2 && e2.c === cid && e2.visitas && (!c || !c.ultimaVisita || a.data > c.ultimaVisita)) upd.ultimaVisita = a.data;
      if (cid === a.clienteId && a.status !== "cancelado") {
        if (a.profId && (!c || c.profPreferido !== a.profId)) upd.profPreferido = a.profId;
        var ref0 = (c && c.ultimaVisita && c.ultimaVisita > a.data) ? c.ultimaVisita : a.data;
        upd.apagarEm = vence(ref0 > hoje ? ref0 : hoje, GUARDA_DIAS);
      }
      if (Object.keys(upd).length) b.set(ref("clientes", cid), upd, { merge: true });
    });

    var envio = b.commit().catch(falhou);
    st.ags.set(id, Object.assign({ id: id }, a));
    emitir("dados-alterados", { tabela: "agendamentos" });
    return Promise.resolve(Object.assign({ id: id, _envio: envio }, a));
  }

  function apagarAg(antigo, motivo) {
    var x = Object.assign({}, antigo, { status: "cancelado", visto: true });
    if (motivo) x.motivo = motivo;
    return salvarAg(x, antigo);
  }

  // Histórico de um horário (só o dono)
  async function historicoDoAg(agId) {
    if (!ehDono()) return [];
    var s = await FB.getDocs(FB.query(col("historico"), FB.where("ag", "==", agId)));
    return s.docs.map(function (d) { return d.data(); }).sort(function (x, y) { return x.em < y.em ? -1 : 1; });
  }

  /* ---------------- Lembretes e Trazer clientes (A3) ---------------- */
  // Excluir a conta: bloqueia na hora; o robô (Cloud Functions, A4) apaga tudo em até 7 dias
  async function pedirExclusao() {
    if (!ehDono()) throw new Error("Só o dono pode excluir a conta do salão.");
    await FB.updateDoc(FB.doc(db, "saloes", sid), { exclusao: { pedidaEm: agora(), email: email || "" } });
    try { await FB.updateDoc(FB.doc(db, "paginas", st.perfil.slug), { ativo: false }); } catch (e) {}
  }
  function marcarLembrado(a) {
    return FB.updateDoc(ref("agendamentos", a.id), { lembradoEm: agora(), alteradoPor: uid }).catch(falhou);
  }
  function marcarContatado(c) {
    return FB.setDoc(ref("clientes", c.id), { contatadoEm: agora() }, { merge: true }).catch(falhou);
  }

  /* ---------------- Comissões e acertos (A2) ---------------- */
  // O profissional confirma que viu a mudança da comissão
  async function marcarCiente(desde) {
    var pid = meuProfId(); if (!pid) return;
    var c = {}; c[desde] = agora();
    await FB.setDoc(ref("profissionais", pid), { ciente: c }, { merge: true });
  }
  function idAcerto(profId, de) { return profId + "_" + de; }
  async function lerAcerto(profId, de) {
    try { var d = await FB.getDoc(ref("acertos", idAcerto(profId, de))); return d.exists() ? d.data() : null; }
    catch (e) { return null; }
  }
  async function salvarAcerto(a) {
    if (!ehDono()) throw new Error("Só o dono marca o acerto como pago.");
    var o = limpar(Object.assign({}, a));
    o.pagoEm = agora(); o.pagoPor = uid; o.apagarEm = vence(o.ate, GUARDA_DIAS);
    await FB.setDoc(ref("acertos", idAcerto(o.profId, o.de)), o);
    return o;
  }
  async function desfazerAcerto(profId, de) {
    if (!ehDono()) return;
    await FB.deleteDoc(ref("acertos", idAcerto(profId, de)));
  }

  /* ---------------- Importar clientes ---------------- */
  async function importarClientes(lista) {
    if (!ehDono()) throw new Error("Só o dono importa clientes.");
    var so = function (t) { return String(t || "").replace(/\D/g, ""); };
    var jaZap = new Set(st.clientes.map(function (c) { return so(c.whatsapp); }).filter(Boolean));
    var jaNome = new Set(st.clientes.map(function (c) { return (c.nome || "").trim().toLowerCase(); }));
    var novos = [], repetidos = 0;
    lista.forEach(function (c) {
      var z = so(c.whatsapp), n = (c.nome || "").trim();
      if (!n) return;
      if ((z && jaZap.has(z)) || (!z && jaNome.has(n.toLowerCase()))) { repetidos++; return; }
      if (z) jaZap.add(z); jaNome.add(n.toLowerCase());
      novos.push({ nome: n.slice(0, 80), whatsapp: c.whatsapp || "", obs: (c.obs || "").slice(0, 300), criadoEm: agora(), atualizadoEm: agora(), visitas: 0, totalGasto: 0, faltas: 0, origem: "importado", apagarEm: vence(U.hojeISO(), GUARDA_DIAS) });
    });
    for (var i = 0; i < novos.length; i += 400) {
      var b = FB.writeBatch(db);
      novos.slice(i, i + 400).forEach(function (c) { b.set(ref("clientes", novoId("clientes")), c); });
      await b.commit();
    }
    return { importados: novos.length, repetidos: repetidos };
  }

  /* ---------------- Resumo mensal (fica para sempre) ---------------- */
  function calcularResumo(ags, mes, clientes) {
    var concl = ags.filter(function (a) { return a.status === "concluido"; });
    var r = {
      mes: mes, geradoEm: agora(),
      fat: concl.reduce(function (t, a) { return t + (Number(a.preco) || 0); }, 0),
      concluidos: concl.length,
      faltas: ags.filter(function (a) { return a.status === "faltou"; }).length,
      cancelados: ags.filter(function (a) { return a.status === "cancelado"; }).length,
      online: ags.filter(function (a) { return a.origem === "online"; }).length,
      novosClientes: (clientes || []).filter(function (c) { return c.criadoEm && c.criadoEm.slice(0, 7) === mes; }).length,
      porServ: [], porProf: []
    };
    var sv = {}, pf = {};
    concl.forEach(function (a) {
      var k = a.servicoNome || "(sem serviço)"; var x = sv[k] || (sv[k] = { nome: k, n: 0, v: 0 }); x.n++; x.v += Number(a.preco) || 0;
    });
    ags.forEach(function (a) {
      if (!a.profId) return;
      var x = pf[a.profId] || (pf[a.profId] = { id: a.profId, nome: a.profNome || "Profissional", n: 0, v: 0, f: 0 });
      if (a.status === "concluido") { x.n++; x.v += Number(a.preco) || 0; }
      if (a.status === "faltou") x.f++;
    });
    r.porServ = Object.keys(sv).map(function (k) { return sv[k]; });
    r.porProf = Object.keys(pf).map(function (k) { return pf[k]; });
    return r;
  }
  async function lerResumo(mes) {
    if (!ehDono()) return null;
    var d = await FB.getDoc(ref("resumos", mes));
    return d.exists() ? d.data() : null;
  }
  // Guarda o resumo dos meses já fechados (2 a 11 meses atrás) que ainda não têm
  async function garantirResumos() {
    if (!ehDono()) return;
    var inicio = mesDe((st.perfil && st.perfil.criadoEm) || "2000-01");
    var tem = new Set((await FB.getDocs(col("resumos"))).docs.map(function (d) { return d.id; }));
    for (var n = 2; n <= 11; n++) {
      var m = mesMenos(n);
      if (m < inicio || tem.has(m)) continue;
      var de = m + "-01", ate = m + "-31";
      var ags = await agsEntre(de, ate);
      await FB.setDoc(ref("resumos", m), calcularResumo(ags, m, st.clientes));
    }
  }
  // Dados antigos (de antes da limpeza automática) ganham data de vencimento
  async function prepararLimpeza() {
    if (!ehDono()) return;
    var ops = [];
    st.ags.forEach(function (a) { if (!a.apagarEm) ops.push([ref("agendamentos", a.id), { apagarEm: vence(a.data, GUARDA_DIAS), alteradoPor: uid }]); });
    st.clientes.forEach(function (c) { if (!c.apagarEm) ops.push([ref("clientes", c.id), { apagarEm: vence(c.ultimaVisita > U.hojeISO() ? c.ultimaVisita : U.hojeISO(), GUARDA_DIAS) }]); });
    for (var i = 0; i < ops.length; i += 400) {
      var b = FB.writeBatch(db);
      ops.slice(i, i + 400).forEach(function (o) { b.update(o[0], o[1]); });
      await b.commit();
    }
  }

  /* ---------------- Backup (só o dono) ---------------- */
  async function exportar() {
    var out = { app: APP.id, versao: APP.versao, geradoEm: agora(), perfil: null, tabelas: {} };
    var p = await FB.getDoc(refSalao());
    out.perfil = p.exists() ? p.data() : null;
    if (out.perfil) delete out.perfil.assinatura;
    for (var i = 0; i < APP.tabelas.length; i++) {
      var t = APP.tabelas[i];
      var s = await FB.getDocs(t === "agendamentos" ? filtroProf(FB.query(col(t))) : col(t));
      out.tabelas[t] = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    }
    return out;
  }
  async function importar(dados) {
    if (!ehDono()) throw new Error("Só o dono do salão pode restaurar um backup.");
    if (!dados || dados.app !== APP.id || !dados.tabelas) throw new Error("Este arquivo não é um backup do BoosterAgenda.");
    if (!navigator.onLine) throw new Error("Conecte-se à internet para restaurar um backup.");
    for (var i = 0; i < APP.tabelas.length; i++) {
      var t = APP.tabelas[i];
      var atuais = await FB.getDocs(col(t));
      var manter = new Set((dados.tabelas[t] || []).map(function (l) { return l.id; }));
      await apagarEmLotes(atuais.docs.filter(function (d) { return !manter.has(d.id); }).map(function (d) { return d.ref; }));
      var linhas = dados.tabelas[t] || [];
      for (var j = 0; j < linhas.length; j += 400) {
        var b = FB.writeBatch(db);
        linhas.slice(j, j + 400).forEach(function (l) { var o = Object.assign({}, l); var id = o.id; delete o.id; b.set(ref(t, id), o); });
        await b.commit();
      }
    }
    if (dados.perfil) {
      var perfil = Object.assign({}, dados.perfil);
      delete perfil.slug; delete perfil.assinatura; delete perfil.donoUid;
      await FB.setDoc(refSalao(), perfil, { merge: true });
    }
    var q = await FB.getDocs(FB.query(col("agendamentos"), FB.where("data", ">=", st.janela)));
    st.ags = new Map(q.docs.map(function (d) { return [d.id, Object.assign({ id: d.id }, d.data())]; }));
    await reconstruirOcupados();
    await publicarAgora();
    emitir("dados-alterados", { tabela: "*" });
  }

  var kv = new Promise(function (resolve, reject) {
    var r = indexedDB.open(APP.id + "-local", 1);
    r.onupgradeneeded = function () { r.result.createObjectStore("config"); };
    r.onsuccess = function () { resolve(r.result); };
    r.onerror = function () { reject(r.error); };
  });
  function getConfig(k) {
    return kv.then(function (d) { return new Promise(function (res) { var q = d.transaction("config").objectStore("config").get(k); q.onsuccess = function () { res(q.result); }; q.onerror = function () { res(undefined); }; }); });
  }
  function setConfig(k, v) {
    return kv.then(function (d) { return new Promise(function (res) { var tx = d.transaction("config", "readwrite"); tx.objectStore("config").put(v, k); tx.oncomplete = res; tx.onerror = res; }); });
  }

  window.DB = { exportar: exportar, importar: importar, getConfig: getConfig, setConfig: setConfig };

  // Sugestões e problemas enviados pelo app (só gravar; quem lê é a Central da Sitebooster)
  function enviarSugestao(texto, tipo, tela) {
    var uid = (Conta.usuario() || {}).uid;
    return FB.setDoc(FB.doc(FB.collection(db, "sugestoes")), {
      texto: String(texto).slice(0, 2000), tipo: tipo === "problema" ? "problema" : "sugestao",
      salaoId: sid || "", papel: (st.eu && st.eu.papel) || "", uid: uid, quando: FB.serverTimestamp(),
      versao: APP.versao || "", tela: String(tela || "").slice(0, 40)
    });
  }

  return {
    Conta: Conta, estado: st, PLANOS: PLANOS, CORES: CORES, OCUPA: OCUPA,
    carregarSessao: carregarSessao, criarSalao: criarSalao, aceitarConvite: aceitarConvite,
    ehDono: ehDono, meuProfId: meuProfId, assinatura: assinatura, conviteParaMim: conviteParaMim, ehDemo: ehDemo, recomecarDemo: recomecarDemo,
    comunicados: comunicados, iniciar: iniciar, agsEntre: agsEntre, agsDoCliente: agsDoCliente,
    salvar: salvar, apagar: apagar, salvarBloqueio: salvarBloqueio, apagarBloqueio: apagarBloqueio,
    enviarSugestao: enviarSugestao, salvarPerfil: salvarPerfil, definirEndereco: definirEndereco, publicarAgora: publicarAgora, reconstruirOcupados: reconstruirOcupados,
    convidarProfissional: convidarProfissional, novoConvite: novoConvite, donoAtende: donoAtende,
    salvarProfissional: salvarProfissional, desativarProfissional: desativarProfissional, reativarProfissional: reativarProfissional, removerProfissional: removerProfissional,
    salvarAg: salvarAg, apagarAg: apagarAg, historicoDoAg: historicoDoAg, pedirExclusao: pedirExclusao, marcarLembrado: marcarLembrado, marcarContatado: marcarContatado, marcarCiente: marcarCiente, lerAcerto: lerAcerto, salvarAcerto: salvarAcerto, desfazerAcerto: desfazerAcerto, importarClientes: importarClientes, lerResumo: lerResumo, calcularResumo: calcularResumo, garantirResumos: garantirResumos, prepararLimpeza: prepararLimpeza, traduzir: traduzir
  };
})();
