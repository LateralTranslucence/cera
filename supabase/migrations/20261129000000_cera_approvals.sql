-- Authors, site settings, and approving pages before they go live.
--
-- Roles, lowest first: viewer, author, editor, admin. An author writes pages
-- and uploads files but never changes the live site: publishing, scheduling,
-- unpublishing, deleting and changing files start at editor.
--
-- Approval is optional, and set per content type (cera_settings, key
-- 'approvals'):
--   { "tiers": { "<content type>": ["editor", "admin"] }, "someoneElse": false }
-- A type's tiers are the roles that must approve, lowest first: one of them
-- (["editor"] or ["admin"]) or both. A type with none works as before: an
-- editor or admin publishes.
--
--   * An approval counts for every tier up to the approver's role: an admin's
--     approval is the last one needed, an editor's clears the editor tier.
--   * Whoever could give the last approval publishes without asking, unless
--     someoneElse is on: then every page needs somebody else's approval.
--   * What's approved is one saved version (the submitted revision). Later
--     saves stay drafts. Submitting again replaces the request, and so does
--     publishing or scheduling directly.
--   * The settings as they are now decide, also for requests already made.
--
-- The functions check all this themselves, whatever the admin shows.
--
-- Error codes, as in cera_init: 42501 the user's role may not do this, CE404
-- not found, CE409 version conflict (or a request already decided), CE400 bad
-- input (a time not in the future, a type without approval, invalid
-- settings), 23505 slug already used, and here CE423 needs someone's approval.

/* ------------------------------------------------------------------ */
/* Roles                                                               */
/* ------------------------------------------------------------------ */

create function public.cera_role_rank(p_role text) returns integer
language sql immutable
set search_path = ''
as $$
  select case p_role when 'admin' then 4 when 'editor' then 3 when 'author' then 2 when 'viewer' then 1 else 0 end
$$;

-- A user's role, read fresh. security definer: auth.users isn't readable by
-- every role. Only the service role may call it.
create function public.cera_user_role(p_user uuid) returns text
language sql stable
security definer
set search_path = ''
as $$
  select coalesce((select u.raw_app_meta_data ->> 'cera_role' from auth.users u where u.id = p_user), '')
$$;

create function public.cera_assert_author(p_user uuid) returns void
language plpgsql stable
set search_path = ''
as $$
begin
  if public.cera_role_rank(public.cera_user_role(p_user)) < 2 then
    raise exception 'cera: user % may not edit pages', p_user using errcode = '42501';
  end if;
end
$$;

-- Authors read what the other staff read. (Form submissions stay with
-- editors and admins.)
drop policy "staff read pages" on public.cera_pages;
create policy "staff read pages" on public.cera_pages
  for select to authenticated
  using (public.cera_role_rank(public.cera_role()) > 0);

drop policy "staff read all revisions" on public.cera_page_revisions;
create policy "staff read all revisions" on public.cera_page_revisions
  for select to authenticated
  using (public.cera_role_rank(public.cera_role()) > 0);

create or replace function public.cera_user_email(p_user uuid) returns text
language sql stable
security definer
set search_path = ''
as $$
  select u.email::text from auth.users u
  where u.id = p_user
    and (current_setting('role', true) = 'service_role' or public.cera_role_rank(public.cera_role()) > 0)
$$;

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

create table public.cera_settings (
  key         text primary key,
  value       jsonb not null,
  -- Optimistic locking, as for pages: a save names the version it was based on.
  version     integer not null default 1,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);

alter table public.cera_settings enable row level security;
revoke all on public.cera_settings from anon, authenticated;
grant select on public.cera_settings to authenticated;
grant all on public.cera_settings to service_role;

create policy "staff read settings" on public.cera_settings
  for select to authenticated
  using (public.cera_role_rank(public.cera_role()) > 0);

create function public.cera_valid_approvals(p_value jsonb) returns boolean
language sql immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_value) = 'object'
    and jsonb_typeof(p_value -> 'tiers') = 'object'
    and jsonb_typeof(p_value -> 'someoneElse') = 'boolean'
    and not exists (
      select 1 from jsonb_each(case when jsonb_typeof(p_value -> 'tiers') = 'object' then p_value -> 'tiers' else '{}'::jsonb end) t
      where t.value not in ('["editor"]'::jsonb, '["admin"]'::jsonb, '["editor", "admin"]'::jsonb)
    ),
    false)
$$;

alter table public.cera_settings
  add constraint cera_settings_approvals_shape check (key <> 'approvals' or public.cera_valid_approvals(value));

-- Saves one of the site's settings (admins only). p_expected_version is 0 for
-- one not saved before. Returns { version }.
create function public.cera_save_settings(p_key text, p_value jsonb, p_expected_version integer, p_user uuid) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_version integer;
begin
  if public.cera_user_role(p_user) <> 'admin' then
    raise exception 'cera: user % may not change settings', p_user using errcode = '42501';
  end if;
  if p_key = 'approvals' and not public.cera_valid_approvals(p_value) then
    raise exception 'cera: invalid approval settings' using errcode = 'CE400';
  end if;

  if coalesce(p_expected_version, 0) = 0 then
    insert into public.cera_settings (key, value, updated_by) values (p_key, p_value, p_user)
    on conflict (key) do nothing
    returning version into v_version;
  else
    update public.cera_settings
    set value = p_value, version = version + 1, updated_at = now(), updated_by = p_user
    where key = p_key and version = p_expected_version
    returning version into v_version;
  end if;
  if v_version is null then
    raise exception 'cera: settings were changed by someone else' using errcode = 'CE409';
  end if;
  return jsonb_build_object('version', v_version);
end
$$;

/* ------------------------------------------------------------------ */
/* Who may change the live site                                        */
/* ------------------------------------------------------------------ */

-- The roles that must approve a content type's pages, lowest first; empty when none.
create function public.cera_approval_tiers(p_content_type text) returns text[]
language sql stable
set search_path = ''
as $$
  select coalesce(
    (select array_agg(t.role order by t.position)
     from public.cera_settings s, jsonb_array_elements_text(s.value -> 'tiers' -> p_content_type) with ordinality as t(role, position)
     where s.key = 'approvals' and jsonb_typeof(s.value -> 'tiers' -> p_content_type) = 'array'),
    '{}'::text[])
$$;

create function public.cera_approval_someone_else() returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce((select (s.value ->> 'someoneElse')::boolean from public.cera_settings s where s.key = 'approvals'), false)
$$;

-- The role a request waits for, given the highest role that vouches for it so
-- far (the submitter's, or an approver's): the first tier above it, or else
-- the last one (someoneElse, or tiers removed since).
create function public.cera_awaiting_role(p_content_type text, p_cleared text) returns text
language sql stable
set search_path = ''
as $$
  select coalesce(
    (select t.role from unnest(tiers.list) with ordinality as t(role, position)
     where public.cera_role_rank(t.role) > public.cera_role_rank(p_cleared)
     order by t.position limit 1),
    tiers.list[cardinality(tiers.list)],
    'editor')
  from (select public.cera_approval_tiers(p_content_type) as list) tiers
$$;

-- The user could give a page's last approval: an editor or admin, whose role
-- reaches the type's last tier. Taking pages off the live site, cancelling a
-- schedule and replacing live files need this.
create function public.cera_assert_approver(p_content_type text, p_user uuid) returns void
language plpgsql stable
set search_path = ''
as $$
declare
  v_tiers text[] := public.cera_approval_tiers(p_content_type);
begin
  perform public.cera_assert_editor(p_user);
  if public.cera_role_rank(public.cera_user_role(p_user)) < public.cera_role_rank(v_tiers[cardinality(v_tiers)]) then
    raise exception 'cera: changing live % pages needs % approval', p_content_type, v_tiers[cardinality(v_tiers)] using errcode = 'CE423';
  end if;
end
$$;

-- The user may publish a page of this type without asking.
create function public.cera_assert_publisher(p_content_type text, p_user uuid) returns void
language plpgsql stable
set search_path = ''
as $$
begin
  perform public.cera_assert_approver(p_content_type, p_user);
  if cardinality(public.cera_approval_tiers(p_content_type)) > 0 and public.cera_approval_someone_else() then
    raise exception 'cera: publishing % pages needs someone else''s approval', p_content_type using errcode = 'CE423';
  end if;
end
$$;

/* ------------------------------------------------------------------ */
/* Requests                                                            */
/* ------------------------------------------------------------------ */

-- A submitted version. It stays 'submit' unless it goes live.
alter table public.cera_page_revisions
  drop constraint cera_page_revisions_kind_check,
  add constraint cera_page_revisions_kind_check check (kind in ('draft', 'submit', 'publish', 'schedule'));

create table public.cera_approvals (
  id             uuid primary key default gen_random_uuid(),
  page_id        uuid not null references public.cera_pages (id) on delete cascade,
  revision_id    uuid not null references public.cera_page_revisions (id) on delete cascade,
  page_version   integer not null,
  content_type   text not null,
  status         text not null default 'pending' check (status in ('pending', 'approved', 'sent_back', 'withdrawn', 'replaced')),
  -- The highest role that vouches for it: the submitter's, then each approver's.
  cleared_role   text not null,
  -- When the submitter would like it to go live. The last approver decides.
  requested_for  timestamptz,
  submitted_at   timestamptz not null default now(),
  submitted_by   uuid references auth.users (id) on delete set null
);

create unique index cera_approvals_one_pending on public.cera_approvals (page_id) where status = 'pending';
create index cera_approvals_page on public.cera_approvals (page_id, page_version desc);

-- What happened to each request, in order. 'approved' passes it to the next
-- tier; 'published' and 'scheduled' are the last approval.
create table public.cera_approval_events (
  id           bigint generated always as identity primary key,
  approval_id  uuid not null references public.cera_approvals (id) on delete cascade,
  page_id      uuid not null references public.cera_pages (id) on delete cascade,
  action       text not null check (action in ('submitted', 'approved', 'published', 'scheduled', 'sent_back', 'withdrawn', 'replaced')),
  comment      text check (char_length(comment) <= 2000),
  -- The role the person acted with.
  role         text,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null
);

create index cera_approval_events_approval on public.cera_approval_events (approval_id, id);

alter table public.cera_approvals enable row level security;
alter table public.cera_approval_events enable row level security;
revoke all on public.cera_approvals, public.cera_approval_events from anon, authenticated;
grant select on public.cera_approvals, public.cera_approval_events to authenticated;
grant all on public.cera_approvals, public.cera_approval_events to service_role;

create policy "staff read approvals" on public.cera_approvals
  for select to authenticated
  using (public.cera_role_rank(public.cera_role()) > 0);

create policy "staff read approval events" on public.cera_approval_events
  for select to authenticated
  using (public.cera_role_rank(public.cera_role()) > 0);

create function public.cera_log_approval(p_approval public.cera_approvals, p_action text, p_comment text, p_user uuid) returns void
language sql
set search_path = ''
as $$
  insert into public.cera_approval_events (approval_id, page_id, action, comment, role, created_by)
  values (p_approval.id, p_approval.page_id, p_action, nullif(btrim(p_comment), ''), nullif(public.cera_user_role(p_user), ''), p_user)
$$;

-- Ends a page's pending request because something newer takes its place.
create function public.cera_replace_approval(p_page_id uuid, p_user uuid) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_row public.cera_approvals;
begin
  update public.cera_approvals set status = 'replaced'
  where page_id = p_page_id and status = 'pending'
  returning * into v_row;
  if found then
    perform public.cera_log_approval(v_row, 'replaced', null, p_user);
  end if;
end
$$;

/* ------------------------------------------------------------------ */
/* Saving, publishing and scheduling                                   */
/* ------------------------------------------------------------------ */

-- As in cera_slug_scopes, but: authors may save drafts, publishing checks the
-- type's approval tiers, and publishing ends a pending request.
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
  perform public.cera_assert_author(p_user);
  if p_publish then
    perform public.cera_assert_publisher(p_page ->> 'contentType', p_user);
  end if;

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
    -- What's live now is newer than any pending schedule or request.
    update public.cera_page_revisions set schedule_status = 'cancelled'
    where page_id = v_id and schedule_status = 'pending';
    perform public.cera_replace_approval(v_id, p_user);
  end if;

  return jsonb_build_object('id', v_id, 'version', v_version, 'revisionId', v_revision);
end
$$;

-- The address a page would go live at isn't another live page's.
create function public.cera_assert_slug_free(p_page_id uuid, p_scope text, p_slug text) returns void
language plpgsql stable
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.cera_page_revisions r
    where r.is_published and r.page_id <> p_page_id and r.slug_scope = p_scope and r.slug = p_slug
  ) then
    raise exception 'cera: slug % is live on another page', p_slug using errcode = '23505';
  end if;
end
$$;

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
begin
  perform public.cera_assert_publisher(p_page ->> 'contentType', p_user);
  if p_publish_at is null or p_publish_at <= now() then
    raise exception 'cera: the publish time must be in the future' using errcode = 'CE400';
  end if;
  -- Catch a slug that's already live elsewhere now, rather than when the schedule runs.
  perform public.cera_assert_slug_free(v_id, coalesce(nullif(p_page ->> 'slugScope', ''), p_page ->> 'contentType'), p_page ->> 'slug');

  v_saved := public.cera_save_page(p_page, p_expected_version, false, p_user);

  update public.cera_page_revisions set schedule_status = 'cancelled'
  where page_id = v_id and schedule_status = 'pending';
  update public.cera_page_revisions
  set kind = 'schedule', scheduled_for = p_publish_at, schedule_status = 'pending'
  where id = (v_saved ->> 'revisionId')::uuid;
  perform public.cera_replace_approval(v_id, p_user);

  return v_saved;
end
$$;

-- Unpublishing and cancelling a schedule change what's live, so they need
-- someone who could have approved it.
create or replace function public.cera_unpublish_page(p_page_id uuid, p_user uuid) returns void
language plpgsql
set search_path = ''
as $$
begin
  perform public.cera_assert_approver((select content_type from public.cera_pages where id = p_page_id), p_user);
  update public.cera_page_revisions set is_published = false where page_id = p_page_id and is_published;
  update public.cera_page_revisions set schedule_status = 'cancelled' where page_id = p_page_id and schedule_status = 'pending';
end
$$;

create or replace function public.cera_cancel_schedule(p_page_id uuid, p_user uuid) returns void
language plpgsql
set search_path = ''
as $$
begin
  perform public.cera_assert_approver((select content_type from public.cera_pages where id = p_page_id), p_user);
  update public.cera_page_revisions set schedule_status = 'cancelled'
  where page_id = p_page_id and schedule_status = 'pending';
end
$$;

-- As in cera_page_history, for authors too: a restore is a draft save.
create or replace function public.cera_restore_revision(
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
  perform public.cera_assert_author(p_user);
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

/* ------------------------------------------------------------------ */
/* Submitting and deciding                                             */
/* ------------------------------------------------------------------ */

-- Saves the page and asks for that version to be approved, replacing an
-- earlier request. Returns { id, version, revisionId, approvalId }.
create function public.cera_submit_page(
  p_page jsonb,
  p_expected_version integer,
  p_requested_for timestamptz,
  p_note text,
  p_user uuid
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_saved    jsonb;
  v_id       uuid := (p_page ->> 'id')::uuid;
  v_type     text := p_page ->> 'contentType';
  v_approval public.cera_approvals;
begin
  perform public.cera_assert_author(p_user);
  if cardinality(public.cera_approval_tiers(v_type)) = 0 then
    raise exception 'cera: % pages don''t need approval', v_type using errcode = 'CE400';
  end if;
  if p_requested_for is not null and p_requested_for <= now() then
    raise exception 'cera: the publish time must be in the future' using errcode = 'CE400';
  end if;
  perform public.cera_assert_slug_free(v_id, coalesce(nullif(p_page ->> 'slugScope', ''), v_type), p_page ->> 'slug');

  v_saved := public.cera_save_page(p_page, p_expected_version, false, p_user);
  update public.cera_page_revisions set kind = 'submit' where id = (v_saved ->> 'revisionId')::uuid;

  perform public.cera_replace_approval(v_id, p_user);
  insert into public.cera_approvals (page_id, revision_id, page_version, content_type, cleared_role, requested_for, submitted_by)
  values (v_id, (v_saved ->> 'revisionId')::uuid, (v_saved ->> 'version')::integer, v_type, public.cera_user_role(p_user), p_requested_for, p_user)
  returning * into v_approval;
  perform public.cera_log_approval(v_approval, 'submitted', p_note, p_user);

  return v_saved || jsonb_build_object('approvalId', v_approval.id);
end
$$;

-- Approves a request or sends it back.
--   p_decision    'approve' | 'send_back'
--   p_publish_at  for the last approval: when the version goes live; null for now
-- Approving passes the request to the next tier, or with the last approval
-- publishes (or schedules) the submitted version. Returns { pageId, version,
-- outcome: 'approved' | 'published' | 'scheduled' | 'sent_back' }.
create function public.cera_decide_approval(
  p_approval_id uuid,
  p_decision text,
  p_publish_at timestamptz,
  p_comment text,
  p_user uuid
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row      public.cera_approvals;
  v_revision public.cera_page_revisions;
  v_role     text := public.cera_user_role(p_user);
  v_tiers    text[];
  v_outcome  text;
begin
  perform public.cera_assert_editor(p_user);
  if p_decision not in ('approve', 'send_back') then
    raise exception 'cera: unknown decision %', p_decision using errcode = 'CE400';
  end if;

  -- The page first, as saving does, so the two can't wait on each other.
  perform 1 from public.cera_pages
  where id = (select page_id from public.cera_approvals where id = p_approval_id) for update;
  select * into v_row from public.cera_approvals where id = p_approval_id for update;
  if not found then
    raise exception 'cera: approval % not found', p_approval_id using errcode = 'CE404';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'cera: approval % was already decided or replaced', p_approval_id using errcode = 'CE409';
  end if;

  if public.cera_role_rank(v_role) < public.cera_role_rank(public.cera_awaiting_role(v_row.content_type, v_row.cleared_role)) then
    raise exception 'cera: this needs a higher role''s approval' using errcode = 'CE423';
  end if;
  if v_row.submitted_by = p_user and public.cera_approval_someone_else() then
    raise exception 'cera: someone else must approve this' using errcode = 'CE423';
  end if;

  if p_decision = 'send_back' then
    update public.cera_approvals set status = 'sent_back' where id = v_row.id;
    v_outcome := 'sent_back';
  else
    if public.cera_role_rank(v_role) > public.cera_role_rank(v_row.cleared_role) then
      v_row.cleared_role := v_role;
    end if;
    v_tiers := public.cera_approval_tiers(v_row.content_type);

    if exists (select 1 from unnest(v_tiers) t(role) where public.cera_role_rank(t.role) > public.cera_role_rank(v_row.cleared_role)) then
      update public.cera_approvals set cleared_role = v_row.cleared_role where id = v_row.id;
      v_outcome := 'approved';
    else
      if p_publish_at is not null and p_publish_at <= now() then
        raise exception 'cera: the publish time must be in the future' using errcode = 'CE400';
      end if;
      select * into v_revision from public.cera_page_revisions where id = v_row.revision_id;
      perform public.cera_assert_slug_free(v_revision.page_id, v_revision.slug_scope, v_revision.slug);

      -- What was just approved is newer than any pending schedule.
      update public.cera_page_revisions set schedule_status = 'cancelled'
      where page_id = v_row.page_id and schedule_status = 'pending';
      if p_publish_at is null then
        update public.cera_page_revisions set is_published = false
        where page_id = v_row.page_id and is_published;
        update public.cera_page_revisions set is_published = true, kind = 'publish' where id = v_row.revision_id;
        v_outcome := 'published';
      else
        update public.cera_page_revisions
        set kind = 'schedule', scheduled_for = p_publish_at, schedule_status = 'pending'
        where id = v_row.revision_id;
        v_outcome := 'scheduled';
      end if;
      update public.cera_approvals set status = 'approved', cleared_role = v_row.cleared_role where id = v_row.id;
    end if;
  end if;

  perform public.cera_log_approval(v_row, v_outcome, p_comment, p_user);
  return jsonb_build_object('pageId', v_row.page_id, 'version', v_row.page_version, 'outcome', v_outcome);
end
$$;

-- Takes a request back. Only whoever submitted it.
create function public.cera_withdraw_approval(p_approval_id uuid, p_user uuid) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_row public.cera_approvals;
begin
  perform public.cera_assert_author(p_user);
  select * into v_row from public.cera_approvals where id = p_approval_id for update;
  if not found then
    raise exception 'cera: approval % not found', p_approval_id using errcode = 'CE404';
  end if;
  if v_row.submitted_by is distinct from p_user then
    raise exception 'cera: only whoever submitted it may withdraw it' using errcode = '42501';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'cera: approval % was already decided or replaced', p_approval_id using errcode = 'CE409';
  end if;
  update public.cera_approvals set status = 'withdrawn' where id = v_row.id;
  perform public.cera_log_approval(v_row, 'withdrawn', null, p_user);
end
$$;

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

-- A page's latest request, with what happened to it, if it still matters:
-- pending, or sent back with nothing newer live or scheduled since. Null
-- otherwise. Runs as the caller (row-level security).
create function public.cera_page_approval(p_page_id uuid) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', a.id,
    'status', a.status,
    'version', a.page_version,
    'awaiting', case when a.status = 'pending' then public.cera_awaiting_role(a.content_type, a.cleared_role) end,
    'requestedFor', a.requested_for,
    'submittedAt', a.submitted_at,
    'submittedBy', a.submitted_by,
    'submittedByEmail', public.cera_user_email(a.submitted_by),
    'events', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'action', e.action, 'at', e.created_at, 'by', public.cera_user_email(e.created_by), 'role', e.role, 'comment', e.comment
      ) order by e.id), '[]'::jsonb)
      from public.cera_approval_events e where e.approval_id = a.id
    )
  )
  from (
    select * from public.cera_approvals
    where page_id = p_page_id
    order by page_version desc limit 1
  ) a
  where a.status = 'pending'
    or (a.status = 'sent_back' and not exists (
      select 1 from public.cera_page_revisions r
      where r.page_id = p_page_id and r.page_version > a.page_version and (r.is_published or r.schedule_status = 'pending')
    ))
$$;

-- Every pending request, oldest first, for the Approvals screen. Runs as the
-- caller (row-level security).
create function public.cera_pending_approvals() returns table (
  id uuid,
  page_id uuid,
  content_type text,
  title text,
  page_version integer,
  awaiting text,
  requested_for timestamptz,
  submitted_at timestamptz,
  submitted_by uuid,
  submitted_by_email text
)
language sql stable
set search_path = ''
as $$
  select a.id, a.page_id, a.content_type, r.title, a.page_version,
         public.cera_awaiting_role(a.content_type, a.cleared_role),
         a.requested_for, a.submitted_at, a.submitted_by, public.cera_user_email(a.submitted_by)
  from public.cera_approvals a
  join public.cera_page_revisions r on r.id = a.revision_id
  where a.status = 'pending'
  order by a.submitted_at
$$;

-- As in cera_scheduling, plus the page's request: waiting (and for whom) or sent back.
drop function public.cera_page_summaries(text);
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
  schedule_failed text,
  -- 'pending' or 'sent_back', as cera_page_approval decides.
  approval_status text,
  approval_awaiting text
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
              then last_schedule.schedule_error end,
         case when request.status = 'pending' then 'pending'
              when request.status = 'sent_back' and greatest(live.page_version, sched.page_version, 0) < request.page_version then 'sent_back' end,
         case when request.status = 'pending' then public.cera_awaiting_role(request.content_type, request.cleared_role) end
  from public.cera_pages p
  left join public.cera_page_revisions live on live.page_id = p.id and live.is_published
  left join public.cera_page_revisions sched on sched.page_id = p.id and sched.schedule_status = 'pending'
  left join lateral (
    select r.schedule_status, r.schedule_error, r.page_version from public.cera_page_revisions r
    where r.page_id = p.id and r.kind = 'schedule'
    order by r.page_version desc limit 1
  ) last_schedule on true
  left join lateral (
    select a.status, a.page_version, a.content_type, a.cleared_role from public.cera_approvals a
    where a.page_id = p.id
    order by a.page_version desc limit 1
  ) request on true
  where p_content_type is null or p.content_type = p_content_type
$$;

-- As in cera_page_history, plus what happened to a submitted version's request.
drop function public.cera_page_history(uuid, integer, integer);
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
  restored_from integer,
  approval_events jsonb
)
language sql stable
set search_path = ''
as $$
  select r.id, r.page_version, r.kind, r.title, r.slug, r.is_published, r.created_at,
         public.cera_user_email(r.created_by), r.scheduled_for, r.schedule_status, r.restored_from,
         (
           select jsonb_agg(jsonb_build_object(
             'action', e.action, 'at', e.created_at, 'by', public.cera_user_email(e.created_by), 'role', e.role, 'comment', e.comment
           ) order by e.id)
           from public.cera_approvals a
           join public.cera_approval_events e on e.approval_id = a.id
           where a.revision_id = r.id
         )
  from public.cera_page_revisions r
  where r.page_id = p_page_id and (p_before is null or r.page_version < p_before)
  order by r.page_version desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
$$;

/* ------------------------------------------------------------------ */
/* Media                                                               */
/* ------------------------------------------------------------------ */

-- As in cera_media_uploads, for authors too: an upload changes no page.
create or replace function public.cera_add_media(p_media jsonb, p_user uuid) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row public.cera_media;
begin
  perform public.cera_assert_author(p_user);

  insert into public.cera_media (path, kind, mime_type, alt, width, height, size_bytes, created_by)
  values (
    p_media ->> 'path',
    coalesce(p_media ->> 'kind', 'image'),
    p_media ->> 'mimeType',
    nullif(p_media ->> 'alt', ''),
    (p_media ->> 'width')::integer,
    (p_media ->> 'height')::integer,
    (p_media ->> 'sizeBytes')::bigint,
    p_user
  )
  returning * into v_row;

  return public.cera_media_json(v_row);
end
$$;

-- Versions waiting for approval use their files too: they go live as they are.
create or replace function public.cera_media_in_use(p_path text) returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(p_path, '') <> '' and (
    exists (select 1 from public.cera_pages p where strpos(p.boxes::text || p.panels::text, p_path) > 0)
    or exists (
      select 1 from public.cera_page_revisions r
      where (
          r.is_published
          or (r.kind = 'schedule' and r.schedule_status = 'pending')
          or (r.kind = 'submit' and exists (select 1 from public.cera_approvals a where a.revision_id = r.id and a.status = 'pending'))
        )
        and strpos(r.boxes::text || r.panels::text, p_path) > 0
    )
  )
$$;

-- As in cera_media_editing, but a file only a waiting or scheduled version
-- uses can't be deleted either.
create or replace function public.cera_delete_media(p_id uuid, p_user uuid) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_path text;
begin
  perform public.cera_assert_editor(p_user);

  select path into v_path from public.cera_media where id = p_id for update;
  if not found then
    raise exception 'cera: media % not found', p_id using errcode = 'CE404';
  end if;
  if jsonb_array_length(public.cera_media_usage(v_path)) > 0 or public.cera_media_in_use(v_path) then
    raise exception 'cera: media % is used on a page', p_id using errcode = 'CE409';
  end if;

  delete from public.cera_media where id = p_id;
  return jsonb_build_object('path', v_path);
end
$$;

-- As in cera_media_maintenance, but: waiting versions are updated too, and
-- replacing a file that's live (or scheduled) on a type with approval needs
-- someone who could have approved the page, since the live site changes at
-- once. Error code CE423 otherwise.
create or replace function public.cera_replace_media(p_id uuid, p_media jsonb, p_user uuid) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row public.cera_media;
  v_old_path text;
  v_pages integer;
  v_swap jsonb;
  v_type text;
begin
  perform public.cera_assert_editor(p_user);

  select * into v_row from public.cera_media where id = p_id for update;
  if not found then
    raise exception 'cera: media % not found', p_id using errcode = 'CE404';
  end if;
  if coalesce(p_media ->> 'kind', v_row.kind) <> v_row.kind then
    raise exception 'cera: a % can only be replaced with another', v_row.kind using errcode = 'CE409';
  end if;
  v_old_path := v_row.path;

  for v_type in
    select distinct r.content_type from public.cera_page_revisions r
    where (r.is_published or (r.kind = 'schedule' and r.schedule_status = 'pending'))
      and strpos(r.boxes::text || r.panels::text, v_old_path) > 0
  loop
    perform public.cera_assert_approver(v_type, p_user);
  end loop;

  update public.cera_media
  set path = p_media ->> 'path',
      mime_type = p_media ->> 'mimeType',
      width = (p_media ->> 'width')::integer,
      height = (p_media ->> 'height')::integer,
      size_bytes = (p_media ->> 'sizeBytes')::bigint
  where id = p_id
  returning * into v_row;

  v_swap := jsonb_build_object('path', v_row.path, 'kind', v_row.kind, 'width', v_row.width, 'height', v_row.height);

  update public.cera_pages
  set boxes = public.cera_swap_media(boxes, p_id::text, v_old_path, v_swap),
      panels = public.cera_swap_media(panels, p_id::text, v_old_path, v_swap)
  where strpos(boxes::text || panels::text, v_old_path) > 0;
  get diagnostics v_pages = row_count;

  update public.cera_page_revisions r
  set boxes = public.cera_swap_media(boxes, p_id::text, v_old_path, v_swap),
      panels = public.cera_swap_media(panels, p_id::text, v_old_path, v_swap)
  where (
      is_published
      or (kind = 'schedule' and schedule_status = 'pending')
      or (kind = 'submit' and exists (select 1 from public.cera_approvals a where a.revision_id = r.id and a.status = 'pending'))
    )
    and strpos(boxes::text || panels::text, v_old_path) > 0;

  return jsonb_build_object('item', public.cera_media_json(v_row), 'oldPath', v_old_path, 'pages', v_pages);
end
$$;

/* ------------------------------------------------------------------ */
/* Who may call what                                                   */
/* ------------------------------------------------------------------ */

revoke execute on function public.cera_role_rank(text) from public, anon;
revoke execute on function public.cera_valid_approvals(jsonb) from public, anon, authenticated;
revoke execute on function public.cera_user_role(uuid) from public, anon, authenticated;
revoke execute on function public.cera_assert_author(uuid) from public, anon, authenticated;
revoke execute on function public.cera_save_settings(text, jsonb, integer, uuid) from public, anon, authenticated;
revoke execute on function public.cera_approval_tiers(text) from public, anon;
revoke execute on function public.cera_approval_someone_else() from public, anon;
revoke execute on function public.cera_awaiting_role(text, text) from public, anon;
revoke execute on function public.cera_assert_approver(text, uuid) from public, anon, authenticated;
revoke execute on function public.cera_assert_publisher(text, uuid) from public, anon, authenticated;
revoke execute on function public.cera_assert_slug_free(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.cera_log_approval(public.cera_approvals, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.cera_replace_approval(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.cera_submit_page(jsonb, integer, timestamptz, text, uuid) from public, anon, authenticated;
revoke execute on function public.cera_decide_approval(uuid, text, timestamptz, text, uuid) from public, anon, authenticated;
revoke execute on function public.cera_withdraw_approval(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.cera_page_approval(uuid) from public, anon;
revoke execute on function public.cera_pending_approvals() from public, anon;
revoke execute on function public.cera_page_summaries(text) from public, anon;
revoke execute on function public.cera_page_history(uuid, integer, integer) from public, anon;

grant execute on function public.cera_role_rank(text) to authenticated, service_role;
grant execute on function public.cera_valid_approvals(jsonb) to service_role;
grant execute on function public.cera_user_role(uuid) to service_role;
grant execute on function public.cera_assert_author(uuid) to service_role;
grant execute on function public.cera_save_settings(text, jsonb, integer, uuid) to service_role;
grant execute on function public.cera_approval_tiers(text) to authenticated, service_role;
grant execute on function public.cera_approval_someone_else() to authenticated, service_role;
grant execute on function public.cera_awaiting_role(text, text) to authenticated, service_role;
grant execute on function public.cera_assert_approver(text, uuid) to service_role;
grant execute on function public.cera_assert_publisher(text, uuid) to service_role;
grant execute on function public.cera_assert_slug_free(uuid, text, text) to service_role;
grant execute on function public.cera_log_approval(public.cera_approvals, text, text, uuid) to service_role;
grant execute on function public.cera_replace_approval(uuid, uuid) to service_role;
grant execute on function public.cera_submit_page(jsonb, integer, timestamptz, text, uuid) to service_role;
grant execute on function public.cera_decide_approval(uuid, text, timestamptz, text, uuid) to service_role;
grant execute on function public.cera_withdraw_approval(uuid, uuid) to service_role;
grant execute on function public.cera_page_approval(uuid) to authenticated, service_role;
grant execute on function public.cera_pending_approvals() to authenticated, service_role;
grant execute on function public.cera_page_summaries(text) to authenticated, service_role;
grant execute on function public.cera_page_history(uuid, integer, integer) to authenticated, service_role;
