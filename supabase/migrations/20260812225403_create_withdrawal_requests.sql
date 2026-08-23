/*
# Create withdrawal_requests table (single-tenant, no auth)

1. New Tables
- `withdrawal_requests`
  - `id` (uuid, primary key)
  - `method` (text, not null) — withdrawal method: 'card' | 'crypto' | 'ewallet'
  - `method_label` (text, not null) — display label, e.g. "Вывод на карту **** 4589" or "Вывод USDT-TRC20"
  - `amount` (numeric, not null) — withdrawal amount in TMTM
  - `status` (text, not null, default 'pending') — 'pending' | 'approved' | 'rejected'
  - `rejection_reason` (text, nullable) — reason for rejection, shown only when status='rejected'
  - `created_at` (timestamptz, default now())

2. Security
- Enable RLS on `withdrawal_requests`.
- Allow anon + authenticated CRUD because the app is single-tenant with no sign-in.
*/

CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method text NOT NULL CHECK (method IN ('card', 'crypto', 'ewallet')),
  method_label text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE withdrawal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_withdrawals" ON withdrawal_requests;
CREATE POLICY "anon_select_withdrawals"
ON withdrawal_requests FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_withdrawals" ON withdrawal_requests;
CREATE POLICY "anon_insert_withdrawals"
ON withdrawal_requests FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_withdrawals" ON withdrawal_requests;
CREATE POLICY "anon_update_withdrawals"
ON withdrawal_requests FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_withdrawals" ON withdrawal_requests;
CREATE POLICY "anon_delete_withdrawals"
ON withdrawal_requests FOR DELETE
TO anon, authenticated USING (true);
