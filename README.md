# Mining Intelligence Pipeline

Projeto de teste tecnico para montar um pipeline de inteligencia em mineracao.

O sistema recebe empresas, descobre paginas publicas, extrai dados estruturados (lideranca e ativos), salva no PostgreSQL e disponibiliza consulta via API/UI. O bonus de busca semantica usa `pgvector`.

## O que esta entregue

- pipeline E2E: discover -> scrape -> extracao -> persistencia
- deduplicacao por hash de conteudo e cache por fonte
- API: `/api/run`, `/api/companies`, `/api/companies/:id`, `/api/search`
- UI para executar pipeline, acompanhar resultados e consultar empresas
- estimativa de custo para 10.000 empresas/mes
- qualidade consolidada em snapshot tecnico

Referencias:

- `docs/phase-0-alinhamento.md`
- `docs/trade-offs.md`
- `docs/quality-snapshot.md`
- `docs/cost-estimation-10k.md`

## Stack

- Next.js (App Router) + TypeScript
- PostgreSQL (Neon) com `pg`
- Validacao de entrada/saida com `zod`
- Scrape e discovery com Firecrawl
- Extracao e embeddings com OpenAI
- Busca semantica em `pgvector` (tabela `raw_chunks`)

## Requisitos

- Node.js 20+
- npm 10+
- PostgreSQL (Neon recomendado)

## Setup rapido

1. Instalar dependencias:

```bash
npm install
```

2. Criar ambiente local:

PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Bash:

```bash
cp .env.example .env.local
```

3. Preencher variaveis em `.env.local`.

Obrigatorias para subir API/UI:

- `DATABASE_URL`

Obrigatorias para rodar pipeline e busca semantica:

- `OPENAI_API_KEY`
- `FIRECRAWL_API_KEY`

Opcionais (com default):

- `SCRAPE_CACHE_TTL_HOURS` (`24`)
- `CHUNK_TARGET_CHARS` (`1000`)
- `CHUNK_OVERLAP_CHARS` (`120`)
- `MAX_CHUNKS_PER_DOCUMENT` (`30`)
- `EMBEDDING_BATCH_SIZE` (`16`)
- `SEARCH_TOP_K` (`8`)

4. Aplicar schema:

```sql
\i database/init.sql
```

No Neon, pode executar o conteudo de `database/init.sql` no SQL Editor.

5. Rodar aplicacao:

```bash
npm run dev
```

6. Healthcheck:

- `GET http://localhost:3000/api/health/db`

## Fluxo de uso (manual)

1. Acesse `http://localhost:3000`.
2. Informe empresas separadas por virgula.
3. Clique em `Run Pipeline`.
4. Abra `Ver detalhes` para validar lideranca, ativos e fontes.
5. Teste busca semantica na mesma tela (`/api/search` por tras).

## Endpoints principais

- `POST /api/run`
  - body: `{ "input": "BHP, Rio Tinto" }`
  - processamento sequencial por empresa
  - inclui cache e dedupe por hash

- `GET /api/companies`
  - lista empresas processadas

- `GET /api/companies/:id`
  - empresa + lideranca + ativos + fontes

- `GET /api/search?q=...&limit=...`
  - busca semantica em `raw_chunks`

- `GET /api/health/db`
  - conectividade com banco

## Scripts uteis

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run typecheck`
- `npm run run:single -- "<empresa>"`
- `npm run search:test -- "<consulta>"`
- `npm run chunks:backfill`
- `npm run assets:reextract`
- `npm run cost:estimate -- --companies 10000`

## Evidencias de entrega

- `docs/quality-snapshot.md`: indicadores atuais de qualidade e integridade
- `docs/cost-estimation-10k.md`: metodologia e custo para 10k/mes
- `docs/final-delivery-checklist.md`: checklist final de entrega
- `docs/loom-script.md`: roteiro de video

## Observacao sobre credenciais

As credenciais nao sao versionadas.
O repositorio inclui apenas `.env.example`.
Para execucao local, crie `.env.local` com credenciais proprias ou temporarias.
