import Link from "next/link";

interface LegalPageShellProps {
  title: string;
  subtitle: string;
  lastUpdated: string;
  brand: string;
  children: React.ReactNode;
}

export function LegalPageShell({
  title,
  subtitle,
  lastUpdated,
  brand,
  children,
}: LegalPageShellProps) {
  return (
    <div className="legal-page">
      <div className="legal-card">
        <div className="legal-header">
          <Link href="/login" className="legal-back">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: 16, height: 16 }}
            >
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Back to sign in
          </Link>

          <h1>{title}</h1>
          <p className="legal-subtitle">{subtitle}</p>
          <p className="legal-updated">Last updated: {lastUpdated}</p>
        </div>

        <div className="legal-content">{children}</div>

        <div className="legal-footer">
          <span>
            &copy; {new Date().getFullYear()} {brand}. All rights reserved.
          </span>
          <span className="legal-footer-links">
            <Link href="/terms">Terms of Service</Link>
            <span aria-hidden="true">&middot;</span>
            <Link href="/privacy">Privacy Policy</Link>
          </span>
        </div>
      </div>
    </div>
  );
}
