/*
Allow Mobcash cash pickup withdrawals in withdrawal_requests.method
*/

ALTER TABLE withdrawal_requests
  DROP CONSTRAINT IF EXISTS withdrawal_requests_method_check;

ALTER TABLE withdrawal_requests
  ADD CONSTRAINT withdrawal_requests_method_check
  CHECK (method IN ('card', 'crypto', 'ewallet', 'cash'));
