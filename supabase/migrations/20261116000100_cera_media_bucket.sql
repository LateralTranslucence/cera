-- Public bucket for Cera media. There are no upload policies, so only the
-- service role (the app server) can write to it.
insert into storage.buckets (id, name, public)
values ('cera-media', 'cera-media', true)
on conflict (id) do nothing;
