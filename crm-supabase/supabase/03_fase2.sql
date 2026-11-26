-- =====================================================================
--  CRM Lara Altoé — complemento da Fase 2
--  Cole no SQL Editor e clique em "Run" (pode rodar de novo sem problema).
-- =====================================================================

-- Pede para a pessoa trocar a senha provisória no primeiro acesso
alter table public.perfis add column if not exists trocar_senha boolean not null default false;

-- Resumo de cada cliente (visitas, total gasto, última visita, próximo horário)
create or replace view public.vw_cliente_stats
with (security_invoker = on) as
select
  c.id as cliente_id,
  count(a.id) filter (where a.status = 'concluido')                                   as visitas,
  coalesce(sum(a.valor - a.desconto) filter (where a.status = 'concluido'), 0)         as total,
  max(a.inicio) filter (where a.status = 'concluido')                                  as ultima,
  min(a.inicio) filter (where a.status in ('agendado', 'confirmado', 'remarcar')
                          and a.inicio >= (now() at time zone 'America/Sao_Paulo'))    as proxima,
  count(a.id) filter (where a.status = 'faltou')                                      as faltas
from public.clientes c
left join public.agendamentos a on a.cliente_id = c.id
group by c.id;

revoke all on public.vw_cliente_stats from anon, authenticated;

-- Pronto!
select 'Fase 2 ok' as resultado;
