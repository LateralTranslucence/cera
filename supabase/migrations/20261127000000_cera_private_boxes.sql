-- Private boxes (theme: private_fields).
--
-- Published revisions are readable by anyone, so settings visitors must
-- never see (a form's email recipients, say) can't live in `boxes`. A
-- content type names its private boxes (privateBoxes); the TypeScript save
-- sends them inside `boxes` under the reserved key "$private", and the
-- triggers below move them into their own column on the working copy, from
-- where every new revision copies them. The save functions don't change.
--
-- Visitors (anon) can't read the column: their select is granted column by
-- column. A column added to these tables later must be granted to anon
-- explicitly if visitors should read it.

alter table public.cera_pages add column private_boxes jsonb not null default '{}'::jsonb;
alter table public.cera_page_revisions add column private_boxes jsonb not null default '{}'::jsonb;

-- Working copy: take "$private" out of boxes into private_boxes. A save
-- without "$private" (a type with no private boxes) leaves them as they were.
create function public.cera_split_private_boxes() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.boxes ? '$private' then
    new.private_boxes := coalesce(nullif(new.boxes -> '$private', 'null'::jsonb), '{}'::jsonb);
    new.boxes := new.boxes - '$private';
  end if;
  return new;
end
$$;

create trigger cera_pages_private_boxes
  before insert or update of boxes on public.cera_pages
  for each row execute function public.cera_split_private_boxes();

-- A new revision records the private boxes the working copy has now (the
-- save functions insert it right after updating the working copy).
create function public.cera_revision_private_boxes() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.boxes ? '$private' then
    new.private_boxes := coalesce(nullif(new.boxes -> '$private', 'null'::jsonb), '{}'::jsonb);
    new.boxes := new.boxes - '$private';
  else
    new.private_boxes := coalesce((select p.private_boxes from public.cera_pages p where p.id = new.page_id), '{}'::jsonb);
  end if;
  return new;
end
$$;

create trigger cera_page_revisions_private_boxes
  before insert on public.cera_page_revisions
  for each row execute function public.cera_revision_private_boxes();

revoke execute on function public.cera_split_private_boxes() from public, anon, authenticated;
revoke execute on function public.cera_revision_private_boxes() from public, anon, authenticated;

-- Visitors read every column but private_boxes.
revoke select on public.cera_page_revisions from anon;
grant select (
  id, page_id, page_version, kind, content_type, slug, title, boxes, panels, is_published,
  created_at, created_by, scheduled_for, schedule_status, schedule_error, restored_from, slug_scope
) on public.cera_page_revisions to anon;

revoke select on public.cera_pages from anon;
grant select (
  id, content_type, slug, title, boxes, panels, version, created_at, updated_at, updated_by, slug_scope
) on public.cera_pages to anon;
