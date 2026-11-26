// =====================================================================
//  CRM Lara Altoé — função "api" do Supabase (porta de entrada do servidor)
//  Confere o login (Supabase Auth) e o perfil, e executa a ação pedida.
//  As regras do CRM ficam em logica.ts.
// =====================================================================
import { executar } from '../_shared/logica.ts';
import { db, auth, sb, googleDeps } from '../_shared/adaptador.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const resposta = (o: unknown) => new Response(JSON.stringify(o), { headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u, error } = await sb.auth.getUser(token);
    if (error || !u || !u.user) return resposta({ ok: false, auth: false, error: 'Sua sessão expirou. Entre novamente.' });
    const perfil = await db.um('perfis', u.user.id);
    if (!perfil || perfil.ativo === 'nao') {
      return resposta({ ok: false, auth: false, error: 'Este login não tem acesso ao CRM. Fale com a administradora.' });
    }
    const sess = { id: perfil.id, nome: perfil.nome, perfil: perfil.perfil, email: u.user.email || '', trocarSenha: !!perfil.trocarSenha };
    const { action, payload } = await req.json();
    return resposta(await executar(String(action || ''), payload || {}, { db, auth, sess, memo: {}, google: googleDeps }));
  } catch (e) {
    console.error(e);
    return resposta({ ok: false, error: 'Erro no servidor: ' + ((e as Error).message || String(e)) });
  }
});
