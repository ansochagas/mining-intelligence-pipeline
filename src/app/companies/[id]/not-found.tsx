import Link from "next/link";

export default function CompanyNotFound() {
  return (
    <main style={{ padding: "2rem 1rem", maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ margin: 0 }}>Company not found.</h1>
      <p style={{ marginTop: "0.75rem" }}>
        The requested ID does not exist in the current database or has not been processed yet.
      </p>
      <Link href="/" style={{ color: "#1f5872", fontWeight: 600 }}>
        Back to home page
      </Link>
    </main>
  );
}
