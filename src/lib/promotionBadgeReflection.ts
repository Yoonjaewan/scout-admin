export type BadgePromotionReflection = {
  targetRankId: string | null;
  targetRankName: string | null;
  label: string;
  source: "usage" | "required_badge" | "usage_record";
};

type ScoutBadgeRecord = {
  id: string;
  scout_id: string;
  badge_id: string;
  acquired_at: string;
  approved_at: string | null;
};

type PromotionBadgeUsageRecord = {
  scout_badge_id: string;
  to_rank_id: string | null;
};

type RankHistoryRecord = {
  scout_id: string;
  rank_id: string;
  approved_at: string;
};

type RankRecord = {
  id: string;
  rank_name: string;
};

type RankRequirementRecord = {
  id: string;
  to_rank_id: string;
};

type RankRequiredBadgeRecord = {
  rank_requirement_id: string;
  badge_id: string;
};

function getDateText(value: string | null | undefined) {
  return value ? value.slice(0, 10) : null;
}

function isBadgeValidAt(scoutBadge: ScoutBadgeRecord, evaluationDate: string) {
  const acquiredAt = getDateText(scoutBadge.acquired_at);
  const approvedAt = getDateText(scoutBadge.approved_at);

  return Boolean(
    acquiredAt &&
      approvedAt &&
      acquiredAt <= approvedAt &&
      acquiredAt <= evaluationDate &&
      approvedAt <= evaluationDate,
  );
}

function getReflection(
  targetRankId: string | null,
  rankNameMap: Map<string, string>,
  source: BadgePromotionReflection["source"],
): BadgePromotionReflection {
  const targetRankName = targetRankId ? rankNameMap.get(targetRankId) ?? null : null;
  const displayRankName = targetRankName?.replace(/\s*스카우트$/, "") ?? null;

  return {
    targetRankId,
    targetRankName,
    label: displayRankName ? `${displayRankName} 반영` : "진급 반영",
    source,
  };
}

export function buildPromotionBadgeReflectionMap({
  scoutBadges,
  promotionBadgeUsages,
  rankHistories,
  ranks,
  rankRequirements,
  rankRequiredBadges,
  today,
}: {
  scoutBadges: ScoutBadgeRecord[];
  promotionBadgeUsages: PromotionBadgeUsageRecord[];
  rankHistories: RankHistoryRecord[];
  ranks: RankRecord[];
  rankRequirements: RankRequirementRecord[];
  rankRequiredBadges: RankRequiredBadgeRecord[];
  today: string;
}) {
  const reflectionMap = new Map<string, BadgePromotionReflection>();
  const scoutBadgeMap = new Map(scoutBadges.map((scoutBadge) => [scoutBadge.id, scoutBadge]));
  const rankNameMap = new Map(ranks.map((rank) => [rank.id, rank.rank_name]));

  promotionBadgeUsages.forEach((usage) => {
    const scoutBadge = scoutBadgeMap.get(usage.scout_badge_id);

    if (!scoutBadge) return;

    reflectionMap.set(
      scoutBadge.id,
      getReflection(usage.to_rank_id, rankNameMap, "usage"),
    );
  });

  const requirementByTargetRankId = new Map(
    rankRequirements.map((requirement) => [requirement.to_rank_id, requirement]),
  );
  const requiredBadgeIdsByRequirementId = new Map<string, Set<string>>();

  rankRequiredBadges.forEach((mapping) => {
    const badgeIds =
      requiredBadgeIdsByRequirementId.get(mapping.rank_requirement_id) ?? new Set<string>();
    badgeIds.add(mapping.badge_id);
    requiredBadgeIdsByRequirementId.set(mapping.rank_requirement_id, badgeIds);
  });

  [...rankHistories]
    .filter((history) => {
      const approvedAt = getDateText(history.approved_at);
      return Boolean(approvedAt && approvedAt <= today);
    })
    .sort((a, b) => a.approved_at.localeCompare(b.approved_at))
    .forEach((history) => {
      const approvedAt = getDateText(history.approved_at);
      const requirement = requirementByTargetRankId.get(history.rank_id);
      if (!approvedAt || !requirement) return;

      const requiredBadgeIds =
        requiredBadgeIdsByRequirementId.get(requirement.id) ?? new Set<string>();

      scoutBadges.forEach((scoutBadge) => {
        if (
          reflectionMap.has(scoutBadge.id) ||
          scoutBadge.scout_id !== history.scout_id ||
          !requiredBadgeIds.has(scoutBadge.badge_id) ||
          !isBadgeValidAt(scoutBadge, approvedAt)
        ) {
          return;
        }

        reflectionMap.set(
          scoutBadge.id,
          getReflection(history.rank_id, rankNameMap, "required_badge"),
        );
      });

    });

  return reflectionMap;
}

export function getBadgePromotionDisplay(
  scoutBadgeId: string,
  reflectionMap: Map<string, BadgePromotionReflection>,
  lockedScoutBadgeIdSet: Set<string>,
) {
  const reflection = reflectionMap.get(scoutBadgeId);
  if (reflection) return reflection;
  if (!lockedScoutBadgeIdSet.has(scoutBadgeId)) return null;

  return {
    targetRankId: null,
    targetRankName: null,
    label: "사용 이력 확인",
    source: "usage_record",
  } satisfies BadgePromotionReflection;
}
