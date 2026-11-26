# CRM Lara Altoé: versão Supabase (mais rápida)

Nova versão do CRM, rodando no **Supabase** (banco de dados e servidor) e no **Netlify** (aplicativo). A versão atual, em Google Apps Script (`crm-studio/`), continua funcionando até esta ser aprovada.

| Fase | O que | Situação |
|---|---|---|
| 1 | Conta no Supabase + estrutura do banco | ✅ arquivos prontos |
| 2 | Aplicativo no Supabase: login, painel, agenda, clientes, financeiro, relatórios | em construção |
| 3 | Google Agenda (nos dois sentidos) | depois da fase 2 |
| 4 | WhatsApp, cópia dos dados atuais e backup automático | depois da fase 3 |

---

## Fase 1: criar a conta e o banco (± 10 minutos)

### 1. Criar a conta e o projeto
1. Entre em **supabase.com** e clique em **Start your project**. Dá para entrar com o GitHub ou com e-mail.
2. Clique em **New project** e preencha:
   - **Name:** `crm-lara-altoe`
   - **Database Password:** clique em **Generate a password** e **guarde num lugar seguro**. Não mande essa senha para ninguém.
   - **Region:** **South America (São Paulo)**. É isso que deixa o CRM rápido no Brasil.
   - **Plano:** Free
3. Clique em **Create new project** e espere uns 2 minutos.

### 2. Criar as tabelas
1. No menu da esquerda, abra **SQL Editor** e clique em **New query**.
2. Cole **todo** o conteúdo de [`supabase/01_estrutura.sql`](supabase/01_estrutura.sql) e clique em **Run**.
3. Deve aparecer **"Success. No rows returned"**.

### 3. Criar o seu login de administradora
1. Vá em **Authentication → Users → Add user → Create new user**.
2. Coloque o **e-mail** e uma **senha**, marque **Auto Confirm User** e clique em **Create user**.
3. Volte ao **SQL Editor**, clique em **New query**, cole o conteúdo de [`supabase/02_primeira_admin.sql`](supabase/02_primeira_admin.sql) **sem mudar nada** e clique em **Run**.
4. Deve aparecer uma tabelinha com o seu nome, **admin** e o seu e-mail.

### 4. Fechar o cadastro público (segurança)
Em **Authentication → Sign In / Providers**, **desligue "Allow new users to sign up"**. Assim só você cria os logins da equipe.

### 5. O que me mandar
Em **Project Settings → API** (ou **Data API**), copie:
- **Project URL**, algo como `https://abcdxyz.supabase.co`;
- a chave **anon / public** (às vezes chamada de **publishable key**).

Essas duas são **públicas** por natureza (ficam dentro do aplicativo) e podem ser enviadas.

⚠️ **Nunca envie** a chave **service_role / secret** nem a senha do banco.

---

## Arquivos

```
crm-supabase/
└── supabase/
    ├── 01_estrutura.sql       tabelas, índices, regras e segurança (RLS)
    └── 02_primeira_admin.sql  transforma um login em administradora
```

**Segurança:** todas as tabelas têm RLS ligado e nenhum acesso direto pelo navegador. Só a função `api` do servidor lê e grava. Ela confere o login (Supabase Auth) e o perfil (admin/equipe) de quem está usando, igual à versão atual.
