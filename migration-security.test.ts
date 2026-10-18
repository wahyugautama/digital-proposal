import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('./supabase/migrations/202610180002_security_hardening.sql', import.meta.url), 'utf8');
const initialMigration = readFileSync(new URL('./supabase/migrations/202610180001_initial_schema.sql', import.meta.url), 'utf8');

describe('security migration contract', () => {
  it('publishes under a row lock in one database function', () => {
    expect(migration).toContain('create or replace function public.publish_proposal');
    expect(migration).toMatch(/from public\.proposals[\s\S]*for update;/);
    expect(migration).toContain('insert into public.proposal_versions');
    expect(migration).toContain('update public.proposal_access_tokens');
    expect(migration).toContain('insert into public.proposal_access_tokens');
    expect(migration).toContain('insert into public.proposal_events');
    expect(initialMigration).toContain('unique(proposal_id, version_number)');
  });

  it('keeps publication and rate-limit functions service-role only', () => {
    expect(migration).toMatch(/revoke all on function public\.publish_proposal[\s\S]*from public, anon, authenticated;/);
    expect(migration).toMatch(/grant execute on function public\.publish_proposal[\s\S]*to service_role;/);
    expect(migration).toMatch(/revoke all on function public\.check_public_rate_limit[\s\S]*from public, anon, authenticated;/);
  });

  it('retains idempotent response submissions and active-version authorization', () => {
    expect(initialMigration).toContain('submission_id uuid not null unique');
    expect(initialMigration).toContain('active_version_id=p_version_id');
    expect(initialMigration).toMatch(/select status into current_status[\s\S]*for update;/);
  });
});
