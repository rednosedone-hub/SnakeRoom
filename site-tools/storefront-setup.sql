-- The Snake Room: one-time live storefront setup
-- Run this once in the Supabase SQL Editor. Safe to run more than once.
--
-- The app writes one row per shop: the shop's handle (slug) and a public
-- listing document. The storefront reads that row directly, so marking a snake
-- Available is enough to publish it -- no CSV, build step or file upload.
--
-- Only the published document is readable here. The collection, finances,
-- breeding records and every other table stay private to their owner.

create table if not exists storefront_shops (
  shop_slug text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  listings jsonb not null default '{"updated": "", "snakes": []}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists storefront_shops_user_idx
  on storefront_shops (user_id);

alter table storefront_shops enable row level security;

-- Anyone may read a published shop: these are the listings a breeder chose to
-- show. Nothing else about the collection is in this row.
drop policy if exists "Storefronts are public to read" on storefront_shops;
create policy "Storefronts are public to read"
  on storefront_shops for select
  using (true);

drop policy if exists "Keepers publish their own storefront" on storefront_shops;
create policy "Keepers publish their own storefront"
  on storefront_shops for insert to authenticated
  with check (auth.uid () = user_id);

drop policy if exists "Keepers update their own storefront" on storefront_shops;
create policy "Keepers update their own storefront"
  on storefront_shops for update to authenticated
  using (auth.uid () = user_id)
  with check (auth.uid () = user_id);

drop policy if exists "Keepers clear their own storefront" on storefront_shops;
create policy "Keepers clear their own storefront"
  on storefront_shops for delete to authenticated
  using (auth.uid () = user_id);

grant select on storefront_shops to anon, authenticated;
grant insert, update, delete on storefront_shops to authenticated;
