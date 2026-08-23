/*
# Create personal_data table (single-tenant, no auth)

1. New Tables
- `personal_data`
  - `id` (uuid, primary key)
  - `first_name` (text, user's first name)
  - `last_name` (text, user's last name)
  - `middle_name` (text, user's middle name / patronymic)
  - `birth_date` (text, date of birth as YYYY-MM-DD string)
  - `phone` (text, phone number)
  - `phone_verified` (boolean, whether phone is confirmed via SMS code, default false)
  - `email` (text, email address)
  - `email_verified` (boolean, whether email is confirmed, default false)
  - `passport` (text, passport series and number)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

2. Security
- Enable RLS on `personal_data`.
- Single-tenant no-auth app: allow anon + authenticated full CRUD.
*/

CREATE TABLE IF NOT EXISTS personal_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  middle_name text NOT NULL DEFAULT '',
  birth_date text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  phone_verified boolean NOT NULL DEFAULT false,
  email text NOT NULL DEFAULT '',
  email_verified boolean NOT NULL DEFAULT false,
  passport text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE personal_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_personal_data" ON personal_data;
CREATE POLICY "anon_select_personal_data" ON personal_data FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_personal_data" ON personal_data;
CREATE POLICY "anon_insert_personal_data" ON personal_data FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_personal_data" ON personal_data;
CREATE POLICY "anon_update_personal_data" ON personal_data FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_personal_data" ON personal_data;
CREATE POLICY "anon_delete_personal_data" ON personal_data FOR DELETE
  TO anon, authenticated USING (true);
