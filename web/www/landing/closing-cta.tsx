import { useAppLinks } from "@www/app-origin";
import { ButtonLink } from "@www/components/button-link";
import { Container } from "@www/components/container";
import { Grain, Ping } from "@www/components/halftone";
import { Photo } from "@www/components/photo";
import { QUICKSTART_URL } from "@www/site";

export const ClosingCallToAction = () => {
  const { signUp } = useAppLinks();
  return (
    <section aria-labelledby="closing-title" className="pb-24 sm:pb-32">
      <Container>
        <div className="reveal relative isolate flex min-h-[520px] flex-col items-center overflow-hidden rounded-[28px] px-6 pt-20 pb-40 text-center sm:pt-24">
          <Photo
            className="absolute inset-0 -z-10 object-[50%_85%]"
            name="peak"
            sizes="(min-width: 1200px) 1136px, 100vw"
          />
          <div
            aria-hidden="true"
            className="from-midnight/50 via-midnight/20 absolute inset-0 -z-10 bg-gradient-to-b via-45% to-transparent to-75%"
          />
          <Grain className="-z-10" />
          <Ping className="top-[18%] left-[82%] -z-10 opacity-70" />
          <h2
            className="text-display text-paper m-0 max-w-[14ch] font-normal text-balance"
            id="closing-title"
          >
            Hear about your next signup.
          </h2>
          <p className="text-lead text-paper/80 m-0 mt-5 max-w-[40ch]">
            One call where it happens, from your code or your agents. EmitKit
            tells you on every device.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <ButtonLink
              className="bg-paper text-emit-blue hover:bg-paper/90"
              href={signUp}
              size="lg"
            >
              Get started
            </ButtonLink>
            <ButtonLink
              className="border-paper/40 bg-midnight/20 text-paper hover:bg-paper/15 backdrop-blur-md"
              href={QUICKSTART_URL}
              size="lg"
              variant="outline"
            >
              Read the quickstart
            </ButtonLink>
          </div>
        </div>
      </Container>
    </section>
  );
};
