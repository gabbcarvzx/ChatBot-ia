import Link from "next/link";

import {
  createCatalogItemAction,
  createFaqAction,
  saveHoursAction,
  saveProfileAction,
} from "@/app/actions/onboarding";
import { apiRequest } from "@/lib/backend";
import { requireSession } from "@/lib/session";

export default async function OnboardingPage() {
  const session = await requireSession();
  const [profile, status, hours, faqItems, catalogItems] = await Promise.all([
    apiRequest("/v1/business-profile", {
      token: session.accessToken,
      tenantId: session.tenantId,
    }),
    apiRequest("/v1/onboarding/status", {
      token: session.accessToken,
      tenantId: session.tenantId,
    }),
    apiRequest("/v1/business-hours", {
      token: session.accessToken,
      tenantId: session.tenantId,
    }),
    apiRequest("/v1/faq-items", {
      token: session.accessToken,
      tenantId: session.tenantId,
    }),
    apiRequest("/v1/catalog-items", {
      token: session.accessToken,
      tenantId: session.tenantId,
    }),
  ]);

  return (
    <main className="page-shell">
      <header className="topbar">
        <div>
          <p className="muted">Onboarding comercial</p>
          <h1 className="brand-title" style={{ fontSize: "2.4rem" }}>
            Preparar tenant para ativacao
          </h1>
        </div>
        <nav>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/onboarding">Onboarding</Link>
        </nav>
      </header>

      <section className="panel-card" style={{ marginBottom: 18 }}>
        <p className="muted">Status atual</p>
        <div className="status-badge">{status.status}</div>
      </section>

      <section className="onboarding-grid">
        <article className="panel-card">
          <h2>1. Perfil da empresa</h2>
          <form className="form-stack" action={saveProfileAction}>
            <div className="field">
              <label htmlFor="businessName">Nome da empresa</label>
              <input defaultValue={profile.businessName ?? ""} id="businessName" name="businessName" required />
            </div>
            <div className="field">
              <label htmlFor="description">Descricao</label>
              <textarea defaultValue={profile.description ?? ""} id="description" name="description" />
            </div>
            <div className="two-col">
              <div className="field">
                <label htmlFor="locationLabel">Localizacao curta</label>
                <input defaultValue={profile.locationLabel ?? ""} id="locationLabel" name="locationLabel" required />
              </div>
              <div className="field">
                <label htmlFor="paymentMethods">Pagamentos</label>
                <input
                  defaultValue={(profile.paymentMethods ?? []).join(", ")}
                  id="paymentMethods"
                  name="paymentMethods"
                  placeholder="pix, cartao, dinheiro"
                  required
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="fullAddress">Endereco completo</label>
              <input defaultValue={profile.fullAddress ?? ""} id="fullAddress" name="fullAddress" required />
            </div>
            <button className="cta" type="submit">
              Salvar perfil
            </button>
          </form>
        </article>

        <article className="panel-card">
          <h2>2. Horario de atendimento</h2>
          <form className="form-stack" action={saveHoursAction}>
            <div className="two-col">
              <div className="field">
                <label htmlFor="weekday">Dia da semana</label>
                <select id="weekday" name="weekday" defaultValue={hours.hours[0]?.weekday ?? "1"}>
                  <option value="0">Domingo</option>
                  <option value="1">Segunda</option>
                  <option value="2">Terca</option>
                  <option value="3">Quarta</option>
                  <option value="4">Quinta</option>
                  <option value="5">Sexta</option>
                  <option value="6">Sabado</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="opensAt">Abre</label>
                <input defaultValue={hours.hours[0]?.opensAt ?? "09:00"} id="opensAt" name="opensAt" type="time" required />
              </div>
            </div>
            <div className="field">
              <label htmlFor="closesAt">Fecha</label>
              <input defaultValue={hours.hours[0]?.closesAt ?? "18:00"} id="closesAt" name="closesAt" type="time" required />
            </div>
            <button className="cta" type="submit">
              Salvar horario
            </button>
          </form>
        </article>

        <article className="panel-card">
          <h2>3. FAQ operacional</h2>
          <form className="form-stack" action={createFaqAction}>
            <div className="field">
              <label htmlFor="question">Pergunta</label>
              <input id="question" name="question" required />
            </div>
            <div className="field">
              <label htmlFor="answer">Resposta</label>
              <textarea id="answer" name="answer" required />
            </div>
            <button className="cta" type="submit">
              Adicionar FAQ
            </button>
          </form>
          <ul className="checklist" style={{ marginTop: 14 }}>
            {faqItems.items.map((item) => (
              <li className="ready" key={item.id}>
                {item.question}
              </li>
            ))}
          </ul>
        </article>

        <article className="panel-card">
          <h2>4. Catalogo ou servicos</h2>
          <form className="form-stack" action={createCatalogItemAction}>
            <div className="two-col">
              <div className="field">
                <label htmlFor="itemType">Tipo</label>
                <select id="itemType" name="itemType" defaultValue="product">
                  <option value="product">Produto</option>
                  <option value="service">Servico</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="priceCents">Preco em centavos</label>
                <input id="priceCents" name="priceCents" type="number" min="0" required />
              </div>
            </div>
            <div className="field">
              <label htmlFor="name">Nome</label>
              <input id="name" name="name" required />
            </div>
            <div className="field">
              <label htmlFor="description">Descricao</label>
              <textarea id="description" name="description" />
            </div>
            <button className="cta" type="submit">
              Adicionar item
            </button>
          </form>
          <ul className="checklist" style={{ marginTop: 14 }}>
            {catalogItems.items.map((item) => (
              <li className="ready" key={item.id}>
                {item.itemType}: {item.name}
              </li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
