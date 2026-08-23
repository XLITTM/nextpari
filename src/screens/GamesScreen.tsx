import { GamesHub } from '../components/games/GamesHub';
import type { Screen } from '../types';

interface GamesScreenProps {
  onBack: () => void;
  onNavigate: (screen: Screen) => void;
}

export function GamesScreen({ onBack, onNavigate }: GamesScreenProps) {
  return (
    <div className="h-full min-h-0">
      <GamesHub onBack={onBack} onNavigate={onNavigate} />
    </div>
  );
}
