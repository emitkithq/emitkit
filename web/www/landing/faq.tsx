import { Accordion } from "@heroui/react";
import { Container } from "@www/components/container";
import { SectionIntro } from "@www/components/section-intro";
import { FAQ_ITEMS } from "@www/landing/faq-items";
import { CONTACT_EMAIL } from "@www/site";

export const Faq = () => (
  <section aria-labelledby="faq-title" className="pb-24 sm:pb-32" id="faq">
    <Container className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
      <div className="reveal">
        <SectionIntro
          id="faq-title"
          label="FAQ"
          number="05"
          title="Questions, answered."
        />
        <p className="text-copy text-muted m-0 mt-4">
          Something else?{" "}
          <a
            className="text-accent font-medium no-underline hover:underline"
            href={`mailto:${CONTACT_EMAIL}`}
          >
            {CONTACT_EMAIL}
          </a>
        </p>
      </div>
      <Accordion allowsMultipleExpanded className="reveal">
        {FAQ_ITEMS.map((item) => (
          <Accordion.Item id={item.id} key={item.id}>
            <Accordion.Heading>
              <Accordion.Trigger className="text-copy font-normal">
                {item.question}
                <Accordion.Indicator />
              </Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <Accordion.Body className="text-copy text-muted">
                {item.answer}
              </Accordion.Body>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </Container>
  </section>
);
