begin;

-- Official result matrix for admin-entered match closure.
--
-- Group stage:
--   final score may be tied; no qualified team or qualification method is stored.
--
-- Knockout, regulation:
--   90-minute score and final score are the same; final score must have a winner.
--
-- Knockout, extra_time:
--   90-minute score must be tied; 120-minute score must have a winner.
--
-- Knockout, penalties:
--   90-minute score and 120-minute score must both be tied; only the qualified
--   team is selected manually. Penalty shootout counts are not stored in
--   home_score/away_score.

create or replace function private.validate_match_official_result(
  _stage text,
  _status text,
  _home_team_id uuid,
  _away_team_id uuid,
  _home_score integer,
  _away_score integer,
  _regulation_home_score integer,
  _regulation_away_score integer,
  _qualified_team_id uuid,
  _qualification_method text
)
returns table (
  qualified_team_id uuid,
  qualification_method text,
  regulation_home_score integer,
  regulation_away_score integer
)
language plpgsql
stable
security definer
set search_path to 'public', 'private'
as $function$
declare
  final_winner uuid;
begin
  if _status not in ('finished', 'closed', 'scored') then
    if _qualified_team_id is not null
       or _qualification_method is not null
       or _regulation_home_score is not null
       or _regulation_away_score is not null then
      raise exception 'Classificação oficial só pode ser gravada em partida encerrada.';
    end if;

    return query select null::uuid, null::text, null::integer, null::integer;
    return;
  end if;

  if _home_score is null or _away_score is null then
    raise exception 'Placar obrigatório para encerrar partida.';
  end if;

  if _home_score < 0 or _away_score < 0 then
    raise exception 'Placar não pode ser negativo.';
  end if;

  if _home_score > 99 or _away_score > 99 then
    raise exception 'Placar deve ser menor que 100.';
  end if;

  if not private.is_knockout_stage(_stage) then
    if _qualified_team_id is not null
       or _qualification_method is not null
       or _regulation_home_score is not null
       or _regulation_away_score is not null then
      raise exception 'Fase de grupos não permite classificado ou método de classificação.';
    end if;

    return query select null::uuid, null::text, null::integer, null::integer;
    return;
  end if;

  if _home_team_id is null or _away_team_id is null then
    raise exception 'Defina as duas seleções antes de encerrar o mata-mata.';
  end if;

  if _qualification_method is null then
    raise exception 'Partida mata-mata encerrada sem qualification_method.';
  end if;

  if _qualification_method not in ('regulation', 'extra_time', 'penalties') then
    raise exception 'Método de classificação inválido.';
  end if;

  if _qualified_team_id is null then
    if _qualification_method = 'penalties' then
      raise exception 'Informe seleção classificada na disputa de pênaltis.';
    end if;

    raise exception 'Partida mata-mata encerrada sem qualified_team_id.';
  end if;

  if _qualified_team_id not in (_home_team_id, _away_team_id) then
    raise exception 'Classificado não pertence à partida.';
  end if;

  if _qualification_method = 'regulation' then
    if _home_score = _away_score then
      raise exception 'Partida decidida no tempo regulamentar precisa ter vencedor no placar final.';
    end if;

    final_winner := case when _home_score > _away_score then _home_team_id else _away_team_id end;

    if _qualified_team_id is distinct from final_winner then
      raise exception 'Classificado diferente do vencedor em tempo regulamentar.';
    end if;

    if (_regulation_home_score is not null or _regulation_away_score is not null)
       and (_regulation_home_score is distinct from _home_score
            or _regulation_away_score is distinct from _away_score) then
      raise exception 'Campos dos 90 minutos devem corresponder ao placar final em tempo regulamentar.';
    end if;

    return query select final_winner, 'regulation'::text, _home_score, _away_score;
    return;
  end if;

  if _regulation_home_score is null or _regulation_away_score is null then
    raise exception 'Informe placar aos 90 minutos.';
  end if;

  if _regulation_home_score < 0 or _regulation_away_score < 0 then
    raise exception 'Placar não pode ser negativo.';
  end if;

  if _regulation_home_score > 99 or _regulation_away_score > 99 then
    raise exception 'Placar deve ser menor que 100.';
  end if;

  if _qualification_method = 'extra_time' then
    if _regulation_home_score <> _regulation_away_score then
      raise exception 'Partida decidida na prorrogação precisa estar empatada ao fim dos 90 minutos.';
    end if;

    if _home_score = _away_score then
      raise exception 'Partida decidida na prorrogação precisa ter vencedor após 120 minutos.';
    end if;

    final_winner := case when _home_score > _away_score then _home_team_id else _away_team_id end;

    if _qualified_team_id is distinct from final_winner then
      raise exception 'Classificado diferente do vencedor na prorrogação.';
    end if;

    return query select final_winner, 'extra_time'::text, _regulation_home_score, _regulation_away_score;
    return;
  end if;

  if _regulation_home_score <> _regulation_away_score then
    raise exception 'Partida decidida nos pênaltis precisa estar empatada ao fim dos 90 minutos.';
  end if;

  if _home_score <> _away_score then
    raise exception 'No campo de placar, informe resultado após 120 minutos, sem incluir cobranças de pênaltis.';
  end if;

  return query select _qualified_team_id, 'penalties'::text, _regulation_home_score, _regulation_away_score;
end;
$function$;

revoke all on function private.validate_match_official_result(
  text,
  text,
  uuid,
  uuid,
  integer,
  integer,
  integer,
  integer,
  uuid,
  text
) from public, anon, authenticated;

grant execute on function private.validate_match_official_result(
  text,
  text,
  uuid,
  uuid,
  integer,
  integer,
  integer,
  integer,
  uuid,
  text
) to service_role;

create or replace function private.enforce_match_knockout_decision()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
declare
  official record;
begin
  select *
  into official
  from private.validate_match_official_result(
    new.stage,
    new.status,
    new.home_team_id,
    new.away_team_id,
    new.home_score,
    new.away_score,
    new.regulation_home_score,
    new.regulation_away_score,
    new.qualified_team_id,
    new.qualification_method
  );

  new.qualified_team_id := official.qualified_team_id;
  new.qualification_method := official.qualification_method;
  new.regulation_home_score := official.regulation_home_score;
  new.regulation_away_score := official.regulation_away_score;

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

create or replace function public.admin_finalize_match_result(
  _match_id uuid,
  _actor_id uuid default auth.uid()
)
returns table (
  match_id uuid,
  status text,
  bets_updated integer
)
language plpgsql
volatile
security definer
set search_path to 'public', 'private'
as $function$
declare
  actor record;
  match_row public.matches%rowtype;
  updated_count integer := 0;
begin
  if _actor_id is null then
    raise exception 'Usuário administrativo não informado.';
  end if;

  select role, status
  into actor
  from public.profiles
  where id = _actor_id;

  if not found or actor.status <> 'active' or actor.role not in ('admin', 'superadmin') then
    raise exception 'Você não tem permissão para fechar partidas.';
  end if;

  select *
  into match_row
  from public.matches
  where id = _match_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Partida não encontrada.';
  end if;

  if match_row.kickoff_at > now() then
    raise exception 'Não é permitido fechar partida futura.';
  end if;

  if match_row.status <> 'finished' then
    raise exception 'Salve o resultado como encerrado antes de fechar a partida.';
  end if;

  update public.matches
  set
    status = 'closed',
    updated_at = now()
  where id = _match_id
  returning * into match_row;

  updated_count := private.recalculate_match_points(_match_id);
  perform private.refresh_ranking_position_snapshots_for_match(_match_id);

  return query select match_row.id, match_row.status, updated_count;
end;
$function$;

revoke all on function public.admin_finalize_match_result(uuid, uuid)
from public, anon, authenticated;

grant execute on function public.admin_finalize_match_result(uuid, uuid)
to service_role;

commit;
