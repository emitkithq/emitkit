import { SiteLayout } from "@www/components/site-layout";
import { ClosingCallToAction } from "@www/landing/closing-cta";
import { Developers } from "@www/landing/developers";
import { Faq } from "@www/landing/faq";
import { Hero } from "@www/landing/hero";
import { HowItWorks } from "@www/landing/how-it-works";
import { Pricing } from "@www/landing/pricing";
import { PushSection } from "@www/landing/push-section";

export const LandingPage = () => (
  <SiteLayout>
    <Hero />
    <HowItWorks />
    <Developers />
    <PushSection />
    <Pricing />
    <Faq />
    <ClosingCallToAction />
  </SiteLayout>
);
