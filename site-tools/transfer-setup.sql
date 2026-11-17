-- The Snake Room: hand one animal to another keeper's account
-- Run once in the Supabase SQL Editor. Safe to run more than once.
--
-- One row per transfer. The sender writes it, the named account reads it, and
-- nobody else can see either side: no collection, no prices, no buyers.
-- The snake column holds only the sanitised record that transfer-helpers.js
-- builds, so a transfer can never carry the seller's ledger with it.

create table if not exists public.snake_transfers (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users (id) on delete cascade,
  from_email text not null default '',
  from_name text not null default '',
  to_email text not null,
  snake jsonb not null,
  note text not null default '',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);

create index if not exists snake_transfers_to_idx
  on public.snake_transfers (lower(to_email), status);
create index if not exists snake_transfers_from_idx
  on public.snake_transfers (from_user, created_at desc);

alter table public.snake_transfers enable row level security;

-- The sender sees and writes their own outgoing transfers.
drop policy if exists "Senders read their transfers" on public.snake_transfers;
create policy "Senders read their transfers"
  on public.snake_transfers for select
  using (auth.uid () = from_user);

drop policy if exists "Senders create transfers" on public.snake_transfers;
create policy "Senders create transfers"
  on public.snake_transfers for insert to authenticated
  with check (
    auth.uid () = from_user
    and lower(to_email) <> lower(coalesce(auth.jwt () ->> 'email', ''))
  );

drop policy if exists "Senders cancel their transfers" on public.snake_transfers;
create policy "Senders cancel their transfers"
  on public.snake_transfers for update to authenticated
  using (auth.uid () = from_user and status = 'pending')
  with check (auth.uid () = from_user and status in ('pending', 'cancelled'));

-- The named account sees the transfer addressed to its own email, and can only
-- claim it once.
drop policy if exists "Recipients read their transfers" on public.snake_transfers;
create policy "Recipients read their transfers"
  on public.snake_transfers for select to authenticated
  using (lower(auth.jwt () ->> 'email') = lower(to_email));

drop policy if exists "Recipients claim their transfers" on public.snake_transfers;
create policy "Recipients claim their transfers"
  on public.snake_transfers for update to authenticated
  using (lower(auth.jwt () ->> 'email') = lower(to_email) and status = 'pending')
  with check (
    lower(auth.jwt () ->> 'email') = lower(to_email)
    and status in ('pending', 'accepted')
  );

-- An accepted transfer is history: neither side edits it afterwards.
drop policy if exists "Transfers are not deleted" on public.snake_transfers;
create policy "Transfers are not deleted"
  on public.snake_transfers for delete to authenticated
  using (false);

grant select, insert, update on public.snake_transfers to authenticated;
