import { CasinoDemoCatalog } from '../components/CasinoDemoCatalog';
import type { Screen } from '../types';
import { ProviderIframeScreen } from './ProviderIframeScreen';

interface LiveCasinoScreenProps {
  onBack: () => void;
  onNavigate: (screen: Screen) => void;
}

export function LiveCasinoScreen({ onBack, onNavigate }: LiveCasinoScreenProps) {
  return (
    <>
      <CasinoDemoCatalog standard categoryFilter="live" hideUnavailable onNavigate={onNavigate} />
      <ProviderIframeScreen
        product="casino"
        title="Лайв казино"
        fallback="Скоро здесь появятся столы лайв-казино"
        onBack={onBack}
      />
    </>
  );
}
