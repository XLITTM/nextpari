import { useState } from 'react';
import { Shield } from 'lucide-react';
import { approvedFootballLogo } from '../lib/sportsRegion';

interface TeamLogoProps {
  teamName: string;
  logo?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  xs: 'w-5 h-5 p-0.5',
  sm: 'w-6 h-6 p-0.5',
  md: 'w-10 h-10 p-1',
  lg: 'w-14 h-14 p-2',
};

export function TeamLogo({ teamName, logo, size = 'sm', className = '' }: TeamLogoProps) {
  const src = approvedFootballLogo(logo);
  const [failedUrl, setFailedUrl] = useState<string>();

  return (
    <div
      className={`${sizeMap[size]} ${src ? '' : 'rounded-full bg-white shadow-md dark:bg-zinc-800'} shrink-0 flex items-center justify-center ${className}`}
    >
      {src && src !== failedUrl ? (
        <img
          key={logo}
          src={src}
          alt={teamName}
          className="w-full h-full object-contain"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(src)}
        />
      ) : (
        <Shield className="w-3/4 h-3/4 text-gray-400" aria-hidden="true" />
      )}
    </div>
  );
}
