-- DEV-031: organizations.unit_number 활성 소속대 전역 중복 방지
-- 실행 위치: linked Supabase (scout-promotion-manager)
-- 재실행 가능

do $$
begin
  if exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'organizations'
      and indexname = 'organizations_unit_number_active_uidx'
  ) then
    raise notice 'organizations_unit_number_active_uidx already exists — skip';
  else
    create unique index organizations_unit_number_active_uidx
      on public.organizations ((trim(unit_number)))
      where deleted_at is null
        and coalesce(trim(unit_number), '') <> '';
  end if;
end $$;
