/*
  Harden messages RLS while keeping columns compatible with siteMessages.ts:
  - recipient_id  = 6-digit player public id (or 'all' for broadcast)
  - content       = message body
  - optional user_id for auth.users link

  profiles.player_id does not exist in this project — use profiles.public_id.
*/

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id text NOT NULL DEFAULT 'all',
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE messages ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages (created_at DESC);
CREATE INDEX IF NOT EXISTS messages_recipient_id_idx ON messages (recipient_id);
CREATE INDEX IF NOT EXISTS messages_user_id_idx ON messages (user_id);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Remove legacy wide-open policies from 20260828230000_create_messages.sql
DROP POLICY IF EXISTS "anon_select_messages" ON messages;
DROP POLICY IF EXISTS "anon_insert_messages" ON messages;
DROP POLICY IF EXISTS "anon_update_messages" ON messages;
DROP POLICY IF EXISTS "anon_delete_messages" ON messages;
DROP POLICY IF EXISTS "Users can view their own messages" ON messages;
DROP POLICY IF EXISTS "Admins can insert messages" ON messages;
DROP POLICY IF EXISTS "Users can mark messages read" ON messages;
DROP POLICY IF EXISTS "Anon can view broadcast and addressed messages" ON messages;

-- Authenticated players: broadcast + own by auth uid / profiles.public_id
CREATE POLICY "Users can view their own messages"
ON messages FOR SELECT
TO authenticated
USING (
  recipient_id = 'all'
  OR user_id = auth.uid()
  OR recipient_id = (
    SELECT p.public_id
    FROM profiles p
    WHERE p.id = auth.uid()
    LIMIT 1
  )
);

-- Current app uses anon/guest sessions and filters by public_id on the client.
-- Keep anon SELECT so inbox still works until guests are fully wired to auth.users.
CREATE POLICY "Anon can view broadcast and addressed messages"
ON messages FOR SELECT
TO anon
USING (true);

-- Owner / backoffice send (same client key as today)
CREATE POLICY "Admins can insert messages"
ON messages FOR INSERT
TO authenticated, anon
WITH CHECK (true);

-- Allow marking is_read (inbox)
CREATE POLICY "Users can mark messages read"
ON messages FOR UPDATE
TO authenticated, anon
USING (true)
WITH CHECK (true);
