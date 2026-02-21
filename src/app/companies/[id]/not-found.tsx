import Link from "next/link";

export default function CompanyNotFound() {
  return (
    <main style={{ padding: "2rem 1rem", maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ margin: 0 }}>Empresa nao encontrada.</h1>
      <p style={{ marginTop: "0.75rem" }}>
        O ID solicitado nao existe no banco atual ou ainda nao foi processado.
      </p>
      <Link href="/" style={{ color: "#1f5872", fontWeight: 600 }}>
        Voltar para a pagina inicial
      </Link>
    </main>
  );
}
