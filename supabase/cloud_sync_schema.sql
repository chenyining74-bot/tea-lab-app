create extension if not exists pgcrypto;

create table if not exists public.lab_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  profile_name text,
  profile_note text,
  created_at timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);

create table if not exists public.lab_snapshots (
  account_id uuid primary key references public.lab_accounts(id) on delete cascade,
  snapshot jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
