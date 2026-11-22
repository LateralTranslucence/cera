-- Confirmation emails (theme: devo_form_confirmation_allowed).
--
-- A form can email the visitor a confirmation at the address they typed, so
-- anyone could make it email a stranger. To keep that from being abused, a
-- confirmation goes out at most once per address per p_window (a day), and
-- at most p_hourly_max (50) an hour across the site. cera_claim_confirmation
-- checks both and records the send in one step.

alter table public.cera_form_submissions add column confirmation_sent_at timestamptz;
create index cera_form_submissions_confirmations
  on public.cera_form_submissions (confirmation_sent_at) where confirmation_sent_at is not null;

create function public.cera_claim_confirmation(p_submission uuid, p_window interval default '1 day', p_hourly_max integer default 50) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_email text;
begin
  select lower(email) into v_email from public.cera_form_submissions where id = p_submission;
  if v_email is null or v_email = '' then
    return false;
  end if;
  -- One claim at a time, so two submissions can't both pass the checks.
  perform pg_advisory_xact_lock(hashtext('cera_claim_confirmation'));
  if exists (
    select 1 from public.cera_form_submissions
    where lower(email) = v_email and confirmation_sent_at > now() - p_window
  ) then
    return false;
  end if;
  if p_hourly_max > 0 and (
    select count(*) from public.cera_form_submissions where confirmation_sent_at > now() - interval '1 hour'
  ) >= p_hourly_max then
    return false;
  end if;
  update public.cera_form_submissions set confirmation_sent_at = now() where id = p_submission;
  return true;
end
$$;

revoke execute on function public.cera_claim_confirmation(uuid, interval, integer) from public, anon, authenticated;
grant execute on function public.cera_claim_confirmation(uuid, interval, integer) to service_role;
