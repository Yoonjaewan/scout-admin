-- DEV-032 진급 판정/인가 업무 날짜 시간대 수정안
-- 상태: 검토/실행용 SQL. 이번 작업에서는 실행하지 않는다.
-- 함수 본문을 교체하지 않고 함수 실행 시간대만 대한민국 표준시로 고정한다.

alter function public.review_scout_promotion(uuid, date)
  set timezone to 'Asia/Seoul';

alter function public.approve_scout_promotion(uuid, date, text)
  set timezone to 'Asia/Seoul';

-- 확인 기준:
-- 1. 대한민국 표준시 기준 오늘 날짜는 허용
-- 2. 대한민국 표준시 기준 내일 이후 날짜는 차단
-- 3. 기존 search_path, owner, ACL과 함수 본문은 변경하지 않음
--
-- 적용 후 함수 설정 확인:
-- select
--   p.oid::regprocedure as function_signature,
--   p.proconfig
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and p.proname in ('review_scout_promotion', 'approve_scout_promotion');
