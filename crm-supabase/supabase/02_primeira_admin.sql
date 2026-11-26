-- =====================================================================
--  Transforma um login em ADMINISTRADORA do CRM.
--
--  ANTES: no painel do Supabase, vá em Authentication → Users →
--  "Add user" → "Create new user", coloque o e-mail e uma senha e
--  marque "Auto Confirm User".
--
--  DEPOIS: troque o e-mail e o nome abaixo e rode esta consulta
--  no SQL Editor.
-- =====================================================================

insert into public.perfis (id, nome, perfil, ativo)
select id, 'Lara Altoé', 'admin', true
from auth.users
where email = 'COLOQUE-O-EMAIL-AQUI@gmail.com'
on conflict (id) do update set perfil = 'admin', ativo = true, nome = excluded.nome;

-- Conferir: deve aparecer uma linha com perfil = admin
select p.nome, p.perfil, u.email
from public.perfis p join auth.users u on u.id = p.id;
