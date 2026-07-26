import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Login — SGA Skoda CRM",
};

export default function LoginPage() {
  return (
    <div className="login-page" style={{ marginLeft: "calc(-1 * var(--sidebar-width))" }}>
      <div className="login-card">
        <div className="login-logo-wrap">
          <div className="login-logo-icon">S</div>
          <h1>SGA Skoda CRM</h1>
          <p className="subtitle">Sign in to manage your leads</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
