-- Scheduled publishing, and the admin's page list.
--
-- Scheduling saves the page like a draft and marks that revision to go live
-- at a set time. A job (pg_cron, once a minute) publishes revisions that are
-- due. One schedule per page: scheduling again replaces it, and publishing
-- now or unpublishing cancels it, so an older snapshot can never go live
-- over newer content.
--
-- Error codes, as in cera_init: 42501 not an editor, CE404 page not found,
-- CE409 version conflict, CE400 publish time not in the future, 23505 slug
-- already live on another page.

alter table public.cera_page_revisions
  drop constraint cera_page_revisions_kind_check,
  add constraint cera_page_revisions_kind_check check (kind in ('draft', 'publish', 'schedule')),
  -- When a 'schedule' revision goes live.
  add column scheduled_for timestamptz,
  -- pending → published | cancelled | failed. Null for other revisions.
  add column schedule_status text check (schedule_status in ('pending', 'published', 'cancelled', 'failed')),
  -- Why a schedule failed (e.g. its slug went live on another page meanwhile).
  add column schedule_error text,
  add constraint cera_page_revisions_schedule_shape check (
    (kind = 'schedule') = (scheduled_for is not null and schedule_status is not null)
  );

create unique index cera_page_revisions_one_schedule on public.cera_page_revisions (page_id) where schedule_status = 'pending';
create index cera_page_revisions_due on public.cera_page_revisions (scheduled_for) where schedule_status = 'pending';

/* ------------------------------------------------------------------ */
/* Saving: publishing now cancels a pending schedule                   */
/* ------------------------------------------------------------------ */

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
  v_version  integer;
  v_revision uuid;
begin
  perform public.cera_assert_editor(p_user);

  if coalesce(p_expected_version, 0) = 0 then
    insert into public.cera_pages (id, content_type, slug, title, boxes, panels, version, updated_by)
    values (
      v_id,
      p_page ->> 'contentType',
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

  insert into public.cera_page_revisions (page_id, page_version, kind, content_type, slug, title, boxes, panels, created_by)
  select p.id, p.version, case when p_publish then 'publish' else 'draft' end,
         p.content_type, p.slug, p.title, p.boxes, p.panels, p_user
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

-- Unpublishing also cancels a pending schedule: the page stays off the site until someone publishes it again.
create or replace function public.cera_unpublish_page(p_page_id uuid, p_user uuid) returns void
language plpgsql
set search_path = ''
as $$
begin
  perform public.cera_assert_editor(p_user);
  update public.cera_page_revisions set is_published = false where page_id = p_page_id and is_published;
  update public.cera_page_revisions set schedule_status = 'cancelled' where page_id = p_page_id and schedule_status = 'pending';
end
$$;

/* ------------------------------------------------------------------ */
/* Scheduling                                                          */
/* ------------------------------------------------------------------ */

-- Saves the page and schedules that version to go live at p_publish_at,
-- replacing any earlier schedule. Returns { id, version, revisionId }.
create function public.cera_schedule_page(
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
begin
  perform public.cera_assert_editor(p_user);
  if p_publish_at is null or p_publish_at <= now() then
    raise exception 'cera: the publish time must be in the future' using errcode = 'CE400';
  end if;
  -- Catch a slug that's already live elsewhere now, rather than when the schedule runs.
  if exists (
    select 1 from public.cera_page_revisions r
    where r.is_published and r.page_id <> v_id
      and r.content_type = p_page ->> 'contentType' and r.slug = p_page ->> 'slug'
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

create function public.cera_cancel_schedule(p_page_id uuid, p_user uuid) returns void
language plpgsql
set search_path = ''
as $$
begin
  perform public.cera_assert_editor(p_user);
  update public.cera_page_revisions set schedule_status = 'cancelled'
  where page_id = p_page_id and schedule_status = 'pending';
end
$$;

-- Publishes every schedule that's due. A schedule that can't go live (its
-- slug is live on another page) is marked failed with the reason; the others
-- still run. Returns how many went live.
create function public.cera_publish_due() returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_due   record;
  v_count integer := 0;
begin
  for v_due in
    select id, page_id from public.cera_page_revisions
    where schedule_status = 'pending' and scheduled_for <= now()
    order by scheduled_for
    for update skip locked
  loop
    begin
      update public.cera_page_revisions set is_published = false
      where page_id = v_due.page_id and is_published and id <> v_due.id;
      update public.cera_page_revisions
      set is_published = true, schedule_status = 'published'
      where id = v_due.id;
      v_count := v_count + 1;
    exception when unique_violation then
      update public.cera_page_revisions
      set schedule_status = 'failed', schedule_error = 'Another page went live at this address first.'
      where id = v_due.id;
    end;
  end loop;
  return v_count;
end
$$;

/* ------------------------------------------------------------------ */
/* The admin's page list                                               */
/* ------------------------------------------------------------------ */

-- Who saved a page last, for the page list. auth.users isn't readable by
-- browser roles, so this is security definer; it answers only staff (by
-- their JWT role) and the service role. The `role` setting is the caller's
-- role even inside a security definer function.
create function public.cera_user_email(p_user uuid) returns text
language sql stable
security definer
set search_path = ''
as $$
  select u.email::text from auth.users u
  where u.id = p_user
    and (current_setting('role', true) = 'service_role' or public.cera_role() in ('admin', 'editor', 'viewer'))
$$;

-- One row per page: the working copy, which version is live and whether it
-- differs from the working copy, a pending
-- schedule (or the last one, if it failed and nothing newer is live), and who
-- saved last. Runs as the caller, so row-level security decides what they see.
create function public.cera_page_summaries(p_content_type text default null)
returns table (
  id uuid,
  content_type text,
  slug text,
  title text,
  version integer,
  updated_at timestamptz,
  updated_by_email text,
  panel_count integer,
  live_version integer,
  -- The working copy differs from what's live (title, address, boxes or panels).
  live_differs boolean,
  scheduled_for timestamptz,
  scheduled_version integer,
  schedule_failed text
)
language sql stable
set search_path = ''
as $$
  select p.id, p.content_type, p.slug, p.title, p.version, p.updated_at,
         public.cera_user_email(p.updated_by),
         jsonb_array_length(p.panels),
         live.page_version,
         live.page_version is not null
           and (p.title, p.slug, p.boxes, p.panels) is distinct from (live.title, live.slug, live.boxes, live.panels),
         sched.scheduled_for,
         sched.page_version,
         case when last_schedule.schedule_status = 'failed'
                   and (live.page_version is null or live.page_version < last_schedule.page_version)
              then last_schedule.schedule_error end
  from public.cera_pages p
  left join public.cera_page_revisions live on live.page_id = p.id and live.is_published
  left join public.cera_page_revisions sched on sched.page_id = p.id and sched.schedule_status = 'pending'
  left join lateral (
    select r.schedule_status, r.schedule_error, r.page_version from public.cera_page_revisions r
    where r.page_id = p.id and r.kind = 'schedule'
    order by r.page_version desc limit 1
  ) last_schedule on true
  where p_content_type is null or p.content_type = p_content_type
$$;

revoke execute on function public.cera_schedule_page(jsonb, integer, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public.cera_cancel_schedule(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.cera_publish_due() from public, anon, authenticated;
revoke execute on function public.cera_page_summaries(text) from public, anon;
revoke execute on function public.cera_user_email(uuid) from public, anon;
grant execute on function public.cera_schedule_page(jsonb, integer, timestamptz, uuid) to service_role;
grant execute on function public.cera_cancel_schedule(uuid, uuid) to service_role;
grant execute on function public.cera_publish_due() to service_role;
grant execute on function public.cera_page_summaries(text) to authenticated, service_role;
grant execute on function public.cera_user_email(uuid) to authenticated, service_role;

/* ------------------------------------------------------------------ */
/* The job                                                             */
/* ------------------------------------------------------------------ */

-- Where pg_cron is available (Supabase, hosted and local), run the job every
-- minute. Elsewhere (tests), call cera_publish_due() some other way.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('cera-publish-due', '* * * * *', 'select public.cera_publish_due()');
  end if;
end
$$;
