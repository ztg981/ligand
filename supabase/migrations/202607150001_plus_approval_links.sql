-- ChatGPT Plus can prepare read-only drafts but cannot invoke MCP write tools.
-- These narrow RPCs let the signed-in Ligand user inspect and approve their
-- own short-lived draft inside Ligand. They never accept operation payloads.

create or replace function public.assistant_get_change_preview(
  p_confirmation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_claims jsonb := auth.jwt();
  v_preview public.assistant_change_previews%rowtype;
  v_status text;
begin
  if v_user_id is null
     or v_claims -> 'ligand_mcp' is not distinct from 'true'::jsonb then
    raise exception 'direct Ligand sign-in required' using errcode = '28000';
  end if;
  if p_confirmation_id is null then
    raise exception 'invalid confirmation' using errcode = '22023';
  end if;

  select previews.* into v_preview
    from public.assistant_change_previews as previews
    join public.assistant_oauth_clients as clients
      on clients.client_id = previews.client_id
     and clients.allowed_user_id = previews.user_id
     and clients.enabled = true
    join public.assistant_access as access
      on access.user_id = previews.user_id
     and access.enabled = true
   where previews.id = p_confirmation_id
     and previews.user_id = v_user_id;
  if not found then
    raise exception 'confirmation not found' using errcode = 'P0002';
  end if;

  v_status := case
    when v_preview.applied_at is not null then 'applied'
    when v_preview.expires_at <= clock_timestamp() then 'expired'
    else 'pending'
  end;
  return jsonb_build_object(
    'confirmationId', v_preview.id,
    'expiresAt', v_preview.expires_at,
    'changeCount', jsonb_array_length(v_preview.summary),
    'summary', v_preview.summary,
    'status', v_status
  );
end;
$$;

revoke all on function public.assistant_get_change_preview(uuid)
  from public, anon;
grant execute on function public.assistant_get_change_preview(uuid)
  to authenticated;

create or replace function public.assistant_apply_changes_direct(
  p_confirmation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_original_claims jsonb := auth.jwt();
  v_oauth_claims jsonb;
  v_preview public.assistant_change_previews%rowtype;
  v_resource_url text;
  v_result jsonb;
begin
  if v_user_id is null
     or v_original_claims -> 'ligand_mcp' is not distinct from 'true'::jsonb then
    raise exception 'direct Ligand sign-in required' using errcode = '28000';
  end if;
  if p_confirmation_id is null then
    raise exception 'invalid confirmation' using errcode = '22023';
  end if;

  select previews.* into v_preview
    from public.assistant_change_previews as previews
    join public.assistant_oauth_clients as clients
      on clients.client_id = previews.client_id
     and clients.allowed_user_id = previews.user_id
     and clients.enabled = true
    join public.assistant_access as access
      on access.user_id = previews.user_id
     and access.enabled = true
   where previews.id = p_confirmation_id
     and previews.user_id = v_user_id;
  if not found then
    raise exception 'confirmation not found' using errcode = 'P0002';
  end if;
  select clients.resource_url into v_resource_url
    from public.assistant_oauth_clients as clients
   where clients.client_id = v_preview.client_id
     and clients.allowed_user_id = v_user_id
     and clients.enabled = true;

  -- Re-enter the existing, fully validated atomic apply path as the exact
  -- OAuth client that created this user's draft. The original direct claims
  -- are restored before returning, including on errors.
  v_oauth_claims := v_original_claims || jsonb_build_object(
    'sub', v_user_id::text,
    'role', 'authenticated',
    'client_id', v_preview.client_id,
    'aud', v_resource_url,
    'resource', v_resource_url,
    'scope', 'openid',
    'ligand_mcp', true
  );
  perform set_config('request.jwt.claims', v_oauth_claims::text, true);
  begin
    v_result := public.assistant_apply_changes(
      p_confirmation_id,
      'ligand-direct-approval'
    );
  exception when others then
    perform set_config('request.jwt.claims', v_original_claims::text, true);
    raise;
  end;
  perform set_config('request.jwt.claims', v_original_claims::text, true);
  return v_result;
end;
$$;

revoke all on function public.assistant_apply_changes_direct(uuid)
  from public, anon;
grant execute on function public.assistant_apply_changes_direct(uuid)
  to authenticated;
