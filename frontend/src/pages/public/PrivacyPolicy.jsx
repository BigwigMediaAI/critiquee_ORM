import LegalLayout from './LegalLayout';

export default function PrivacyPolicy() {
  return (
    <LegalLayout
      title="Privacy Policy"
      lastUpdated="May 10, 2026"
      otherLink="/tandc"
      otherLabel="Terms & Conditions →"
    >
      <p>
        This Privacy Policy describes how <strong>Critiquee</strong> ("we", "us", or "our") collects,
        uses, stores, and shares information when you use our reputation-management platform at{' '}
        <a href="https://critiquee.com">critiquee.com</a> and any related applications, dashboards,
        public review-collection links, and APIs (collectively, the "Service").
      </p>
      <p>
        By accessing or using the Service, you agree to the practices described in this Policy. If
        you do not agree, please discontinue use of the Service.
      </p>

      <h2>1. Who we are</h2>
      <p>
        Critiquee is a Software-as-a-Service platform that helps businesses collect, monitor, and
        respond to customer reviews and social-media interactions across multiple online platforms,
        and to publish posts and event-registration links to those platforms.
      </p>

      <h2>2. Information we collect</h2>

      <h3>2.1 Information you provide directly</h3>
      <ul>
        <li>
          <strong>Account information:</strong> business name, branch details, business administrator
          name, email address, password (stored hashed using industry-standard bcrypt), business key,
          phone number (optional), and role (super admin / business admin / department user).
        </li>
        <li>
          <strong>Workspace configuration:</strong> brand assets, reply signatures, SEO keywords,
          rating-dimension labels, custom review-platform URLs, and event details.
        </li>
        <li>
          <strong>Third-party platform credentials:</strong> OAuth tokens, API keys, client IDs and
          secrets that you paste in the Configure dialog for each connected platform (Google
          Business Profile, Meta, X, LinkedIn, YouTube, Reddit, Yelp, Trustpilot, Foursquare,
          TripAdvisor, Booking.com, etc.). All such credentials are encrypted at rest using
          Fernet symmetric encryption before being written to our database.
        </li>
      </ul>

      <h3>2.2 Information collected from your customers (review submissions)</h3>
      <p>
        When you publish a Critiquee review-collection link or QR code and a customer of yours
        submits a review through it, we collect on your behalf:
      </p>
      <ul>
        <li>Name (required), email address (required), mobile number (optional)</li>
        <li>Date of birth (optional, only if the reviewer chooses to provide it)</li>
        <li>One or more star ratings (one per rating dimension you have configured)</li>
        <li>Free-text review content the reviewer types</li>
        <li>
          Submission timestamp and a derived sentiment label (positive / negative) based on the
          rating thresholds you configure
        </li>
      </ul>
      <p>
        You, the business operating the link, are the <strong>data controller</strong> of customer
        review submissions collected through your Critiquee workspace. We act as the{' '}
        <strong>data processor</strong> on your behalf and only use that data to provide the Service.
      </p>

      <h3>2.3 Information collected automatically</h3>
      <ul>
        <li>
          <strong>Log data:</strong> IP address, browser type and version, device identifiers,
          timestamps, pages viewed, and actions taken inside the dashboard.
        </li>
        <li>
          <strong>Cookies and local storage:</strong> we use first-party cookies and browser
          localStorage to keep you signed in (auth tokens), remember your selected branch and
          preferred language, and keep dashboard settings between sessions.
        </li>
      </ul>

      <h3>2.4 Information from connected third-party platforms</h3>
      <p>
        When you connect a third-party platform via OAuth or API key, we fetch (with your express
        permission) the data needed to operate the Service — for example reviews, replies, posts,
        comments, follower counts, business-profile metadata, and performance metrics. We only
        request the minimum scopes required and we never sell or share this data with anyone.
      </p>

      <h2>3. How we use your information</h2>
      <p>We use the information described above to:</p>
      <ul>
        <li>Provide, maintain, and improve the Service and its features</li>
        <li>
          Authenticate users, enforce role-based access (super admin / business admin / department
          user), and protect against fraud and abuse
        </li>
        <li>
          Sync reviews from connected platforms, deliver in-app and email notifications, and run the
          background AI-auto-reply scheduler when you have enabled it
        </li>
        <li>
          Generate AI suggestions for replies, social-media posts, and images (see Section 5 below)
        </li>
        <li>Produce reports, CSV exports, dashboards, charts, and Profile Insights</li>
        <li>Process event registrations submitted via your event QR codes</li>
        <li>
          Communicate with you about service updates, security alerts, billing (when applicable),
          and customer-support requests
        </li>
        <li>Comply with legal obligations and enforce our Terms &amp; Conditions</li>
      </ul>

      <h2>4. Legal bases for processing (EEA / UK users)</h2>
      <p>If you are located in the European Economic Area or the United Kingdom, our legal bases are:</p>
      <ul>
        <li><strong>Contract:</strong> processing necessary to provide the Service you signed up for</li>
        <li>
          <strong>Legitimate interests:</strong> securing the Service, preventing abuse, improving
          performance, and providing customer support
        </li>
        <li>
          <strong>Consent:</strong> for optional features such as date-of-birth collection on review
          forms and AI auto-reply on Google reviews — you can withdraw consent at any time
        </li>
        <li><strong>Legal obligation:</strong> tax, accounting and law-enforcement requests</li>
      </ul>

      <h2>5. Third-party processors and integrations</h2>
      <p>
        To deliver the Service we share necessary information with the following sub-processors,
        each bound by their own published privacy and security commitments:
      </p>
      <ul>
        <li>
          <strong>OpenAI</strong> (via Emergent integrations) — sentiment analysis, AI-suggested
          replies, AI post composition, AI image generation. Review text, reply context, and prompt
          inputs are sent to OpenAI's APIs for processing. We do not send customer email addresses
          or phone numbers to the AI providers.
        </li>
        <li>
          <strong>Amazon Web Services (S3)</strong> — encrypted storage of images you upload or
          generate, hosted in the AWS <code>eu-north-1</code> region.
        </li>
        <li>
          <strong>MongoDB</strong> — primary database storage for accounts, reviews, posts,
          submissions, and configuration.
        </li>
        <li>
          <strong>Connected review &amp; social platforms</strong> — Google Business Profile,
          Meta (Facebook / Instagram), LinkedIn, X (Twitter), YouTube, Reddit, Yelp, Trustpilot,
          Foursquare, TripAdvisor, Booking.com, Expedia, Hotels.com, Agoda, OpenTable, Airbnb,
          Viator, GetYourGuide, Zillow, Realtor.com. Only the data needed to perform the action
          you requested (sync, reply, post, fetch metrics) is exchanged.
        </li>
      </ul>
      <p>
        We never sell your personal data or your customers' personal data to advertisers, data
        brokers, or any third party.
      </p>

      <h2>6. Data retention</h2>
      <ul>
        <li>
          <strong>Account data</strong> is retained for as long as your account is active, plus a
          short grace period (typically 30 days) after deletion in case of accidental removal.
        </li>
        <li>
          <strong>Review submissions, posts, and analytics</strong> are retained for the lifetime of
          your subscription. You can delete individual records at any time from the dashboard.
        </li>
        <li>
          <strong>Encrypted third-party credentials</strong> are deleted immediately when you
          disconnect a platform.
        </li>
        <li>
          <strong>Server logs</strong> are retained for up to 90 days for security and debugging,
          then automatically purged.
        </li>
      </ul>

      <h2>7. Security</h2>
      <p>
        We employ industry-standard safeguards including TLS 1.2+ encryption in transit, Fernet
        symmetric encryption for all stored third-party API credentials, bcrypt password hashing,
        signed JWT session tokens, role-based access controls, automatic backup, and least-privilege
        infrastructure access. No method of transmission or storage is 100% secure, however, and we
        cannot guarantee absolute security.
      </p>
      <p>
        If we become aware of a security incident affecting your data, we will notify you and the
        relevant supervisory authority without undue delay, in accordance with applicable law.
      </p>

      <h2>8. Your rights</h2>
      <p>
        Depending on your jurisdiction (e.g. GDPR, UK GDPR, India's DPDP Act, CCPA), you may have
        the right to:
      </p>
      <ul>
        <li>Access the personal data we hold about you</li>
        <li>Correct inaccurate or incomplete data</li>
        <li>Delete your data ("right to erasure")</li>
        <li>Export your data in a portable, machine-readable format (CSV)</li>
        <li>Object to or restrict certain processing</li>
        <li>Withdraw consent at any time (without affecting prior lawful processing)</li>
        <li>Lodge a complaint with a supervisory authority</li>
      </ul>
      <p>
        To exercise any of these rights, email{' '}
        <a href="mailto:privacy@critiquee.com">privacy@critiquee.com</a>. We will respond within 30
        days. End-users (your customers who submit reviews) should typically contact the business
        whose review link they used; we will assist that business in fulfilling your request.
      </p>

      <h2>9. Children's privacy</h2>
      <p>
        The Service is not directed at children under 16. We do not knowingly collect personal data
        from children. If you believe a child has submitted information to us, please contact{' '}
        <a href="mailto:privacy@critiquee.com">privacy@critiquee.com</a> and we will delete it
        promptly.
      </p>

      <h2>10. International data transfers</h2>
      <p>
        Critiquee is operated globally. Your data may be processed and stored in countries outside
        your country of residence (including the European Economic Area and the United States),
        whose data-protection laws may differ from yours. Where required, we use Standard
        Contractual Clauses or equivalent safeguards for cross-border transfers.
      </p>

      <h2>11. Cookies</h2>
      <p>We use only first-party cookies and browser localStorage for essential functionality:</p>
      <ul>
        <li>Authentication tokens to keep you signed in</li>
        <li>Selected branch / workspace and preferred display language</li>
        <li>Dashboard settings (table sort order, filter selections)</li>
      </ul>
      <p>
        We do not use advertising cookies or third-party tracking pixels. You can clear cookies and
        localStorage at any time via your browser settings; doing so will sign you out.
      </p>

      <h2>12. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. Material changes will be announced via
        in-app notification or by email to the account owner at least 14 days before the changes
        take effect. Continued use of the Service after that date constitutes acceptance of the
        updated Policy.
      </p>

      <h2>13. Contact us</h2>
      <p>
        If you have questions about this Policy or our data practices, write to:
      </p>
      <p>
        <strong>Critiquee — Privacy Team</strong>
        <br />
        Email: <a href="mailto:privacy@critiquee.com">privacy@critiquee.com</a>
        <br />
        Support: <a href="mailto:support@critiquee.com">support@critiquee.com</a>
      </p>
    </LegalLayout>
  );
}
