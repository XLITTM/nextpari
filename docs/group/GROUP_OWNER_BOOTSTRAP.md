# First group owner

This is a one-time manual procedure for the existing Supabase project `lsmfdhenmceiammyptzu`, schema `group_control`. It does not create a project, expose the schema in the Data API, or insert a person.

The application does not choose an email, a password, or an owner UUID. Those stay in the Supabase dashboard and in server environment variables.

## 1. Confirm the live columns

In the Supabase SQL editor, run only the `information_schema.columns` query from `server/group/sql/procedures/003_group_control_reader.sql`.

The reader selects a column only when that catalog result contains it. `owner_identities` must have `status` and either `auth_user_id` or `id`. `owner_permissions` must have `permission` and either `owner_id` or `identity_id`. `brand_owners` must have `owner_id` and `brand_code`. The other six read tables must have every column named in `server/group/schemaContract.ts`.

If a name differs, stop. Do not rename production columns from this procedure, and do not apply the old separate-database drafts.

## 2. Create the reader role

Still in the SQL editor, as the database owner, run the rest of `003_group_control_reader.sql` after deleting any `GRANT SELECT` line whose column was absent in step 1.

Then set a password that is not written into the repository:

```sql
ALTER ROLE group_control_reader PASSWORD '<typed once>';
```

Store the connection string only as the server variable `GROUP_CONTROL_DATABASE_URL`. The user must be `group_control_reader`, the host must be this project's database or pooler, and `sslmode=require`. Do not create a `VITE_` variable for it.

The role can `SELECT` the read columns only. It cannot insert, update, delete, or execute `allocate_player_id`. Treasury tables are not granted.

Do not add `group_control` to Exposed schemas. Browser clients keep using the anon key for Supabase Auth only. They never receive the database URL.

## 3. Create the first owner

1. In Authentication → Users, create the Auth user yourself. Choose the email and password there.
2. Copy the Auth user UUID from that user page.
3. Insert `owner_identities`, `owner_permissions`, and `brand_owners` with that UUID, using the column names confirmed in step 1. The commented statements at the bottom of the procedure file are the template. Permissions for the dashboard are `brands.read`, `reports.read`, and `staff.map`.
4. Open the Group Owner app and sign in. The server loads the identity before it allows TOTP enrollment. A NextPari player, a brand staff user, or a disabled owner receives `OWNER_UNKNOWN` or `OWNER_DISABLED` and no MFA setup address.
5. Add the shown MFA address to an authenticator and submit the six-digit code. Reads stay closed until the session is `aal2`.

The group session is not a NextPari owner session. Brand 001 money totals stay unavailable until a separate server-to-server report adapter exists. Treasury transfers, staff creation, player balances, and player-id cutover stay closed.
