-- Fix knockout scoring, ranking cutoff and ranking tie-breakers.
-- Rules:
-- - knockout: exact score 3, regulation result 1, goal difference 1,
--   qualified team 2, qualification method 1 only when qualified team is correct,
--   perfect combo 1
-- - ranking cutoff: 2026-06-28 00:00:00-03
-- - ranking tie-breaker: first valid bet created_at ASC

update public.pool_settings
set
  free_ranking_starts_at = timestamptz '2026-06-28 00:00:00-03',
  updated_at = now()
where slug = 'world-cup-2026';

update public.pool_scoring_rules psr
set
  base_points = coalesce(psr.base_points, '{}'::jsonb) || jsonb_build_object('goal_difference', 1),
  updated_at = now()
from public.pool_settings ps
where ps.id = psr.pool_id
  and ps.slug = 'world-cup-2026';

create or replace function private.recalculate_match_points(_match_id uuid)
returns integer
language plpgsql
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
  calculated_points integer;
  breakdown jsonb;
  updated_count integer := 0;
  point_label text;
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

  if not found then
    return 0;
  end if;

  if m.deleted_at is not null or m.status in ('scheduled', 'open', 'locked', 'live', 'canceled') then
    return private.zero_match_bet_points(_match_id);
  end if;

  if m.status not in ('closed', 'scored') then
    return 0;
  end if;

  select psr.*
  into rules
  from public.pool_scoring_rules psr
  join public.pool_settings ps on ps.id = psr.pool_id
  where ps.slug = 'world-cup-2026'
  limit 1;

  for b in
    select *
    from public.bets
    where match_id = _match_id
  loop
    breakdown := '{}'::jsonb;
    calculated_points := 0;

    if private.is_knockout_stage(m.stage) then
      stage_key := private.normalize_knockout_stage(m.stage);

      actual_home := coalesce(m.regulation_home_score, m.home_score);
      actual_away := coalesce(m.regulation_away_score, m.away_score);

      predicted_home := coalesce(b.regulation_home_score, b.home_score);
      predicted_away := coalesce(b.regulation_away_score, b.away_score);

      resolved_qualified_team_id := m.qualified_team_id;

      if resolved_qualified_team_id is null and actual_home is not null and actual_away is not null then
        resolved_qualified_team_id := case
          when actual_home > actual_away then m.home_team_id
          when actual_away > actual_home then m.away_team_id
          else null
        end;
      end if;

      resolved_qualification_method := m.qualification_method;

      if resolved_qualification_method is null and actual_home is not null and actual_away is not null and actual_home <> actual_away then
        resolved_qualification_method := 'regulation';
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

      exact_hit :=
        actual_home is not null
        and actual_away is not null
        and predicted_home is not null
        and predicted_away is not null
        and actual_home = predicted_home
        and actual_away = predicted_away;

      result_hit :=
        actual_home is not null
        and actual_away is not null
        and predicted_home is not null
        and predicted_away is not null
        and actual_outcome = predicted_outcome;

      goal_difference_hit :=
        actual_home is not null
        and actual_away is not null
        and predicted_home is not null
        and predicted_away is not null
        and (actual_home - actual_away) = (predicted_home - predicted_away);

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

      calculated_points := round(base_points * phase_weight * team_multiplier)::int;

      breakdown := jsonb_build_object(
        'stage', stage_key,
        'exact_score', exact_hit,
        'regulation_result', result_hit,
        'goal_difference', goal_difference_hit,
        'qualified_team', qualified_hit,
        'qualification_method', method_hit,
        'perfect_combo', combo_hit,
        'base_points', base_points,
        'phase_weight', phase_weight,
        'team_multiplier', team_multiplier,
        'resolved_qualified_team_id', resolved_qualified_team_id,
        'resolved_qualification_method', resolved_qualification_method,
        'points', calculated_points
      );
    else
      calculated_points := public.calc_bet_points(m.home_score, m.away_score, b.home_score, b.away_score);
    end if;

    update public.bets
    set
      points = calculated_points,
      locked_at = coalesce(locked_at, now()),
      knockout_points_breakdown = case
        when private.is_knockout_stage(m.stage) then breakdown
        else knockout_points_breakdown
      end
    where id = b.id;

    updated_count := updated_count + 1;

    if calculated_points > 0
       and to_regprocedure('private.insert_notification(uuid,text,text,text,jsonb)') is not null then
      point_label := case when calculated_points = 1 then 'ponto' else 'pontos' end;

      perform private.insert_notification(
        b.user_id,
        'bet_scored',
        'Palpite pontuado',
        format('Seu palpite somou %s %s nesta partida.', calculated_points, point_label),
        jsonb_build_object(
          'match_id', _match_id,
          'bet_id', b.id,
          'points', calculated_points,
          'dedupe_key', 'bet_scored:' || b.id::text || ':' || _match_id::text
        )
      );
    end if;
  end loop;

  perform private.resolve_knockout_bracket(_match_id);

  return updated_count;
end;
$function$;

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

do $$
declare
  closed_match record;
begin
  for closed_match in
    select id
    from public.matches
    where deleted_at is null
      and kickoff_at >= timestamptz '2026-06-28 00:00:00-03'
      and status in ('closed', 'scored')
    order by kickoff_at
  loop
    perform private.recalculate_match_points(closed_match.id);
  end loop;
end $$;
