import { isAllowedBetConstructIframeSrc } from '../lib/betconstructLaunch';

interface BetConstructIframeHostProps {
  iframeUrl: string;
  providerOrigin: string;
  title: string;
}

/** Renders only a provider-hosted iframe. Never draws markets or a Nextpari betslip. */
export function BetConstructIframeHost({
  iframeUrl,
  providerOrigin,
  title,
}: BetConstructIframeHostProps) {
  if (!isAllowedBetConstructIframeSrc(iframeUrl, providerOrigin)) {
    return (
      <p className="px-4 text-center text-sm text-gray-400">
        Провайдер недоступен
      </p>
    );
  }
  return (
    <iframe
      src={iframeUrl}
      title={title}
      className="h-full w-full border-0 bg-black"
      allow="fullscreen"
      referrerPolicy="no-referrer-when-downgrade"
    />
  );
}
