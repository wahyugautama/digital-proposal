-- Review and apply this migration before deploying the matching application release.
-- It is intentionally not applied automatically.

create table public.public_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null,
  attempt_count integer not null check (attempt_count > 0),
  expires_at timestamptz not null
);

alter table public.public_rate_limits enable row level security;
revoke all on table public.public_rate_limits from public, anon, authenticated;

create or replace function public.check_public_rate_limit(
  p_key_hash text,
  p_limit integer default 5,
  p_window_seconds integer default 300
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
begin
  if p_key_hash is null or length(p_key_hash) <> 64 or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'Invalid rate-limit arguments';
  end if;

  insert into public.public_rate_limits(key_hash, window_started_at, attempt_count, expires_at)
  values(p_key_hash, now(), 1, now() + make_interval(secs => p_window_seconds))
  on conflict (key_hash) do update
  set window_started_at = case
        when public.public_rate_limits.expires_at <= now() then now()
        else public.public_rate_limits.window_started_at
      end,
      attempt_count = case
        when public.public_rate_limits.expires_at <= now() then 1
        else public.public_rate_limits.attempt_count + 1
      end,
      expires_at = case
        when public.public_rate_limits.expires_at <= now() then now() + make_interval(secs => p_window_seconds)
        else public.public_rate_limits.expires_at
      end
  returning attempt_count <= p_limit into allowed;

  return allowed;
end;
$$;

revoke all on function public.check_public_rate_limit(text,integer,integer) from public, anon, authenticated;
grant execute on function public.check_public_rate_limit(text,integer,integer) to service_role;

create or replace function public.publish_proposal(
  p_proposal_id uuid,
  p_snapshot jsonb,
  p_total_minor bigint,
  p_published_by uuid,
  p_token_hash text,
  p_token_hint text,
  p_encrypted_token text,
  p_expires_at timestamptz
) returns table(version_id uuid, version_number integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_proposal public.proposals%rowtype;
  next_version integer;
  created_version_id uuid;
begin
  select * into locked_proposal
  from public.proposals
  where id = p_proposal_id
  for update;

  if not found then raise exception 'Proposal not found'; end if;
  if locked_proposal.status = 'accepted' then raise exception 'Accepted proposals cannot be republished'; end if;
  if p_snapshot is null or p_total_minor is null or p_total_minor < 0 or p_expires_at is null or p_expires_at <= now() then
    raise exception 'Invalid publication data';
  end if;
  if p_token_hash is null or length(p_token_hash) <> 64 or p_token_hint is null or length(p_token_hint) <> 8 or p_encrypted_token is null then
    raise exception 'Invalid access token data';
  end if;

  select coalesce(max(pv.version_number), 0) + 1 into next_version
  from public.proposal_versions pv
  where pv.proposal_id = p_proposal_id;

  insert into public.proposal_versions(
    proposal_id, version_number, snapshot, total_minor, published_by
  ) values (
    p_proposal_id, next_version, p_snapshot, p_total_minor, p_published_by
  ) returning id into created_version_id;

  update public.proposal_access_tokens
  set revoked_at = now()
  where proposal_id = p_proposal_id and revoked_at is null;

  insert into public.proposal_access_tokens(
    proposal_id, version_id, token_hash, token_hint, encrypted_token, expires_at
  ) values (
    p_proposal_id, created_version_id, p_token_hash, p_token_hint, p_encrypted_token, p_expires_at
  );

  update public.proposals
  set active_version_id = created_version_id,
      status = 'published',
      total_minor = p_total_minor,
      updated_at = now()
  where id = p_proposal_id;

  insert into public.proposal_events(proposal_id, version_id, event_type, metadata)
  values (p_proposal_id, created_version_id, 'published', jsonb_build_object('version', next_version));

  return query select created_version_id, next_version;
end;
$$;

revoke all on function public.publish_proposal(uuid,jsonb,bigint,uuid,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.publish_proposal(uuid,jsonb,bigint,uuid,text,text,text,timestamptz) to service_role;

create index public_rate_limits_expires_idx on public.public_rate_limits(expires_at);
