-- FlarePay platform schema (PRD v4)
-- Auth itself lives in Supabase's auth schema (GoTrue). These tables hold the
-- product: merchant profiles, payout configs, API keys, charges, proofs,
-- attestation handles (crash-resume), webhooks, and the activity feed.
--
-- Access model: the FlarePay server uses the service_role key (bypasses RLS)
-- and enforces account scoping in every query. RLS is still enabled with
-- owner-read policies as defense in depth for any future direct client reads.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create table public.payout_configs (
  account_id uuid not null references public.profiles (id) on delete cascade,
  asset text not null check (asset in ('XRP', 'DOGE', 'BTC')),
  -- XRPL classic address for XRP; xpub for UTXO chains
  value text not null,
  validated_at timestamptz,
  primary key (account_id, asset)
);

create table public.api_keys (
  key_hash text primary key, -- sha256 hex of the fpk_ key
  account_id uuid not null references public.profiles (id) on delete cascade,
  label text not null default 'default',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index api_keys_account on public.api_keys (account_id);

create table public.charges (
  id text primary key, -- on-chain charge id from FlarePayEscrow
  account_id uuid not null references public.profiles (id) on delete cascade,
  asset text not null default 'XRP',
  state text not null,
  usd_cents bigint not null,
  xrp_amount text not null,
  drops text not null,
  rate text not null,
  destination_tag bigint,
  deposit_address text, -- UTXO assets: per-charge derived address
  merchant_address text not null,
  payment_uri text not null,
  metadata text not null default '',
  expires_at bigint not null,
  created_at_ms bigint not null,
  created_tx text not null,
  xrpl_tx_hash text,
  payer_address text,
  voting_round bigint,
  settle_tx text,
  settled_at_ms bigint,
  error text,
  steps jsonb not null default '[]'::jsonb
);
create index charges_account on public.charges (account_id, created_at_ms desc);
create index charges_state on public.charges (state);

-- Crash-resume: the pieces of an FDC ResumeHandle, persisted as they appear,
-- so a server restart never pays an attestation fee twice.
create table public.attestations (
  charge_id text primary key references public.charges (id) on delete cascade,
  abi_encoded_request text,
  voting_round_id bigint,
  request_tx_hash text,
  fee_paid_wei text
);

-- Proofs verify forever; kept for settle retries and receipt re-verification.
create table public.proofs (
  charge_id text primary key references public.charges (id) on delete cascade,
  proof jsonb not null
);

create table public.webhooks (
  account_id uuid primary key references public.profiles (id) on delete cascade,
  url text not null,
  secret text not null
);

create table public.webhook_deliveries (
  id bigint generated always as identity primary key,
  account_id uuid not null references public.profiles (id) on delete cascade,
  charge_id text,
  event text not null,
  status text not null,
  attempt int not null,
  at_ms bigint not null
);
create index deliveries_account on public.webhook_deliveries (account_id, at_ms desc);

create table public.events (
  id bigint generated always as identity primary key,
  account_id uuid references public.profiles (id) on delete cascade,
  charge_id text,
  type text not null,
  detail text,
  at_ms bigint not null
);
create index events_account on public.events (account_id, at_ms desc);

-- New-user hook: create a profile row automatically on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, coalesce(new.email, ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS: enabled everywhere; the server's service_role bypasses it, and any
-- future browser-direct reads are limited to the owner.
alter table public.profiles enable row level security;
alter table public.payout_configs enable row level security;
alter table public.api_keys enable row level security;
alter table public.charges enable row level security;
alter table public.attestations enable row level security;
alter table public.proofs enable row level security;
alter table public.webhooks enable row level security;
alter table public.webhook_deliveries enable row level security;
alter table public.events enable row level security;

create policy "own profile" on public.profiles for select using (auth.uid() = id);
create policy "own payout" on public.payout_configs for select using (auth.uid() = account_id);
create policy "own charges" on public.charges for select using (auth.uid() = account_id);
create policy "own events" on public.events for select using (auth.uid() = account_id);
create policy "own deliveries" on public.webhook_deliveries for select using (auth.uid() = account_id);
