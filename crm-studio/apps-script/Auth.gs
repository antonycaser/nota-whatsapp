/**
 * Portal com senha: usuários, sessões e permissões.
 * Perfis: "admin" (acesso total) e "equipe" (agenda e clientes).
 */

var SESSAO_TTL = 6 * 60 * 60; // 6 horas (renova a cada uso)
var MAX_TENTATIVAS = 5;

function auth_hash_(senha, salt) {
  var h = salt + '|' + String(senha);
  for (var i = 0; i < 150; i++) {
    h = Utilities.base64Encode(
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + '|' + salt, Utilities.Charset.UTF_8));
  }
  return h;
}

function auth_login_(usuario, senha) {
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
  cache.put('sess_' + token, JSON.stringify(sess), SESSAO_TTL);
  db_update_('Usuarios', u.id, { ultimoAcesso: agora_() });
  return { token: token, user: sess };
}

function auth_sessao_(u) {
  return { id: u.id, nome: u.nome, usuario: u.usuario, perfil: u.perfil || 'equipe', trocarSenha: u.trocarSenha === 'sim' };
}

function auth_check_(token) {
  var e;
  if (!token || String(token).length < 40) { e = new Error('Faça login para continuar.'); e.auth = false; e.usuario = true; throw e; }
  var cache = CacheService.getScriptCache();
  var raw = cache.get('sess_' + token);
  if (!raw) { e = new Error('Sua sessão expirou. Entre novamente.'); e.auth = false; e.usuario = true; throw e; }
  cache.put('sess_' + token, raw, SESSAO_TTL); // sessão deslizante
  return JSON.parse(raw);
}

function auth_logout_(token) {
  CacheService.getScriptCache().remove('sess_' + token);
}

function auth_alterarSenha_(p, sess, token) {
  var u = db_get_('Usuarios', sess.id);
  if (!u) throw erro_('Usuário não encontrado.');
  if (auth_hash_(p.atual || '', u.salt) !== u.hash) throw erro_('A senha atual está incorreta.');
  senha_validar_(p.nova);
  var salt = uid_() + uid_();
  db_update_('Usuarios', u.id, { salt: salt, hash: auth_hash_(p.nova, salt), trocarSenha: 'nao' });
  sess.trocarSenha = false;
  CacheService.getScriptCache().put('sess_' + token, JSON.stringify(sess), SESSAO_TTL);
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
  return { id: r.id };
}

function usr_excluir_(p, sess) {
  if (p.id === sess.id) throw erro_('Você não pode excluir o seu próprio usuário.');
  var admins = db_all_('Usuarios').filter(function (u) { return u.perfil === 'admin' && u.ativo !== 'nao' && u.id !== p.id; });
  if (!admins.length) throw erro_('O sistema precisa de pelo menos uma administradora.');
  db_delete_('Usuarios', p.id);
  return true;
}
