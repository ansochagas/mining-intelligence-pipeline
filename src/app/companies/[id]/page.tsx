import Link from "next/link";
import { notFound } from "next/navigation";

import { getCompanyDetails } from "@/lib/data-access";

import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type CompanyDetailsPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function CompanyDetailsPage({ params }: CompanyDetailsPageProps) {
  const { id } = await params;
  const details = await getCompanyDetails(id);

  if (!details) {
    notFound();
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <Link className={styles.backLink} href="/">
          {"<- Voltar para pipeline"}
        </Link>

        <header className={styles.header}>
          <p className={styles.eyebrow}>Company Details</p>
          <h1>{details.company.name}</h1>
          <span>Criada em {new Date(details.company.created_at).toLocaleString()}</span>
        </header>

        <section className={styles.section}>
          <h2>Lideranca ({details.leadership.length})</h2>
          <div className={styles.leadershipGrid}>
            {details.leadership.map((person) => (
              <article key={person.person_id} className={styles.card}>
                <h3>{person.full_name}</h3>
                <p>
                  <strong>Cargo:</strong> {person.title ?? "n/a"}
                </p>
                <p>
                  <strong>Tipo:</strong> {person.type}
                </p>
                <p>
                  <strong>Expertise:</strong>{" "}
                  {person.expertise_tags.length > 0 ? person.expertise_tags.join(", ") : "n/a"}
                </p>
                <p>
                  <strong>Bullets:</strong> {person.bullets.length > 0 ? person.bullets.join(" | ") : "n/a"}
                </p>
                <p>
                  <strong>Fonte:</strong> {person.source_url ? <a href={person.source_url}>{person.source_url}</a> : "n/a"}
                </p>
              </article>
            ))}
            {details.leadership.length === 0 ? (
              <p className={styles.empty}>Nenhum registro de lideranca encontrado.</p>
            ) : null}
          </div>
        </section>

        <section className={styles.section}>
          <h2>Ativos ({details.assets.length})</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Status</th>
                  <th>Commodities</th>
                  <th>Pais</th>
                  <th>Regiao</th>
                  <th>Cidade</th>
                  <th>Latitude</th>
                  <th>Longitude</th>
                </tr>
              </thead>
              <tbody>
                {details.assets.map((asset) => (
                  <tr key={asset.asset_id}>
                    <td>{asset.name}</td>
                    <td>{asset.status}</td>
                    <td>{asset.commodities.join(", ") || "n/a"}</td>
                    <td>{asset.country ?? "n/a"}</td>
                    <td>{asset.region ?? "n/a"}</td>
                    <td>{asset.town ?? "n/a"}</td>
                    <td>{asset.latitude ?? "n/a"}</td>
                    <td>{asset.longitude ?? "n/a"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {details.assets.length === 0 ? <p className={styles.empty}>Nenhum ativo registrado.</p> : null}
        </section>

        <section className={styles.section}>
          <h2>Sources ({details.sources.length})</h2>
          <ul className={styles.sources}>
            {details.sources.map((source) => (
              <li key={source.id}>
                <span className={styles.sourceType}>{source.source_type}</span>
                <a href={source.url}>{source.url}</a>
              </li>
            ))}
          </ul>
          {details.sources.length === 0 ? <p className={styles.empty}>Nenhuma fonte descoberta.</p> : null}
        </section>
      </main>
    </div>
  );
}
