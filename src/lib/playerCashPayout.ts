import { createWithdrawalRequest, listWithdrawalRequests } from './withdrawalRequests';

export interface PlayerCashPayout {
  id: string;
  playerPublicId: string;
  secretCode: string;
  amount: number;
  status: 'pending' | 'paid' | 'cancelled' | 'expired' | 'rejected';
  paidAt: string | null;
  createdAt: string;
  city?: string;
  point?: string;
}

export async function playerCreateCashPayout(
  amount: number,
  pickup?: { city: string; point: string },
): Promise<{
  code: string;
  amount: number;
  playerPublicId: string;
  city?: string;
  point?: string;
}> {
  if (!pickup?.city || !pickup.point) {
    throw new Error('Выберите город и точку выдачи');
  }
  const row = await createWithdrawalRequest({
    method: 'cash',
    methodLabel: `Наличные (Mobcash) · ${pickup.city} · ${pickup.point}`,
    amount,
    city: pickup.city,
    point: pickup.point,
  });
  if (!row.pin_code) {
    throw new Error('Вывод через кассу временно недоступен.');
  }
  return {
    code: row.pin_code,
    amount: row.amount,
    playerPublicId: row.player_id ?? '',
    city: pickup.city,
    point: pickup.point,
  };
}

export async function playerListCashPayouts(): Promise<PlayerCashPayout[]> {
  const rows = await listWithdrawalRequests();
  return rows
    .filter((row) => row.method === 'cash')
    .map((row) => ({
      id: row.id,
      playerPublicId: row.player_id ?? '',
      secretCode: row.pin_code ?? '',
      amount: row.amount,
      status: row.status === 'approved' ? 'pending' : row.status === 'paid' || row.status === 'cancelled' || row.status === 'expired' || row.status === 'rejected'
        ? row.status
        : 'pending',
      paidAt: null,
      createdAt: row.created_at,
      city: row.city ?? undefined,
      point: row.point ?? undefined,
    }));
}
