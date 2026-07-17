-- DEV-032 집회/활동 유형 추가안
-- 상태: 검토/실행용 SQL. 이번 작업에서는 실행하지 않는다.
-- PostgreSQL enum 값은 추가 후 커밋되어야 RPC 인자와 INSERT/UPDATE에서 사용할 수 있다.

alter type public.meeting_type add value if not exists 'camp';
alter type public.meeting_type add value if not exists 'training';

-- 실행 후 확인:
-- select enum_value.enumlabel
-- from pg_type enum_type
-- join pg_namespace enum_ns on enum_ns.oid = enum_type.typnamespace
-- join pg_enum enum_value on enum_value.enumtypid = enum_type.oid
-- where enum_ns.nspname = 'public'
--   and enum_type.typname = 'meeting_type'
-- order by enum_value.enumsortorder;
--
-- create_meeting_record/update_meeting_record의 p_meeting_type 인자가
-- public.meeting_type이므로 함수 본문 변경 없이 신규 값을 저장할 수 있다.
