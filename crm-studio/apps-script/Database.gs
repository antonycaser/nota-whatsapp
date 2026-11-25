/**
 * Camada de dados — cada "tabela" é uma aba da planilha.
 * A 1ª linha guarda os nomes dos campos. Você pode reordenar colunas
 * ou adicionar colunas extras na planilha sem quebrar o sistema.
 */

var SCHEMA = {
  Clientes: ['id', 'nome', 'telefone', 'email', 'nascimento', 'instagram', 'origem', 'tags',
    'tipoPele', 'tomBase', 'alergias', 'sobrancelha', 'anamnese', 'observacoes', 'criadoEm', 'atualizadoEm'],
  Servicos: ['id', 'nome', 'categoria', 'duracao', 'preco', 'custo', 'cor', 'descricao', 'ativo'],
  Profissionais: ['id', 'nome', 'telefone', 'comissao', 'cor', 'ativo'],
  Agendamentos: ['id', 'clienteId', 'clienteNome', 'telefone', 'servicos', 'servicoNomes', 'profissionalId',
    'inicio', 'fim', 'status', 'valor', 'desconto', 'sinal', 'local', 'observacoes',
    'eventId', 'syncStatus', 'confirmEnviada', 'lembrete1Enviado', 'lembrete2Enviado', 'posEnviado',
    'formaPagamento', 'lancamentoId', 'criadoEm', 'atualizadoEm'],
  Financeiro: ['id', 'data', 'tipo', 'categoria', 'descricao', 'valor', 'forma', 'status', 'vencimento',
    'agendamentoId', 'clienteId', 'profissionalId', 'criadoEm'],
  Mensagens: ['id', 'data', 'tipo', 'direcao', 'clienteId', 'agendamentoId', 'telefone', 'mensagem', 'status', 'detalhe'],
  Usuarios: ['id', 'nome', 'usuario', 'perfil', 'hash', 'salt', 'ativo', 'trocarSenha', 'ultimoAcesso', 'criadoEm']
};

var NUMERICOS = {
  Servicos: ['duracao', 'preco', 'custo'],
  Profissionais: ['comissao'],
  Agendamentos: ['valor', 'desconto', 'sinal'],
  Financeiro: ['valor']
};

/** Campos só-data (yyyy-MM-dd). Os demais campos de data guardam data+hora. */
var CAMPOS_DATA = ['nascimento', 'data', 'vencimento'];

var _ss = null;
var _memo = {};

/*
 * CACHE DAS ABAS: ler a planilha é a parte mais lenta. As abas abaixo ficam
 * guardadas no cache do Google por alguns minutos e são invalidadas sempre que
 * o CRM grava algo nelas (contador de geração em DB_GEN). Gravações sempre
 * leem a planilha "ao vivo". Se você editar a planilha à mão, a mudança pode
 * levar até CACHE_SEG segundos para aparecer no portal.
 */
var CACHE_TABELAS = { Clientes: 1, Servicos: 1, Profissionais: 1, Agendamentos: 1, Financeiro: 1, Usuarios: 1 };
var CACHE_SEG = 300;
var CACHE_PEDACO = 40000;
var _gen = null;

function db_gen_() {
  if (!_gen) _gen = json_(PropertiesService.getScriptProperties().getProperty('DB_GEN'), {}) || {};
  return _gen;
}

function db_bump_(tabela) {
  if (!CACHE_TABELAS[tabela]) return;
  var props = PropertiesService.getScriptProperties();
  var g = json_(props.getProperty('DB_GEN'), {}) || {};
  g[tabela] = (g[tabela] || 0) + 1;
  props.setProperty('DB_GEN', JSON.stringify(g));
  _gen = g;
}

function db_cacheChave_(tabela) { return 'tb_' + APP_VERSAO + '_' + tabela; }

function db_cacheLer_(tabela) {
  if (!CACHE_TABELAS[tabela]) return null;
  try {
    var c = CacheService.getScriptCache();
    var base = db_cacheChave_(tabela);
    var meta = json_(c.get(base), null);
    if (!meta || meta.g !== (db_gen_()[tabela] || 0)) return null;
    var keys = [];
    for (var i = 0; i < meta.n; i++) keys.push(base + '_' + meta.id + '_' + i);
    var got = c.getAll(keys), s = '';
    for (var j = 0; j < keys.length; j++) {
      if (got[keys[j]] === null || got[keys[j]] === undefined) return null;
      s += got[keys[j]];
    }
    var d = JSON.parse(s);
    var objs = d.r.map(function (row) {
      var o = {};
      for (var k = 0; k < d.h.length; k++) o[d.h[k]] = row[k];
      return o;
    });
    return { sh: null, header: d.hd, objs: objs };
  } catch (e) { return null; }
}

function db_cacheGravar_(tabela, t, g) {
  try {
    var chaves = t.header.filter(String).concat(['_row']);
    var s = JSON.stringify({ hd: t.header, h: chaves, r: t.objs.map(function (o) { return chaves.map(function (k) { return o[k]; }); }) });
    if (s.length > 2000000) return; // grande demais para o cache: lê sempre da planilha
    var base = db_cacheChave_(tabela), id = uid_(), partes = {}, n = 0;
    for (var i = 0; i < s.length; i += CACHE_PEDACO) { partes[base + '_' + id + '_' + n] = s.substr(i, CACHE_PEDACO); n++; }
    partes[base] = JSON.stringify({ g: g, n: n, id: id });
    CacheService.getScriptCache().putAll(partes, CACHE_SEG);
  } catch (e) { /* cache é só otimização */ }
}

function ss_() {
  if (_ss) return _ss;
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('DB_ID');
  if (id) {
    try { _ss = SpreadsheetApp.openById(id); return _ss; } catch (e) { /* planilha apagada: recria */ }
  }
  var ativa = null;
  try { ativa = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) {}
  _ss = ativa || SpreadsheetApp.create('Studio CRM — Banco de Dados');
  props.setProperty('DB_ID', _ss.getId());
  return _ss;
}

/** Cria/atualiza todas as abas. */
function db_setup_() {
  Object.keys(SCHEMA).forEach(function (t) { sheet_(t); });
  var ss = ss_();
  // remove a "Página1"/"Sheet1" vazia criada por padrão
  ss.getSheets().forEach(function (sh) {
    if (!SCHEMA[sh.getName()] && sh.getLastRow() === 0 && ss.getSheets().length > 1) {
      try { ss.deleteSheet(sh); } catch (e) {}
    }
  });
}

function sheet_(nome) {
  var ss = ss_();
  var sh = ss.getSheetByName(nome);
  var cols = SCHEMA[nome];
  if (!sh) {
    sh = ss.insertSheet(nome);
    sh.getRange(1, 1, 1, cols.length).setValues([cols])
      .setFontWeight('bold').setBackground('#2a1f2d').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    // texto puro evita que o Sheets converta datas/telefones sozinho
    var num = NUMERICOS[nome] || [];
    cols.forEach(function (c, i) {
      var r = sh.getRange(2, i + 1, Math.max(sh.getMaxRows() - 1, 1), 1);
      r.setNumberFormat(num.indexOf(c) >= 0 ? '0.00' : '@');
    });
    return sh;
  }
  // migração: adiciona colunas novas que ainda não existem
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var header = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  var faltando = cols.filter(function (c) { return header.indexOf(c) < 0; });
  if (faltando.length) {
    var start = header.filter(String).length + 1;
    sh.getRange(1, start, 1, faltando.length).setValues([faltando])
      .setFontWeight('bold').setBackground('#2a1f2d').setFontColor('#ffffff');
  }
  return sh;
}

function db_tz_() {
  try { return ss_().getSpreadsheetTimeZone() || tz_(); } catch (e) { return tz_(); }
}

/** Lê a aba inteira e devolve {header, rows, objs}. Memoizado por execução. */
/** Lê a aba. fresca=true ignora o cache (usado antes de gravar). */
function db_read_(tabela, fresca) {
  if (_memo[tabela] && (!fresca || _memo[tabela].sh)) return _memo[tabela];
  if (!fresca) {
    var doCache = db_cacheLer_(tabela);
    if (doCache) { _memo[tabela] = doCache; return doCache; }
  }
  var geracao = db_gen_()[tabela] || 0;
  var sh = sheet_(tabela);
  var values = sh.getDataRange().getValues();
  var header = (values.shift() || []).map(String);
  var num = NUMERICOS[tabela] || [];
  var tz = null;
  var objs = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var o = {};
    var vazio = true;
    for (var c = 0; c < header.length; c++) {
      var k = header[c];
      if (!k) continue;
      var v = row[c];
      if (v instanceof Date) {
        tz = tz || db_tz_();
        v = Utilities.formatDate(v, tz, CAMPOS_DATA.indexOf(k) >= 0 ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm:ss");
      }
      if (num.indexOf(k) >= 0) v = num_(v);
      else v = (v === null || v === undefined) ? '' : String(v);
      if (v !== '' && v !== 0) vazio = false;
      o[k] = v;
    }
    o._row = i + 2;
    if (!vazio && o.id) objs.push(o);
  }
  _memo[tabela] = { sh: sh, header: header, objs: objs };
  if (CACHE_TABELAS[tabela]) db_cacheGravar_(tabela, _memo[tabela], geracao);
  return _memo[tabela];
}

function limpo_(o) {
  var r = {};
  for (var k in o) if (k !== '_row') r[k] = o[k];
  return r;
}

function db_all_(tabela) { return db_read_(tabela).objs.map(limpo_); }

function db_get_(tabela, id) {
  if (!id) return null;
  var o = db_read_(tabela).objs.filter(function (x) { return x.id === String(id); })[0];
  return o ? limpo_(o) : null;
}

function db_rowArray_(header, obj) {
  return header.map(function (k) {
    var v = obj[k];
    if (v === undefined || v === null) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  });
}

function db_insert_(tabela, obj) {
  var t = db_read_(tabela, true);
  obj = Object.assign({}, obj);
  if (!obj.id) obj.id = uid_();
  if (SCHEMA[tabela].indexOf('criadoEm') >= 0 && !obj.criadoEm) obj.criadoEm = agora_();
  t.sh.appendRow(db_rowArray_(t.header, obj));
  delete _memo[tabela];
  db_bump_(tabela);
  return obj;
}

function db_update_(tabela, id, patch) {
  var t = db_read_(tabela, true);
  var atual = t.objs.filter(function (x) { return x.id === String(id); })[0];
  if (!atual) throw erro_('Registro não encontrado.');
  var novo = Object.assign({}, atual, patch, { id: atual.id });
  if (SCHEMA[tabela].indexOf('atualizadoEm') >= 0) novo.atualizadoEm = agora_();
  t.sh.getRange(atual._row, 1, 1, t.header.length).setValues([db_rowArray_(t.header, novo)]);
  delete _memo[tabela];
  db_bump_(tabela);
  return limpo_(novo);
}

function db_delete_(tabela, id) {
  var t = db_read_(tabela, true);
  var atual = t.objs.filter(function (x) { return x.id === String(id); })[0];
  if (!atual) return false;
  t.sh.deleteRow(atual._row);
  delete _memo[tabela];
  db_bump_(tabela);
  return true;
}

/** Converte o campo JSON 'servicos' do agendamento em array. */
function json_(s, padrao) {
  if (!s) return padrao;
  if (typeof s !== 'string') return s;
  try { return JSON.parse(s); } catch (e) { return padrao; }
}
