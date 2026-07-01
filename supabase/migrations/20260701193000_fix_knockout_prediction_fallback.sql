begin;

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

  actual_final_home integer;
  actual_final_away integer;
  actual_regulation_outcome text;

  predicted_final_home integer;
  predicted_final_away integer;
  predicted_regulation_outcome text;
  resolved_predicted_qualified_team_id uuid;
  resolved_predicted_qualification_method text;

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

      actual_final_home := m.home_score;
      actual_final_away := m.away_score;
      predicted_final_home := b.home_score;
      predicted_final_away := b.away_score;

      if actual_final_home is not null
         and actual_final_away is not null
         and predicted_final_home is not null
         and predicted_final_away is not null then
        resolved_qualified_team_id := m.qualified_team_id;

        if resolved_qualified_team_id is null then
          resolved_qualified_team_id := case
            when actual_final_home > actual_final_away then m.home_team_id
            when actual_final_away > actual_final_home then m.away_team_id
            else null
          end;
        end if;

        resolved_qualification_method := m.qualification_method;

        if resolved_qualification_method is null and actual_final_home <> actual_final_away then
          resolved_qualification_method := 'regulation';
        end if;

        resolved_predicted_qualified_team_id := b.predicted_qualified_team_id;

        if resolved_predicted_qualified_team_id is null then
          resolved_predicted_qualified_team_id := case
            when predicted_final_home > predicted_final_away then m.home_team_id
            when predicted_final_away > predicted_final_home then m.away_team_id
            else null
          end;
        end if;

        resolved_predicted_qualification_method := b.predicted_qualification_method;

        if resolved_predicted_qualification_method is null
           and predicted_final_home <> predicted_final_away then
          resolved_predicted_qualification_method := 'regulation';
        end if;

        actual_regulation_outcome := case
          when resolved_qualification_method in ('extra_time', 'penalties') then 'draw'
          when m.regulation_home_score is not null and m.regulation_away_score is not null then
            case
              when m.regulation_home_score > m.regulation_away_score then 'home'
              when m.regulation_away_score > m.regulation_home_score then 'away'
              else 'draw'
            end
          when actual_final_home > actual_final_away then 'home'
          when actual_final_away > actual_final_home then 'away'
          else 'draw'
        end;

        predicted_regulation_outcome := case
          when resolved_predicted_qualification_method in ('extra_time', 'penalties') then 'draw'
          when predicted_final_home > predicted_final_away then 'home'
          when predicted_final_away > predicted_final_home then 'away'
          else 'draw'
        end;

        exact_hit := actual_final_home = predicted_final_home and actual_final_away = predicted_final_away;
        result_hit := actual_regulation_outcome = predicted_regulation_outcome;
        goal_difference_hit :=
          (actual_final_home - actual_final_away) = (predicted_final_home - predicted_final_away);
        qualified_hit :=
          resolved_qualified_team_id is not null
          and resolved_predicted_qualified_team_id is not distinct from resolved_qualified_team_id;
        method_hit :=
          qualified_hit
          and resolved_qualification_method is not null
          and resolved_predicted_qualification_method is not distinct from resolved_qualification_method;
        combo_hit := exact_hit and result_hit and qualified_hit and method_hit;

        base_points := 0;

        if exact_hit then
          base_points := base_points + coalesce((rules.base_points->>'exact_score')::int, 3);
        end if;

        if result_hit then
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
          'actual_regulation_outcome', actual_regulation_outcome,
          'predicted_regulation_outcome', predicted_regulation_outcome,
          'resolved_qualified_team_id', resolved_qualified_team_id,
          'resolved_qualification_method', resolved_qualification_method,
          'resolved_predicted_qualified_team_id', resolved_predicted_qualified_team_id,
          'resolved_predicted_qualification_method', resolved_predicted_qualification_method,
          'points', calculated_points
        );
      end if;
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

  actual_final_home integer;
  actual_final_away integer;
  actual_regulation_outcome text;

  predicted_final_home integer;
  predicted_final_away integer;
  predicted_regulation_outcome text;
  resolved_predicted_qualified_team_id uuid;
  resolved_predicted_qualification_method text;

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

  if m.status = 'live' and m.kickoff_at > now() then
    return 0;
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

    actual_final_home := m.home_score;
    actual_final_away := m.away_score;
    predicted_final_home := b.home_score;
    predicted_final_away := b.away_score;

    if actual_final_home is null
       or actual_final_away is null
       or predicted_final_home is null
       or predicted_final_away is null then
      return 0;
    end if;

    if m.status = 'live' then
      resolved_qualified_team_id := case
        when actual_final_home > actual_final_away then m.home_team_id
        when actual_final_away > actual_final_home then m.away_team_id
        else null
      end;

      resolved_qualification_method := case
        when actual_final_home <> actual_final_away then 'regulation'
        else null
      end;
    else
      resolved_qualified_team_id := m.qualified_team_id;

      if resolved_qualified_team_id is null then
        resolved_qualified_team_id := case
          when actual_final_home > actual_final_away then m.home_team_id
          when actual_final_away > actual_final_home then m.away_team_id
          else null
        end;
      end if;

      resolved_qualification_method := m.qualification_method;

      if resolved_qualification_method is null and actual_final_home <> actual_final_away then
        resolved_qualification_method := 'regulation';
      end if;
    end if;

    resolved_predicted_qualified_team_id := b.predicted_qualified_team_id;

    if resolved_predicted_qualified_team_id is null then
      resolved_predicted_qualified_team_id := case
        when predicted_final_home > predicted_final_away then m.home_team_id
        when predicted_final_away > predicted_final_home then m.away_team_id
        else null
      end;
    end if;

    resolved_predicted_qualification_method := b.predicted_qualification_method;

    if resolved_predicted_qualification_method is null
       and predicted_final_home <> predicted_final_away then
      resolved_predicted_qualification_method := 'regulation';
    end if;

    actual_regulation_outcome := case
      when resolved_qualification_method in ('extra_time', 'penalties') then 'draw'
      when m.regulation_home_score is not null and m.regulation_away_score is not null then
        case
          when m.regulation_home_score > m.regulation_away_score then 'home'
          when m.regulation_away_score > m.regulation_home_score then 'away'
          else 'draw'
        end
      when actual_final_home > actual_final_away then 'home'
      when actual_final_away > actual_final_home then 'away'
      else 'draw'
    end;

    predicted_regulation_outcome := case
      when resolved_predicted_qualification_method in ('extra_time', 'penalties') then 'draw'
      when predicted_final_home > predicted_final_away then 'home'
      when predicted_final_away > predicted_final_home then 'away'
      else 'draw'
    end;

    exact_hit := actual_final_home = predicted_final_home and actual_final_away = predicted_final_away;
    result_hit := actual_regulation_outcome = predicted_regulation_outcome;
    goal_difference_hit :=
      (actual_final_home - actual_final_away) = (predicted_final_home - predicted_final_away);
    qualified_hit :=
      resolved_qualified_team_id is not null
      and resolved_predicted_qualified_team_id is not distinct from resolved_qualified_team_id;
    method_hit :=
      qualified_hit
      and resolved_qualification_method is not null
      and resolved_predicted_qualification_method is not distinct from resolved_qualification_method;
    combo_hit := exact_hit and result_hit and qualified_hit and method_hit;

    base_points := 0;

    if exact_hit then
      base_points := base_points + coalesce((rules.base_points->>'exact_score')::int, 3);
    end if;

    if result_hit then
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

commit;
