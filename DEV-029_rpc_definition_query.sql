-- DEV-029: Supabase 진급 판정 RPC 및 관련 DB 객체 원문 조회
-- 실행 위치: Supabase SQL Editor
-- 주의: 이 파일은 SELECT 문만 포함하며 DB 객체나 데이터를 변경하지 않습니다.

-- 1. review_scout_promotion / approve_scout_promotion 전체 오버로드와 원문
select
  function_ns.nspname as schema_name,
  p.proname as function_name,
  p.oid::regprocedure::text as function_signature,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type,
  l.lanname as language_name,
  p.prosecdef as security_definer,
  p.provolatile as volatility,
  p.prokind as object_kind,
  pg_get_userbyid(p.proowner) as owner_name,
  pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace function_ns on function_ns.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where p.proname in (
  'review_scout_promotion',
  'approve_scout_promotion'
)
and p.prokind in ('f', 'p')
order by function_ns.nspname, p.proname, p.oid::regprocedure::text;

-- 2. 관련 진급 RPC 목록과 원문
select
  function_ns.nspname as schema_name,
  p.proname as function_name,
  p.oid::regprocedure::text as function_signature,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type,
  p.prosecdef as security_definer,
  pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace function_ns on function_ns.oid = p.pronamespace
where p.proname in (
  'review_scout_promotion',
  'approve_scout_promotion',
  'approve_initial_beginner_rank'
)
and p.prokind in ('f', 'p')
order by function_ns.nspname, p.proname, p.oid::regprocedure::text;

-- 3. 함수 실행 권한
select
  routine_schema,
  routine_name,
  specific_name,
  grantee,
  privilege_type,
  is_grantable
from information_schema.routine_privileges
where routine_name in (
  'review_scout_promotion',
  'approve_scout_promotion',
  'approve_initial_beginner_rank'
)
order by routine_schema, routine_name, specific_name, grantee;

-- 4. 판정 관련 테이블의 실제 컬럼, 타입, nullable, 기본값
select
  c.table_schema,
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default
from information_schema.columns c
where c.table_schema not in ('pg_catalog', 'information_schema')
and c.table_name in (
  'promotion_reviews',
  'promotion_badge_usages',
  'scout_rank_histories',
  'scout_badges',
  'scout_program_completions',
  'program_completions',
  'meetings',
  'attendance_records',
  'attendance',
  'ranks',
  'rank_requirements',
  'advancement_requirements',
  'rank_required_badges',
  'badges',
  'organizations'
)
order by c.table_schema, c.table_name, c.ordinal_position;

-- 5. PK, FK, UNIQUE, CHECK 제약조건
select
  constraint_ns.nspname as schema_name,
  cls.relname as table_name,
  con.conname as constraint_name,
  con.contype as constraint_type,
  pg_get_constraintdef(con.oid, true) as constraint_definition
from pg_constraint con
join pg_class cls on cls.oid = con.conrelid
join pg_namespace constraint_ns on constraint_ns.oid = cls.relnamespace
where cls.relname in (
  'promotion_reviews',
  'promotion_badge_usages',
  'scout_rank_histories',
  'scout_badges',
  'scout_program_completions',
  'program_completions',
  'meetings',
  'attendance_records',
  'attendance',
  'ranks',
  'rank_requirements',
  'advancement_requirements',
  'rank_required_badges',
  'badges',
  'organizations'
)
order by constraint_ns.nspname, cls.relname, con.contype, con.conname;

-- 6. 관련 테이블 인덱스
select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where tablename in (
  'promotion_reviews',
  'promotion_badge_usages',
  'scout_rank_histories',
  'scout_badges',
  'scout_program_completions',
  'program_completions',
  'meetings',
  'attendance_records',
  'attendance',
  'ranks',
  'rank_requirements',
  'advancement_requirements',
  'rank_required_badges',
  'badges',
  'organizations'
)
order by schemaname, tablename, indexname;

-- 7. 관련 테이블 트리거와 트리거 함수 원문
select
  table_ns.nspname as table_schema,
  table_cls.relname as table_name,
  trg.tgname as trigger_name,
  pg_get_triggerdef(trg.oid, true) as trigger_definition,
  fn_ns.nspname as function_schema,
  fn.proname as trigger_function_name,
  fn.oid::regprocedure::text as trigger_function_signature,
  pg_get_functiondef(fn.oid) as trigger_function_definition
from pg_trigger trg
join pg_class table_cls on table_cls.oid = trg.tgrelid
join pg_namespace table_ns on table_ns.oid = table_cls.relnamespace
join pg_proc fn on fn.oid = trg.tgfoid
join pg_namespace fn_ns on fn_ns.oid = fn.pronamespace
where not trg.tgisinternal
and table_cls.relname in (
  'promotion_reviews',
  'promotion_badge_usages',
  'scout_rank_histories',
  'scout_badges',
  'scout_program_completions',
  'program_completions',
  'meetings',
  'attendance_records',
  'attendance',
  'ranks',
  'rank_requirements',
  'advancement_requirements',
  'rank_required_badges',
  'badges',
  'organizations'
)
order by table_ns.nspname, table_cls.relname, trg.tgname;

-- 8. promotion_reviews / promotion_badge_usages / scout_rank_histories RLS 상태
select
  relation_ns.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as row_level_security_enabled,
  c.relforcerowsecurity as row_level_security_forced
from pg_class c
join pg_namespace relation_ns on relation_ns.oid = c.relnamespace
where c.relkind in ('r', 'p')
and c.relname in (
  'promotion_reviews',
  'promotion_badge_usages',
  'scout_rank_histories'
)
order by relation_ns.nspname, c.relname;

-- 9. promotion_reviews / promotion_badge_usages / scout_rank_histories 정책
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual as using_expression,
  with_check as with_check_expression
from pg_policies
where tablename in (
  'promotion_reviews',
  'promotion_badge_usages',
  'scout_rank_histories'
)
order by schemaname, tablename, policyname;

-- 10. 관련 테이블 권한
select
  table_schema,
  table_name,
  grantee,
  privilege_type,
  is_grantable
from information_schema.role_table_grants
where table_name in (
  'promotion_reviews',
  'promotion_badge_usages',
  'scout_rank_histories'
)
order by table_schema, table_name, grantee, privilege_type;

-- 11. 관련 객체명을 본문에서 참조하는 추가 함수 탐색
-- 동적 SQL은 이 검색에 잡히지 않을 수 있습니다.
select
  function_ns.nspname as schema_name,
  p.proname as function_name,
  p.oid::regprocedure::text as function_signature,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type,
  pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace function_ns on function_ns.oid = p.pronamespace
where p.prokind in ('f', 'p')
and function_ns.nspname not in ('pg_catalog', 'information_schema')
and (
  pg_get_functiondef(p.oid) ilike '%promotion_reviews%'
  or pg_get_functiondef(p.oid) ilike '%promotion_badge_usages%'
  or pg_get_functiondef(p.oid) ilike '%scout_rank_histories%'
  or pg_get_functiondef(p.oid) ilike '%review_scout_promotion%'
  or pg_get_functiondef(p.oid) ilike '%approve_scout_promotion%'
)
order by function_ns.nspname, p.proname, p.oid::regprocedure::text;
