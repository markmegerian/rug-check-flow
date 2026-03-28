do $$
declare
  has_client_job_access_access_token boolean;
  has_client_job_access_access_token_hash boolean;
  has_client_accounts_access_token boolean;
  has_client_accounts_access_token_hash boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'client_job_access' and column_name = 'access_token'
  ) into has_client_job_access_access_token;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'client_job_access' and column_name = 'access_token_hash'
  ) into has_client_job_access_access_token_hash;

  if has_client_job_access_access_token and has_client_job_access_access_token_hash then
    execute $sql$
      update public.client_job_access
      set access_token_hash = encode(extensions.digest(access_token, 'sha256'), 'hex')
      where access_token is not null
        and (access_token_hash is null or access_token_hash = '')
    $sql$;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'client_accounts' and column_name = 'access_token'
  ) into has_client_accounts_access_token;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'client_accounts' and column_name = 'access_token_hash'
  ) into has_client_accounts_access_token_hash;

  if has_client_accounts_access_token and has_client_accounts_access_token_hash then
    execute $sql$
      update public.client_accounts
      set access_token_hash = encode(extensions.digest(access_token, 'sha256'), 'hex')
      where access_token is not null
        and (access_token_hash is null or access_token_hash = '')
    $sql$;
  end if;
end $$;
