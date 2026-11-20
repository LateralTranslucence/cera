-- Editing and deleting media library items.
--
-- Pages store a copy of each media reference ({ id, path, alt, ... }), so a
-- file is "in use" when its path appears in a page's working copy or in its
-- live revision. Paths are unique and carry a random part, so a text match
-- on the page JSON finds every use: fields, galleries and images in rich
-- text alike. Older revisions aren't checked; restoring one that used a
-- deleted file shows that file as missing.
--
-- The library's alt text is the default for new uses. Pages that already
-- use a file keep their own alt text, which editors change on the page.

-- A library row as the TypeScript client reads it.
create function public.cera_media_json(p_row public.cera_media) returns jsonb
language sql immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_row.id,
    'path', p_row.path,
    'kind', p_row.kind,
    'mimeType', p_row.mime_type,
    'alt', p_row.alt,
    'width', p_row.width,
    'height', p_row.height,
    'sizeBytes', p_row.size_bytes,
    'createdAt', p_row.created_at
  )
$$;

-- The pages that use a file, as [{ id, title, slug, contentType, draft, live }]:
-- draft when the working copy uses it, live when the published version does.
-- Runs as the caller, so row-level security decides which pages they see
-- (staff see all; anyone else sees only live pages).
create function public.cera_media_usage(p_path text) returns jsonb
language sql stable
set search_path = ''
as $$
  with uses as (
    select p.id, p.title, p.slug, p.content_type, true as draft, false as live
    from public.cera_pages p
    where strpos(p.boxes::text || p.panels::text, p_path) > 0
    union all
    select r.page_id, r.title, r.slug, r.content_type, false, true
    from public.cera_page_revisions r
    where r.is_published and strpos(r.boxes::text || r.panels::text, p_path) > 0
  )
  select coalesce(jsonb_agg(u order by u.title, u.slug), '[]'::jsonb)
  from (
    select id,
           -- Prefer the working copy's title and address: they're what editors see.
           (array_agg(title order by draft desc))[1] as title,
           (array_agg(slug order by draft desc))[1] as slug,
           (array_agg(content_type order by draft desc))[1] as "contentType",
           bool_or(draft) as draft,
           bool_or(live) as live
    from uses
    where coalesce(p_path, '') <> ''
    group by id
  ) u
$$;

-- Changes a file's library alt text.
--   p_media  { alt }
-- Returns the row (see cera_media_json). Error codes: 42501 not an editor,
-- CE404 no such file.
create function public.cera_update_media(p_id uuid, p_media jsonb, p_user uuid) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row public.cera_media;
begin
  perform public.cera_assert_editor(p_user);

  update public.cera_media
  set alt = nullif(btrim(p_media ->> 'alt'), '')
  where id = p_id
  returning * into v_row;
  if not found then
    raise exception 'cera: media % not found', p_id using errcode = 'CE404';
  end if;

  return public.cera_media_json(v_row);
end
$$;

-- Removes a file from the library, unless a page uses it. Returns { path }
-- so the caller can delete the object from Storage. Error codes: 42501 not
-- an editor, CE404 no such file, CE409 in use.
create function public.cera_delete_media(p_id uuid, p_user uuid) returns jsonb
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
  if jsonb_array_length(public.cera_media_usage(v_path)) > 0 then
    raise exception 'cera: media % is used on a page', p_id using errcode = 'CE409';
  end if;

  delete from public.cera_media where id = p_id;
  return jsonb_build_object('path', v_path);
end
$$;

revoke execute on function public.cera_media_json(public.cera_media) from public, anon, authenticated;
revoke execute on function public.cera_media_usage(text) from public, anon;
revoke execute on function public.cera_update_media(uuid, jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.cera_delete_media(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cera_media_json(public.cera_media) to service_role;
grant execute on function public.cera_media_usage(text) to authenticated, service_role;
grant execute on function public.cera_update_media(uuid, jsonb, uuid) to service_role;
grant execute on function public.cera_delete_media(uuid, uuid) to service_role;
