/* =========================================================
   CONFIGURAÇÃO DO SISTEMA: BoosterAgenda
   ========================================================= */
window.APP = {
  id: "boosteragenda",
  nome: "Booster",
  sufixo: "Agenda",
  letra: "",
  icone: "calendario",
  versao: "1.1.0",

  // Coleções do banco na nuvem (Firestore) que entram no backup.
  tabelas: ["servicos", "clientes", "agendamentos", "bloqueios"],

  // Backup automático em pasta: no máximo 1 a cada X minutos (cada backup lê tudo da nuvem).
  backupIntervaloMin: 30,

  // Projeto Firebase central da Sitebooster (estas chaves são públicas por natureza;
  // quem protege os dados são as regras em firestore.rules).
  firebase: {
    apiKey: "AIzaSyAghjObn_15R9TKPUTcAVlNgny5hPFpX2U",
    authDomain: "booster-agenda.firebaseapp.com",
    projectId: "booster-agenda",
    storageBucket: "booster-agenda.firebasestorage.app",
    messagingSenderId: "72374415414",
    appId: "1:72374415414:web:b1cc83cecaeb846f3ae897"
  },

  // Robô (Cloudflare): pagamentos da Kiwify, limpeza diária e números da Central
  robo: "https://booster-agenda-robo.sitebooster.workers.dev",

  // E-mail de suporte da Sitebooster (aparece no app, nos Termos e no cancelamento)
  suporte: "siteboostersolucoesdigitais@gmail.com",

  // Links de checkout da Kiwify (assinatura mensal de cada plano). Preencher quando os produtos forem criados.
  checkout: { essencial: "https://pay.kiwify.com.br/HOxYbUy", equipe: "https://pay.kiwify.com.br/J1g27mh", salao: "https://pay.kiwify.com.br/PR4ThgZ" },

  // Página pública de agendamento. Vazio = mesma pasta do app (marcar.html).
  // Quando publicar, pode ficar: "https://www.sitebooster.com.br/agenda/app/marcar.html"
  urlPublica: "",

  // Links do ecossistema
  site: "https://www.sitebooster.com.br",
  paginaVendas: "https://www.sitebooster.com.br/agenda/",
  instagram: "boosterpdv",

  // Sem "modo desenvolvimento" aqui: a licença é conferida pelo banco (coleção "licencas").
  modoDesenvolvimento: false
};
