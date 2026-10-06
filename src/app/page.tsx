import Link from "next/link";

export default function Home() {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="landing-brand">
          <img src="/logo.jpg" alt="SGA Skoda CRM" className="landing-logo" />
          <div>
            <h1>SGA Skoda CRM</h1>
            <p className="landing-tagline">Lead Management for Skoda Dealerships</p>
          </div>
        </div>
        <nav className="landing-nav">
          <Link href="/login">Sign In</Link>
        </nav>
      </header>

      <main>
        <section className="landing-hero">
          <h2>Internal lead management for SGA Skoda</h2>
          <p>
            SGA Skoda CRM is a private, self-hosted web application used by dealership staff to
            import, track, assign and report on automotive sales leads. It replaces manual
            spreadsheet tracking with a secure, role-based dashboard.
          </p>
          <div className="landing-cta">
            <Link href="/login" className="btn-primary">Sign In to Dashboard</Link>
          </div>
        </section>

        <section className="landing-features">
          <h3>What the application does</h3>
          <ul>
            <li>
              <strong>Lead pipeline</strong> — track leads through <em>Not Contacted → Contacted →
              Completed / Lost</em> with per-status counts and conversion rate.
            </li>
            <li>
              <strong>Multi-branch, multi-consultant</strong> — leads are assigned to consultants
              within branches; filters and reports slice by branch, consultant, platform and date.
            </li>
            <li>
              <strong>Google Sheets synchronisation</strong> — authorised administrators connect a
              Google account (OAuth) to read and write lead data in the organisation's
              spreadsheets. Scopes used:
              <code>spreadsheets</code>, <code>drive.readonly</code>,
              <code>userinfo.email</code>, <code>userinfo.profile</code>.
            </li>
            <li>
              <strong>Activity log & audit trail</strong> — every status change, remark and
              assignment is recorded with timestamp and user.
            </li>
            <li>
              <strong>Follow-up calendar</strong> — monthly view of scheduled follow-ups across
              all consultants.
            </li>
            <li>
              <strong>Platform tagging</strong> — leads tagged by source (Walk-in, Website,
              Facebook, etc.) with configurable colour badges.
            </li>
          </ul>
        </section>

        <section className="landing-oauth">
          <h3>Google OAuth integration</h3>
          <p>
            The only Google integration is <strong>spreadsheet synchronisation</strong>. An
            administrator may link a Google account via OAuth to enable automatic import/export of
            lead data between the CRM and the dealership's Google Sheets. The application requests
            the minimum scopes required for this feature and adheres to the{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google API Services User Data Policy
            </a>
            , including Limited Use requirements.
          </p>
          <p>
            No Gmail, Calendar, Contacts or other Google services are accessed. Data is used
            solely to provide the spreadsheet synchronisation described here.
          </p>
        </section>

        <section className="landing-audience">
          <h3>Intended audience</h3>
          <p>
            This application is <strong>not a public or consumer service</strong>. Access is
            restricted to employees and authorised contractors of SGA Skoda. Accounts are
            provisioned by an administrator. There is no self-registration.
          </p>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="footer-links">
          <Link href="/terms">Terms of Service</Link>
          <span aria-hidden="true">&middot;</span>
          <Link href="/privacy">Privacy Policy</Link>
        </div>
        <p className="footer-copy">
          &copy; {new Date().getFullYear()} SGA Skoda CRM. Internal tool — not for public use.
        </p>
      </footer>
    </div>
  );
}
