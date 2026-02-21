# Estimativa de Custo - 10.000 Empresas/Mes

Data de referencia: 21 de fevereiro de 2026.

## Objetivo

Estimar o custo operacional mensal do pipeline para processar 10.000 empresas.

A estimativa usa:

- metricas reais do banco (coletadas localmente)
- precos oficiais da OpenAI e da Firecrawl
- cenarios de operacao (conservador, base e otimizado com cache)

## Fontes Oficiais de Preco

- OpenAI pricing (modelo `gpt-4.1` e embeddings):  
  https://platform.openai.com/docs/pricing
- Firecrawl pricing (planos e creditos):  
  https://www.firecrawl.dev/pricing
- Firecrawl search credits (2 creditos por 10 resultados):  
  https://docs.firecrawl.dev/features/search
- Firecrawl scrape credits (1 credito por pagina):  
  https://docs.firecrawl.dev/usage-guide

## Metodologia

Comando executado:

```bash
npm run cost:estimate -- --companies 10000
```

Script:

- `scripts/estimate-monthly-cost.ts`

Metricas observadas no banco (amostra atual):

- empresas amostradas: `5`
- media de documentos por empresa: `6.8`
- media de tamanho por documento: `11,917` caracteres
- media de chunks por documento: `14.29`
- media de tokens por chunk: `110.09`

Premissas economicas usadas no script:

- OpenAI `gpt-4.1` input: `$2.00 / 1M tokens`
- OpenAI `gpt-4.1` output: `$8.00 / 1M tokens`
- OpenAI `text-embedding-3-small`: `$0.02 / 1M tokens`
- Firecrawl search: `2` creditos por `10` resultados
- Firecrawl scrape: `1` credito por pagina
- `2` buscas por empresa (leadership + assets)
- `12` resultados por busca

## Resultado (10.000 empresas/mes)

### 1) Conservador

- docs/empresa: `8.5`
- cache hit: `0%`
- Firecrawl: `133,000` creditos/mes
- plano estimado Firecrawl: `Standard` com overage (`1` pacote)
- custo Firecrawl: `$130.00`
- custo OpenAI: `$1,160.25`
- custo total: `$1,290.25 / mes`

### 2) Base

- docs/empresa: `6.8`
- cache hit: `0%`
- Firecrawl: `116,000` creditos/mes
- plano estimado Firecrawl: `Standard` com overage (`1` pacote)
- custo Firecrawl: `$130.00`
- custo OpenAI: `$804.44`
- custo total: `$934.44 / mes`

### 3) Otimizado com Cache

- docs/empresa: `6.12`
- cache hit: `35%`
- Firecrawl: `87,780` creditos/mes
- plano estimado Firecrawl: `Standard` sem overage
- custo Firecrawl: `$83.00`
- custo OpenAI: `$449.91`
- custo total: `$532.91 / mes`

## Leitura Executiva

- faixa estimada: **$532.91 a $1,290.25 / mes**
- cenario base atual: **$934.44 / mes**
- maior componente de custo: **tokens de extracao (`gpt-4.1`)**
- embeddings (`text-embedding-3-small`) sao custo baixo no desenho atual

## Observacoes Importantes

- Os valores variam com a qualidade de discovery e tamanho das paginas.
- Valores de Firecrawl podem mudar por plano/regiao/faturamento.
- A amostra atual tem 5 empresas; ampliar amostra continua melhorando confianca.
- O script permite recalculo rapido a cada ajuste do pipeline.
