-- DEV-031 현재 함수/owner/ACL/트리거 통합 백업 조회
-- Supabase SQL Editor는 여러 SELECT 중 마지막 결과만 CSV로 저장할 수 있으므로
-- 모든 복원 자료를 하나의 결과셋(restore_sql)으로 반환한다.
-- 이번 작업에서는 실행하지 않는다.

with expected_function_names(function_name) as (
  values
    ('calculate_rank_available_date'),
    ('review_scout_promotion'),
    ('review_scout_promotion_core'),
    ('approve_scout_promotion'),
    ('approve_initial_beginner_rank'),
    ('create_scout_badge_record'),
    ('update_scout_badge_record'),
    ('archive_scout_badge_record'),
    ('archive_promotion_review'),
    ('cleanup_promotion_reviews')
),
target_functions as (
  select
    p.oid,
    p.proname,
    p.proowner,
    p.proacl,
    n.nspname,
    format(
      '%I.%I(%s)',
      n.nspname,
      p.proname,
      pg_get_function_identity_arguments(p.oid)
    ) as function_signature
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join expected_function_names expected on expected.function_name = p.proname
  where n.nspname = 'public'
    and p.prokind = 'f'
),
function_acl as (
  select
    target.oid,
    target.proname,
    target.function_signature,
    acl.grantee,
    acl.privilege_type,
    acl.is_grantable
  from target_functions target
  cross join lateral aclexplode(
    coalesce(target.proacl, acldefault('f', target.proowner))
  ) acl
),
backup_rows as (
  select
    50 as section_order,
    expected.function_name as object_name,
    null::text as object_identity,
    'EXPECTED_FUNCTION_MISSING'::text as artifact_type,
    format('-- 적용 전 함수가 존재하지 않음: public.%I', expected.function_name) as restore_sql
  from expected_function_names expected
  where not exists (
    select 1
    from target_functions target
    where target.proname = expected.function_name
  )

  union all

  select
    100 as section_order,
    target.proname as object_name,
    target.function_signature as object_identity,
    'FUNCTION_DEFINITION'::text as artifact_type,
    pg_get_functiondef(target.oid) as restore_sql
  from target_functions target

  union all

  select
    200,
    target.proname,
    target.function_signature,
    'FUNCTION_OWNER',
    format(
      'ALTER FUNCTION %s OWNER TO %I;',
      target.function_signature,
      pg_get_userbyid(target.proowner)
    )
  from target_functions target

  union all

  select
    300,
    target.proname,
    target.function_signature,
    'ACL_RESET',
    format(
      'REVOKE ALL PRIVILEGES ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role;',
      target.function_signature
    )
  from target_functions target

  union all

  select distinct
    310,
    acl_row.proname,
    acl_row.function_signature,
    'ACL_REVOKE_EXISTING_GRANTEE',
    format(
      'REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %s;',
      acl_row.function_signature,
      case
        when acl_row.grantee = 0 then 'PUBLIC'
        else quote_ident(pg_get_userbyid(acl_row.grantee))
      end
    )
  from function_acl acl_row

  union all

  select
    400,
    acl_row.proname,
    acl_row.function_signature,
    'ACL_GRANT',
    format(
      'GRANT %s ON FUNCTION %s TO %s%s;',
      acl_row.privilege_type,
      acl_row.function_signature,
      case
        when acl_row.grantee = 0 then 'PUBLIC'
        else quote_ident(pg_get_userbyid(acl_row.grantee))
      end,
      case when acl_row.is_grantable then ' WITH GRANT OPTION' else '' end
    )
  from function_acl acl_row

  union all

  select
    500,
    trigger_row.tgname,
    format('%I.%I', trigger_ns.nspname, relation.relname),
    'TRIGGER_DROP',
    format(
      'DROP TRIGGER IF EXISTS %I ON %I.%I;',
      trigger_row.tgname,
      trigger_ns.nspname,
      relation.relname
    )
  from pg_trigger trigger_row
  join pg_class relation on relation.oid = trigger_row.tgrelid
  join pg_namespace trigger_ns on trigger_ns.oid = relation.relnamespace
  where trigger_ns.nspname = 'public'
    and relation.relname = 'promotion_reviews'
    and not trigger_row.tgisinternal

  union all

  select
    510,
    trigger_row.tgname,
    format('%I.%I', trigger_ns.nspname, relation.relname),
    'TRIGGER_DEFINITION',
    pg_get_triggerdef(trigger_row.oid, true) || ';'
  from pg_trigger trigger_row
  join pg_class relation on relation.oid = trigger_row.tgrelid
  join pg_namespace trigger_ns on trigger_ns.oid = relation.relnamespace
  where trigger_ns.nspname = 'public'
    and relation.relname = 'promotion_reviews'
    and not trigger_row.tgisinternal
)
select
  section_order,
  object_name,
  object_identity,
  artifact_type,
  restore_sql
from backup_rows
order by section_order, object_name, object_identity, restore_sql;
