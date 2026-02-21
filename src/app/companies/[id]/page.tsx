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
          {"<- Back to pipeline"}
        </Link>

        <header className={styles.header}>
          <p className={styles.eyebrow}>Company Details</p>
          <h1>{details.company.name}</h1>
          <span>Created at {new Date(details.company.created_at).toLocaleString("en-US")}</span>
        </header>

        <section className={styles.section}>
          <h2>Leadership ({details.leadership.length})</h2>
          <div className={styles.leadershipGrid}>
            {details.leadership.map((person) => (
              <article key={person.person_id} className={styles.card}>
                <h3>{person.full_name}</h3>
                <p>
                  <strong>Role:</strong> {person.title ?? "n/a"}
                </p>
                <p>
                  <strong>Type:</strong> {person.type}
                </p>
                <p>
                  <strong>Expertise:</strong>{" "}
                  {person.expertise_tags.length > 0 ? person.expertise_tags.join(", ") : "n/a"}
                </p>
                <p>
                  <strong>Bullets:</strong> {person.bullets.length > 0 ? person.bullets.join(" | ") : "n/a"}
                </p>
                <p>
                  <strong>Source:</strong> {person.source_url ? <a href={person.source_url}>{person.source_url}</a> : "n/a"}
                </p>
              </article>
            ))}
            {details.leadership.length === 0 ? (
              <p className={styles.empty}>No leadership records found.</p>
            ) : null}
          </div>
        </section>

        <section className={styles.section}>
          <h2>Assets ({details.assets.length})</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Commodities</th>
                  <th>Country</th>
                  <th>Region</th>
                  <th>Town</th>
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
          {details.assets.length === 0 ? <p className={styles.empty}>No assets recorded.</p> : null}
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
          {details.sources.length === 0 ? <p className={styles.empty}>No discovered sources.</p> : null}
        </section>
      </main>
    </div>
  );
}
