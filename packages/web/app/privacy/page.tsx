import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Section, List, LEGAL_CONTACT_EMAIL, COMPANY_LINE } from "../../components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Good Hours collects, uses and protects your personal data, and the rights you have under UK GDPR.",
  alternates: { canonical: "/privacy" },
};

const mail = <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-brand-600 underline">{LEGAL_CONTACT_EMAIL}</a>;

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="11 October 2026">
      <Section id="who" title="1. Who we are">
        <p>
          Good Hours (goodhour.shop) is operated by {COMPANY_LINE} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). We are the
          data controller for the personal data described in this policy. Contact us about anything in it at {mail}.
        </p>
      </Section>

      <Section id="data" title="2. The data we collect">
        <List>
          <li><strong>Account data:</strong> email address, password (stored only as a secure hash), account type (traveller or host), optional phone number.</li>
          <li><strong>Booking and marketplace data:</strong> searches, bookings, requests, offers, bids, orders, receipts, reviews and messages you send through the platform.</li>
          <li><strong>Payment data:</strong> payments are processed by Stripe. We receive payment status and limited details (such as card brand and last four digits); we never see or store your full card number.</li>
          <li><strong>Host data:</strong> listing details, photos, availability and the information you provide for host verification and payouts.</li>
          <li><strong>AI assistant data:</strong> messages you type into the assistant and the context needed to answer them (for example, the page you are on).</li>
          <li><strong>Technical data:</strong> IP address, browser type and server logs needed to run and secure the service.</li>
        </List>
      </Section>

      <Section id="use" title="3. How we use it, and our legal basis">
        <List>
          <li><strong>To provide the service</strong> (accounts, bookings, payments, messaging, receipts): performance of our contract with you.</li>
          <li><strong>To keep the platform safe</strong> (fraud prevention, host verification, rate limiting, security logs): our legitimate interests and legal obligations.</li>
          <li><strong>To power AI features</strong> (assistant replies, suggested prices, automated bidding you choose to use): performance of contract and our legitimate interest in improving the service.</li>
          <li><strong>To send service messages</strong> (booking confirmations, receipts, account notices): performance of contract.</li>
          <li><strong>To send marketing emails</strong>: only with your consent, which you can withdraw at any time using the unsubscribe link or by emailing us.</li>
          <li><strong>To keep financial records</strong>: legal obligation (UK tax and accounting law).</li>
        </List>
      </Section>

      <Section id="sharing" title="4. Who we share it with">
        <p>We do not sell your personal data. We share it only with providers who help us run Good Hours, under contracts that protect it:</p>
        <List>
          <li><strong>Stripe</strong>: payment processing.</li>
          <li><strong>Oracle Cloud (UK, London region)</strong>: hosting of our servers and database.</li>
          <li><strong>OpenRouter and the AI model providers it routes to</strong> (such as OpenAI), and <strong>Google (Gemini)</strong> for AI-generated listing images: to produce AI assistant replies, pricing suggestions and images. Do not enter sensitive personal information into the assistant.</li>
          <li><strong>Email and SMS providers</strong> (such as Resend and Twilio): to deliver service messages.</li>
          <li><strong>Smoobu</strong>: only for hosts who connect their channel-manager account.</li>
          <li><strong>The other party to your booking</strong>: hosts see the details needed to fulfil a booking; travellers see listing and host details.</li>
          <li><strong>Authorities</strong>: where the law requires it.</li>
        </List>
      </Section>

      <Section id="transfers" title="5. International transfers">
        <p>
          Some providers above (for example Stripe, OpenRouter and OpenAI) process data outside the UK, including in
          the United States. Where they do, we rely on UK adequacy regulations or the UK International Data Transfer
          Agreement / Addendum to the EU Standard Contractual Clauses.
        </p>
      </Section>

      <Section id="retention" title="6. How long we keep it">
        <List>
          <li>Account data: while your account is open, and deleted or anonymised after you ask us to close it.</li>
          <li>Booking, payment and ledger records: up to 6 years after the transaction, as UK law requires. When you ask us to erase your account we remove what identifies you and keep only the anonymised financial record.</li>
          <li>Server logs: up to 90 days.</li>
        </List>
      </Section>

      <Section id="cookies" title="7. Cookies">
        <p>
          We use only <strong>strictly necessary cookies</strong>: a secure sign-in cookie that keeps you logged in, and a
          preference cookie that remembers your language. We do not use advertising or analytics cookies, so no cookie
          banner is needed. If we add any in future we will ask for your consent first.
        </p>
      </Section>

      <Section id="rights" title="8. Your rights">
        <p>Under UK GDPR you can ask us to:</p>
        <List>
          <li>give you a copy of your data (we can provide it as a machine-readable file);</li>
          <li>correct inaccurate data;</li>
          <li>erase your data, or restrict or object to how we use it;</li>
          <li>stop sending you marketing at any time.</li>
        </List>
        <p>
          Email {mail} from the address on your account. We will respond within one month. If you are unhappy with how
          we handle your data you can complain to the Information Commissioner&rsquo;s Office at{" "}
          <a href="https://ico.org.uk" className="text-brand-600 underline" target="_blank" rel="noopener noreferrer">ico.org.uk</a>.
        </p>
      </Section>

      <Section id="security" title="9. Security">
        <p>
          Data is encrypted in transit (HTTPS), passwords are hashed, access to systems is restricted, and payments are
          handled by a PCI-DSS compliant provider. No system is perfectly secure, but we take reasonable steps to
          protect your information and will notify you and the ICO of any serious breach as the law requires.
        </p>
      </Section>

      <Section id="children" title="10. Children">
        <p>Good Hours is for adults. You must be 18 or over to create an account or make a booking.</p>
      </Section>

      <Section id="changes" title="11. Changes to this policy">
        <p>
          We will post any changes here and update the date above. If a change is significant we will tell you by email
          or on the site. See also our <Link href="/terms" className="text-brand-600 underline">Terms of Service</Link>.
        </p>
      </Section>
    </LegalPage>
  );
}
