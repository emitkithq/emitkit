import { plans } from "@shared/billing";
import { LegalDocument } from "@www/legal/legal-document";
import {
  CONTACT_EMAIL,
  EVENT_RETENTION_DAYS,
  OPERATOR_ADDRESS,
  OPERATOR_KVK,
  OPERATOR_LEGAL,
  OPERATOR_VAT_ID,
  RATE_LIMIT_PER_MINUTE,
} from "@www/site";

const contact = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

/** Monthly events per organization that "unlimited" comfortably covers. */
const FAIR_USE_EVENTS = "250,000";
const TRIAL_DAYS = plans.solo.trialDays;
const REFUND_DAYS = 14;

export const TermsPage = () => (
  <LegalDocument title="Terms of Service">
    <p>
      These terms cover your use of EmitKit: this website, the app, the API and
      the MCP server, operated by {OPERATOR_LEGAL} (“we”, “us”). By creating an
      account, starting a plan or using the API you agree to them. If you use
      EmitKit for a company or other organization, you accept these terms on its
      behalf. Our <a href="/privacy">Privacy Policy</a> explains how we handle
      personal data.
    </p>

    <h2>The service</h2>
    <p>
      EmitKit receives the events you send, shows them in a real-time feed and
      delivers push notifications about them. You can use it in two ways:
    </p>
    <ul>
      <li>
        <strong>Self-hosted:</strong> you run the EmitKit software on your own
        Cloudflare account under its license (PolyForm Shield 1.0.0). These
        terms don’t cover self-hosted copies, we don’t charge for them, and we
        have no access to their data.
      </li>
      <li>
        <strong>Hosted:</strong> we run EmitKit for you at emitkit.com. These
        terms cover the hosted service, including its paid plans.
      </li>
    </ul>

    <h2>Your account</h2>
    <p>
      Give accurate information when you sign up and keep your password,
      passkeys and API keys secret. You are responsible for what happens under
      your account and keys. If a key leaks, revoke or rotate it in the app and
      tell us at {contact}.
    </p>

    <h2>Plans and payment</h2>
    <p>
      Hosted EmitKit is a paid service. The current plans and prices are on our{" "}
      <a href="/#pricing">pricing page</a>; the price shown when you check out
      is the price you pay. Plans belong to an organization, and payments are
      handled by our billing providers (Autumn and Stripe), who process your
      card details; we never see them. Prices are in US dollars. Taxes such as
      VAT are added at checkout where they apply.
    </p>
    <ul>
      <li>
        <strong>Getting started:</strong> a new organization starts by choosing
        a plan. Organizations you are invited to are covered by that
        organization’s plan.
      </li>
      <li>
        <strong>Free trial:</strong> monthly and yearly plans start with a{" "}
        {TRIAL_DAYS}-day free trial. You need a payment method to start it. If
        you don’t cancel before the trial ends, the plan starts and your payment
        method is charged. Each organization can use a trial once.
      </li>
      <li>
        <strong>Renewal:</strong> monthly and yearly plans renew automatically
        at the end of each period and are charged in advance, until you cancel.
      </li>
      <li>
        <strong>Seats:</strong> each member of an organization, and each pending
        invitation, uses a seat. Plans include a number of seats; you can add
        more at the listed price. When you add seats during a period, you pay a
        prorated amount for the rest of that period.
      </li>
      <li>
        <strong>Cancelling:</strong> you can cancel at any time in Settings →
        Billing. Your plan stays active until the end of the period you paid for
        and is not renewed.
      </li>
      <li>
        <strong>Price changes:</strong> we may change our prices. We will tell
        you at least 30 days before a new price applies to your plan, and it
        takes effect at your next renewal, so you can cancel before then.
      </li>
      <li>
        <strong>Failed payments:</strong> if a payment fails, we will let you
        know and retry it. If it still can’t be collected, or your plan ends,
        push notifications for the organization pause. EmitKit keeps receiving
        and storing your events, and push notifications resume when the
        organization has an active plan again.
      </li>
    </ul>

    <h2>Refunds</h2>
    <p>
      Monthly and yearly payments are not refunded for the rest of a period once
      it has started; cancelling stops the next renewal. Lifetime plans can be
      refunded in full within {REFUND_DAYS} days of purchase: email {contact}.
      If a charge was a mistake on our side, we will refund it. This doesn’t
      limit any refund or withdrawal rights you have as a consumer under the
      mandatory laws of your country.
    </p>

    <h2>Lifetime plans</h2>
    <p>
      A lifetime plan is paid once and gives its organization the plan’s
      features and number of seats for as long as we offer hosted EmitKit. It
      isn’t transferable to another organization. If we ever stop running hosted
      EmitKit, we will give lifetime customers at least 90 days’ notice to
      export their data and move to a self-hosted copy, which the license lets
      you run. Lifetime launch prices go up as they sell; the price you paid
      doesn’t change afterwards.
    </p>

    <h2>Fair use</h2>
    <p>
      Hosted plans include unlimited events, projects and channels for normal
      product use: signups, payments, alerts and similar events. As a guide,
      that comfortably covers up to about {FAIR_USE_EVENTS} events a month per
      organization. EmitKit isn’t built for logging every request or page view.
      If an organization’s usage is far beyond that, or affects the service for
      others, we will contact you first to find a solution, such as reducing the
      volume or self-hosting. We only limit the account if that doesn’t work.
    </p>

    <h2>Acceptable use</h2>
    <p>Do not use EmitKit to:</p>
    <ul>
      <li>break the law or infringe anyone’s rights;</li>
      <li>
        send data you are not allowed to share, including health data, payment
        card numbers, passwords or other secrets;
      </li>
      <li>
        access data that is not yours, probe or overload the service, or work
        around its rate limit of {RATE_LIMIT_PER_MINUTE} requests per minute per
        API key;
      </li>
      <li>send spam or harass anyone;</li>
      <li>
        resell or rebrand the hosted service without our written permission.
      </li>
    </ul>

    <h2>Your content</h2>
    <p>
      You own the events and other content you send. You allow us to store,
      process and display it only to run EmitKit for you. If your content
      includes personal data about other people, you are responsible for having
      a lawful basis to share it with us.
    </p>
    <p>
      Events are kept for {EVENT_RETENTION_DAYS} days. EmitKit is not a backup
      or a system of record, so keep your own copy of anything you need to
      retain.
    </p>

    <h2>Availability</h2>
    <p>
      We work hard to keep EmitKit running, but we don’t guarantee a specific
      level of uptime. Push notifications depend on browsers, operating systems
      and their push services, so they can be delayed or not arrive at all. Do
      not rely on EmitKit as the only alert for anything critical. We may change
      or discontinue features. If we remove something your paid plan depends on,
      we will tell you in advance, and you can cancel.
    </p>

    <h2>Ending your use</h2>
    <p>
      You can stop using EmitKit and delete your organization or account at any
      time from the app. Deleting an organization cancels its plan immediately;
      unused time is not refunded, except as described under Refunds. We may
      suspend or close an account that breaks these terms or puts the service or
      other people at risk, and we will tell you why when we reasonably can. If
      we close an account without such a reason, we will refund the unused part
      of any prepaid period.
    </p>

    <h2>Disclaimer and liability</h2>
    <p>
      EmitKit is provided “as is” and “as available”, without warranties of any
      kind, to the extent the law allows. We are not liable for indirect or
      consequential losses, lost profits or lost data, and our total liability
      for any claim is limited to the amount you paid us for EmitKit in the 12
      months before the claim. Nothing in these terms limits liability that
      cannot be limited by law, or takes away rights you have as a consumer
      under the mandatory laws of your country.
    </p>

    <h2>Governing law</h2>
    <p>
      These terms are governed by Dutch law. Disputes go to the competent court
      in the Netherlands (Rechtbank Overijssel). If you are a consumer, you keep
      the protection of the mandatory laws of the country you live in, and you
      can also bring a claim in the courts there.
    </p>

    <h2>Changes to these terms</h2>
    <p>
      When we change these terms, we update this page and the date above. For
      material changes we will email you at least 30 days before they take
      effect. If you keep using EmitKit after that, the new terms apply; if you
      don’t agree, you can cancel before they take effect.
    </p>

    <h2>Contact</h2>
    <p>
      {OPERATOR_LEGAL}
      <br />
      {OPERATOR_ADDRESS}
      <br />
      KvK {OPERATOR_KVK} · VAT {OPERATOR_VAT_ID}
      <br />
      {contact}
    </p>
  </LegalDocument>
);
