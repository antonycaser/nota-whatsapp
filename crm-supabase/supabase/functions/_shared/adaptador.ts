// =====================================================================
//  Adaptador Supabase: "db" (tabelas) e "auth" (logins) usados pelas funções.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { type Db, type AuthAdmin, type Filtro, type Linha, doBanco, paraBanco, snake } from './logica.ts';

export const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function aplicarFiltro(q: any, f: Filtro = {}) {
  for (const [k, v] of Object.entries(f.eq || {})) q = q.eq(snake(k), v);
  for (const [k, v] of Object.entries(f.neq || {})) q = q.neq(snake(k), v);
  for (const [k, v] of Object.entries(f.gte || {})) q = q.gte(snake(k), v);
  for (const [k, v] of Object.entries(f.gt || {})) q = q.gt(snake(k), v);
  for (const [k, v] of Object.entries(f.lte || {})) q = q.lte(snake(k), v);
  for (const [k, v] of Object.entries(f.lt || {})) q = q.lt(snake(k), v);
  for (const [k, v] of Object.entries(f.in || {})) q = q.in(snake(k), v);
  // jsonb: manda como texto JSON (o supabase-js monta errado listas de objetos)
  for (const [k, v] of Object.entries(f.contem || {})) q = q.contains(snake(k), typeof v === 'string' ? v : JSON.stringify(v));
  return q;
}
const falhou = (error: any) => { if (error) throw new Error(error.message || String(error)); };

export const db: Db = {
  async sel(tabela, f = {}) {
    if (f.in && Object.values(f.in).some((arr) => !arr.length)) return [];
    const cols = f.cols ? f.cols.map(snake).join(',') : '*';
    const tam = 1000, limite = f.limite || Infinity, out: Linha[] = [];
    for (let de = 0; out.length < limite; de += tam) {
      let q = aplicarFiltro(sb.from(tabela).select(cols), f);
      if (f.ordem) q = q.order(snake(f.ordem), { ascending: !f.desc });
      const ate = Math.min(de + tam, limite) - 1;
      const { data, error } = await q.range(de, ate);
      falhou(error);
      out.push(...(data || []).map((r: Linha) => doBanco(tabela, r)));
      if (!data || data.length < ate - de + 1) break;
    }
    return out;
  },
  async um(tabela, id) {
    const { data, error } = await sb.from(tabela).select('*').eq('id', id).maybeSingle();
    falhou(error);
    return data ? doBanco(tabela, data) : null;
  },
  async ins(tabela, obj) {
    const { data, error } = await sb.from(tabela).insert(paraBanco(tabela, obj)).select('*').single();
    falhou(error);
    return doBanco(tabela, data);
  },
  async upd(tabela, id, patch) {
    const { data, error } = await sb.from(tabela).update(paraBanco(tabela, patch)).eq('id', id).select('*').maybeSingle();
    falhou(error);
    if (!data) throw new Error('Registro não encontrado.');
    return doBanco(tabela, data);
  },
  async updOnde(tabela, eq, patch) {
    const { error } = await aplicarFiltro(sb.from(tabela).update(paraBanco(tabela, patch)), { eq });
    falhou(error);
  },
  async del(tabela, id) {
    const { error } = await sb.from(tabela).delete().eq('id', id);
    falhou(error);
  },
  async upsert(tabela, obj, chave) {
    const { error } = await sb.from(tabela).upsert(paraBanco(tabela, obj), { onConflict: snake(chave) });
    falhou(error);
  }
};

export const auth: AuthAdmin = {
  async criar(email, senha) {
    const { data, error } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
    falhou(error);
    return data.user!.id;
  },
  async senha(id, senha) { const { error } = await sb.auth.admin.updateUserById(id, { password: senha }); falhou(error); },
  async email(id, email) { const { error } = await sb.auth.admin.updateUserById(id, { email, email_confirm: true }); falhou(error); },
  async bloquear(id, bloquear) {
    const { error } = await sb.auth.admin.updateUserById(id, { ban_duration: bloquear ? '876000h' : 'none' });
    falhou(error);
  },
  async excluir(id) { const { error } = await sb.auth.admin.deleteUser(id); falhou(error); },
  async emails() {
    const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    falhou(error);
    const m: Record<string, string> = {};
    for (const u of data.users) m[u.id] = u.email || '';
    return m;
  }
};


/** Dependências da integração com o Google Agenda (segredos ficam em Edge Functions → Secrets). */
export const googleDeps = {
  fetch: (u: string, o?: RequestInit) => fetch(u, o),
  clientId: Deno.env.get('GOOGLE_CLIENT_ID') || '',
  clientSecret: Deno.env.get('GOOGLE_CLIENT_SECRET') || '',
  redirectUri: (Deno.env.get('SUPABASE_URL') || '') + '/functions/v1/google'
};
