-- DEV-031 공통 진급 판정 함수 통합 SQL 수정안
-- 상태: 설계/검토용. 이번 작업에서는 실행하지 않는다.
-- 전제: DEV-031_current_function_backup.sql 결과를 별도 보관한 뒤 적용한다.

begin;

-- ---------------------------------------------------------------------------
-- 1. 판정 스냅샷/인가 연결 컬럼
-- ---------------------------------------------------------------------------

alter table public.promotion_reviews
  add column if not exists evaluation_status text,
  add column if not exists evaluation_version integer,
  add column if not exists evaluation_context text,
  add column if not exists source_review_id uuid;

update public.promotion_reviews
set
  evaluation_status = case when final_passed then 'eligible' else 'needs_action' end,
  evaluation_version = coalesce(evaluation_version, 1),
  evaluation_context = coalesce(evaluation_context, 'review')
where evaluation_status is null
   or evaluation_version is null
   or evaluation_context is null;

alter table public.promotion_reviews
  alter column evaluation_status set default 'needs_action',
  alter column evaluation_status set not null,
  alter column evaluation_version set default 2,
  alter column evaluation_version set not null,
  alter column evaluation_context set default 'review',
  alter column evaluation_context set not null;

alter table public.promotion_reviews
  drop constraint if exists promotion_reviews_evaluation_status_check,
  add constraint promotion_reviews_evaluation_status_check
    check (evaluation_status in ('not_evaluable', 'needs_action', 'eligible')),
  drop constraint if exists promotion_reviews_evaluation_context_check,
  add constraint promotion_reviews_evaluation_context_check
    check (evaluation_context in ('review', 'approval_recheck')),
  drop constraint if exists promotion_reviews_source_review_id_fkey,
  add constraint promotion_reviews_source_review_id_fkey
    foreign key (source_review_id)
    references public.promotion_reviews(id)
    on delete set null;

create index if not exists idx_promotion_reviews_source_review_id
  on public.promotion_reviews(source_review_id);

alter table public.scout_rank_histories
  add column if not exists promotion_review_id uuid;

alter table public.scout_rank_histories
  drop constraint if exists scout_rank_histories_promotion_review_id_fkey,
  add constraint scout_rank_histories_promotion_review_id_fkey
    foreign key (promotion_review_id)
    references public.promotion_reviews(id)
    on delete set null;

create index if not exists idx_scout_rank_histories_promotion_review_id
  on public.scout_rank_histories(promotion_review_id);

-- ---------------------------------------------------------------------------
-- 2. 말일 보정 달력 개월 계산
-- ---------------------------------------------------------------------------

create or replace function public.calculate_rank_available_date(
  p_base_date date,
  p_required_months integer
)
returns date
language plpgsql
immutable
set search_path = pg_catalog, public
as $function$
declare
  v_target_month date;
  v_target_last_day date;
  v_target_day integer;
begin
  if p_base_date is null then
    return null;
  end if;

  if p_required_months is null or p_required_months < 0 then
    raise exception '필요 개월 수가 올바르지 않습니다. required_months=%', p_required_months;
  end if;

  v_target_month :=
    (
      date_trunc('month', p_base_date)::date
      + make_interval(months => p_required_months)
    )::date;

  v_target_last_day := (v_target_month + interval '1 month - 1 day')::date;
  v_target_day := least(
    extract(day from p_base_date)::integer,
    extract(day from v_target_last_day)::integer
  );

  return (v_target_month + (v_target_day - 1))::date;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. 외부에 노출하지 않는 공통 판정 함수
-- ---------------------------------------------------------------------------

create schema if not exists internal;
revoke all on schema internal from public;

create or replace function internal.evaluate_scout_promotion(
  p_scout_id uuid,
  p_evaluation_date date
)
returns table (
  organization_id uuid,
  scout_id uuid,
  evaluation_date date,
  from_rank_id uuid,
  from_rank_code text,
  to_rank_id uuid,
  to_rank_code text,
  rank_requirement_id uuid,
  base_date date,
  available_at date,
  required_months integer,
  days_remaining integer,
  period_passed boolean,
  required_badges_passed boolean,
  general_required_count integer,
  general_available_count integer,
  general_badges_passed boolean,
  selected_general_badge_ids uuid[],
  program_required boolean,
  program_passed boolean,
  selected_program_completion_id uuid,
  attendance_required boolean,
  attendance_total_count integer,
  attendance_present_count integer,
  attendance_rate numeric(5,2),
  attendance_passed boolean,
  evaluation_status text,
  final_passed boolean,
  reasons jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
set timezone = 'Asia/Seoul'
as $function$
declare
  v_scout record;
  v_from_rank record;
  v_to_rank record;
  v_requirement record;
  v_required_badge record;
  v_badge_record record;

  v_organization_id uuid;
  v_from_rank_id uuid;
  v_from_rank_code text;
  v_to_rank_id uuid;
  v_to_rank_code text;
  v_rank_requirement_id uuid;

  v_expected_to_rank_code text;
  v_expected_months integer;
  v_expected_general_count integer;
  v_program_required boolean := false;
  v_attendance_required boolean := false;

  v_target_rank_count integer := 0;
  v_requirement_count integer := 0;
  v_required_mapping_count integer := 0;

  v_base_date date;
  v_available_at date;
  v_required_months integer;
  v_days_remaining integer;
  v_period_passed boolean := false;

  v_required_badges_passed boolean := true;
  v_mugunghwa_approved_at date;

  v_general_required_count integer := 0;
  v_general_available_count integer := 0;
  v_general_badges_passed boolean := false;
  v_general_data_valid boolean := true;
  v_all_general_badge_ids uuid[] := '{}'::uuid[];
  v_selected_general_badge_ids uuid[] := '{}'::uuid[];

  v_program_passed boolean := true;
  v_selected_program_completion_id uuid;

  v_attendance_total_count integer := 0;
  v_attendance_present_count integer := 0;
  v_attendance_rate numeric(5,2) := 0;
  v_attendance_passed boolean := true;

  v_has_not_evaluable boolean := false;
  v_has_needs_action boolean := false;
  v_evaluation_status text := 'not_evaluable';
  v_final_passed boolean := false;
  v_reasons jsonb := '[]'::jsonb;
begin
  if p_scout_id is null then
    raise exception 'scout_id가 필요합니다.';
  end if;

  if p_evaluation_date is null then
    raise exception '판정 기준일이 필요합니다.';
  end if;

  select
    s.id,
    s.organization_id,
    s.joined_at,
    s.current_rank_id,
    s.beginner_course_exempted
  into v_scout
  from public.scouts s
  where s.id = p_scout_id
    and s.deleted_at is null;

  if not found then
    raise exception '대원을 찾을 수 없습니다. scout_id=%', p_scout_id;
  end if;

  v_organization_id := v_scout.organization_id;
  v_from_rank_id := v_scout.current_rank_id;

  if v_from_rank_id is null then
    v_has_not_evaluable := true;
    v_reasons := v_reasons || jsonb_build_array(
      jsonb_build_object(
        'type', 'current_rank',
        'code', 'CURRENT_RANK_MISSING',
        'message', '현재급위가 없습니다. 최초 초급 인가가 필요합니다.',
        'review_date', p_evaluation_date
      )
    );
  else
    select r.id, r.rank_code, r.rank_name
    into v_from_rank
    from public.ranks r
    where r.id = v_from_rank_id;

    if not found then
      v_has_not_evaluable := true;
      v_reasons := v_reasons || jsonb_build_array(
        jsonb_build_object(
          'type', 'current_rank',
          'code', 'CURRENT_RANK_INVALID',
          'message', '현재급위 데이터가 존재하지 않습니다.',
          'review_date', p_evaluation_date
        )
      );
    else
      v_from_rank_code := v_from_rank.rank_code;
    end if;
  end if;

  -- 명시적 급위 사슬과 고정 업무 요건
  if v_from_rank_code = 'beginner' then
    v_expected_to_rank_code := 'second';
    v_expected_months := 2;
    v_expected_general_count := 0;
  elsif v_from_rank_code = 'second' then
    v_expected_to_rank_code := 'first';
    v_expected_months := 3;
    v_expected_general_count := 1;
  elsif v_from_rank_code = 'first' then
    v_expected_to_rank_code := 'star';
    v_expected_months := 4;
    v_expected_general_count := 2;
  elsif v_from_rank_code = 'star' then
    v_expected_to_rank_code := 'mugunghwa';
    v_expected_months := 5;
    v_expected_general_count := 3;
  elsif v_from_rank_code = 'mugunghwa' then
    -- 현재 DB의 범 급위 rank_code는 tiger이다.
    v_expected_to_rank_code := 'tiger';
    v_expected_months := 6;
    v_expected_general_count := 3;
    v_program_required := true;
    v_attendance_required := true;
  elsif v_from_rank_code is not null then
    v_has_not_evaluable := true;
    v_reasons := v_reasons || jsonb_build_array(
      jsonb_build_object(
        'type', 'transition',
        'code', 'RANK_CODE_UNSUPPORTED',
        'message', '지원하지 않는 현재급위이거나 최종급위입니다.',
        'review_date', p_evaluation_date
      )
    );
  end if;

  if v_expected_to_rank_code is not null then
    select count(*)::integer
    into v_target_rank_count
    from public.ranks r
    where r.rank_code = v_expected_to_rank_code;

    if v_target_rank_count <> 1 then
      v_has_not_evaluable := true;
      v_reasons := v_reasons || jsonb_build_array(
        jsonb_build_object(
          'type', 'transition',
          'code', 'TARGET_RANK_CONFIG_INVALID',
          'message', '다음급위 설정이 없거나 복수입니다.',
          'review_date', p_evaluation_date
        )
      );
    else
      select r.id, r.rank_code, r.rank_name
      into v_to_rank
      from public.ranks r
      where r.rank_code = v_expected_to_rank_code;

      v_to_rank_id := v_to_rank.id;
      v_to_rank_code := v_to_rank.rank_code;
    end if;
  end if;

  if v_from_rank_id is not null and v_to_rank_id is not null then
    select count(*)::integer
    into v_requirement_count
    from public.rank_requirements rr
    where rr.from_rank_id = v_from_rank_id
      and rr.to_rank_id = v_to_rank_id;

    if v_requirement_count <> 1 then
      v_has_not_evaluable := true;
      v_reasons := v_reasons || jsonb_build_array(
        jsonb_build_object(
          'type', 'transition',
          'code', 'TRANSITION_RULE_INVALID',
          'message', '현재→다음 급위 전이 규칙이 없거나 복수입니다.',
          'review_date', p_evaluation_date
        )
      );
    else
      select
        rr.id,
        rr.required_months,
        rr.required_general_badge_count
      into v_requirement
      from public.rank_requirements rr
      where rr.from_rank_id = v_from_rank_id
        and rr.to_rank_id = v_to_rank_id;

      v_rank_requirement_id := v_requirement.id;

      if v_requirement.required_months <> v_expected_months
         or v_requirement.required_general_badge_count <> v_expected_general_count then
        v_has_not_evaluable := true;
        v_reasons := v_reasons || jsonb_build_array(
          jsonb_build_object(
            'type', 'transition',
            'code', 'RANK_POLICY_MISMATCH',
            'message', 'DB 진급 요건이 확정 업무 기준과 다릅니다.',
            'required_count', v_expected_general_count,
            'review_date', p_evaluation_date
          )
        );
      end if;
    end if;
  end if;

  v_required_months := v_expected_months;
  v_general_required_count := coalesce(v_expected_general_count, 0);

  -- 기간 기준일
  if v_from_rank_code = 'beginner'
     and not coalesce(v_scout.beginner_course_exempted, false) then
    v_base_date := v_scout.joined_at;

    if v_base_date is null then
      v_has_not_evaluable := true;
      v_reasons := v_reasons || jsonb_build_array(
        jsonb_build_object(
          'type', 'base_date',
          'code', 'JOINED_AT_MISSING',
          'message', '일반 초급 대원의 입단일이 없습니다.',
          'review_date', p_evaluation_date
        )
      );
    end if;
  elsif v_from_rank_id is not null then
    select max(srh.approved_at)
    into v_base_date
    from public.scout_rank_histories srh
    where srh.scout_id = p_scout_id
      and srh.organization_id = v_organization_id
      and srh.rank_id = v_from_rank_id
      and srh.deleted_at is null
      and srh.approved_at <= p_evaluation_date;

    if v_base_date is null then
      v_has_not_evaluable := true;
      v_reasons := v_reasons || jsonb_build_array(
        jsonb_build_object(
          'type', 'base_date',
          'code', 'CURRENT_RANK_HISTORY_MISSING',
          'message', '현재급위의 유효한 인가 이력이 없습니다.',
          'base_date', null,
          'review_date', p_evaluation_date
        )
      );
    end if;
  end if;

  if v_base_date is not null and v_required_months is not null then
    v_available_at := public.calculate_rank_available_date(
      v_base_date,
      v_required_months
    );
    v_days_remaining := greatest(v_available_at - p_evaluation_date, 0);
    v_period_passed := p_evaluation_date >= v_available_at;

    if not v_period_passed then
      v_has_needs_action := true;
      v_reasons := v_reasons || jsonb_build_array(
        jsonb_build_object(
          'type', 'period',
          'code', 'PERIOD_NOT_MET',
          'message', '진급 기간이 부족합니다.',
          'base_date', v_base_date,
          'available_at', v_available_at,
          'review_date', p_evaluation_date
        )
      );
    end if;
  end if;

  -- 필수 기능장
  if v_rank_requirement_id is not null then
    select count(*)::integer
    into v_required_mapping_count
    from public.rank_required_badges rrb
    where rrb.rank_requirement_id = v_rank_requirement_id;

    if v_required_mapping_count = 0 then
      v_has_not_evaluable := true;
      v_required_badges_passed := false;
      v_reasons := v_reasons || jsonb_build_array(
        jsonb_build_object(
          'type', 'required_badge',
          'code', 'REQUIRED_BADGE_CONFIG_MISSING',
          'message', '필수 기능장 설정이 없습니다.',
          'review_date', p_evaluation_date
        )
      );
    end if;

    for v_required_badge in
      select
        b.id as badge_id,
        b.name as badge_name,
        b.special_rule
      from public.rank_required_badges rrb
      join public.badges b on b.id = rrb.badge_id
      where rrb.rank_requirement_id = v_rank_requirement_id
      order by rrb.sort_order, b.id
    loop
      -- 역전 날짜는 단순 미충족이 아니라 판정 불가
      select sb.id, sb.acquired_at, sb.approved_at
      into v_badge_record
      from public.scout_badges sb
      where sb.scout_id = p_scout_id
        and sb.organization_id = v_organization_id
        and sb.badge_id = v_required_badge.badge_id
        and sb.deleted_at is null
        and sb.approved_at is not null
        and sb.acquired_at > sb.approved_at
        and sb.acquired_at <= p_evaluation_date
        and sb.approved_at <= p_evaluation_date
      order by sb.created_at, sb.id
      limit 1;

      if found then
        v_has_not_evaluable := true;
        v_required_badges_passed := false;
        v_reasons := v_reasons || jsonb_build_array(
          jsonb_build_object(
            'type', 'required_badge',
            'code', 'BADGE_DATE_INVALID',
            'message', '기능장 취득일과 인가일의 순서가 잘못되었습니다.',
            'badge_id', v_required_badge.badge_id,
            'badge_name', v_required_badge.badge_name,
            'review_date', p_evaluation_date
          )
        );
        continue;
      end if;

      select sb.id, sb.acquired_at, sb.approved_at
      into v_badge_record
      from public.scout_badges sb
      where sb.scout_id = p_scout_id
        and sb.organization_id = v_organization_id
        and sb.badge_id = v_required_badge.badge_id
        and sb.deleted_at is null
        and sb.acquired_at is not null
        and sb.approved_at is not null
        and sb.acquired_at <= sb.approved_at
        and sb.acquired_at <= p_evaluation_date
        and sb.approved_at <= p_evaluation_date
      order by sb.approved_at, sb.acquired_at, sb.created_at, sb.id
      limit 1;

      if not found then
        v_required_badges_passed := false;
        v_has_needs_action := true;

        if exists (
          select 1
          from public.scout_badges sb
          where sb.scout_id = p_scout_id
            and sb.organization_id = v_organization_id
            and sb.badge_id = v_required_badge.badge_id
            and sb.deleted_at is null
            and sb.approved_at is null
        ) then
          v_reasons := v_reasons || jsonb_build_array(
            jsonb_build_object(
              'type', 'required_badge',
              'code', 'REQUIRED_BADGE_APPROVAL_MISSING',
              'message', '필수 기능장 인가일이 없습니다.',
              'badge_id', v_required_badge.badge_id,
              'badge_name', v_required_badge.badge_name,
              'review_date', p_evaluation_date
            )
          );
        elsif exists (
          select 1
          from public.scout_badges sb
          where sb.scout_id = p_scout_id
            and sb.organization_id = v_organization_id
            and sb.badge_id = v_required_badge.badge_id
            and sb.deleted_at is null
            and sb.acquired_at > p_evaluation_date
        ) then
          v_reasons := v_reasons || jsonb_build_array(
            jsonb_build_object(
              'type', 'required_badge',
              'code', 'BADGE_ACQUISITION_AFTER_EVALUATION',
              'message', '필수 기능장 취득일이 판정 기준일 이후입니다.',
              'badge_id', v_required_badge.badge_id,
              'badge_name', v_required_badge.badge_name,
              'review_date', p_evaluation_date
            )
          );
        elsif exists (
          select 1
          from public.scout_badges sb
          where sb.scout_id = p_scout_id
            and sb.organization_id = v_organization_id
            and sb.badge_id = v_required_badge.badge_id
            and sb.deleted_at is null
            and sb.approved_at > p_evaluation_date
        ) then
          v_reasons := v_reasons || jsonb_build_array(
            jsonb_build_object(
              'type', 'required_badge',
              'code', 'BADGE_APPROVAL_AFTER_EVALUATION',
              'message', '필수 기능장 인가일이 판정 기준일 이후입니다.',
              'badge_id', v_required_badge.badge_id,
              'badge_name', v_required_badge.badge_name,
              'review_date', p_evaluation_date
            )
          );
        else
          v_reasons := v_reasons || jsonb_build_array(
            jsonb_build_object(
              'type', 'required_badge',
              'code', 'REQUIRED_BADGE_MISSING',
              'message', '유효한 필수 기능장 기록이 없습니다.',
              'badge_id', v_required_badge.badge_id,
              'badge_name', v_required_badge.badge_name,
              'review_date', p_evaluation_date
            )
          );
        end if;

        continue;
      end if;

      -- 구조장은 일반 기능장과 동일하게 취득 순서를 검사하지 않는다.
      -- 생존장만 무궁화 인가일보다 엄격히 늦어야 한다.
      if v_required_badge.badge_name = '생존장'
         or v_required_badge.special_rule::text = 'after_mugunghwa_rank' then
        select max(srh.approved_at)
        into v_mugunghwa_approved_at
        from public.scout_rank_histories srh
        join public.ranks r on r.id = srh.rank_id
        where srh.scout_id = p_scout_id
          and srh.organization_id = v_organization_id
          and srh.deleted_at is null
          and srh.approved_at <= p_evaluation_date
          and r.rank_code = 'mugunghwa';

        if v_mugunghwa_approved_at is null then
          v_has_not_evaluable := true;
          v_required_badges_passed := false;
          v_reasons := v_reasons || jsonb_build_array(
            jsonb_build_object(
              'type', 'required_badge',
              'code', 'MUGUNGHWA_HISTORY_MISSING',
              'message', '생존장 판정에 필요한 무궁화 인가 이력이 없습니다.',
              'badge_id', v_required_badge.badge_id,
              'badge_name', v_required_badge.badge_name,
              'review_date', p_evaluation_date
            )
          );
        elsif v_badge_record.acquired_at <= v_mugunghwa_approved_at then
          v_has_needs_action := true;
          v_required_badges_passed := false;
          v_reasons := v_reasons || jsonb_build_array(
            jsonb_build_object(
              'type', 'required_badge',
              'code', 'SURVIVAL_BADGE_TOO_EARLY',
              'message', '생존장은 무궁화 인가일보다 늦게 취득해야 합니다.',
              'badge_id', v_required_badge.badge_id,
              'badge_name', v_required_badge.badge_name,
              'base_date', v_mugunghwa_approved_at,
              'review_date', p_evaluation_date
            )
          );
        end if;
      end if;
    end loop;
  else
    v_required_badges_passed := false;
  end if;

  -- 일반 기능장 역전 날짜 검사
  for v_badge_record in
    select sb.id, sb.badge_id, sb.acquired_at, sb.approved_at
    from public.scout_badges sb
    join public.badges b on b.id = sb.badge_id
    where sb.scout_id = p_scout_id
      and sb.organization_id = v_organization_id
      and sb.deleted_at is null
      and b.is_general_badge = true
      and b.is_required_badge = false
      and sb.approved_at is not null
      and sb.acquired_at > sb.approved_at
      and sb.acquired_at <= p_evaluation_date
      and sb.approved_at <= p_evaluation_date
      and not exists (
        select 1
        from public.rank_required_badges rrb
        where rrb.rank_requirement_id = v_rank_requirement_id
          and rrb.badge_id = sb.badge_id
      )
      and not exists (
        select 1
        from public.promotion_badge_usages pbu
        where pbu.scout_badge_id = sb.id
          and pbu.deleted_at is null
      )
    order by sb.created_at, sb.id
  loop
    v_has_not_evaluable := true;
    v_general_data_valid := false;
    v_reasons := v_reasons || jsonb_build_array(
      jsonb_build_object(
        'type', 'general_badge',
        'code', 'BADGE_DATE_INVALID',
        'message', '일반 기능장 취득일과 인가일의 순서가 잘못되었습니다.',
        'badge_id', v_badge_record.badge_id,
        'review_date', p_evaluation_date
      )
    );
  end loop;

  select
    count(*)::integer,
    coalesce(
      array_agg(
        candidates.id
        order by
          candidates.approved_at,
          candidates.acquired_at,
          candidates.created_at,
          candidates.id
      ),
      '{}'::uuid[]
    )
  into
    v_general_available_count,
    v_all_general_badge_ids
  from (
    select
      sb.id,
      sb.approved_at,
      sb.acquired_at,
      sb.created_at
    from public.scout_badges sb
    join public.badges b on b.id = sb.badge_id
    where sb.scout_id = p_scout_id
      and sb.organization_id = v_organization_id
      and sb.deleted_at is null
      and b.is_general_badge = true
      and b.is_required_badge = false
      and sb.acquired_at is not null
      and sb.approved_at is not null
      and sb.acquired_at <= sb.approved_at
      and sb.acquired_at <= p_evaluation_date
      and sb.approved_at <= p_evaluation_date
      and not exists (
        select 1
        from public.rank_required_badges rrb
        where rrb.rank_requirement_id = v_rank_requirement_id
          and rrb.badge_id = sb.badge_id
      )
      and not exists (
        select 1
        from public.promotion_badge_usages pbu
        where pbu.scout_badge_id = sb.id
          and pbu.deleted_at is null
      )
  ) as candidates;

  if v_general_required_count > 0 then
    v_selected_general_badge_ids :=
      coalesce(v_all_general_badge_ids[1:v_general_required_count], '{}'::uuid[]);
  else
    v_selected_general_badge_ids := '{}'::uuid[];
  end if;

  v_general_badges_passed :=
    v_general_data_valid
    and v_general_available_count >= v_general_required_count;

  if v_general_available_count < v_general_required_count then
    v_has_needs_action := true;
    v_reasons := v_reasons || jsonb_build_array(
      jsonb_build_object(
        'type', 'general_badge',
        'code', 'GENERAL_BADGE_SHORTAGE',
        'message', '사용 가능한 일반 기능장 수가 부족합니다.',
        'required_count', v_general_required_count,
        'available_count', v_general_available_count,
        'missing_count', greatest(v_general_required_count - v_general_available_count, 0),
        'review_date', p_evaluation_date
      )
    );
  end if;

  if not v_general_badges_passed then
    if exists (
      select 1
      from public.scout_badges sb
      join public.badges b on b.id = sb.badge_id
      where sb.scout_id = p_scout_id
        and sb.organization_id = v_organization_id
        and sb.deleted_at is null
        and b.is_general_badge = true
        and b.is_required_badge = false
        and sb.approved_at is null
    ) then
      v_reasons := v_reasons || jsonb_build_array(
        jsonb_build_object(
          'type', 'general_badge',
          'code', 'GENERAL_BADGE_APPROVAL_MISSING',
          'message', '인가일이 없는 일반 기능장은 사용할 수 없습니다.',
          'review_date', p_evaluation_date
        )
      );
    end if;

    if exists (
      select 1
      from public.scout_badges sb
      join public.badges b on b.id = sb.badge_id
      join public.promotion_badge_usages pbu
        on pbu.scout_badge_id = sb.id
       and pbu.deleted_at is null
      where sb.scout_id = p_scout_id
        and sb.organization_id = v_organization_id
        and sb.deleted_at is null
        and b.is_general_badge = true
        and b.is_required_badge = false
    ) then
      v_reasons := v_reasons || jsonb_build_array(
        jsonb_build_object(
          'type', 'general_badge',
          'code', 'GENERAL_BADGE_ALREADY_USED',
          'message', '이전 진급에 사용한 일반 기능장은 재사용할 수 없습니다.',
          'review_date', p_evaluation_date
        )
      );
    end if;
  end if;

  -- 프로그램: 승인일은 사용하지 않는다.
  if v_program_required then
    select pc.id
    into v_selected_program_completion_id
    from public.program_completions pc
    where pc.scout_id = p_scout_id
      and pc.organization_id = v_organization_id
      and pc.deleted_at is null
      and pc.program_type::text in ('WSEP', 'MoP')
      and pc.completed_at is not null
      and pc.completed_at <= p_evaluation_date
      and nullif(btrim(pc.certificate_no), '') is not null
    order by pc.completed_at, pc.created_at, pc.id
    limit 1;

    v_program_passed := found;

    if not v_program_passed then
      v_has_needs_action := true;

      if exists (
        select 1
        from public.program_completions pc
        where pc.scout_id = p_scout_id
          and pc.organization_id = v_organization_id
          and pc.deleted_at is null
          and pc.program_type::text in ('WSEP', 'MoP')
          and nullif(btrim(pc.certificate_no), '') is null
      ) then
        v_reasons := v_reasons || jsonb_build_array(
          jsonb_build_object(
            'type', 'program',
            'code', 'PROGRAM_CERTIFICATE_MISSING',
            'message', 'WSEP/MoP 수료증번호가 없습니다.',
            'review_date', p_evaluation_date
          )
        );
      end if;

      if exists (
        select 1
        from public.program_completions pc
        where pc.scout_id = p_scout_id
          and pc.organization_id = v_organization_id
          and pc.deleted_at is null
          and pc.program_type::text in ('WSEP', 'MoP')
          and pc.completed_at > p_evaluation_date
      ) then
        v_reasons := v_reasons || jsonb_build_array(
          jsonb_build_object(
            'type', 'program',
            'code', 'PROGRAM_COMPLETION_AFTER_EVALUATION',
            'message', 'WSEP/MoP 수료일이 판정 기준일 이후입니다.',
            'review_date', p_evaluation_date
          )
        );
      end if;

      if not exists (
        select 1
        from public.program_completions pc
        where pc.scout_id = p_scout_id
          and pc.organization_id = v_organization_id
          and pc.deleted_at is null
          and pc.program_type::text in ('WSEP', 'MoP')
      ) then
        v_reasons := v_reasons || jsonb_build_array(
          jsonb_build_object(
            'type', 'program',
            'code', 'PROGRAM_MISSING',
            'message', '유효한 WSEP 또는 MoP 기록이 없습니다.',
            'review_date', p_evaluation_date
          )
        );
      end if;
    end if;
  else
    v_program_passed := true;
  end if;

  -- 출석: 일반 진급은 참고, 무궁화→범은 설정과 무관하게 80% 강제
  if v_base_date is not null then
    select
      count(*)::integer,
      count(*) filter (
        where exists (
          select 1
          from public.attendance a
          where a.meeting_id = m.id
            and a.scout_id = p_scout_id
            and a.deleted_at is null
            and a.status::text in (
              'present',
              'recognized',
              'excused',
              'late',
              'early_leave'
            )
        )
      )::integer
    into
      v_attendance_total_count,
      v_attendance_present_count
    from public.meetings m
    where m.organization_id = v_organization_id
      and m.deleted_at is null
      and m.is_attendance_target = true
      and m.meeting_date >= v_base_date
      and m.meeting_date <= p_evaluation_date;
  end if;

  if v_attendance_total_count > 0 then
    v_attendance_rate := round(
      v_attendance_present_count::numeric * 100.0
      / v_attendance_total_count::numeric,
      2
    );
  else
    v_attendance_rate := 0;
  end if;

  if v_attendance_required then
    if v_attendance_total_count = 0 then
      v_attendance_passed := false;
      v_has_not_evaluable := true;
      v_reasons := v_reasons || jsonb_build_array(
        jsonb_build_object(
          'type', 'attendance',
          'code', 'ATTENDANCE_DATA_MISSING',
          'message', '범 진급 판정에 필요한 대상 집회가 없습니다.',
          'base_date', v_base_date,
          'review_date', p_evaluation_date,
          'required_rate', 80,
          'actual_rate', null
        )
      );
    elsif v_attendance_rate < 80 then
      v_attendance_passed := false;
      v_has_needs_action := true;
      v_reasons := v_reasons || jsonb_build_array(
        jsonb_build_object(
          'type', 'attendance',
          'code', 'ATTENDANCE_RATE_NOT_MET',
          'message', '범 진급 출석률 80% 기준을 충족하지 못했습니다.',
          'base_date', v_base_date,
          'review_date', p_evaluation_date,
          'required_rate', 80,
          'actual_rate', v_attendance_rate
        )
      );
    else
      v_attendance_passed := true;
    end if;
  else
    v_attendance_passed := true;
  end if;

  if v_has_not_evaluable then
    v_evaluation_status := 'not_evaluable';
  elsif v_has_needs_action
        or not coalesce(v_period_passed, false)
        or not coalesce(v_required_badges_passed, false)
        or not coalesce(v_general_badges_passed, false)
        or not coalesce(v_program_passed, false)
        or not coalesce(v_attendance_passed, false) then
    v_evaluation_status := 'needs_action';
  else
    v_evaluation_status := 'eligible';
  end if;

  v_final_passed := v_evaluation_status = 'eligible';

  return query
  select
    v_organization_id,
    p_scout_id,
    p_evaluation_date,
    v_from_rank_id,
    v_from_rank_code,
    v_to_rank_id,
    v_to_rank_code,
    v_rank_requirement_id,
    v_base_date,
    v_available_at,
    v_required_months,
    v_days_remaining,
    v_period_passed,
    v_required_badges_passed,
    v_general_required_count,
    v_general_available_count,
    v_general_badges_passed,
    v_selected_general_badge_ids,
    v_program_required,
    v_program_passed,
    v_selected_program_completion_id,
    v_attendance_required,
    v_attendance_total_count,
    v_attendance_present_count,
    v_attendance_rate,
    v_attendance_passed,
    v_evaluation_status,
    v_final_passed,
    v_reasons;
end;
$function$;

revoke all on function internal.evaluate_scout_promotion(uuid, date)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. 저장 RPC: 공통 판정 결과를 promotion_reviews에 1회 저장
-- ---------------------------------------------------------------------------

create or replace function public.review_scout_promotion(
  p_scout_id uuid,
  p_review_date date default ((current_timestamp at time zone 'Asia/Seoul')::date)
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, internal
set timezone = 'Asia/Seoul'
as $function$
declare
  v_evaluation record;
  v_review_id uuid;
begin
  if p_review_date is null then
    raise exception '판정 기준일이 필요합니다.';
  end if;

  if p_review_date > (current_timestamp at time zone 'Asia/Seoul')::date then
    raise exception '판정 기준일은 미래일 수 없습니다. review_date=%', p_review_date;
  end if;

  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception '인증된 사용자만 진급 판정을 실행할 수 있습니다.';
  end if;

  select *
  into v_evaluation
  from internal.evaluate_scout_promotion(p_scout_id, p_review_date);

  if auth.uid() is not null
     and not public.can_modify_org(v_evaluation.organization_id) then
    raise exception '해당 대원의 진급 판정 권한이 없습니다. scout_id=%', p_scout_id;
  end if;

  if v_evaluation.from_rank_id is null or v_evaluation.to_rank_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'PROMOTION_NOT_EVALUABLE',
      detail = v_evaluation.reasons::text;
  end if;

  insert into public.promotion_reviews (
    organization_id,
    scout_id,
    from_rank_id,
    to_rank_id,
    review_date,
    base_date,
    available_at,
    required_months,
    days_remaining,
    period_passed,
    attendance_total_count,
    attendance_present_count,
    attendance_rate,
    attendance_passed,
    required_badges_passed,
    general_badges_passed,
    program_passed,
    final_passed,
    missing_items,
    note,
    evaluation_status,
    evaluation_version,
    evaluation_context,
    source_review_id
  )
  values (
    v_evaluation.organization_id,
    v_evaluation.scout_id,
    v_evaluation.from_rank_id,
    v_evaluation.to_rank_id,
    v_evaluation.evaluation_date,
    v_evaluation.base_date,
    v_evaluation.available_at,
    v_evaluation.required_months,
    v_evaluation.days_remaining,
    v_evaluation.period_passed,
    v_evaluation.attendance_total_count,
    v_evaluation.attendance_present_count,
    v_evaluation.attendance_rate,
    v_evaluation.attendance_passed,
    v_evaluation.required_badges_passed,
    v_evaluation.general_badges_passed,
    v_evaluation.program_passed,
    v_evaluation.final_passed,
    v_evaluation.reasons,
    case v_evaluation.evaluation_status
      when 'eligible' then '공통 판정 v2 · 진급 가능'
      when 'needs_action' then '공통 판정 v2 · 보완 필요'
      else '공통 판정 v2 · 판정 불가'
    end,
    v_evaluation.evaluation_status,
    2,
    'review',
    null
  )
  returning id into v_review_id;

  return v_review_id;
end;
$function$;

-- 기존 직접 호출 호환용. 계산/저장은 review_scout_promotion 한 곳에서만 수행한다.
create or replace function public.review_scout_promotion_core(
  p_scout_id uuid,
  p_review_date date default ((current_timestamp at time zone 'Asia/Seoul')::date)
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $function$
begin
  return public.review_scout_promotion(p_scout_id, p_review_date);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. 인가 RPC: 저장 final_passed를 신뢰하지 않고 인가일 기준 전체 재판정
-- ---------------------------------------------------------------------------

create or replace function public.approve_scout_promotion(
  p_promotion_review_id uuid,
  p_approved_at date default ((current_timestamp at time zone 'Asia/Seoul')::date),
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, internal
set timezone = 'Asia/Seoul'
as $function$
declare
  v_source_review record;
  v_evaluation record;
  v_scout record;
  v_rank_history_id uuid;
  v_recheck_review_id uuid;
  v_used_count integer := 0;
  v_updated_count integer := 0;
begin
  if p_approved_at is null then
    raise exception '인가일이 필요합니다.';
  end if;

  if p_approved_at > (current_timestamp at time zone 'Asia/Seoul')::date then
    raise exception '인가일은 미래일 수 없습니다. approved_at=%', p_approved_at;
  end if;

  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception '인증된 사용자만 진급 인가를 실행할 수 있습니다.';
  end if;

  select
    pr.id,
    pr.organization_id,
    pr.scout_id,
    pr.from_rank_id,
    pr.to_rank_id
  into v_source_review
  from public.promotion_reviews pr
  where pr.id = p_promotion_review_id
    and pr.deleted_at is null
  for update;

  if not found then
    raise exception '진급 판정 결과를 찾을 수 없습니다. promotion_review_id=%',
      p_promotion_review_id;
  end if;

  if auth.uid() is not null
     and not public.can_modify_org(v_source_review.organization_id) then
    raise exception '해당 대원의 진급 인가 권한이 없습니다.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_source_review.scout_id::text, 0)
  );

  select
    s.id,
    s.organization_id,
    s.current_rank_id
  into v_scout
  from public.scouts s
  where s.id = v_source_review.scout_id
    and s.deleted_at is null
  for update;

  if not found then
    raise exception '대원을 찾을 수 없습니다. scout_id=%', v_source_review.scout_id;
  end if;

  if v_scout.organization_id is distinct from v_source_review.organization_id then
    raise exception '대원의 현재 소속과 판정 당시 소속이 일치하지 않습니다.';
  end if;

  if auth.uid() is not null
     and not public.can_modify_org(v_scout.organization_id) then
    raise exception '대원의 현재 소속에 대한 진급 인가 권한이 없습니다.';
  end if;

  -- 인가 재검증에서 읽는 현재 입력 행을 잠가 수정/삭제 경합을 줄인다.
  perform 1
  from public.scout_rank_histories srh
  where srh.scout_id = v_source_review.scout_id
    and srh.deleted_at is null
  for update;

  perform 1
  from public.scout_badges sb
  where sb.scout_id = v_source_review.scout_id
    and sb.deleted_at is null
  for update;

  perform 1
  from public.program_completions pc
  where pc.scout_id = v_source_review.scout_id
    and pc.deleted_at is null
  for update;

  perform 1
  from public.attendance a
  where a.scout_id = v_source_review.scout_id
    and a.deleted_at is null
  for update;

  perform 1
  from public.meetings m
  where m.organization_id = v_scout.organization_id
    and m.deleted_at is null
    and m.meeting_date <= p_approved_at
  for share;

  select *
  into v_evaluation
  from internal.evaluate_scout_promotion(
    v_source_review.scout_id,
    p_approved_at
  );

  if v_evaluation.from_rank_id is distinct from v_source_review.from_rank_id
     or v_evaluation.to_rank_id is distinct from v_source_review.to_rank_id then
    raise exception using
      errcode = 'P0001',
      message = 'STALE_REVIEW_STAGE',
      detail = v_evaluation.reasons::text;
  end if;

  if v_evaluation.evaluation_status <> 'eligible' then
    raise exception using
      errcode = 'P0001',
      message = 'PROMOTION_NOT_ELIGIBLE',
      detail = v_evaluation.reasons::text;
  end if;

  if exists (
    select 1
    from public.scout_rank_histories srh
    where srh.scout_id = v_source_review.scout_id
      and srh.rank_id = v_evaluation.to_rank_id
      and srh.deleted_at is null
  ) then
    raise exception '이미 해당 급위 인가 이력이 있습니다.';
  end if;

  -- 인가 시점의 재판정 스냅샷
  insert into public.promotion_reviews (
    organization_id,
    scout_id,
    from_rank_id,
    to_rank_id,
    review_date,
    base_date,
    available_at,
    required_months,
    days_remaining,
    period_passed,
    attendance_total_count,
    attendance_present_count,
    attendance_rate,
    attendance_passed,
    required_badges_passed,
    general_badges_passed,
    program_passed,
    final_passed,
    missing_items,
    note,
    evaluation_status,
    evaluation_version,
    evaluation_context,
    source_review_id
  )
  values (
    v_evaluation.organization_id,
    v_evaluation.scout_id,
    v_evaluation.from_rank_id,
    v_evaluation.to_rank_id,
    v_evaluation.evaluation_date,
    v_evaluation.base_date,
    v_evaluation.available_at,
    v_evaluation.required_months,
    v_evaluation.days_remaining,
    v_evaluation.period_passed,
    v_evaluation.attendance_total_count,
    v_evaluation.attendance_present_count,
    v_evaluation.attendance_rate,
    v_evaluation.attendance_passed,
    v_evaluation.required_badges_passed,
    v_evaluation.general_badges_passed,
    v_evaluation.program_passed,
    true,
    v_evaluation.reasons,
    coalesce(nullif(btrim(p_note), ''), '인가 직전 공통 판정 v2 재검증'),
    'eligible',
    2,
    'approval_recheck',
    v_source_review.id
  )
  returning id into v_recheck_review_id;

  insert into public.scout_rank_histories (
    organization_id,
    scout_id,
    rank_id,
    approved_at,
    approval_type,
    note,
    promotion_review_id
  )
  values (
    v_evaluation.organization_id,
    v_evaluation.scout_id,
    v_evaluation.to_rank_id,
    p_approved_at,
    'normal'::approval_type,
    coalesce(nullif(btrim(p_note), ''), '공통 판정 v2 결과에 따른 인가'),
    v_recheck_review_id
  )
  returning id into v_rank_history_id;

  if v_evaluation.general_required_count > 0 then
    insert into public.promotion_badge_usages (
      organization_id,
      scout_id,
      scout_badge_id,
      from_rank_id,
      to_rank_id,
      used_at,
      promotion_review_id
    )
    select
      v_evaluation.organization_id,
      v_evaluation.scout_id,
      selected.scout_badge_id,
      v_evaluation.from_rank_id,
      v_evaluation.to_rank_id,
      p_approved_at,
      v_recheck_review_id
    from unnest(v_evaluation.selected_general_badge_ids)
      with ordinality as selected(scout_badge_id, selection_order);

    get diagnostics v_used_count = row_count;

    if v_used_count <> v_evaluation.general_required_count then
      raise exception
        '일반 기능장 사용 이력 생성 수가 일치하지 않습니다. 필요=%, 생성=%',
        v_evaluation.general_required_count,
        v_used_count;
    end if;
  end if;

  update public.scouts
  set
    current_rank_id = v_evaluation.to_rank_id,
    updated_at = now()
  where id = v_evaluation.scout_id
    and current_rank_id = v_evaluation.from_rank_id;

  get diagnostics v_updated_count = row_count;

  if v_updated_count <> 1 then
    raise exception '인가 처리 중 현재급위가 변경되었습니다.';
  end if;

  return v_rank_history_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. 기능장 CRUD: 구조장-수영장 순서 제한 제거, 생존장 제한 유지
-- ---------------------------------------------------------------------------

create or replace function public.create_scout_badge_record(
  p_scout_id uuid,
  p_badge_id uuid,
  p_acquired_at date,
  p_approved_at date default null,
  p_instructor_name text default null,
  p_leader_confirmed boolean default false,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_scout record;
  v_badge record;
  v_existing_count integer := 0;
  v_mugunghwa_approved_at date;
  v_scout_badge_id uuid;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception '인증된 사용자만 기능장 기록을 생성할 수 있습니다.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_scout_id::text, 0));

  select s.id, s.organization_id
  into v_scout
  from public.scouts s
  where s.id = p_scout_id
    and s.deleted_at is null
  for update;

  if not found then
    raise exception '대원을 찾을 수 없습니다. scout_id=%', p_scout_id;
  end if;

  if auth.uid() is not null and not public.can_modify_org(v_scout.organization_id) then
    raise exception '해당 대원의 기능장 기록을 수정할 권한이 없습니다.';
  end if;

  select b.id, b.name, b.special_rule
  into v_badge
  from public.badges b
  where b.id = p_badge_id;

  if not found then
    raise exception '기능장을 찾을 수 없습니다. badge_id=%', p_badge_id;
  end if;

  if p_acquired_at is null then
    raise exception '기능장 취득일이 필요합니다.';
  end if;

  if p_approved_at is not null and p_approved_at < p_acquired_at then
    raise exception '기능장 인가일은 취득일보다 빠를 수 없습니다.';
  end if;

  select count(*)::integer
  into v_existing_count
  from public.scout_badges sb
  where sb.scout_id = p_scout_id
    and sb.badge_id = p_badge_id
    and sb.deleted_at is null;

  if v_existing_count > 0 then
    raise exception '이미 등록된 기능장입니다.';
  end if;

  -- 구조장은 수영장 취득 순서를 검사하지 않는다.
  -- 생존장만 무궁화 인가일보다 엄격히 늦어야 한다.
  if v_badge.name = '생존장'
     or v_badge.special_rule::text = 'after_mugunghwa_rank' then
    select max(srh.approved_at)
    into v_mugunghwa_approved_at
    from public.scout_rank_histories srh
    join public.ranks r on r.id = srh.rank_id
    where srh.scout_id = p_scout_id
      and srh.deleted_at is null
      and r.rank_code = 'mugunghwa';

    if v_mugunghwa_approved_at is null
       or p_acquired_at <= v_mugunghwa_approved_at then
      raise exception
        '생존장은 무궁화 인가일보다 늦게 취득해야 합니다. acquired_at=%',
        p_acquired_at;
    end if;
  end if;

  insert into public.scout_badges (
    organization_id,
    scout_id,
    badge_id,
    acquired_at,
    approved_at,
    instructor_name,
    leader_confirmed,
    note
  )
  values (
    v_scout.organization_id,
    p_scout_id,
    p_badge_id,
    p_acquired_at,
    p_approved_at,
    nullif(btrim(p_instructor_name), ''),
    coalesce(p_leader_confirmed, false),
    nullif(btrim(p_note), '')
  )
  returning id into v_scout_badge_id;

  return v_scout_badge_id;
end;
$function$;

create or replace function public.update_scout_badge_record(
  p_scout_badge_id uuid,
  p_badge_id uuid,
  p_acquired_at date,
  p_approved_at date default null,
  p_instructor_name text default null,
  p_leader_confirmed boolean default false,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_current record;
  v_badge record;
  v_used_count integer := 0;
  v_duplicate_count integer := 0;
  v_mugunghwa_approved_at date;
begin
  select
    sb.id,
    sb.organization_id,
    sb.scout_id
  into v_current
  from public.scout_badges sb
  where sb.id = p_scout_badge_id
    and sb.deleted_at is null;

  if not found then
    raise exception '기능장 기록을 찾을 수 없습니다.';
  end if;

  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception '인증된 사용자만 기능장 기록을 수정할 수 있습니다.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_current.scout_id::text, 0));

  select
    sb.id,
    sb.organization_id,
    sb.scout_id
  into v_current
  from public.scout_badges sb
  where sb.id = p_scout_badge_id
    and sb.deleted_at is null
  for update;

  if not found then
    raise exception '기능장 기록을 찾을 수 없습니다.';
  end if;

  if auth.uid() is not null and not public.can_modify_org(v_current.organization_id) then
    raise exception '기능장 기록을 수정할 권한이 없습니다.';
  end if;

  select count(*)::integer
  into v_used_count
  from public.promotion_badge_usages pbu
  where pbu.scout_badge_id = p_scout_badge_id
    and pbu.deleted_at is null;

  if v_used_count > 0 then
    raise exception '진급에 사용된 기능장 기록은 수정할 수 없습니다.';
  end if;

  select b.id, b.name, b.special_rule
  into v_badge
  from public.badges b
  where b.id = p_badge_id;

  if not found then
    raise exception '기능장을 찾을 수 없습니다.';
  end if;

  if p_acquired_at is null then
    raise exception '기능장 취득일이 필요합니다.';
  end if;

  if p_approved_at is not null and p_approved_at < p_acquired_at then
    raise exception '기능장 인가일은 취득일보다 빠를 수 없습니다.';
  end if;

  select count(*)::integer
  into v_duplicate_count
  from public.scout_badges sb
  where sb.scout_id = v_current.scout_id
    and sb.badge_id = p_badge_id
    and sb.id <> p_scout_badge_id
    and sb.deleted_at is null;

  if v_duplicate_count > 0 then
    raise exception '이미 등록된 기능장입니다.';
  end if;

  if v_badge.name = '생존장'
     or v_badge.special_rule::text = 'after_mugunghwa_rank' then
    select max(srh.approved_at)
    into v_mugunghwa_approved_at
    from public.scout_rank_histories srh
    join public.ranks r on r.id = srh.rank_id
    where srh.scout_id = v_current.scout_id
      and srh.deleted_at is null
      and r.rank_code = 'mugunghwa';

    if v_mugunghwa_approved_at is null
       or p_acquired_at <= v_mugunghwa_approved_at then
      raise exception
        '생존장은 무궁화 인가일보다 늦게 취득해야 합니다. acquired_at=%',
        p_acquired_at;
    end if;
  end if;

  update public.scout_badges
  set
    badge_id = p_badge_id,
    acquired_at = p_acquired_at,
    approved_at = p_approved_at,
    instructor_name = nullif(btrim(p_instructor_name), ''),
    leader_confirmed = coalesce(p_leader_confirmed, false),
    note = nullif(btrim(p_note), ''),
    updated_at = now()
  where id = p_scout_badge_id;

  return p_scout_badge_id;
end;
$function$;

create or replace function public.archive_scout_badge_record(
  p_scout_badge_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_current record;
  v_used_count integer := 0;
begin
  select sb.id, sb.organization_id, sb.scout_id
  into v_current
  from public.scout_badges sb
  where sb.id = p_scout_badge_id
    and sb.deleted_at is null;

  if not found then
    raise exception '기능장 기록을 찾을 수 없습니다.';
  end if;

  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception '인증된 사용자만 기능장 기록을 삭제할 수 있습니다.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_current.scout_id::text, 0));

  select sb.id, sb.organization_id, sb.scout_id
  into v_current
  from public.scout_badges sb
  where sb.id = p_scout_badge_id
    and sb.deleted_at is null
  for update;

  if not found then
    raise exception '기능장 기록을 찾을 수 없습니다.';
  end if;

  if auth.uid() is not null and not public.can_modify_org(v_current.organization_id) then
    raise exception '기능장 기록을 삭제할 권한이 없습니다.';
  end if;

  select count(*)::integer
  into v_used_count
  from public.promotion_badge_usages pbu
  where pbu.scout_badge_id = p_scout_badge_id
    and pbu.deleted_at is null;

  if v_used_count > 0 then
    raise exception '진급에 사용된 기능장 기록은 삭제할 수 없습니다.';
  end if;

  -- 수영장 삭제 시 구조장 존재 여부를 검사하지 않는다.
  update public.scout_badges
  set
    deleted_at = now(),
    updated_at = now()
  where id = p_scout_badge_id;

  return p_scout_badge_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 7. 신규 스냅샷의 final_passed 호환 규칙
-- 기존 v1 행은 backfill 결과만 보존하고, v2부터 상태와 boolean 일치를 강제한다.
-- ---------------------------------------------------------------------------

alter table public.promotion_reviews
  drop constraint if exists promotion_reviews_v2_final_passed_check,
  add constraint promotion_reviews_v2_final_passed_check
    check (
      evaluation_version < 2
      or final_passed = (evaluation_status = 'eligible')
    );

-- 인가 이력이 연결된 원 판정은 정리 함수와의 경합에서도 보존한다.
create or replace function internal.prevent_approved_promotion_review_archive()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $function$
begin
  if old.deleted_at is null
     and new.deleted_at is not null
     and (
       exists (
         select 1
         from public.scout_rank_histories srh
         where srh.promotion_review_id = old.id
           and srh.deleted_at is null
       )
       or exists (
         select 1
         from public.promotion_reviews recheck
         join public.scout_rank_histories srh
           on srh.promotion_review_id = recheck.id
          and srh.deleted_at is null
         where recheck.source_review_id = old.id
           and recheck.deleted_at is null
       )
     ) then
    raise exception '인가 이력이 연결된 진급 판정은 삭제할 수 없습니다.';
  end if;

  return new;
end;
$function$;

revoke all on function internal.prevent_approved_promotion_review_archive()
  from public, anon, authenticated;

drop trigger if exists promotion_reviews_prevent_approved_archive
  on public.promotion_reviews;

create trigger promotion_reviews_prevent_approved_archive
before update of deleted_at on public.promotion_reviews
for each row
execute function internal.prevent_approved_promotion_review_archive();

-- SECURITY DEFINER 공개 RPC의 실행 권한을 명시적으로 제한한다.
revoke all on function public.review_scout_promotion(uuid, date)
  from public, anon;
revoke all on function public.review_scout_promotion_core(uuid, date)
  from public, anon;
revoke all on function public.approve_scout_promotion(uuid, date, text)
  from public, anon;
revoke all on function public.approve_initial_beginner_rank(uuid, date, text)
  from public, anon;
revoke all on function public.create_scout_badge_record(uuid, uuid, date, date, text, boolean, text)
  from public, anon;
revoke all on function public.update_scout_badge_record(uuid, uuid, date, date, text, boolean, text)
  from public, anon;
revoke all on function public.archive_scout_badge_record(uuid)
  from public, anon;

grant execute on function public.review_scout_promotion(uuid, date)
  to authenticated, service_role;
grant execute on function public.review_scout_promotion_core(uuid, date)
  to authenticated, service_role;
grant execute on function public.approve_scout_promotion(uuid, date, text)
  to authenticated, service_role;
grant execute on function public.approve_initial_beginner_rank(uuid, date, text)
  to authenticated, service_role;
grant execute on function public.create_scout_badge_record(uuid, uuid, date, date, text, boolean, text)
  to authenticated, service_role;
grant execute on function public.update_scout_badge_record(uuid, uuid, date, date, text, boolean, text)
  to authenticated, service_role;
grant execute on function public.archive_scout_badge_record(uuid)
  to authenticated, service_role;

commit;

-- 적용 후 필수 검증:
-- 1. DEV-030 T01~T36 회귀 테스트
-- 2. 기존 public RPC 세 함수의 signature/ACL 유지 확인
-- 3. promotion_badge_usages_scout_badge_active_uidx 존재 확인
-- 4. review_scout_promotion_core 외부 직접 호출 여부 확인
-- 5. 실패한 approve_scout_promotion이 이력/사용 기록/현재급위를 남기지 않는지 확인
