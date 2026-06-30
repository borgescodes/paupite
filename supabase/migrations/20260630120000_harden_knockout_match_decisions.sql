-- Harden knockout official decisions so tied knockout matches cannot be closed
-- without a qualified team and a valid decision method.

create or replace function private.enforce_match_knockout_decision()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
declare
  home_points integer;
  away_points integer;
  expected_qualified_team_id uuid;
begin
  if not private.is_knockout_stage(new.stage) then
    return new;
  end if;

  if new.status not in ('finished', 'closed', 'scored') then
    return new;
  end if;

  if new.home_team_id is null or new.away_team_id is null then
    raise exception 'Defina as duas seleções antes de encerrar o mata-mata.';
  end if;

  home_points := coalesce(new.regulation_home_score, new.home_score);
  away_points := coalesce(new.regulation_away_score, new.away_score);

  if home_points is null or away_points is null then
    raise exception 'Placar obrigatório para encerrar o mata-mata.';
  end if;

  if home_points <> away_points then
    expected_qualified_team_id := case
      when home_points > away_points then new.home_team_id
      else new.away_team_id
    end;

    if new.qualified_team_id is null then
      new.qualified_team_id := expected_qualified_team_id;
    end if;

    if new.qualified_team_id is distinct from expected_qualified_team_id then
      raise exception 'Classificado não confere com o placar do mata-mata.';
    end if;

    if new.qualification_method is null then
      new.qualification_method := 'regulation';
    end if;

    if new.qualification_method not in ('regulation', 'extra_time') then
      raise exception 'Vitória com placar diferente exige regulamentar ou prorrogação.';
    end if;

    return new;
  end if;

  if new.qualified_team_id is null
     or new.qualified_team_id not in (new.home_team_id, new.away_team_id) then
    raise exception 'Informe o classificado antes de encerrar o mata-mata empatado.';
  end if;

  if new.qualification_method is null
     or new.qualification_method not in ('extra_time', 'penalties') then
    raise exception 'Mata-mata empatado exige prorrogação ou pênaltis.';
  end if;

  return new;
end;
$function$;

drop trigger if exists enforce_match_knockout_decision_before_write
on public.matches;

create trigger enforce_match_knockout_decision_before_write
before insert or update of
  status,
  stage,
  home_team_id,
  away_team_id,
  home_score,
  away_score,
  regulation_home_score,
  regulation_away_score,
  qualified_team_id,
  qualification_method
on public.matches
for each row
execute function private.enforce_match_knockout_decision();
