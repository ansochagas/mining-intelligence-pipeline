# Roteiro de Loom (6 a 8 minutos)

Data de referencia: 21 de fevereiro de 2026.

Objetivo do video: mostrar que o pipeline funciona ponta a ponta com dados reais, possui controle de custo e entrega dados estruturados com rastreabilidade.

## Antes de gravar (checklist rapido)

- terminal aberto na raiz do projeto
- app rodando com `npm run dev`
- navegador aberto em `http://localhost:3000`
- deixar `README.md`, `docs/quality-snapshot.md` e `docs/cost-estimation-10k.md` acessiveis

## 0:00 - 0:40 | Contexto

Fala sugerida:

- "Este projeto recebe empresas de mineracao, descobre fontes publicas, extrai lideranca e ativos, e persiste em PostgreSQL."
- "Tambem inclui busca semantica opcional com pgvector."

Tela:

- `README.md` (topo + secoes de setup/fluxo)

## 0:40 - 1:40 | Arquitetura

Fala sugerida:

- "A aplicacao usa Next.js App Router para API e interface."
- "O pipeline principal esta em `run.ts`; Firecrawl cuida de discovery/scrape e OpenAI da extracao estruturada."
- "A modelagem relacional e constraints estao em `database/init.sql`."

Tela:

- `src/lib/pipeline/run.ts`
- `src/lib/clients/firecrawl.ts`
- `src/lib/clients/openai.ts`
- `database/init.sql`

## 1:40 - 2:50 | Demo de execucao (pipeline)

Terminal:

```bash
npm run run:single -- "Fortescue"
```

Pontos para comentar:

- `discoveredSources`, `scrapedSources`, `failedSources`
- se houver reexecucao: `skippedByCache` para demonstrar idempotencia/custo

## 2:50 - 3:50 | UI e dados persistidos

Navegador:

- pagina `/` (input, resumo da execucao, lista de empresas)
- abrir detalhe em `/companies/:id`

Pontos para comentar:

- cards de lideranca
- tabela de ativos
- lista de `sources` usadas na extracao

## 3:50 - 4:40 | Busca semantica

Terminal (ou UI):

```bash
npm run search:test -- "platinum operations south africa"
```

Pontos para comentar:

- resultado com score e snippet
- busca baseada em embeddings de `raw_chunks`

## 4:40 - 5:40 | Qualidade e consistencia

Tela:

- `docs/quality-snapshot.md`

Pontos para comentar:

- integridade relacional sem inconsistencias
- cobertura de chunks: 100% dos `raw_documents`
- melhoria de `unknown_status` apos reextracao de ativos

## 5:40 - 6:40 | Custo e trade-offs

Tela:

- `docs/cost-estimation-10k.md`
- `docs/trade-offs.md`

Pontos para comentar:

- cenario base para 10k empresas/mes: ~`$934.44/mes`
- faixa estimada: `$532.91` a `$1,290.25`
- decisoes de engenharia: sequencialidade no MVP, dedupe/hash, cache TTL, validacao com Zod

## 6:40 - 7:00 | Encerramento

Fala sugerida:

- "O pipeline esta pronto para uso no escopo do teste: funcional, rastreavel, com controle de custo e dados estruturados consistentes."
