export const BADGE_REGISTRATION_FALLBACK_MESSAGE =
  "기능장 등록 중 문제가 발생했습니다. 입력 내용을 확인한 후 다시 시도해 주세요.";

type BadgeLike = {
  id: string;
  name: string;
  special_rule?: string | null;
};

type RankLike = {
  rank_code: string;
  rank_name: string;
};

export type SurvivalBadgeRegistrationState = {
  isSurvivalBadge: boolean;
  blocked: boolean;
  message: string | null;
};

function normalizeCode(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function isSurvivalBadge(badge: BadgeLike | null | undefined) {
  return Boolean(
    badge &&
      (badge.special_rule === "after_mugunghwa_rank" ||
        badge.name.replace(/\s+/g, "") === "생존장"),
  );
}

export function getLatestRankApprovalDate({
  histories,
  scoutId,
  rankId,
  today,
}: {
  histories: Array<{
    scout_id: string;
    rank_id: string;
    approved_at: string;
  }>;
  scoutId: string;
  rankId: string | null;
  today: string;
}) {
  if (!rankId) return null;

  return (
    histories
      .filter(
        (history) =>
          history.scout_id === scoutId &&
          history.rank_id === rankId &&
          history.approved_at.slice(0, 10) <= today,
      )
      .map((history) => history.approved_at.slice(0, 10))
      .sort((a, b) => b.localeCompare(a))[0] ?? null
  );
}

function addCalendarDay(dateText: string) {
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function formatKoreanDate(dateText: string) {
  const [year, month, day] = dateText.split("-").map(Number);
  return `${year}. ${month}. ${day}.`;
}

export function getSurvivalBadgeRegistrationState({
  badge,
  currentRank,
  mugunghwaApprovedAt,
  acquiredAt,
  hasExistingRecord,
}: {
  badge: BadgeLike | null | undefined;
  currentRank: RankLike | null | undefined;
  mugunghwaApprovedAt: string | null;
  acquiredAt: string;
  hasExistingRecord: boolean;
}): SurvivalBadgeRegistrationState {
  if (!isSurvivalBadge(badge)) {
    return { isSurvivalBadge: false, blocked: false, message: null };
  }

  if (hasExistingRecord) {
    return {
      isSurvivalBadge: true,
      blocked: true,
      message: [
        "이미 등록된 생존장 취득 기록이 있습니다.",
        "동일한 기능장을 중복 등록할 수 없습니다.",
      ].join("\n"),
    };
  }

  const rankCode = currentRank ? normalizeCode(currentRank.rank_code) : "";
  const rankName = currentRank?.rank_name ?? "미등록";

  if (rankCode === "beom" || rankCode === "tiger") {
    return {
      isSurvivalBadge: true,
      blocked: true,
      message: [
        "생존장은 다시 등록할 수 없습니다.",
        "생존장은 무궁화급에서 범 진급을 준비할 때 취득하는 기능장입니다.",
        "현재 대원의 급위는 범입니다.",
      ].join("\n"),
    };
  }

  if (rankCode !== "mugunghwa" || !mugunghwaApprovedAt) {
    return {
      isSurvivalBadge: true,
      blocked: true,
      message: [
        "생존장은 아직 등록할 수 없습니다.",
        "생존장은 무궁화급 인가를 받은 다음 날부터 취득할 수 있습니다.",
        `현재 대원의 급위는 ${rankName}입니다.`,
      ].join("\n"),
    };
  }

  if (!acquiredAt) {
    return { isSurvivalBadge: true, blocked: true, message: null };
  }

  const availableAt = addCalendarDay(mugunghwaApprovedAt);
  if (acquiredAt < availableAt) {
    return {
      isSurvivalBadge: true,
      blocked: true,
      message: [
        "입력한 취득일에는 생존장을 등록할 수 없습니다.",
        "생존장은 무궁화급 인가일 다음 날부터 취득할 수 있습니다.",
        `등록 가능한 취득일: ${formatKoreanDate(availableAt)} 이후`,
      ].join("\n"),
    };
  }

  return { isSurvivalBadge: true, blocked: false, message: null };
}

export function mapBadgeRegistrationError(
  originalError: unknown,
  survivalState: SurvivalBadgeRegistrationState = {
    isSurvivalBadge: false,
    blocked: false,
    message: null,
  },
) {
  const originalMessage =
    originalError instanceof Error
      ? originalError.message
      : typeof originalError === "string"
        ? originalError
        : "";
  const normalizedMessage = originalMessage.toLowerCase();
  const isSurvivalServerError =
    normalizedMessage.includes("생존장") ||
    normalizedMessage.includes("survival_badge") ||
    normalizedMessage.includes("after_mugunghwa");

  if (survivalState.isSurvivalBadge && isSurvivalServerError) {
    return survivalState.message ?? BADGE_REGISTRATION_FALLBACK_MESSAGE;
  }

  return BADGE_REGISTRATION_FALLBACK_MESSAGE;
}
