import Link from "next/link";
import { redirect } from "next/navigation";

import { registerAction } from "@/app/actions/auth";
import { getSession } from "@/lib/session";

export default async function RegisterPage() {
  const session = await getSession();

  if (session.isAuthenticated) {
    redirect("/dashboard");
  }

  return (
    <main className="auth-shell">
      <div className="page-shell">
        <section className="auth-card">
          <p className="muted">AtendeAI</p>
          <h1 className="brand-title">Criar tenant e iniciar onboarding</h1>
          <form className="form-stack" action={registerAction}>
            <div className="two-col">
              <div className="field">
                <label htmlFor="ownerName">Nome do responsavel</label>
                <input id="ownerName" name="ownerName" required />
              </div>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input id="email" name="email" type="email" required />
              </div>
            </div>
            <div className="two-col">
              <div className="field">
                <label htmlFor="password">Senha</label>
                <input id="password" name="password" type="password" required />
              </div>
              <div className="field">
                <label htmlFor="planCode">Plano</label>
                <select id="planCode" name="planCode" defaultValue="basic">
                  <option value="basic">Basic</option>
                  <option value="pro">Pro</option>
                  <option value="premium">Premium</option>
                </select>
              </div>
            </div>
            <div className="two-col">
              <div className="field">
                <label htmlFor="companyName">Empresa</label>
                <input id="companyName" name="companyName" required />
              </div>
              <div className="field">
                <label htmlFor="companySlug">Slug comercial</label>
                <input id="companySlug" name="companySlug" required />
              </div>
            </div>
            <div className="field">
              <label htmlFor="vertical">Vertical</label>
              <select id="vertical" name="vertical" defaultValue="moda-feminina">
                <option value="moda-feminina">Moda feminina</option>
                <option value="perfumaria">Perfumaria</option>
                <option value="material-construcao">Material de construcao</option>
                <option value="salao">Salao</option>
                <option value="clinica">Clinica</option>
                <option value="restaurante">Restaurante</option>
              </select>
            </div>
            <button className="cta" type="submit">
              Criar conta
            </button>
          </form>
          <p className="muted">
            Ja tem conta? <Link href="/login">Entrar</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
