import type { Metadata } from "next";
import Link from "next/link";
import { BUYER_FEE_RATE, SELLER_FEE_RATE } from "@gihtcx/shared";
import { LegalPage, Section, List, LEGAL_CONTACT_EMAIL, COMPANY_LINE } from "../../components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that apply when you book or list rooms, cars and travel services by the hour on Good Hours.",
  alternates: { canonical: "/terms" },
};

const pct = (r: number) => `${(r * 100).toFixed(0)}%`;
const mail = <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-brand-600 underline">{LEGAL_CONTACT_EMAIL}</a>;

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="11 October 2026">
      <Section id="about" title="1. About these terms">
        <p>
          These terms apply to your use of Good Hours (goodhour.shop), operated by {COMPANY_LINE}. By creating an
          account or making a booking you agree to them. Please also read our{" "}
          <Link href="/privacy" className="text-brand-600 underline">Privacy Policy</Link>. Questions: {mail}.
        </p>
      </Section>

      <Section id="role" title="2. What Good Hours does">
        <p>
          Good Hours is a marketplace. Independent hosts list rooms, cars, travel services, products and professional
          time; travellers and buyers book or buy them. Unless a listing says otherwise, the contract for the booked
          service is between you and the host. We run the platform, take payments on the host&rsquo;s behalf and help
          resolve problems, but we do not own or operate the listed properties, vehicles or services.
        </p>
      </Section>

      <Section id="accounts" title="3. Your account">
        <List>
          <li>You must be 18 or over and give accurate information.</li>
          <li>Keep your password secure; you are responsible for activity on your account.</li>
          <li>We may suspend or close accounts that break these terms, act fraudulently or put others at risk.</li>
        </List>
      </Section>

      <Section id="bookings" title="4. Bookings and prices">
        <List>
          <li>Bookings are made by the hour for the time slot shown. A booking is confirmed once payment succeeds and you receive a confirmation.</li>
          <li>The price you see before paying includes the platform fee. A {pct(BUYER_FEE_RATE)} platform fee is charged to the traveller and a {pct(SELLER_FEE_RATE)} fee is deducted from the host&rsquo;s payout on every booking.</li>
          <li>Payments are processed securely by Stripe. Some features let you pay with wallet balance or time credits; these have no cash value outside Good Hours unless the feature says otherwise.</li>
        </List>
      </Section>

      <Section id="ai" title="5. AI features">
        <p>
          The AI assistant, AI suggested prices and AI agents that bid in reverse auctions are tools to help you. Their
          output can be wrong or out of date. An AI agent only bids within the limits you set, and nothing is booked or
          paid for until you (or a bid you authorised) confirm it. Always check the final details before paying.
        </p>
      </Section>

      <Section id="cancellations" title="6. Cancellations and refunds">
        <List>
          <li>You can cancel a booking from your dashboard. If a host sets a cancellation policy on a listing, that policy applies and is shown before you book.</li>
          <li>If no policy is shown, cancelling before the booked slot starts gives you a full refund to your original payment method (or wallet, if you paid from it).</li>
          <li>If a host cancels, or the service is materially not as described, you are entitled to a full refund. Contact us within 48 hours of the booked slot with details.</li>
          <li>Your statutory rights as a consumer under UK law are not affected.</li>
        </List>
      </Section>

      <Section id="hosts" title="7. If you are a host">
        <List>
          <li>Your listings must be accurate, lawful and available for the times shown, and you must hold any licences, insurance and permissions needed (including for vehicles and short-term letting).</li>
          <li>You must honour confirmed bookings and treat guests fairly and without discrimination.</li>
          <li>Payouts are made after the booking is completed, minus the host fee, to the account you set up.</li>
          <li>We may verify hosts and remove listings that break these terms.</li>
        </List>
      </Section>

      <Section id="conduct" title="8. Acceptable use">
        <p>You must not use Good Hours to break the law, harass anyone, post false reviews, take payments outside the platform to avoid fees, scrape or overload the service, or try to access accounts or systems that are not yours.</p>
      </Section>

      <Section id="liability" title="9. Our liability">
        <p>
          We provide the platform with reasonable care and skill. We are not liable for the acts or omissions of hosts
          or users, or for losses that were not foreseeable. Nothing in these terms limits liability for death or
          personal injury caused by negligence, for fraud, or any other liability that cannot be limited by law.
          Otherwise, our total liability to you for a booking is limited to the amount you paid for it.
        </p>
      </Section>

      <Section id="changes" title="10. Changes and law">
        <p>
          We may update these terms and will post the new version here with a new date; significant changes will be
          notified in advance. These terms are governed by the law of England and Wales, and the courts of England and
          Wales have jurisdiction, though consumers may also bring claims where they live in the UK.
        </p>
      </Section>
    </LegalPage>
  );
}
