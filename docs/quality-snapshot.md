# Quality Snapshot

Data de referencia: 21 de fevereiro de 2026.

## Escopo

Snapshot operacional do pipeline para avaliar:

- cobertura funcional ponta a ponta
- integridade de dados
- qualidade de extracao estruturada
- cobertura semantica (pgvector)
- custo estimado para 10.000 empresas/mes

## Como foi medido

Comandos executados:

```bash
npm run lint
npm run typecheck
npm run build
npm run run:single -- "Fortescue"
npm run chunks:backfill
npm run assets:reextract
npm run cost:estimate -- --companies 10000
```

Auditoria SQL adicional:

- consistencia de chaves e vinculos entre `sources`, `raw_documents`, `assets`, `company_people`, `raw_chunks`
- cobertura de `raw_chunks` por `raw_document`
- qualidade de preenchimento em lideranca e ativos

## Resultado atual

### 1) Cobertura funcional

- pipeline E2E com empresa nova: **ok** (`Fortescue`)
- APIs principais (`/api/run`, `/api/companies`, `/api/companies/:id`, `/api/search`): **ok**
- UI exibindo dados persistidos: **ok**

### 2) Volume atual no banco

- companies: **5**
- sources: **34**
- raw_documents: **34**
- people: **154**
- assets: **110**
- raw_chunks: **486**

### 3) Integridade relacional

Todos os checks criticos estao em **0** inconsistencias:

- `raw_documents.company_id` vs `sources.company_id`
- `assets.company_id` vs `sources.company_id`
- `company_people.company_id` vs `sources.company_id`
- `raw_chunks.company_id` vs `raw_documents.company_id`

### 4) Qualidade de extracao

Lideranca:

- unknown type: **0.00%**
- missing title: **0.00%**

Ativos:

- unknown status: **23.64%** (26/110)
- missing country: **15.45%**

Observacao:

- unknown status caiu de **31.25%** para **23.64%** apos reextracao conservadora de ativos por `raw_documents`.

### 5) Cobertura semantica (pgvector)

- docs com chunks: **34/34 (100.00%)**
- cobertura anterior: **52.94%**
- ganho apos backfill: **+47.06 p.p.**

### 6) Qualidade de discovery

- fontes low-priority (dominios penalizados): **2.94%** (1/34)
- empresas com ambos tipos de fonte (`leadership` + `assets`): **5/5**

### 7) Custo estimado (10.000 empresas/mes)

- conservador: **$1,290.25/mes**
- base: **$934.44/mes**
- otimizado com cache: **$532.91/mes**

Leitura:

- cenario base permanece abaixo de **$1k/mes**.

## Conclusao

Estado atual: **apto para entrega tecnica**.

Pontos fortes:

- pipeline estavel, idempotente e observavel
- modelagem relacional consistente
- busca semantica com cobertura total dos documentos atuais
- custo base competitivo para o escopo

Risco residual principal:

- parte dos ativos ainda permanece com `status = unknown` quando a fonte nao traz sinal claro.
