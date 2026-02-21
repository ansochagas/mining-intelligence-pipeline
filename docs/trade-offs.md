# Trade-offs de Engenharia

Data de referencia: 20 de fevereiro de 2026.

## 1. Sequencial vs Concorrente

Decisao:

- processamento sequencial por empresa e por fonte

Motivo:

- menor risco de rate limit em APIs externas
- fluxo mais previsivel para debug
- controle mais simples de custo

Trade-off:

- menor throughput bruto comparado a concorrencia

Mitigacao:

- manter desenho sequencial no MVP
- evoluir para concorrencia controlada por limites (fila + worker pool) apos estabilidade

## 2. Discover com Busca Ampla vs Whitelist Rigida

Decisao:

- usar buscas abertas da Firecrawl + ranking de relevancia por score

Motivo:

- maior autonomia para empresas novas e dominios nao padronizados

Trade-off:

- risco de fontes nao oficiais

Mitigacao:

- penalizacao de dominios de baixa prioridade
- deduplicacao por URL normalizada
- limite maximo de fontes por tipo

## 3. Extracao LLM vs Parsing Deterministico

Decisao:

- extracao estruturada com `gpt-4.1` + validacao Zod obrigatoria

Motivo:

- robustez maior para paginas heterogeneas sem schema fixo

Trade-off:

- custo por token
- chance de JSON invalido

Mitigacao:

- prompts com JSON estrito
- retry de correcao limitado
- truncamento de entrada para teto de custo

## 4. Idempotencia por Hash de Conteudo

Decisao:

- hash SHA256 por documento bruto + unique key por empresa/hash

Motivo:

- evita reprocessar conteudo repetido
- melhora rastreabilidade

Trade-off:

- mudancas pequenas no texto geram novo hash

Mitigacao:

- cache TTL por `source_id` para evitar scrape recorrente em janela curta

## 5. Modelo Relacional Normalizado

Decisao:

- tabelas separadas (`companies`, `people`, `company_people`, `assets`, `sources`, `raw_documents`)

Motivo:

- consistencia de dados
- reuso de entidades e historico de origem

Trade-off:

- mais joins em leitura

Mitigacao:

- indices por chaves de consulta
- endpoints ja preparados para agregacao por empresa

## 6. Embeddings Opcionais (pgvector)

Decisao:

- `raw_chunks` e busca semantica como bonus opcional

Motivo:

- agrega valor de consulta sem comprometer o core

Trade-off:

- adiciona custo de embeddings
- aumenta armazenamento

Mitigacao:

- chunking com limite por documento
- batch de embeddings
- fallback automatico quando `raw_chunks` nao existe

## 7. Custo: Qualidade vs Economia

Decisao:

- priorizar confiabilidade da extracao no MVP e controlar custo via limites

Motivo:

- objetivo do teste enfatiza robustez e qualidade estruturada

Trade-off:

- custo maior que abordagens agressivas de heuristica simples

Mitigacao:

- limites de fontes por tipo
- dedupe por hash
- cache TTL
- monitoramento de custo por script (`cost:estimate`)
