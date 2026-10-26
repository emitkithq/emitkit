import { LegalDocument } from "@www/legal/legal-document";
import {
  CONTACT_EMAIL,
  EVENT_RETENTION_DAYS,
  OPERATOR_ADDRESS,
  OPERATOR_KVK,
  OPERATOR_LEGAL,
  OPERATOR_VAT_ID,
} from "@www/site";

const contact = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

export const PrivacyPage = () => (
  <LegalDocument title="Privacy Policy">
    <p>
      EmitKit lets you send product events from your code, SDK or AI agent to a
      real-time feed and get push notifications about them. It is operated by{" "}
      {OPERATOR_LEGAL} (“we”, “us”). This policy explains what personal data we
      process, why, where it goes and what control you have. Questions go to{" "}
      {contact}.
    </p>

    <h2>Who is responsible</h2>
    <p>
      We are the controller for the data about you and your team that we need to
      run your account. The events and identities your projects send us may
      contain personal data about your own users, such as an email address in an
      event description or a user ID. You decide what to send, so you are the
      controller for that data and we process it on your behalf, only to provide
      EmitKit to you.
    </p>

    <h2>What we collect</h2>
    <ul>
      <li>
        <strong>Account data:</strong> your name, email address, password
        (stored only as a hash) or passkey, your organizations and memberships,
        and the email addresses of people you invite.
      </li>
      <li>
        <strong>Content you send:</strong> events (channel, title, description,
        icon, tags, metadata and user ID), identities you create through the
        API, and your projects, channels and settings.
      </li>
      <li>
        <strong>API keys:</strong> checked against a hash, and also stored
        encrypted so that owners and admins of the organization can reveal a key
        again.
      </li>
      <li>
        <strong>Billing data</strong> (hosted plans): the organization’s name,
        the owner’s email address, the plan, seats, invoices and payment status.
        Card details are entered with and stored by Stripe; we never see them.
      </li>
      <li>
        <strong>Push subscriptions:</strong> when you turn on notifications,
        your browser gives us a delivery address and encryption keys for that
        device. We use them only to send you notifications.
      </li>
      <li>
        <strong>Technical data:</strong> IP address, browser user agent and
        timestamps in sign-in sessions and request logs, used to keep you signed
        in, enforce rate limits, prevent abuse and fix problems.
      </li>
    </ul>
    <p>
      This website (emitkit.com) sets no cookies and loads no analytics,
      advertising or other third-party scripts. The EmitKit app uses essential
      cookies only, to keep you signed in.
    </p>

    <h2>How we use it</h2>
    <ul>
      <li>
        To provide EmitKit: store and show your events, deliver push
        notifications, and send sign-in, verification and invitation emails.
      </li>
      <li>
        To keep EmitKit secure and reliable: authentication, rate limiting,
        abuse prevention and debugging.
      </li>
      <li>
        To contact you about your account or important changes to the service.
      </li>
    </ul>
    <p>
      We do not sell personal data, use it for advertising or train AI models on
      your events. Under the GDPR, we rely on the performance of our contract
      with you, our legitimate interest in keeping the service secure and
      working, and our legal obligations.
    </p>

    <h2>Where it is processed</h2>
    <p>
      EmitKit runs on <strong>Cloudflare</strong>: Workers run the website, app
      and API; D1 stores account, project and channel data; Analytics Engine
      stores events; Queues hand events to the notification sender; Email
      Sending delivers our emails; and Workers AI suggests an emoji when you
      name a new channel. Cloudflare operates a global network, so data may be
      processed outside your country. Cloudflare’s data processing addendum
      includes the EU Standard Contractual Clauses.
    </p>
    <p>
      When you turn on push notifications, each notification travels through
      your browser’s push service (for example Apple, Google, Mozilla or
      Microsoft). Its content is encrypted for your device, so the push service
      cannot read it.
    </p>
    <p>
      When an organization starts a hosted plan, billing is handled by{" "}
      <strong>Autumn</strong> (plans and subscriptions) and{" "}
      <strong>Stripe</strong> (checkout, payments, invoices and tax). They
      receive the billing data above. Stripe processes payment details as an
      independent controller under its own privacy policy. Both may process data
      outside your country under appropriate safeguards such as the EU Standard
      Contractual Clauses.
    </p>

    <p>
      When you start a new organization on our hosted service, we send the
      domain of your work email address, or the website you enter, to{" "}
      <strong>Context.dev</strong>, which returns the public name, logo and
      industry of the company behind it. We use them to name your organization,
      show its logo and suggest what to track. Only the domain is sent, never
      your full address, and addresses at mailbox providers such as gmail.com
      are not looked up.
    </p>

    <h2>How long we keep it</h2>
    <ul>
      <li>
        Events are kept for {EVENT_RETENTION_DAYS} days and then deleted
        automatically.
      </li>
      <li>
        Account, organization, project and channel data is kept until you delete
        it or your account.
      </li>
      <li>
        Sessions, rate-limit counters and retry records expire automatically.
      </li>
      <li>
        Invoices and payment records are kept for as long as tax law requires (7
        years under Dutch law), even after an account is deleted.
      </li>
      <li>
        Database backups for point-in-time recovery are kept for up to 30 days,
        so deleted data can remain in them for that long.
      </li>
    </ul>

    <h2>Your choices and rights</h2>
    <p>
      You can delete events, projects and your account at any time from the
      EmitKit app. You also have the right to access, correct, export or erase
      your personal data, and to object to or restrict how we use it. Email{" "}
      {contact}
      and we will respond within one month. If you are unhappy with our answer,
      you can complain to your data protection authority.
    </p>
    <p>
      If one of your users asks us about data you sent, we will refer them to
      you. The API can erase an identity you created for them.
    </p>

    <h2>Security</h2>
    <p>
      All traffic is encrypted with HTTPS. Passwords are stored only as hashes,
      API keys as hashes plus an encrypted copy for revealing them, every
      request is checked against the organization it belongs to, and access to
      production systems is limited to the operator.
    </p>

    <h2>Children</h2>
    <p>
      EmitKit is a tool for developers and is not directed at anyone under 16.
    </p>

    <h2>Changes</h2>
    <p>
      When this policy changes, we update this page and the date above. If a
      change materially affects how we use your data, we will email you before
      it takes effect.
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
