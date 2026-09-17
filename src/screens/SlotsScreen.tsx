import type { Screen } from '../types';
import { ProviderIframeScreen } from './ProviderIframeScreen';

interface SlotsScreenProps {
  onBack: () => void;
  onNavigate: (screen: Screen) => void;
}

export function SlotsScreen({ onBack }: SlotsScreenProps) {
  return (
    <ProviderIframeScreen
      product="casino"
      title="Слоты"
      fallback="Слоты появятся после подключения провайдера"
      onBack={onBack}
    />
  );
}
