/*
  Store full coupon event payload: tournament + selection on bet_items.
*/

ALTER TABLE bet_items ADD COLUMN IF NOT EXISTS tournament text;
ALTER TABLE bet_items ADD COLUMN IF NOT EXISTS sport text;
ALTER TABLE bet_items ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE bet_items ADD COLUMN IF NOT EXISTS selection text;
