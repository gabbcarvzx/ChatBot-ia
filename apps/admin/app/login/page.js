import Link from "next/link";
import { redirect } from "next/navigation";

import { loginAction } from "@/app/actions/auth";
import { getSession } from "@/lib/session";

export default async function LoginPage() {
  const session = await getSession();

  if (session.isAuthenticated) {
    redirect("/dashboard");
  }

  return (
    <main className="auth-shell">
      <div className="page-shell">
        <section className="auth-card">
          <p className="muted">AtendeAI</p>
          <h1 className="brand-title">Entrar no painel comercial</h1>
          <p className="muted">
            Acesse seu tenant, acompanhe setup do bot e avance para ativacao.
          </p>
          <form className="form-stack" action={loginAction}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" required />
            </div>
            <div className="field">
              <label htmlFor="password">Senha</label>
              <input id="password" name="password" type="password" required />
            </div>
            <button className="cta" type="submit">
              Entrar
            </button>
          </form>
          <p className="muted">
            Ainda nao tem conta? <Link href="/register">Criar tenant</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
