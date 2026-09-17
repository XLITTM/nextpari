import { ProviderIframeScreen } from './ProviderIframeScreen';

interface ProviderSportsbookScreenProps {
  onBack: () => void;
}

export function ProviderSportsbookScreen({ onBack }: ProviderSportsbookScreenProps) {
  return (
    <ProviderIframeScreen
      product="sportsbook"
      title="Спортбук провайдера"
      fallback="Спортбук провайдера откроется во встроенном окне после подключения"
      onBack={onBack}
    />
  );
}
