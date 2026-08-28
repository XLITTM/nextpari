/*
# Create messages table (site inbox / owner → player)

1. New Tables
- `messages`
  - `id` (uuid, primary key)
  - `recipient_id` (text) — player public id, or 'all' for broadcast
  - `title` (text)
  - `content` (text)
  - `is_read` (boolean, default false)
  - `created_at` (timestamptz, default now())

2. Security
- Enable RLS; allow anon + authenticated CRUD (single-tenant app).
*/

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id text NOT NULL DEFAULT 'all',
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages (created_at DESC);
CREATE INDEX IF NOT EXISTS messages_recipient_id_idx ON messages (recipient_id);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_messages" ON messages;
CREATE POLICY "anon_select_messages"
ON messages FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_messages" ON messages;
CREATE POLICY "anon_insert_messages"
ON messages FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_messages" ON messages;
CREATE POLICY "anon_update_messages"
ON messages FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_messages" ON messages;
CREATE POLICY "anon_delete_messages"
ON messages FOR DELETE
TO anon, authenticated USING (true);
