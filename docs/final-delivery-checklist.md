# Checklist Final de Entrega

Data de referencia: 21 de fevereiro de 2026.

## 1) Ambiente e seguranca

- [x] `.env.local` configurado localmente
- [x] `.env*` ignorado via `.gitignore`
- [x] revisao por regex sem segredos expostos em arquivos do projeto

## 2) Banco e schema

- [x] schema aplicado (`database/init.sql`)
- [x] tabelas principais existentes (`companies`, `sources`, `raw_documents`, `people`, `company_people`, `assets`)
- [x] `raw_chunks` disponivel com `pgvector`
- [x] indice vetorial criado (`idx_raw_chunks_embedding_cosine`)

## 3) Pipeline principal

- [x] discovery por tipo (`leadership`, `assets`)
- [x] scrape com retry basico para erros transientes
- [x] idempotencia por hash SHA256 de conteudo
- [x] cache TTL por `source_id` para reduzir custo
- [x] extracao estruturada validada por Zod
- [x] persistencia relacional com upsert

## 4) Bonus semantico

- [x] chunking configuravel
- [x] embeddings por lote
- [x] persistencia vetorial em `raw_chunks`
- [x] busca semantica em `/api/search`

## 5) Validacoes de execucao

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run build`
- [x] `npm run run:single -- "Fortescue"` (cold run completo sem falhas)
- [x] `npm run run:single -- "Anglo American"` (cache hit e zero falhas)
- [x] `npm run search:test -- "platinum operations south africa"` (retornou resultados semanticos)
- [x] `npm run chunks:backfill` (cobertura de chunks elevada para 100%)
- [x] `npm run assets:reextract` (reducao de `unknown_status` em ativos)

## 6) Evidencias de dados no banco (snapshot)

- empresas: `5`
- fontes: `34`
- documentos brutos: `34`
- pessoas: `154`
- ativos: `110`
- chunks vetoriais: `486`

## 7) Entrega documental

- [x] `README.md` atualizado com setup, scripts e status
- [x] `docs/trade-offs.md` com decisoes e mitigacoes
- [x] `docs/cost-estimation-10k.md` com metodologia e cenarios
- [x] `docs/quality-snapshot.md` com indicadores tecnicos e de qualidade
- [x] estimativa de custo executada para 10.000 empresas/mes

## 8) Status de Go/No-Go

Status: **GO** para entrega do teste tecnico.

Risco residual principal:

- qualidade de fontes de discovery pode variar entre empresas; mitigacao atual via ranking/penalizacao e dedupe.
