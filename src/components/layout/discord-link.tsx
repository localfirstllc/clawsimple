import { siteConfig } from '@/config/site';

type DiscordLinkProps = {
  className?: string;
  label?: string;
};

export function DiscordLink({ className, label = 'Discord' }: DiscordLinkProps) {
  return (
    <a
      href={siteConfig.links.discord}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      aria-label="Join our Discord"
    >
      {label}
    </a>
  );
}
