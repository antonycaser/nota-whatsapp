/**
 * Painel (dashboard) e relatórios gerenciais/financeiros.
 * Receitas e despesas seguem o regime de caixa (o que foi PAGO na data).
 * Indicadores de serviços usam os atendimentos CONCLUÍDOS no período.
 */

var MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function liquido_(a) { return num_(a.valor) - num_(a.desconto); }

function dash_get_(p, sess) {
  var mes = /^\d{4}-\d{2}$/.test(p.mes || '') ? p.mes : hoje_().slice(0, 7);
  var ini = mes + '-01', prox = addMeses_(ini, 1), iniAnt = addMeses_(ini, -1);
  var hoje = hoje_(), agora = agora_().slice(0, 16);
  var c = cfg_();
  var admin = sess.perfil === 'admin';

  var fin = db_all_('Financeiro');
  var ags = db_all_('Agendamentos');
  var clientes = db_all_('Clientes');

  function somaFin(tipo, de, ate) {
    return round2_(fin.reduce(function (s, l) {
      return s + (l.tipo === tipo && l.status === 'pago' && l.data >= de && l.data < ate ? num_(l.valor) : 0);
    }, 0));
  }

  var doMes = ags.filter(function (a) { return a.inicio >= ini && a.inicio < prox; });
  var concl = doMes.filter(function (a) { return a.status === 'concluido'; });
  var fatServ = concl.reduce(function (s, a) { return s + liquido_(a); }, 0);
  var faltas = doMes.filter(function (a) { return a.status === 'faltou'; }).length;
  var cancel = doMes.filter(function (a) { return a.status === 'cancelado'; }).length;

  var receita = somaFin('receita', ini, prox), despesa = somaFin('despesa', ini, prox);
  var receitaAnt = somaFin('receita', iniAnt, ini);

  // Série dos últimos 6 meses
  var serie = [];
  for (var i = 5; i >= 0; i--) {
    var m0 = addMeses_(ini, -i), m1 = addMeses_(m0, 1);
    serie.push({ mes: m0.slice(0, 7), rotulo: MESES_ABREV[Number(m0.slice(5, 7)) - 1] + '/' + m0.slice(2, 4),
      receitas: somaFin('receita', m0, m1), despesas: somaFin('despesa', m0, m1) });
  }

  // Top serviços do mês (concluídos + agendados ativos)
  var porServ = {};
  doMes.filter(function (a) { return a.status !== 'cancelado' && a.status !== 'faltou'; }).forEach(function (a) {
    json_(a.servicos, []).forEach(function (s) {
      var x = porServ[s.nome] || (porServ[s.nome] = { nome: s.nome, qtd: 0, valor: 0, categoria: s.categoria });
      x.qtd++; x.valor += num_(s.preco);
    });
  });
  var topServicos = Object.keys(porServ).map(function (k) { return porServ[k]; })
    .sort(function (a, b) { return b.qtd - a.qtd || b.valor - a.valor; }).slice(0, 6);

  // Hoje e próximos 7 dias
  var hojeLista = ag_listar_({ inicio: hoje, fim: hoje }).agendamentos;
  var em7 = addMin_(hoje + 'T00:00', 8 * 24 * 60).slice(0, 10);
  var proximos = ags.filter(function (a) {
    return STATUS_ATIVOS.indexOf(a.status) >= 0 && a.inicio >= agora && a.inicio.slice(0, 10) < em7;
  }).length;
  var naoConfirmados = ags.filter(function (a) {
    return a.status === 'agendado' && a.inicio >= agora && a.inicio.slice(0, 10) < em7;
  }).length;

  // Aniversariantes do mês
  var mm = mes.slice(5, 7);
  var aniversariantes = clientes.filter(function (cl) { return cl.nascimento && cl.nascimento.slice(5, 7) === mm; })
    .map(function (cl) { return { id: cl.id, nome: cl.nome, telefone: cl.telefone, dia: cl.nascimento.slice(8, 10),
      hoje: cl.nascimento.slice(5) === hoje.slice(5) }; })
    .sort(function (a, b) { return a.dia < b.dia ? -1 : 1; });

  // Clientes para reativar
  var ultima = {}, futura = {};
  ags.forEach(function (a) {
    if (a.status === 'concluido' && (!ultima[a.clienteId] || a.inicio > ultima[a.clienteId])) ultima[a.clienteId] = a.inicio;
    if (STATUS_ATIVOS.indexOf(a.status) >= 0 && a.inicio >= agora) futura[a.clienteId] = true;
  });
  var limite = addMin_(hoje + 'T00:00', -num_(c.diasInativa || 60) * 24 * 60);
  var inativas = clientes.filter(function (cl) { return ultima[cl.id] && ultima[cl.id] < limite && !futura[cl.id]; })
    .map(function (cl) {
      return { id: cl.id, nome: cl.nome, telefone: cl.telefone, ultimaVisita: ultima[cl.id].slice(0, 10),
        dias: Math.floor(diffMin_(ultima[cl.id].slice(0, 16), hoje + 'T00:00') / 1440) };
    }).sort(function (a, b) { return a.dias - b.dias; }).slice(0, 8);

  var remarcar = ags.filter(function (a) { return a.status === 'remarcar'; }).map(function (a) {
    return { id: a.id, clienteNome: a.clienteNome, telefone: a.telefone, inicio: a.inicio.slice(0, 16), servicoNomes: a.servicoNomes };
  });

  var aReceber = fin.filter(function (l) { return l.tipo === 'receita' && l.status === 'pendente'; });
  var aPagar = fin.filter(function (l) { return l.tipo === 'despesa' && l.status === 'pendente' && (l.vencimento || l.data) < prox; });

  var out = {
    mes: mes,
    atendimentos: concl.length,
    agendadosMes: doMes.filter(function (a) { return a.status !== 'cancelado'; }).length,
    ticketMedio: concl.length ? round2_(fatServ / concl.length) : 0,
    taxaFaltas: doMes.length ? Math.round((faltas / doMes.length) * 1000) / 10 : 0,
    faltas: faltas, cancelamentos: cancel,
    novasClientes: clientes.filter(function (cl) { return cl.criadoEm >= ini && cl.criadoEm < prox; }).length,
    totalClientes: clientes.length,
    hoje: hojeLista, proximos7: proximos, naoConfirmados: naoConfirmados,
    topServicos: topServicos, aniversariantes: aniversariantes, inativas: inativas, remarcar: remarcar
  };
  if (admin) {
    out.receita = receita; out.despesa = despesa; out.lucro = round2_(receita - despesa);
    out.receitaAnterior = receitaAnt;
    out.variacao = receitaAnt ? Math.round(((receita - receitaAnt) / receitaAnt) * 1000) / 10 : null;
    out.aReceber = round2_(aReceber.reduce(function (s, l) { return s + num_(l.valor); }, 0));
    out.aReceberQtd = aReceber.length;
    out.aPagar = round2_(aPagar.reduce(function (s, l) { return s + num_(l.valor); }, 0));
    out.aPagarQtd = aPagar.length;
    out.serie = serie;
  }
  return out;
}

/** Relatório completo do período p.inicio..p.fim (yyyy-MM-dd, inclusivo). */
function rel_get_(p) {
  var ini = String(p.inicio || hoje_().slice(0, 8) + '01').slice(0, 10);
  var fim = String(p.fim || hoje_()).slice(0, 10);
  if (fim < ini) throw erro_('A data final precisa ser depois da inicial.');
  var dentro = function (d) { d = String(d).slice(0, 10); return d >= ini && d <= fim; };

  var fin = db_all_('Financeiro');
  var ags = db_all_('Agendamentos').filter(function (a) { return dentro(a.inicio); });
  var clientes = db_all_('Clientes');
  var equipe = db_all_('Profissionais');
  var nomeCli = {};
  clientes.forEach(function (c) { nomeCli[c.id] = c.nome; });

  // DRE simplificada (caixa)
  var pagos = fin.filter(function (l) { return l.status === 'pago' && dentro(l.data); });
  var recCat = {}, despCat = {}, formas = {}, porDia = {};
  var receitas = 0, despesas = 0;
  var dias = Math.round(diffMin_(ini + 'T00:00', fim + 'T00:00') / 1440) + 1;
  var agruparMes = dias > 62;
  pagos.forEach(function (l) {
    var v = num_(l.valor);
    var chave = agruparMes ? l.data.slice(0, 7) : l.data;
    var d = porDia[chave] || (porDia[chave] = { receitas: 0, despesas: 0 });
    if (l.tipo === 'receita') {
      receitas += v; recCat[l.categoria] = (recCat[l.categoria] || 0) + v;
      var f = l.forma || 'Não informado'; formas[f] = (formas[f] || 0) + v;
      d.receitas += v;
    } else {
      despesas += v; despCat[l.categoria] = (despCat[l.categoria] || 0) + v; d.despesas += v;
    }
  });
  function lista(obj, total) {
    return Object.keys(obj).map(function (k) {
      return { nome: k, valor: round2_(obj[k]), pct: total ? Math.round(obj[k] / total * 1000) / 10 : 0 };
    }).sort(function (a, b) { return b.valor - a.valor; });
  }

  // Linha do tempo preenchida (inclui dias sem movimento)
  var timeline = [];
  if (agruparMes) {
    for (var m = ini.slice(0, 7) + '-01'; m <= fim; m = addMeses_(m, 1)) {
      var k = m.slice(0, 7); var x = porDia[k] || { receitas: 0, despesas: 0 };
      timeline.push({ chave: k, rotulo: MESES_ABREV[Number(k.slice(5, 7)) - 1] + '/' + k.slice(2, 4), receitas: round2_(x.receitas), despesas: round2_(x.despesas) });
    }
  } else {
    for (var dd = ini; dd <= fim; dd = addMin_(dd + 'T12:00', 1440).slice(0, 10)) {
      var y = porDia[dd] || { receitas: 0, despesas: 0 };
      timeline.push({ chave: dd, rotulo: dd.slice(8, 10) + '/' + dd.slice(5, 7), receitas: round2_(y.receitas), despesas: round2_(y.despesas) });
    }
  }

  // Atendimentos
  var concl = ags.filter(function (a) { return a.status === 'concluido'; });
  var fatServicos = concl.reduce(function (s, a) { return s + liquido_(a); }, 0);
  var porServ = {}, porCat = {}, porProf = {}, porCli = {}, semana = [0, 0, 0, 0, 0, 0, 0], horas = {};
  concl.forEach(function (a) {
    var servs = json_(a.servicos, []);
    var bruto = servs.reduce(function (s, x) { return s + num_(x.preco); }, 0) || 1;
    var liq = liquido_(a);
    servs.forEach(function (s) {
      var parte = servs.length === 1 ? liq : liq * (num_(s.preco) / bruto);
      var x = porServ[s.nome] || (porServ[s.nome] = { nome: s.nome, categoria: s.categoria, qtd: 0, valor: 0 });
      x.qtd++; x.valor += parte;
      porCat[s.categoria || 'Outros'] = (porCat[s.categoria || 'Outros'] || 0) + parte;
    });
    var pid = a.profissionalId || '_';
    var pr = porProf[pid] || (porProf[pid] = { qtd: 0, valor: 0 });
    pr.qtd++; pr.valor += liq;
    var cl = porCli[a.clienteId] || (porCli[a.clienteId] = { qtd: 0, valor: 0 });
    cl.qtd++; cl.valor += liq;
    semana[parseLocal_(a.inicio).getDay()]++;
    var h = a.inicio.slice(11, 13); horas[h] = (horas[h] || 0) + 1;
  });

  var servicos = Object.keys(porServ).map(function (k) {
    var s = porServ[k];
    return { nome: s.nome, categoria: s.categoria, qtd: s.qtd, valor: round2_(s.valor), ticket: round2_(s.valor / s.qtd),
      pct: fatServicos ? Math.round(s.valor / fatServicos * 1000) / 10 : 0 };
  }).sort(function (a, b) { return b.valor - a.valor; });

  var equipeRel = Object.keys(porProf).map(function (id) {
    var pr = equipe.filter(function (e) { return e.id === id; })[0];
    var com = pr ? num_(pr.comissao) : 0;
    return { nome: pr ? pr.nome : 'Sem profissional definida', qtd: porProf[id].qtd, valor: round2_(porProf[id].valor),
      comissaoPct: com, comissao: round2_(porProf[id].valor * com / 100) };
  }).sort(function (a, b) { return b.valor - a.valor; });

  var topClientes = Object.keys(porCli).map(function (id) {
    return { nome: nomeCli[id] || '(removida)', qtd: porCli[id].qtd, valor: round2_(porCli[id].valor) };
  }).sort(function (a, b) { return b.valor - a.valor; }).slice(0, 10);

  var status = {};
  ags.forEach(function (a) { status[a.status] = (status[a.status] || 0) + 1; });

  var aReceber = fin.filter(function (l) { return l.tipo === 'receita' && l.status === 'pendente'; })
    .reduce(function (s, l) { return s + num_(l.valor); }, 0);
  var aPagar = fin.filter(function (l) { return l.tipo === 'despesa' && l.status === 'pendente' && String(l.vencimento || l.data) <= fim; })
    .reduce(function (s, l) { return s + num_(l.valor); }, 0);

  var atendidas = {};
  concl.forEach(function (a) { atendidas[a.clienteId] = 1; });

  return {
    inicio: ini, fim: fim, agrupadoPorMes: agruparMes,
    resumo: {
      receitas: round2_(receitas), despesas: round2_(despesas), lucro: round2_(receitas - despesas),
      margem: receitas ? Math.round((receitas - despesas) / receitas * 1000) / 10 : 0,
      atendimentos: concl.length, faturamentoServicos: round2_(fatServicos),
      ticketMedio: concl.length ? round2_(fatServicos / concl.length) : 0,
      clientesAtendidas: Object.keys(atendidas).length,
      novasClientes: clientes.filter(function (c) { return dentro(c.criadoEm); }).length,
      faltas: status.faltou || 0, cancelamentos: status.cancelado || 0,
      taxaFaltas: ags.length ? Math.round(((status.faltou || 0) / ags.length) * 1000) / 10 : 0,
      aReceber: round2_(aReceber), aPagar: round2_(aPagar),
      comissoes: round2_(equipeRel.reduce(function (s, e) { return s + e.comissao; }, 0))
    },
    receitasPorCategoria: lista(recCat, receitas),
    despesasPorCategoria: lista(despCat, despesas),
    formasPagamento: lista(formas, receitas),
    timeline: timeline,
    servicos: servicos,
    categorias: lista(porCat, fatServicos),
    equipe: equipeRel,
    topClientes: topClientes,
    status: status,
    diasSemana: semana,
    horarios: Object.keys(horas).sort().map(function (h) { return { hora: h + 'h', qtd: horas[h] }; })
  };
}
