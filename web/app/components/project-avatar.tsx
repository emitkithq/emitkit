import { BrandIcon } from "@app/components/brand-icon";
import { domainOfUrl } from "@shared/domains";
import type { Project } from "@shared/rpc/schemas";
import { hueFor, initialsFor, MemberAvatar } from "@ui/member-avatar";

const SIZES = {
  lg: { avatar: "lg", className: "size-10 rounded-xl", px: 40 },
  sm: { avatar: "sm", className: "size-5 rounded-md", px: 20 },
} as const;

/** A project's brand icon (from its website), or its initials on its hue. */
export const ProjectAvatar = ({
  project,
  size = "lg",
}: {
  project: Pick<Project, "id" | "name" | "url">;
  size?: keyof typeof SIZES;
}) => {
  const { avatar, className, px } = SIZES[size];
  return (
    <BrandIcon
      className={`bg-surface ${className}`}
      domain={domainOfUrl(project.url)}
      fallback={
        <MemberAvatar
          className={className}
          hue={hueFor(project.id)}
          initials={initialsFor(project.name)}
          size={avatar}
        />
      }
      size={px}
    />
  );
};
