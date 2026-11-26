// Adaptador Postgres (mesma interface do adaptador Supabase) + login simulado — usado nos testes.
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { doBanco, paraBanco, snake, type Db, type AuthAdmin, type Filtro, type Linha } from '../supabase/functions/api/logica.ts';

export async function criarBanco() {
  pg.types.setTypeParser(1082, (v: string) => v);      // date → 'YYYY-MM-DD'
  pg.types.setTypeParser(1114, (v: string) => v);      // timestamp → texto (horário local do studio)
  const cli = new pg.Client();
  await cli.connect();
  const sql = (q: string, v: any[] = []) => cli.query(q, v);

  // ---------- imita o Supabase e cria o banco com os MESMOS arquivos que vão para o Supabase
  // service_role: como nos projetos NOVOS do Supabase — ignora RLS, mas SEM permissão automática nas tabelas
  await sql(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, created_at timestamptz default now());
    grant usage on schema public to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;`);
  for (const f of ['01_estrutura.sql', '03_fase2.sql', '04_permissoes.sql']) await sql(readFileSync(new URL('../supabase/' + f, import.meta.url), 'utf8'));
  // daqui em diante o teste age como o SERVIDOR de verdade (service_role), não como superusuário
  await sql('grant usage on schema auth to service_role; grant all on auth.users to service_role; set role service_role');

  // ---------- adaptador Postgres (mesma interface do adaptador Supabase)
  const val = (v: any) => (v !== null && typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v);
  function onde(f: Filtro, params: any[]) {
    const w: string[] = [];
    const add = (op: string, obj?: Linha) => { for (const [k, v] of Object.entries(obj || {})) { params.push(v); w.push(`${snake(k)} ${op} $${params.length}`); } };
    add('=', f.eq); add('<>', f.neq); add('>=', f.gte); add('>', f.gt); add('<=', f.lte); add('<', f.lt);
    for (const [k, v] of Object.entries(f.in || {})) { if (!v.length) { w.push('false'); continue; } params.push(v); w.push(`${snake(k)}::text = any($${params.length}::text[])`); }
    for (const [k, v] of Object.entries(f.contem || {})) { params.push(JSON.stringify(v)); w.push(`${snake(k)} @> $${params.length}::jsonb`); }
    return w.length ? ' where ' + w.join(' and ') : '';
  }
  const db: Db = {
    async sel(t, f = {}) {
      const p: any[] = [];
      const cols = f.cols ? f.cols.map(snake).join(',') : '*';
      let q = `select ${cols} from public.${t}` + onde(f, p);
      if (f.ordem) q += ` order by ${snake(f.ordem)} ${f.desc ? 'desc' : 'asc'}`;
      if (f.limite) q += ` limit ${f.limite}`;
      return (await sql(q, p)).rows.map((r: Linha) => doBanco(t, r));
    },
    async um(t, id) { const r = (await sql(`select * from public.${t} where id = $1`, [id])).rows[0]; return r ? doBanco(t, r) : null; },
    async ins(t, o) {
      const r = paraBanco(t, o), ks = Object.keys(r);
      const q = `insert into public.${t} (${ks.join(',')}) values (${ks.map((_, i) => '$' + (i + 1)).join(',')}) returning *`;
      return doBanco(t, (await sql(q, ks.map((k) => val(r[k])))).rows[0]);
    },
    async upd(t, id, patch) {
      const r = paraBanco(t, patch), ks = Object.keys(r);
      const q = `update public.${t} set ${ks.map((k, i) => `${k} = $${i + 2}`).join(',')} where id = $1 returning *`;
      const row = (await sql(q, [id, ...ks.map((k) => val(r[k]))])).rows[0];
      if (!row) throw new Error('Registro não encontrado.');
      return doBanco(t, row);
    },
    async updOnde(t, eq, patch) {
      const r = paraBanco(t, patch), ks = Object.keys(r), p = ks.map((k) => val(r[k]));
      await sql(`update public.${t} set ${ks.map((k, i) => `${k} = $${i + 1}`).join(',')}` + onde({ eq }, p), p);
    },
    async del(t, id) { await sql(`delete from public.${t} where id = $1`, [id]); },
    async upsert(t, o, chave) {
      const r = paraBanco(t, o), ks = Object.keys(r);
      await sql(`insert into public.${t} (${ks.join(',')}) values (${ks.map((_, i) => '$' + (i + 1)).join(',')})
        on conflict (${snake(chave)}) do update set ${ks.filter((k) => k !== snake(chave)).map((k) => `${k} = excluded.${k}`).join(',')}`, ks.map((k) => val(r[k])));
    }
  };
  const bloqueados = new Set<string>();
  const auth: AuthAdmin = {
    async criar(email) { return (await sql('insert into auth.users (email) values ($1) returning id', [email])).rows[0].id; },
    async senha() {},
    async email(id, email) { await sql('update auth.users set email = $2 where id = $1', [id, email]); },
    async bloquear(id, b) { if (b) bloqueados.add(id); else bloqueados.delete(id); },
    async excluir(id) { await sql('delete from auth.users where id = $1', [id]); },
    async emails() { const m: Record<string, string> = {}; for (const r of (await sql('select id, email from auth.users')).rows) m[r.id] = r.email; return m; }
  };

  return { db, auth, sql, cli, bloqueados };
}
