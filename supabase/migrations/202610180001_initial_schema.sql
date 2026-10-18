create extension if not exists pgcrypto;

create type public.proposal_status as enum ('draft','published','viewed','changes_requested','accepted','declined','expired','archived');
create type public.proposal_type as enum ('quick','full');
create type public.response_type as enum ('accepted','changes_requested','declined');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique, full_name text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.studio_settings (
  id uuid primary key default gen_random_uuid(), studio_name text not null default 'Sandikala Studio',
  email text, address text, default_currency text not null default 'USD' check (default_currency in ('USD','IDR')),
  default_terms text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.clients (
  id uuid primary key default gen_random_uuid(), name text not null, company text, email text not null, phone text, notes text,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz
);
create table public.proposal_templates (
  id uuid primary key default gen_random_uuid(), name text not null, description text not null default '', proposal_type public.proposal_type not null,
  document jsonb not null, is_system boolean not null default false, created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.proposals (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id), proposal_number text not null unique,
  project_name text not null, proposal_type public.proposal_type not null, status public.proposal_status not null default 'draft',
  currency text not null check (currency in ('USD','IDR')), total_minor bigint not null default 0 check(total_minor >= 0), draft_document jsonb not null,
  active_version_id uuid, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz
);
create table public.proposal_versions (
  id uuid primary key default gen_random_uuid(), proposal_id uuid not null references public.proposals(id) on delete cascade,
  version_number integer not null check(version_number > 0), snapshot jsonb not null, total_minor bigint not null check(total_minor >= 0),
  published_at timestamptz not null default now(), published_by uuid not null references public.profiles(id), accepted_at timestamptz,
  unique(proposal_id, version_number)
);
alter table public.proposals add constraint proposals_active_version_fk foreign key(active_version_id) references public.proposal_versions(id);
create table public.proposal_access_tokens (
  id uuid primary key default gen_random_uuid(), proposal_id uuid not null references public.proposals(id) on delete cascade,
  version_id uuid not null references public.proposal_versions(id) on delete cascade, token_hash text not null unique,
  token_hint text not null, encrypted_token text, expires_at timestamptz not null, revoked_at timestamptz, created_at timestamptz not null default now(), last_accessed_at timestamptz
);
create table public.proposal_events (
  id bigint generated always as identity primary key, proposal_id uuid not null references public.proposals(id) on delete cascade,
  version_id uuid references public.proposal_versions(id) on delete set null, event_type text not null,
  occurred_at timestamptz not null default now(), metadata jsonb not null default '{}'::jsonb
);
create table public.proposal_responses (
  id uuid primary key default gen_random_uuid(), proposal_id uuid not null references public.proposals(id) on delete cascade,
  version_id uuid not null references public.proposal_versions(id), response_type public.response_type not null,
  name text, email text, message text, agreed boolean not null default false, submission_id uuid not null unique,
  accepted_terms jsonb, created_at timestamptz not null default now()
);

create index proposals_client_idx on public.proposals(client_id);
create index proposals_status_updated_idx on public.proposals(status, updated_at desc);
create index versions_proposal_idx on public.proposal_versions(proposal_id, version_number desc);
create index events_proposal_type_idx on public.proposal_events(proposal_id, event_type, occurred_at desc);
create index responses_proposal_idx on public.proposal_responses(proposal_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.studio_settings enable row level security;
alter table public.clients enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_versions enable row level security;
alter table public.proposal_templates enable row level security;
alter table public.proposal_access_tokens enable row level security;
alter table public.proposal_events enable row level security;
alter table public.proposal_responses enable row level security;

create policy "admins read own profile" on public.profiles for select to authenticated using (id = auth.uid());
-- Confidential tables intentionally have no anon/authenticated policies. Server routes use the service role after allowlist authorization.

create or replace function public.accept_proposal(
  p_proposal_id uuid, p_version_id uuid, p_submission_id uuid, p_name text, p_email text, p_terms jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare response_id uuid; current_status public.proposal_status;
begin
  select status into current_status from proposals where id = p_proposal_id for update;
  if current_status in ('accepted','declined') then raise exception 'Proposal already has a final response'; end if;
  if not exists(select 1 from proposals where id=p_proposal_id and active_version_id=p_version_id) then raise exception 'Version is not active'; end if;
  insert into proposal_responses(proposal_id,version_id,response_type,name,email,agreed,submission_id,accepted_terms)
  values(p_proposal_id,p_version_id,'accepted',p_name,p_email,true,p_submission_id,p_terms) returning id into response_id;
  update proposal_versions set accepted_at=now() where id=p_version_id and accepted_at is null;
  update proposals set status='accepted',updated_at=now() where id=p_proposal_id;
  insert into proposal_events(proposal_id,version_id,event_type,metadata) values(p_proposal_id,p_version_id,'accepted',jsonb_build_object('response_id',response_id));
  return response_id;
end $$;
revoke all on function public.accept_proposal(uuid,uuid,uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.accept_proposal(uuid,uuid,uuid,text,text,jsonb) to service_role;

create or replace function public.respond_to_proposal(
  p_proposal_id uuid, p_version_id uuid, p_submission_id uuid, p_response_type public.response_type, p_message text
) returns uuid language plpgsql security definer set search_path = public as $$
declare response_id uuid; current_status public.proposal_status;
begin
  if p_response_type = 'accepted' then raise exception 'Use acceptance function'; end if;
  select status into current_status from proposals where id = p_proposal_id for update;
  if current_status in ('accepted','declined') then raise exception 'Proposal already has a final response'; end if;
  if not exists(select 1 from proposals where id=p_proposal_id and active_version_id=p_version_id) then raise exception 'Version is not active'; end if;
  insert into proposal_responses(proposal_id,version_id,response_type,message,submission_id)
  values(p_proposal_id,p_version_id,p_response_type,p_message,p_submission_id) returning id into response_id;
  update proposals set status=case when p_response_type='declined' then 'declined' else 'changes_requested' end,updated_at=now() where id=p_proposal_id;
  insert into proposal_events(proposal_id,version_id,event_type,metadata) values(p_proposal_id,p_version_id,p_response_type::text,jsonb_build_object('response_id',response_id));
  return response_id;
end $$;
revoke all on function public.respond_to_proposal(uuid,uuid,uuid,public.response_type,text) from public, anon, authenticated;
grant execute on function public.respond_to_proposal(uuid,uuid,uuid,public.response_type,text) to service_role;
