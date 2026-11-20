-- Deleting pages, and a page's history with "restore".
--
-- Deleting removes the page and all its revisions for good, so it's kept
-- deliberate: only a page that isn't live can be deleted (unpublish first),
-- and only at the version the editor has seen. Pages that link to it (e.g. a
-- Featured Post panel) simply stop showing it; cera_page_links lists them so
-- the admin can say so before deleting.
--
-- Restoring copies an old revision's content into the working copy as a new
-- draft save, so the live page doesn't change until someone publishes, and
-- the restore itself can be undone by restoring the version before it. The
-- new revision records which version it came from (restored_from).
--
-- Error codes, as in cera_init: 42501 not an editor, CE404 page or version
-- not found, CE409 version conflict, 23505 slug already used, and here
-- CE422 the page is live.

alter table public.cera_page_revisions
  -- For a revision made by restoring: the page_version it copied.
  add column restored_from integer;

/* ------------------------------------------------------------------ */
/* Deleting                                                            */
/* ------------------------------------------------------------------ */

-- Deletes a page and its revisions. Returns { id, contentType, slug }.
create function public.cera_delete_page(p_page_id uuid, p_expected_version integer, p_user uuid) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_page public.cera_pages;
begin
  perform public.cera_assert_editor(p_user);

  select * into v_page from public.cera_pages where id = p_page_id for update;
  if not found then
    raise exception 'cera: page % not found', p_page_id using errcode = 'CE404';
  end if;
  if v_page.version <> p_expected_version then
    raise exception 'cera: page % was changed by someone else (expected version %)', p_page_id, p_expected_version
      using errcode = 'CE409';
  end if;
  if exists (select 1 from public.cera_page_revisions where page_id = p_page_id and is_published) then
    raise exception 'cera: page % is live; unpublish it first', p_page_id using errcode = 'CE422';
  end if;

  -- Revisions (and any pending schedule) go with it: on delete cascade.
  delete from public.cera_pages where id = p_page_id;
  return jsonb_build_object('id', v_page.id, 'contentType', v_page.content_type, 'slug', v_page.slug);
end
$$;

-- The other pages that link to a page, as [{ id, title, slug, contentType,
-- draft, live }]: draft when the working copy links to it, live when the
-- published version does. Links are stored as the page's id inside boxes or
-- panels, and ids are UUIDs, so a text match finds them all. Runs as the
-- caller, so row-level security decides which pages they see.
create function public.cera_page_links(p_page_id uuid) returns jsonb
language sql stable
set search_path = ''
as $$
  with uses as (
    select p.id, p.title, p.slug, p.content_type, true as draft, false as live
    from public.cera_pages p
    where p.id <> p_page_id and strpos(p.boxes::text || p.panels::text, p_page_id::text) > 0
    union all
    select r.page_id, r.title, r.slug, r.content_type, false, true
    from public.cera_page_revisions r
    where r.is_published and r.page_id <> p_page_id and strpos(r.boxes::text || r.panels::text, p_page_id::text) > 0
  )
  select coalesce(jsonb_agg(u order by u.title, u.slug), '[]'::jsonb)
  from (
    select id,
           (array_agg(title order by draft desc))[1] as title,
           (array_agg(slug order by draft desc))[1] as slug,
           (array_agg(content_type order by draft desc))[1] as "contentType",
           bool_or(draft) as draft,
           bool_or(live) as live
    from uses
    group by id
  ) u
$$;

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

-- A page's revisions, newest first: p_limit of them, older than p_before
-- (a page_version) when given. Runs as the caller (row-level security).
create function public.cera_page_history(p_page_id uuid, p_before integer default null, p_limit integer default 30)
returns table (
  id uuid,
  page_version integer,
  kind text,
  title text,
  slug text,
  is_published boolean,
  created_at timestamptz,
  created_by_email text,
  scheduled_for timestamptz,
  schedule_status text,
  restored_from integer
)
language sql stable
set search_path = ''
as $$
  select r.id, r.page_version, r.kind, r.title, r.slug, r.is_published, r.created_at,
         public.cera_user_email(r.created_by), r.scheduled_for, r.schedule_status, r.restored_from
  from public.cera_page_revisions r
  where r.page_id = p_page_id and (p_before is null or r.page_version < p_before)
  order by r.page_version desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
$$;

-- Saves p_page (an old revision's content, already checked by
-- preparePageForSave) as a draft and records that it came from p_from.
-- Returns { id, version, revisionId }, like cera_save_page.
create function public.cera_restore_revision(
  p_page jsonb,
  p_from integer,
  p_expected_version integer,
  p_user uuid
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_saved jsonb;
  v_id    uuid := (p_page ->> 'id')::uuid;
begin
  perform public.cera_assert_editor(p_user);
  if not exists (select 1 from public.cera_page_revisions where page_id = v_id and page_version = p_from) then
    raise exception 'cera: page % has no version %', v_id, p_from using errcode = 'CE404';
  end if;
  if coalesce(p_expected_version, 0) = 0 then
    raise exception 'cera: restoring needs the current version of page %', v_id using errcode = 'CE409';
  end if;

  v_saved := public.cera_save_page(p_page, p_expected_version, false, p_user);
  update public.cera_page_revisions set restored_from = p_from where id = (v_saved ->> 'revisionId')::uuid;
  return v_saved;
end
$$;

revoke execute on function public.cera_delete_page(uuid, integer, uuid) from public, anon, authenticated;
revoke execute on function public.cera_restore_revision(jsonb, integer, integer, uuid) from public, anon, authenticated;
revoke execute on function public.cera_page_links(uuid) from public, anon;
revoke execute on function public.cera_page_history(uuid, integer, integer) from public, anon;
grant execute on function public.cera_delete_page(uuid, integer, uuid) to service_role;
grant execute on function public.cera_restore_revision(jsonb, integer, integer, uuid) to service_role;
grant execute on function public.cera_page_links(uuid) to authenticated, service_role;
grant execute on function public.cera_page_history(uuid, integer, integer) to authenticated, service_role;
