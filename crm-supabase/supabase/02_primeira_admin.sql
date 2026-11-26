-- =====================================================================
--  Transforma o PRIMEIRO login criado em ADMINISTRADORA do CRM.
--
--  ANTES: no painel do Supabase, vá em Authentication → Users →
--  "Add user" → "Create new user", coloque e-mail e senha e marque
--  "Auto Confirm User".
--
--  DEPOIS: cole tudo isto no SQL Editor e clique em "Run".
--  Não precisa trocar nada.
-- =====================================================================

insert into public.perfis (id, nome, perfil, ativo)
select id, 'Lara Altoé', 'admin', true
from auth.users
order by created_at
limit 1
on conflict (id) do update set perfil = 'admin', ativo = true;

-- Conferir: deve aparecer uma linha com perfil = admin
select p.nome, p.perfil, u.email
from public.perfis p join auth.users u on u.id = p.id;
