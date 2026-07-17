import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DetailedConditionCard,
  RecordCheckRow,
} from "./ScoutIntegratedDisplayComponents";
import {
  allPassedBoxStyle,
  approvalWorkButtonStyle,
  compactFieldStyle,
  compactFieldWideStyle,
  compactInputStyle,
  conditionDetailGridStyle,
  contentCardStyle,
  contentDescriptionStyle,
  contentTitleStyle,
  countBadgeStyle,
  criticalDataMismatchStyle,
  dataDifferenceNoticeStyle,
  emptyContentStyle,
  errorBoxStyle,
  //inlineActionButtonStyle,
  overviewSectionHeaderStyle,
  overviewSectionTitleStyle,
  overviewStackStyle,
  primaryWorkButtonStyle,
  priorityCardStyle,
  priorityCountStyle,
  priorityItemStyle,
  priorityListStyle,
  priorityMoveStyle,
  priorityNumberStyle,
  recordCheckGridStyle,
  promotionActionGridStyle,
  promotionApprovalControlStyle,
  promotionTaskControlStyle,
  promotionTaskStyle,
  promotionTaskTitleStyle,
  promotionWorkCardStyle,
  promotionWorkHeaderStyle,
  promotionWorkTitleStyle,
  infoItemStyle,
  infoLabelStyle,
  infoValueStyle,
  programActionNoticeStyle,
  programSummaryCardStyle,
  programSummaryGridStyle,
  recordCheckGoodStyle,
  recordCheckWarningStyle,
  rowActionStyle,
  smallButtonStyle,
  strongTdStyle,
  successMessageStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
  //twoColumnGridStyle,
  recentTimelineStyle,
  recentTimelineGroupStyle,
  recentTimelineDateStyle,
  recentTimelineItemStyle,
  recentTimelineDotStyle,
  recentTimelineContentStyle,
  recentTimelineTitleStyle,
  recentTimelineDetailStyle
} from "./ScoutIntegratedPage.styles";


type Scout = {
  id: string;
  organization_id: string;
  name: string;
  member_no: string | null;
  school_name: string | null;
  grade: string | null;
  joined_at: string;
  current_rank_id: string | null;
  status: "active" | "inactive" | "graduated";
};

type Rank = {
  id: string;
  rank_code: string;
  rank_name: string;
  sort_order: number;
};

type RankRequirement = {
  id: string;
  from_rank_id: string;
  to_rank_id: string;
  required_general_badge_count: number;
};

type RankRequiredBadge = {
  id: string;
  rank_requirement_id: string;
  badge_id: string;
  sort_order: number;
};

type RankHistory = {
  id: string;
  scout_id: string;
  rank_id: string;
  approved_at: string;
  approval_type: string;
};

type PromotionReview = {
  id: string;
  scout_id: string;
  from_rank_id: string;
  to_rank_id: string;
  review_date: string;
  base_date: string | null;
  available_at: string | null;
  required_months: number;
  days_remaining: number | null;
  period_passed: boolean;
  attendance_total_count: number;
  attendance_present_count: number;
  attendance_rate: number;
  attendance_passed: boolean;
  required_badges_passed: boolean;
  general_badges_passed: boolean;
  program_passed: boolean;
  final_passed: boolean;
  missing_items: unknown;
  note: string | null;
  created_at: string | null;
};

type ScoutBadge = {
  id: string;
  organization_id: string;
  scout_id: string;
  badge_id: string;
  acquired_at: string;
  approved_at: string | null;
  instructor_name: string | null;
  leader_confirmed: boolean;
  note: string | null;
  created_at: string;
};

type Badge = {
  id: string;
  category_id: string;
  name: string;
  is_required_badge: boolean;
  is_general_badge: boolean;
  special_rule: string;
  sort_order: number | null;
};

type ProgramCompletion = {
  id: string;
  scout_id: string;
  program_type: "WSEP" | "MoP";
  completed_at: string;
  certificate_no: string | null;
  approved_at: string | null;
  note: string | null;
};

type Attendance = {
  id: string;
  scout_id: string;
  status: string;
};

const RECENT_ACTIVITY_LIMIT = 8;

const FALLBACK_REQUIRED_BADGE_STAGE_RULES: Array<{
  fromRankNames: string[];
  toRankNames: string[];
  label: string;
  requiredBadgeNames: string[];
  requiredGeneralCount: number;
}> = [
  {
    fromRankNames: ["초급"],
    toRankNames: ["2급"],
    label: "초급 → 2급",
    requiredBadgeNames: ["시민장", "하이킹장"],
    requiredGeneralCount: 0,
  },
  {
    fromRankNames: ["2급"],
    toRankNames: ["1급"],
    label: "2급 → 1급",
    requiredBadgeNames: ["야영장", "야외취사장", "측정지도장", "응급처치장"],
    requiredGeneralCount: 1,
  },
  {
    fromRankNames: ["1급"],
    toRankNames: ["별", "별급"],
    label: "1급 → 별",
    requiredBadgeNames: ["안전장", "전통예절장", "개척장"],
    requiredGeneralCount: 2,
  },
  {
    fromRankNames: ["별", "별급"],
    toRankNames: ["무궁화", "무궁화급"],
    label: "별 → 무궁화",
    requiredBadgeNames: ["수영장", "환경보전장", "세계우애장"],
    requiredGeneralCount: 3,
  },
  {
    fromRankNames: ["무궁화", "무궁화급"],
    toRankNames: ["범", "범급"],
    label: "무궁화 → 범",
    requiredBadgeNames: ["학업장", "구조장", "생존장"],
    requiredGeneralCount: 3,
  },
];

function normalizeRankOrBadgeName(value: string) {
  return value.replace(/\s+/g, "").replace(/급$/, "").trim();
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return value.slice(0, 10).replaceAll("-", ".");
}

function getAttendanceSummary(rows: Attendance[]) {
  const enteredRows = rows.filter((row) => row.status !== "not_entered");
  const recognizedRows = enteredRows.filter(
    (row) =>
      row.status === "present" ||
      row.status === "recognized" ||
      row.status === "late" ||
      row.status === "early_leave" ||
      row.status === "excused",
  );

  return {
    entered: enteredRows.length,
    recognized: recognizedRows.length,
    rate:
      enteredRows.length > 0
        ? Math.round((recognizedRows.length / enteredRows.length) * 100)
        : null,
  };
}

function buildRequiredBadgeStageRules(
  ranks: Rank[],
  rankRequirements: RankRequirement[],
  rankRequiredBadges: RankRequiredBadge[],
  badgeMap: Map<string, Badge>,
) {
  const rankMap = new Map(ranks.map((rank) => [rank.id, rank]));

  const dbRules = rankRequirements
    .map((requirement) => {
      const fromRank = rankMap.get(requirement.from_rank_id) ?? null;
      const toRank = rankMap.get(requirement.to_rank_id) ?? null;
      const requiredBadgeNames = rankRequiredBadges
        .filter((row) => row.rank_requirement_id === requirement.id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((row) => badgeMap.get(row.badge_id)?.name ?? "")
        .filter(Boolean);

      if (!fromRank || !toRank || requiredBadgeNames.length === 0) return null;

      return {
        fromRankNames: [fromRank.rank_name],
        toRankNames: [toRank.rank_name],
        label: `${fromRank.rank_name} → ${toRank.rank_name}`,
        requiredBadgeNames,
        requiredGeneralCount: requirement.required_general_badge_count,
      };
    })
    .filter(
      (
        rule,
      ): rule is {
        fromRankNames: string[];
        toRankNames: string[];
        label: string;
        requiredBadgeNames: string[];
        requiredGeneralCount: number;
      } => rule !== null,
    );

  return dbRules.length > 0 ? dbRules : FALLBACK_REQUIRED_BADGE_STAGE_RULES;
}

function getCurrentStage(
  scout: Scout,
  ranks: Rank[],
  rankRequirements: RankRequirement[],
  rankRequiredBadges: RankRequiredBadge[],
  badgeMap: Map<string, Badge>,
) {
  if (!scout.current_rank_id) return null;

  const currentRank = ranks.find((rank) => rank.id === scout.current_rank_id);
  if (!currentRank) return null;

  const normalizedCurrent = normalizeRankOrBadgeName(currentRank.rank_name);
  const rules = buildRequiredBadgeStageRules(
    ranks,
    rankRequirements,
    rankRequiredBadges,
    badgeMap,
  );

  return (
    rules.find((stage) =>
      stage.fromRankNames.some(
        (name) => normalizeRankOrBadgeName(name) === normalizedCurrent,
      ),
    ) ?? null
  );
}

function getStageBadgeSummary(
  scout: Scout,
  ranks: Rank[],
  rankRequirements: RankRequirement[],
  rankRequiredBadges: RankRequiredBadge[],
  scoutBadges: ScoutBadge[],
  badgeMap: Map<string, Badge>,
) {
  const stage = getCurrentStage(
    scout,
    ranks,
    rankRequirements,
    rankRequiredBadges,
    badgeMap,
  );
  const ownedNames = new Set(
    scoutBadges
      .filter((record) => Boolean(record.approved_at))
      .map((record) => badgeMap.get(record.badge_id)?.name)
      .filter((name): name is string => Boolean(name))
      .map(normalizeRankOrBadgeName),
  );

  if (!stage) {
    return {
      stage: null,
      requiredOwned: 0,
      requiredTotal: 0,
      missingRequiredNames: [] as string[],
      generalOwned: scoutBadges.filter(
        (record) =>
          Boolean(record.approved_at) &&
          badgeMap.get(record.badge_id)?.is_general_badge,
      ).length,
      generalRequired: 0,
      generalMissing: 0,
    };
  }

  const missingRequiredNames = stage.requiredBadgeNames.filter(
    (name) => !ownedNames.has(normalizeRankOrBadgeName(name)),
  );
  const generalOwned = scoutBadges.filter(
    (record) =>
      Boolean(record.approved_at) &&
      badgeMap.get(record.badge_id)?.is_general_badge,
  ).length;

  return {
    stage,
    requiredOwned:
      stage.requiredBadgeNames.length - missingRequiredNames.length,
    requiredTotal: stage.requiredBadgeNames.length,
    missingRequiredNames,
    generalOwned,
    generalRequired: stage.requiredGeneralCount,
    generalMissing: Math.max(0, stage.requiredGeneralCount - generalOwned),
  };
}

export function OverviewPanel({
  scout,
  ranks,
  rankRequirements,
  rankRequiredBadges,
  latestReview,
  promotionReviews,
  histories,
  scoutBadges,
  badgeMap,
  programs,
  attendanceRows,
  attendanceRate,
  attendanceRequiredForBeom,
  onMoveToAdvancement,
  onMoveToBadges,
  onMoveToPrograms,
  onMoveToAttendance,
  showPriority = true,
}: {
  scout: Scout;
  ranks: Rank[];
  rankRequirements: RankRequirement[];
  rankRequiredBadges: RankRequiredBadge[];
  latestReview: PromotionReview | null;
  promotionReviews: PromotionReview[];
  histories: RankHistory[];
  scoutBadges: ScoutBadge[];
  badgeMap: Map<string, Badge>;
  programs: ProgramCompletion[];
  attendanceRows: Attendance[];
  attendanceRate: number | null;
  attendanceRequiredForBeom: boolean;
  onMoveToAdvancement: () => void;
  onMoveToBadges: () => void;
  onMoveToPrograms: () => void;
  onMoveToAttendance: () => void;
  showPriority?: boolean;
}) {
  const stageSummary = getStageBadgeSummary(
    scout,
    ranks,
    rankRequirements,
    rankRequiredBadges,
    scoutBadges,
    badgeMap,
  );
  const targetRank = latestReview
    ? (ranks.find((rank) => rank.id === latestReview.to_rank_id) ?? null)
    : stageSummary.stage
      ? (ranks.find((rank) =>
          stageSummary.stage?.toRankNames.some(
            (name) =>
              normalizeRankOrBadgeName(name) ===
              normalizeRankOrBadgeName(rank.rank_name),
          ),
        ) ?? null)
      : null;
  const isBeomTarget =
    targetRank?.rank_code === "beom" ||
    normalizeRankOrBadgeName(targetRank?.rank_name ?? "") === "범";
  const notEnteredCount = attendanceRows.filter(
    (row) => row.status === "not_entered",
  ).length;
  const rankMap = new Map(ranks.map((rank) => [rank.id, rank]));
  const actionItems: Array<{
    text: string;
    type: "danger" | "warning" | "info";
    action?: () => void;
  }> = [];

  if (!scout.current_rank_id) {
    actionItems.push({
      text: "현재급위가 등록되지 않았습니다. 초급 인가 또는 현재급위를 먼저 확인하세요.",
      type: "danger",
      action: onMoveToAdvancement,
    });
  }

  if (!latestReview && scout.current_rank_id) {
    actionItems.push({
      text: "최근 진급 판정 기록이 없습니다. 현재 상태를 기준으로 판정을 실행하세요.",
      type: "warning",
      action: onMoveToAdvancement,
    });
  }

  if (
    stageSummary.stage === null ||
    stageSummary.missingRequiredNames.length > 0
  ) {
    actionItems.push({
      text:
        stageSummary.stage === null
          ? "현재 급위의 필수 기능장 기준을 확인하지 못했습니다."
          : `필수 기능장 ${stageSummary.missingRequiredNames.join(", ")} 취득이 필요합니다.`,
      type: "danger",
      action: onMoveToBadges,
    });
  }

  if (stageSummary.stage === null || stageSummary.generalMissing > 0) {
    actionItems.push({
      text:
        stageSummary.stage === null
          ? "현재 급위의 일반 기능장 기준을 확인하지 못했습니다."
          : `일반 기능장 ${stageSummary.generalMissing}개가 부족합니다.`,
      type: "warning",
      action: onMoveToBadges,
    });
  }

  if (
    isBeomTarget &&
    !programs.some((program) => Boolean(program.approved_at))
  ) {
    actionItems.push({
      text: "범 진급을 위한 WSEP 또는 MoP 이수 기록이 없습니다.",
      type: "danger",
      action: onMoveToPrograms,
    });
  }

  if (
    isBeomTarget &&
    attendanceRequiredForBeom &&
    (attendanceRate === null || attendanceRate < 80)
  ) {
    actionItems.push({
      text:
        attendanceRate === null
          ? "범 진급 출석률을 계산할 수 있도록 출석 기록을 입력하세요."
          : `현재 출석률 ${attendanceRate}%로 범 진급 기준 80%에 미달합니다.`,
      type: "danger",
      action: onMoveToAttendance,
    });
  }

  if (notEnteredCount > 0) {
    actionItems.push({
      text: `출석 미입력 기록이 ${notEnteredCount}건 있습니다.`,
      type: "info",
      action: onMoveToAttendance,
    });
  }

  if (actionItems.length === 0) {
    actionItems.push({
      text:
        latestReview?.period_passed &&
        stageSummary.stage !== null &&
        stageSummary.missingRequiredNames.length === 0 &&
        stageSummary.generalMissing === 0 &&
        (!isBeomTarget || programs.some((program) => Boolean(program.approved_at))) &&
        (!isBeomTarget || !attendanceRequiredForBeom || (attendanceRate !== null && attendanceRate >= 80))
          ? "현재 실제 기록 기준으로 진급 조건을 모두 충족했습니다. 진급 탭에서 인가 여부를 확인하세요."
          : "현재 확인된 관리 누락 항목이 없습니다.",
      type: "info",
      action: onMoveToAdvancement,
    });
  }

  const recentActivityItems: Array<{
    key: string;
    date: string;
    icon: string;
    title: string;
    detail: string;
    action: () => void;
  }> = [
    ...histories.map((history) => ({
      key: `rank-${history.id}`,
      date: history.approved_at,
      icon: "🟢",
      title: "진급 인가",
      detail: `${rankMap.get(history.rank_id)?.rank_name ?? "급위 확인"} 인가`,
      action: onMoveToAdvancement,
    })),
    ...promotionReviews.map((review) => ({
      key: `review-${review.id}`,
      date: review.review_date,
      icon: "🟡",
      title: "진급 판정",
      detail: `${rankMap.get(review.from_rank_id)?.rank_name ?? "급위 확인"} → ${
        rankMap.get(review.to_rank_id)?.rank_name ?? "급위 확인"
      } · ${review.final_passed ? "저장 판정 통과" : "저장 판정 보완 필요"}`,
      action: onMoveToAdvancement,
    })),
    ...scoutBadges.map((scoutBadge) => ({
      key: `badge-${scoutBadge.id}`,
      date: scoutBadge.approved_at ?? scoutBadge.acquired_at,
      icon: "🔵",
      title: "기능장",
      detail: `${badgeMap.get(scoutBadge.badge_id)?.name ?? "기능장 확인"} 취득`,
      action: onMoveToBadges,
    })),
    ...programs.map((program) => ({
      key: `program-${program.id}`,
      date: program.approved_at ?? program.completed_at,
      icon: "🟣",
      title: "프로그램",
      detail: `${program.program_type} 이수`,
      action: onMoveToPrograms,
    })),
  ]
    .filter((item) => Boolean(item.date))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, RECENT_ACTIVITY_LIMIT);

  const recentActivityGroups = recentActivityItems.reduce<
    Array<{ date: string; items: typeof recentActivityItems }>
  >((groups, item) => {
    const date = formatDate(item.date);
    const currentGroup = groups[groups.length - 1];
    if (currentGroup?.date === date) {
      currentGroup.items.push(item);
    } else {
      groups.push({ date, items: [item] });
    }
    return groups;
  }, []);

  const badgeApprovalMissingCount = scoutBadges.filter(
    (row) => !row.approved_at,
  ).length;
  const programApprovalMissingCount = programs.filter(
    (row) => !row.approved_at,
  ).length;
  const promotionReviewMissingCount = latestReview ? 0 : 1;
  const hasDataDifference = Boolean(
    latestReview &&
      ((latestReview.required_badges_passed &&
        (stageSummary.stage === null ||
          stageSummary.missingRequiredNames.length > 0)) ||
        (latestReview.general_badges_passed &&
          (stageSummary.stage === null || stageSummary.generalMissing > 0))),
  );


  return (
    <div style={overviewStackStyle}>
      {showPriority && (
        <section style={priorityCardStyle}>
          <div style={overviewSectionHeaderStyle}>
            <div>
              <h3 style={overviewSectionTitleStyle}>지금 확인할 사항</h3>
              <p style={contentDescriptionStyle}>
                대장이 우선 확인하고 조치해야 할 항목입니다.
              </p>
            </div>
            <span style={priorityCountStyle}>{actionItems.length}건</span>
          </div>

          <div style={priorityListStyle}>
            {actionItems.map((item, index) => (
              <button
                key={`${item.text}-${index}`}
                type="button"
                style={priorityItemStyle(item.type)}
                onClick={item.action}
              >
                <span style={priorityNumberStyle}>{index + 1}</span>
                <span>{item.text}</span>
                <span style={priorityMoveStyle}>확인</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section style={contentCardStyle}>
        <div style={overviewSectionHeaderStyle}>
          <div>
            <h3 style={contentTitleStyle}>기록 품질</h3>
            <p style={contentDescriptionStyle}>
              지금 수정해야 하는 기록을 우선 확인합니다.
            </p>
          </div>
        </div>

        {hasDataDifference && (
          <div style={{ ...dataDifferenceNoticeStyle, marginTop: 0 }}>
            ⚠ 판정 결과와 실제 기록이 다릅니다. 현재 기록을 기준으로 미충족
            처리했으며, 기능장 기록을 보완한 뒤 진급 판정을 다시 실행해야
            합니다.
          </div>
        )}

        <div style={recordCheckGridStyle}>
          <RecordCheckRow
            label={
              badgeApprovalMissingCount > 0
                ? "⚠ 기능장 승인 누락"
                : "기능장 승인"
            }
            count={badgeApprovalMissingCount}
            onClick={onMoveToBadges}
          />
          <RecordCheckRow
            label={
              programApprovalMissingCount > 0
                ? "⚠ 프로그램 승인 누락"
                : "프로그램 승인"
            }
            count={programApprovalMissingCount}
            onClick={onMoveToPrograms}
          />
          <RecordCheckRow
            label={
              notEnteredCount > 0 ? "⚠ 출석 입력 필요" : "출석 입력"
            }
            count={notEnteredCount}
            onClick={onMoveToAttendance}
          />
          <RecordCheckRow
            label={
              promotionReviewMissingCount > 0
                ? "⚠ 진급 판정 필요"
                : "진급 판정"
            }
            count={promotionReviewMissingCount}
            onClick={onMoveToAdvancement}
          />
        </div>
      </section>

      <section style={contentCardStyle}>
          <div style={overviewSectionHeaderStyle}>
            <div>
              <h3 style={contentTitleStyle}>최근 활동 기록</h3>
              <p style={contentDescriptionStyle}>
                최근 입력된 기록을 날짜순으로 확인합니다.
              </p>
            </div>
          </div>

          {recentActivityGroups.length === 0 ? (
            <div style={emptyContentStyle}>최근 활동 기록이 없습니다.</div>
          ) : (
            <div style={recentTimelineStyle}>
              {recentActivityGroups.map((group) => (
                <div key={group.date} style={recentTimelineGroupStyle}>
                  <div style={recentTimelineDateStyle}>{group.date}</div>
                  <div>
                    {group.items.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        style={recentTimelineItemStyle}
                        onClick={item.action}
                      >
                        <span style={recentTimelineDotStyle} aria-hidden="true" />
                        <span style={recentTimelineContentStyle}>
                          <strong style={recentTimelineTitleStyle}>
                            {item.icon} {item.title}
                          </strong>
                          <span style={recentTimelineDetailStyle}>{item.detail}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              <div style={recentTimelineGroupStyle}>
                <div style={recentTimelineDateStyle}>현재 상태</div>
                <button
                  type="button"
                  style={recentTimelineItemStyle}
                  onClick={onMoveToAttendance}
                >
                  <span style={recentTimelineDotStyle} aria-hidden="true" />
                  <span style={recentTimelineContentStyle}>
                    <strong style={recentTimelineTitleStyle}>출석 입력</strong>
                    <span style={recentTimelineDetailStyle}>
                      입력 {attendanceRows.length - notEnteredCount}건 · 미입력 {notEnteredCount}건
                    </span>
                  </span>
                </button>
              </div>
            </div>
          )}
      </section>
    </div>
  );
}

export function AdvancementPanel({
  scout,
  ranks,
  rankRequirements,
  rankRequiredBadges,
  latestReview,
  histories,
  scoutBadges,
  badgeMap,
  programs,
  attendanceRows,
  attendanceRequiredForBeom,
  canManage,
  reviewDate,
  approvalDate,
  approvalNote,
  reviewSubmitting,
  approvalSubmitting,
  reviewError,
  approvalError,
  actionMessage,
  onReviewDateChange,
  onApprovalDateChange,
  onApprovalNoteChange,
  onRunReview,
  onApprove,
}: {
  scout: Scout;
  ranks: Rank[];
  rankRequirements: RankRequirement[];
  rankRequiredBadges: RankRequiredBadge[];
  latestReview: PromotionReview | null;
  histories: RankHistory[];
  scoutBadges: ScoutBadge[];
  badgeMap: Map<string, Badge>;
  programs: ProgramCompletion[];
  attendanceRows: Attendance[];
  attendanceRequiredForBeom: boolean;
  canManage: boolean;
  reviewDate: string;
  approvalDate: string;
  approvalNote: string;
  reviewSubmitting: boolean;
  approvalSubmitting: boolean;
  reviewError: string;
  approvalError: string;
  actionMessage: string;
  onReviewDateChange: (value: string) => void;
  onApprovalDateChange: (value: string) => void;
  onApprovalNoteChange: (value: string) => void;
  onRunReview: () => void;
  onApprove: () => void;
}) {
  const stageSummary = getStageBadgeSummary(
    scout,
    ranks,
    rankRequirements,
    rankRequiredBadges,
    scoutBadges,
    badgeMap,
  );
  const currentRank =
    ranks.find((rank) => rank.id === scout.current_rank_id) ?? null;
  const targetRank = latestReview
    ? (ranks.find((rank) => rank.id === latestReview.to_rank_id) ?? null)
    : stageSummary.stage
      ? (ranks.find((rank) =>
          stageSummary.stage?.toRankNames.some(
            (name) =>
              normalizeRankOrBadgeName(name) ===
              normalizeRankOrBadgeName(rank.rank_name),
          ),
        ) ?? null)
      : null;
  const isBeomTarget =
    targetRank?.rank_code === "beom" ||
    normalizeRankOrBadgeName(targetRank?.rank_name ?? "") === "범";
  const attendanceSummary = getAttendanceSummary(attendanceRows);
  const currentRequiredBadgesPassed =
    stageSummary.stage !== null &&
    stageSummary.missingRequiredNames.length === 0;
  const currentGeneralBadgesPassed =
    stageSummary.stage !== null && stageSummary.generalMissing === 0;
  const currentProgramPassed =
    !isBeomTarget || programs.some((program) => Boolean(program.approved_at));
  const currentAttendancePassed =
    !isBeomTarget ||
    !attendanceRequiredForBeom ||
    (attendanceSummary.rate !== null && attendanceSummary.rate >= 80);
  const effectiveFinalPassed =
    Boolean(latestReview?.period_passed) &&
    currentRequiredBadgesPassed &&
    currentGeneralBadgesPassed &&
    currentProgramPassed &&
    currentAttendancePassed;
  const isTargetRankApproved = latestReview
    ? histories.some((history) => history.rank_id === latestReview.to_rank_id)
    : false;
  const reviewStatusLabel = !latestReview
    ? "판정 전"
    : effectiveFinalPassed
      ? "통과"
      : "보완 필요";
  const approvalStatusLabel = isTargetRankApproved
    ? "인가 완료"
    : !latestReview || !effectiveFinalPassed
      ? "판정 필요"
      : "인가 가능";
  const reviewStatusTone =
    reviewStatusLabel === "통과"
      ? ("good" as const)
      : reviewStatusLabel === "보완 필요"
        ? ("warning" as const)
        : ("neutral" as const);
  const approvalStatusTone =
    approvalStatusLabel === "인가 완료" || approvalStatusLabel === "인가 가능"
      ? ("good" as const)
      : ("warning" as const);
  const summaryItems = [
    {
      label: "현재 급위",
      value: currentRank?.rank_name ?? "급위 미등록",
      tone: "neutral" as const,
    },
    {
      label: "다음 급위",
      value: targetRank?.rank_name ?? "다음 급위 확인 필요",
      tone: "neutral" as const,
    },
    {
      label: "판정 상태",
      value: reviewStatusLabel,
      tone: reviewStatusTone,
    },
    {
      label: "인가 상태",
      value: approvalStatusLabel,
      tone: approvalStatusTone,
    },
  ];
  const priorityAction = !latestReview
    ? {
        tone: "action" as const,
        message: "진급 조건을 확인하고 진급 판정을 실행하세요.",
      }
    : !effectiveFinalPassed
      ? {
          tone: "warning" as const,
          message: "보완이 필요한 조건을 먼저 확인하세요.",
        }
      : isTargetRankApproved
        ? {
            tone: "good" as const,
            message: "현재 진급 단계의 인가가 완료되었습니다.",
          }
        : {
            tone: "action" as const,
            message:
              "진급 인가일과 비고를 확인한 후 인가를 저장하세요.",
          };
  const conditionPassedFlags = latestReview
    ? [
        latestReview.period_passed,
        currentAttendancePassed,
        currentRequiredBadgesPassed,
        currentGeneralBadgesPassed,
        currentProgramPassed,
      ]
    : [];
  const conditionPassedCount = conditionPassedFlags.filter(Boolean).length;
  const conditionFailedCount =
    conditionPassedFlags.length - conditionPassedCount;
  const navigate = useNavigate();
  const [showConditionDetails, setShowConditionDetails] = useState(false);

  return (
    <div style={overviewStackStyle}>
      <section style={programSummaryCardStyle}>
        <div style={overviewSectionHeaderStyle}>
          <div>
            <h3 style={contentTitleStyle}>진급 업무 요약</h3>
            <p style={contentDescriptionStyle}>
              현재 급위와 다음 진급 단계의 판정·인가 상태를 확인합니다.
            </p>
          </div>
        </div>
        <div style={programSummaryGridStyle}>
          {summaryItems.map((item) => (
            <div key={item.label} style={infoItemStyle}>
              <span style={infoLabelStyle}>{item.label}</span>
              <strong
                style={{
                  ...infoValueStyle,
                  ...(item.tone === "warning"
                    ? recordCheckWarningStyle
                    : item.tone === "good"
                      ? recordCheckGoodStyle
                      : {}),
                }}
              >
                {item.value}
              </strong>
            </div>
          ))}
        </div>
      </section>

      <section style={contentCardStyle}>
        <div style={overviewSectionHeaderStyle}>
          <div>
            <h3 style={contentTitleStyle}>지금 처리할 사항</h3>
          </div>
        </div>
        {priorityAction.tone === "good" ? (
          <div style={allPassedBoxStyle}>{priorityAction.message}</div>
        ) : (
          <div style={programActionNoticeStyle}>
            <span>{priorityAction.message}</span>
          </div>
        )}
      </section>

      <section style={promotionWorkCardStyle}>
        <div style={promotionWorkHeaderStyle}>
          <div>
            <h3 style={promotionWorkTitleStyle}>진급 판정·인가</h3>
          </div>

          <div style={rowActionStyle}>
            <button
              type="button"
              style={smallButtonStyle}
              onClick={() => navigate("/advancements")}
            >
              진급관리로 이동
            </button>
          </div>
        </div>

        {actionMessage && (
          <div style={successMessageStyle}>{actionMessage}</div>
        )}
        {reviewError && <div style={errorBoxStyle}>{reviewError}</div>}
        {approvalError && <div style={errorBoxStyle}>{approvalError}</div>}

        <div style={promotionActionGridStyle}>
          <div style={promotionTaskStyle}>
            <div>
              <strong style={promotionTaskTitleStyle}>진급 판정</strong>
            </div>
            <div style={promotionTaskControlStyle}>
              <label style={compactFieldStyle}>
                판정일
                <input
                  type="date"
                  style={compactInputStyle}
                  value={reviewDate}
                  onChange={(event) => onReviewDateChange(event.target.value)}
                  disabled={!canManage || reviewSubmitting}
                />
              </label>
              <button
                type="button"
                style={primaryWorkButtonStyle}
                onClick={onRunReview}
                disabled={
                  !canManage || reviewSubmitting || !scout.current_rank_id
                }
              >
                {reviewSubmitting ? "판정 중..." : "진급 판정 실행"}
              </button>
            </div>
          </div>

          <div style={promotionTaskStyle}>
            <div>
              <strong style={promotionTaskTitleStyle}>진급 인가</strong>
            </div>
            <div style={promotionApprovalControlStyle}>
              <label style={compactFieldStyle}>
                인가일
                <input
                  type="date"
                  style={compactInputStyle}
                  value={approvalDate}
                  onChange={(event) => onApprovalDateChange(event.target.value)}
                  disabled={!canManage || approvalSubmitting}
                />
              </label>
              <label style={compactFieldWideStyle}>
                비고
                <input
                  style={compactInputStyle}
                  value={approvalNote}
                  onChange={(event) => onApprovalNoteChange(event.target.value)}
                  placeholder="선택 입력"
                  disabled={!canManage || approvalSubmitting}
                />
              </label>
              <button
                type="button"
                style={approvalWorkButtonStyle}
                onClick={onApprove}
                disabled={
                  !canManage || approvalSubmitting || !effectiveFinalPassed
                }
              >
                {approvalSubmitting ? "인가 중..." : "진급 인가 저장"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section style={contentCardStyle}>
        <div style={overviewSectionHeaderStyle}>
          <div>
            <h3 style={contentTitleStyle}>진급 조건 상세</h3>
            <p style={contentDescriptionStyle}>
              {latestReview
                ? `충족 ${conditionPassedCount}개 · 보완 필요 ${conditionFailedCount}개`
                : "판정 후 조건 상세를 확인할 수 있습니다."}
            </p>
          </div>
          <div style={rowActionStyle}>
            {latestReview && (
              <span style={countBadgeStyle}>
                판정일 {formatDate(latestReview.review_date)}
              </span>
            )}
            <button
              type="button"
              style={smallButtonStyle}
              onClick={() => setShowConditionDetails((current) => !current)}
              disabled={!latestReview}
            >
              {showConditionDetails ? "상세 닫기" : "상세 보기"}
            </button>
          </div>
        </div>

        {!latestReview ? (
          <div style={emptyContentStyle}>
            최근 판정 기록이 없습니다. 진급 판정을 실행하면 조건 상세가
            표시됩니다.
          </div>
        ) : !showConditionDetails ? (
          <div style={emptyContentStyle}>
            충족 {conditionPassedCount}개 · 보완 필요 {conditionFailedCount}개
          </div>
        ) : (
          <>
            {latestReview.final_passed && !effectiveFinalPassed && (
              <div style={criticalDataMismatchStyle}>
                <strong>진급 판정 오류 확인 필요</strong>
                <span>
                  저장된 판정은 통과로 되어 있으나 현재 실제 필수·일반 기능장 또는
                  기타 진급 조건이 미충족입니다. 현재 기록을 기준으로 진급 인가를
                  차단했습니다. 기록을 보완한 뒤 진급 판정을 다시 실행하세요.
                </span>
              </div>
            )}

            <div style={conditionDetailGridStyle}>
            <DetailedConditionCard
              title="활동기간"
              passed={latestReview.period_passed}
              rows={[
                ["기간 산정 기준일", formatDate(latestReview.base_date)],
                ["필요기간", `${latestReview.required_months}개월`],
                ["기간 충족 예정일", formatDate(latestReview.available_at)],
                [
                  "남은기간",
                  latestReview.days_remaining && latestReview.days_remaining > 0
                    ? `${latestReview.days_remaining}일`
                    : "충족",
                ],
              ]}
            />

            <DetailedConditionCard
              title="출석"
              passed={currentAttendancePassed}
              rows={[
                [
                  "판정 적용",
                  isBeomTarget && attendanceRequiredForBeom
                    ? "범 진급 필수 조건"
                    : "현재 단계 참고 지표",
                ],
                ["출석 대상", `${latestReview.attendance_total_count}회`],
                ["출석 인정", `${latestReview.attendance_present_count}회`],
                ["출석률", `${latestReview.attendance_rate}%`],
              ]}
            />

            <DetailedConditionCard
              title="필수 기능장"
              passed={currentRequiredBadgesPassed}
              rows={[
                ["현재 단계", stageSummary.stage?.label ?? "단계 확인 필요"],
                [
                  "최근 판정 결과",
                  currentRequiredBadgesPassed
                    ? "현재 실제 기록 기준 충족"
                    : "현재 실제 기록 기준 미충족",
                ],
                [
                  "현재 화면 기록",
                  `${stageSummary.requiredOwned}/${stageSummary.requiredTotal}개 확인`,
                ],
                [
                  "기록 점검",
                  stageSummary.stage === null
                    ? "현재 급위의 필수 기능장 기준을 확인하지 못했습니다."
                    : stageSummary.missingRequiredNames.length > 0
                      ? `미취득: ${stageSummary.missingRequiredNames.join(", ")}`
                      : "필수 기능장 모두 취득",
                ],
                [
                  "인가일 미등록",
                  `${
                    scoutBadges.filter(
                      (row) =>
                        stageSummary.stage?.requiredBadgeNames.some(
                          (name) =>
                            normalizeRankOrBadgeName(
                              badgeMap.get(row.badge_id)?.name ?? "",
                            ) === normalizeRankOrBadgeName(name),
                        ) && !row.approved_at,
                    ).length
                  }건`,
                ],
              ]}
            />

            <DetailedConditionCard
              title="일반 기능장"
              passed={currentGeneralBadgesPassed}
              rows={[
                ["필요 수", `${stageSummary.generalRequired}개`],
                ["현재 화면 기록", `${stageSummary.generalOwned}개`],
                [
                  "최근 판정 결과",
                  currentGeneralBadgesPassed
                    ? "현재 실제 기록 기준 충족"
                    : "현재 실제 기록 기준 미충족",
                ],
                [
                  "기록 점검",
                  stageSummary.stage === null
                    ? "현재 급위의 일반 기능장 기준을 확인하지 못했습니다."
                    : stageSummary.generalMissing > 0
                      ? `${stageSummary.generalMissing}개 추가 취득 필요`
                      : "필요 수 충족",
                ],
              ]}
            />

            <DetailedConditionCard
              title="WSEP/MoP"
              passed={currentProgramPassed}
              rows={[
                [
                  "판정 적용",
                  isBeomTarget ? "범 진급 필수 조건" : "현재 단계 해당 없음",
                ],
                [
                  "등록 기록",
                  programs.some((program) => Boolean(program.approved_at))
                    ? programs.filter((program) => Boolean(program.approved_at))
                        .map(
                          (program) =>
                            `${program.program_type} ${formatDate(
                              program.completed_at,
                            )}`,
                        )
                        .join(" / ")
                    : "없음",
                ],
                [
                  "승인일 미등록",
                  `${programs.filter((program) => !program.approved_at).length}건`,
                ],
                [
                  "판정 결과",
                  isBeomTarget
                    ? currentProgramPassed
                      ? "현재 실제 기록 기준 충족"
                      : "현재 실제 기록 기준 미충족"
                    : "판정 제외",
                ],
              ]}
            />
            </div>
          </>
        )}
      </section>

      <section style={contentCardStyle}>
        <div style={overviewSectionHeaderStyle}>
          <div>
            <h3 style={contentTitleStyle}>진급 인가 이력</h3>
            <p style={contentDescriptionStyle}>
              급위별 인가일과 인가 구분을 확인합니다.
            </p>
          </div>
        </div>

        {histories.length === 0 ? (
          <div style={emptyContentStyle}>진급 인가 이력이 없습니다.</div>
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>급위</th>
                  <th style={thStyle}>인가일</th>
                  <th style={thStyle}>인가 구분</th>
                </tr>
              </thead>
              <tbody>
                {histories.map((history) => (
                  <tr key={history.id}>
                    <td style={strongTdStyle}>
                      {ranks.find((rank) => rank.id === history.rank_id)
                        ?.rank_name ?? "-"}
                    </td>
                    <td style={tdStyle}>{formatDate(history.approved_at)}</td>
                    <td style={tdStyle}>{history.approval_type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
