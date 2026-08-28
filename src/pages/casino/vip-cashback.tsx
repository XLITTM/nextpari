import { VipCashbackScreen } from '../../screens/VipCashbackScreen';
import type { Screen } from '../../types';

interface VipCashbackPageProps {
  onBack: () => void;
  onNavigate: (screen: Screen) => void;
}

export default function VipCashbackPage({ onBack, onNavigate }: VipCashbackPageProps) {
  return <VipCashbackScreen onBack={onBack} onNavigate={onNavigate} />;
}

export { VipCashbackScreen as VipCashback, VIP_LEVELS } from '../../screens/VipCashbackScreen';
