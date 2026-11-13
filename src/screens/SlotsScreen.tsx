import { CasinoDemoCatalog } from '../components/CasinoDemoCatalog';
import type { Screen } from '../types';
import { ProviderIframeScreen } from './ProviderIframeScreen';

interface SlotsScreenProps {
  onBack: () => void;
  onNavigate: (screen: Screen) => void;
}

export function SlotsScreen({ onBack, onNavigate }: SlotsScreenProps) {
  return (
    <>
      <CasinoDemoCatalog standard categoryFilter="slots" hideUnavailable onNavigate={onNavigate} />
      <ProviderIframeScreen
        product="casino"
        title="Слоты"
        fallback="Слоты появятся после подключения провайдера"
        onBack={onBack}
      />
    </>
  );
}
