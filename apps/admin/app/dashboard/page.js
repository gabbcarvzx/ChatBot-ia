import Link from "next/link";

import { logoutAction } from "@/app/actions/auth";
import { apiRequest } from "@/lib/backend";
import { requireSession } from "@/lib/session";

export default async function DashboardPage() {
  const session = await requireSession();
  const [onboarding, profile, subscription] = await Promise.all([
    apiRequest("/v1/onboarding/status", {
      token: session.accessToken,
      tenantId: session.tenantId,
    }),
    apiRequest("/v1/business-profile", {
      token: session.accessToken,
      tenantId: session.tenantId,
    }),
    apiRequest("/v1/subscription", {
      token: session.accessToken,
      tenantId: session.tenantId,
    }),
  ]);

  return (
    <main className="page-shell">
      <header className="topbar">
        <div>
          <p className="muted">Painel do tenant</p>
          <h1 className="brand-title" style={{ fontSize: "2.5rem" }}>
            {profile.businessName}
          </h1>
        </div>
        <nav>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/onboarding">Onboarding</Link>
          <form action={logoutAction}>
            <button className="ghost" type="submit">
              Sair
            </button>
          </form>
        </nav>
      </header>

      <section className="dashboard-grid">
        <article className="panel-card">
          <p className="muted">Status comercial</p>
          <div className="status-badge">{onboarding.status}</div>
        </article>
        <article className="panel-card">
          <p className="muted">Assinatura</p>
          <strong>
            {subscription.planCode} / {subscription.status}
          </strong>
        </article>
        <article className="panel-card">
          <p className="muted">Email do owner</p>
          <strong>{session.userEmail}</strong>
        </article>
        <article className="panel-card">
          <p className="muted">Localizacao</p>
          <strong>{profile.locationLabel ?? "Nao preenchida"}</strong>
        </article>
      </section>

      <section className="panel-card" style={{ marginTop: 18 }}>
        <h2>Checklist de ativacao</h2>
        <ul className="checklist">
          {Object.entries(onboarding.checklist).map(([key, ready]) => (
            <li className={ready ? "ready" : ""} key={key}>
              {key}: {ready ? "ok" : "pendente"}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
