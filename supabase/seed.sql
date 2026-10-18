-- Run after creating the first Supabase Auth user. Replace the values below.
-- insert into public.profiles (id, email, full_name)
-- values ('AUTH_USER_UUID', 'owner@sandikala.studio', 'Sandikala Admin');

insert into public.studio_settings (studio_name, default_currency, default_terms)
select 'Sandikala Studio', 'USD', 'This proposal is valid until its stated expiration date.'
where not exists (select 1 from public.studio_settings);
