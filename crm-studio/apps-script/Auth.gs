/**
 * Portal com senha: usuários, sessões e permissões.
 * Perfis: "admin" (acesso total) e "equipe" (agenda e clientes).
 */

var SESSAO_CACHE = 6 * 60 * 60;   // cache rápido (máx. do Google: 6h)
var SESSAO_DIAS = 180;            // "manter conectada": 180 dias, renovados a cada uso
var SESSAO_CURTA_DIAS = 0.5;      // sem "manter conectada": 12 horas
var MAX_TENTATIVAS = 5;

function auth_hash_(senha, salt) {
  var h = salt + '|' + String(senha);
  for (var i = 0; i < 150; i++) {
    h = Utilities.base64Encode(
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + '|' + salt, Utilities.Charset.UTF_8));
  }
  return h;
}

function auth_login_(usuario, senha, lembrar) {
  usuario = String(usuario || '').trim().toLowerCase();
  if (!usuario || !senha) throw erro_('Informe usuário e senha.');
  var cache = CacheService.getScriptCache();
  var chave = 'falha_' + usuario;
  var falhas = Number(cache.get(chave) || 0);
  if (falhas >= MAX_TENTATIVAS) throw erro_('Muitas tentativas incorretas. Aguarde 15 minutos e tente novamente.');

  var u = db_all_('Usuarios').filter(function (x) {
    return String(x.usuario).toLowerCase() === usuario && x.ativo !== 'nao';
  })[0];

  if (!u || auth_hash_(senha, u.salt) !== u.hash) {
    cache.put(chave, String(falhas + 1), 15 * 60);
    Utilities.sleep(600);
    throw erro_('Usuário ou senha incorretos.');
  }
  cache.remove(chave);

  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var sess = auth_sessao_(u);
  sess.dias = lembrar === false ? SESSAO_CURTA_DIAS : SESSAO_DIAS;
  sess.exp = Date.now() + sess.dias * 86400000;
  sess.renovado = Date.now();
  auth_gravarSessao_(token, sess);
  db_update_('Usuarios', u.id, { ultimoAcesso: agora_() });
  return { token: token, user: sess };
}

/** Chave da sessão: hash do token (o token em si nunca fica gravado). */
function sess_chave_(token) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'sess|' + token, Utilities.Charset.UTF_8);
  return 'S_' + Utilities.base64Encode(d).replace(/[^A-Za-z0-9]/g, '').slice(0, 32);
}

/** Grava a sessão de forma permanente (Propriedades) + cache rápido. */
function auth_gravarSessao_(token, sess) {
  var k = sess_chave_(token), raw = JSON.stringify(sess);
  PropertiesService.getScriptProperties().setProperty(k, raw);
  CacheService.getScriptCache().put(k, raw, SESSAO_CACHE);
}

function auth_apagarSessao_(token) {
  var k = sess_chave_(token);
  PropertiesService.getScriptProperties().deleteProperty(k);
  CacheService.getScriptCache().remove(k);
}

/** Encerra todas as sessões de um usuário (ex.: senha trocada, acesso bloqueado). */
function auth_encerrarSessoes_(userId, manterToken) {
  var props = PropertiesService.getScriptProperties();
  var cache = CacheService.getScriptCache();
  var manter = manterToken ? sess_chave_(manterToken) : '';
  props.getKeys().forEach(function (k) {
    if (k.indexOf('S_') !== 0 || k === manter) return;
    var s = json_(props.getProperty(k), null);
    if (!s || s.id === userId) { props.deleteProperty(k); cache.remove(k); }
  });
}

/** Apaga sessões vencidas (roda 1x por dia pelo gatilho). */
function auth_limparSessoes_() {
  var props = PropertiesService.getScriptProperties();
  var hoje = hoje_();
  if (props.getProperty('SESS_LIMPEZA') === hoje) return;
  props.getKeys().forEach(function (k) {
    if (k.indexOf('S_') !== 0) return;
    var s = json_(props.getProperty(k), null);
    if (!s || (s.exp && s.exp < Date.now())) props.deleteProperty(k);
  });
  props.setProperty('SESS_LIMPEZA', hoje);
}

function auth_sessao_(u) {
  return { id: u.id, nome: u.nome, usuario: u.usuario, perfil: u.perfil || 'equipe', trocarSenha: u.trocarSenha === 'sim' };
}

function auth_check_(token) {
  var falha = function (msg) { var e = new Error(msg); e.auth = false; e.usuario = true; return e; };
  if (!token || String(token).length < 40) throw falha('Faça login para continuar.');
  var k = sess_chave_(token);
  var cache = CacheService.getScriptCache();
  var sess = json_(cache.get(k), null);
  if (!sess) {
    // não está no cache (expirou ou o Google limpou): busca a sessão permanente
    sess = json_(PropertiesService.getScriptProperties().getProperty(k), null);
    if (sess) {
      var u = db_get_('Usuarios', sess.id);
      if (!u || u.ativo === 'nao') { auth_apagarSessao_(token); sess = null; }
      else {
        sess.nome = u.nome; sess.usuario = u.usuario; sess.perfil = u.perfil || 'equipe'; sess.trocarSenha = u.trocarSenha === 'sim';
      }
    }
  }
  if (!sess) throw falha('Sua sessão expirou. Entre novamente.');
  if (sess.exp && sess.exp < Date.now()) { auth_apagarSessao_(token); throw falha('Sua sessão expirou. Entre novamente.'); }
  // sessão deslizante: renova o prazo no máximo 1x por dia (evita gravações a cada clique)
  if (!sess.renovado || Date.now() - sess.renovado > 86400000) {
    sess.dias = sess.dias || SESSAO_DIAS;
    sess.exp = Date.now() + sess.dias * 86400000;
    sess.renovado = Date.now();
    auth_gravarSessao_(token, sess);
  } else {
    cache.put(k, JSON.stringify(sess), SESSAO_CACHE);
  }
  return sess;
}

function auth_logout_(token) {
  auth_apagarSessao_(token);
}

function auth_alterarSenha_(p, sess, token) {
  var u = db_get_('Usuarios', sess.id);
  if (!u) throw erro_('Usuário não encontrado.');
  if (auth_hash_(p.atual || '', u.salt) !== u.hash) throw erro_('A senha atual está incorreta.');
  senha_validar_(p.nova);
  var salt = uid_() + uid_();
  db_update_('Usuarios', u.id, { salt: salt, hash: auth_hash_(p.nova, salt), trocarSenha: 'nao' });
  sess.trocarSenha = false;
  auth_encerrarSessoes_(u.id, token); // desconecta os outros aparelhos
  auth_gravarSessao_(token, sess);
  return sess;
}

function senha_validar_(s) {
  s = String(s || '');
  if (s.length < 8) throw erro_('A senha precisa ter pelo menos 8 caracteres.');
  if (!/[0-9]/.test(s) || !/[a-zA-Z]/.test(s)) throw erro_('Use letras e números na senha.');
}

function senha_gerar_() {
  var chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var s = '';
  var u = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  for (var i = 0; i < 10; i++) s += chars.charAt(parseInt(u.substr(i * 2, 2), 16) % chars.length);
  return s.slice(0, 5) + '-' + s.slice(5) + '7';
}

/* ------------------------- Usuários ------------------------- */

function usr_seedAdmin_() {
  if (db_all_('Usuarios').length) return null;
  var senha = senha_gerar_();
  var salt = uid_() + uid_();
  db_insert_('Usuarios', {
    nome: 'Administradora', usuario: 'admin', perfil: 'admin',
    salt: salt, hash: auth_hash_(senha, salt), ativo: 'sim', trocarSenha: 'sim'
  });
  return senha;
}

function usr_resetAdmin_() {
  var senha = senha_gerar_();
  var salt = uid_() + uid_();
  var admin = db_all_('Usuarios').filter(function (u) { return u.usuario === 'admin'; })[0];
  var dados = { salt: salt, hash: auth_hash_(senha, salt), ativo: 'sim', trocarSenha: 'sim', perfil: 'admin' };
  if (admin) db_update_('Usuarios', admin.id, dados);
  else db_insert_('Usuarios', Object.assign({ nome: 'Administradora', usuario: 'admin' }, dados));
  CacheService.getScriptCache().remove('falha_admin');
  auth_encerrarSessoes_((admin || {}).id || '__nenhum');
  return senha;
}

function usr_listar_() {
  return db_all_('Usuarios').map(function (u) {
    return { id: u.id, nome: u.nome, usuario: u.usuario, perfil: u.perfil, ativo: u.ativo, ultimoAcesso: u.ultimoAcesso };
  });
}

function usr_salvar_(p, sess) {
  var usuario = String(p.usuario || '').trim().toLowerCase();
  if (!p.nome || !usuario) throw erro_('Preencha nome e usuário.');
  if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) throw erro_('Usuário: use de 3 a 30 letras minúsculas, números, ponto ou traço.');
  var todos = db_all_('Usuarios');
  if (todos.some(function (u) { return u.usuario === usuario && u.id !== p.id; })) throw erro_('Esse nome de usuário já existe.');
  var dados = { nome: p.nome, usuario: usuario, perfil: p.perfil === 'admin' ? 'admin' : 'equipe', ativo: p.ativo === 'nao' ? 'nao' : 'sim' };
  if (p.id && p.id === sess.id && (dados.perfil !== 'admin' || dados.ativo === 'nao')) {
    throw erro_('Você não pode remover o seu próprio acesso de administradora.');
  }
  if (p.senha) {
    senha_validar_(p.senha);
    dados.salt = uid_() + uid_();
    dados.hash = auth_hash_(p.senha, dados.salt);
    dados.trocarSenha = p.id === sess.id ? 'nao' : 'sim';
  } else if (!p.id) {
    throw erro_('Defina uma senha provisória para o novo usuário.');
  }
  var r = p.id ? db_update_('Usuarios', p.id, dados) : db_insert_('Usuarios', dados);
  if (p.id && p.id !== sess.id && (dados.ativo === 'nao' || p.senha)) auth_encerrarSessoes_(p.id);
  return { id: r.id };
}

function usr_excluir_(p, sess) {
  if (p.id === sess.id) throw erro_('Você não pode excluir o seu próprio usuário.');
  var admins = db_all_('Usuarios').filter(function (u) { return u.perfil === 'admin' && u.ativo !== 'nao' && u.id !== p.id; });
  if (!admins.length) throw erro_('O sistema precisa de pelo menos uma administradora.');
  db_delete_('Usuarios', p.id);
  auth_encerrarSessoes_(p.id);
  return true;
}
