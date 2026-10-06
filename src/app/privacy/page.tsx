import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell } from "@/components/LegalPageShell";

export const metadata: Metadata = {
  title: "Privacy Policy — SGA Skoda CRM",
  description:
    "Privacy Policy for the SGA Skoda CRM application, including how Google account data is accessed, used and protected.",
};

export default function PrivacyPage() {
  return (
    <LegalPageShell
      title="Privacy Policy"
      subtitle="SGA Skoda CRM"
      lastUpdated="October 6, 2026"
      brand="SGA Skoda CRM"
    >
      <section>
        <h2>1. Overview</h2>
        <p>
          This Privacy Policy explains how SGA Skoda (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or
          &ldquo;our&rdquo;) collects, uses, stores and protects information in connection with the
          SGA Skoda CRM application (the &ldquo;Service&rdquo;). It applies to dealership staff who
          use the Service and to individuals whose details are recorded as sales leads.
        </p>
      </section>

      <section>
        <h2>2. Information We Collect</h2>
        <p>
          <strong>Lead data.</strong> The Service stores sales-lead records supplied by the
          organisation, which may include a person&rsquo;s name, phone number, city or location,
          the platform a lead originated from, follow-up dates, assignment status, remarks and an
          activity history. This data is collected by the dealership in the ordinary course of its
          business.
        </p>
        <p>
          <strong>Account data.</strong> For staff accounts we store a username, a securely hashed
          password, a role, and an optional assigned branch or platform.
        </p>
        <p>
          <strong>Google account data.</strong> If an administrator connects a Google account, we
          receive and store the OAuth access and refresh tokens issued by Google, together with the
          connected account&rsquo;s email address. We do not receive or store your Google password.
        </p>
        <p>
          <strong>Technical data.</strong> Standard server logs may record request times, endpoints
          and error information for security and debugging purposes.
        </p>
      </section>

      <section>
        <h2>3. How We Use Information</h2>
        <ul>
          <li>to display, filter, assign and report on sales leads;</li>
          <li>to synchronise lead data with spreadsheets the organisation controls;</li>
          <li>to authenticate staff and enforce role-based access;</li>
          <li>to maintain an audit trail of changes made to lead records;</li>
          <li>to operate, secure, troubleshoot and improve the Service.</li>
        </ul>
      </section>

      <section>
        <h2>4. Google API Services &mdash; Limited Use</h2>
        <p>
          The Service&rsquo;s use and transfer of information received from Google APIs adheres to
          the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. In particular:
        </p>
        <ul>
          <li>
            Google user data is used only to provide or improve the user-facing spreadsheet
            synchronisation features described in this policy.
          </li>
          <li>
            Google user data is <strong>not</strong> sold, rented or traded to third parties.
          </li>
          <li>
            Google user data is <strong>not</strong> used for advertising, profiling, or to train
            machine-learning models.
          </li>
          <li>
            Google user data is <strong>not</strong> transferred to third parties except as
            necessary to provide the Service, to comply with applicable law, or as part of a merger
            or acquisition with notice to affected users.
          </li>
          <li>
            Humans do not read Google user data unless we have your affirmative consent for
            specific items, it is necessary for security purposes, to comply with law, or the data
            has been aggregated and anonymised.
          </li>
        </ul>
        <p>
          Access is limited to the scopes listed in the{" "}
          <Link href="/terms">Terms of Service</Link> &mdash; Google Sheets, read-only Google
          Drive, and basic profile and email information. No other Google service is accessed.
        </p>
      </section>

      <section>
        <h2>5. How We Store and Protect Information</h2>
        <p>
          Data is stored in a PostgreSQL database and transmitted over encrypted connections.
          Passwords are stored only as salted hashes. OAuth tokens are stored server-side and are
          never exposed to the browser. Access to lead data is restricted by role, and
          administrative actions are recorded in an activity log.
        </p>
        <p>
          While we apply reasonable technical and organisational safeguards, no system can be
          guaranteed to be completely secure.
        </p>
      </section>

      <section>
        <h2>6. Data Retention</h2>
        <p>
          Lead records are retained for as long as the organisation requires them for its business
          and legal obligations. Google OAuth tokens are retained until the Google account is
          disconnected or access is revoked. When data is no longer needed it is deleted or
          anonymised.
        </p>
      </section>

      <section>
        <h2>7. Sharing and Disclosure</h2>
        <p>
          We do not sell personal information. Information may be disclosed to:
        </p>
        <ul>
          <li>authorised staff of SGA Skoda, on a need-to-know basis;</li>
          <li>service providers who host or operate the Service on our behalf;</li>
          <li>authorities where required by law or to protect legal rights.</li>
        </ul>
      </section>

      <section>
        <h2>8. Your Rights and Choices</h2>
        <p>
          You may request access to, correction of, or deletion of personal information held about
          you. Where a request concerns lead data, we may need to refer it to the dealership that
          collected it. You can revoke the Service&rsquo;s access to your Google account at any
          time at{" "}
          <a
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noopener noreferrer"
          >
            myaccount.google.com/permissions
          </a>
          .
        </p>
        <p>
          To exercise any of these rights, contact us at{" "}
          <a href="mailto:admin@sgaskoda.com">admin@sgaskoda.com</a>.
        </p>
      </section>

      <section>
        <h2>9. Children&rsquo;s Privacy</h2>
        <p>
          The Service is a business tool and is not directed at children. We do not knowingly
          collect information from children.
        </p>
      </section>

      <section>
        <h2>10. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. Material changes will be reflected
          by an updated &ldquo;Last updated&rdquo; date at the top of this page.
        </p>
      </section>

      <section>
        <h2>11. Contact</h2>
        <p>
          Privacy questions or requests may be sent to{" "}
          <a href="mailto:admin@sgaskoda.com">admin@sgaskoda.com</a>.
        </p>
        <p className="legal-note">
          See also our <Link href="/terms">Terms of Service</Link>.
        </p>
      </section>
    </LegalPageShell>
  );
}
