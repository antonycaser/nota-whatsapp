-- =====================================================================
--  CRM Lara Altoé — permissões do SERVIDOR (função "api")
--
--  Corrige o erro "permission denied for table ...". Nos projetos novos
--  do Supabase as tabelas não recebem permissão automática; aqui damos
--  acesso SÓ ao papel do servidor (service_role). O navegador continua
--  sem acesso direto a nada.
--
--  Cole no SQL Editor e clique em "Run" (pode rodar de novo sem problema).
-- =====================================================================

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- tabelas criadas no futuro também
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;

-- o navegador continua sem acesso direto
revoke all on all tables in schema public from anon, authenticated;

select 'Permissões ok' as resultado;
