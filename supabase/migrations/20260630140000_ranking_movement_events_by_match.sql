create table if not exists public.ranking_position_movement_events (
  mode text not null check (mode in ('free', 'pool')),
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  previous_rank_position integer not null,
  current_rank_position integer not null,
  movement integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (mode, match_id, user_id)
);

alter table public.ranking_position_movement_events enable row level security;

drop policy if exists "Authenticated can read ranking movement events"
on public.ranking_position_movement_events;

create policy "Authenticated can read ranking movement events"
on public.ranking_position_movement_events
for select
to authenticated
using (true);

grant select on public.ranking_position_movement_events to authenticated;
grant select, insert, update, delete on public.ranking_position_movement_events to service_role;

create or replace function private.refresh_ranking_position_snapshots_for_match(_match_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
declare
  match_status text;
begin
  select status
  into match_status
  from public.matches
  where id = _match_id
    and deleted_at is null;

  if match_status is null then
    return;
  end if;

  if match_status not in ('closed', 'scored') then
    perform private.refresh_ranking_position_snapshots();
    return;
  end if;

  with previous_rows as (
    select user_id, current_rank_position
    from public.ranking_position_snapshots
    where mode = 'free'
  ),
  current_rows as (
    select
      r.user_id,
      r.rank_position::int as rank_position
    from private.get_ranking_free() r
    where r.user_id is not null
      and r.rank_position is not null
  )
  insert into public.ranking_position_movement_events (
    mode,
    match_id,
    user_id,
    previous_rank_position,
    current_rank_position,
    movement,
    created_at
  )
  select
    'free',
    _match_id,
    c.user_id,
    coalesce(p.current_rank_position, c.rank_position),
    c.rank_position,
    coalesce(p.current_rank_position, c.rank_position) - c.rank_position,
    now()
  from current_rows c
  left join previous_rows p on p.user_id = c.user_id
  on conflict (mode, match_id, user_id) do update
  set
    previous_rank_position = excluded.previous_rank_position,
    current_rank_position = excluded.current_rank_position,
    movement = excluded.movement,
    created_at = excluded.created_at;

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

  with previous_rows as (
    select user_id, current_rank_position
    from public.ranking_position_snapshots
    where mode = 'pool'
  ),
  current_rows as (
    select
      r.user_id,
      r.rank_position::int as rank_position
    from private.get_ranking_pool() r
    where r.user_id is not null
      and r.rank_position is not null
  )
  insert into public.ranking_position_movement_events (
    mode,
    match_id,
    user_id,
    previous_rank_position,
    current_rank_position,
    movement,
    created_at
  )
  select
    'pool',
    _match_id,
    c.user_id,
    coalesce(p.current_rank_position, c.rank_position),
    c.rank_position,
    coalesce(p.current_rank_position, c.rank_position) - c.rank_position,
    now()
  from current_rows c
  left join previous_rows p on p.user_id = c.user_id
  on conflict (mode, match_id, user_id) do update
  set
    previous_rank_position = excluded.previous_rank_position,
    current_rank_position = excluded.current_rank_position,
    movement = excluded.movement,
    created_at = excluded.created_at;

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

revoke all on function private.refresh_ranking_position_snapshots_for_match(uuid)
from public, anon, authenticated;

grant execute on function private.refresh_ranking_position_snapshots_for_match(uuid)
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
  match_status text;
begin
  updated_count := private.recalculate_match_points(_match_id);

  select status
  into match_status
  from public.matches
  where id = _match_id
    and deleted_at is null;

  if match_status in ('closed', 'scored') then
    perform private.refresh_ranking_position_snapshots_for_match(_match_id);
  else
    perform private.refresh_ranking_position_snapshots();
  end if;

  return updated_count;
end;
$function$;

revoke all on function public.admin_recalculate_match_points(uuid)
from public, anon, authenticated;

grant execute on function public.admin_recalculate_match_points(uuid)
to service_role;

create or replace function private.refresh_ranking_positions_after_match_closed_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
begin
  perform private.refresh_ranking_position_snapshots_for_match(new.id);
  return null;
end;
$function$;

drop trigger if exists refresh_ranking_positions_after_match_closed
on public.matches;

create trigger refresh_ranking_positions_after_match_closed
after update of status
on public.matches
for each row
when (
  old.status is distinct from new.status
  and new.status in ('closed', 'scored')
)
execute function private.refresh_ranking_positions_after_match_closed_trigger();

create or replace view public.ranking_latest_movement_events
with (security_invoker = true)
as
with event_groups as (
  select
    mode,
    match_id,
    max(created_at) as created_at
  from public.ranking_position_movement_events
  group by mode, match_id
),
latest_groups as (
  select distinct on (mode)
    mode,
    match_id,
    created_at
  from event_groups
  order by mode, created_at desc
)
select
  e.mode,
  e.match_id,
  e.user_id,
  e.previous_rank_position,
  e.current_rank_position,
  e.movement,
  e.created_at
from public.ranking_position_movement_events e
join latest_groups latest
  on latest.mode = e.mode
  and latest.match_id = e.match_id;

grant select on public.ranking_latest_movement_events to authenticated;

with latest_closed_match as (
  select id
  from public.matches
  where deleted_at is null
    and status in ('closed', 'scored')
  order by kickoff_at desc nulls last, updated_at desc nulls last
  limit 1
)
insert into public.ranking_position_movement_events (
  mode,
  match_id,
  user_id,
  previous_rank_position,
  current_rank_position,
  movement,
  created_at
)
select
  s.mode,
  latest_closed_match.id,
  s.user_id,
  s.previous_rank_position,
  s.current_rank_position,
  s.movement,
  s.updated_at
from public.ranking_position_snapshots s
cross join latest_closed_match
where s.movement <> 0
on conflict (mode, match_id, user_id) do update
set
  previous_rank_position = excluded.previous_rank_position,
  current_rank_position = excluded.current_rank_position,
  movement = excluded.movement,
  created_at = excluded.created_at;
