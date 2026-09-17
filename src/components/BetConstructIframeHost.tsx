interface BetConstructIframeHostProps {
  iframeUrl: string;
  title: string;
}

function isProviderIframeUrl(iframeUrl: string): boolean {
  try {
    const url = new URL(iframeUrl);
    return url.protocol === 'https:'
      && url.searchParams.get('integrationMode') === '1'
      && Boolean(url.searchParams.get('AuthToken'));
  } catch {
    return false;
  }
}

/** Renders only a provider-hosted iframe. Never draws markets or a Nextpari betslip. */
export function BetConstructIframeHost({ iframeUrl, title }: BetConstructIframeHostProps) {
  if (!isProviderIframeUrl(iframeUrl)) {
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
