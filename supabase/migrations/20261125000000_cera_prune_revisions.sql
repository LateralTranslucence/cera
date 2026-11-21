-- Pruning old draft revisions.
--
-- Every save keeps a revision, so drafts pile up. cera_prune_revisions keeps
-- each page's newest p_keep draft revisions and deletes older drafts once
-- they are p_older_than old. It never deletes a published or scheduled
-- revision (kind 'publish' or 'schedule'), the live one, or the page's
-- current version, so History keeps every version that ever went live.
-- Runs daily where pg_cron is available. Returns how many it deleted.

create function public.cera_prune_revisions(p_keep integer default 50, p_older_than interval default '30 days') returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_keep < 1 then
    raise exception 'cera: keep at least one draft revision per page' using errcode = '22023';
  end if;
  with ranked as (
    select r.id, row_number() over (partition by r.page_id order by r.page_version desc) as position
    from public.cera_page_revisions r
    where r.kind = 'draft' and not r.is_published
  )
  delete from public.cera_page_revisions r
  using ranked, public.cera_pages p
  where r.id = ranked.id
    and p.id = r.page_id
    and ranked.position > p_keep
    and r.created_at < now() - p_older_than
    and r.page_version <> p.version;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.cera_prune_revisions(integer, interval) from public, anon, authenticated;
grant execute on function public.cera_prune_revisions(integer, interval) to service_role;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('cera-prune-revisions', '30 3 * * *', 'select public.cera_prune_revisions()');
  end if;
end
$$;
