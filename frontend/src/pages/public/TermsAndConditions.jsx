import LegalLayout from './LegalLayout';

export default function TermsAndConditions() {
  return (
    <LegalLayout
      title="Terms & Conditions"
      lastUpdated="May 10, 2026"
      otherLink="/pp"
      otherLabel="← Privacy Policy"
    >
      <p>
        These Terms &amp; Conditions ("Terms") govern your access to and use of the Critiquee
        platform, available at <a href="https://critiquee.com">critiquee.com</a>, including our web
        dashboard, public review-collection links, event QR codes, embedded review widgets, and
        APIs (collectively, the "Service") provided by Critiquee ("we", "us", or "our").
      </p>
      <p>
        By creating an account, signing in, or otherwise using the Service you agree to be bound by
        these Terms. If you are using the Service on behalf of a business, you represent that you
        have authority to bind that business to these Terms.
      </p>

      <h2>1. Eligibility</h2>
      <ul>
        <li>You must be at least 18 years old to create an account.</li>
        <li>
          You must provide accurate, current, and complete information during registration and
          keep it updated.
        </li>
        <li>
          You must own, operate, or be authorised to manage the business accounts and platform
          integrations you connect to Critiquee.
        </li>
      </ul>

      <h2>2. Accounts and security</h2>
      <ul>
        <li>
          You are responsible for safeguarding your login credentials, business key, and any API
          tokens you generate.
        </li>
        <li>
          You must notify us immediately at{' '}
          <a href="mailto:security@critiquee.com">security@critiquee.com</a> of any unauthorised use
          of your account or any other security breach.
        </li>
        <li>
          You are responsible for all activity that occurs under your account, including activity
          by department users you create.
        </li>
        <li>
          We may suspend or terminate accounts that exhibit suspicious activity, repeated login
          failures, or violations of these Terms.
        </li>
      </ul>

      <h2>3. Description of the Service</h2>
      <p>Critiquee enables businesses to:</p>
      <ul>
        <li>
          Aggregate reviews and ratings from connected third-party platforms (Google Business
          Profile, Meta, Yelp, Trustpilot, TripAdvisor and others)
        </li>
        <li>
          Reply to reviews directly through the platform, or surface a manual-reply CTA for
          platforms that do not allow third-party replies
        </li>
        <li>Generate AI-assisted replies, social posts, and images</li>
        <li>Collect first-party reviews via shareable links and QR codes</li>
        <li>Run event-registration workflows with QR codes</li>
        <li>Embed review widgets on external websites</li>
        <li>Export CSV reports and view performance dashboards</li>
      </ul>
      <p>
        Specific features available to your account depend on your subscription tier and on the
        third-party platforms you choose to connect.
      </p>

      <h2>4. Acceptable use</h2>
      <p>You agree NOT to use the Service to:</p>
      <ul>
        <li>
          Post, transmit, or generate content that is unlawful, defamatory, obscene, harassing,
          deceptive, infringing, or misleading
        </li>
        <li>
          Solicit fake reviews, manipulate ratings, generate inauthentic engagement, or otherwise
          violate the policies of any connected third-party platform
        </li>
        <li>
          Impersonate any person or business, or misrepresent your affiliation with any person or
          business
        </li>
        <li>
          Reverse-engineer, decompile, scrape, or attempt to derive the source code of any part of
          the Service
        </li>
        <li>
          Probe, scan, or test the vulnerability of the Service, or breach any security or
          authentication measures
        </li>
        <li>
          Use the Service to send unsolicited bulk messages (spam) to your customers or your
          customers' contacts
        </li>
        <li>Use the Service in any manner that violates applicable law or regulation</li>
      </ul>
      <p>
        Violation of this section may result in immediate suspension or termination, and we may
        report serious violations to the relevant authorities.
      </p>

      <h2>5. Third-party platforms</h2>
      <p>
        Critiquee integrates with third-party platforms via their official APIs. By connecting any
        such platform, you agree to comply with that platform's own terms of service, acceptable-use
        policies, and developer policies — including but not limited to:
      </p>
      <ul>
        <li>Google Business Profile API Policy &amp; Google API Services User Data Policy</li>
        <li>Meta Platform Terms (Facebook / Instagram)</li>
        <li>X Developer Agreement &amp; Policy</li>
        <li>YouTube API Services Terms of Service</li>
        <li>Yelp Fusion API Terms of Use</li>
        <li>Trustpilot API Terms</li>
      </ul>
      <p>
        We are not responsible for any third-party platform's availability, accuracy, content,
        quotas, rate-limits, suspension, or termination of access. If a platform changes or
        deprecates its API, the corresponding Critiquee feature may be limited or discontinued
        without notice.
      </p>

      <h2>6. Customer data and your responsibilities as a data controller</h2>
      <p>
        When you collect reviews from your own customers using Critiquee links/QR codes, you are
        the data controller of that personal data and Critiquee is your data processor.
      </p>
      <ul>
        <li>
          You must obtain any necessary consents and disclose your privacy practices to your
          customers.
        </li>
        <li>
          You must not collect data you are not legally permitted to collect, including special
          categories of data (health, religion, biometrics) unless your local law expressly allows
          it and you have lawful basis.
        </li>
        <li>
          You will respond to data-subject requests (access, deletion, correction) from your
          customers in line with applicable law. We will assist you on request.
        </li>
      </ul>

      <h2>7. AI-generated content</h2>
      <p>
        The Service uses third-party large-language-model and image-generation providers (currently
        OpenAI via Emergent integrations) to produce suggested replies, post drafts, and images.
        AI-generated content:
      </p>
      <ul>
        <li>May contain inaccuracies, hallucinations, or outdated information</li>
        <li>Should be reviewed and edited by you before publishing or posting externally</li>
        <li>
          Is provided "as-is"; you remain solely responsible for what you publish under your
          business name
        </li>
        <li>Must not be used in violation of any third-party platform's AI-content policies</li>
      </ul>

      <h2>8. Subscriptions, fees, and payment</h2>
      <p>
        Where the Service is offered on a paid basis:
      </p>
      <ul>
        <li>Pricing, billing cycle, and feature inclusions are presented at sign-up or upgrade.</li>
        <li>
          Fees are charged in advance and are <strong>non-refundable</strong> except as expressly
          stated in writing or required by law.
        </li>
        <li>
          You authorise us, or our payment processor, to charge the payment method on file for all
          recurring fees, taxes, and applicable charges.
        </li>
        <li>
          We may change subscription pricing with at least 30 days' prior notice, effective at the
          start of your next billing cycle.
        </li>
        <li>Failure to pay may result in suspension or termination of your account.</li>
      </ul>

      <h2>9. Intellectual property</h2>
      <p>
        The Service, including its software, design, branding, and documentation, is owned by
        Critiquee and protected by intellectual-property laws. We grant you a limited, non-exclusive,
        non-transferable, revocable licence to use the Service in accordance with these Terms.
      </p>
      <p>
        You retain all rights to the content you upload, generate, or publish through the Service
        ("Customer Content"). By using the Service, you grant us a worldwide, royalty-free licence
        to host, store, transmit, display, and process Customer Content solely as necessary to
        provide and improve the Service.
      </p>

      <h2>10. Feedback</h2>
      <p>
        If you provide suggestions, feature requests, or feedback, you grant us a perpetual,
        irrevocable, royalty-free licence to use that feedback to improve the Service, without
        obligation to you.
      </p>

      <h2>11. Disclaimers</h2>
      <p>
        The Service is provided <strong>"as is" and "as available"</strong>, without warranties of
        any kind, whether express or implied, including warranties of merchantability, fitness for
        a particular purpose, and non-infringement. We do not warrant that the Service will be
        uninterrupted, error-free, or that defects will be corrected.
      </p>
      <p>
        We are not responsible for the availability, accuracy, or behaviour of any third-party
        platform you connect, nor for any consequences of changes those platforms make to their
        APIs, policies, or pricing.
      </p>

      <h2>12. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, in no event shall Critiquee, its affiliates,
        employees, or contractors be liable for any indirect, incidental, special, consequential,
        or punitive damages, or for any loss of profits, revenue, data, business, or goodwill,
        arising out of or relating to your use of the Service.
      </p>
      <p>
        Our total aggregate liability for any claim arising out of or relating to these Terms or
        the Service shall not exceed the greater of (a) the amounts you paid to Critiquee in the
        twelve (12) months immediately preceding the event giving rise to the claim, or (b) one
        hundred US dollars (US $100).
      </p>

      <h2>13. Indemnification</h2>
      <p>
        You agree to defend, indemnify, and hold harmless Critiquee and its affiliates from and
        against any claims, damages, liabilities, costs, and expenses (including reasonable legal
        fees) arising out of or in connection with: (a) your violation of these Terms; (b) your
        violation of any law or third-party right; (c) Customer Content posted, published, or
        generated through your account; or (d) your misuse of any third-party platform integration.
      </p>

      <h2>14. Suspension and termination</h2>
      <ul>
        <li>You may terminate your account at any time from the Settings page or by contacting support.</li>
        <li>
          We may suspend or terminate your access immediately, without notice, if you violate these
          Terms, create risk or possible legal exposure for us, or if we are required to do so by
          law.
        </li>
        <li>
          Upon termination, your right to use the Service ends. We may delete your account data
          after a 30-day grace period, except where retention is required by law.
        </li>
        <li>
          Sections that by their nature should survive termination (IP, indemnification, liability
          limits, governing law) will continue to apply.
        </li>
      </ul>

      <h2>15. Modifications to the Service or these Terms</h2>
      <p>
        We may modify the Service at any time, including by adding, changing, or removing features.
        We may also amend these Terms; material changes will be announced at least 14 days in
        advance via in-app notification or by email to the account owner. Continued use of the
        Service after the effective date constitutes acceptance of the amended Terms.
      </p>

      <h2>16. Governing law and dispute resolution</h2>
      <p>
        These Terms are governed by the laws of India, without regard to conflict-of-laws
        principles. Any dispute arising out of or relating to these Terms or the Service shall be
        subject to the exclusive jurisdiction of the competent courts located in New Delhi, India,
        unless otherwise required by mandatory consumer-protection law in your jurisdiction.
      </p>

      <h2>17. Force majeure</h2>
      <p>
        We will not be liable for any failure or delay in performance caused by circumstances
        beyond our reasonable control, including but not limited to acts of God, natural disasters,
        war, terrorism, civil unrest, labour disputes, government action, network or
        infrastructure outages, or third-party platform failures.
      </p>

      <h2>18. Miscellaneous</h2>
      <ul>
        <li>
          <strong>Entire agreement:</strong> These Terms, together with our Privacy Policy and any
          plan-specific order forms, constitute the entire agreement between you and Critiquee
          regarding the Service.
        </li>
        <li>
          <strong>Severability:</strong> If any provision is held unenforceable, the remaining
          provisions remain in full effect.
        </li>
        <li>
          <strong>No waiver:</strong> Our failure to enforce a right under these Terms is not a
          waiver of that right.
        </li>
        <li>
          <strong>Assignment:</strong> You may not assign these Terms without our prior written
          consent. We may assign or transfer these Terms in connection with a merger, acquisition,
          or sale of assets.
        </li>
        <li>
          <strong>Notices:</strong> Notices to us must be sent to{' '}
          <a href="mailto:legal@critiquee.com">legal@critiquee.com</a>. Notices to you may be sent
          to the email address on file or via in-app notification.
        </li>
      </ul>

      <h2>19. Contact us</h2>
      <p>
        <strong>Critiquee — Legal &amp; Support</strong>
        <br />
        General support: <a href="mailto:support@critiquee.com">support@critiquee.com</a>
        <br />
        Legal: <a href="mailto:legal@critiquee.com">legal@critiquee.com</a>
        <br />
        Security: <a href="mailto:security@critiquee.com">security@critiquee.com</a>
      </p>
    </LegalLayout>
  );
}
