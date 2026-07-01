begin;

create or replace function public.admin_recalculate_match_points(_match_id uuid)
returns integer
language plpgsql
volatile
security invoker
set search_path = public
as $function$
declare
  updated_count integer := 0;
  match_status text;
begin
  select status
  into match_status
  from public.matches
  where id = _match_id
    and deleted_at is null;

  if match_status is null then
    return 0;
  end if;

  -- Hard stop: nao recalcular/zerar jogo futuro ou ao vivo.
  if match_status in ('scheduled', 'open', 'locked', 'live', 'canceled') then
    return 0;
  end if;

  -- Hardfix: se o fluxo antigo chamar recalculo com status finished,
  -- fecha antes, porque private.recalculate_match_points so grava pontos em closed/scored.
  if match_status = 'finished' then
    update public.matches
    set status = 'closed', updated_at = now()
    where id = _match_id
      and status = 'finished'
      and deleted_at is null;
  end if;

  updated_count := private.recalculate_match_points(_match_id);

  perform private.refresh_ranking_position_snapshots_for_match(_match_id);

  return updated_count;
end;
$function$;

commit;
