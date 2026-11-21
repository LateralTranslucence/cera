-- Content types that share addresses.
--
-- Slugs were unique per content type. Some types share a route, though (in
-- the example site, landing pages and simple pages both live at /[slug]), so
-- their slugs must be unique across all of them. Each page now has a
-- slug_scope: the content type's `slugScope` setting, or its own name when it
-- has none. Slugs are unique per scope, for working copies and for what's
-- live, so two types in one scope can never hold the same address, even when
-- two saves race.
--
-- Existing rows take their content type as their scope, which is what every
-- type had until now.
--
-- Error codes, as in cera_init: 23505 slug already used (now: anywhere in
-- the scope).

alter table public.cera_pages add column slug_scope text;
update public.cera_pages set slug_scope = content_type;
alter table public.cera_pages
  alter column slug_scope set not null,
  drop constraint cera_pages_slug_unique,
  add constraint cera_pages_slug_unique unique (slug_scope, slug);

alter table public.cera_page_revisions add column slug_scope text;
update public.cera_page_revisions set slug_scope = content_type;
alter table public.cera_page_revisions alter column slug_scope set not null;

drop index public.cera_page_revisions_published_slug;
create unique index cera_page_revisions_published_slug
  on public.cera_page_revisions (slug_scope, slug) where is_published;

/* ------------------------------------------------------------------ */
/* Saving: the page names its scope (p_page ->> 'slugScope')           */
/* ------------------------------------------------------------------ */

-- As in cera_scheduling, plus the scope: taken from the page on every save,
-- so a content type that changes its scope moves its pages on their next save.
create or replace function public.cera_save_page(
  p_page jsonb,
  p_expected_version integer,
  p_publish boolean,
  p_user uuid
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_id       uuid := (p_page ->> 'id')::uuid;
  v_scope    text := coalesce(nullif(p_page ->> 'slugScope', ''), p_page ->> 'contentType');
  v_version  integer;
  v_revision uuid;
begin
  perform public.cera_assert_editor(p_user);

  if coalesce(p_expected_version, 0) = 0 then
    insert into public.cera_pages (id, content_type, slug_scope, slug, title, boxes, panels, version, updated_by)
    values (
      v_id,
      p_page ->> 'contentType',
      v_scope,
      p_page ->> 'slug',
      coalesce(p_page ->> 'title', ''),
      coalesce(p_page -> 'boxes', '{}'::jsonb),
      coalesce(p_page -> 'panels', '[]'::jsonb),
      1,
      p_user
    )
    returning version into v_version;
  else
    update public.cera_pages p
    set slug       = p_page ->> 'slug',
        slug_scope = v_scope,
        title      = coalesce(p_page ->> 'title', ''),
        boxes      = coalesce(p_page -> 'boxes', '{}'::jsonb),
        panels     = coalesce(p_page -> 'panels', '[]'::jsonb),
        version    = p.version + 1,
        updated_at = now(),
        updated_by = p_user
    where p.id = v_id
      and p.content_type = p_page ->> 'contentType'
      and p.version = p_expected_version
    returning p.version into v_version;

    if not found then
      if exists (select 1 from public.cera_pages where id = v_id) then
        raise exception 'cera: page % was changed by someone else (expected version %)', v_id, p_expected_version
          using errcode = 'CE409';
      end if;
      raise exception 'cera: page % not found', v_id using errcode = 'CE404';
    end if;
  end if;

  insert into public.cera_page_revisions (page_id, page_version, kind, content_type, slug_scope, slug, title, boxes, panels, created_by)
  select p.id, p.version, case when p_publish then 'publish' else 'draft' end,
         p.content_type, p.slug_scope, p.slug, p.title, p.boxes, p.panels, p_user
  from public.cera_pages p where p.id = v_id
  returning id into v_revision;

  if p_publish then
    -- Unset the old live revision first: the partial unique index allows one per page.
    update public.cera_page_revisions set is_published = false
    where page_id = v_id and is_published and id <> v_revision;
    update public.cera_page_revisions set is_published = true where id = v_revision;
    -- What's live now is newer than any pending schedule.
    update public.cera_page_revisions set schedule_status = 'cancelled'
    where page_id = v_id and schedule_status = 'pending';
  end if;

  return jsonb_build_object('id', v_id, 'version', v_version, 'revisionId', v_revision);
end
$$;

-- As in cera_scheduling, with the early "already live elsewhere" check by scope.
create or replace function public.cera_schedule_page(
  p_page jsonb,
  p_expected_version integer,
  p_publish_at timestamptz,
  p_user uuid
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_saved jsonb;
  v_id    uuid := (p_page ->> 'id')::uuid;
  v_scope text := coalesce(nullif(p_page ->> 'slugScope', ''), p_page ->> 'contentType');
begin
  perform public.cera_assert_editor(p_user);
  if p_publish_at is null or p_publish_at <= now() then
    raise exception 'cera: the publish time must be in the future' using errcode = 'CE400';
  end if;
  -- Catch a slug that's already live elsewhere now, rather than when the schedule runs.
  if exists (
    select 1 from public.cera_page_revisions r
    where r.is_published and r.page_id <> v_id
      and r.slug_scope = v_scope and r.slug = p_page ->> 'slug'
  ) then
    raise exception 'cera: slug % is live on another page', p_page ->> 'slug' using errcode = '23505';
  end if;

  v_saved := public.cera_save_page(p_page, p_expected_version, false, p_user);

  update public.cera_page_revisions set schedule_status = 'cancelled'
  where page_id = v_id and schedule_status = 'pending';
  update public.cera_page_revisions
  set kind = 'schedule', scheduled_for = p_publish_at, schedule_status = 'pending'
  where id = (v_saved ->> 'revisionId')::uuid;

  return v_saved;
end
$$;
