-- Cera: pages, revisions and media.
--
-- Model
--   cera_pages           the working copy editors change. One row per page.
--   cera_page_revisions  an immutable snapshot written on every save
--                        (replaces the theme's BAK meta keys). The live
--                        version of a page is the revision with is_published.
--   cera_media           metadata for files in the cera-media Storage bucket.
--
-- Saving a draft never changes the live site; publishing points the page at
-- a new revision. Rolling back = publishing an older revision's content.
--
-- Access
--   Roles come from the user's app_metadata.cera_role: admin | editor | viewer.
--   app_metadata can only be set with the service role, so users can't promote
--   themselves.
--   Reads: anyone can read published revisions; staff can read everything.
--   Writes: never directly from a browser. The app server validates the page
--   (preparePageForSave) and calls cera_save_page with the service role.
--   The function checks the user's role again.

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */

create table public.cera_pages (
  id            uuid primary key default gen_random_uuid(),
  content_type  text not null,
  slug          text not null,
  title         text not null default '',
  boxes         jsonb not null default '{}'::jsonb,
  panels        jsonb not null default '[]'::jsonb,
  -- Optimistic locking: a save must name the version it was based on.
  version       integer not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id) on delete set null,
  constraint cera_pages_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint cera_pages_boxes_object check (jsonb_typeof(boxes) = 'object'),
  constraint cera_pages_panels_array check (jsonb_typeof(panels) = 'array'),
  constraint cera_pages_slug_unique unique (content_type, slug)
);

create table public.cera_page_revisions (
  id            uuid primary key default gen_random_uuid(),
  page_id       uuid not null references public.cera_pages (id) on delete cascade,
  page_version  integer not null,
  kind          text not null check (kind in ('draft', 'publish')),
  content_type  text not null,
  slug          text not null,
  title         text not null,
  boxes         jsonb not null,
  panels        jsonb not null,
  is_published  boolean not null default false,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users (id) on delete set null,
  constraint cera_page_revisions_version_unique unique (page_id, page_version)
);

-- At most one live revision per page, and live slugs are unique per content type.
create unique index cera_page_revisions_one_published
  on public.cera_page_revisions (page_id) where is_published;
create unique index cera_page_revisions_published_slug
  on public.cera_page_revisions (content_type, slug) where is_published;
create index cera_page_revisions_page on public.cera_page_revisions (page_id, page_version desc);

create table public.cera_media (
  id          uuid primary key default gen_random_uuid(),
  -- Object path inside the cera-media bucket.
  path        text not null unique,
  kind        text not null default 'image' check (kind in ('image', 'video', 'embed')),
  mime_type   text,
  alt         text,
  width       integer,
  height      integer,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null
);

/* ------------------------------------------------------------------ */
/* Roles and row-level security                                        */
/* ------------------------------------------------------------------ */

create function public.cera_role() returns text
language sql stable
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'cera_role', '')
$$;

alter table public.cera_pages enable row level security;
alter table public.cera_page_revisions enable row level security;
alter table public.cera_media enable row level security;

-- No write grants for browser roles: all writes go through cera_save_page.
revoke insert, update, delete, truncate on public.cera_pages, public.cera_page_revisions, public.cera_media
  from anon, authenticated;
grant select on public.cera_pages, public.cera_page_revisions, public.cera_media to anon, authenticated;

create policy "staff read pages" on public.cera_pages
  for select to authenticated
  using (public.cera_role() in ('admin', 'editor', 'viewer'));

create policy "anyone reads published revisions" on public.cera_page_revisions
  for select to anon, authenticated
  using (is_published);

create policy "staff read all revisions" on public.cera_page_revisions
  for select to authenticated
  using (public.cera_role() in ('admin', 'editor', 'viewer'));

-- Files in the bucket are public, so their metadata is too.
create policy "anyone reads media" on public.cera_media
  for select to anon, authenticated
  using (true);

/* ------------------------------------------------------------------ */
/* Saving                                                              */
/* ------------------------------------------------------------------ */

-- Error codes (SQLSTATE) raised below, mapped by the TypeScript client:
--   42501  user may not edit pages
--   CE404  page not found
--   CE409  version conflict (someone else saved first)
--   23505  slug already used (unique violation)

-- security definer: auth.users isn't readable by every role. Only the
-- service role may call it (see grants at the bottom).
create function public.cera_assert_editor(p_user uuid) returns void
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  select coalesce(u.raw_app_meta_data ->> 'cera_role', '') into v_role
  from auth.users u where u.id = p_user;
  if v_role is null or v_role not in ('admin', 'editor') then
    raise exception 'cera: user % may not edit pages', p_user using errcode = '42501';
  end if;
end
$$;

-- Saves the working copy and writes a revision. With p_publish, that
-- revision becomes the live one.
--   p_page              { id, contentType, slug, title, boxes, panels }, already
--                       validated by preparePageForSave
--   p_expected_version  0 (or null) to create; otherwise the version the
--                       editor loaded
-- Returns { id, version, revisionId }.
create function public.cera_save_page(
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
  end if;

  return jsonb_build_object('id', v_id, 'version', v_version, 'revisionId', v_revision);
end
$$;

-- Takes a page off the live site. The working copy and revisions stay.
create function public.cera_unpublish_page(p_page_id uuid, p_user uuid) returns void
language plpgsql
set search_path = ''
as $$
begin
  perform public.cera_assert_editor(p_user);
  update public.cera_page_revisions set is_published = false where page_id = p_page_id and is_published;
end
$$;

revoke execute on function public.cera_assert_editor(uuid) from public, anon, authenticated;
revoke execute on function public.cera_save_page(jsonb, integer, boolean, uuid) from public, anon, authenticated;
revoke execute on function public.cera_unpublish_page(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cera_assert_editor(uuid) to service_role;
grant execute on function public.cera_save_page(jsonb, integer, boolean, uuid) to service_role;
grant execute on function public.cera_unpublish_page(uuid, uuid) to service_role;
