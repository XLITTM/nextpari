import { ChevronLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BetConstructIframeHost } from '../components/BetConstructIframeHost';
import {
  requestBetConstructLaunchSession,
  type BetConstructLaunchProduct,
  type BetConstructLaunchSession,
} from '../lib/betconstructLaunch';

interface ProviderIframeScreenProps {
  product: BetConstructLaunchProduct;
  title: string;
  fallback: string;
  onBack: () => void;
}

export function ProviderIframeScreen({
  product,
  title,
  fallback,
  onBack,
}: ProviderIframeScreenProps) {
  const [session, setSession] = useState<BetConstructLaunchSession | null>(null);
  const [message, setMessage] = useState(fallback);

  useEffect(() => {
    let cancelled = false;
    void requestBetConstructLaunchSession({ product })
      .then((next) => {
        if (cancelled) return;
        setSession(next);
      })
      .catch(() => {
        if (cancelled) return;
        setMessage(fallback);
      });
    return () => {
      cancelled = true;
    };
  }, [fallback, product]);

  return (
    <div className="flex min-h-full flex-col bg-[#0a1128]">
      <div className="shrink-0 border-b border-gray-800 bg-[#1e293b]">
        <div className="flex h-14 items-center justify-between px-2">
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center text-gray-300 active:scale-95"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <h1 className="flex-1 text-center text-lg font-bold text-white">{title}</h1>
          <div className="w-10" />
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-y-auto p-4 pb-24">
        {session ? (
          <div className="h-[min(70vh,32rem)] w-full">
            <BetConstructIframeHost
              iframeUrl={session.iframeUrl}
              providerOrigin={session.providerOrigin}
              title={title}
            />
          </div>
        ) : (
          <p className="text-center text-sm text-gray-400">{message}</p>
        )}
      </div>
    </div>
  );
}
