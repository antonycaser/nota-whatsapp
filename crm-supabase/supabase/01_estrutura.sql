-- =====================================================================
--  CRM Lara Altoé — estrutura do banco de dados (Supabase / Postgres)
--
--  COMO USAR: no painel do Supabase, abra "SQL Editor" → "New query",
--  cole TODO este arquivo e clique em "Run". Pode rodar de novo sem
--  problema (não apaga nada que já exista).
--
--  SEGURANÇA: todas as tabelas ficam com RLS ligado e SEM acesso direto
--  pelo navegador. Só a função "api" do servidor (que confere o login e
--  o perfil de quem está usando) lê e grava os dados.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Perfis de acesso (cada login do Supabase Auth tem um perfil)
-- ---------------------------------------------------------------------
create table if not exists public.perfis (
  id            uuid primary key references auth.users(id) on delete cascade,
  nome          text not null,
  perfil        text not null default 'equipe' check (perfil in ('admin', 'equipe')),
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  ultimo_acesso timestamptz
);

-- ---------------------------------------------------------------------
-- Cadastros
-- ---------------------------------------------------------------------
create table if not exists public.clientes (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  telefone      text,
  email         text,
  nascimento    date,
  instagram     text,
  origem        text,
  tags          text,
  tipo_pele     text,
  tom_base      text,
  alergias      text,
  sobrancelha   text,
  anamnese      text,
  observacoes   text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists clientes_telefone_idx on public.clientes (telefone);
create index if not exists clientes_nome_idx on public.clientes (lower(nome));

create table if not exists public.servicos (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null,
  categoria text not null default 'Outros',
  duracao   integer not null default 60,
  preco     numeric(10, 2) not null default 0,
  custo     numeric(10, 2) not null default 0,
  cor       text not null default '#0f7f7c',
  descricao text,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.profissionais (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null,
  telefone  text,
  comissao  numeric(5, 2) not null default 0,
  cor       text not null default '#9c8074',
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Agenda
-- inicio/fim guardam o horário LOCAL do studio (America/Sao_Paulo)
-- ---------------------------------------------------------------------
create table if not exists public.agendamentos (
  id                uuid primary key default gen_random_uuid(),
  cliente_id        uuid references public.clientes(id) on delete set null,
  cliente_nome      text,
  telefone          text,
  servicos          jsonb not null default '[]'::jsonb,
  servico_nomes     text,
  profissional_id   uuid references public.profissionais(id) on delete set null,
  inicio            timestamp not null,
  fim               timestamp not null,
  status            text not null default 'agendado'
                      check (status in ('agendado', 'confirmado', 'concluido', 'faltou', 'cancelado', 'remarcar')),
  valor             numeric(10, 2) not null default 0,
  desconto          numeric(10, 2) not null default 0,
  sinal             numeric(10, 2) not null default 0,
  local             text default 'Studio',
  observacoes       text,
  event_id          text,          -- id do evento no Google Agenda
  sync_status       text,
  confirm_enviada   text,
  lembrete1_enviado text,
  lembrete2_enviado text,
  pos_enviado       text,
  forma_pagamento   text,
  lancamento_id     uuid,
  origem            jsonb,         -- dados originais quando veio do Google Agenda
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);
create index if not exists agendamentos_inicio_idx on public.agendamentos (inicio);
create index if not exists agendamentos_cliente_idx on public.agendamentos (cliente_id);
create index if not exists agendamentos_status_idx on public.agendamentos (status);
create index if not exists agendamentos_event_idx on public.agendamentos (event_id);

-- ---------------------------------------------------------------------
-- Financeiro
-- ---------------------------------------------------------------------
create table if not exists public.financeiro (
  id              uuid primary key default gen_random_uuid(),
  data            date not null,
  tipo            text not null check (tipo in ('receita', 'despesa')),
  categoria       text not null,
  descricao       text,
  valor           numeric(10, 2) not null check (valor > 0),
  forma           text,
  status          text not null default 'pago' check (status in ('pago', 'pendente')),
  vencimento      date,
  agendamento_id  uuid,            -- sem chave estrangeira de propósito (sinal retido continua após excluir)
  cliente_id      uuid,
  profissional_id uuid,
  criado_em       timestamptz not null default now()
);
create index if not exists financeiro_data_idx on public.financeiro (data);
create index if not exists financeiro_agendamento_idx on public.financeiro (agendamento_id);

-- ---------------------------------------------------------------------
-- WhatsApp: histórico de mensagens
-- ---------------------------------------------------------------------
create table if not exists public.mensagens (
  id             uuid primary key default gen_random_uuid(),
  data           timestamptz not null default now(),
  tipo           text,
  direcao        text default 'enviada',
  cliente_id     uuid,
  agendamento_id uuid,
  telefone       text,
  mensagem       text,
  status         text,
  detalhe        text
);
create index if not exists mensagens_data_idx on public.mensagens (data desc);
create index if not exists mensagens_cliente_idx on public.mensagens (cliente_id);

-- ---------------------------------------------------------------------
-- Configurações (studio, modelos de mensagem, chaves — só o servidor lê)
-- ---------------------------------------------------------------------
create table if not exists public.config (
  chave         text primary key,
  valor         jsonb not null,
  atualizado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- "atualizado_em" automático
-- ---------------------------------------------------------------------
create or replace function public.tocar_atualizado_em() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists clientes_atualizado on public.clientes;
create trigger clientes_atualizado before update on public.clientes
  for each row execute function public.tocar_atualizado_em();
drop trigger if exists agendamentos_atualizado on public.agendamentos;
create trigger agendamentos_atualizado before update on public.agendamentos
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------
-- Segurança: RLS ligado e nenhuma política para o navegador.
-- (anon/authenticated não leem nem gravam nada direto; só a função "api")
-- ---------------------------------------------------------------------
alter table public.perfis        enable row level security;
alter table public.clientes      enable row level security;
alter table public.servicos      enable row level security;
alter table public.profissionais enable row level security;
alter table public.agendamentos  enable row level security;
alter table public.financeiro    enable row level security;
alter table public.mensagens     enable row level security;
alter table public.config        enable row level security;

revoke all on public.perfis, public.clientes, public.servicos, public.profissionais,
  public.agendamentos, public.financeiro, public.mensagens, public.config from anon, authenticated;

-- ---------------------------------------------------------------------
-- Serviços iniciais (só se a tabela estiver vazia)
-- ---------------------------------------------------------------------
insert into public.servicos (nome, categoria, duracao, preco, cor)
select * from (values
  ('Maquiagem social',        'Maquiagem',        60, 180.00, '#0f7f7c'),
  ('Maquiagem para madrinha', 'Maquiagem',        75, 220.00, '#0f7f7c'),
  ('Maquiagem de noiva',      'Noivas & Eventos', 120, 650.00, '#6a4ce2'),
  ('Design de sobrancelha',   'Sobrancelha',      30,  50.00, '#9c8074'),
  ('Design com henna',        'Sobrancelha',      45,  70.00, '#9c8074'),
  ('Brow lamination',         'Sobrancelha',      60, 150.00, '#9c8074'),
  ('Penteado social',         'Penteado',         60, 160.00, '#e06a3a'),
  ('Penteado de noiva',       'Noivas & Eventos', 90, 450.00, '#6a4ce2'),
  ('Escova modelada',         'Penteado',         45,  90.00, '#e06a3a'),
  ('Cílios fio a fio',        'Cílios',          120, 180.00, '#257de0'),
  ('Pacote Make + Penteado',  'Noivas & Eventos', 120, 320.00, '#6a4ce2')
) as v(nome, categoria, duracao, preco, cor)
where not exists (select 1 from public.servicos);

-- Pronto! Agora crie o seu login (veja 02_primeira_admin.sql).
