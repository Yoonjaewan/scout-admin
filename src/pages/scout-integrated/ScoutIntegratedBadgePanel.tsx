import type { CSSProperties } from "react";
import { InfoItem } from "./ScoutIntegratedDisplayComponents";
import {
  conditionBadgeBaseStyle,
  acquiredTextStyle,
  badgeHeaderActionsStyle,
  badgeManagementSummaryStyle,
  badgeRequirementItemStyle,
  badgeRequirementListStyle,
  badgeSummaryGridStyle,
  badgeTableStyle,
  completedStageBadgeStyle,
  confirmedBadgeStyle,
  contentCardStyle,
  contentDescriptionStyle,
  contentHeaderStyle,
  contentTitleStyle,
  countBadgeStyle,
  currentRankBadgeStyle,
  currentStageBadgeStyle,
  currentStageCardStyle,
  emptyContentStyle,
  errorBoxStyle,
  futureStageBadgeStyle,
  futureRequirementIconStyle,
  futureRequirementNameStyle,
  futureRequirementTextStyle,
  historyRequirementIconStyle,
  historyRequirementNameStyle,
  historyRequirementTextStyle,
  futureConditionBadgeStyle,
  historyConditionBadgeStyle,
  generalRequirementRowStyle,
  generalRequirementTitleStyle,
  managementAlertStyle,
  managementSummaryHeaderStyle,
  missingTextStyle,
  primaryButtonStyle,
  readyStageBadgeStyle,
  requirementCheckStyle,
  requirementMissingStyle,
  requirementNameDoneStyle,
  requirementNameMissingStyle,
  rowActionStyle,
  smallButtonStyle,
  smallDangerButtonStyle,
  stackStyle,
  stageCardGridStyle,
  stageCardHeaderStyle,
  stageCardStyle,
  stageSubTextStyle,
  stageTitleStyle,
  strongTdStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
  unconfirmedBadgeStyle,
  unusedBadgeStyle,
  usedBadgeStyle
} from "./ScoutIntegratedPage.styles";

type Scout = { id: string; current_rank_id: string | null };
type Rank = { id: string; rank_code: string; rank_name: string; sort_order: number };
type RankRequirement = { id: string; from_rank_id: string; to_rank_id: string; required_general_badge_count: number };
type RankRequiredBadge = { id: string; rank_requirement_id: string; badge_id: string; sort_order: number };
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
type Badge = { id: string; category_id: string; name: string; is_required_badge: boolean; is_general_badge: boolean; special_rule: string };
type BadgeCategory = { id: string; name: string };

const FALLBACK_REQUIRED_BADGE_STAGE_RULES = [
  { fromRankNames: ["초급"], toRankNames: ["2급"], label: "초급 → 2급", requiredBadgeNames: ["시민장", "하이킹장"], requiredGeneralCount: 0 },
  { fromRankNames: ["2급"], toRankNames: ["1급"], label: "2급 → 1급", requiredBadgeNames: ["야영장", "야외취사장", "측정지도장", "응급처치장"], requiredGeneralCount: 1 },
  { fromRankNames: ["1급"], toRankNames: ["별", "별급"], label: "1급 → 별", requiredBadgeNames: ["안전장", "전통예절장", "개척장"], requiredGeneralCount: 2 },
  { fromRankNames: ["별", "별급"], toRankNames: ["무궁화", "무궁화급"], label: "별 → 무궁화", requiredBadgeNames: ["수영장", "환경보전장", "세계우애장"], requiredGeneralCount: 3 },
  { fromRankNames: ["무궁화", "무궁화급"], toRankNames: ["범", "범급"], label: "무궁화 → 범", requiredBadgeNames: ["학업장", "구조장", "생존장"], requiredGeneralCount: 3 },
];
function normalizeRankOrBadgeName(value: string) { return value.replace(/\s+/g, "").replace(/급$/, "").trim(); }
function formatDate(value: string | null | undefined) { if (!value) return "-"; return value.slice(0, 10).replaceAll("-", "."); }
function getBadgeTypeLabel(badge: Badge | undefined) { if (!badge) return "-"; if (badge.is_required_badge && badge.is_general_badge) return "필수/일반"; if (badge.is_required_badge) return "필수"; if (badge.is_general_badge) return "일반"; return "기타"; }
function getSpecialRuleLabel(value: string) { if (value === "none") return "일반 기준"; if (value === "after_swimming_badge") return "수영장 이후 취득"; if (value === "after_mugunghwa_rank") return "무궁화 이후 취득"; return value || "-"; }
function getConditionStyle(passed: boolean | null): CSSProperties { if (passed === null) return { ...conditionBadgeBaseStyle, backgroundColor: "#f1f5f9", color: "#475569" }; return { ...conditionBadgeBaseStyle, backgroundColor: passed ? "#dcfce7" : "#fee2e2", color: passed ? "#166534" : "#b91c1c" }; }
function buildRequiredBadgeStageRules(ranks: Rank[], rankRequirements: RankRequirement[], rankRequiredBadges: RankRequiredBadge[], badgeMap: Map<string, Badge>) {
  const rankMap = new Map(ranks.map((rank) => [rank.id, rank]));
  const dbRules = rankRequirements.map((requirement) => {
    const fromRank = rankMap.get(requirement.from_rank_id) ?? null;
    const toRank = rankMap.get(requirement.to_rank_id) ?? null;
    const requiredBadgeNames = rankRequiredBadges.filter((row) => row.rank_requirement_id === requirement.id).sort((a,b) => a.sort_order-b.sort_order).map((row) => badgeMap.get(row.badge_id)?.name ?? "").filter(Boolean);
    if (!fromRank || !toRank || requiredBadgeNames.length === 0) return null;
    return { fromRankNames:[fromRank.rank_name], toRankNames:[toRank.rank_name], label:`${fromRank.rank_name} → ${toRank.rank_name}`, requiredBadgeNames, requiredGeneralCount: requirement.required_general_badge_count };
  }).filter((rule): rule is { fromRankNames:string[]; toRankNames:string[]; label:string; requiredBadgeNames:string[]; requiredGeneralCount:number } => rule !== null);
  return dbRules.length > 0 ? dbRules : FALLBACK_REQUIRED_BADGE_STAGE_RULES;
}

export function BadgePanel({
  scout,
  ranks,
  rankRequirements,
  rankRequiredBadges,
  scoutBadges,
  badgeMap,
  categoryMap,
  usedScoutBadgeIdSet,
  canManage,
  formError,
  deletingId,
  onCreate,
  onEdit,
  onDelete,
}: {
  scout: Scout;
  ranks: Rank[];
  rankRequirements: RankRequirement[];
  rankRequiredBadges: RankRequiredBadge[];
  scoutBadges: ScoutBadge[];
  badgeMap: Map<string, Badge>;
  categoryMap: Map<string, BadgeCategory>;
  usedScoutBadgeIdSet: Set<string>;
  canManage: boolean;
  formError: string;
  deletingId: string;
  onCreate: () => void;
  onEdit: (scoutBadge: ScoutBadge) => void;
  onDelete: (scoutBadge: ScoutBadge) => void;
}) {
  const requiredCount = scoutBadges.filter(
    (row) => badgeMap.get(row.badge_id)?.is_required_badge,
  ).length;
  const generalCount = scoutBadges.filter(
    (row) => badgeMap.get(row.badge_id)?.is_general_badge,
  ).length;
  const approvedCount = scoutBadges.filter((row) => row.approved_at).length;
  const usedCount = scoutBadges.filter((row) =>
    usedScoutBadgeIdSet.has(row.id),
  ).length;

  const currentRank = scout.current_rank_id
    ? (ranks.find((rank) => rank.id === scout.current_rank_id) ?? null)
    : null;
  const currentRankName = currentRank?.rank_name ?? "초급 이전";
  const acquiredBadgeNameSet = new Set(
    scoutBadges
      .filter((row) => Boolean(row.approved_at))
      .map((row) => badgeMap.get(row.badge_id)?.name ?? "")
      .filter(Boolean)
      .map(normalizeRankOrBadgeName),
  );

  const stageRules = buildRequiredBadgeStageRules(
    ranks,
    rankRequirements,
    rankRequiredBadges,
    badgeMap,
  );

  const stageRows = stageRules.map((stage, index) => {
    const normalizedFromNames = stage.fromRankNames.map(
      normalizeRankOrBadgeName,
    );
    const normalizedToNames = stage.toRankNames.map(normalizeRankOrBadgeName);
    const normalizedCurrentRank = normalizeRankOrBadgeName(currentRankName);
    const currentStage = normalizedFromNames.includes(normalizedCurrentRank);
    const currentRankOrder = currentRank?.sort_order ?? 0;
    const toRank = ranks.find((rank) =>
      normalizedToNames.includes(normalizeRankOrBadgeName(rank.rank_name)),
    );
    const stageCompleted = Boolean(
      toRank && currentRank && currentRankOrder >= toRank.sort_order,
    );
    const stageFuture = Boolean(
      toRank && currentRank && currentRankOrder < toRank.sort_order - 1,
    );

    const requiredItems = stage.requiredBadgeNames.map((badgeName) => ({
      name: badgeName,
      acquired: acquiredBadgeNameSet.has(normalizeRankOrBadgeName(badgeName)),
    }));
    const requiredAcquiredCount = requiredItems.filter(
      (item) => item.acquired,
    ).length;
    const requiredMissingCount = requiredItems.length - requiredAcquiredCount;
    const generalMissingCount = Math.max(
      0,
      stage.requiredGeneralCount - generalCount,
    );
    const allPassed = requiredMissingCount === 0 && generalMissingCount === 0;

    let stateLabel = "예정";
    let stateStyle = futureStageBadgeStyle;

    if (stageCompleted) {
      stateLabel = allPassed ? "이전 단계 완료" : "이력 확인 필요";
      stateStyle = stageCompleted
        ? completedStageBadgeStyle
        : futureStageBadgeStyle;
    } else if (currentStage || (!currentRank && index === 0)) {
      stateLabel = allPassed ? "진급 준비 완료" : "현재 준비 단계";
      stateStyle = allPassed ? readyStageBadgeStyle : currentStageBadgeStyle;
    } else if (!stageFuture && allPassed) {
      stateLabel = "사전 준비 완료";
      stateStyle = readyStageBadgeStyle;
    }

    return {
      ...stage,
      requiredItems,
      requiredAcquiredCount,
      requiredMissingCount,
      generalMissingCount,
      allPassed,
      currentStage: currentStage || (!currentRank && index === 0),
      stageCompleted,
      stageFuture,
      stateLabel,
      stateStyle,
    };
  });

  const currentStageRow = stageRows.find((stage) => stage.currentStage) ?? null;
  const managementMessage = currentStageRow
    ? currentStageRow.allPassed
      ? `${currentStageRow.label} 기능장 조건을 충족했습니다. 진급 가능 시기와 다른 조건을 함께 확인하세요.`
      : `${currentStageRow.label} 준비 중입니다. 필수 기능장 ${currentStageRow.requiredMissingCount}개, 일반 기능장 ${currentStageRow.generalMissingCount}개가 부족합니다.`
    : "현재급위에 해당하는 기능장 준비 단계를 확인하지 못했습니다. 급위 정보를 확인하세요.";

  return (
    <div style={stackStyle}>
      <section style={badgeManagementSummaryStyle}>
        <div style={managementSummaryHeaderStyle}>
          <div>
            <h3 style={contentTitleStyle}>기능장 진급 준비 현황</h3>
            <p style={contentDescriptionStyle}>
              현재급위와 급위별 기능장 요건을 기준으로 부족 항목을 먼저
              확인합니다.
            </p>
          </div>
          <span style={currentRankBadgeStyle}>현재급위 {currentRankName}</span>
        </div>

        <div style={managementAlertStyle(currentStageRow?.allPassed ?? false)}>
          <strong>
            {currentStageRow?.allPassed ? "준비 상태 양호" : "지도자 확인 필요"}
          </strong>
          <span>{managementMessage}</span>
        </div>

        <div style={badgeSummaryGridStyle}>
          <InfoItem label="전체 취득" value={`${scoutBadges.length}건`} />
          <InfoItem label="필수 기능장" value={`${requiredCount}건`} />
          <InfoItem label="일반 기능장" value={`${generalCount}건`} />
          <InfoItem label="인가 완료" value={`${approvedCount}건`} />
          <InfoItem label="진급 반영" value={`${usedCount}건`} />
        </div>
      </section>

      <section style={contentCardStyle}>
        <div style={contentHeaderStyle}>
          <div>
            <h3 style={contentTitleStyle}>급위별 기능장 준비도</h3>
            <p style={contentDescriptionStyle}>
              각 단계의 필수 기능장과 일반 기능장 부족 수를 한눈에 확인합니다.
            </p>
          </div>
        </div>

        <div style={stageCardGridStyle}>
          {stageRows.map((stage) => (
            <article
              key={stage.label}
              style={{
                ...stageCardStyle,
                ...(stage.currentStage ? currentStageCardStyle : {}),
              }}
            >
              <div style={stageCardHeaderStyle}>
                <div>
                  <h4 style={stageTitleStyle}>{stage.label}</h4>
                  <p style={stageSubTextStyle}>
                    필수 {stage.requiredBadgeNames.length}개 · 일반{" "}
                    {stage.requiredGeneralCount}개
                  </p>
                </div>
                <span style={stage.stateStyle}>{stage.stateLabel}</span>
              </div>

              <div style={badgeRequirementListStyle}>
                {stage.requiredItems.map((item) => (
                  <div
                    key={`${stage.label}-${item.name}`}
                    style={badgeRequirementItemStyle}
                  >
                    <span
                      style={
                        item.acquired
                          ? requirementCheckStyle
                          : stage.stageFuture
                            ? futureRequirementIconStyle
                            : stage.stageCompleted
                              ? historyRequirementIconStyle
                              : requirementMissingStyle
                      }
                    >
                      {item.acquired ? "✓" : stage.stageFuture ? "·" : stage.stageCompleted ? "?" : "!"}
                    </span>
                    <span
                      style={
                        item.acquired
                          ? requirementNameDoneStyle
                          : stage.stageFuture
                            ? futureRequirementNameStyle
                            : stage.stageCompleted
                              ? historyRequirementNameStyle
                              : requirementNameMissingStyle
                      }
                    >
                      {item.name}
                    </span>
                    <span
                      style={
                        item.acquired
                          ? acquiredTextStyle
                          : stage.stageFuture
                            ? futureRequirementTextStyle
                            : stage.stageCompleted
                              ? historyRequirementTextStyle
                              : missingTextStyle
                      }
                    >
                      {item.acquired
                        ? "취득"
                        : stage.stageFuture
                          ? "향후 준비"
                          : stage.stageCompleted
                            ? "이력 확인"
                            : "미취득"}
                    </span>
                  </div>
                ))}
              </div>

              <div style={generalRequirementRowStyle}>
                <div>
                  <strong style={generalRequirementTitleStyle}>
                    일반 기능장
                  </strong>
                  <p style={stageSubTextStyle}>
                    필요 {stage.requiredGeneralCount}개 · 보유 {generalCount}개
                  </p>
                </div>
                <span
                  style={
                    stage.generalMissingCount === 0
                      ? getConditionStyle(true)
                      : stage.stageFuture
                        ? futureConditionBadgeStyle
                        : stage.stageCompleted
                          ? historyConditionBadgeStyle
                          : getConditionStyle(false)
                  }
                >
                  {stage.generalMissingCount === 0
                    ? "충족"
                    : stage.stageFuture
                      ? `${stage.generalMissingCount}개 예정`
                      : stage.stageCompleted
                        ? "이력 확인"
                        : `${stage.generalMissingCount}개 부족`}
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section style={contentCardStyle}>
        <div style={contentHeaderStyle}>
          <div>
            <h3 style={contentTitleStyle}>기능장 취득 기록</h3>
            <p style={contentDescriptionStyle}>
              준비도 확인 후 필요한 기능장을 등록하고 기존 기록을 관리합니다.
            </p>
          </div>
          <div style={badgeHeaderActionsStyle}>
            <span style={countBadgeStyle}>{scoutBadges.length}건</span>
            {canManage && (
              <button
                type="button"
                style={primaryButtonStyle}
                onClick={onCreate}
              >
                기능장 등록
              </button>
            )}
          </div>
        </div>

        {formError && <div style={errorBoxStyle}>{formError}</div>}

        {scoutBadges.length === 0 ? (
          <div style={emptyContentStyle}>등록된 기능장 기록이 없습니다.</div>
        ) : (
          <div style={tableWrapStyle}>
            <table style={badgeTableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>분류</th>
                  <th style={thStyle}>기능장명</th>
                  <th style={thStyle}>구분</th>
                  <th style={thStyle}>인정 기준</th>
                  <th style={thStyle}>취득일</th>
                  <th style={thStyle}>인가일</th>
                  <th style={thStyle}>지도자 확인</th>
                  <th style={thStyle}>진급 반영</th>
                  <th style={thStyle}>비고</th>
                  {canManage && <th style={thStyle}>관리</th>}
                </tr>
              </thead>
              <tbody>
                {scoutBadges.map((scoutBadge) => {
                  const badge = badgeMap.get(scoutBadge.badge_id);
                  const isUsed = usedScoutBadgeIdSet.has(scoutBadge.id);

                  return (
                    <tr key={scoutBadge.id}>
                      <td style={tdStyle}>
                        {badge
                          ? (categoryMap.get(badge.category_id)?.name ?? "-")
                          : "-"}
                      </td>
                      <td style={strongTdStyle}>{badge?.name ?? "-"}</td>
                      <td style={tdStyle}>{getBadgeTypeLabel(badge)}</td>
                      <td style={tdStyle}>
                        {badge ? getSpecialRuleLabel(badge.special_rule) : "-"}
                      </td>
                      <td style={tdStyle}>
                        {formatDate(scoutBadge.acquired_at)}
                      </td>
                      <td style={tdStyle}>
                        {formatDate(scoutBadge.approved_at)}
                      </td>
                      <td style={tdStyle}>
                        <span
                          style={
                            scoutBadge.leader_confirmed
                              ? confirmedBadgeStyle
                              : unconfirmedBadgeStyle
                          }
                        >
                          {scoutBadge.leader_confirmed ? "확인" : "미확인"}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span
                          style={isUsed ? usedBadgeStyle : unusedBadgeStyle}
                        >
                          {isUsed ? "진급 반영" : "미사용"}
                        </span>
                      </td>
                      <td style={tdStyle}>{scoutBadge.note ?? "-"}</td>
                      {canManage && (
                        <td style={tdStyle}>
                          <div style={rowActionStyle}>
                            <button
                              type="button"
                              style={smallButtonStyle}
                              onClick={() => onEdit(scoutBadge)}
                              disabled={isUsed || deletingId !== ""}
                              title={
                                isUsed
                                  ? "진급 인가에 사용된 기록은 수정할 수 없습니다."
                                  : "수정"
                              }
                            >
                              수정
                            </button>
                            <button
                              type="button"
                              style={smallDangerButtonStyle}
                              onClick={() => onDelete(scoutBadge)}
                              disabled={isUsed || deletingId === scoutBadge.id}
                              title={
                                isUsed
                                  ? "진급 인가에 사용된 기록은 삭제할 수 없습니다."
                                  : "삭제"
                              }
                            >
                              {deletingId === scoutBadge.id
                                ? "삭제 중"
                                : "삭제"}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
