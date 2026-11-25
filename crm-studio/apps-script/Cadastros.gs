/**
 * Cadastros: Clientes, Serviços e Equipe (profissionais).
 */

/* ------------------------- Clientes ------------------------- */

function cli_listar_(p) {
  var clientes = db_all_('Clientes');
  var stats = {};
  db_all_('Agendamentos').forEach(function (a) {
    var s = stats[a.clienteId] || (stats[a.clienteId] = { visitas: 0, total: 0, ultima: '', proxima: '', faltas: 0 });
    if (a.status === 'concluido') {
      s.visitas++;
      s.total += num_(a.valor) - num_(a.desconto);
      if (a.inicio > s.ultima) s.ultima = a.inicio;
    } else if (a.status === 'faltou') s.faltas++;
    else if (a.status !== 'cancelado' && a.inicio >= agora_().slice(0, 16)) {
      if (!s.proxima || a.inicio < s.proxima) s.proxima = a.inicio;
    }
  });
  return clientes.map(function (c) {
    var s = stats[c.id] || { visitas: 0, total: 0, ultima: '', proxima: '', faltas: 0 };
    c.visitas = s.visitas; c.totalGasto = round2_(s.total); c.ultimaVisita = s.ultima;
    c.proxima = s.proxima; c.faltas = s.faltas;
    return c;
  }).sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
}

function cli_obter_(p) {
  var c = db_get_('Clientes', p.id);
  if (!c) throw erro_('Cliente não encontrada.');
  var equipe = {};
  db_all_('Profissionais').forEach(function (x) { equipe[x.id] = x.nome; });
  var hist = db_all_('Agendamentos').filter(function (a) { return a.clienteId === c.id; })
    .sort(function (a, b) { return a.inicio < b.inicio ? 1 : -1; })
    .map(function (a) {
      return { id: a.id, inicio: a.inicio, servicoNomes: a.servicoNomes, status: a.status,
        valor: num_(a.valor) - num_(a.desconto), profissional: equipe[a.profissionalId] || '' };
    });
  var msgs = db_all_('Mensagens').filter(function (m) { return m.clienteId === c.id; })
    .sort(function (a, b) { return a.data < b.data ? 1 : -1; }).slice(0, 30);
  var concl = hist.filter(function (h) { return h.status === 'concluido'; });
  var total = concl.reduce(function (s, h) { return s + h.valor; }, 0);
  c.resumo = {
    visitas: concl.length,
    totalGasto: round2_(total),
    ticketMedio: concl.length ? round2_(total / concl.length) : 0,
    ultimaVisita: concl.length ? concl[0].inicio : '',
    faltas: hist.filter(function (h) { return h.status === 'faltou'; }).length,
    cancelamentos: hist.filter(function (h) { return h.status === 'cancelado'; }).length
  };
  c.historico = hist;
  c.mensagens = msgs;
  return c;
}

function cli_salvar_(p) {
  var nome = String(p.nome || '').trim();
  if (!nome) throw erro_('Informe o nome da cliente.');
  var tel = fone_(p.telefone);
  if (tel && (tel.length < 12 || tel.length > 13)) throw erro_('Telefone inválido. Use DDD + número, ex.: (11) 98765-4321');
  if (tel) {
    var k = foneChave_(tel);
    var dup = db_all_('Clientes').filter(function (c) { return c.id !== p.id && c.telefone && foneChave_(c.telefone) === k; })[0];
    if (dup && !p.forcar) throw erro_('Já existe uma cliente com esse telefone: ' + dup.nome, { duplicada: dup.id });
  }
  var campos = ['email', 'nascimento', 'instagram', 'origem', 'tags', 'tipoPele', 'tomBase', 'alergias',
    'sobrancelha', 'anamnese', 'observacoes'];
  var dados = { nome: nome, telefone: tel };
  campos.forEach(function (k) { if (p[k] !== undefined) dados[k] = String(p[k] || '').trim(); });

  var r;
  if (p.id) {
    var antigo = db_get_('Clientes', p.id);
    r = db_update_('Clientes', p.id, dados);
    if (antigo && (antigo.nome !== nome || antigo.telefone !== tel)) {
      db_all_('Agendamentos').forEach(function (a) {
        if (a.clienteId === p.id) db_update_('Agendamentos', a.id, { clienteNome: nome, telefone: tel });
      });
    }
  } else {
    r = db_insert_('Clientes', dados);
  }
  return { id: r.id, nome: r.nome, telefone: r.telefone, nascimento: r.nascimento };
}

function cli_excluir_(p) {
  var futuros = db_all_('Agendamentos').filter(function (a) {
    return a.clienteId === p.id && a.status !== 'cancelado' && a.status !== 'concluido' && a.inicio >= agora_().slice(0, 16);
  });
  if (futuros.length) throw erro_('Essa cliente tem horários futuros. Cancele-os antes de excluir.');
  db_delete_('Clientes', p.id);
  return true;
}

/* ------------------------- Serviços ------------------------- */

function srv_seed_() {
  if (db_all_('Servicos').length) return;
  [
    ['Maquiagem social', 'Maquiagem', 60, 180, '#0f7f7c'],
    ['Maquiagem para madrinha', 'Maquiagem', 75, 220, '#0f7f7c'],
    ['Maquiagem de noiva', 'Noivas & Eventos', 120, 650, '#6a4ce2'],
    ['Design de sobrancelha', 'Sobrancelha', 30, 50, '#9c8074'],
    ['Design com henna', 'Sobrancelha', 45, 70, '#9c8074'],
    ['Brow lamination', 'Sobrancelha', 60, 150, '#9c8074'],
    ['Penteado social', 'Penteado', 60, 160, '#e06a3a'],
    ['Penteado de noiva', 'Noivas & Eventos', 90, 450, '#6a4ce2'],
    ['Escova modelada', 'Penteado', 45, 90, '#e06a3a'],
    ['Cílios fio a fio', 'Cílios', 120, 180, '#257de0'],
    ['Pacote Make + Penteado', 'Noivas & Eventos', 120, 320, '#6a4ce2']
  ].forEach(function (s) {
    db_insert_('Servicos', { nome: s[0], categoria: s[1], duracao: s[2], preco: s[3], custo: 0, cor: s[4], ativo: 'sim' });
  });
}

function srv_salvar_(p) {
  if (!String(p.nome || '').trim()) throw erro_('Informe o nome do serviço.');
  var dados = {
    nome: String(p.nome).trim(), categoria: p.categoria || 'Outros',
    duracao: Math.max(5, Math.round(num_(p.duracao) || 60)), preco: round2_(num_(p.preco)),
    custo: round2_(num_(p.custo)), cor: p.cor || '#0f7f7c', descricao: p.descricao || '',
    ativo: p.ativo === 'nao' ? 'nao' : 'sim'
  };
  var r = p.id ? db_update_('Servicos', p.id, dados) : db_insert_('Servicos', dados);
  return r;
}

function srv_excluir_(p) {
  var usado = db_all_('Agendamentos').some(function (a) { return String(a.servicos).indexOf(p.id) >= 0; });
  if (usado) { db_update_('Servicos', p.id, { ativo: 'nao' }); return { desativado: true }; }
  db_delete_('Servicos', p.id);
  return { excluido: true };
}

/* ------------------------- Equipe ------------------------- */

function prof_salvar_(p) {
  if (!String(p.nome || '').trim()) throw erro_('Informe o nome da profissional.');
  var dados = {
    nome: String(p.nome).trim(), telefone: fone_(p.telefone),
    comissao: Math.min(100, Math.max(0, num_(p.comissao))), cor: p.cor || '#9c8074',
    ativo: p.ativo === 'nao' ? 'nao' : 'sim'
  };
  return p.id ? db_update_('Profissionais', p.id, dados) : db_insert_('Profissionais', dados);
}

function prof_excluir_(p) {
  var usado = db_all_('Agendamentos').some(function (a) { return a.profissionalId === p.id; });
  if (usado) { db_update_('Profissionais', p.id, { ativo: 'nao' }); return { desativado: true }; }
  db_delete_('Profissionais', p.id);
  return { excluido: true };
}
