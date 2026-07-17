BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('DEV-031-promotion-rollback', 0));

DROP TRIGGER IF EXISTS promotion_reviews_prevent_approved_archive ON public.promotion_reviews;
DROP FUNCTION IF EXISTS internal.prevent_approved_promotion_review_archive();
DROP FUNCTION IF EXISTS internal.evaluate_scout_promotion(uuid, date);

ALTER TABLE public.promotion_reviews
  DROP CONSTRAINT IF EXISTS promotion_reviews_v2_final_passed_check;

ALTER TABLE public.promotion_reviews
  ALTER COLUMN evaluation_version SET DEFAULT 1,
  ALTER COLUMN evaluation_status SET DEFAULT 'needs_action',
  ALTER COLUMN evaluation_context SET DEFAULT 'review';

CREATE OR REPLACE FUNCTION public.calculate_rank_available_date(p_base_date date, p_required_months integer)
 RETURNS date
 LANGUAGE sql
 STABLE
AS $function$
  select (p_base_date + make_interval(months => p_required_months))::date
$function$;

CREATE OR REPLACE FUNCTION public.review_scout_promotion_core(p_scout_id uuid, p_review_date date DEFAULT CURRENT_DATE)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_scout record;
  v_requirement record;

  v_base_date date;
  v_available_at date;
  v_days_remaining integer;

  v_period_passed boolean := false;

  v_attendance_total_count integer := 0;
  v_attendance_present_count integer := 0;
  v_attendance_rate numeric(5,2) := 0;
  v_attendance_passed boolean := true;

  v_required_badges_passed boolean := true;
  v_required_badge record;
  v_badge_ok boolean;
  v_badge_fail_reason text;
  v_swimming_acquired_at date;
  v_mugunghwa_approved_at date;

  v_general_required_count integer := 0;
  v_general_available_count integer := 0;
  v_general_badges_passed boolean := false;

  v_program_passed boolean := true;

  v_final_passed boolean := false;
  v_missing_items jsonb := '[]'::jsonb;

  v_review_id uuid;
begin
  -- ---------------------------------------------------------
  -- 1. 대원 및 현재 급위 확인
  -- ---------------------------------------------------------
  select
    s.id,
    s.organization_id,
    s.name,
    s.member_no,
    s.joined_at,
    s.current_rank_id,
    s.is_from_cub_scout,
    s.cub_promotion_completed,
    s.beginner_course_exempted,
    r.rank_code as from_rank_code,
    r.rank_name as from_rank_name
  into v_scout
  from public.scouts s
  left join public.ranks r on r.id = s.current_rank_id
  where s.id = p_scout_id
    and s.deleted_at is null;

  if not found then
    raise exception '대원을 찾을 수 없습니다. scout_id=%', p_scout_id;
  end if;

  if v_scout.current_rank_id is null then
    raise exception '현재 급위가 등록되지 않았습니다. scout_id=%', p_scout_id;
  end if;

  -- 앱에서 호출할 경우 자기 대 수정 권한이 있어야 판정 결과를 저장할 수 있다.
  -- SQL Editor나 service role에서 실행할 경우 auth.uid()가 null일 수 있으므로 예외적으로 허용한다.
  if auth.uid() is not null and not public.can_modify_org(v_scout.organization_id) then
    raise exception '해당 대원의 진급 판정 권한이 없습니다. scout_id=%', p_scout_id;
  end if;

  -- ---------------------------------------------------------
  -- 2. 다음 진급 조건 확인
  -- ---------------------------------------------------------
  select
    rr.id as rank_requirement_id,
    rr.from_rank_id,
    rr.to_rank_id,
    rr.required_months,
    rr.required_attendance_rate,
    rr.required_general_badge_count,
    rr.requires_wsep_or_mop,
    tr.rank_code as to_rank_code,
    tr.rank_name as to_rank_name
  into v_requirement
  from public.rank_requirements rr
  join public.ranks tr on tr.id = rr.to_rank_id
  where rr.from_rank_id = v_scout.current_rank_id
  limit 1;

  if not found then
    raise exception '다음 진급 조건이 없습니다. 현재 급위=%', v_scout.from_rank_name;
  end if;

  -- ---------------------------------------------------------
  -- 3. 기준일 계산
  -- 초급 -> 2급:
  --   일반 대원은 가입일 기준.
  --   컵스카우트 승진 과정 이수로 초급과정 면제된 대원은 초급 인가일 필수.
  -- 그 외:
  --   현재 급위 인가일 기준.
  -- ---------------------------------------------------------
  if v_scout.from_rank_code = 'beginner' then
    if v_scout.beginner_course_exempted then
      select max(srh.approved_at)
      into v_base_date
      from public.scout_rank_histories srh
      where srh.scout_id = p_scout_id
        and srh.rank_id = v_scout.current_rank_id
        and srh.deleted_at is null;

      if v_base_date is null then
        v_missing_items := v_missing_items || jsonb_build_array(
          jsonb_build_object(
            'type', 'base_date',
            'message', '컵스카우트 승진 과정 이수자는 초급과정은 면제되지만 초급 인가일 등록이 필요합니다.'
          )
        );
      end if;
    else
      v_base_date := v_scout.joined_at;
    end if;
  else
    select max(srh.approved_at)
    into v_base_date
    from public.scout_rank_histories srh
    where srh.scout_id = p_scout_id
      and srh.rank_id = v_scout.current_rank_id
      and srh.deleted_at is null;

    if v_base_date is null then
      v_missing_items := v_missing_items || jsonb_build_array(
        jsonb_build_object(
          'type', 'base_date',
          'message', v_scout.from_rank_name || ' 인가일이 등록되지 않았습니다.'
        )
      );
    end if;
  end if;

  -- ---------------------------------------------------------
  -- 4. 기간 조건 판정
  -- 1일이라도 부족하면 불합격
  -- ---------------------------------------------------------
  if v_base_date is not null then
    v_available_at := public.calculate_rank_available_date(
      v_base_date,
      v_requirement.required_months
    );

    v_days_remaining := greatest(v_available_at - p_review_date, 0);
    v_period_passed := p_review_date >= v_available_at;

    if not v_period_passed then
      v_missing_items := v_missing_items || jsonb_build_array(
        jsonb_build_object(
          'type', 'period',
          'message', '진급 기간이 부족합니다.',
          'base_date', v_base_date,
          'available_at', v_available_at,
          'review_date', p_review_date,
          'days_remaining', v_days_remaining
        )
      );
    end if;
  else
    v_available_at := null;
    v_days_remaining := null;
    v_period_passed := false;
  end if;

  -- ---------------------------------------------------------
  -- 5. 출석률 판정
  -- 대상:
  -- - 집회, 대집회, 대활동, 캠프, 봉사활동, 행사 등
  -- - meetings.is_attendance_target = true
  --
  -- 출석 인정:
  -- - present, recognized, late, early_leave
  --
  -- 결석/미입력:
  -- - absent, not_entered, 출석기록 없음은 출석 미인정
  -- ---------------------------------------------------------
  if v_base_date is not null then
    select
      count(m.id)::integer,
      count(a.id) filter (
        where a.status in ('present', 'recognized', 'late', 'early_leave')
      )::integer
    into
      v_attendance_total_count,
      v_attendance_present_count
    from public.meetings m
    left join public.attendance a
      on a.meeting_id = m.id
     and a.scout_id = p_scout_id
     and a.deleted_at is null
    where m.organization_id = v_scout.organization_id
      and m.deleted_at is null
      and m.is_attendance_target = true
      and m.meeting_date >= v_base_date
      and m.meeting_date <= p_review_date;

    if v_attendance_total_count > 0 then
      v_attendance_rate := round(
        (v_attendance_present_count::numeric * 100.0 / v_attendance_total_count::numeric),
        2
      );
    else
      v_attendance_rate := 0;
    end if;

    -- 출석률은 진급 판정 조건에서 제외한다.
    -- 집회/출석 데이터는 참고 지표로만 저장하고, 최종 판정에는 영향을 주지 않는다.
    v_attendance_passed := true;
  else
    v_attendance_total_count := 0;
    v_attendance_present_count := 0;
    v_attendance_rate := 0;
    -- 기준일이 없어도 출석률은 판정 제외 항목이므로 출석 조건 자체는 통과로 저장한다.
    v_attendance_passed := true;
  end if;

  -- ---------------------------------------------------------
  -- 6. 필수기능장 판정
  -- ---------------------------------------------------------
  for v_required_badge in
    select
      b.id as badge_id,
      b.name as badge_name,
      b.special_rule,
      sb.id as scout_badge_id,
      sb.acquired_at,
      sb.approved_at
    from public.rank_required_badges rrb
    join public.badges b on b.id = rrb.badge_id
    left join public.scout_badges sb
      on sb.badge_id = b.id
     and sb.scout_id = p_scout_id
     and sb.deleted_at is null
    where rrb.rank_requirement_id = v_requirement.rank_requirement_id
    order by b.name
  loop
    v_badge_ok := false;
    v_badge_fail_reason := null;

    if v_required_badge.scout_badge_id is null then
      v_badge_fail_reason := '미취득';
    else
      if v_required_badge.special_rule = 'none'::badge_special_rule then
        v_badge_ok := true;

      elsif v_required_badge.special_rule = 'after_swimming_badge'::badge_special_rule then
        select sb.acquired_at
        into v_swimming_acquired_at
        from public.scout_badges sb
        join public.badges b on b.id = sb.badge_id
        where sb.scout_id = p_scout_id
          and sb.deleted_at is null
          and b.name = '수영장'
        order by sb.acquired_at desc
        limit 1;

        if v_swimming_acquired_at is not null
           and v_required_badge.acquired_at > v_swimming_acquired_at then
          v_badge_ok := true;
        else
          v_badge_fail_reason := '구조장은 수영장 취득 후 취득한 경우만 인정됩니다.';
        end if;

      elsif v_required_badge.special_rule = 'after_mugunghwa_rank'::badge_special_rule then
        select max(srh.approved_at)
        into v_mugunghwa_approved_at
        from public.scout_rank_histories srh
        join public.ranks r on r.id = srh.rank_id
        where srh.scout_id = p_scout_id
          and srh.deleted_at is null
          and r.rank_code = 'mugunghwa';

        if v_mugunghwa_approved_at is not null
           and v_required_badge.acquired_at > v_mugunghwa_approved_at then
          v_badge_ok := true;
        else
          v_badge_fail_reason := '생존장은 무궁화 진급 인가일 후 취득한 경우만 인정됩니다.';
        end if;
      end if;
    end if;

    if not v_badge_ok then
      v_required_badges_passed := false;

      v_missing_items := v_missing_items || jsonb_build_array(
        jsonb_build_object(
          'type', 'required_badge',
          'badge_name', v_required_badge.badge_name,
          'message', coalesce(v_badge_fail_reason, '필수기능장 조건 미충족')
        )
      );
    end if;
  end loop;

  -- ---------------------------------------------------------
  -- 7. 일반기능장 판정
  -- 이전에 취득했으나 아직 진급에 사용하지 않은 일반기능장 인정
  -- 이미 promotion_badge_usages에 사용된 기능장은 재사용 불가
  -- ---------------------------------------------------------
  v_general_required_count := v_requirement.required_general_badge_count;

  select count(sb.id)::integer
  into v_general_available_count
  from public.scout_badges sb
  join public.badges b on b.id = sb.badge_id
  where sb.scout_id = p_scout_id
    and sb.organization_id = v_scout.organization_id
    and sb.deleted_at is null
    and b.is_general_badge = true
    and not exists (
      select 1
      from public.promotion_badge_usages pbu
      where pbu.scout_badge_id = sb.id
        and pbu.deleted_at is null
    );

  v_general_badges_passed := v_general_available_count >= v_general_required_count;

  if not v_general_badges_passed then
    v_missing_items := v_missing_items || jsonb_build_array(
      jsonb_build_object(
        'type', 'general_badge',
        'message', '사용 가능한 일반기능장 수가 부족합니다.',
        'required_count', v_general_required_count,
        'available_count', v_general_available_count,
        'missing_count', greatest(v_general_required_count - v_general_available_count, 0)
      )
    );
  end if;

  -- ---------------------------------------------------------
  -- 8. WSEP 또는 MoP 판정
  -- 범스카우트 진급 단계에서만 요구
  -- 이수 시점은 급위와 무관하게 인정
  -- ---------------------------------------------------------
  if v_requirement.requires_wsep_or_mop then
    select exists (
      select 1
      from public.program_completions pc
      where pc.scout_id = p_scout_id
        and pc.organization_id = v_scout.organization_id
        and pc.deleted_at is null
        and pc.program_type in ('WSEP', 'MoP')
    )
    into v_program_passed;

    if not v_program_passed then
      v_missing_items := v_missing_items || jsonb_build_array(
        jsonb_build_object(
          'type', 'program',
          'message', '범스카우트 진급에는 WSEP 또는 MoP 중 1개 이상 이수가 필요합니다.'
        )
      );
    end if;
  else
    v_program_passed := true;
  end if;

  -- ---------------------------------------------------------
  -- 9. 최종 판정
  -- ---------------------------------------------------------
  v_final_passed :=
    v_period_passed
    and v_attendance_passed
    and v_required_badges_passed
    and v_general_badges_passed
    and v_program_passed;

  -- ---------------------------------------------------------
  -- 10. 판정 결과 저장
  -- ---------------------------------------------------------
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
    note
  )
  values (
    v_scout.organization_id,
    p_scout_id,
    v_requirement.from_rank_id,
    v_requirement.to_rank_id,

    p_review_date,
    v_base_date,
    v_available_at,

    v_requirement.required_months,
    v_days_remaining,

    v_period_passed,

    v_attendance_total_count,
    v_attendance_present_count,
    v_attendance_rate,
    v_attendance_passed,

    v_required_badges_passed,
    v_general_badges_passed,
    v_program_passed,

    v_final_passed,
    v_missing_items,
    '자동 진급 판정'
  )
  returning id into v_review_id;

  return v_review_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.review_scout_promotion(p_scout_id uuid, p_review_date date DEFAULT CURRENT_DATE)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_review_id uuid;
  v_review record;
  v_attendance_required boolean := false;
  v_required_rate numeric(5,2) := 0;
  v_total_count integer := 0;
  v_present_count integer := 0;
  v_rate numeric(5,2) := 0;
  v_passed boolean := true;
  v_missing_items jsonb := '[]'::jsonb;
begin
  -- 기존 판정 로직 실행
  v_review_id := public.review_scout_promotion_core(
    p_scout_id,
    p_review_date
  );

  select
    pr.id,
    pr.organization_id,
    pr.scout_id,
    pr.from_rank_id,
    pr.to_rank_id,
    pr.review_date,
    pr.base_date,
    pr.final_passed,
    pr.missing_items,
    coalesce(rr.required_attendance_rate, 0) as required_attendance_rate,
    coalesce(o.beom_attendance_required, false) as beom_attendance_required,
    tr.rank_code as to_rank_code,
    tr.rank_name as to_rank_name
  into v_review
  from public.promotion_reviews pr
  join public.rank_requirements rr
    on rr.from_rank_id = pr.from_rank_id
   and rr.to_rank_id = pr.to_rank_id
  join public.ranks tr
    on tr.id = pr.to_rank_id
  join public.organizations o
    on o.id = pr.organization_id
  where pr.id = v_review_id
    and pr.deleted_at is null;

  if not found then
    raise exception '생성된 진급 판정 결과를 찾을 수 없습니다. review_id=%', v_review_id;
  end if;

  -- 범 진급인지 확인
  v_attendance_required :=
    (
      v_review.to_rank_code = 'beom'
      or regexp_replace(coalesce(v_review.to_rank_name, ''), '\s+', '', 'g') = '범'
    )
    and v_review.beom_attendance_required;

  v_required_rate := coalesce(v_review.required_attendance_rate, 0);

  -- 출석률은 체험/운영 구분과 관계없이 항상 계산하여 저장
  if v_review.base_date is not null then
    select
      count(m.id)::integer,
      count(a.id) filter (
        where a.status::text in (
          'present',
          'recognized',
          'excused',
          'late',
          'early_leave'
        )
      )::integer
    into
      v_total_count,
      v_present_count
    from public.meetings m
    left join public.attendance a
      on a.meeting_id = m.id
     and a.scout_id = v_review.scout_id
     and a.deleted_at is null
    where m.organization_id = v_review.organization_id
      and m.deleted_at is null
      and m.is_attendance_target = true
      and m.meeting_date >= v_review.base_date
      and m.meeting_date <= v_review.review_date;
  end if;

  if v_total_count > 0 then
    v_rate := round(
      v_present_count::numeric * 100.0 / v_total_count::numeric,
      2
    );
  else
    v_rate := 0;
  end if;

  if v_attendance_required then
    -- 운영판 범 진급:
    -- 출석 대상 집회가 1회 이상이고 필수 출석률 이상이어야 통과
    v_passed :=
      v_total_count > 0
      and v_rate >= v_required_rate;
  else
    -- 체험기간 또는 범 외 급위:
    -- 출석률은 참고 지표이며 판정에는 영향 없음
    v_passed := true;
  end if;

  v_missing_items := coalesce(v_review.missing_items, '[]'::jsonb);

  -- 기존 attendance 항목 제거 후 현재 정책 기준으로 다시 기록
  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into v_missing_items
  from jsonb_array_elements(v_missing_items) as item
  where coalesce(item->>'type', '') <> 'attendance';

  if v_attendance_required and not v_passed then
    v_missing_items := v_missing_items || jsonb_build_array(
      jsonb_build_object(
        'type', 'attendance',
        'message', '범 진급 출석률 기준을 충족하지 못했습니다.',
        'required_rate', v_required_rate,
        'attendance_rate', v_rate,
        'attendance_total_count', v_total_count,
        'attendance_present_count', v_present_count
      )
    );
  end if;

  update public.promotion_reviews
  set
    attendance_total_count = v_total_count,
    attendance_present_count = v_present_count,
    attendance_rate = v_rate,
    attendance_passed = v_passed,
    final_passed =
      case
        when v_attendance_required then v_review.final_passed and v_passed
        else v_review.final_passed
      end,
    missing_items = v_missing_items,
    note =
      case
        when v_attendance_required
          then '현재 실제 기록 기준 자동 진급 판정 · 범 진급 출석률 필수 적용'
        else '현재 실제 기록 기준 자동 진급 판정 · 출석률 참고 지표'
      end
  where id = v_review_id;

  return v_review_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.approve_scout_promotion(p_promotion_review_id uuid, p_approved_at date DEFAULT CURRENT_DATE, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_review record;
  v_scout record;
  v_requirement record;

  v_existing_rank_history_count integer := 0;
  v_general_required_count integer := 0;
  v_general_available_count integer := 0;

  v_rank_history_id uuid;
  v_used_count integer := 0;
begin
  -- ---------------------------------------------------------
  -- 1. 진급 판정 결과 확인
  -- ---------------------------------------------------------
  select
    pr.id,
    pr.organization_id,
    pr.scout_id,
    pr.from_rank_id,
    pr.to_rank_id,
    pr.final_passed,
    pr.review_date,
    pr.deleted_at,
    fr.rank_name as from_rank_name,
    tr.rank_name as to_rank_name
  into v_review
  from public.promotion_reviews pr
  join public.ranks fr on fr.id = pr.from_rank_id
  join public.ranks tr on tr.id = pr.to_rank_id
  where pr.id = p_promotion_review_id
    and pr.deleted_at is null;

  if not found then
    raise exception '진급 판정 결과를 찾을 수 없습니다. promotion_review_id=%', p_promotion_review_id;
  end if;

  if not v_review.final_passed then
    raise exception '최종 판정이 진급 가능 상태가 아닙니다. promotion_review_id=%', p_promotion_review_id;
  end if;

  -- 앱에서 호출할 경우 자기 대 수정 권한 필요
  -- SQL Editor/service role에서 실행할 경우 auth.uid()가 null일 수 있으므로 예외적으로 허용
  if auth.uid() is not null and not public.can_modify_org(v_review.organization_id) then
    raise exception '해당 대원의 진급 인가 권한이 없습니다. promotion_review_id=%', p_promotion_review_id;
  end if;

  -- ---------------------------------------------------------
  -- 2. 대원 현재 상태 확인
  -- ---------------------------------------------------------
  select
    s.id,
    s.organization_id,
    s.name,
    s.member_no,
    s.current_rank_id,
    r.rank_name as current_rank_name
  into v_scout
  from public.scouts s
  left join public.ranks r on r.id = s.current_rank_id
  where s.id = v_review.scout_id
    and s.deleted_at is null;

  if not found then
    raise exception '대원을 찾을 수 없습니다. scout_id=%', v_review.scout_id;
  end if;

  if v_scout.organization_id <> v_review.organization_id then
    raise exception '대원 소속과 판정 결과 소속이 일치하지 않습니다.';
  end if;

  if v_scout.current_rank_id <> v_review.from_rank_id then
    raise exception
      '현재 급위가 판정 당시 급위와 다릅니다. 현재=%, 판정=%',
      v_scout.current_rank_name,
      v_review.from_rank_name;
  end if;

  -- ---------------------------------------------------------
  -- 3. 같은 다음 급위가 이미 인가되어 있는지 확인
  -- ---------------------------------------------------------
  select count(*)
  into v_existing_rank_history_count
  from public.scout_rank_histories srh
  where srh.scout_id = v_review.scout_id
    and srh.rank_id = v_review.to_rank_id
    and srh.deleted_at is null;

  if v_existing_rank_history_count > 0 then
    raise exception
      '이미 해당 급위 인가 이력이 있습니다. 대원=%, 급위=%',
      v_scout.name,
      v_review.to_rank_name;
  end if;

  -- ---------------------------------------------------------
  -- 4. 진급 조건에서 일반기능장 필요 개수 확인
  -- ---------------------------------------------------------
  select
    rr.required_general_badge_count
  into v_requirement
  from public.rank_requirements rr
  where rr.from_rank_id = v_review.from_rank_id
    and rr.to_rank_id = v_review.to_rank_id;

  if not found then
    raise exception '진급 조건을 찾을 수 없습니다.';
  end if;

  v_general_required_count := v_requirement.required_general_badge_count;

  -- ---------------------------------------------------------
  -- 5. 일반기능장이 필요한 경우 사용 가능한 개수 재확인
  -- 판정 이후 데이터가 변경되었을 수 있으므로 인가 시점에 다시 확인
  -- ---------------------------------------------------------
  if v_general_required_count > 0 then
    select count(sb.id)::integer
    into v_general_available_count
    from public.scout_badges sb
    join public.badges b on b.id = sb.badge_id
    where sb.scout_id = v_review.scout_id
      and sb.organization_id = v_review.organization_id
      and sb.deleted_at is null
      and b.is_general_badge = true
      and not exists (
        select 1
        from public.promotion_badge_usages pbu
        where pbu.scout_badge_id = sb.id
          and pbu.deleted_at is null
      );

    if v_general_available_count < v_general_required_count then
      raise exception
        '인가 시점에 사용 가능한 일반기능장이 부족합니다. 필요=%, 가능=%',
        v_general_required_count,
        v_general_available_count;
    end if;
  end if;

  -- ---------------------------------------------------------
  -- 6. 진급 인가 이력 생성
  -- ---------------------------------------------------------
  insert into public.scout_rank_histories (
    organization_id,
    scout_id,
    rank_id,
    approved_at,
    approval_type,
    note
  )
  values (
    v_review.organization_id,
    v_review.scout_id,
    v_review.to_rank_id,
    p_approved_at,
    'normal'::approval_type,
    coalesce(p_note, '진급 판정 결과에 따른 인가 처리')
  )
  returning id into v_rank_history_id;

  -- ---------------------------------------------------------
  -- 7. 대원 현재 급위 업데이트
  -- ---------------------------------------------------------
  update public.scouts
  set
    current_rank_id = v_review.to_rank_id,
    updated_at = now()
  where id = v_review.scout_id;

  -- ---------------------------------------------------------
  -- 8. 일반기능장 사용 이력 생성
  -- 필요한 개수만큼 오래된 취득일 순으로 자동 배정
  -- ---------------------------------------------------------
  if v_general_required_count > 0 then
    with available_general_badges as (
      select
        sb.id as scout_badge_id
      from public.scout_badges sb
      join public.badges b on b.id = sb.badge_id
      where sb.scout_id = v_review.scout_id
        and sb.organization_id = v_review.organization_id
        and sb.deleted_at is null
        and b.is_general_badge = true
        and not exists (
          select 1
          from public.promotion_badge_usages pbu
          where pbu.scout_badge_id = sb.id
            and pbu.deleted_at is null
        )
      order by
        sb.acquired_at asc,
        sb.approved_at asc nulls last,
        sb.created_at asc,
        sb.id asc
      limit v_general_required_count
    )
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
      v_review.organization_id,
      v_review.scout_id,
      agb.scout_badge_id,
      v_review.from_rank_id,
      v_review.to_rank_id,
      p_approved_at,
      v_review.id
    from available_general_badges agb;

    get diagnostics v_used_count = row_count;

    if v_used_count <> v_general_required_count then
      raise exception
        '일반기능장 사용 이력 생성 개수가 일치하지 않습니다. 필요=%, 생성=%',
        v_general_required_count,
        v_used_count;
    end if;
  end if;

  return v_rank_history_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.approve_initial_beginner_rank(p_scout_id uuid, p_approved_at date DEFAULT CURRENT_DATE, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_scout record;
  v_beginner_rank record;
  v_existing_count integer := 0;
  v_rank_history_id uuid;
  v_approval_type approval_type;
  v_note text;
begin
  -- ---------------------------------------------------------
  -- 1. 대원 확인
  -- ---------------------------------------------------------
  select
    s.id,
    s.organization_id,
    s.name,
    s.member_no,
    s.current_rank_id,
    s.is_from_cub_scout,
    s.cub_promotion_completed,
    s.beginner_course_exempted
  into v_scout
  from public.scouts s
  where s.id = p_scout_id
    and s.deleted_at is null;

  if not found then
    raise exception '대원을 찾을 수 없습니다. scout_id=%', p_scout_id;
  end if;

  -- ---------------------------------------------------------
  -- 2. 권한 확인
  -- SQL Editor/service role에서 실행할 경우 auth.uid()가 null일 수 있으므로 예외 허용
  -- ---------------------------------------------------------
  if auth.uid() is not null and not public.can_modify_org(v_scout.organization_id) then
    raise exception '해당 대원의 초급 인가 권한이 없습니다. scout_id=%', p_scout_id;
  end if;

  -- ---------------------------------------------------------
  -- 3. 이미 현재급위가 있으면 최초 초급 인가 불가
  -- ---------------------------------------------------------
  if v_scout.current_rank_id is not null then
    raise exception '이미 현재급위가 등록되어 있습니다. 대원=%, scout_id=%', v_scout.name, p_scout_id;
  end if;

  -- ---------------------------------------------------------
  -- 4. 초급 급위 확인
  -- ---------------------------------------------------------
  select
    r.id,
    r.rank_code,
    r.rank_name
  into v_beginner_rank
  from public.ranks r
  where r.rank_code = 'beginner'
  limit 1;

  if not found then
    raise exception '초급 급위 데이터를 찾을 수 없습니다. ranks.rank_code=beginner';
  end if;

  -- ---------------------------------------------------------
  -- 5. 초급 인가이력 중복 확인
  -- ---------------------------------------------------------
  select count(*)
  into v_existing_count
  from public.scout_rank_histories srh
  where srh.scout_id = p_scout_id
    and srh.rank_id = v_beginner_rank.id
    and srh.deleted_at is null;

  if v_existing_count > 0 then
    raise exception '이미 초급 인가 이력이 있습니다. 대원=%, scout_id=%', v_scout.name, p_scout_id;
  end if;

  -- ---------------------------------------------------------
  -- 6. 인가 유형 결정
  -- 컵스카우트 출신 + 승진과정 이수 + 초급면제 표시인 경우 cub_beginner_approval
  -- ---------------------------------------------------------
  if v_scout.is_from_cub_scout
     and v_scout.cub_promotion_completed
     and v_scout.beginner_course_exempted then
    v_approval_type := 'cub_beginner_approval'::approval_type;
    v_note := coalesce(p_note, '컵스카우트 승진과정 이수에 따른 초급과정 면제 및 초급 인가');
  else
    v_approval_type := 'normal'::approval_type;
    v_note := coalesce(p_note, '초급 최초 인가');
  end if;

  -- ---------------------------------------------------------
  -- 7. 초급 인가이력 생성
  -- ---------------------------------------------------------
  insert into public.scout_rank_histories (
    organization_id,
    scout_id,
    rank_id,
    approved_at,
    approval_type,
    note
  )
  values (
    v_scout.organization_id,
    p_scout_id,
    v_beginner_rank.id,
    p_approved_at,
    v_approval_type,
    v_note
  )
  returning id into v_rank_history_id;

  -- ---------------------------------------------------------
  -- 8. 대원 현재급위 초급으로 업데이트
  -- ---------------------------------------------------------
  update public.scouts
  set
    current_rank_id = v_beginner_rank.id,
    updated_at = now()
  where id = p_scout_id;

  return v_rank_history_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_scout_badge_record(p_scout_id uuid, p_badge_id uuid, p_acquired_at date, p_approved_at date DEFAULT NULL::date, p_instructor_name text DEFAULT NULL::text, p_leader_confirmed boolean DEFAULT false, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_scout record;
  v_badge record;
  v_existing_count integer := 0;
  v_scout_badge_id uuid;

  v_swimming_acquired_at date;
  v_mugunghwa_approved_at date;
begin
  -- ---------------------------------------------------------
  -- 1. 대원 확인
  -- ---------------------------------------------------------
  select
    s.id,
    s.organization_id,
    s.name,
    s.member_no
  into v_scout
  from public.scouts s
  where s.id = p_scout_id
    and s.deleted_at is null;

  if not found then
    raise exception '대원을 찾을 수 없습니다. scout_id=%', p_scout_id;
  end if;

  -- ---------------------------------------------------------
  -- 2. 권한 확인
  -- SQL Editor/service role에서 실행할 경우 auth.uid()가 null일 수 있으므로 예외 허용
  -- ---------------------------------------------------------
  if auth.uid() is not null and not public.can_modify_org(v_scout.organization_id) then
    raise exception '해당 대원의 기능장 등록 권한이 없습니다. scout_id=%', p_scout_id;
  end if;

  -- ---------------------------------------------------------
  -- 3. 기능장 확인
  -- ---------------------------------------------------------
  select
    b.id,
    b.name,
    b.special_rule
  into v_badge
  from public.badges b
  where b.id = p_badge_id;

  if not found then
    raise exception '기능장 정보를 찾을 수 없습니다. badge_id=%', p_badge_id;
  end if;

  -- ---------------------------------------------------------
  -- 4. 날짜 확인
  -- ---------------------------------------------------------
  if p_acquired_at is null then
    raise exception '취득일은 필수입니다.';
  end if;

  if p_approved_at is not null and p_approved_at < p_acquired_at then
    raise exception '인가일은 취득일보다 빠를 수 없습니다.';
  end if;

  -- ---------------------------------------------------------
  -- 5. 중복 취득 방지
  -- ---------------------------------------------------------
  select count(*)
  into v_existing_count
  from public.scout_badges sb
  where sb.scout_id = p_scout_id
    and sb.badge_id = p_badge_id
    and sb.deleted_at is null;

  if v_existing_count > 0 then
    raise exception '이미 등록된 기능장입니다. 대원=%, 기능장=%', v_scout.name, v_badge.name;
  end if;

  -- ---------------------------------------------------------
  -- 6. 특수 취득 조건 확인
  -- 구조장: 수영장 취득 후 취득 가능
  -- 생존장: 무궁화 스카우트 진급 후 취득 가능
  -- 그 외 기능장: 급위와 관계없이 취득 가능
  -- ---------------------------------------------------------

  -- 6-1. 구조장 조건
  if v_badge.name = '구조장'
     or v_badge.special_rule = 'after_swimming_badge'::badge_special_rule then

    select max(sb.acquired_at)
    into v_swimming_acquired_at
    from public.scout_badges sb
    join public.badges b
      on b.id = sb.badge_id
    where sb.scout_id = p_scout_id
      and sb.organization_id = v_scout.organization_id
      and sb.deleted_at is null
      and b.name = '수영장'
      and sb.acquired_at < p_acquired_at;

    if v_swimming_acquired_at is null then
      raise exception
        '구조장은 수영장을 먼저 취득한 후 등록할 수 있습니다. 대원=%, 구조장 취득일=%',
        v_scout.name,
        p_acquired_at;
    end if;
  end if;

  -- 6-2. 생존장 조건
  if v_badge.name = '생존장'
     or v_badge.special_rule = 'after_mugunghwa_rank'::badge_special_rule then

    select max(srh.approved_at)
    into v_mugunghwa_approved_at
    from public.scout_rank_histories srh
    join public.ranks r
      on r.id = srh.rank_id
    where srh.scout_id = p_scout_id
      and srh.organization_id = v_scout.organization_id
      and srh.deleted_at is null
      and r.rank_code = 'mugunghwa'
      and srh.approved_at < p_acquired_at;

    if v_mugunghwa_approved_at is null then
      raise exception
        '생존장은 무궁화 스카우트 진급 인가 후 등록할 수 있습니다. 대원=%, 생존장 취득일=%',
        v_scout.name,
        p_acquired_at;
    end if;
  end if;

  -- ---------------------------------------------------------
  -- 7. 대원 기능장 취득 기록 생성
  -- ---------------------------------------------------------
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
    nullif(trim(coalesce(p_instructor_name, '')), ''),
    p_leader_confirmed,
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning id into v_scout_badge_id;

  return v_scout_badge_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_scout_badge_record(p_scout_badge_id uuid, p_badge_id uuid, p_acquired_at date, p_approved_at date DEFAULT NULL::date, p_instructor_name text DEFAULT NULL::text, p_leader_confirmed boolean DEFAULT false, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_current record;
  v_scout record;
  v_badge record;
  v_existing_count integer := 0;
  v_used_count integer := 0;
  v_invalid_rescue_badge record;
  v_mugunghwa_approved_at date;
begin
  -- ---------------------------------------------------------
  -- 1. 기존 기능장 취득 기록 확인
  -- ---------------------------------------------------------
  select
    sb.id,
    sb.organization_id,
    sb.scout_id,
    sb.badge_id,
    sb.acquired_at,
    sb.approved_at,
    b.name as current_badge_name
  into v_current
  from public.scout_badges sb
  join public.badges b on b.id = sb.badge_id
  where sb.id = p_scout_badge_id
    and sb.deleted_at is null;

  if not found then
    raise exception '기능장 취득 기록을 찾을 수 없습니다. scout_badge_id=%', p_scout_badge_id;
  end if;

  -- ---------------------------------------------------------
  -- 2. 권한 확인
  -- SQL Editor/service role에서 실행할 경우 auth.uid()가 null일 수 있으므로 예외 허용
  -- ---------------------------------------------------------
  if auth.uid() is not null and not public.can_modify_org(v_current.organization_id) then
    raise exception '해당 기능장 취득 기록을 수정할 권한이 없습니다. scout_badge_id=%', p_scout_badge_id;
  end if;

  -- ---------------------------------------------------------
  -- 3. 진급 사용 이력 보호
  -- 현재 스키마에서 명시적으로 확인 가능한 사용 이력은 promotion_badge_usages 기준이다.
  -- ---------------------------------------------------------
  select count(*)
  into v_used_count
  from public.promotion_badge_usages pbu
  where pbu.scout_badge_id = p_scout_badge_id
    and pbu.deleted_at is null;

  if v_used_count > 0 then
    raise exception '이미 진급 인가에 사용된 기능장 기록은 수정할 수 없습니다. scout_badge_id=%', p_scout_badge_id;
  end if;

  -- ---------------------------------------------------------
  -- 4. 대원 확인
  -- ---------------------------------------------------------
  select
    s.id,
    s.organization_id,
    s.name,
    s.member_no
  into v_scout
  from public.scouts s
  where s.id = v_current.scout_id
    and s.deleted_at is null;

  if not found then
    raise exception '대원을 찾을 수 없습니다. scout_id=%', v_current.scout_id;
  end if;

  if v_scout.organization_id <> v_current.organization_id then
    raise exception '대원 소속과 기능장 기록 소속이 일치하지 않습니다.';
  end if;

  -- ---------------------------------------------------------
  -- 5. 변경 대상 기능장 확인
  -- ---------------------------------------------------------
  select
    b.id,
    b.name,
    b.special_rule
  into v_badge
  from public.badges b
  where b.id = p_badge_id;

  if not found then
    raise exception '기능장 정보를 찾을 수 없습니다. badge_id=%', p_badge_id;
  end if;

  -- ---------------------------------------------------------
  -- 6. 날짜 확인
  -- ---------------------------------------------------------
  if p_acquired_at is null then
    raise exception '취득일은 필수입니다.';
  end if;

  if p_approved_at is not null and p_approved_at < p_acquired_at then
    raise exception '인가일은 취득일보다 빠를 수 없습니다.';
  end if;

  -- ---------------------------------------------------------
  -- 7. 중복 취득 방지
  -- ---------------------------------------------------------
  select count(*)
  into v_existing_count
  from public.scout_badges sb
  where sb.scout_id = v_current.scout_id
    and sb.badge_id = p_badge_id
    and sb.id <> p_scout_badge_id
    and sb.deleted_at is null;

  if v_existing_count > 0 then
    raise exception '이미 등록된 기능장입니다. 대원=%, 기능장=%', v_scout.name, v_badge.name;
  end if;

  -- ---------------------------------------------------------
  -- 8. 기능장 취득 기록 수정
  -- ---------------------------------------------------------
  update public.scout_badges
  set
    badge_id = p_badge_id,
    acquired_at = p_acquired_at,
    approved_at = p_approved_at,
    instructor_name = nullif(trim(coalesce(p_instructor_name, '')), ''),
    leader_confirmed = coalesce(p_leader_confirmed, false),
    note = nullif(trim(coalesce(p_note, '')), ''),
    updated_at = now()
  where id = p_scout_badge_id
    and deleted_at is null;

  -- ---------------------------------------------------------
  -- 9. 구조장 조건 재검증
  -- 구조장: 수영장을 먼저 취득한 후 취득 가능
  -- 수정 결과로 수영장-구조장 순서가 깨지면 롤백된다.
  -- ---------------------------------------------------------
  select
    sb.id,
    sb.acquired_at
  into v_invalid_rescue_badge
  from public.scout_badges sb
  join public.badges b on b.id = sb.badge_id
  where sb.scout_id = v_current.scout_id
    and sb.organization_id = v_current.organization_id
    and sb.deleted_at is null
    and (b.name = '구조장' or b.special_rule = 'after_swimming_badge'::badge_special_rule)
    and not exists (
      select 1
      from public.scout_badges swimming_sb
      join public.badges swimming_b on swimming_b.id = swimming_sb.badge_id
      where swimming_sb.scout_id = sb.scout_id
        and swimming_sb.organization_id = sb.organization_id
        and swimming_sb.deleted_at is null
        and swimming_b.name = '수영장'
        and swimming_sb.acquired_at < sb.acquired_at
    )
  order by sb.acquired_at asc
  limit 1;

  if found then
    raise exception
      '구조장은 수영장을 먼저 취득한 후 등록할 수 있습니다. 대원=%, 구조장 취득일=%',
      v_scout.name,
      v_invalid_rescue_badge.acquired_at;
  end if;

  -- ---------------------------------------------------------
  -- 10. 생존장 조건 재검증
  -- 생존장: 무궁화 스카우트 진급 인가 후 취득 가능
  -- ---------------------------------------------------------
  if v_badge.name = '생존장'
     or v_badge.special_rule = 'after_mugunghwa_rank'::badge_special_rule then

    select max(srh.approved_at)
    into v_mugunghwa_approved_at
    from public.scout_rank_histories srh
    join public.ranks r on r.id = srh.rank_id
    where srh.scout_id = v_current.scout_id
      and srh.organization_id = v_current.organization_id
      and srh.deleted_at is null
      and r.rank_code = 'mugunghwa'
      and srh.approved_at < p_acquired_at;

    if v_mugunghwa_approved_at is null then
      raise exception
        '생존장은 무궁화 스카우트 진급 인가 후 등록할 수 있습니다. 대원=%, 생존장 취득일=%',
        v_scout.name,
        p_acquired_at;
    end if;
  end if;

  return p_scout_badge_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.archive_scout_badge_record(p_scout_badge_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_current record;
  v_scout record;
  v_used_count integer := 0;
  v_rescue_count integer := 0;
begin
  -- ---------------------------------------------------------
  -- 1. 기존 기능장 취득 기록 확인
  -- ---------------------------------------------------------
  select
    sb.id,
    sb.organization_id,
    sb.scout_id,
    sb.badge_id,
    sb.acquired_at,
    b.name as badge_name,
    b.special_rule
  into v_current
  from public.scout_badges sb
  join public.badges b on b.id = sb.badge_id
  where sb.id = p_scout_badge_id
    and sb.deleted_at is null;

  if not found then
    raise exception '기능장 취득 기록을 찾을 수 없습니다. scout_badge_id=%', p_scout_badge_id;
  end if;

  -- ---------------------------------------------------------
  -- 2. 권한 확인
  -- ---------------------------------------------------------
  if auth.uid() is not null and not public.can_modify_org(v_current.organization_id) then
    raise exception '해당 기능장 취득 기록을 삭제할 권한이 없습니다. scout_badge_id=%', p_scout_badge_id;
  end if;

  -- ---------------------------------------------------------
  -- 3. 대원 확인
  -- ---------------------------------------------------------
  select
    s.id,
    s.organization_id,
    s.name,
    s.member_no
  into v_scout
  from public.scouts s
  where s.id = v_current.scout_id
    and s.deleted_at is null;

  if not found then
    raise exception '대원을 찾을 수 없습니다. scout_id=%', v_current.scout_id;
  end if;

  -- ---------------------------------------------------------
  -- 4. 진급 사용 이력 보호
  -- ---------------------------------------------------------
  select count(*)
  into v_used_count
  from public.promotion_badge_usages pbu
  where pbu.scout_badge_id = p_scout_badge_id
    and pbu.deleted_at is null;

  if v_used_count > 0 then
    raise exception '이미 진급 인가에 사용된 기능장 기록은 삭제할 수 없습니다. scout_badge_id=%', p_scout_badge_id;
  end if;

  -- ---------------------------------------------------------
  -- 5. 수영장 삭제 보호
  -- 구조장이 등록되어 있으면 수영장 삭제 시 구조장 조건이 깨지므로 삭제 제한
  -- ---------------------------------------------------------
  if v_current.badge_name = '수영장' then
    select count(*)
    into v_rescue_count
    from public.scout_badges sb
    join public.badges b on b.id = sb.badge_id
    where sb.scout_id = v_current.scout_id
      and sb.organization_id = v_current.organization_id
      and sb.deleted_at is null
      and (b.name = '구조장' or b.special_rule = 'after_swimming_badge'::badge_special_rule);

    if v_rescue_count > 0 then
      raise exception '구조장이 등록되어 있어 수영장을 삭제할 수 없습니다. 먼저 구조장 기록을 정리해야 합니다. 대원=%', v_scout.name;
    end if;
  end if;

  -- ---------------------------------------------------------
  -- 6. 실제 삭제가 아니라 숨김 처리
  -- ---------------------------------------------------------
  update public.scout_badges
  set
    deleted_at = now(),
    updated_at = now()
  where id = p_scout_badge_id
    and deleted_at is null;

  return p_scout_badge_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.archive_promotion_review(p_promotion_review_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_user_organization_id uuid;
  v_review record;
  v_already_approved boolean := false;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select up.role::text, up.organization_id
  into v_user_role, v_user_organization_id
  from public.user_profiles up
  where up.user_id = v_user_id
    and up.deleted_at is null
  limit 1;

  if v_user_role is null then
    raise exception '사용자 권한 정보를 확인할 수 없습니다.';
  end if;

  if v_user_role not in ('super_admin', 'org_admin', 'leader') then
    raise exception '진급 판정 결과 숨김 권한이 없습니다.';
  end if;

  select
    pr.id,
    pr.organization_id,
    pr.scout_id,
    pr.from_rank_id,
    pr.to_rank_id
  into v_review
  from public.promotion_reviews pr
  where pr.id = p_promotion_review_id
    and pr.deleted_at is null
  limit 1;

  if v_review.id is null then
    raise exception '숨김 처리할 진급 판정 결과를 찾을 수 없습니다.';
  end if;

  if v_user_role <> 'super_admin'
     and (
       v_user_organization_id is null
       or v_user_organization_id <> v_review.organization_id
     ) then
    raise exception '다른 조직의 진급 판정 결과는 숨김 처리할 수 없습니다.';
  end if;

  select exists (
    select 1
    from public.scout_rank_histories h
    where h.scout_id = v_review.scout_id
      and h.rank_id = v_review.to_rank_id
      and h.deleted_at is null
  )
  into v_already_approved;

  if v_already_approved then
    raise exception '이미 인가된 급위와 관련된 판정 결과는 보호되어 숨김 처리할 수 없습니다.';
  end if;

  update public.promotion_reviews pr
  set
    deleted_at = now(),
    updated_at = now(),
    note = case
      when pr.note is null or length(btrim(pr.note)) = 0
        then '사용자 숨김 처리'
      else pr.note || ' / 사용자 숨김 처리'
    end
  where pr.id = p_promotion_review_id
    and pr.deleted_at is null;

  return p_promotion_review_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_promotion_reviews(p_scout_id uuid, p_from_rank_id uuid, p_to_rank_id uuid, p_keep_latest boolean DEFAULT true)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_user_organization_id uuid;
  v_scout_organization_id uuid;
  v_already_approved boolean := false;
  v_keep_review_id uuid;
  v_archived_count integer := 0;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select up.role::text, up.organization_id
  into v_user_role, v_user_organization_id
  from public.user_profiles up
  where up.user_id = v_user_id
    and up.deleted_at is null
  limit 1;

  if v_user_role is null then
    raise exception '사용자 권한 정보를 확인할 수 없습니다.';
  end if;

  if v_user_role not in ('super_admin', 'org_admin', 'leader') then
    raise exception '진급 판정 기록 정리 권한이 없습니다.';
  end if;

  select s.organization_id
  into v_scout_organization_id
  from public.scouts s
  where s.id = p_scout_id
    and s.deleted_at is null
  limit 1;

  if v_scout_organization_id is null then
    raise exception '대원 정보를 찾을 수 없습니다.';
  end if;

  if v_user_role <> 'super_admin'
     and (
       v_user_organization_id is null
       or v_user_organization_id <> v_scout_organization_id
     ) then
    raise exception '다른 조직 대원의 진급 판정 기록은 정리할 수 없습니다.';
  end if;

  select exists (
    select 1
    from public.scout_rank_histories h
    where h.scout_id = p_scout_id
      and h.rank_id = p_to_rank_id
      and h.deleted_at is null
  )
  into v_already_approved;

  if v_already_approved then
    return 0;
  end if;

  if p_keep_latest then
    select pr.id
    into v_keep_review_id
    from public.promotion_reviews pr
    where pr.scout_id = p_scout_id
      and pr.from_rank_id = p_from_rank_id
      and pr.to_rank_id = p_to_rank_id
      and pr.deleted_at is null
    order by pr.review_date desc, pr.created_at desc, pr.id desc
    limit 1;
  else
    v_keep_review_id := null;
  end if;

  update public.promotion_reviews pr
  set
    deleted_at = now(),
    updated_at = now(),
    note = case
      when pr.note is null or length(btrim(pr.note)) = 0
        then '판정 기록 정리로 숨김 처리'
      else pr.note || ' / 판정 기록 정리로 숨김 처리'
    end
  where pr.scout_id = p_scout_id
    and pr.from_rank_id = p_from_rank_id
    and pr.to_rank_id = p_to_rank_id
    and pr.deleted_at is null
    and (v_keep_review_id is null or pr.id <> v_keep_review_id);

  get diagnostics v_archived_count = row_count;

  return v_archived_count;
end;
$function$;

ALTER FUNCTION public.review_scout_promotion(p_scout_id uuid, p_review_date date)
  RESET timezone;
ALTER FUNCTION public.approve_scout_promotion(p_promotion_review_id uuid, p_approved_at date, p_note text)
  RESET timezone;

ALTER FUNCTION public.calculate_rank_available_date(p_base_date date, p_required_months integer) OWNER TO postgres;
ALTER FUNCTION public.review_scout_promotion_core(p_scout_id uuid, p_review_date date) OWNER TO postgres;
ALTER FUNCTION public.review_scout_promotion(p_scout_id uuid, p_review_date date) OWNER TO postgres;
ALTER FUNCTION public.approve_scout_promotion(p_promotion_review_id uuid, p_approved_at date, p_note text) OWNER TO postgres;
ALTER FUNCTION public.approve_initial_beginner_rank(p_scout_id uuid, p_approved_at date, p_note text) OWNER TO postgres;
ALTER FUNCTION public.create_scout_badge_record(p_scout_id uuid, p_badge_id uuid, p_acquired_at date, p_approved_at date, p_instructor_name text, p_leader_confirmed boolean, p_note text) OWNER TO postgres;
ALTER FUNCTION public.update_scout_badge_record(p_scout_badge_id uuid, p_badge_id uuid, p_acquired_at date, p_approved_at date, p_instructor_name text, p_leader_confirmed boolean, p_note text) OWNER TO postgres;
ALTER FUNCTION public.archive_scout_badge_record(p_scout_badge_id uuid) OWNER TO postgres;
ALTER FUNCTION public.archive_promotion_review(p_promotion_review_id uuid) OWNER TO postgres;
ALTER FUNCTION public.cleanup_promotion_reviews(p_scout_id uuid, p_from_rank_id uuid, p_to_rank_id uuid, p_keep_latest boolean) OWNER TO postgres;

REVOKE ALL PRIVILEGES ON FUNCTION public.calculate_rank_available_date(p_base_date date, p_required_months integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calculate_rank_available_date(p_base_date date, p_required_months integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_rank_available_date(p_base_date date, p_required_months integer) TO anon;
GRANT EXECUTE ON FUNCTION public.calculate_rank_available_date(p_base_date date, p_required_months integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_rank_available_date(p_base_date date, p_required_months integer) TO postgres;
GRANT EXECUTE ON FUNCTION public.calculate_rank_available_date(p_base_date date, p_required_months integer) TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION public.review_scout_promotion_core(p_scout_id uuid, p_review_date date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_scout_promotion_core(p_scout_id uuid, p_review_date date) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_scout_promotion_core(p_scout_id uuid, p_review_date date) TO anon;
GRANT EXECUTE ON FUNCTION public.review_scout_promotion_core(p_scout_id uuid, p_review_date date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_scout_promotion_core(p_scout_id uuid, p_review_date date) TO postgres;
GRANT EXECUTE ON FUNCTION public.review_scout_promotion_core(p_scout_id uuid, p_review_date date) TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION public.review_scout_promotion(p_scout_id uuid, p_review_date date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_scout_promotion(p_scout_id uuid, p_review_date date) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_scout_promotion(p_scout_id uuid, p_review_date date) TO anon;
GRANT EXECUTE ON FUNCTION public.review_scout_promotion(p_scout_id uuid, p_review_date date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_scout_promotion(p_scout_id uuid, p_review_date date) TO postgres;
GRANT EXECUTE ON FUNCTION public.review_scout_promotion(p_scout_id uuid, p_review_date date) TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION public.approve_scout_promotion(p_promotion_review_id uuid, p_approved_at date, p_note text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_scout_promotion(p_promotion_review_id uuid, p_approved_at date, p_note text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_scout_promotion(p_promotion_review_id uuid, p_approved_at date, p_note text) TO anon;
GRANT EXECUTE ON FUNCTION public.approve_scout_promotion(p_promotion_review_id uuid, p_approved_at date, p_note text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_scout_promotion(p_promotion_review_id uuid, p_approved_at date, p_note text) TO postgres;
GRANT EXECUTE ON FUNCTION public.approve_scout_promotion(p_promotion_review_id uuid, p_approved_at date, p_note text) TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION public.approve_initial_beginner_rank(p_scout_id uuid, p_approved_at date, p_note text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_initial_beginner_rank(p_scout_id uuid, p_approved_at date, p_note text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_initial_beginner_rank(p_scout_id uuid, p_approved_at date, p_note text) TO anon;
GRANT EXECUTE ON FUNCTION public.approve_initial_beginner_rank(p_scout_id uuid, p_approved_at date, p_note text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_initial_beginner_rank(p_scout_id uuid, p_approved_at date, p_note text) TO postgres;
GRANT EXECUTE ON FUNCTION public.approve_initial_beginner_rank(p_scout_id uuid, p_approved_at date, p_note text) TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION public.create_scout_badge_record(p_scout_id uuid, p_badge_id uuid, p_acquired_at date, p_approved_at date, p_instructor_name text, p_leader_confirmed boolean, p_note text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_scout_badge_record(p_scout_id uuid, p_badge_id uuid, p_acquired_at date, p_approved_at date, p_instructor_name text, p_leader_confirmed boolean, p_note text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_scout_badge_record(p_scout_id uuid, p_badge_id uuid, p_acquired_at date, p_approved_at date, p_instructor_name text, p_leader_confirmed boolean, p_note text) TO anon;
GRANT EXECUTE ON FUNCTION public.create_scout_badge_record(p_scout_id uuid, p_badge_id uuid, p_acquired_at date, p_approved_at date, p_instructor_name text, p_leader_confirmed boolean, p_note text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_scout_badge_record(p_scout_id uuid, p_badge_id uuid, p_acquired_at date, p_approved_at date, p_instructor_name text, p_leader_confirmed boolean, p_note text) TO postgres;
GRANT EXECUTE ON FUNCTION public.create_scout_badge_record(p_scout_id uuid, p_badge_id uuid, p_acquired_at date, p_approved_at date, p_instructor_name text, p_leader_confirmed boolean, p_note text) TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION public.update_scout_badge_record(p_scout_badge_id uuid, p_badge_id uuid, p_acquired_at date, p_approved_at date, p_instructor_name text, p_leader_confirmed boolean, p_note text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_scout_badge_record(p_scout_badge_id uuid, p_badge_id uuid, p_acquired_at date, p_approved_at date, p_instructor_name text, p_leader_confirmed boolean, p_note text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_scout_badge_record(p_scout_badge_id uuid, p_badge_id uuid, p_acquired_at date, p_approved_at date, p_instructor_name text, p_leader_confirmed boolean, p_note text) TO anon;
GRANT EXECUTE ON FUNCTION public.update_scout_badge_record(p_scout_badge_id uuid, p_badge_id uuid, p_acquired_at date, p_approved_at date, p_instructor_name text, p_leader_confirmed boolean, p_note text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_scout_badge_record(p_scout_badge_id uuid, p_badge_id uuid, p_acquired_at date, p_approved_at date, p_instructor_name text, p_leader_confirmed boolean, p_note text) TO postgres;
GRANT EXECUTE ON FUNCTION public.update_scout_badge_record(p_scout_badge_id uuid, p_badge_id uuid, p_acquired_at date, p_approved_at date, p_instructor_name text, p_leader_confirmed boolean, p_note text) TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION public.archive_scout_badge_record(p_scout_badge_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.archive_scout_badge_record(p_scout_badge_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_scout_badge_record(p_scout_badge_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.archive_scout_badge_record(p_scout_badge_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_scout_badge_record(p_scout_badge_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.archive_scout_badge_record(p_scout_badge_id uuid) TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION public.archive_promotion_review(p_promotion_review_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.archive_promotion_review(p_promotion_review_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_promotion_review(p_promotion_review_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.archive_promotion_review(p_promotion_review_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_promotion_review(p_promotion_review_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.archive_promotion_review(p_promotion_review_id uuid) TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION public.cleanup_promotion_reviews(p_scout_id uuid, p_from_rank_id uuid, p_to_rank_id uuid, p_keep_latest boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_promotion_reviews(p_scout_id uuid, p_from_rank_id uuid, p_to_rank_id uuid, p_keep_latest boolean) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_promotion_reviews(p_scout_id uuid, p_from_rank_id uuid, p_to_rank_id uuid, p_keep_latest boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.cleanup_promotion_reviews(p_scout_id uuid, p_from_rank_id uuid, p_to_rank_id uuid, p_keep_latest boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_promotion_reviews(p_scout_id uuid, p_from_rank_id uuid, p_to_rank_id uuid, p_keep_latest boolean) TO postgres;
GRANT EXECUTE ON FUNCTION public.cleanup_promotion_reviews(p_scout_id uuid, p_from_rank_id uuid, p_to_rank_id uuid, p_keep_latest boolean) TO service_role;

DROP TRIGGER IF EXISTS trg_promotion_reviews_updated_at ON public.promotion_reviews;
CREATE TRIGGER trg_promotion_reviews_updated_at BEFORE UPDATE ON public.promotion_reviews FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;
