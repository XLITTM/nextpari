-- Review only. Do not apply this migration to production until the owner
-- approves the Android release store. It does not touch player balances.

create table if not exists public.android_app_releases (
  version_code integer primary key check (version_code > 1),
  version_name text not null,
  release_notes text not null,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 80000000),
  min_sdk integer not null check (min_sdk >= 26),
  artifact_key text not null unique,
  certificate_sha256 text not null check (certificate_sha256 ~ '^[a-f0-9]{64}$'),
  effective_on date not null,
  status text not null check (status in ('draft', 'published', 'superseded', 'retired')),
  published_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists android_app_releases_one_published
  on public.android_app_releases (status)
  where status = 'published';

create table if not exists public.android_download_settings (
  id integer primary key check (id = 1),
  banner_enabled boolean not null default false,
  banner_title text not null,
  banner_body text not null,
  update_mode text not null default 'none' check (update_mode in ('none', 'recommended')),
  minimum_version_code integer not null default 0 check (minimum_version_code >= 0),
  updated_at timestamptz not null default now()
);

insert into public.android_download_settings (id, banner_title, banner_body)
values (1, 'Nextpari для Android', 'Скачайте официальное приложение')
on conflict (id) do nothing;

create table if not exists public.android_app_release_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null,
  actor_id text not null,
  action text not null,
  version_code integer
);

alter table public.android_app_releases enable row level security;
alter table public.android_download_settings enable row level security;
alter table public.android_app_release_audit enable row level security;

-- No anon or authenticated policies. The Nextpari server uses the service role
-- after an owner session check. Players cannot publish releases.
