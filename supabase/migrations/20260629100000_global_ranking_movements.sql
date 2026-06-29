create table if not exists public.ranking_position_snapshots (
  mode text not null check (mode in ('free', 'pool')),
  user_id uuid not null references public.profiles(id) on delete cascade,
  previous_rank_position integer not null,
  current_rank_position integer not null,
  movement integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (mode, user_id)
);

alter table public.ranking_position_snapshots enable row level security;

drop policy if exists "Authenticated can read ranking position snapshots"
on public.ranking_position_snapshots;

create policy "Authenticated can read ranking position snapshots"
on public.ranking_position_snapshots
for select
to authenticated
using (true);

grant select on public.ranking_position_snapshots to authenticated;
grant select, insert, update, delete on public.ranking_position_snapshots to service_role;

create or replace function private.refresh_ranking_position_snapshots()
returns void
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
begin
  with current_rows as (
    select
      'free'::text as mode,
      r.user_id,
      r.rank_position::int as rank_position
    from private.get_ranking_free() r
    where r.user_id is not null
      and r.rank_position is not null
  )
  insert into public.ranking_position_snapshots (
    mode,
    user_id,
    previous_rank_position,
    current_rank_position,
    movement,
    updated_at
  )
  select
    c.mode,
    c.user_id,
    c.rank_position,
    c.rank_position,
    0,
    now()
  from current_rows c
  on conflict (mode, user_id) do update
  set
    previous_rank_position = ranking_position_snapshots.current_rank_position,
    current_rank_position = excluded.current_rank_position,
    movement = ranking_position_snapshots.current_rank_position - excluded.current_rank_position,
    updated_at = now();

  delete from public.ranking_position_snapshots s
  where s.mode = 'free'
    and not exists (
      select 1
      from private.get_ranking_free() r
      where r.user_id = s.user_id
    );

  with current_rows as (
    select
      'pool'::text as mode,
      r.user_id,
      r.rank_position::int as rank_position
    from private.get_ranking_pool() r
    where r.user_id is not null
      and r.rank_position is not null
  )
  insert into public.ranking_position_snapshots (
    mode,
    user_id,
    previous_rank_position,
    current_rank_position,
    movement,
    updated_at
  )
  select
    c.mode,
    c.user_id,
    c.rank_position,
    c.rank_position,
    0,
    now()
  from current_rows c
  on conflict (mode, user_id) do update
  set
    previous_rank_position = ranking_position_snapshots.current_rank_position,
    current_rank_position = excluded.current_rank_position,
    movement = ranking_position_snapshots.current_rank_position - excluded.current_rank_position,
    updated_at = now();

  delete from public.ranking_position_snapshots s
  where s.mode = 'pool'
    and not exists (
      select 1
      from private.get_ranking_pool() r
      where r.user_id = s.user_id
    );
end;
$function$;

revoke all on function private.refresh_ranking_position_snapshots()
from public, anon, authenticated;

grant execute on function private.refresh_ranking_position_snapshots()
to service_role;

create or replace function public.admin_refresh_ranking_position_snapshots()
returns void
language sql
volatile
security invoker
set search_path = public
as $function$
  select private.refresh_ranking_position_snapshots();
$function$;

revoke all on function public.admin_refresh_ranking_position_snapshots()
from public, anon, authenticated;

grant execute on function public.admin_refresh_ranking_position_snapshots()
to service_role;

create or replace function public.admin_recalculate_match_points(_match_id uuid)
returns integer
language plpgsql
volatile
security invoker
set search_path = public
as $function$
declare
  updated_count integer;
begin
  updated_count := private.recalculate_match_points(_match_id);
  perform private.refresh_ranking_position_snapshots();
  return updated_count;
end;
$function$;

revoke all on function public.admin_recalculate_match_points(uuid)
from public, anon, authenticated;

grant execute on function public.admin_recalculate_match_points(uuid)
to service_role;

create or replace function private.refresh_ranking_position_snapshots_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
begin
  perform private.refresh_ranking_position_snapshots();
  return null;
end;
$function$;

drop trigger if exists refresh_ranking_positions_after_enrollments
on public.enrollments;

create trigger refresh_ranking_positions_after_enrollments
after insert or update of status, activated_at, requested_at or delete
on public.enrollments
for each statement
execute function private.refresh_ranking_position_snapshots_trigger();

drop trigger if exists refresh_ranking_positions_after_special_predictions
on public.special_predictions;

create trigger refresh_ranking_positions_after_special_predictions
after insert or update of points, user_id, pool_id or delete
on public.special_predictions
for each statement
execute function private.refresh_ranking_position_snapshots_trigger();

select private.refresh_ranking_position_snapshots();
