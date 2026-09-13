export interface PlayerCashPayout {
  id: string;
  playerPublicId: string;
  secretCode: string;
  amount: number;
  status: 'pending' | 'paid' | 'cancelled';
  paidAt: string | null;
  createdAt: string;
  city?: string;
  point?: string;
}

export async function playerCreateCashPayout(
  amount: number,
  pickup?: { city: string; point: string; pinCode?: string },
): Promise<{
  code: string;
  amount: number;
  playerPublicId: string;
  newBalance: number;
  city?: string;
  point?: string;
}> {
  void amount;
  void pickup;
  throw new Error('Вывод через кассу временно недоступен.');
}

export async function playerListCashPayouts(): Promise<PlayerCashPayout[]> {
  return [];
}
