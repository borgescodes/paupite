-- Hardcode ranking cutoff to 2026-06-28.
-- Ranking keeps historical bet points intact, but aggregates only matches whose local kickoff date
-- in America/Santarem is 2026-06-28 or later.

create or replace function private.get_ranking_free()
returns table (
  user_id uuid,
  display_name text,
  nickname text,
  avatar_url text,
  total_points integer,
  exact_scores_count integer,
  outcome_hits_count integer,
  knockout_qualified_count integer,
  knockout_combo_count integer,
  special_points integer,
  bets_count integer,
  rank_position integer
)
language sql
stable
security definer
set search_path to 'public', 'private'
as $function$
  with ranking_cutoff as (
    select date '2026-06-28' as starts_on
  ),
  aggregates as (
    select
      p.id as user_id,
      p.display_name,
      p.nickname,
      p.avatar_url,
      coalesce(sum(case
        when m.status in ('closed', 'scored') then b.points
        when (m.status = 'finished' or (m.status = 'live' and m.kickoff_at <= now())) then private.calculate_ranking_bet_points(m.id, b.id)
        else 0
      end), 0)::int as total_points,
      coalesce(sum(case
        when m.status in ('closed', 'scored')
          and b.points > 0
          and m.home_score = b.home_score
          and m.away_score = b.away_score
        then 1 else 0
      end), 0)::int as exact_scores_count,
      coalesce(sum(case
        when m.status in ('closed', 'scored')
          and b.points > 0
        then 1 else 0
      end), 0)::int as outcome_hits_count,
      coalesce(sum(case
        when m.status in ('closed', 'scored')
          and private.is_knockout_stage(m.stage)
          and coalesce((b.knockout_points_breakdown->>'qualified_team')::boolean, false)
        then 1 else 0
      end), 0)::int as knockout_qualified_count,
      coalesce(sum(case
        when m.status in ('closed', 'scored')
          and private.is_knockout_stage(m.stage)
          and coalesce((b.knockout_points_breakdown->>'perfect_combo')::boolean, false)
        then 1 else 0
      end), 0)::int as knockout_combo_count,
      0::int as special_points,
      count(b.id) filter (where m.id is not null)::int as bets_count,
      min(b.created_at) filter (where m.id is not null) as primeiro_palpite_valido
    from public.profiles p
    left join public.bets b
      on b.user_id = p.id
    left join public.matches m
      on m.id = b.match_id
      and m.deleted_at is null
      and (m.kickoff_at at time zone 'America/Santarem')::date >= (select starts_on from ranking_cutoff)
    where p.status = 'active'
    group by p.id, p.display_name, p.nickname, p.avatar_url
  )
  select
    aggregates.user_id,
    aggregates.display_name,
    aggregates.nickname,
    aggregates.avatar_url,
    aggregates.total_points,
    aggregates.exact_scores_count,
    aggregates.outcome_hits_count,
    aggregates.knockout_qualified_count,
    aggregates.knockout_combo_count,
    aggregates.special_points,
    aggregates.bets_count,
    row_number() over (
      order by
        aggregates.total_points desc,
        aggregates.exact_scores_count desc,
        aggregates.knockout_qualified_count desc,
        aggregates.knockout_combo_count desc,
        aggregates.special_points desc,
        aggregates.bets_count desc,
        aggregates.primeiro_palpite_valido asc nulls last,
        aggregates.display_name asc
    )::int as rank_position
  from aggregates;
$function$;

create or replace function private.get_ranking_pool()
returns table (
  user_id uuid,
  display_name text,
  nickname text,
  avatar_url text,
  total_points integer,
  exact_scores_count integer,
  outcome_hits_count integer,
  knockout_qualified_count integer,
  knockout_combo_count integer,
  special_points integer,
  bets_count integer,
  rank_position integer
)
language sql
stable
security definer
set search_path to 'public', 'private'
as $function$
  with ranking_cutoff as (
    select date '2026-06-28' as starts_on
  ),
  settings as (
    select
      id as pool_id
    from public.pool_settings
    where slug = 'world-cup-2026'
    limit 1
  ),
  active_members as (
    select distinct on (e.user_id)
      e.user_id,
      coalesce(e.activated_at, e.requested_at, e.created_at) as confirmed_at
    from public.enrollments e
    where e.pool_id = (select pool_id from settings)
      and e.status = 'active'
    order by e.user_id, coalesce(e.activated_at, e.requested_at, e.created_at)
  ),
  aggregates as (
    select
      p.id as user_id,
      p.display_name,
      p.nickname,
      p.avatar_url,
      (
        coalesce(sum(case
          when m.status in ('closed', 'scored') then b.points
          when (m.status = 'finished' or (m.status = 'live' and m.kickoff_at <= now())) then private.calculate_ranking_bet_points(m.id, b.id)
          else 0
        end), 0)
        + coalesce(max(sp.points), 0)
      )::int as total_points,
      coalesce(sum(case
        when m.status in ('closed', 'scored')
          and b.points > 0
          and m.home_score = b.home_score
          and m.away_score = b.away_score
        then 1 else 0
      end), 0)::int as exact_scores_count,
      coalesce(sum(case
        when m.status in ('closed', 'scored')
          and b.points > 0
        then 1 else 0
      end), 0)::int as outcome_hits_count,
      coalesce(sum(case
        when m.status in ('closed', 'scored')
          and private.is_knockout_stage(m.stage)
          and coalesce((b.knockout_points_breakdown->>'qualified_team')::boolean, false)
        then 1 else 0
      end), 0)::int as knockout_qualified_count,
      coalesce(sum(case
        when m.status in ('closed', 'scored')
          and private.is_knockout_stage(m.stage)
          and coalesce((b.knockout_points_breakdown->>'perfect_combo')::boolean, false)
        then 1 else 0
      end), 0)::int as knockout_combo_count,
      coalesce(max(sp.points), 0)::int as special_points,
      count(b.id) filter (where m.id is not null)::int as bets_count,
      min(b.created_at) filter (where m.id is not null) as primeiro_palpite_valido,
      min(active_members.confirmed_at) as confirmed_at
    from active_members
    join public.profiles p
      on p.id = active_members.user_id
      and p.status = 'active'
    left join public.bets b
      on b.user_id = p.id
    left join public.matches m
      on m.id = b.match_id
      and m.deleted_at is null
      and (m.kickoff_at at time zone 'America/Santarem')::date >= (select starts_on from ranking_cutoff)
    left join public.special_predictions sp
      on sp.user_id = p.id
      and sp.pool_id = (select pool_id from settings)
    group by p.id, p.display_name, p.nickname, p.avatar_url
  )
  select
    aggregates.user_id,
    aggregates.display_name,
    aggregates.nickname,
    aggregates.avatar_url,
    aggregates.total_points,
    aggregates.exact_scores_count,
    aggregates.outcome_hits_count,
    aggregates.knockout_qualified_count,
    aggregates.knockout_combo_count,
    aggregates.special_points,
    aggregates.bets_count,
    row_number() over (
      order by
        aggregates.total_points desc,
        aggregates.exact_scores_count desc,
        aggregates.knockout_qualified_count desc,
        aggregates.knockout_combo_count desc,
        aggregates.special_points desc,
        aggregates.bets_count desc,
        aggregates.primeiro_palpite_valido asc nulls last,
        aggregates.display_name asc
    )::int as rank_position
  from aggregates;
$function$;

revoke all on function private.get_ranking_free() from public, anon;
revoke all on function private.get_ranking_pool() from public, anon;
grant execute on function private.get_ranking_free() to authenticated, service_role;
grant execute on function private.get_ranking_pool() to authenticated, service_role;

create or replace view public.ranking_free
with (security_invoker = true)
as select * from private.get_ranking_free();

create or replace view public.ranking_pool
with (security_invoker = true)
as select * from private.get_ranking_pool();

create or replace view public.ranking
with (security_invoker = true)
as select * from public.ranking_free;

grant select on public.ranking, public.ranking_free, public.ranking_pool to authenticated;

select private.refresh_ranking_position_snapshots();
