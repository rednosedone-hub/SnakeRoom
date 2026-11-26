-- Stripe subscription state and temporary beta access for The Snake Room.
-- Run in the Supabase SQL Editor before deploying the Edge Functions.

create table if not exists public.billing_profiles (
    user_id uuid primary key references auth.users (id) on delete cascade,
    plan text not null default 'beta'
        check (plan in ('free', 'keeper', 'breeder', 'pro', 'beta', 'owner')),
    beta_access boolean not null default true,
    stripe_customer_id text unique,
    stripe_subscription_id text unique,
    stripe_price_id text,
    subscription_status text,
    current_period_end timestamptz,
    cancel_at_period_end boolean not null default false,
    updated_at timestamptz not null default now()
);

alter table public.billing_profiles enable row level security;
drop policy if exists "Users can read their billing profile" on public.billing_profiles;
create policy "Users can read their billing profile"
    on public.billing_profiles for select to authenticated
    using (auth.uid() = user_id);

-- Stripe webhooks use the service role. Browsers can never write plan state.
revoke insert, update, delete on public.billing_profiles from anon, authenticated;
grant select on public.billing_profiles to authenticated;

create or replace function public.create_billing_profile_for_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.billing_profiles (user_id, plan, beta_access)
    values (new.id, 'beta', true)
    on conflict (user_id) do nothing;
    return new;
end;
$$;

drop trigger if exists create_billing_profile_after_signup on auth.users;
create trigger create_billing_profile_after_signup
    after insert on auth.users
    for each row execute procedure public.create_billing_profile_for_user();

-- Keep current signed-in beta accounts at full access during testing.
insert into public.billing_profiles (user_id, plan, beta_access)
select id, 'beta', true from auth.users
on conflict (user_id) do nothing;

-- Enforce animal and photo additions on every cloud snapshot write. Existing
-- over-limit records remain readable/editable after downgrade, but can't grow.
create or replace function public.snapshot_has_new_records(
    previous_snapshot jsonb,
    next_snapshot jsonb,
    data_key text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
    select exists (
        select 1
          from jsonb_array_elements(coalesce(next_snapshot #> array['data', data_key], '[]'::jsonb)) as n(item)
         where nullif(n.item->>'id', '') is not null
           and not exists (
               select 1
                 from jsonb_array_elements(coalesce(previous_snapshot #> array['data', data_key], '[]'::jsonb)) as o(item)
                where o.item->>'id' = n.item->>'id'
           )
    );
$$;

create or replace function public.enforce_backup_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    account_plan text := 'free';
    is_beta boolean := false;
    status text := '';
    animal_limit integer := 20;
    photo_limit integer := 1;
    old_animals jsonb := '[]'::jsonb;
    new_animals jsonb := '[]'::jsonb;
    added_animals integer := 0;
    current_snake jsonb;
    previous_snake jsonb;
    current_photo_count integer;
    previous_photo_count integer;
begin
    select bp.plan, bp.beta_access, coalesce(bp.subscription_status, '')
      into account_plan, is_beta, status
      from public.billing_profiles bp
     where bp.user_id = new.user_id;

    account_plan := coalesce(account_plan, 'free');
    is_beta := coalesce(is_beta, false);
    status := coalesce(status, '');

    if is_beta or account_plan = 'owner' then
        return new;
    end if;

    if status not in ('active', 'trialing', 'past_due') then
        account_plan := 'free';
    end if;

    case account_plan
        when 'keeper' then animal_limit := 40; photo_limit := 3;
        when 'breeder' then animal_limit := 100; photo_limit := 8;
        when 'pro' then animal_limit := null; photo_limit := 20;
        else animal_limit := 20; photo_limit := 1;
    end case;

    if tg_op = 'UPDATE' then
        old_animals := coalesce(old.snapshot #> '{data,snakes}', '[]'::jsonb);
    end if;
    new_animals := coalesce(new.snapshot #> '{data,snakes}', '[]'::jsonb);

    if jsonb_typeof(new_animals) <> 'array' then
        return new;
    end if;

    select count(*) into added_animals
      from jsonb_array_elements(new_animals) as n(item)
     where nullif(n.item->>'id', '') is not null
       and not exists (
           select 1 from jsonb_array_elements(old_animals) as o(item)
            where o.item->>'id' = n.item->>'id'
       );

    if animal_limit is not null
       and jsonb_array_length(new_animals) > animal_limit
       and added_animals > 0 then
        raise exception 'Animal limit reached for the % plan (% animals). Upgrade to add animals.', account_plan, animal_limit
            using errcode = 'P0001';
    end if;

    if account_plan <> 'pro' and exists (
        select 1
          from jsonb_array_elements(new_animals) as n(item)
          left join jsonb_array_elements(old_animals) as o(item)
            on o.item->>'id' = n.item->>'id'
         where n.item->>'status' in ('Available', 'On Hold')
           and coalesce(o.item->>'status', '') <> n.item->>'status'
    ) then
        raise exception 'Storefront listings require the Pro plan.' using errcode = 'P0001';
    end if;

    if account_plan not in ('breeder', 'pro') then
        if public.snapshot_has_new_records(case when tg_op = 'UPDATE' then old.snapshot else null end, new.snapshot, 'breedingPairs')
           or public.snapshot_has_new_records(case when tg_op = 'UPDATE' then old.snapshot else null end, new.snapshot, 'clutches')
           or public.snapshot_has_new_records(case when tg_op = 'UPDATE' then old.snapshot else null end, new.snapshot, 'breedingGoals') then
            raise exception 'Breeding records require the Breeder plan or higher.' using errcode = 'P0001';
        end if;
    end if;

    if account_plan <> 'pro' then
        if public.snapshot_has_new_records(case when tg_op = 'UPDATE' then old.snapshot else null end, new.snapshot, 'financeExpenses')
           or public.snapshot_has_new_records(case when tg_op = 'UPDATE' then old.snapshot else null end, new.snapshot, 'financeExpos')
           or public.snapshot_has_new_records(case when tg_op = 'UPDATE' then old.snapshot else null end, new.snapshot, 'feederInventory')
           or public.snapshot_has_new_records(case when tg_op = 'UPDATE' then old.snapshot else null end, new.snapshot, 'buyers') then
            raise exception 'Finance records require the Pro plan.' using errcode = 'P0001';
        end if;
    end if;

    for current_snake in select item from jsonb_array_elements(new_animals) as row(item)
    loop
        if jsonb_typeof(current_snake->'photos') = 'array' then
            current_photo_count := jsonb_array_length(current_snake->'photos');
        elsif coalesce(current_snake->>'image', '') <> '' then
            current_photo_count := 1;
        else
            current_photo_count := 0;
        end if;

        select item into previous_snake
          from jsonb_array_elements(old_animals) as row(item)
         where row.item->>'id' = current_snake->>'id'
         limit 1;

        if jsonb_typeof(previous_snake->'photos') = 'array' then
            previous_photo_count := jsonb_array_length(previous_snake->'photos');
        elsif coalesce(previous_snake->>'image', '') <> '' then
            previous_photo_count := 1;
        else
            previous_photo_count := 0;
        end if;

        if current_photo_count > photo_limit and current_photo_count > previous_photo_count then
            raise exception 'Photo limit reached for the % plan (% photos per animal). Upgrade to add photos.', account_plan, photo_limit
                using errcode = 'P0001';
        end if;
        previous_snake := null;
    end loop;

    return new;
end;
$$;

do $$
begin
    if to_regclass('public.snake_room_backups') is not null then
        execute 'drop trigger if exists enforce_backup_plan_limits on public.snake_room_backups';
        execute 'create trigger enforce_backup_plan_limits before insert or update of snapshot on public.snake_room_backups for each row execute procedure public.enforce_backup_plan_limits()';
    end if;
end;
$$;

-- LAUNCH CHECKLIST: first update every selected tester to plan='beta',
-- beta_access=true; then set everyone else to plan='free', beta_access=false.
-- Also change the signup trigger above to create free profiles. Only then
-- enable the live Stripe secret and publish the paid checkout buttons.
