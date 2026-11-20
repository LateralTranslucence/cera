-- Media uploads.
--
-- Browsers upload straight to Storage with a one-time signed URL that the
-- app server creates for a path it chooses (so large files never pass
-- through the server). Afterward the server checks the stored object and
-- records it with cera_add_media, which re-checks the user's role, like
-- cera_save_page.
--
-- Storage enforces the limits below on every upload, whatever the client
-- claims. SVG is left out on purpose: it can carry scripts.

update storage.buckets
set file_size_limit = 52428800, -- 50 MiB; the app sets a lower limit for images
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'video/mp4', 'video/webm']
where id = 'cera-media';

alter table public.cera_media
  add column size_bytes bigint,
  -- Lowercased path and alt text, for the media library's search.
  add column search text generated always as (lower(path || ' ' || coalesce(alt, ''))) stored,
  add constraint cera_media_path_format check (path ~ '^[a-z0-9][a-z0-9/._-]*$' and path !~ '\.\.');

create index cera_media_created_at on public.cera_media (created_at desc);

-- Records an uploaded file.
--   p_media  { path, kind, mimeType, alt, width, height, sizeBytes }
-- Returns the new row as { id, path, kind, mimeType, alt, width, height, sizeBytes, createdAt }.
create function public.cera_add_media(p_media jsonb, p_user uuid) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row public.cera_media;
begin
  perform public.cera_assert_editor(p_user);

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

  return jsonb_build_object(
    'id', v_row.id,
    'path', v_row.path,
    'kind', v_row.kind,
    'mimeType', v_row.mime_type,
    'alt', v_row.alt,
    'width', v_row.width,
    'height', v_row.height,
    'sizeBytes', v_row.size_bytes,
    'createdAt', v_row.created_at
  );
end
$$;

revoke execute on function public.cera_add_media(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.cera_add_media(jsonb, uuid) to service_role;
