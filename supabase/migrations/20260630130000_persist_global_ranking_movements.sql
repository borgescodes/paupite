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
execute function private.refresh_ranking_position_snapshots_trigger();

select private.refresh_ranking_position_snapshots();
