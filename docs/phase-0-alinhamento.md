# Fase 0 - Alinhamento Tecnico (Gate de Implementacao)

Este documento fecha as decisoes de arquitetura e operacao antes da codificacao.
Se um item nao for alterado explicitamente, assume-se o valor recomendado.

## 1) Escopo de Entrega (MVP + Bonus)

- `MVP`: pipeline completo (discover -> scrape -> extracao estruturada -> persistencia), API e UI basicas.
- `Bonus`: embeddings com `pgvector` e endpoint de busca semantica.
- `Regra`: bonus so entra depois de MVP estavel e validado com empresa real.

Recomendacao: manter essa ordem sem antecipar bonus.

## 2) Ambiente e Runtime

- `Node.js`: v20 LTS
- `Framework`: Next.js App Router com TypeScript estrito
- `Package manager`: `npm`

Recomendacao: padronizar em Node 20 para reduzir variacoes em ambiente de avaliacao.

## 3) LLM e Modelo

- `Fornecedor`: OpenAI API
- `Tarefa`: extracao estruturada de leadership e assets em JSON estrito
- `Estrategia`: prompt com regras anti-hallucination + validacao Zod + 1 tentativa de reparo

Recomendacao:
- usar modelo robusto para extracao primaria (qualidade > latencia no teste)
- manter parametros deterministas (baixa variancia de saida)

## 4) Firecrawl e Descoberta

Consultas por empresa:
- `"{empresa} leadership board executives"`
- `"{empresa} operations mines projects assets"`

Classificacao de URL:
- `leadership` para paginas de governanca, diretoria, board, executivos
- `assets` para minas, projetos, operacoes, portfolio de ativos

Recomendacao:
- limitar top-N URLs por categoria para controle de custo
- ignorar PDFs muito extensos no MVP (pode entrar em fase de robustez)

## 5) Idempotencia e Deduplicacao

- Gerar `content_hash` SHA256 do conteudo bruto.
- Se hash ja existir para a mesma empresa+URL, pular reprocessamento de extracao.
- Garantir `upsert` nas tabelas de dominio (people/assets/associacoes).

Recomendacao:
- dedupe por hash do documento bruto + constraints unicas no banco.

## 6) Banco de Dados (Neon/PostgreSQL)

Tabelas alvo:
- `companies`
- `people`
- `company_people`
- `assets`
- `sources`
- `raw_documents`
- `raw_chunks` (opcional bonus)

Regras de unicidade:
- `companies.name` unico
- `assets (company_id, name)` unico
- `people (full_name, title)` unico (aceitando `title` nulo com cuidado)

Recomendacao:
- `ON DELETE CASCADE` somente em tabelas de relacionamento, evitar em entidades principais.
- indexes para chaves estrangeiras e colunas de busca.

## 7) Contratos de API

- `POST /api/run`:
  - entrada: `{ "input": "BHP, Rio Tinto" }`
  - processamento sequencial por empresa no MVP
  - saida com resumo por empresa (ok/falha, contagens)

- `GET /api/companies`:
  - lista paginada simples (MVP pode ser sem paginacao se volume baixo)

- `GET /api/companies/:id`:
  - empresa + leadership + assets + sources

- `GET /api/search?q=`:
  - somente no bonus com `pgvector`

Recomendacao:
- padronizar erros com codigo + mensagem + contexto minimo.

## 8) Observabilidade e Logs

- logs estruturados por etapa:
  - `discover.start|done`
  - `scrape.start|done|skip_hash`
  - `extract.start|done|retry|fail`
  - `db.upsert.done`

Recomendacao:
- sem dados sensiveis em log
- incluir `company_name`, `source_id`, duracao e contagens

## 9) Politica de Retry e Falhas

- Retry maximo: 1 para extracao JSON invalida
- Sem retry infinito em rede
- Falha de uma URL nao deve interromper empresa inteira
- Falha de uma empresa nao deve derrubar o lote

Recomendacao:
- capturar erro por etapa e retornar resumo final com falhas parciais.

## 10) Custo e Limites Operacionais

Premissas para estimativa de 10k empresas/mes:
- media de URLs descobertas por empresa
- media de tokens por documento extraido
- taxa de dedupe esperada por hash

Recomendacao:
- documentar formula de custo no README com faixas (otimista/base/pessimista).

## 11) Qualidade e Criterios de Aceite

Criticos:
- pipeline roda ponta a ponta com 1 empresa real sem ajuste manual
- sem quebra de contrato JSON apos Zod
- banco consistente com FKs e constraints
- UI exibe dados reais persistidos

Desejaveis:
- testes unitarios de parser/normalizacao
- smoke test de rota `/api/run`

## 12) Seguranca e Configuracao

- variaveis em `.env.local` (nao versionar segredos)
- publicar `.env.example` sem valores
- validacao de env no bootstrap

## 13) Convencoes de Codigo

- TypeScript estrito
- funcoes pequenas e focadas
- sem abstracoes prematuras
- comentarios apenas quando agregam contexto tecnico real

## 14) Gate para iniciar Fase 1

Se aprovado:
1. criar esqueleto Next.js + TypeScript
2. adicionar `init.sql` com schema relacional e constraints
3. configurar conexao Neon e validacao de ambiente
4. entregar primeira rodada de migracao + verificacoes locais
