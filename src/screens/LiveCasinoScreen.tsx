import type { Screen } from '../types';
import { ProviderIframeScreen } from './ProviderIframeScreen';

interface LiveCasinoScreenProps {
  onBack: () => void;
  onNavigate: (screen: Screen) => void;
}

export function LiveCasinoScreen({ onBack }: LiveCasinoScreenProps) {
  return (
    <ProviderIframeScreen
      product="casino"
      title="Лайв казино"
      fallback="Скоро здесь появятся столы лайв-казино"
      onBack={onBack}
    />
  );
}
