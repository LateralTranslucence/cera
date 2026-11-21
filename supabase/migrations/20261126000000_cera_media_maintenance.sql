-- Media upkeep: unfinished uploads, unused files, and replacing a file.
--
-- "Used" means the same as for deleting (cera_media_usage): the path appears
-- in a page's working copy or live version, and here also in a pending
-- scheduled version, which goes live by itself.

-- Whether any page uses this path: working copy, live or pending scheduled version.
create function public.cera_media_in_use(p_path text) returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(p_path, '') <> '' and (
    exists (select 1 from public.cera_pages p where strpos(p.boxes::text || p.panels::text, p_path) > 0)
    or exists (
      select 1 from public.cera_page_revisions r
      where (r.is_published or (r.kind = 'schedule' and r.schedule_status = 'pending'))
        and strpos(r.boxes::text || r.panels::text, p_path) > 0
    )
  )
$$;

-- Files in the bucket with no library row that no page uses, older than
-- p_older_than: uploads that never finished (the browser closed between
-- uploading and recording), or the old file after a replace once nothing
-- uses it. The caller removes them through the Storage API (cleanUpUploads).
create function public.cera_media_orphans(p_older_than interval default '1 day', p_limit integer default 500) returns text[]
language sql stable
set search_path = ''
as $$
  select coalesce(array_agg(o.name), '{}')
  from (
    select o.name
    from storage.objects o
    where o.bucket_id = 'cera-media'
      and o.created_at < now() - p_older_than
      and not exists (select 1 from public.cera_media m where m.path = o.name)
      and not public.cera_media_in_use(o.name)
    order by o.created_at
    limit greatest(p_limit, 1)
  ) o
$$;

-- Library files no page uses, newest first, older than p_before when given:
-- the Media page's "Unused" filter. Runs as the caller (staff read every page).
create function public.cera_unused_media(p_limit integer default 60, p_before timestamptz default null) returns jsonb
language sql stable
set search_path = ''
as $$
  -- Built here rather than with cera_media_json, which only the server may call.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'path', m.path, 'kind', m.kind, 'mimeType', m.mime_type, 'alt', m.alt,
    'width', m.width, 'height', m.height, 'sizeBytes', m.size_bytes, 'createdAt', m.created_at
  ) order by m.created_at desc), '[]'::jsonb)
  from (
    select m.*
    from public.cera_media m
    where (p_before is null or m.created_at < p_before)
      and not public.cera_media_in_use(m.path)
    order by m.created_at desc
    limit least(greatest(p_limit, 1), 200)
  ) m
$$;

-- A page's JSON with one file swapped for another: every media reference to
-- p_id ({ id, path, … }) gets p_media's path, kind and size (its own alt text
-- stays), and the old path in any text (images in rich text) becomes the new one.
create function public.cera_swap_media(p_value jsonb, p_id text, p_old_path text, p_media jsonb) returns jsonb
language plpgsql immutable
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  case jsonb_typeof(p_value)
    when 'object' then
      if p_value ->> 'id' = p_id and p_value ? 'path' then
        return p_value || jsonb_strip_nulls(jsonb_build_object('path', p_media -> 'path', 'kind', p_media -> 'kind', 'width', p_media -> 'width', 'height', p_media -> 'height'));
      end if;
      select coalesce(jsonb_object_agg(key, public.cera_swap_media(value, p_id, p_old_path, p_media)), '{}'::jsonb) into v_result from jsonb_each(p_value);
      return v_result;
    when 'array' then
      select coalesce(jsonb_agg(public.cera_swap_media(value, p_id, p_old_path, p_media) order by position), '[]'::jsonb) into v_result
      from jsonb_array_elements(p_value) with ordinality as element(value, position);
      return v_result;
    when 'string' then
      if strpos(p_value #>> '{}', p_old_path) > 0 then
        return to_jsonb(replace(p_value #>> '{}', p_old_path, p_media ->> 'path'));
      end if;
      return p_value;
    else
      return p_value;
  end case;
end
$$;

-- Replaces a library file with a new upload (already checked by the server):
--   p_media  { path, mimeType, width, height, sizeBytes }
-- The row keeps its id, alt text and date; its path, type and size change.
-- Every working copy, live version and pending scheduled version that uses
-- the old file is updated in place (the live site shows the new file; page
-- versions don't change, so nothing needs publishing again). Older revisions
-- keep the old path, as they do after a delete. The old object stays in
-- Storage until cleanup finds nothing using it.
-- Returns { item, oldPath, pages }. Error codes: 42501 not an editor, CE404
-- no such file, CE409 a different kind (an image for a video).
create function public.cera_replace_media(p_id uuid, p_media jsonb, p_user uuid) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row public.cera_media;
  v_old_path text;
  v_pages integer;
  v_swap jsonb;
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

  update public.cera_page_revisions
  set boxes = public.cera_swap_media(boxes, p_id::text, v_old_path, v_swap),
      panels = public.cera_swap_media(panels, p_id::text, v_old_path, v_swap)
  where (is_published or (kind = 'schedule' and schedule_status = 'pending'))
    and strpos(boxes::text || panels::text, v_old_path) > 0;

  return jsonb_build_object('item', public.cera_media_json(v_row), 'oldPath', v_old_path, 'pages', v_pages);
end
$$;

revoke execute on function public.cera_media_in_use(text) from public, anon;
revoke execute on function public.cera_media_orphans(interval, integer) from public, anon, authenticated;
revoke execute on function public.cera_unused_media(integer, timestamptz) from public, anon;
revoke execute on function public.cera_swap_media(jsonb, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.cera_replace_media(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.cera_media_in_use(text) to authenticated, service_role;
grant execute on function public.cera_media_orphans(interval, integer) to service_role;
grant execute on function public.cera_unused_media(integer, timestamptz) to authenticated, service_role;
grant execute on function public.cera_swap_media(jsonb, text, text, jsonb) to service_role;
grant execute on function public.cera_replace_media(uuid, jsonb, uuid) to service_role;
