# ✦ Studio CRM: CRM para studio de maquiagem, sobrancelha e penteado

Portal web com senha, feito em **Google Apps Script**. Os dados ficam numa **planilha Google** na sua conta, a agenda é sincronizada com o **Google Agenda** e os lembretes saem **automaticamente pelo WhatsApp**.

## O que tem

| Módulo | Recursos |
|---|---|
| **Painel** | Faturamento do mês (com variação vs. mês anterior), lucro, atendimentos, ticket médio, a receber. Mostra a agenda do dia com ações rápidas, alertas (pedidos de remarcação, horários não confirmados, aniversário hoje), receitas × despesas dos últimos 6 meses, serviços em alta, aniversariantes e clientes para reativar |
| **Agenda** | Visões de dia, semana, mês e lista. Dá para arrastar e soltar para remarcar. Detecta conflito de horário, filtra por profissional e mostra seus compromissos pessoais do Google Agenda (hachurados) |
| **Agendamento** | Vários serviços por horário (ex.: make + penteado), valor e duração automáticos, desconto, **sinal/reserva** (lança no caixa), local (studio/domicílio/evento) e confirmação por WhatsApp |
| **Google Agenda** | Tudo que você cria, altera, remarca ou cancela no CRM vai para a agenda: título com status, telefone com link do WhatsApp, alergias, valor e cor por categoria |
| **Clientes** | Ficha completa com ficha de beleza (tipo de pele, tom de base, sobrancelha, alergias, anamnese), histórico, total gasto e mensagens. Filtros: com horário, aniversariantes, para reativar, novas |
| **Financeiro** | Receitas e despesas, contas a pagar e a receber, atrasados, despesas recorrentes (aluguel, MEI…) e exportação CSV. O atendimento finalizado entra no caixa sozinho, já descontando o sinal |
| **Relatórios** | DRE simplificada, fluxo de caixa, faturamento por serviço e por categoria, comissões da equipe, formas de pagamento, top clientes, dias e horários mais movimentados. Exporta CSV e imprime |
| **WhatsApp** | Confirmação ao agendar, lembrete 1 (ex.: 24h antes), lembrete 2 (ex.: 2h antes), pós-atendimento e aniversário. **Lê as respostas**: "1" confirma o horário e "2" marca pedido de remarcação. Modelos editáveis com prévia e horário de silêncio |
| **Celular** | Funciona como aplicativo: barra inferior com botão **+** para agendar, agenda com dias para deslizar e horários livres clicáveis, atalhos rápidos, listas de toque e formulários em tela cheia. Dá para adicionar à tela inicial |
| **Segurança** | Login com senha (hash + salt), sessão de 6h e bloqueio após 5 tentativas erradas. Perfis **Administradora** (vê tudo) e **Equipe** (só agenda e clientes) |

Provedores de WhatsApp suportados: **Z-API**, **Evolution API**, **WhatsApp Cloud API (Meta)** e **webhook genérico** (n8n, Make…).

---

## Instalação passo a passo (± 15 minutos)

### 1. Crie a planilha e o projeto

1. Acesse [sheets.new](https://sheets.new) e dê o nome **Studio CRM**.
2. No menu, abra **Extensões → Apps Script**.
3. Em **Configurações do projeto** (ícone ⚙️), marque **"Mostrar arquivo de manifesto appsscript.json no editor"**.

### 2. Copie os arquivos

Na pasta [`apps-script/`](apps-script/) estão todos os arquivos. No editor do Apps Script:

| Arquivo deste repositório | Como criar no editor |
|---|---|
| `appsscript.json` | já existe: substitua o conteúdo |
| `Code.gs` | já existe: substitua o conteúdo |
| `Database.gs`, `Auth.gs`, `Config.gs`, `Cadastros.gs`, `Agenda.gs`, `Financeiro.gs`, `Relatorios.gs`, `WhatsApp.gs` | **+ → Script** (digite o nome **sem** `.gs`) |
| `Index.html`, `Brand.html`, `Styles.html`, `Scripts.html` | **+ → HTML** (digite `Index`, `Brand`, `Styles` e `Scripts`) |

> Os nomes dos arquivos HTML precisam ser exatamente `Index`, `Brand`, `Styles` e `Scripts`.

Clique em 💾 **Salvar**.

### 3. Rode a instalação

1. Na barra de cima, escolha a função **`instalar`** e clique em **▶ Executar**.
2. O Google vai pedir autorização: **Revisar permissões → sua conta → Avançado → Acessar Studio CRM (não seguro) → Permitir**. Esse aviso aparece porque o app é seu e não passou pela verificação do Google. É normal.
3. No **Registro de execução** aparecem a **senha provisória** do usuário `admin` e o link da planilha. Anote a senha.

A instalação cria as abas da planilha, 11 serviços de exemplo (você pode editar), o usuário administrador e o gatilho que dispara os lembretes a cada 15 minutos.

### 4. Publique o portal

1. **Implantar → Nova implantação → ⚙️ → App da Web**
2. **Executar como:** *Eu*
   **Quem pode acessar:** *Qualquer pessoa*. O acesso continua protegido pela senha do portal.
3. **Implantar** e copie a URL que termina em `/exec`. Esse é o endereço do seu CRM. Salve nos favoritos do celular ou adicione à tela inicial.
4. Entre com `admin` e a senha provisória. O sistema vai pedir para você criar sua senha definitiva.

> **Atualizou o código?** Vá em **Implantar → Gerenciar implantações → ✏️ → Versão: Nova versão → Implantar**. Assim a URL continua a mesma.

### 5. Configure no portal

1. **Configurações:** nome do studio, endereço, Instagram, Pix e horário de funcionamento.
2. **Configurações → Google Agenda:** escolha a agenda. Dica: crie uma agenda só do studio no Google Agenda (ex.: "Studio – Atendimentos") e selecione aqui.
3. **Serviços & Equipe:** ajuste preços e durações e cadastre as profissionais com a comissão de cada uma.
4. **WhatsApp:** veja abaixo.

---

## WhatsApp automático

### Z-API (recomendado)

1. No painel da [Z-API](https://z-api.io), abra sua instância e copie o **ID da instância** e o **Token**.
2. Se a opção **Segurança → Client-Token** estiver ativada na sua conta, copie também o Client-Token.
3. No CRM, abra **WhatsApp → Provedor: Z-API**, cole os dados e clique em **Salvar conexão** e depois em **Enviar teste**.
4. Ligue **"Ligar mensagens automáticas"**, escolha quais mensagens enviar e clique em **Salvar automações**.
5. Para a cliente confirmar respondendo **1**, copie o endereço em **Receber respostas** e cole na Z-API em **Webhooks → Ao receber**.

### Evolution API
Informe a URL do servidor, o nome da instância e a API Key. Configure o webhook com o evento `MESSAGES_UPSERT` apontando para o endereço de **Receber respostas**.

### WhatsApp Cloud API (Meta oficial)
A Meta só permite **iniciar** conversa com **templates aprovados**. Crie os templates no Gerenciador do WhatsApp com as variáveis `{{1}}` nome, `{{2}}` data, `{{3}}` hora e `{{4}}` serviço, e informe os nomes no campo JSON, por exemplo:
```json
{"confirmacao": "confirmacao_horario", "lembrete1": "lembrete_horario", "lembrete2": "lembrete_hoje"}
```

### Como os lembretes funcionam
- O gatilho roda a cada **15 minutos** e envia o que estiver no prazo (ex.: 24h e 2h antes).
- Cada lembrete é enviado **uma vez só**. Se você remarcar o horário, os lembretes são reenviados para a nova data.
- Se o horário foi marcado em cima da hora (já dentro da janela do lembrete e com a confirmação enviada), o lembrete repetido é dispensado.
- Nada é enviado no **horário de silêncio** (padrão: 21h às 8h).
- Cada execução envia no máximo 30 mensagens, com uma pausa entre elas, para evitar bloqueio por spam.
- Tudo fica registrado em **WhatsApp → Histórico** e na aba `Mensagens` da planilha.

Variáveis disponíveis nos modelos: `{nome}` `{nomeCompleto}` `{servico}` `{data}` `{hora}` `{diaSemana}` `{profissional}` `{valor}` `{studio}` `{endereco}` `{instagram}` `{pix}`

---

## Dúvidas comuns

**Aparece "Este aplicativo foi criado por um usuário do Google Apps Script" no topo.**
O Google mostra essa faixa quando o link `/exec` é aberto direto. Ela some quando o CRM é aberto dentro de outra página. Há duas formas:

- **Portal próprio (recomendado):** a pasta [`portal/`](portal/) tem uma página pronta com a sua logo, que abre o CRM em tela cheia e instala no celular como aplicativo.
  1. Abra `portal/index.html` num editor de texto e cole o seu link `/exec` na linha `var LINK_DO_APP = '...'`.
  2. Entre em [app.netlify.com/drop](https://app.netlify.com/drop) e arraste a pasta `portal` inteira. Em segundos você recebe um link (dá para trocar o nome em *Site settings*).
  3. Use esse link novo no lugar do `/exec` e adicione à tela inicial do celular.
- **Google Sites:** crie um site em [sites.google.com](https://sites.google.com), use **Inserir → Incorporar → Por URL**, cole o link `/exec` e estique o quadro para ocupar a página toda.

**A agenda que eu quero usar é de outro e-mail.**
Na conta dona da agenda, abra o Google Agenda no computador e vá em **⚙️ Configurações → clique na agenda → Compartilhar com pessoas específicas**. Adicione o e-mail da conta onde o Apps Script está instalado com a permissão **"Fazer alterações nos eventos"**. Depois, no CRM, abra **Configurações → Google Agenda → Agenda: ➕ Agenda de outro e-mail…**, digite o e-mail, clique em **Salvar** e em **Reenviar horários futuros**. Os horários que estavam na agenda antiga são movidos para a nova.

**Esqueci a senha.**
No editor do Apps Script, rode a função **`redefinirSenhaAdmin`**. Uma nova senha provisória aparece no registro de execução.

**Os lembretes pararam.**
No editor, rode **`reinstalarGatilhos`**. Confira também se **"Ligar mensagens automáticas"** está ativado.

**Um horário não apareceu no Google Agenda.**
Abra o agendamento e veja o status da sincronização. Em **Configurações → Reenviar horários futuros**, tudo é reenviado.

**Onde ficam meus dados? Como faço backup?**
Na planilha (**Configurações → Abrir planilha de dados**). Para ter um backup, use **Arquivo → Fazer uma cópia**. Você pode filtrar e criar gráficos, mas não renomeie a primeira linha (cabeçalhos) das abas.

**Limites do Google (conta gratuita):** 20.000 chamadas externas por dia e 90 min/dia de gatilhos. Isso é muito acima do que um studio usa.

---

## Para desenvolvedores

```
crm-studio/
├── apps-script/        ← tudo que vai para o Apps Script
│   ├── appsscript.json   manifesto (fuso, permissões, web app)
│   ├── Code.gs           doGet, roteador da API, utilitários, instalar()
│   ├── Database.gs       camada de dados sobre a planilha
│   ├── Auth.gs           login, sessões, usuários
│   ├── Config.gs         configurações e modelos de mensagem
│   ├── Cadastros.gs      clientes, serviços, equipe
│   ├── Agenda.gs         agendamentos + Google Agenda
│   ├── Financeiro.gs     lançamentos
│   ├── Relatorios.gs     painel e relatórios
│   ├── WhatsApp.gs       envio, automações, webhook (doPost)
│   ├── Index.html        estrutura da página
│   ├── Brand.html        logos da marca embutidas (gerado por dev/build-brand.py)
│   ├── Styles.html       CSS (tema claro/escuro, responsivo)
│   └── Scripts.html      front-end (SPA em JS puro + Chart.js + FullCalendar)
├── marca/              ← logos originais (circular e horizontal)
├── portal/             ← página de entrada sem a faixa do Google + ícones para instalar no celular
└── dev/                ← só para testar fora do Google
    ├── build-brand.py    gera Brand.html a partir das logos (troque os PNGs e rode de novo)
    ├── gas-mock.js       simulador dos serviços do Apps Script
    ├── test.js           31 testes ponta a ponta do backend
    ├── seed.js           dados de demonstração
    └── build-preview.js  gera preview.html (portal rodando no navegador)
```

```bash
TZ=America/Sao_Paulo node crm-studio/dev/test.js
```

```bash
node crm-studio/dev/build-preview.js
```

Para o preview, abra `crm-studio/dev/preview.html` no navegador e entre com `admin` / `demo1234`.

Também dá para publicar com o [clasp](https://github.com/google/clasp) usando `rootDir` apontando para `crm-studio/apps-script`.

**Segurança:** toda função global do Apps Script sem `_` no final pode ser chamada pelo navegador. Por isso as funções internas terminam com `_`. As únicas públicas são `login`, `api`, `include`, `doGet`/`doPost`, o gatilho `processarLembretes` e as funções de editor (`instalar`, `redefinirSenhaAdmin`, `reinstalarGatilhos`), que recusam execução fora do editor.
