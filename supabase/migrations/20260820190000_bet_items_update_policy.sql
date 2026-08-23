/*
# Settlement writes: update bet_items legs after auto-calc
*/

DROP POLICY IF EXISTS "anon_update_bet_items" ON bet_items;
CREATE POLICY "anon_update_bet_items" ON bet_items FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
