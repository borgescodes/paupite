-- Add in-progress ranking preview without mutating official bet points.
-- Closed/scored matches keep using bets.points. Live/finished matches calculate preview points
-- from the current admin-entered score so the ranking moves while the match is being updated.

create or replace function private.calculate_ranking_bet_points(_match_id uuid, _bet_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path to 'public', 'private'
as $function$
declare
  m record;
  b record;
  rules public.pool_scoring_rules%rowtype;
  stage_key text;

  actual_home integer;
  actual_away integer;
  actual_outcome text;

  predicted_home integer;
  predicted_away integer;
  predicted_outcome text;

  resolved_qualified_team_id uuid;
  resolved_qualification_method text;

  exact_hit boolean;
  result_hit boolean;
  goal_difference_hit boolean;
  qualified_hit boolean;
  method_hit boolean;
  combo_hit boolean;

  base_points integer;
  phase_weight numeric;
  team_multiplier numeric;
  home_multiplier numeric;
  away_multiplier numeric;
begin
  select
    matches.*,
    home_team.external_key as home_external_key,
    away_team.external_key as away_external_key
  into m
  from public.matches
  left join public.teams home_team on home_team.id = matches.home_team_id
  left join public.teams away_team on away_team.id = matches.away_team_id
  where matches.id = _match_id;

  if not found or m.deleted_at is not null then
    return 0;
  end if;

  select *
  into b
  from public.bets
  where id = _bet_id
    and match_id = _match_id;

  if not found then
    return 0;
  end if;

  if m.status in ('closed', 'scored') then
    return coalesce(b.points, 0)::int;
  end if;

  if m.status not in ('live', 'finished') then
    return 0;
  end if;

  if m.home_score is null or m.away_score is null then
    return 0;
  end if;

  if private.is_knockout_stage(m.stage) then
    select psr.*
    into rules
    from public.pool_scoring_rules psr
    join public.pool_settings ps on ps.id = psr.pool_id
    where ps.slug = 'world-cup-2026'
    limit 1;

    stage_key := private.normalize_knockout_stage(m.stage);

    actual_home := coalesce(m.regulation_home_score, m.home_score);
    actual_away := coalesce(m.regulation_away_score, m.away_score);

    predicted_home := coalesce(b.regulation_home_score, b.home_score);
    predicted_away := coalesce(b.regulation_away_score, b.away_score);

    if actual_home is null or actual_away is null or predicted_home is null or predicted_away is null then
      return 0;
    end if;

    if m.status = 'live' then
      resolved_qualified_team_id := case
        when actual_home > actual_away then m.home_team_id
        when actual_away > actual_home then m.away_team_id
        else null
      end;

      resolved_qualification_method := case
        when actual_home <> actual_away then 'regulation'
        else null
      end;
    else
      resolved_qualified_team_id := m.qualified_team_id;

      if resolved_qualified_team_id is null then
        resolved_qualified_team_id := case
          when actual_home > actual_away then m.home_team_id
          when actual_away > actual_home then m.away_team_id
          else null
        end;
      end if;

      resolved_qualification_method := m.qualification_method;

      if resolved_qualification_method is null and actual_home <> actual_away then
        resolved_qualification_method := 'regulation';
      end if;
    end if;

    actual_outcome := case
      when actual_home > actual_away then 'home'
      when actual_away > actual_home then 'away'
      else 'draw'
    end;

    predicted_outcome := case
      when predicted_home > predicted_away then 'home'
      when predicted_away > predicted_home then 'away'
      else 'draw'
    end;

    exact_hit := actual_home = predicted_home and actual_away = predicted_away;
    result_hit := actual_outcome = predicted_outcome;
    goal_difference_hit := (actual_home - actual_away) = (predicted_home - predicted_away);
    qualified_hit :=
      resolved_qualified_team_id is not null
      and b.predicted_qualified_team_id is not distinct from resolved_qualified_team_id;
    method_hit :=
      qualified_hit
      and resolved_qualification_method is not null
      and b.predicted_qualification_method is not distinct from resolved_qualification_method;
    combo_hit := exact_hit and qualified_hit and method_hit;

    base_points := 0;

    if exact_hit then
      base_points := base_points + coalesce((rules.base_points->>'exact_score')::int, 3);
    elsif result_hit then
      base_points := base_points + coalesce((rules.base_points->>'regulation_result')::int, 1);
    end if;

    if goal_difference_hit then
      base_points := base_points + coalesce((rules.base_points->>'goal_difference')::int, 1);
    end if;

    if qualified_hit then
      base_points := base_points + coalesce((rules.base_points->>'qualified_team')::int, 2);
    end if;

    if method_hit then
      base_points := base_points + coalesce((rules.base_points->>'qualification_method')::int, 1);
    end if;

    if combo_hit then
      base_points := base_points + coalesce((rules.base_points->>'perfect_combo')::int, 1);
    end if;

    phase_weight := coalesce((rules.stage_weights->>stage_key)::numeric, 1);

    home_multiplier := greatest(
      coalesce((rules.team_multipliers->>(m.home_team_id::text))::numeric, 1),
      coalesce((rules.team_multipliers->>coalesce(m.home_external_key, ''))::numeric, 1)
    );

    away_multiplier := greatest(
      coalesce((rules.team_multipliers->>(m.away_team_id::text))::numeric, 1),
      coalesce((rules.team_multipliers->>coalesce(m.away_external_key, ''))::numeric, 1)
    );

    team_multiplier := greatest(home_multiplier, away_multiplier, 1);

    return round(base_points * phase_weight * team_multiplier)::int;
  end if;

  return public.calc_bet_points(m.home_score, m.away_score, b.home_score, b.away_score);
end;
$function$;

revoke all on function private.calculate_ranking_bet_points(uuid, uuid)
from public, anon, authenticated;

grant execute on function private.calculate_ranking_bet_points(uuid, uuid)
to service_role;

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
  with settings as (
    select
      id as pool_id,
      free_ranking_starts_at
    from public.pool_settings
    where slug = 'world-cup-2026'
    limit 1
  ),
  aggregates as (
    select
      p.id as user_id,
      p.display_name,
      p.nickname,
      p.avatar_url,
      coalesce(sum(case
        when m.status in ('closed', 'scored') then b.points
        when m.status in ('live', 'finished') then private.calculate_ranking_bet_points(m.id, b.id)
        else 0
      end), 0)::int as total_points,
      coalesce(sum(case
        when m.status in ('closed', 'scored')
          and b.points > 0
          and coalesce(m.regulation_home_score, m.home_score) = coalesce(b.regulation_home_score, b.home_score)
          and coalesce(m.regulation_away_score, m.away_score) = coalesce(b.regulation_away_score, b.away_score)
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
      and (
        (select free_ranking_starts_at from settings) is null
        or m.kickoff_at >= (select free_ranking_starts_at from settings)
      )
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
  with settings as (
    select
      id as pool_id,
      free_ranking_starts_at
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
          when m.status in ('live', 'finished') then private.calculate_ranking_bet_points(m.id, b.id)
          else 0
        end), 0)
        + coalesce(max(sp.points), 0)
      )::int as total_points,
      coalesce(sum(case
        when m.status in ('closed', 'scored')
          and b.points > 0
          and coalesce(m.regulation_home_score, m.home_score) = coalesce(b.regulation_home_score, b.home_score)
          and coalesce(m.regulation_away_score, m.away_score) = coalesce(b.regulation_away_score, b.away_score)
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
      and (
        (select free_ranking_starts_at from settings) is null
        or m.kickoff_at >= (select free_ranking_starts_at from settings)
      )
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

create or replace view public.ranking_current_movement_events
with (security_invoker = true)
as
with active_match as (
  select id, updated_at
  from public.matches
  where deleted_at is null
    and status in ('live', 'finished')
  order by kickoff_at desc nulls last, updated_at desc nulls last
  limit 1
),
live_free as (
  select
    'free'::text as mode,
    active_match.id as match_id,
    r.user_id,
    coalesce(s.current_rank_position, r.rank_position)::int as previous_rank_position,
    r.rank_position::int as current_rank_position,
    (coalesce(s.current_rank_position, r.rank_position) - r.rank_position)::int as movement,
    active_match.updated_at as created_at
  from active_match
  cross join private.get_ranking_free() r
  left join public.ranking_position_snapshots s
    on s.mode = 'free'
    and s.user_id = r.user_id
  where r.user_id is not null
    and r.rank_position is not null
    and (coalesce(s.current_rank_position, r.rank_position) - r.rank_position) <> 0
),
live_pool as (
  select
    'pool'::text as mode,
    active_match.id as match_id,
    r.user_id,
    coalesce(s.current_rank_position, r.rank_position)::int as previous_rank_position,
    r.rank_position::int as current_rank_position,
    (coalesce(s.current_rank_position, r.rank_position) - r.rank_position)::int as movement,
    active_match.updated_at as created_at
  from active_match
  cross join private.get_ranking_pool() r
  left join public.ranking_position_snapshots s
    on s.mode = 'pool'
    and s.user_id = r.user_id
  where r.user_id is not null
    and r.rank_position is not null
    and (coalesce(s.current_rank_position, r.rank_position) - r.rank_position) <> 0
),
closed_latest as (
  select
    e.mode,
    e.match_id,
    e.user_id,
    e.previous_rank_position,
    e.current_rank_position,
    e.movement,
    e.created_at
  from public.ranking_latest_movement_events e
  where not exists (select 1 from active_match)
)
select * from live_free
union all
select * from live_pool
union all
select * from closed_latest;

grant select on public.ranking_current_movement_events to authenticated;
