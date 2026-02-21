"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import styles from "./page.module.css";

type CompanyListItem = {
  id: string;
  name: string;
  created_at: string;
};

type RunResultItem = {
  companyId: string | null;
  companyName: string;
  discoveredSources: number;
  scrapedSources: number;
  skippedByCache: number;
  skippedByHash: number;
  chunkRecords: number;
  embeddingFailures: number;
  leadershipRecords: number;
  assetRecords: number;
  failedSources: number;
  errors: string[];
};

type RunSummary = {
  startedAt: string;
  finishedAt: string;
  companiesRequested: number;
  companiesProcessed: number;
  results: RunResultItem[];
};

type SearchResultItem = {
  chunkId: number;
  companyId: string;
  companyName: string;
  sourceType: "leadership" | "assets" | "unknown" | null;
  sourceUrl: string | null;
  similarity: number;
  snippet: string;
};

const DEFAULT_INPUT = "BHP, Pilbara Minerals, Rio Tinto";
const DEFAULT_SEARCH_QUERY = "copper operations in Chile";

export default function Home() {
  const [input, setInput] = useState(DEFAULT_INPUT);
  const [searchQuery, setSearchQuery] = useState(DEFAULT_SEARCH_QUERY);
  const [running, setRunning] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [companies, setCompanies] = useState<CompanyListItem[]>([]);

  useEffect(() => {
    void refreshCompanies();
  }, []);

  const totals = useMemo(() => {
    if (!summary) {
      return null;
    }

    return summary.results.reduce(
      (acc, item) => {
        acc.discovered += item.discoveredSources;
        acc.scraped += item.scrapedSources;
        acc.cache += item.skippedByCache;
        acc.skipped += item.skippedByHash;
        acc.chunks += item.chunkRecords;
        acc.embeddingFailures += item.embeddingFailures;
        acc.people += item.leadershipRecords;
        acc.assets += item.assetRecords;
        acc.failed += item.failedSources;
        return acc;
      },
      {
        discovered: 0,
        scraped: 0,
        cache: 0,
        skipped: 0,
        chunks: 0,
        embeddingFailures: 0,
        people: 0,
        assets: 0,
        failed: 0,
      },
    );
  }, [summary]);

  async function refreshCompanies() {
    setLoadingCompanies(true);
    try {
      const response = await fetch("/api/companies", { method: "GET" });
      const data = (await response.json()) as { companies?: CompanyListItem[]; error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load companies.");
      }

      setCompanies(data.companies ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error while loading companies.";
      setErrorMessage(message);
    } finally {
      setLoadingCompanies(false);
    }
  }

  async function handleRun() {
    const normalized = input.trim();
    if (!normalized) {
      setErrorMessage("Please provide at least one company.");
      return;
    }

    setRunning(true);
    setErrorMessage(null);
    setSummary(null);

    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: normalized }),
      });

      const data = (await response.json()) as RunSummary & { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(data.message ?? data.error ?? "Failed to run pipeline.");
      }

      setSummary(data);
      await refreshCompanies();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown execution error.";
      setErrorMessage(message);
    } finally {
      setRunning(false);
    }
  }

  async function handleSearch() {
    const query = searchQuery.trim();
    if (!query) {
      setSearchError("Please provide a semantic query.");
      return;
    }

    setSearching(true);
    setSearchError(null);

    try {
      const params = new URLSearchParams({ q: query });
      const response = await fetch(`/api/search?${params.toString()}`, { method: "GET" });
      const data = (await response.json()) as {
        results?: SearchResultItem[];
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(data.message ?? data.error ?? "Semantic search failed.");
      }

      setSearchResults(data.results ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown semantic search error.";
      setSearchError(message);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>Mining Intelligence Pipeline</p>
        </section>

        <section className={styles.panel}>
          <label className={styles.label} htmlFor="companies-input">
            Mining companies
          </label>
          <textarea
            id="companies-input"
            className={styles.textarea}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={4}
            placeholder="BHP, Pilbara Minerals, Rio Tinto"
            disabled={running}
          />

          <div className={styles.actions}>
            <button className={styles.button} onClick={handleRun} disabled={running}>
              {running ? "Running..." : "Run Pipeline"}
            </button>
            <button className={styles.ghostButton} onClick={() => void refreshCompanies()} disabled={running}>
              Refresh Companies
            </button>
          </div>
        </section>

        <section className={styles.searchPanel}>
          <label className={styles.label} htmlFor="semantic-search-input">
            Semantic search (pgvector)
          </label>
          <input
            id="semantic-search-input"
            className={styles.searchInput}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="e.g. copper operations in Chile"
            disabled={searching}
          />
          <div className={styles.actions}>
            <button className={styles.button} onClick={handleSearch} disabled={searching}>
              {searching ? "Searching..." : "Search"}
            </button>
          </div>
          {searchError ? <p className={styles.errorInline}>{searchError}</p> : null}
          <div className={styles.searchResults}>
            {searchResults.map((item) => (
              <article key={item.chunkId} className={styles.searchResultItem}>
                <header>
                  <strong>{item.companyName}</strong>
                  <span>score {item.similarity}</span>
                </header>
                <p>{item.snippet}</p>
                <footer>
                  <span>{item.sourceType ?? "unknown"}</span>
                  {item.sourceUrl ? (
                    <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                      source
                    </a>
                  ) : (
                    <span>source n/a</span>
                  )}
                </footer>
              </article>
            ))}
            {searchResults.length === 0 && !searching ? (
              <p className={styles.emptySearch}>No search results yet.</p>
            ) : null}
          </div>
        </section>

        {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}

        {summary && totals ? (
          <section className={styles.summary}>
            <h2>Execution summary</h2>
            <p>
              Window: {new Date(summary.startedAt).toLocaleString("en-US")} {"->"}{" "}
              {new Date(summary.finishedAt).toLocaleString("en-US")}
            </p>
            <div className={styles.metrics}>
              <MetricCard label="Discovered" value={totals.discovered} />
              <MetricCard label="Scrapes" value={totals.scraped} />
              <MetricCard label="Skip Cache" value={totals.cache} />
              <MetricCard label="Skip Hash" value={totals.skipped} />
              <MetricCard label="Chunks" value={totals.chunks} />
              <MetricCard label="Emb Fail" value={totals.embeddingFailures} />
              <MetricCard label="Leadership" value={totals.people} />
              <MetricCard label="Assets" value={totals.assets} />
              <MetricCard label="Failures" value={totals.failed} />
            </div>
            <div className={styles.resultList}>
              {summary.results.map((item) => (
                <article key={`${item.companyName}-${item.companyId ?? "none"}`} className={styles.resultItem}>
                  <header>
                    <h3>{item.companyName}</h3>
                    {item.companyId ? <Link href={`/companies/${item.companyId}`}>View details</Link> : null}
                  </header>
                  <p>
                    Discovered: {item.discoveredSources} | Scrapes: {item.scrapedSources} | Skip Cache:{" "}
                    {item.skippedByCache} | Skip Hash: {item.skippedByHash}
                  </p>
                  <p>
                    Leadership: {item.leadershipRecords} | Assets: {item.assetRecords} | Chunks:{" "}
                    {item.chunkRecords} | Emb Fail: {item.embeddingFailures} | Failures: {item.failedSources}
                  </p>
                  {item.errors.length > 0 ? (
                    <ul>
                      {item.errors.slice(0, 4).map((entry) => (
                        <li key={entry}>{entry}</li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className={styles.companies}>
          <div className={styles.companiesHeader}>
            <h2>Processed companies</h2>
            <span>{loadingCompanies ? "Loading..." : `${companies.length} registered`}</span>
          </div>
          <div className={styles.companyList}>
            {companies.map((company) => (
              <Link className={styles.companyItem} key={company.id} href={`/companies/${company.id}`}>
                <strong>{company.name}</strong>
                <span>{new Date(company.created_at).toLocaleString("en-US")}</span>
              </Link>
            ))}
            {companies.length === 0 && !loadingCompanies ? (
              <p className={styles.emptyState}>No processed companies yet.</p>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <article className={styles.metricCard}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
