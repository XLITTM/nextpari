interface TeamLogoProps {
  teamName: string;
  logo?: string;
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
  const src = logo ?? `/crest${((teamName.charCodeAt(0) % 10) + 1)}.webp`;

  return (
    <div
      className={`${sizeMap[size]} rounded-full bg-white shadow-md shrink-0 flex items-center justify-center ${className}`}
    >
      <img
        src={src}
        alt={teamName}
        className="w-full h-full object-contain"
        loading="lazy"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    </div>
  );
}
