-- Form submissions.
--
-- Forms themselves are pages of content type 'cera_form' (cera_pages and
-- revisions, like any page). What visitors send is stored here, and only
-- for the live version of a form. The app server checks each submission
-- against that version (checkSubmission) and adds it with the service role
-- through cera_add_submission, which also applies the per-sender rate limit.
--
-- Submissions hold visitors' personal data: only admins and editors can read
-- or delete them, and nothing else can write them. They're kept until someone
-- deletes them. A form can't be deleted while it has submissions.
--
-- Error codes: 42501 not allowed, CE404 form not live (or not this version),
-- CE429 too many submissions from this sender, 23001 (on deleting a form)
-- it still has submissions.

create table public.cera_form_submissions (
  id           uuid primary key default gen_random_uuid(),
  form_id      uuid not null references public.cera_pages (id) on delete restrict,
  -- The live version it was sent to, so its labels and fields can be traced.
  form_version integer not null,
  -- [{ name, label, value }] in form order; value is a string or an array of strings.
  data         jsonb not null,
  -- The first valid email address in it, for the list.
  email        text,
  -- The page the form was on (path only).
  page_path    text,
  -- A keyed hash of the sender's IP address, for the rate limit. Never the address itself.
  sender_key   text not null,
  created_at   timestamptz not null default now(),
  constraint cera_form_submissions_data_array check (jsonb_typeof(data) = 'array')
);

create index cera_form_submissions_form on public.cera_form_submissions (form_id, created_at desc);
create index cera_form_submissions_recent on public.cera_form_submissions (created_at desc);
create index cera_form_submissions_sender on public.cera_form_submissions (sender_key, created_at desc);

alter table public.cera_form_submissions enable row level security;
revoke all on public.cera_form_submissions from anon, authenticated;
grant select on public.cera_form_submissions to authenticated;

create policy "editors read submissions" on public.cera_form_submissions
  for select to authenticated
  using (public.cera_role() in ('admin', 'editor'));

/* ------------------------------------------------------------------ */
/* Adding                                                              */
/* ------------------------------------------------------------------ */

-- Stores a checked submission to the live version p_version of a form,
-- unless this sender has already had p_max accepted in the last p_window.
-- Returns the new id.
create function public.cera_add_submission(
  p_form_id uuid,
  p_version integer,
  p_data jsonb,
  p_email text,
  p_page_path text,
  p_sender_key text,
  p_max integer default 5,
  p_window interval default interval '10 minutes'
) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1 from public.cera_page_revisions
    where page_id = p_form_id and page_version = p_version and is_published and content_type = 'cera_form'
  ) then
    raise exception 'cera: form % is not live at version %', p_form_id, p_version using errcode = 'CE404';
  end if;

  -- One sender at a time, so two quick posts can't both slip under the limit.
  perform pg_advisory_xact_lock(hashtext('cera_form_sender:' || p_sender_key));
  if (
    select count(*) from public.cera_form_submissions
    where sender_key = p_sender_key and created_at > now() - p_window
  ) >= p_max then
    raise exception 'cera: too many submissions from this sender' using errcode = 'CE429';
  end if;

  insert into public.cera_form_submissions (form_id, form_version, data, email, page_path, sender_key)
  values (p_form_id, p_version, p_data, nullif(btrim(p_email), ''), nullif(btrim(p_page_path), ''), p_sender_key)
  returning id into v_id;
  return v_id;
end
$$;

/* ------------------------------------------------------------------ */
/* Deleting                                                            */
/* ------------------------------------------------------------------ */

-- Deletes the given submissions, or with p_form_id and no ids, all of that
-- form's. Admins and editors only. Returns how many were deleted.
create function public.cera_delete_submissions(p_ids uuid[], p_form_id uuid, p_user uuid) returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform public.cera_assert_editor(p_user);
  if p_ids is not null then
    delete from public.cera_form_submissions where id = any (p_ids) and (p_form_id is null or form_id = p_form_id);
  elsif p_form_id is not null then
    delete from public.cera_form_submissions where form_id = p_form_id;
  else
    return 0;
  end if;
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

/* ------------------------------------------------------------------ */
/* Counts for the admin                                                */
/* ------------------------------------------------------------------ */

-- Submissions per form, for the Forms list. Runs as the caller (row-level
-- security), so viewers get none.
create function public.cera_submission_counts() returns table (form_id uuid, total integer, latest timestamptz)
language sql stable
set search_path = ''
as $$
  select s.form_id, count(*)::integer, max(s.created_at)
  from public.cera_form_submissions s
  group by s.form_id
$$;

-- Submissions newest first, p_limit at a time, older than p_before when
-- given, for one form or all. Runs as the caller (row-level security).
create function public.cera_list_submissions(p_form_id uuid default null, p_before timestamptz default null, p_limit integer default 50)
returns table (id uuid, form_id uuid, form_version integer, data jsonb, email text, page_path text, created_at timestamptz)
language sql stable
set search_path = ''
as $$
  select s.id, s.form_id, s.form_version, s.data, s.email, s.page_path, s.created_at
  from public.cera_form_submissions s
  where (p_form_id is null or s.form_id = p_form_id) and (p_before is null or s.created_at < p_before)
  order by s.created_at desc, s.id
  limit least(greatest(coalesce(p_limit, 50), 1), 500)
$$;

revoke execute on function public.cera_add_submission(uuid, integer, jsonb, text, text, text, integer, interval) from public, anon, authenticated;
revoke execute on function public.cera_delete_submissions(uuid[], uuid, uuid) from public, anon, authenticated;
revoke execute on function public.cera_submission_counts() from public, anon;
revoke execute on function public.cera_list_submissions(uuid, timestamptz, integer) from public, anon;
grant execute on function public.cera_list_submissions(uuid, timestamptz, integer) to authenticated, service_role;
grant execute on function public.cera_add_submission(uuid, integer, jsonb, text, text, text, integer, interval) to service_role;
grant execute on function public.cera_delete_submissions(uuid[], uuid, uuid) to service_role;
grant execute on function public.cera_submission_counts() to authenticated, service_role;
