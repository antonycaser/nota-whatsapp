/**
 * Importar do Google Agenda: transforma eventos que já estão na agenda
 * (marcados antes do CRM) em atendimentos, sem duplicar o evento.
 *
 * 1) imp_previa_   → lê os eventos e sugere cliente, serviço e valor de cada um;
 * 2) imp_importar_ → cria os atendimentos escolhidos, ligados ao MESMO evento.
 */

/** Palavras que não fazem parte do nome da cliente. */
var IMP_IGNORAR = ['make', 'maquiagem', 'makeup', 'maquiar', 'sobrancelha', 'sobrancelhas', 'design', 'henna', 'penteado', 'escova',
  'cilios', 'cilio', 'noiva', 'noivas', 'madrinha', 'madrinhas', 'pacote', 'social', 'brow', 'lamination', 'studio', 'atendimento',
  'cliente', 'sinal', 'pago', 'paga', 'pix', 'r', 'e', 'de', 'da', 'do', 'das', 'dos', 'com', 'para', 'pra', 'no', 'na', 'x', 'teste',
  'formatura', 'casamento', 'festa', 'evento', 'aniversario', 'domicilio', 'hora', 'horario'];

/** Palavra-chave no título → trecho do nome do serviço (do mais específico para o mais geral). */
var IMP_CHAVES = [['henna', 'henna'], ['brow', 'lamination'], ['lamination', 'lamination'], ['cilio', 'cilios'],
  ['escova', 'escova'], ['noiva', 'noiva'], ['madrinha', 'madrinha'], ['penteado', 'penteado'],
  ['sobrancelha', 'sobrancelha'], ['design', 'sobrancelha'], ['maquiagem', 'maquiagem'], ['make', 'maquiagem']];

function norm_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function imp_previa_(p) {
  var c = cfg_();
  if (!c.calendarAtivo) throw erro_('Ative a sincronização com o Google Agenda em Configurações.');
  var cal = cal_();
  if (!cal) throw erro_('Não encontrei a agenda do Google configurada.');
  var ini = /^\d{4}-\d{2}-\d{2}$/.test(p.inicio || '') ? p.inicio : addMeses_(hoje_(), -1);
  var fim = /^\d{4}-\d{2}-\d{2}$/.test(p.fim || '') ? p.fim : addMeses_(hoje_(), 6);
  if (fim < ini) throw erro_('A data final precisa ser depois da inicial.');

  var ligados = {};
  db_all_('Agendamentos').forEach(function (a) { if (a.eventId) ligados[a.eventId] = 1; });
  var clientes = db_all_('Clientes');
  var servicos = db_all_('Servicos').filter(function (s) { return s.ativo !== 'nao'; });

  var evs = cal.getEvents(parseLocal_(ini), new Date(parseLocal_(fim).getTime() + 86400000));
  var out = [], vistos = {};
  evs.forEach(function (ev) {
    var id = ev.getId();
    if (ligados[id] || ev.isAllDayEvent()) return;
    var desc = String((ev.getDescription && ev.getDescription()) || '');
    if (/Criado pelo /.test(desc)) return;                 // evento antigo do próprio CRM
    var recorrente = !!(ev.isRecurringEvent && ev.isRecurringEvent());
    if (recorrente && vistos[id]) return;                   // mostra a repetição só uma vez
    vistos[id] = 1;
    var titulo = String(ev.getTitle() || '');
    var sug = imp_sugerir_(titulo, desc, clientes, servicos);
    out.push({
      eventId: id, titulo: titulo, descricao: desc.slice(0, 300), recorrente: recorrente,
      inicio: fmtLocal_(ev.getStartTime()), fim: fmtLocal_(ev.getEndTime()),
      clienteId: sug.clienteId, clienteNome: sug.clienteNome, nomeNovo: sug.nomeNovo, telefone: sug.telefone,
      servicoIds: sug.servicoIds, valor: sug.valor, provavel: sug.provavel && !recorrente
    });
  });
  out.sort(function (a, b) { return a.inicio < b.inicio ? -1 : 1; });
  return { eventos: out.slice(0, 400), total: out.length, agenda: cal.getName(), inicio: ini, fim: fim };
}

/** Adivinha cliente, serviço e valor a partir do título/descrição do evento. */
function imp_sugerir_(titulo, desc, clientes, servicos) {
  var texto = titulo + ' ' + desc;
  var nt = ' ' + norm_(titulo) + ' ', nx = ' ' + norm_(texto) + ' ';

  // 1) telefone no título/descrição
  var tel = '';
  var mt = texto.match(/(?:\+?55[\s.-]*)?\(?\d{2}\)?[\s.-]*9?[\s.-]*\d{4}[\s.-]?\d{4}/);
  if (mt) { tel = fone_(mt[0]); if (tel.length < 12 || tel.length > 13) tel = ''; }

  // 2) cliente: pelo telefone ou pelo nome
  var cliente = null;
  if (tel) {
    var k = foneChave_(tel);
    cliente = clientes.filter(function (c) { return c.telefone && foneChave_(c.telefone) === k; })[0] || null;
  }
  if (!cliente) {
    var cand = [];
    clientes.forEach(function (c) {
      var n = norm_(c.nome);
      if (!n) return;
      var partes = n.split(' ');
      var score = 0;
      if (nx.indexOf(' ' + n + ' ') >= 0) score = 3;
      else if (partes.length > 1 && nt.indexOf(' ' + partes[0] + ' ') >= 0 && nt.indexOf(' ' + partes[partes.length - 1] + ' ') >= 0) score = 2;
      else if (partes[0].length >= 3 && nt.indexOf(' ' + partes[0] + ' ') >= 0) score = 1;
      if (score) cand.push({ c: c, score: score });
    });
    cand.sort(function (a, b) { return b.score - a.score; });
    var soPrimeiro = cand.filter(function (x) { return x.score === 1; }).length;
    if (cand.length && (cand[0].score >= 2 || soPrimeiro === 1)) cliente = cand[0].c;
  }

  // 3) serviços: nome exato no texto; se não, palavra-chave
  var serv = [];
  servicos.forEach(function (s) { var n = norm_(s.nome); if (n && nx.indexOf(' ' + n + ' ') >= 0) serv.push(s); });
  if (!serv.length) {
    for (var i = 0; i < IMP_CHAVES.length; i++) {
      if (nx.indexOf(' ' + IMP_CHAVES[i][0]) < 0) continue;
      var trecho = IMP_CHAVES[i][1];
      var s = servicos.filter(function (x) { return norm_(x.nome).indexOf(trecho) >= 0; })[0];
      if (s) { serv.push(s); break; }
    }
  }

  // 4) valor escrito no evento (ex.: "R$ 150")
  var valor = null;
  var mv = texto.match(/R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i);
  if (mv) valor = num_(mv[1]);

  // 5) nome para cadastrar uma cliente nova
  var nomeNovo = '';
  if (!cliente) {
    var palavrasServ = {};
    serv.forEach(function (s) { norm_(s.nome).split(' ').forEach(function (w) { palavrasServ[w] = 1; }); });
    var limpo = titulo.replace(/R\$\s*[\d.,]+/g, ' ').replace(/\d+/g, ' ');
    nomeNovo = limpo.split(/[^A-Za-zÀ-ÿ']+/).filter(function (w) {
      var n = norm_(w);
      return n.length > 1 && IMP_IGNORAR.indexOf(n) < 0 && !palavrasServ[n];
    }).slice(0, 4).map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); }).join(' ');
  }

  return {
    clienteId: cliente ? cliente.id : '', clienteNome: cliente ? cliente.nome : '',
    nomeNovo: nomeNovo, telefone: tel, servicoIds: serv.map(function (x) { return x.id; }), valor: valor,
    provavel: !!(cliente || tel || serv.length)
  };
}

/**
 * Cria os atendimentos. p.itens: [{eventId, clienteId | novaCliente{nome,telefone}, servicoIds[], valor, profissionalId}]
 * p.renomear: padroniza o título/descrição do evento no Google Agenda (mantém a descrição original nas observações).
 */
function imp_importar_(p) {
  var cal = cal_();
  if (!cal) throw erro_('Não encontrei a agenda do Google configurada.');
  var ligados = {};
  db_all_('Agendamentos').forEach(function (a) { if (a.eventId) ligados[a.eventId] = 1; });
  var servMap = {};
  db_all_('Servicos').forEach(function (s) { servMap[s.id] = s; });
  var agora = agora_().slice(0, 16);
  var res = { importados: 0, clientesNovas: 0, erros: [] };

  (p.itens || []).slice(0, 40).forEach(function (it) {
    try {
      if (ligados[it.eventId]) return;
      var ev = cal.getEventById(it.eventId);
      if (!ev) throw new Error('evento não encontrado na agenda');
      if (ev.isRecurringEvent && ev.isRecurringEvent()) throw new Error('evento que se repete não pode ser importado');

      var clienteId = it.clienteId;
      if (!clienteId) {
        if (!it.novaCliente || !String(it.novaCliente.nome || '').trim()) throw new Error('informe a cliente');
        clienteId = cli_salvar_({ nome: it.novaCliente.nome, telefone: it.novaCliente.telefone, forcar: true }).id;
        res.clientesNovas++;
      }
      var cli = db_get_('Clientes', clienteId);
      if (!cli) throw new Error('cliente não encontrada');

      var servs = (it.servicoIds || []).map(function (id) { return servMap[id]; }).filter(Boolean).map(function (s) {
        return { id: s.id, nome: s.nome, categoria: s.categoria, preco: num_(s.preco), duracao: num_(s.duracao), cor: s.cor };
      });
      if (!servs.length) throw new Error('escolha o serviço');

      var inicio = fmtLocal_(ev.getStartTime()), fim = fmtLocal_(ev.getEndTime());
      var valor = (it.valor !== null && it.valor !== undefined && it.valor !== '') ? round2_(num_(it.valor))
        : servs.reduce(function (t, s) { return t + s.preco; }, 0);
      var original = String((ev.getDescription && ev.getDescription()) || '').trim();
      var titulo = String(ev.getTitle() || '').trim();
      var localOriginal = String((ev.getLocation && ev.getLocation()) || '').trim();
      var corOriginal = '';
      try { corOriginal = String((ev.getColor && ev.getColor()) || ''); } catch (e) {}
      // tudo o que o evento tinha, para o botão "Desfazer importação" devolver igualzinho
      var origem = JSON.stringify({ titulo: titulo, descricao: original, local: localOriginal, cor: corOriginal });

      var a = db_insert_('Agendamentos', {
        clienteId: cli.id, clienteNome: cli.nome, telefone: cli.telefone,
        servicos: JSON.stringify(servs), servicoNomes: servs.map(function (s) { return s.nome; }).join(' + '),
        profissionalId: it.profissionalId || '', inicio: inicio, fim: fim,
        status: fim <= agora ? 'concluido' : 'agendado',
        valor: valor, desconto: 0, sinal: 0, local: localOriginal || 'Studio',   // mantém o endereço do evento
        observacoes: ('Importado do Google Agenda: "' + titulo + '"' + (original ? '\n' + original : '')).slice(0, 3000),
        eventId: it.eventId, syncStatus: 'ok', origem: origem
      });
      if (p.renomear !== false) ag_sync_(a);
      ligados[it.eventId] = 1;
      res.importados++;
    } catch (e) {
      res.erros.push({ eventId: it.eventId, erro: String(e.message || e) });
    }
  });
  return res;
}

/**
 * Desfaz a importação de um atendimento: devolve o evento do Google Agenda
 * exatamente como estava (título, descrição, endereço e cor) e tira o
 * atendimento do CRM — SEM apagar o evento.
 */
function imp_desfazer_(p) {
  var a = db_get_('Agendamentos', p.id);
  if (!a) throw erro_('Agendamento não encontrado.');
  var o = json_(a.origem, null);
  if (!o) throw erro_('Este atendimento não veio do Google Agenda.');
  if (a.eventId) {
    var ev = null;
    try { ev = cal_().getEventById(a.eventId); } catch (e) {}
    if (ev) {
      ev.setTitle(o.titulo || '');
      ev.setDescription(o.descricao || '');
      ev.setLocation(o.local || '');
      if (o.cor) { try { ev.setColor(o.cor); } catch (e) {} }
    }
  }
  ag_tratarFinanceiro_(a.id, 'remover');
  db_delete_('Agendamentos', a.id);
  return true;
}
