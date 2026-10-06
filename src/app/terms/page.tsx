import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell } from "@/components/LegalPageShell";

export const metadata: Metadata = {
  title: "Terms of Service — SGA Skoda CRM",
  description:
    "Terms of Service for the SGA Skoda CRM application, including use of Google account access for spreadsheet synchronisation.",
};

export default function TermsPage() {
  return (
    <LegalPageShell
      title="Terms of Service"
      subtitle="SGA Skoda CRM"
      lastUpdated="October 6, 2026"
      brand="SGA Skoda CRM"
    >
      <section>
        <h2>1. Acceptance of Terms</h2>
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern access to and use of the SGA Skoda
          CRM application (the &ldquo;Service&rdquo;), operated by SGA Skoda
          (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;). By signing in to the Service
          you agree to be bound by these Terms. If you do not agree, do not use the Service.
        </p>
      </section>

      <section>
        <h2>2. Description of the Service</h2>
        <p>
          The Service is an internal lead-management system for automotive dealership staff. It
          allows authorised personnel to import, track, assign and report on sales leads, and to
          synchronise lead data with Google Sheets spreadsheets that the organisation controls.
        </p>
        <p>
          The Service is intended for use only by employees and authorised contractors of SGA
          Skoda. Access is provisioned by an administrator and is not offered as a public or
          consumer service.
        </p>
      </section>

      <section>
        <h2>3. Accounts and Access</h2>
        <p>
          Access requires credentials issued by an administrator. You are responsible for keeping
          your credentials confidential and for all activity that occurs under your account. You
          must notify us promptly if you believe your account has been compromised.
        </p>
        <p>
          We may suspend or revoke access at any time, including where we reasonably believe these
          Terms have been breached.
        </p>
      </section>

      <section>
        <h2>4. Google Account Integration</h2>
        <p>
          An administrator may choose to connect a Google account to the Service to enable
          spreadsheet synchronisation. When this is done, the Service requests the following
          Google API scopes:
        </p>
        <ul>
          <li>
            <strong>Google Sheets</strong> (<code>spreadsheets</code>) &mdash; to read, write,
            append and update lead data in spreadsheets owned by the organisation.
          </li>
          <li>
            <strong>Google Drive (read-only)</strong> (<code>drive.readonly</code>) &mdash; to
            list and read the spreadsheet files the organisation chooses to sync, and to identify
            the connected account&rsquo;s email address.
          </li>
          <li>
            <strong>Basic profile and email</strong> (<code>userinfo.email</code>,{" "}
            <code>userinfo.profile</code>) &mdash; to display which Google account is connected.
          </li>
        </ul>
        <p>
          The Service does not request access to Gmail, Google Calendar, Google Contacts, or any
          other Google service. The Service never requests write access to Google Drive beyond the
          spreadsheet content itself, and does not delete or alter files it did not create.
        </p>
        <p>
          Use of information received from Google APIs adheres to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. Google account data is used solely to provide
          the spreadsheet synchronisation described in these Terms.
        </p>
      </section>

      <section>
        <h2>5. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>use the Service for any unlawful purpose or in breach of applicable regulations;</li>
          <li>
            access, export or disclose lead data other than as required for your legitimate
            business duties;
          </li>
          <li>
            attempt to gain unauthorised access to the Service, other accounts, or connected
            Google accounts;
          </li>
          <li>
            interfere with, disrupt, or place unreasonable load on the Service or its
            integrations.
          </li>
        </ul>
      </section>

      <section>
        <h2>6. Data Ownership</h2>
        <p>
          Lead data belongs to SGA Skoda. You do not acquire any ownership rights in the data by
          using the Service. You must handle all lead data in accordance with applicable privacy
          law and our internal data-handling policies.
        </p>
      </section>

      <section>
        <h2>7. Availability and Changes</h2>
        <p>
          The Service is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis.
          We may modify, suspend or discontinue any part of the Service at any time without
          notice. We do not warrant that the Service will be uninterrupted, error-free, or that
          synchronisation will complete without delay.
        </p>
      </section>

      <section>
        <h2>8. Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by law, SGA Skoda shall not be liable for any indirect,
          incidental, special, consequential or punitive damages, or any loss of data, revenue or
          profits, arising out of or in connection with your use of the Service.
        </p>
      </section>

      <section>
        <h2>9. Termination</h2>
        <p>
          You may stop using the Service at any time. We may suspend or terminate access at our
          discretion. Provisions that by their nature should survive termination &mdash; including
          data ownership, liability limits and governing law &mdash; will survive.
        </p>
      </section>

      <section>
        <h2>10. Changes to These Terms</h2>
        <p>
          We may update these Terms from time to time. Material changes will be reflected by an
          updated &ldquo;Last updated&rdquo; date at the top of this page. Continued use of the
          Service after changes take effect constitutes acceptance of the revised Terms.
        </p>
      </section>

      <section>
        <h2>11. Governing Law</h2>
        <p>
          These Terms are governed by and construed in accordance with the laws of India, and the
          courts of Tamil Nadu shall have exclusive jurisdiction over any dispute arising from
          them.
        </p>
      </section>

      <section>
        <h2>12. Contact</h2>
        <p>
          Questions about these Terms may be directed to{" "}
          <a href="mailto:admin@sgaskoda.com">admin@sgaskoda.com</a>.
        </p>
        <p className="legal-note">
          See also our <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </section>
    </LegalPageShell>
  );
}
