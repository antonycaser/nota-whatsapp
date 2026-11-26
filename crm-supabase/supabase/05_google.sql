-- =====================================================================
--  CRM Lara Altoé — fase 3: sincronização automática com o Google Agenda
--
--  A cada 5 minutos o próprio Supabase chama a função "google", que traz
--  para o CRM o que foi mudado direto no Google Agenda (remarcações e
--  exclusões). O CRM → Google é na hora, não depende disto.
--
--  ANTES: publique a função "google" (com Verify JWT DESLIGADO).
--  Cole no SQL Editor e clique em "Run". Pode rodar de novo sem problema.
--  Não precisa trocar nada: o segredo é criado aqui e fica só no banco.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- segredo do agendador (criado uma vez; o navegador não tem acesso a esta tabela)
insert into public.config (chave, valor)
values ('cron', jsonb_build_object('segredo', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')))
on conflict (chave) do nothing;

-- (re)cria o agendamento
select cron.unschedule(jobid) from cron.job where jobname = 'crm-google-sync';
select cron.schedule(
  'crm-google-sync',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://cagvmdztxchypulfshla.supabase.co/functions/v1/google',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select valor->>'segredo' from public.config where chave = 'cron')
    ),
    body := '{"acao":"sincronizar"}'::jsonb
  );
  $$
);

select 'Sincronização automática ligada (a cada 5 minutos)' as resultado;
