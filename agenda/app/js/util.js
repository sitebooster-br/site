/* Funções de apoio usadas pelo app e pela página pública (datas, horários, WhatsApp). */
window.U = (function () {
  "use strict";
  var GRADE = 5; // minutos: a agenda é dividida em blocos de 5 min (encaixe fino com intervalo e atrasos) para evitar dois clientes no mesmo horário

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function hojeISO() { return isoDe(new Date()); }
  function isoDe(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function dataDe(iso) { var p = iso.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function somaDias(iso, n) { var d = dataDe(iso); d.setDate(d.getDate() + n); return isoDe(d); }
  function diaSemana(iso) { return dataDe(iso).getDay(); } // 0 = domingo
  function min(hhmm) { if (!hhmm) return 0; var p = hhmm.split(":"); return (+p[0]) * 60 + (+p[1]); }
  function hhmm(m) { return pad(Math.floor(m / 60)) + ":" + pad(m % 60); }
  function inicioSemana(iso) { var d = diaSemana(iso); return somaDias(iso, d === 0 ? -6 : 1 - d); } // segunda-feira

  var DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  var DIAS_C = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  var MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  function dataLonga(iso) { var d = dataDe(iso); return DIAS[d.getDay()] + ", " + d.getDate() + " de " + MESES[d.getMonth()]; }
  function dataCurta(iso) { var d = dataDe(iso); return pad(d.getDate()) + "/" + pad(d.getMonth() + 1); }
  function dataBR(iso) { var d = dataDe(iso); return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear(); }
  function quandoTexto(iso) {
    var h = hojeISO();
    if (iso === h) return "hoje";
    if (iso === somaDias(h, 1)) return "amanhã";
    return DIAS[diaSemana(iso)].toLowerCase() + " (" + dataCurta(iso) + ")";
  }

  // Blocos de 15 min ocupados por um horário de um profissional:
  // ["prof1_2026-11-12_0900", "prof1_2026-11-12_0915", ...]
  function slots(data, inicio, fim, profId) {
    var a = Math.floor(min(inicio) / GRADE) * GRADE, b = Math.ceil(min(fim) / GRADE) * GRADE, out = [];
    var pre = profId ? profId + "_" : "";
    for (var m = a; m < b; m += GRADE) out.push(pre + data + "_" + pad(Math.floor(m / 60)) + pad(m % 60));
    return out;
  }
  function sobrepoe(a1, a2, b1, b2) { return min(a1) < min(b2) && min(b1) < min(a2); }

  // WhatsApp
  function soDigitos(t) { return String(t || "").replace(/\D/g, ""); }
  function zap(t) { var d = soDigitos(t); if (d.length === 10 || d.length === 11) d = "55" + d; return d; }
  function linkZap(numero, texto) { return "https://wa.me/" + zap(numero) + (texto ? "?text=" + encodeURIComponent(texto) : ""); }
  function foneBonito(t) {
    var d = soDigitos(t); if (d.length > 11 && d.indexOf("55") === 0) d = d.slice(2);
    if (d.length === 11) return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
    if (d.length === 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
    return t || "";
  }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function brl(v) { return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
  function duracaoTexto(m) { m = Number(m) || 0; var h = Math.floor(m / 60), r = m % 60; return h ? h + "h" + (r ? pad(r) : "") : r + " min"; }
  function codigo(n) {
    var c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789", out = "", r = new Uint32Array(n || 20);
    crypto.getRandomValues(r);
    for (var i = 0; i < r.length; i++) out += c[r[i] % c.length];
    return out;
  }
  function slugify(t) {
    return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  }

  // Horários livres de um dia para a página pública
  // horario = { ativo, abre, fecha, pausaIni, pausaFim }, ocupados = Set de ids de blocos, bloqueios = [{data,inicio,fim,diaInteiro}]
  function horariosLivres(opts) {
    var h = opts.horario; if (!h || !h.ativo) return [];
    var dur = Number(opts.duracao) || 30, passo = dur % 30 === 0 ? 30 : 15;
    var abre = min(h.abre), fecha = min(h.fecha), out = [];
    var agora = new Date(), limite = -1;
    if (opts.data === hojeISO()) limite = agora.getHours() * 60 + agora.getMinutes() + (Number(opts.antecedenciaHoras) || 0) * 60;
    else if (opts.data < hojeISO()) return [];
    // Horários "redondos" + encaixes logo depois de um horário ocupado (fim + folga), de 5 em 5 min
    var cand = {};
    for (var m0 = abre; m0 + dur <= fecha; m0 += passo) cand[m0] = 1;
    var pre = opts.profId ? opts.profId + "_" : "";
    for (var t = abre + GRADE; t + dur <= fecha; t += GRADE) {
      var antes = pre + opts.data + "_" + pad(Math.floor((t - GRADE) / 60)) + pad((t - GRADE) % 60);
      var agora_ = pre + opts.data + "_" + pad(Math.floor(t / 60)) + pad(t % 60);
      if (opts.ocupados.has(antes) && !opts.ocupados.has(agora_)) cand[t] = 1;
    }
    if (limite > abre) { var lm = Math.ceil(limite / GRADE) * GRADE; if (lm % passo !== 0 && lm + dur <= fecha) cand[lm] = 1; }
    var lista = Object.keys(cand).map(Number).sort(function (a, b) { return a - b; });
    for (var k = 0; k < lista.length; k++) {
      var m = lista[k];
      if (m < limite) continue;
      var ini = hhmm(m), fim = hhmm(m + dur);
      if (h.pausaIni && h.pausaFim && sobrepoe(ini, fim, h.pausaIni, h.pausaFim)) continue;
      var bloq = (opts.bloqueios || []).some(function (b) { return b.data === opts.data && (b.diaInteiro || sobrepoe(ini, fim, b.inicio, b.fim)); });
      if (bloq) continue;
      // Intervalo entre atendimentos: a folga depois do serviço também precisa estar livre
      var fimFolga = hhmm(Math.min(m + dur + (Number(opts.folga) || 0), 24 * 60 - 1));
      var livre = slots(opts.data, ini, fimFolga, opts.profId).every(function (s) { return !opts.ocupados.has(s); });
      if (livre) out.push(ini);
    }
    return out;
  }

  return {
    GRADE: GRADE, pad: pad, hojeISO: hojeISO, isoDe: isoDe, dataDe: dataDe, somaDias: somaDias, diaSemana: diaSemana,
    min: min, hhmm: hhmm, inicioSemana: inicioSemana, DIAS: DIAS, DIAS_C: DIAS_C, MESES: MESES,
    dataLonga: dataLonga, dataCurta: dataCurta, dataBR: dataBR, quandoTexto: quandoTexto,
    slots: slots, sobrepoe: sobrepoe, soDigitos: soDigitos, zap: zap, linkZap: linkZap, foneBonito: foneBonito,
    esc: esc, brl: brl, duracaoTexto: duracaoTexto, slugify: slugify, codigo: codigo, horariosLivres: horariosLivres
  };
})();
