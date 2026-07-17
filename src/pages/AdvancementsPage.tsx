import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import { EmptyState, PageHelpButton } from "../components/common/CommonFeedback";
import { getSeoulTodayText } from "../lib/businessDate";
import { supabase } from "../lib/supabase";

type UserRole = "super_admin" | "org_admin" | "leader" | "viewer";
type ScoutStatus = "active" | "inactive" | "graduated";
type RankStepState =
  | "completed"
  | "current"
  | "next"
  | "missing_history"
  | "exempted"
  | "pending";

type UserProfile = {
  role: UserRole;
  organization_id: string | null;
};

type Scout = {
  id: string;
  organization_id: string;
  name: string;
  member_no: string | null;
  school_name: string | null;
  grade: string | null;
  joined_at: string;
  current_rank_id: string | null;
  is_from_cub_scout: boolean;
  cub_promotion_completed: boolean;
  beginner_course_exempted: boolean;
  status: ScoutStatus;
};

type Rank = {
  id: string;
  rank_code: string;
  rank_name: string;
  sort_order: number;
};

type Organization = {
  id: string;
  name: string;
};

type RankHistory = {
  id: string;
  organization_id: string;
  scout_id: string;
  rank_id: string;
  approved_at: string;
  approval_type: string;
  note: string | null;
};

type RankRequirement = {
  id: string;
  from_rank_id: string;
  to_rank_id: string;
  required_months: number;
  required_attendance_rate: number;
  required_general_badge_count: number;
  requires_wsep_or_mop: boolean;
};

type PromotionReview = {
  id: string;
  organization_id: string;
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

type InitialBeginnerApprovalForm = {
  approved_at: string;
  note: string;
};

type PromotionReviewForm = {
  review_date: string;
};

type PromotionApprovalForm = {
  approved_at: string;
  note: string;
};

type MissingItem = Record<string, unknown>;

type AdvancementFilter =
  | "all"
  | "ready"
  | "period"
  | "badge"
  | "program"
  | "not_reviewed";

type AdvancementSortKey =
  | "member_no"
  | "name"
  | "organization"
  | "school_name"
  | "grade"
  | "current_rank"
  | "next_rank"
  | "expected_date"
  | "status"
  | "rank_history_count"
  | "review_count";

type SortDirection = "asc" | "desc";

type AdvancementSortState = {
  key: AdvancementSortKey;
  direction: SortDirection;
};

type SummaryCardType = "target" | "ready" | "support" | "not_reviewed";

const ADVANCEMENT_FILTER_OPTIONS: Array<{
  value: AdvancementFilter;
  label: string;
  description: string;
}> = [
  {
    value: "all",
    label: "전체",
    description: "조회 가능한 모든 대원을 표시합니다.",
  },
  {
    value: "ready",
    label: "진급 가능",
    description: "최근 판정에서 다음 급위 인가가 가능한 대원을 표시합니다.",
  },
  {
    value: "period",
    label: "기간 부족",
    description: "다음 급위까지 필요한 활동기간이 부족한 대원을 표시합니다.",
  },
  {
    value: "badge",
    label: "기능장 부족",
    description: "필수 또는 일반 기능장 조건 확인이 필요한 대원을 표시합니다.",
  },
  {
    value: "program",
    label: "WSEP/MoP 미이수",
    description: "범 진급에서 WSEP 또는 MoP 이수 확인이 필요한 대원을 표시합니다.",
  },
  {
    value: "not_reviewed",
    label: "판정 필요",
    description: "현재 급위와 다음 급위는 있으나 아직 판정 기록이 없는 대원을 표시합니다.",
  },
];

function isAdvancementFilter(value: string | null): value is AdvancementFilter {
  return ADVANCEMENT_FILTER_OPTIONS.some((option) => option.value === value);
}

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "최고관리자",
  org_admin: "조직관리자",
  leader: "지도자",
  viewer: "조회전용",
};

const SCOUT_STATUS_LABELS: Record<ScoutStatus, string> = {
  active: "활동",
  inactive: "비활동",
  graduated: "졸업",
};

const SCOUT_STATUS_STYLES: Record<
  ScoutStatus,
  Pick<CSSProperties, "backgroundColor" | "color" | "border">
> = {
  active: {
    backgroundColor: "#dcfce7",
    color: "#166534",
    border: "1px solid #bbf7d0",
  },
  inactive: {
    backgroundColor: "#f1f5f9",
    color: "#475569",
    border: "1px solid #cbd5e1",
  },
  graduated: {
    backgroundColor: "#ede9fe",
    color: "#6d28d9",
    border: "1px solid #ddd6fe",
  },
};

function isUserRole(value: unknown): value is UserRole {
  return (
    value === "super_admin" ||
    value === "org_admin" ||
    value === "leader" ||
    value === "viewer"
  );
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return value.slice(0, 10);
}

function getTodayText() {
  return getSeoulTodayText();
}

function getEmptyInitialBeginnerApprovalForm(): InitialBeginnerApprovalForm {
  return {
    approved_at: getTodayText(),
    note: "",
  };
}

function getEmptyPromotionReviewForm(): PromotionReviewForm {
  return {
    review_date: getTodayText(),
  };
}

function getEmptyPromotionApprovalForm(): PromotionApprovalForm {
  return {
    approved_at: getTodayText(),
    note: "",
  };
}

function getApprovalTypeLabel(value: string) {
  if (value === "normal") return "일반";
  if (value === "cub_beginner_approval") return "컵스카우트 초급인가";
  if (value === "manual_correction") return "수동정정";
  return value;
}

function getDateStatusLabel(expectedDate: string | null) {
  if (!expectedDate) return "기준 확인 필요";

  const todayText = getTodayText();

  if (expectedDate < todayText) return "도래";
  if (expectedDate === todayText) return "오늘";
  return "예정";
}

function getGradeSortOrder(value: string | null) {
  if (!value) return 9999;

  const text = value.replace(/\s/g, "");
  const gradeMatch = text.match(/(\d+)학년/);
  const gradeNumber = gradeMatch ? Number(gradeMatch[1]) : 0;

  if (text.includes("초등학교")) return 100 + gradeNumber;
  if (text.includes("중학교")) return 200 + gradeNumber;
  if (text.includes("고등학교")) return 300 + gradeNumber;

  return gradeNumber > 0 ? 900 + gradeNumber : 9999;
}

const CUB_RANK_BY_GRADE_NUMBER: Record<number, string> = {
  1: "다람쥐",
  2: "다람쥐",
  3: "토끼",
  4: "사슴",
  5: "곰",
  6: "무지개",
};

function getGradeNumber(value: string | null | undefined) {
  if (!value) return null;

  const match = value.replace(/\s/g, "").match(/(\d+)학년/);
  if (!match) return null;

  const gradeNumber = Number(match[1]);
  return Number.isFinite(gradeNumber) ? gradeNumber : null;
}

function isElementarySchoolGrade(value: string | null | undefined) {
  return Boolean(value?.replace(/\s/g, "").includes("초등학교"));
}

function getCubRankNameByGrade(value: string | null | undefined) {
  if (!isElementarySchoolGrade(value)) return "";

  const gradeNumber = getGradeNumber(value);
  if (!gradeNumber) return "";

  return CUB_RANK_BY_GRADE_NUMBER[gradeNumber] ?? "";
}

function getNextCubRankNameByGrade(value: string | null | undefined) {
  if (!isElementarySchoolGrade(value)) return "";

  const gradeNumber = getGradeNumber(value);
  if (!gradeNumber || gradeNumber >= 6) return "";

  return CUB_RANK_BY_GRADE_NUMBER[gradeNumber + 1] ?? "";
}

function isCubScoutByGrade(scout: { grade: string | null }) {
  return isElementarySchoolGrade(scout.grade);
}

function toMissingItems(value: unknown): MissingItem[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is MissingItem => {
      return typeof item === "object" && item !== null && !Array.isArray(item);
    });
  }

  return [];
}

function getMissingItemTextValue(item: MissingItem, keys: string[]) {
  for (const key of keys) {
    const value = item[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return "";
}

function getMissingItemNumberValue(item: MissingItem, keys: string[]) {
  for (const key of keys) {
    const value = item[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim().length > 0) {
      const numberValue = Number(value.trim());

      if (Number.isFinite(numberValue)) {
        return numberValue;
      }
    }
  }

  return null;
}

function normalizeMissingItemType(value: string) {
  return value.replace(/[\s_-]+/g, "").toLowerCase();
}

function isProgramMissingItem(item: MissingItem) {
  const rawType = getMissingItemTextValue(item, ["type", "category"]);
  const message = getMissingItemTextValue(item, ["message"]);
  const normalizedText = normalizeMissingItemType(`${rawType} ${message}`);

  return (
    normalizedText.includes("program") ||
    normalizedText.includes("wsep") ||
    normalizedText.includes("mop") ||
    normalizedText.includes("프로그램")
  );
}

function isPeriodMissingItem(item: MissingItem) {
  const rawType = getMissingItemTextValue(item, ["type", "category"]);
  const message = getMissingItemTextValue(item, ["message"]);
  const normalizedText = normalizeMissingItemType(`${rawType} ${message}`);

  return (
    normalizedText.includes("period") ||
    normalizedText.includes("month") ||
    normalizedText.includes("기간") ||
    normalizedText.includes("활동기간")
  );
}

function isGenericMissingMessage(value: string) {
  const normalizedValue = value.replace(/\s+/g, "");

  return (
    normalizedValue === "미취득" ||
    normalizedValue === "미충족" ||
    normalizedValue === "부족" ||
    normalizedValue === "확인필요"
  );
}

function getMissingItemMessage(item: MissingItem) {
  const badgeName = getMissingItemTextValue(item, [
    "badge_name",
    "badgeName",
    "badge",
    "name",
  ]);

  if (badgeName) {
    return `${badgeName} 기능장 취득이 필요합니다.`;
  }

  const missingCount = getMissingItemNumberValue(item, [
    "missing_count",
    "missingCount",
  ]);

  if (missingCount !== null && missingCount > 0) {
    return `사용 가능한 일반기능장이 ${missingCount}개 부족합니다.`;
  }

  const rawType = getMissingItemTextValue(item, ["type", "category"]);
  const normalizedType = normalizeMissingItemType(rawType);

  if (
    normalizedType.includes("period") ||
    normalizedType.includes("month") ||
    normalizedType.includes("기간")
  ) {
    return "활동기간이 부족합니다.";
  }

  if (
    normalizedType.includes("requiredbadge") ||
    normalizedType.includes("requiredbadges") ||
    normalizedType.includes("필수기능장")
  ) {
    return "필수 기능장 취득이 필요합니다.";
  }

  if (
    normalizedType.includes("generalbadge") ||
    normalizedType.includes("generalbadges") ||
    normalizedType.includes("일반기능장")
  ) {
    return "일반 기능장 취득 수가 부족합니다.";
  }

  if (
    normalizedType.includes("program") ||
    normalizedType.includes("wsep") ||
    normalizedType.includes("mop") ||
    normalizedType.includes("프로그램")
  ) {
    return "WSEP 또는 MoP 이수 기록이 필요합니다.";
  }

  const message = getMissingItemTextValue(item, ["message"]);
  const normalizedMessage = normalizeMissingItemType(message);

  if (
    normalizedMessage.includes("program") ||
    normalizedMessage.includes("wsep") ||
    normalizedMessage.includes("mop")
  ) {
    return "WSEP 또는 MoP 이수 기록이 필요합니다.";
  }

  if (
    normalizedMessage.includes("general") ||
    normalizedMessage.includes("일반기능장")
  ) {
    return "일반 기능장 취득 수가 부족합니다.";
  }

  if (
    normalizedMessage.includes("required") ||
    normalizedMessage.includes("필수기능장")
  ) {
    return "필수 기능장 취득이 필요합니다.";
  }

  if (message && !isGenericMissingMessage(message)) {
    return message;
  }

  return "확인이 필요한 진급 조건이 있습니다.";
}

function getMissingItemDetail(item: MissingItem) {
  const badgeName = getMissingItemTextValue(item, [
    "badge_name",
    "badgeName",
    "badge",
    "name",
  ]);

  if (badgeName) {
    return "";
  }

  const requiredCount = getMissingItemNumberValue(item, [
    "required_count",
    "requiredCount",
  ]);
  const availableCount = getMissingItemNumberValue(item, [
    "available_count",
    "availableCount",
  ]);
  const missingCount = getMissingItemNumberValue(item, [
    "missing_count",
    "missingCount",
  ]);

  if (
    requiredCount !== null &&
    availableCount !== null &&
    missingCount !== null &&
    missingCount > 0
  ) {
    return `필요 ${requiredCount}개 중 ${availableCount}개가 인정되어 ${missingCount}개가 부족합니다.`;
  }

  const daysRemaining = getMissingItemNumberValue(item, [
    "days_remaining",
    "daysRemaining",
  ]);
  const availableAt = getMissingItemTextValue(item, ["available_at", "availableAt"]);

  if (daysRemaining !== null && daysRemaining > 0 && availableAt) {
    return `진급 가능 예정일 ${formatDate(availableAt)} · 남은 일수 ${daysRemaining}일`;
  }

  return "";
}

export default function AdvancementsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [scouts, setScouts] = useState<Scout[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [rankHistories, setRankHistories] = useState<RankHistory[]>([]);
  const [rankRequirements, setRankRequirements] = useState<RankRequirement[]>([]);
  const [promotionReviews, setPromotionReviews] = useState<PromotionReview[]>([]);

  const [keyword, setKeyword] = useState("");
  const [sortState, setSortState] = useState<AdvancementSortState>({
    key: "member_no",
    direction: "asc",
  });
  const [selectedScoutId, setSelectedScoutId] = useState<string | null>(null);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [isScoutDetailModalOpen, setIsScoutDetailModalOpen] = useState(false);
  const [selectedSummaryCardType, setSelectedSummaryCardType] =
    useState<SummaryCardType | null>(null);

  const [bulkSelectedScoutIds, setBulkSelectedScoutIds] = useState<string[]>([]);
  const [bulkReviewDate, setBulkReviewDate] = useState(getTodayText());
  const [bulkReviewSubmitting, setBulkReviewSubmitting] = useState(false);
  const [bulkReviewResultMessage, setBulkReviewResultMessage] = useState("");
  const [bulkReviewErrorMessage, setBulkReviewErrorMessage] = useState("");

  const [bulkApprovalDate, setBulkApprovalDate] = useState(getTodayText());
  const [bulkApprovalNote, setBulkApprovalNote] = useState("");
  const [bulkApprovalSubmitting, setBulkApprovalSubmitting] = useState(false);
  const [bulkApprovalResultMessage, setBulkApprovalResultMessage] = useState("");
  const [bulkApprovalErrorMessage, setBulkApprovalErrorMessage] = useState("");

  const [initialApprovalScoutId, setInitialApprovalScoutId] = useState<string | null>(null);
  const [initialApprovalForm, setInitialApprovalForm] =
    useState<InitialBeginnerApprovalForm>(getEmptyInitialBeginnerApprovalForm());
  const [initialApprovalSubmitting, setInitialApprovalSubmitting] = useState(false);
  const [initialApprovalErrorMessage, setInitialApprovalErrorMessage] = useState("");

  const [promotionReviewForm, setPromotionReviewForm] =
    useState<PromotionReviewForm>(getEmptyPromotionReviewForm());
  const [promotionReviewSubmitting, setPromotionReviewSubmitting] = useState(false);
  const [promotionReviewErrorMessage, setPromotionReviewErrorMessage] = useState("");

  const [promotionApprovalReviewId, setPromotionApprovalReviewId] = useState<string | null>(null);
  const [promotionApprovalForm, setPromotionApprovalForm] =
    useState<PromotionApprovalForm>(getEmptyPromotionApprovalForm());
  const [promotionApprovalSubmitting, setPromotionApprovalSubmitting] = useState(false);
  const [promotionApprovalErrorMessage, setPromotionApprovalErrorMessage] = useState("");

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const canManageAdvancements =
    profile?.role === "super_admin" ||
    profile?.role === "org_admin" ||
    profile?.role === "leader";

  const isSuperAdmin = profile?.role === "super_admin";

  const selectedAdvancementFilter = useMemo<AdvancementFilter>(() => {
    const filterValue = searchParams.get("filter");
    return isAdvancementFilter(filterValue) ? filterValue : "all";
  }, [searchParams]);

  const selectedAdvancementFilterInfo =
    ADVANCEMENT_FILTER_OPTIONS.find(
      (option) => option.value === selectedAdvancementFilter,
    ) ?? ADVANCEMENT_FILTER_OPTIONS[0];

  const handleSetAdvancementFilter = (filter: AdvancementFilter) => {
    const nextSearchParams = new URLSearchParams(searchParams);

    if (filter === "all") {
      nextSearchParams.delete("filter");
    } else {
      nextSearchParams.set("filter", filter);
    }

    setSearchParams(nextSearchParams);
    setSelectedReviewId(null);
    setPromotionReviewErrorMessage("");
    setPromotionApprovalErrorMessage("");
  };

  const loadData = async () => {
    setLoading(true);
    setErrorMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setErrorMessage("로그인 사용자 정보를 확인하지 못했습니다.");
      setLoading(false);
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("user_profiles")
      .select("role, organization_id")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (profileError) {
      console.error("사용자 프로필 조회 오류:", profileError.message);
      setErrorMessage("사용자 권한 정보를 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    if (!profileData || !isUserRole(profileData.role)) {
      setErrorMessage("사용자 권한 정보가 올바르지 않습니다.");
      setLoading(false);
      return;
    }

    const currentProfile: UserProfile = {
      role: profileData.role,
      organization_id: profileData.organization_id,
    };

    setProfile(currentProfile);

    const { data: rankData, error: rankError } = await supabase
      .from("ranks")
      .select("id, rank_code, rank_name, sort_order")
      .order("sort_order", { ascending: true });

    if (rankError) {
      console.error("급위 목록 조회 오류:", rankError.message);
      setErrorMessage("급위 목록을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const { data: requirementData, error: requirementError } = await supabase
      .from("rank_requirements")
      .select(
        "id, from_rank_id, to_rank_id, required_months, required_attendance_rate, required_general_badge_count, requires_wsep_or_mop",
      );

    if (requirementError) {
      console.error("진급요건 조회 오류:", requirementError.message);
      setErrorMessage("진급요건을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const { data: organizationData, error: organizationError } = await supabase
      .from("organizations")
      .select("id, name")
      .is("deleted_at", null)
      .order("name", { ascending: true });

    if (organizationError) {
      console.error("조직 목록 조회 오류:", organizationError.message);
    }

    let scoutQuery = supabase
      .from("scouts")
      .select(
        "id, organization_id, name, member_no, school_name, grade, joined_at, current_rank_id, is_from_cub_scout, cub_promotion_completed, beginner_course_exempted, status",
      )
      .is("deleted_at", null)
      .order("name", { ascending: true });

    let historyQuery = supabase
      .from("scout_rank_histories")
      .select(
        "id, organization_id, scout_id, rank_id, approved_at, approval_type, note",
      )
      .is("deleted_at", null)
      .order("approved_at", { ascending: false });

    let reviewQuery = supabase
      .from("promotion_reviews")
      .select(
        "id, organization_id, scout_id, from_rank_id, to_rank_id, review_date, base_date, available_at, required_months, days_remaining, period_passed, attendance_total_count, attendance_present_count, attendance_rate, attendance_passed, required_badges_passed, general_badges_passed, program_passed, final_passed, missing_items, note, created_at",
      )
      .is("deleted_at", null)
      .order("review_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (currentProfile.role !== "super_admin") {
      if (!currentProfile.organization_id) {
        setErrorMessage("소속 조직 정보가 없어 진급 정보를 조회할 수 없습니다.");
        setLoading(false);
        return;
      }

      scoutQuery = scoutQuery.eq("organization_id", currentProfile.organization_id);
      historyQuery = historyQuery.eq("organization_id", currentProfile.organization_id);
      reviewQuery = reviewQuery.eq("organization_id", currentProfile.organization_id);
    }

    const { data: scoutData, error: scoutError } = await scoutQuery;

    if (scoutError) {
      console.error("대원 목록 조회 오류:", scoutError.message);
      setErrorMessage("대원 목록을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const { data: historyData, error: historyError } = await historyQuery;

    if (historyError) {
      console.error("진급이력 조회 오류:", historyError.message);
      setErrorMessage("진급 이력을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const { data: reviewData, error: reviewError } = await reviewQuery;

    if (reviewError) {
      console.error("진급판정 조회 오류:", reviewError.message);
      setErrorMessage("진급판정 결과를 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    setRanks((rankData ?? []) as Rank[]);
    setRankRequirements((requirementData ?? []) as RankRequirement[]);
    setOrganizations((organizationData ?? []) as Organization[]);
    setScouts((scoutData ?? []) as unknown as Scout[]);
    setRankHistories((historyData ?? []) as unknown as RankHistory[]);
    setPromotionReviews((reviewData ?? []) as unknown as PromotionReview[]);
    setLoading(false);
  };

  const handleOpenInitialBeginnerApproval = (scout: Scout) => {
    if (!canManageAdvancements) return;

    setInitialApprovalScoutId(scout.id);
    setInitialApprovalForm(getEmptyInitialBeginnerApprovalForm());
    setInitialApprovalErrorMessage("");
  };

  const handleCloseInitialBeginnerApproval = () => {
    if (initialApprovalSubmitting) return;

    setInitialApprovalScoutId(null);
    setInitialApprovalForm(getEmptyInitialBeginnerApprovalForm());
    setInitialApprovalErrorMessage("");
  };

  const updateInitialApprovalForm = <K extends keyof InitialBeginnerApprovalForm>(
    field: K,
    value: InitialBeginnerApprovalForm[K],
  ) => {
    setInitialApprovalForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleApproveInitialBeginnerRank = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!canManageAdvancements) {
      setInitialApprovalErrorMessage("초급 인가 등록 권한이 없습니다.");
      return;
    }

    if (!initialApprovalScoutId) {
      setInitialApprovalErrorMessage("초급 인가를 등록할 대원을 선택해야 합니다.");
      return;
    }

    if (!initialApprovalForm.approved_at) {
      setInitialApprovalErrorMessage("초급 인가일을 입력해야 합니다.");
      return;
    }

    setInitialApprovalSubmitting(true);
    setInitialApprovalErrorMessage("");

    const rpcClient = supabase as unknown as {
      rpc: (
        functionName: string,
        args: Record<string, unknown>,
      ) => Promise<{
        data: unknown;
        error: { message: string } | null;
      }>;
    };

    const { error } = await rpcClient.rpc("approve_initial_beginner_rank", {
      p_scout_id: initialApprovalScoutId,
      p_approved_at: initialApprovalForm.approved_at,
      p_note:
        initialApprovalForm.note.trim().length > 0
          ? initialApprovalForm.note.trim()
          : null,
    });

    if (error) {
      console.error("초급 최초 인가 오류:", error.message);
      setInitialApprovalErrorMessage("초급 인가 등록 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      setInitialApprovalSubmitting(false);
      return;
    }

    setInitialApprovalScoutId(null);
    setInitialApprovalForm(getEmptyInitialBeginnerApprovalForm());
    setInitialApprovalSubmitting(false);

    await loadData();
  };

  const updatePromotionReviewForm = <K extends keyof PromotionReviewForm>(
    field: K,
    value: PromotionReviewForm[K],
  ) => {
    setPromotionReviewForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleRunPromotionReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canManageAdvancements) {
      setPromotionReviewErrorMessage("진급 판정 권한이 없습니다.");
      return;
    }

    if (!selectedScoutId) {
      setPromotionReviewErrorMessage("진급 판정할 대원을 선택해야 합니다.");
      return;
    }

    if (!promotionReviewForm.review_date) {
      setPromotionReviewErrorMessage("판정일을 입력해야 합니다.");
      return;
    }

    if (promotionReviewForm.review_date > getSeoulTodayText()) {
      setPromotionReviewErrorMessage("판정 기준일은 오늘 이후 날짜로 입력할 수 없습니다.");
      return;
    }

    const reviewTargetScout = scouts.find((scout) => scout.id === selectedScoutId) ?? null;

    if (!reviewTargetScout) {
      setPromotionReviewErrorMessage("진급 판정할 대원 정보를 확인하지 못했습니다.");
      return;
    }

    if (!reviewTargetScout.current_rank_id) {
      setPromotionReviewErrorMessage("현재급위가 등록되어 있지 않아 진급 판정을 실행할 수 없습니다.");
      return;
    }

    const reviewTargetNextRank = getNextRank(reviewTargetScout);

    if (!reviewTargetNextRank) {
      setPromotionReviewErrorMessage("다음 급위가 없어 진급 판정을 실행할 수 없습니다.");
      return;
    }

    const reviewTargetRequirement = getRequirementForTransition(
      reviewTargetScout.current_rank_id,
      reviewTargetNextRank,
    );

    if (!reviewTargetRequirement) {
      setPromotionReviewErrorMessage(
        `${getCurrentRankDisplay(reviewTargetScout)}에서 ${reviewTargetNextRank.rank_name}(으)로 진급하기 위한 판정 기준을 확인하지 못했습니다. 환경설정 또는 기준 데이터를 확인해 주세요.`,
      );
      return;
    }

    setPromotionReviewSubmitting(true);
    setPromotionReviewErrorMessage("");
    setPromotionApprovalErrorMessage("");

    const rpcClient = supabase as unknown as {
      rpc: (
        functionName: string,
        args: Record<string, unknown>,
      ) => Promise<{
        data: unknown;
        error: { message: string } | null;
      }>;
    };

    const { data, error } = await rpcClient.rpc("review_scout_promotion", {
      p_scout_id: selectedScoutId,
      p_review_date: promotionReviewForm.review_date,
    });

    if (error) {
      console.error("진급 판정 오류:", error.message);
      setPromotionReviewErrorMessage(`진급 판정에 실패했습니다. ${error.message}`);
      setPromotionReviewSubmitting(false);
      return;
    }

    if (typeof data === "string") {
      setSelectedReviewId(data);
    }

    setPromotionReviewSubmitting(false);
    await loadData();
  };

  const handleOpenPromotionApproval = (review: PromotionReview) => {
    if (!canManageAdvancements || !isReviewPassedForApproval(review)) return;

    setPromotionApprovalReviewId(review.id);
    setPromotionApprovalForm(getEmptyPromotionApprovalForm());
    setPromotionApprovalErrorMessage("");
  };

  const handleClosePromotionApproval = () => {
    if (promotionApprovalSubmitting) return;

    setPromotionApprovalReviewId(null);
    setPromotionApprovalForm(getEmptyPromotionApprovalForm());
    setPromotionApprovalErrorMessage("");
  };

  const updatePromotionApprovalForm = <K extends keyof PromotionApprovalForm>(
    field: K,
    value: PromotionApprovalForm[K],
  ) => {
    setPromotionApprovalForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleApprovePromotion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canManageAdvancements) {
      setPromotionApprovalErrorMessage("진급 인가 권한이 없습니다.");
      return;
    }

    if (!promotionApprovalReviewId) {
      setPromotionApprovalErrorMessage("인가할 진급 판정 결과를 선택해야 합니다.");
      return;
    }

    if (!promotionApprovalForm.approved_at) {
      setPromotionApprovalErrorMessage("진급 인가일을 입력해야 합니다.");
      return;
    }

    if (promotionApprovalForm.approved_at > getSeoulTodayText()) {
      setPromotionApprovalErrorMessage("진급 인가일은 오늘 이후 날짜로 입력할 수 없습니다.");
      return;
    }

    setPromotionApprovalSubmitting(true);
    setPromotionApprovalErrorMessage("");

    const rpcClient = supabase as unknown as {
      rpc: (
        functionName: string,
        args: Record<string, unknown>,
      ) => Promise<{
        data: unknown;
        error: { message: string } | null;
      }>;
    };

    const { error } = await rpcClient.rpc("approve_scout_promotion", {
      p_promotion_review_id: promotionApprovalReviewId,
      p_approved_at: promotionApprovalForm.approved_at,
      p_note:
        promotionApprovalForm.note.trim().length > 0
          ? promotionApprovalForm.note.trim()
          : null,
    });

    if (error) {
      console.error("진급 인가 오류:", error.message);
      setPromotionApprovalErrorMessage("진급 인가 저장 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      setPromotionApprovalSubmitting(false);
      return;
    }

    setPromotionApprovalReviewId(null);
    setPromotionApprovalForm(getEmptyPromotionApprovalForm());
    setPromotionApprovalSubmitting(false);
    setPromotionReviewForm(getEmptyPromotionReviewForm());
    setSelectedReviewId(null);

    await loadData();
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!isScoutDetailModalOpen && !selectedSummaryCardType) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isScoutDetailModalOpen, selectedSummaryCardType]);

  const sortedRanks = useMemo(() => {
    return [...ranks].sort((a, b) => a.sort_order - b.sort_order);
  }, [ranks]);

  const rankNameMap = useMemo(() => {
    return new Map(ranks.map((rank) => [rank.id, rank.rank_name]));
  }, [ranks]);

  const rankByIdMap = useMemo(() => {
    return new Map(ranks.map((rank) => [rank.id, rank]));
  }, [ranks]);

  const requirementByToRankIdMap = useMemo(() => {
    return new Map(
      rankRequirements.map((requirement) => [
        requirement.to_rank_id,
        requirement,
      ]),
    );
  }, [rankRequirements]);

  const isProgramRequiredForTargetRank = useCallback((toRankId: string | null) => {
    if (!toRankId) return false;

    const targetRank = rankByIdMap.get(toRankId);
    if (!targetRank) return false;

    const normalizedRankName = targetRank.rank_name.replace(/\s+/g, "");
    return targetRank.rank_code === "beom" || normalizedRankName === "범";
  }, [rankByIdMap]);

  const isProgramRequiredForReview = useCallback((review: PromotionReview) => {
    return isProgramRequiredForTargetRank(review.to_rank_id);
  }, [isProgramRequiredForTargetRank]);

  const isReviewPassedForApproval = useCallback((review: PromotionReview) => {
    const attendanceRequired = isProgramRequiredForReview(review);
    return review.final_passed && (!attendanceRequired || review.attendance_passed);
  }, [isProgramRequiredForReview]);

  const getRelevantMissingItems = (review: PromotionReview) => {
    const programRequired = isProgramRequiredForReview(review);
    const seenMessages = new Set<string>();

    return toMissingItems(review.missing_items).filter((item) => {
      if (isPeriodMissingItem(item)) return false;
      if (!programRequired && isProgramMissingItem(item)) return false;

      const message = `${getMissingItemMessage(item)}|${getMissingItemDetail(item)}`;
      if (seenMessages.has(message)) return false;
      seenMessages.add(message);
      return true;
    });
  };

  const organizationNameMap = useMemo(() => {
    return new Map(
      organizations.map((organization) => [organization.id, organization.name]),
    );
  }, [organizations]);

  const historiesByScoutId = useMemo(() => {
    const map = new Map<string, RankHistory[]>();

    rankHistories.forEach((history) => {
      const current = map.get(history.scout_id) ?? [];
      current.push(history);
      map.set(history.scout_id, current);
    });

    return map;
  }, [rankHistories]);

  const reviewsByScoutId = useMemo(() => {
    const map = new Map<string, PromotionReview[]>();

    promotionReviews.forEach((review) => {
      const current = map.get(review.scout_id) ?? [];
      current.push(review);
      map.set(review.scout_id, current);
    });

    return map;
  }, [promotionReviews]);

  const selectedScout = useMemo(() => {
    if (!selectedScoutId) return null;
    return scouts.find((scout) => scout.id === selectedScoutId) ?? null;
  }, [scouts, selectedScoutId]);

  const selectedScoutHistories = useMemo(() => {
    if (!selectedScout) return [];
    return historiesByScoutId.get(selectedScout.id) ?? [];
  }, [historiesByScoutId, selectedScout]);

  const selectedScoutReviews = useMemo(() => {
    if (!selectedScout) return [];
    return reviewsByScoutId.get(selectedScout.id) ?? [];
  }, [reviewsByScoutId, selectedScout]);

  const activeSelectedReview = useMemo(() => {
    if (!selectedScoutReviews.length) return null;

    if (selectedReviewId) {
      const foundReview = selectedScoutReviews.find((review) => review.id === selectedReviewId);
      if (foundReview) return foundReview;
    }

    return selectedScoutReviews[0];
  }, [selectedReviewId, selectedScoutReviews]);

  const getRankName = useCallback((rankId: string | null) => {
    if (!rankId) return "-";
    return rankNameMap.get(rankId) ?? "-";
  }, [rankNameMap]);

  const getOrganizationName = useCallback((organizationId: string) => {
    return organizationNameMap.get(organizationId) ?? "-";
  }, [organizationNameMap]);

  const getNextRank = useCallback((scout: Scout) => {
    if (isCubScoutByGrade(scout)) {
      return null;
    }

    if (!scout.current_rank_id) {
      return sortedRanks[0] ?? null;
    }

    const currentRank = rankByIdMap.get(scout.current_rank_id);

    if (!currentRank) {
      return null;
    }

    return (
      sortedRanks.find(
        (rank) => rank.sort_order === currentRank.sort_order + 1,
      ) ?? null
    );
  }, [rankByIdMap, sortedRanks]);

  const getCurrentRankDisplay = useCallback((scout: Scout) => {
    if (isCubScoutByGrade(scout)) {
      const storedRankName = scout.current_rank_id ? getRankName(scout.current_rank_id) : "";
      return storedRankName && storedRankName !== "-"
        ? storedRankName
        : getCubRankNameByGrade(scout.grade) || "컵스카우트";
    }

    if (!scout.current_rank_id) return "미등록";
    return getRankName(scout.current_rank_id);
  }, [getRankName]);

  const getNextRankDisplay = useCallback((scout: Scout) => {
    if (isCubScoutByGrade(scout)) {
      const nextCubRankName = getNextCubRankNameByGrade(scout.grade);
      return nextCubRankName
        ? `${nextCubRankName} 자동진급`
        : "스카우트 전환 준비";
    }

    const nextRank = getNextRank(scout);

    if (!nextRank) return "최종급위";

    if (nextRank.rank_code === "beginner" && scout.beginner_course_exempted) {
      return `${nextRank.rank_name} 인가 필요(과정 면제)`;
    }

    return nextRank.rank_name;
  }, [getNextRank]);

  const isRankCompleted = (scout: Scout, rankId: string) => {
    const histories = historiesByScoutId.get(scout.id) ?? [];
    return histories.some((history) => history.rank_id === rankId);
  };

  const getRequirementForTransition = (fromRankId: string | null, toRank: Rank | null) => {
    if (!toRank) return null;

    return (
      rankRequirements.find(
        (requirement) =>
          requirement.to_rank_id === toRank.id &&
          (!fromRankId || requirement.from_rank_id === fromRankId),
      ) ??
      requirementByToRankIdMap.get(toRank.id) ??
      null
    );
  };

  const getIsBeginnerCourseNoticeNeeded = (scout: Scout) => {
    if (!scout.beginner_course_exempted || isCubScoutByGrade(scout)) return false;

    const beginnerRank = sortedRanks.find(
      (rank) => rank.rank_code === "beginner" || rank.rank_name === "초급",
    );

    if (!beginnerRank) return false;

    const currentRank = scout.current_rank_id
      ? rankByIdMap.get(scout.current_rank_id) ?? null
      : null;

    if (!currentRank) return true;

    if (currentRank.id === beginnerRank.id) return true;

    return !isRankCompleted(scout, beginnerRank.id);
  };

  const getMissingRequirementDisplay = (nextRank: Rank | null) => {
    if (!nextRank) return "최종급위";

    if (nextRank.rank_code === "beom" || nextRank.rank_name === "범") {
      return "범 진급 기준 확인 필요";
    }

    return "진급 기준 확인 필요";
  };

  const getExpectedDateDisplay = useCallback((scout: Scout) => {
    if (isCubScoutByGrade(scout)) {
      return "학년 기준 자동진급";
    }

    const nextRank = getNextRank(scout);
    if (!nextRank) return "최종급위";

    const scoutReviews = reviewsByScoutId.get(scout.id) ?? [];
    const currentStepReview = [...scoutReviews]
      .filter(
        (review) =>
          review.from_rank_id === scout.current_rank_id &&
          review.to_rank_id === nextRank.id,
      )
      .sort((a, b) => {
        const bKey = `${b.review_date} ${b.created_at ?? ""}`;
        const aKey = `${a.review_date} ${a.created_at ?? ""}`;
        return bKey.localeCompare(aKey);
      })[0] ?? null;

    return currentStepReview?.available_at ?? "판정 후 확인";
  }, [getNextRank, reviewsByScoutId]);

  const getRankStepState = (scout: Scout, rank: Rank): RankStepState => {
    if (isCubScoutByGrade(scout)) {
      const cubRankName = getCubRankNameByGrade(scout.grade);
      if (rank.rank_name === cubRankName || rank.rank_name.includes(cubRankName)) {
        return "current";
      }
      return "pending";
    }

    const completed = isRankCompleted(scout, rank.id);
    const nextRank = getNextRank(scout);

    if (scout.current_rank_id === rank.id) {
      return "current";
    }

    if (completed) {
      return "completed";
    }

    if (nextRank?.id === rank.id) {
      if (rank.rank_code === "beginner" && scout.beginner_course_exempted) {
        return "exempted";
      }

      return "next";
    }

    if (
      rank.rank_code === "beginner" &&
      scout.beginner_course_exempted &&
      !completed
    ) {
      return "exempted";
    }

    const currentRank = scout.current_rank_id
      ? rankByIdMap.get(scout.current_rank_id) ?? null
      : null;

    if (currentRank && rank.sort_order < currentRank.sort_order) {
      return "missing_history";
    }

    return "pending";
  };

  const getMissingPriorRankHistories = (scout: Scout) => {
    if (!scout.current_rank_id || isCubScoutByGrade(scout)) return [];

    const currentRank = rankByIdMap.get(scout.current_rank_id) ?? null;
    if (!currentRank) return [];

    return sortedRanks.filter(
      (rank) =>
        rank.sort_order < currentRank.sort_order &&
        !isRankCompleted(scout, rank.id) &&
        !(rank.rank_code === "beginner" && scout.beginner_course_exempted),
    );
  };

  const getRankStepLabel = (state: RankStepState) => {
    if (state === "completed") return "완료";
    if (state === "current") return "현재";
    if (state === "next") return "다음";
    if (state === "missing_history") return "인가기록 없음";
    if (state === "exempted") return "면제/인가필요";
    return "미도달";
  };

  const getProgressCircleStyle = (state: RankStepState): CSSProperties => {
    if (state === "completed") {
      return {
        ...progressCircleStyle,
        backgroundColor: "#16a34a",
        border: "2px solid #16a34a",
        color: "#ffffff",
      };
    }

    if (state === "current") {
      return {
        ...progressCircleStyle,
        backgroundColor: "#2563eb",
        border: "2px solid #2563eb",
        color: "#ffffff",
      };
    }

    if (state === "next") {
      return {
        ...progressCircleStyle,
        backgroundColor: "#ffffff",
        border: "2px solid #f97316",
        color: "#f97316",
      };
    }

    if (state === "missing_history") {
      return {
        ...progressCircleStyle,
        backgroundColor: "#fef3c7",
        border: "2px solid #f59e0b",
        color: "#92400e",
      };
    }

    if (state === "exempted") {
      return {
        ...progressCircleStyle,
        backgroundColor: "#ffedd5",
        border: "2px solid #f97316",
        color: "#c2410c",
      };
    }

    return progressCircleStyle;
  };

  const getProgressLabelStyle = (state: RankStepState): CSSProperties => {
    if (state === "completed") {
      return { ...progressStatusStyle, color: "#15803d" };
    }

    if (state === "current") {
      return { ...progressStatusStyle, color: "#1d4ed8", fontWeight: 900 };
    }

    if (state === "missing_history") {
      return { ...progressStatusStyle, color: "#92400e", fontWeight: 900 };
    }

    if (state === "next" || state === "exempted") {
      return { ...progressStatusStyle, color: "#c2410c", fontWeight: 900 };
    }

    return progressStatusStyle;
  };

  const getStatusBadgeStyle = (status: ScoutStatus): CSSProperties => {
    return {
      ...statusBadgeStyle,
      ...SCOUT_STATUS_STYLES[status],
    };
  };

  const handleChangeSort = (key: AdvancementSortKey) => {
    setSortState((prev) => {
      if (prev.key === key) {
        return {
          key,
          direction: prev.direction === "asc" ? "desc" : "asc",
        };
      }

      return { key, direction: "asc" };
    });
  };

  const getSortIndicator = (key: AdvancementSortKey) => {
    if (sortState.key !== key) return "↕";
    return sortState.direction === "asc" ? "▲" : "▼";
  };

  const renderSortableHeader = (
    key: AdvancementSortKey,
    label: string,
    align: "left" | "center" = "left",
  ) => {
    const isActive = sortState.key === key;
    const baseButtonStyle = isActive
      ? activeSortableHeaderButtonStyle
      : sortableHeaderButtonStyle;
    const alignedButtonStyle =
      align === "center"
        ? {
            ...baseButtonStyle,
            justifyContent: "center",
            textAlign: "center" as const,
          }
        : baseButtonStyle;

    return (
      <th style={align === "center" ? centerSortableThStyle : sortableThStyle}>
        <button
          type="button"
          style={alignedButtonStyle}
          onClick={() => handleChangeSort(key)}
          title={`${label} 기준으로 정렬`}
        >
          <span>{label}</span>
          <span style={sortIndicatorStyle}>{getSortIndicator(key)}</span>
        </button>
      </th>
    );
  };

  const getScoutSortValue = useCallback((scout: Scout, key: AdvancementSortKey) => {
    if (key === "member_no") return scout.member_no ?? "";
    if (key === "name") return scout.name;
    if (key === "organization") return getOrganizationName(scout.organization_id);
    if (key === "school_name") return scout.school_name ?? "";
    if (key === "grade") return getGradeSortOrder(scout.grade);
    if (key === "current_rank") {
      return scout.current_rank_id
        ? rankByIdMap.get(scout.current_rank_id)?.sort_order ?? 9999
        : 9999;
    }
    if (key === "next_rank") return getNextRank(scout)?.sort_order ?? 9999;
    if (key === "expected_date") {
      const value = getExpectedDateDisplay(scout);
      return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "9999-12-31";
    }
    if (key === "status") return SCOUT_STATUS_LABELS[scout.status] ?? scout.status;
    if (key === "rank_history_count") return historiesByScoutId.get(scout.id)?.length ?? 0;
    if (key === "review_count") return reviewsByScoutId.get(scout.id)?.length ?? 0;

    return "";
  }, [
    getExpectedDateDisplay,
    getNextRank,
    getOrganizationName,
    historiesByScoutId,
    rankByIdMap,
    reviewsByScoutId,
  ]);

  const compareScoutSortValues = useCallback((firstScout: Scout, secondScout: Scout) => {
    const firstValue = getScoutSortValue(firstScout, sortState.key);
    const secondValue = getScoutSortValue(secondScout, sortState.key);

    let compareResult = 0;

    if (typeof firstValue === "number" && typeof secondValue === "number") {
      compareResult = firstValue - secondValue;
    } else {
      compareResult = String(firstValue).localeCompare(String(secondValue), "ko", {
        numeric: true,
        sensitivity: "base",
      });
    }

    if (compareResult === 0) {
      compareResult = (firstScout.member_no ?? "").localeCompare(secondScout.member_no ?? "", "ko", {
        numeric: true,
        sensitivity: "base",
      });
    }

    if (compareResult === 0) {
      compareResult = firstScout.name.localeCompare(secondScout.name, "ko");
    }

    return sortState.direction === "asc" ? compareResult : -compareResult;
  }, [getScoutSortValue, sortState]);

  const handleSelectScout = (scout: Scout) => {
    setSelectedScoutId(scout.id);
    setSelectedReviewId(null);
    setPromotionReviewErrorMessage("");
    setPromotionApprovalErrorMessage("");
    setPromotionApprovalReviewId(null);
  };

  const handleOpenScoutDetailModal = (scout: Scout) => {
    handleSelectScout(scout);
    setSelectedSummaryCardType(null);
    setIsScoutDetailModalOpen(true);
  };

  const handleCloseScoutDetailModal = () => {
    if (
      initialApprovalSubmitting ||
      promotionReviewSubmitting ||
      promotionApprovalSubmitting
    ) {
      return;
    }

    setIsScoutDetailModalOpen(false);
    setInitialApprovalScoutId(null);
    setInitialApprovalForm(getEmptyInitialBeginnerApprovalForm());
    setInitialApprovalErrorMessage("");
    setPromotionApprovalReviewId(null);
    setPromotionApprovalForm(getEmptyPromotionApprovalForm());
    setPromotionApprovalErrorMessage("");
    setPromotionReviewErrorMessage("");
  };

  const isBulkReviewSelectableScout = (scout: Scout) => {
    if (isCubScoutByGrade(scout)) {
      return false;
    }

    return Boolean(scout.current_rank_id && getNextRank(scout));
  };

  const handleToggleBulkScoutSelection = (scout: Scout, checked: boolean) => {
    setBulkReviewResultMessage("");
    setBulkReviewErrorMessage("");
    setBulkApprovalResultMessage("");
    setBulkApprovalErrorMessage("");

    if (!isBulkReviewSelectableScout(scout)) {
      return;
    }

    setBulkSelectedScoutIds((prev) => {
      if (checked) {
        return prev.includes(scout.id) ? prev : [...prev, scout.id];
      }

      return prev.filter((scoutId) => scoutId !== scout.id);
    });
  };

  const handleClearBulkScoutSelection = () => {
    setBulkSelectedScoutIds([]);
    setBulkReviewResultMessage("");
    setBulkReviewErrorMessage("");
    setBulkApprovalResultMessage("");
    setBulkApprovalErrorMessage("");
  };

  const getReviewResultBadgeStyle = (passed: boolean): CSSProperties => {
    return passed ? passBadgeStyle : failBadgeStyle;
  };

  const getConditionItemStyle = (passed: boolean): CSSProperties => {
    return passed ? conditionPassItemStyle : conditionFailItemStyle;
  };

  const getConditionValueStyle = (passed: boolean): CSSProperties => {
    return passed ? conditionPassValueStyle : conditionFailValueStyle;
  };

  const getLatestCurrentStepReview = useCallback((scout: Scout) => {
    if (isCubScoutByGrade(scout)) {
      return null;
    }

    const nextRank = getNextRank(scout);

    if (!scout.current_rank_id || !nextRank) {
      return null;
    }

    const scoutReviews = reviewsByScoutId.get(scout.id) ?? [];

    return (
      [...scoutReviews]
        .filter(
          (review) =>
            review.from_rank_id === scout.current_rank_id &&
            review.to_rank_id === nextRank.id,
        )
        .sort((a, b) => {
          const bKey = `${b.review_date} ${b.created_at ?? ""}`;
          const aKey = `${a.review_date} ${a.created_at ?? ""}`;
          return bKey.localeCompare(aKey);
        })[0] ?? null
    );
  }, [getNextRank, reviewsByScoutId]);

  const getAdvancementStatusLabel = (scout: Scout) => {
    if (isCubScoutByGrade(scout)) return "자동진급";
    if (!scout.current_rank_id) return "급위 등록 필요";

    const nextRank = getNextRank(scout);
    if (!nextRank) return "최종급위";

    const latestReview = getLatestCurrentStepReview(scout);
    if (!latestReview) return "판정 필요";
    return isReviewPassedForApproval(latestReview) ? "진급 가능" : "보완 필요";
  };

  const getAdvancementStatusStyle = (scout: Scout): CSSProperties => {
    const label = getAdvancementStatusLabel(scout);

    if (label === "진급 가능") return advancementReadyBadgeStyle;
    if (label === "보완 필요" || label === "급위 등록 필요") {
      return advancementSupportBadgeStyle;
    }
    if (label === "판정 필요") return advancementReviewNeededBadgeStyle;
    if (label === "자동진급") return advancementAutoBadgeStyle;
    return advancementNeutralBadgeStyle;
  };

  const getAdvancementSupportSummary = (scout: Scout) => {
    if (isCubScoutByGrade(scout)) return "학년 기준 자동 적용";
    if (!scout.current_rank_id) return "현재급위와 인가일 등록";

    const nextRank = getNextRank(scout);
    if (!nextRank) return "추가 진급 없음";

    const latestReview = getLatestCurrentStepReview(scout);
    if (!latestReview) return "진급 판정 실행";
    if (isReviewPassedForApproval(latestReview)) return "인가 처리 가능";

    const items: string[] = [];
    if (!latestReview.period_passed) items.push("활동기간");
    if (!latestReview.required_badges_passed) items.push("필수 기능장");
    if (!latestReview.general_badges_passed) items.push("일반 기능장");
    if (isProgramRequiredForReview(latestReview) && !latestReview.program_passed) {
      items.push("WSEP/MoP");
    }
    if (isProgramRequiredForReview(latestReview) && !latestReview.attendance_passed) {
      items.push("출석률");
    }

    return items.length > 0 ? items.join(", ") : "조건 재확인";
  };

  const isScoutMatchedAdvancementFilter = useCallback(
    (
      scout: Scout,
      filter: AdvancementFilter,
    ) => {
      if (filter === "all") {
        return true;
      }

      const nextRank = getNextRank(scout);

      if (!scout.current_rank_id || !nextRank) {
        return false;
      }

      const latestReview = getLatestCurrentStepReview(scout);

      if (filter === "not_reviewed") {
        return latestReview === null;
      }

      if (!latestReview) {
        return false;
      }

      if (filter === "ready") {
        const alreadyApprovedTargetRank =
          historiesByScoutId
            .get(scout.id)
            ?.some((history) => history.rank_id === nextRank.id) ?? false;

        return isReviewPassedForApproval(latestReview) && !alreadyApprovedTargetRank;
      }

      if (filter === "period") {
        return !latestReview.period_passed;
      }

      if (filter === "badge") {
        return (
          !latestReview.required_badges_passed ||
          !latestReview.general_badges_passed
        );
      }

      if (filter === "program") {
        return (
          isProgramRequiredForReview(latestReview) &&
          !latestReview.program_passed
        );
      }

      return true;
    },
    [
      getLatestCurrentStepReview,
      getNextRank,
      historiesByScoutId,
      isProgramRequiredForReview,
      isReviewPassedForApproval,
    ],
  );

  const advancementFilterCounts = useMemo(() => {
    return ADVANCEMENT_FILTER_OPTIONS.reduce(
      (accumulator, option) => ({
        ...accumulator,
        [option.value]: scouts.filter((scout) =>
          isScoutMatchedAdvancementFilter(scout, option.value),
        ).length,
      }),
      {} as Record<AdvancementFilter, number>,
    );
  }, [isScoutMatchedAdvancementFilter, scouts]);

  const filteredScouts = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return scouts
      .filter((scout) => {
        if (!isScoutMatchedAdvancementFilter(scout, selectedAdvancementFilter)) {
          return false;
        }

        if (!normalizedKeyword) {
          return true;
        }

        const targetText = [
          scout.member_no,
          scout.name,
          scout.school_name,
          scout.grade,
          isCubScoutByGrade(scout) ? "컵스카우트" : "스카우트",
          getCurrentRankDisplay(scout),
          getNextRankDisplay(scout),
          getExpectedDateDisplay(scout),
          getOrganizationName(scout.organization_id),
          SCOUT_STATUS_LABELS[scout.status],
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return targetText.includes(normalizedKeyword);
      })
      .sort(compareScoutSortValues);
  }, [
    compareScoutSortValues,
    getCurrentRankDisplay,
    getExpectedDateDisplay,
    getNextRankDisplay,
    getOrganizationName,
    isScoutMatchedAdvancementFilter,
    keyword,
    scouts,
    selectedAdvancementFilter,
  ]);

  useEffect(() => {
    const scoutIdSet = new Set(scouts.map((scout) => scout.id));

    setBulkSelectedScoutIds((prev) =>
      prev.filter((scoutId) => scoutIdSet.has(scoutId)),
    );
  }, [scouts]);

  const bulkSelectedScoutIdSet = new Set(bulkSelectedScoutIds);

  const bulkSelectedScouts = bulkSelectedScoutIds
    .map((scoutId) => scouts.find((scout) => scout.id === scoutId) ?? null)
    .filter((scout): scout is Scout => scout !== null);

  const getLatestApprovablePromotionReview = (scout: Scout) => {
    if (isCubScoutByGrade(scout)) {
      return null;
    }

    const nextRank = getNextRank(scout);

    if (!scout.current_rank_id || !nextRank) {
      return null;
    }

    const scoutReviews = reviewsByScoutId.get(scout.id) ?? [];
    const scoutHistories = historiesByScoutId.get(scout.id) ?? [];

    const alreadyApprovedTargetRank = scoutHistories.some(
      (history) => history.rank_id === nextRank.id,
    );

    if (alreadyApprovedTargetRank) {
      return null;
    }

    return (
      [...scoutReviews]
        .filter((review) => {
          return (
            isReviewPassedForApproval(review) &&
            review.from_rank_id === scout.current_rank_id &&
            review.to_rank_id === nextRank.id
          );
        })
        .sort((a, b) => {
          const bKey = `${b.review_date} ${b.created_at ?? ""}`;
          const aKey = `${a.review_date} ${a.created_at ?? ""}`;
          return bKey.localeCompare(aKey);
        })[0] ?? null
    );
  };

  const visibleBulkSelectableScouts = filteredScouts.filter(isBulkReviewSelectableScout);

  const visibleBulkApprovableScouts = filteredScouts.filter(
    (scout) => getLatestApprovablePromotionReview(scout) !== null,
  );

  const bulkSelectedApprovableScouts = bulkSelectedScouts.filter(
    (scout) => getLatestApprovablePromotionReview(scout) !== null,
  );

  const selectedVisibleBulkScoutCount = visibleBulkSelectableScouts.filter((scout) =>
    bulkSelectedScoutIdSet.has(scout.id),
  ).length;

  const isAllVisibleBulkScoutsSelected =
    visibleBulkSelectableScouts.length > 0 &&
    selectedVisibleBulkScoutCount === visibleBulkSelectableScouts.length;

  const handleToggleAllVisibleBulkScouts = (checked: boolean) => {
    setBulkReviewResultMessage("");
    setBulkReviewErrorMessage("");
    setBulkApprovalResultMessage("");
    setBulkApprovalErrorMessage("");

    const visibleIdSet = new Set(visibleBulkSelectableScouts.map((scout) => scout.id));

    setBulkSelectedScoutIds((prev) => {
      if (checked) {
        return Array.from(new Set([...prev, ...visibleIdSet]));
      }

      return prev.filter((scoutId) => !visibleIdSet.has(scoutId));
    });
  };

  const handleSelectAllVisibleBulkScouts = () => {
    setBulkReviewResultMessage("");
    setBulkReviewErrorMessage("");
    setBulkApprovalResultMessage("");
    setBulkApprovalErrorMessage("");

    const visibleIds = visibleBulkSelectableScouts.map((scout) => scout.id);

    setBulkSelectedScoutIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
  };

  const handleSelectAllVisibleBulkApprovableScouts = () => {
    setBulkReviewResultMessage("");
    setBulkReviewErrorMessage("");
    setBulkApprovalResultMessage("");
    setBulkApprovalErrorMessage("");

    const visibleIds = visibleBulkApprovableScouts.map((scout) => scout.id);

    setBulkSelectedScoutIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
  };

  const handleRunBulkPromotionReview = async () => {
    if (!canManageAdvancements) {
      setBulkReviewErrorMessage("진급 판정 권한이 없습니다.");
      return;
    }

    if (!bulkReviewDate) {
      setBulkReviewErrorMessage("판정일을 입력해야 합니다.");
      return;
    }

    if (bulkReviewDate > getSeoulTodayText()) {
      setBulkReviewErrorMessage("판정일은 오늘 이후 날짜로 입력할 수 없습니다.");
      return;
    }

    if (bulkSelectedScouts.length === 0) {
      setBulkReviewErrorMessage("진급 판정할 대원을 선택해야 합니다.");
      return;
    }

    setBulkReviewSubmitting(true);
    setBulkReviewResultMessage("");
    setBulkReviewErrorMessage("");
    setPromotionReviewErrorMessage("");
    setPromotionApprovalErrorMessage("");

    const rpcClient = supabase as unknown as {
      rpc: (
        functionName: string,
        args: Record<string, unknown>,
      ) => Promise<{
        data: unknown;
        error: { message: string } | null;
      }>;
    };

    let successCount = 0;
    let lastSuccessScoutId: string | null = null;
    let lastSuccessReviewId: string | null = null;
    const failedMessages: string[] = [];

    for (const scout of bulkSelectedScouts) {
      if (isCubScoutByGrade(scout)) {
        failedMessages.push(`${scout.name}: 컵스카우트 자동진급 대상`);
        continue;
      }

      if (!scout.current_rank_id) {
        failedMessages.push(`${scout.name}: 현재 급위가 없어 판정 제외`);
        continue;
      }

      if (!getNextRank(scout)) {
        failedMessages.push(`${scout.name}: 다음 급위가 없어 판정 제외`);
        continue;
      }

      const { data, error } = await rpcClient.rpc("review_scout_promotion", {
        p_scout_id: scout.id,
        p_review_date: bulkReviewDate,
      });

      if (error) {
        console.error("진급 일괄 판정 오류:", scout.name, error.message);
        failedMessages.push(`${scout.name}: 판정 중 문제가 발생했습니다.`);
        continue;
      }

      successCount += 1;
      lastSuccessScoutId = scout.id;

      if (typeof data === "string") {
        lastSuccessReviewId = data;
      }
    }

    setBulkReviewSubmitting(false);

    await loadData();

    if (lastSuccessScoutId) {
      setSelectedScoutId(lastSuccessScoutId);
      setSelectedReviewId(lastSuccessReviewId);
    }

    setBulkReviewResultMessage(
      `선택 대원 판정 완료: 성공 ${successCount}명, 실패/제외 ${failedMessages.length}명`,
    );

    if (failedMessages.length > 0) {
      setBulkReviewErrorMessage(failedMessages.join(" / "));
    }
  };

  const handleRunBulkPromotionApproval = async () => {
    if (!canManageAdvancements) {
      setBulkApprovalErrorMessage("진급 인가 권한이 없습니다.");
      return;
    }

    if (!bulkApprovalDate) {
      setBulkApprovalErrorMessage("인가일을 입력해야 합니다.");
      return;
    }

    if (bulkApprovalDate > getSeoulTodayText()) {
      setBulkApprovalErrorMessage("인가일은 오늘 이후 날짜로 입력할 수 없습니다.");
      return;
    }

    if (bulkSelectedScouts.length === 0) {
      setBulkApprovalErrorMessage("진급 인가할 대원을 선택해야 합니다.");
      return;
    }

    setBulkApprovalSubmitting(true);
    setBulkApprovalResultMessage("");
    setBulkApprovalErrorMessage("");
    setPromotionReviewErrorMessage("");
    setPromotionApprovalErrorMessage("");

    const rpcClient = supabase as unknown as {
      rpc: (
        functionName: string,
        args: Record<string, unknown>,
      ) => Promise<{
        data: unknown;
        error: { message: string } | null;
      }>;
    };

    let successCount = 0;
    let lastSuccessScoutId: string | null = null;
    let lastSuccessReviewId: string | null = null;
    const failedMessages: string[] = [];

    for (const scout of bulkSelectedScouts) {
      const approvableReview = getLatestApprovablePromotionReview(scout);

      if (!approvableReview) {
        failedMessages.push(`${scout.name}: 진급 가능한 최신 판정 결과가 없어 인가 제외`);
        continue;
      }

      const { error } = await rpcClient.rpc("approve_scout_promotion", {
        p_promotion_review_id: approvableReview.id,
        p_approved_at: bulkApprovalDate,
        p_note:
          bulkApprovalNote.trim().length > 0
            ? bulkApprovalNote.trim()
            : null,
      });

      if (error) {
        console.error("진급 일괄 인가 오류:", scout.name, error.message);
        failedMessages.push(`${scout.name}: 인가 저장 중 문제가 발생했습니다.`);
        continue;
      }

      successCount += 1;
      lastSuccessScoutId = scout.id;
      lastSuccessReviewId = approvableReview.id;
    }

    setBulkApprovalSubmitting(false);
    setBulkSelectedScoutIds([]);

    await loadData();

    if (lastSuccessScoutId) {
      setSelectedScoutId(lastSuccessScoutId);
      setSelectedReviewId(lastSuccessReviewId);
    }

    setBulkApprovalResultMessage(
      `진급 인가 저장 완료: 성공 ${successCount}명, 실패/제외 ${failedMessages.length}명`,
    );

    if (failedMessages.length > 0) {
      setBulkApprovalErrorMessage(failedMessages.join(" / "));
    }
  };

  const advancementTargetCount = advancementFilterCounts.all ?? scouts.length;

  const promotionReadyCount = scouts.filter((scout) =>
    isScoutMatchedAdvancementFilter(scout, "ready"),
  ).length;

  const conditionSupportNeededCount = scouts.filter(
    (scout) =>
      isScoutMatchedAdvancementFilter(scout, "period") ||
      isScoutMatchedAdvancementFilter(scout, "badge") ||
      isScoutMatchedAdvancementFilter(scout, "program"),
  ).length;

  const notReviewedCount = scouts.filter((scout) =>
    isScoutMatchedAdvancementFilter(scout, "not_reviewed"),
  ).length;

  const summaryCardInfoMap: Record<
    SummaryCardType,
    { title: string; description: string }
  > = {
    target: {
      title: "진급 현황 대상",
      description: "현재 목록 기준의 전체 관리 대상입니다.",
    },
    ready: {
      title: "진급 가능",
      description: "인가 가능 대원입니다.",
    },
    support: {
      title: "조건 보완 필요",
      description: "보완이 필요한 대원입니다.",
    },
    not_reviewed: {
      title: "판정 필요",
      description: "판정 기록이 없는 대원입니다.",
    },
  };

  const getSummaryCardScouts = (type: SummaryCardType) => {
    if (type === "target") {
      return scouts
        .filter((scout) => isScoutMatchedAdvancementFilter(scout, "all"))
        .sort(compareScoutSortValues);
    }

    if (type === "ready") {
      return scouts
        .filter((scout) => isScoutMatchedAdvancementFilter(scout, "ready"))
        .sort(compareScoutSortValues);
    }

    if (type === "support") {
      return scouts
        .filter(
          (scout) =>
            isScoutMatchedAdvancementFilter(scout, "period") ||
            isScoutMatchedAdvancementFilter(scout, "badge") ||
            isScoutMatchedAdvancementFilter(scout, "program"),
        )
        .sort(compareScoutSortValues);
    }

    return scouts
      .filter((scout) => isScoutMatchedAdvancementFilter(scout, "not_reviewed"))
      .sort(compareScoutSortValues);
  };

  const getSummaryCardScoutMessage = (scout: Scout, type: SummaryCardType) => {
    const nextRank = getNextRank(scout);
    const latestReview = getLatestCurrentStepReview(scout);

    if (type === "target") {
      return nextRank
        ? `${getCurrentRankDisplay(scout)} → ${nextRank.rank_name} 관리 대상`
        : "현재 급위 또는 다음 급위 확인 필요";
    }

    if (type === "ready") {
      return nextRank ? `${nextRank.rank_name} 진급 인가 가능` : "진급 가능 결과 확인";
    }

    if (type === "not_reviewed") {
      return nextRank ? `${nextRank.rank_name} 진급 판정 필요` : "다음 급위 확인 필요";
    }

    if (!latestReview) {
      return "진급 조건 확인 필요";
    }

    const supportItems: string[] = [];
    if (!latestReview.period_passed) supportItems.push("기간");
    if (!latestReview.required_badges_passed || !latestReview.general_badges_passed) {
      supportItems.push("기능장");
    }
    if (
      isProgramRequiredForReview(latestReview) &&
      !latestReview.program_passed
    ) {
      supportItems.push("WSEP/MoP");
    }

    return supportItems.length > 0
      ? `${supportItems.join(", ")} 보완 필요`
      : "진급 조건 확인 필요";
  };

  const selectedSummaryCardInfo = selectedSummaryCardType
    ? summaryCardInfoMap[selectedSummaryCardType]
    : null;

  const selectedSummaryCardScouts = selectedSummaryCardType
    ? getSummaryCardScouts(selectedSummaryCardType)
    : [];

  const isBulkActionBarVisible =
    canManageAdvancements &&
    (bulkSelectedScouts.length > 0 ||
      bulkReviewResultMessage.length > 0 ||
      bulkReviewErrorMessage.length > 0 ||
      bulkApprovalResultMessage.length > 0 ||
      bulkApprovalErrorMessage.length > 0);

  return (
    <div>
      <div style={pageHeaderStyle}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}><h1 style={pageTitleStyle}>진급 관리</h1><PageHelpButton title="진급 관리" description="진급 판정과 진급 인가를 처리하는 핵심 업무 화면입니다." sections={[{ title: "사용 순서", content: "대원을 선택하고 조건을 확인한 뒤 판정, 보완, 인가 순으로 진행합니다." },{ title: "주의사항", content: "필수 기능장과 일반 기능장 조건은 모두 충족해야 합니다." }]} /></div>
          <p style={pageDescriptionStyle}>
            컵스카우트는 학년에 따른 자동 급위를 확인하고, 스카우트 이상은 진급 판정과 인가 기록을 관리합니다.
          </p>
        </div>

        {profile && <div style={roleBadgeStyle}>{ROLE_LABELS[profile.role]}</div>}
      </div>

      <div style={summaryGridStyle}>
        <button
          type="button"
          style={targetSummaryCardButtonStyle}
          onClick={() => setSelectedSummaryCardType("target")}
        >
          <div style={summaryCardTopRowStyle}>
            <h2 style={summaryTitleStyle}>진급 현황 대상</h2>
            <span style={targetSummaryBadgeStyle}>전체</span>
          </div>
          <p style={summaryValueStyle}>{advancementTargetCount}명</p>
          <p style={summaryDescriptionStyle}>현재 목록 기준 전체 대원</p>
        </button>

        <button
          type="button"
          style={readySummaryCardButtonStyle}
          onClick={() => setSelectedSummaryCardType("ready")}
        >
          <div style={summaryCardTopRowStyle}>
            <h2 style={readySummaryTitleStyle}>진급가능</h2>
            <span style={readySummaryBadgeStyle}>인가 가능</span>
          </div>
          <p style={readySummaryValueStyle}>{promotionReadyCount}명</p>
          <p style={readySummaryDescriptionStyle}>인가 처리 가능</p>
        </button>

        <button
          type="button"
          style={supportSummaryCardButtonStyle}
          onClick={() => setSelectedSummaryCardType("support")}
        >
          <div style={summaryCardTopRowStyle}>
            <h2 style={supportSummaryTitleStyle}>조건보완 필요</h2>
            <span style={supportSummaryBadgeStyle}>확인 필요</span>
          </div>
          <p style={supportSummaryValueStyle}>{conditionSupportNeededCount}명</p>
          <p style={supportSummaryDescriptionStyle}>부족 조건 확인</p>
        </button>

        <button
          type="button"
          style={notReviewedSummaryCardButtonStyle}
          onClick={() => setSelectedSummaryCardType("not_reviewed")}
        >
          <div style={summaryCardTopRowStyle}>
            <h2 style={notReviewedSummaryTitleStyle}>판정필요</h2>
            <span style={notReviewedSummaryBadgeStyle}>미판정</span>
          </div>
          <p style={notReviewedSummaryValueStyle}>{notReviewedCount}명</p>
          <p style={notReviewedSummaryDescriptionStyle}>진급 판정 필요</p>
        </button>
      </div>

      <section style={contentCardStyle}>
        <div style={toolbarStyle}>
          <div>
            <h2 style={sectionTitleStyle}>대원별 진급 현황</h2>
            <p style={sectionDescriptionStyle}>
              현재 급위와 다음 급위, 판정 상태, 보완 항목을 확인하고 필요한 대원을 선택해 판정·인가합니다.
            </p>
          </div>
        </div>

        <section style={advancementFilterBarStyle}>
          <div style={advancementFilterBarTitleRowStyle}>
            <h3 style={advancementFilterBarTitleStyle}>조회 구분</h3>
            <p style={activeFilterInlineNoticeStyle}>
              {selectedAdvancementFilterInfo.description}
            </p>
          </div>

          <div style={advancementFilterButtonGroupStyle}>
            {ADVANCEMENT_FILTER_OPTIONS.map((option) => {
              const isActive = selectedAdvancementFilter === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  style={
                    isActive
                      ? activeAdvancementFilterButtonStyle
                      : advancementFilterButtonStyle
                  }
                  onClick={() => handleSetAdvancementFilter(option.value)}
                >
                  <span>{option.label}</span>
                  <strong>{advancementFilterCounts[option.value] ?? 0}명</strong>
                </button>
              );
            })}
          </div>
        </section>

        <div style={advancementSearchPanelStyle}>
          <div style={advancementSearchControlStyle}>
            <h3 style={advancementSearchTitleStyle}>검색</h3>

            <input
              style={searchInputStyle}
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="대원번호, 이름, 급위, 보완 항목 검색"
            />

            {keyword.trim().length > 0 && (
              <button
                type="button"
                style={secondaryButtonStyle}
                onClick={() => setKeyword("")}
              >
                검색 초기화
              </button>
            )}

            <button type="button" style={secondaryButtonStyle} onClick={loadData}>
              새로고침
            </button>

            <div style={advancementSearchCountStyle}>현재 {filteredScouts.length}명</div>
          </div>

          {isBulkActionBarVisible && (
            <div style={bulkFixedBarShellStyle}>
              <div style={bulkFixedBarStyle}>
                <div style={bulkFixedBarHeaderStyle}>
                  <div style={bulkFixedBarTitleGroupStyle}>
                    <strong style={bulkFixedBarTitleStyle}>선택 대원 작업</strong>
                    <span style={bulkFixedBarMetaStyle}>
                      선택 {bulkSelectedScouts.length}명 · 판정 가능 {bulkSelectedScouts.filter(isBulkReviewSelectableScout).length}명 · 인가 가능 {bulkSelectedApprovableScouts.length}명
                    </span>
                  </div>

                  <div style={bulkFixedHeaderActionStyle}>
                    <button
                      type="button"
                      style={secondaryButtonStyle}
                      onClick={handleSelectAllVisibleBulkScouts}
                      disabled={
                        bulkReviewSubmitting ||
                        bulkApprovalSubmitting ||
                        visibleBulkSelectableScouts.length === 0
                      }
                    >
                      현재 목록 전체 선택
                    </button>

                    <button
                      type="button"
                      style={secondaryButtonStyle}
                      onClick={handleClearBulkScoutSelection}
                      disabled={bulkReviewSubmitting || bulkApprovalSubmitting}
                    >
                      {bulkSelectedScouts.length === 0 ? "닫기" : "선택 해제"}
                    </button>
                  </div>
                </div>

                <div style={bulkFixedBarControlStyle}>
                  <div style={bulkTaskPanelStyle}>
                    <div style={bulkTaskPanelHeaderStyle}>
                      <strong style={bulkInlineTaskTitleStyle}>진급 판정</strong>
                      <span style={bulkTaskPanelHelpStyle}>선택한 대원의 진급 조건을 확인합니다.</span>
                    </div>

                    <div style={bulkTaskPanelControlRowStyle}>
                      <label style={bulkDateFieldLabelStyle}>
                        판정일
                        <input
                          style={bulkFixedInputStyle}
                          type="date"
                          max={getSeoulTodayText()}
                          value={bulkReviewDate}
                          onChange={(event) => setBulkReviewDate(event.target.value)}
                          disabled={bulkReviewSubmitting}
                        />
                      </label>

                      <button
                        type="button"
                        style={primaryButtonStyle}
                        onClick={handleRunBulkPromotionReview}
                        disabled={
                          bulkReviewSubmitting ||
                          bulkApprovalSubmitting ||
                          bulkSelectedScouts.length === 0
                        }
                      >
                        {bulkReviewSubmitting ? "판정 중..." : "선택 대원 판정"}
                      </button>
                    </div>
                  </div>

                  <div style={bulkTaskPanelStyle}>
                    <div style={bulkTaskPanelHeaderStyle}>
                      <strong style={bulkInlineTaskTitleStyle}>진급 인가</strong>
                      <span style={bulkTaskPanelHelpStyle}>진급 가능한 대원을 인가 기록으로 저장합니다.</span>
                    </div>

                    <div style={bulkTaskPanelControlRowStyle}>
                      <label style={bulkDateFieldLabelStyle}>
                        인가일
                        <input
                          style={bulkFixedInputStyle}
                          type="date"
                          max={getSeoulTodayText()}
                          value={bulkApprovalDate}
                          onChange={(event) => setBulkApprovalDate(event.target.value)}
                          disabled={bulkApprovalSubmitting}
                        />
                      </label>

                      <label style={bulkFixedNoteLabelStyle}>
                        비고
                        <input
                          style={bulkFixedInputStyle}
                          value={bulkApprovalNote}
                          onChange={(event) => setBulkApprovalNote(event.target.value)}
                          placeholder="비워두면 기본 문구로 저장"
                          disabled={bulkApprovalSubmitting}
                        />
                      </label>

                      <button
                        type="button"
                        style={secondaryButtonStyle}
                        onClick={handleSelectAllVisibleBulkApprovableScouts}
                        disabled={
                          bulkReviewSubmitting ||
                          bulkApprovalSubmitting ||
                          visibleBulkApprovableScouts.length === 0
                        }
                      >
                        진급 가능 전체 선택
                      </button>

                      <button
                        type="button"
                        style={submitButtonStyle}
                        onClick={handleRunBulkPromotionApproval}
                        disabled={
                          bulkReviewSubmitting ||
                          bulkApprovalSubmitting ||
                          bulkSelectedScouts.length === 0
                        }
                      >
                        {bulkApprovalSubmitting ? "인가 중..." : "진급 인가 저장"}
                      </button>
                    </div>
                  </div>
                </div>

                {(bulkReviewResultMessage ||
                  bulkReviewErrorMessage ||
                  bulkApprovalResultMessage ||
                  bulkApprovalErrorMessage) && (
                  <div style={bulkFixedMessageGridStyle}>
                    {bulkReviewResultMessage && (
                      <div style={bulkFixedSuccessMessageStyle}>{bulkReviewResultMessage}</div>
                    )}
                    {bulkReviewErrorMessage && (
                      <div style={bulkFixedErrorMessageStyle}>{bulkReviewErrorMessage}</div>
                    )}
                    {bulkApprovalResultMessage && (
                      <div style={bulkFixedSuccessMessageStyle}>{bulkApprovalResultMessage}</div>
                    )}
                    {bulkApprovalErrorMessage && (
                      <div style={bulkFixedErrorMessageStyle}>{bulkApprovalErrorMessage}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {loading && <div style={emptyStateStyle}>진급 정보를 불러오는 중입니다...</div>}

        {!loading && errorMessage && <div style={errorBoxStyle}>{errorMessage}</div>}

        {!loading && !errorMessage && filteredScouts.length === 0 && (
          <EmptyState title="현재 조건에 맞는 대원이 없습니다" description="조회 구분을 변경하거나 대원 정보를 먼저 확인하세요." />
        )}

        {!loading && !errorMessage && filteredScouts.length > 0 && (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  {canManageAdvancements && (
                    <th style={centerThStyle}>
                      <label style={selectHeaderLabelStyle}>
                        <input
                          type="checkbox"
                          checked={isAllVisibleBulkScoutsSelected}
                          onChange={(event) =>
                            handleToggleAllVisibleBulkScouts(event.target.checked)
                          }
                          disabled={
                            bulkReviewSubmitting ||
                            bulkApprovalSubmitting ||
                            visibleBulkSelectableScouts.length === 0
                          }
                          title="현재 표시된 판정 가능 대원을 모두 선택하거나 해제합니다."
                        />
                        <span>선택</span>
                      </label>
                    </th>
                  )}
                  {renderSortableHeader("member_no", "대원번호")}
                  {renderSortableHeader("name", "이름")}
                  {isSuperAdmin && renderSortableHeader("organization", "소속 조직")}
                  {renderSortableHeader("grade", "학년", "center")}
                  <th style={centerThStyle}>구분</th>
                  {renderSortableHeader("current_rank", "현재 급위", "center")}
                  {renderSortableHeader("next_rank", "다음 급위", "center")}
                  {renderSortableHeader("expected_date", "예상 진급일", "center")}
                  <th style={centerThStyle}>판정 상태</th>
                  <th style={thStyle}>확인·보완 항목</th>
                  {renderSortableHeader("status", "활동 상태", "center")}
                  <th style={centerThStyle}>상세</th>
                </tr>
              </thead>

              <tbody>
                {filteredScouts.map((scout) => {
                  const expectedDateText = getExpectedDateDisplay(scout);
                  const expectedDate = /^\d{4}-\d{2}-\d{2}$/.test(expectedDateText)
                    ? expectedDateText
                    : null;
                  const expectedDateStatus = getDateStatusLabel(expectedDate);

                  return (
                    <tr key={scout.id} style={tableDataRowStyle}>
                      {canManageAdvancements && (
                        <td style={centerTdStyle} onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={bulkSelectedScoutIdSet.has(scout.id)}
                            onChange={(event) =>
                              handleToggleBulkScoutSelection(scout, event.target.checked)
                            }
                            disabled={
                              !isBulkReviewSelectableScout(scout) ||
                              bulkReviewSubmitting ||
                              bulkApprovalSubmitting
                            }
                            title={
                              isBulkReviewSelectableScout(scout)
                                ? "진급 판정 대상 선택"
                                : "현재 급위가 없거나 다음 급위가 없어 진급 판정할 수 없습니다."
                            }
                          />
                        </td>
                      )}
                      <td style={tdStyle}>{scout.member_no ?? "-"}</td>
                      <td style={strongTdStyle}>{scout.name}</td>
                      {isSuperAdmin && (
                        <td style={tdStyle}>{getOrganizationName(scout.organization_id)}</td>
                      )}
                      <td style={centerTdStyle}>{scout.grade ?? "-"}</td>
                      <td style={centerTdStyle}>{isCubScoutByGrade(scout) ? "컵스카우트" : "스카우트"}</td>
                      <td style={centerTdStyle}>{getCurrentRankDisplay(scout)}</td>
                      <td style={centerTdStyle}>{getNextRankDisplay(scout)}</td>
                      <td style={centerTdStyle}>
                        <span style={expectedDateInlineStyle}>
                          <span>{getExpectedDateDisplay(scout)}</span>
                          {expectedDate && (
                            <span style={dateStatusBadgeStyle}>{expectedDateStatus}</span>
                          )}
                        </span>
                      </td>
                      <td style={centerTdStyle}>
                        <span style={getAdvancementStatusStyle(scout)}>
                          {getAdvancementStatusLabel(scout)}
                        </span>
                      </td>
                      <td style={supportSummaryTdStyle}>
                        {getAdvancementSupportSummary(scout)}
                      </td>
                      <td style={centerTdStyle}>
                        <span style={getStatusBadgeStyle(scout.status)}>
                          {SCOUT_STATUS_LABELS[scout.status]}
                        </span>
                      </td>
                      <td style={centerTdStyle}>
                        <button
                          type="button"
                          style={smallButtonStyle}
                          onClick={() => handleOpenScoutDetailModal(scout)}
                        >
                          상세
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedSummaryCardType && selectedSummaryCardInfo && createPortal(
        <div
          style={modalBackdropStyle}
          onMouseDown={() => setSelectedSummaryCardType(null)}
        >
          <div
            style={summaryDetailModalStyle}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div style={modalHeaderStyle}>
              <div>
                <h2 style={modalTitleStyle}>{selectedSummaryCardInfo.title}</h2>
                <p style={modalDescriptionStyle}>
                  {selectedSummaryCardInfo.description} 총 {selectedSummaryCardScouts.length}명이 표시됩니다.
                </p>
              </div>
              <button
                type="button"
                style={modalCloseButtonStyle}
                onClick={() => setSelectedSummaryCardType(null)}
                aria-label="상세 목록 닫기"
              >
                ×
              </button>
            </div>

            {selectedSummaryCardScouts.length === 0 ? (
              <div style={modalEmptyStateStyle}>해당하는 대원이 없습니다.</div>
            ) : (
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>대원번호</th>
                      <th style={thStyle}>이름</th>
                      {isSuperAdmin && <th style={thStyle}>소속 조직</th>}
                      <th style={centerThStyle}>학년</th>
                      <th style={centerThStyle}>현재 급위</th>
                      <th style={centerThStyle}>다음 급위</th>
                      <th style={thStyle}>확인 내용</th>
                      <th style={centerThStyle}>상세</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSummaryCardScouts.map((scout) => (
                      <tr key={`summary-${selectedSummaryCardType}-${scout.id}`}>
                        <td style={tdStyle}>{scout.member_no ?? "-"}</td>
                        <td style={strongTdStyle}>{scout.name}</td>
                        {isSuperAdmin && (
                          <td style={tdStyle}>{getOrganizationName(scout.organization_id)}</td>
                        )}
                        <td style={centerTdStyle}>{scout.grade ?? "-"}</td>
                        <td style={centerTdStyle}>{getCurrentRankDisplay(scout)}</td>
                        <td style={centerTdStyle}>{getNextRankDisplay(scout)}</td>
                        <td style={tdStyle}>
                          {getSummaryCardScoutMessage(scout, selectedSummaryCardType)}
                        </td>
                        <td style={centerTdStyle}>
                          <button
                            type="button"
                            style={smallButtonStyle}
                            onClick={() => handleOpenScoutDetailModal(scout)}
                          >
                            상세
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}

      {isScoutDetailModalOpen && selectedScout && createPortal(
        <div style={modalBackdropStyle} onMouseDown={handleCloseScoutDetailModal}>
          <div
            style={advancementDetailModalStyle}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div style={modalHeaderStyle}>
              <div>
                <h2 style={modalTitleStyle}>{selectedScout.name} 진급 상세</h2>
                <p style={modalDescriptionStyle}>
                  현재 급위, 다음 급위, 진급 판정 결과와 인가 기록을 확인합니다.
                </p>
              </div>
              <button
                type="button"
                style={modalCloseButtonStyle}
                onClick={handleCloseScoutDetailModal}
                aria-label="진급 상세 닫기"
              >
                ×
              </button>
            </div>

            <div style={selectedScoutBoxStyle}>
              <div>
                <div style={selectedScoutNameStyle}>{selectedScout.name}</div>
                <div style={selectedScoutMetaStyle}>
                  대원번호 {selectedScout.member_no ?? "-"} · 입단일{" "}
                  {formatDate(selectedScout.joined_at)} · 현재 급위{" "}
                  {getCurrentRankDisplay(selectedScout)} · 다음 급위{" "}
                  {getNextRankDisplay(selectedScout)}
                </div>
              </div>

              {getIsBeginnerCourseNoticeNeeded(selectedScout) && (
                <div style={noticeBoxStyle}>
                  초급과정 면제 대상입니다. 초급 인가 기록은 별도로 관리해야 합니다.
                </div>
              )}

              {isCubScoutByGrade(selectedScout) && (
                <div style={noticeBoxStyle}>
                  컵스카우트 대원은 학년에 따라 다람쥐, 토끼, 사슴, 곰, 무지개 급위가 자동 표시됩니다.
                  별도의 스카우트 진급 판정은 진행하지 않습니다.
                </div>
              )}
            </div>

            {getMissingPriorRankHistories(selectedScout).length > 0 && (
              <div style={rankHistoryWarningStyle}>
                <strong>진급 인가 기록 확인 필요</strong>
                <span>
                  현재 급위는 {getCurrentRankDisplay(selectedScout)}이지만 {getMissingPriorRankHistories(selectedScout).map((rank) => rank.rank_name).join(", ")} 인가 기록이 없습니다.
                </span>
                <span>대원 통합관리의 진급/급위에서 실제 인가일을 확인하여 등록해 주세요.</span>
              </div>
            )}

            {canManageAdvancements && !isCubScoutByGrade(selectedScout) && !selectedScout.current_rank_id && (
              <div style={initialApprovalBoxStyle}>
                <div>
                  <h3 style={subTitleStyle}>초급 인가 등록</h3>
                  <p style={helpTextStyle}>
                    현재 급위가 없는 대원은 먼저 초급 인가일을 등록해야 이후 진급 판정을 진행할 수 있습니다.
                  </p>
                </div>

                {initialApprovalScoutId !== selectedScout.id ? (
                  <button
                    type="button"
                    style={primaryButtonStyle}
                    onClick={() => handleOpenInitialBeginnerApproval(selectedScout)}
                  >
                    초급 인가 등록
                  </button>
                ) : (
                  <form
                    style={initialApprovalFormStyle}
                    onSubmit={handleApproveInitialBeginnerRank}
                  >
                    {initialApprovalErrorMessage && (
                      <div style={errorBoxStyle}>{initialApprovalErrorMessage}</div>
                    )}

                    <div style={formGridStyle}>
                      <label style={fieldLabelStyle}>
                        초급 인가일 <span style={requiredStyle}>*</span>
                        <input
                          style={inputStyle}
                          type="date"
                          value={initialApprovalForm.approved_at}
                          onChange={(event) =>
                            updateInitialApprovalForm("approved_at", event.target.value)
                          }
                          required
                        />
                      </label>

                      <label style={fieldLabelStyle}>
                        인가 유형
                        <input
                          style={readOnlyInputStyle}
                          value={
                            selectedScout.beginner_course_exempted
                              ? "컵스카우트 초급인가"
                              : "일반"
                          }
                          readOnly
                        />
                      </label>
                    </div>

                    {selectedScout.beginner_course_exempted && (
                      <div style={noticeBoxStyle}>
                        이 대원은 컵스카우트 출신 승진과정 이수자로 초급과정은 면제되지만,
                        초급 인가 기록과 인가일은 반드시 등록해야 합니다.
                      </div>
                    )}

                    <label style={fieldLabelStyle}>
                      비고
                      <textarea
                        style={textareaStyle}
                        value={initialApprovalForm.note}
                        onChange={(event) =>
                          updateInitialApprovalForm("note", event.target.value)
                        }
                        placeholder="비고를 입력하지 않으면 기본 문구가 자동 저장됩니다."
                      />
                    </label>

                    <div style={formActionStyle}>
                      <button
                        type="button"
                        style={secondaryButtonStyle}
                        onClick={handleCloseInitialBeginnerApproval}
                        disabled={initialApprovalSubmitting}
                      >
                        취소
                      </button>

                      <button
                        type="submit"
                        style={submitButtonStyle}
                        disabled={initialApprovalSubmitting}
                      >
                        {initialApprovalSubmitting ? "저장 중..." : "초급 인가 저장"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {isCubScoutByGrade(selectedScout) && (
              <div style={progressCardStyle}>
                <h3 style={subTitleStyle}>컵스카우트 자동 급위</h3>
                <div style={expectedGridStyle}>
                  <div style={expectedItemStyle}>
                    <div style={expectedLabelStyle}>현재 학년</div>
                    <div style={expectedValueStyle}>{selectedScout.grade ?? "-"}</div>
                  </div>
                  <div style={expectedItemStyle}>
                    <div style={expectedLabelStyle}>현재 급위</div>
                    <div style={expectedValueStyle}>{getCurrentRankDisplay(selectedScout)}</div>
                  </div>
                  <div style={expectedItemStyle}>
                    <div style={expectedLabelStyle}>다음 흐름</div>
                    <div style={expectedValueStyle}>{getNextRankDisplay(selectedScout)}</div>
                  </div>
                </div>
                <p style={helpTextStyle}>
                  컵스카우트 급위는 학년 기준으로 자동 적용합니다. 6학년 무지개 대원이 스카우트로 전환되면
                  승진과정 이수 여부를 확인한 뒤 초급과정 면제 표시와 초급 인가일 등록을 별도로 관리합니다.
                </p>
              </div>
            )}

            <div style={progressCardStyle}>
              <h3 style={subTitleStyle}>급위 진행 현황</h3>

              <div style={progressWrapStyle}>
                {sortedRanks.map((rank) => {
                  const stepState = getRankStepState(selectedScout, rank);

                  return (
                    <div key={rank.id} style={progressStepStyle}>
                      <div style={getProgressCircleStyle(stepState)}>
                        {stepState === "completed" ? "✓" : rank.sort_order}
                      </div>
                      <div style={progressRankNameStyle}>{rank.rank_name}</div>
                      <div style={getProgressLabelStyle(stepState)}>
                        {getRankStepLabel(stepState)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={expectedCardStyle}>
              <h3 style={subTitleStyle}>다음 진급 정보</h3>

              {(() => {
                const nextRank = getNextRank(selectedScout);
                const requirement = getRequirementForTransition(
                  selectedScout.current_rank_id,
                  nextRank,
                );
                const currentStepReview = nextRank
                  ? [...selectedScoutReviews]
                      .filter(
                        (review) =>
                          review.from_rank_id === selectedScout.current_rank_id &&
                          review.to_rank_id === nextRank.id,
                      )
                      .sort((a, b) => {
                        const bKey = `${b.review_date} ${b.created_at ?? ""}`;
                        const aKey = `${a.review_date} ${a.created_at ?? ""}`;
                        return bKey.localeCompare(aKey);
                      })[0] ?? null
                  : null;
                const periodBaseDate = currentStepReview?.base_date ?? null;
                const availableDate = currentStepReview?.available_at ?? null;

                return (
                  <>
                    <div style={expectedGridStyle}>
                      <div style={expectedItemStyle}>
                        <div style={expectedLabelStyle}>다음 급위</div>
                        <div style={expectedValueStyle}>
                          {nextRank ? nextRank.rank_name : "최종급위"}
                        </div>
                      </div>

                      <div style={expectedItemStyle}>
                        <div style={expectedLabelStyle}>예상 진급일</div>
                        <div style={expectedValueStyle}>
                          {availableDate ?? "판정 후 확인"}
                        </div>
                      </div>

                      <div style={expectedItemStyle}>
                        <div style={expectedLabelStyle}>기간 산정 기준일</div>
                        <div style={expectedValueStyle}>
                          {periodBaseDate ? formatDate(periodBaseDate) : "판정 후 확인"}
                        </div>
                      </div>

                      <div style={expectedItemStyle}>
                        <div style={expectedLabelStyle}>필요 활동기간</div>
                        <div style={expectedValueStyle}>
                          {requirement ? `${requirement.required_months}개월` : getMissingRequirementDisplay(nextRank)}
                        </div>
                      </div>
                    </div>

                    <p style={compactHelpTextStyle}>
                      기간 산정 기준일은 이전 단계의 기간 충족일과 기능장 최종 충족일 중 더 늦은 날짜입니다. 예상 진급일은 최신 판정 결과를 기준으로 표시합니다.
                    </p>
                  </>
                );
              })()}
            </div>

            {canManageAdvancements && !isCubScoutByGrade(selectedScout) && selectedScout.current_rank_id && getNextRank(selectedScout) && (
              <div style={reviewActionCardStyle}>
                <div style={reviewActionHeaderStyle}>
                  <h3 style={reviewActionTitleStyle}>진급 판정</h3>
                  <span style={reviewActionDescriptionStyle}>
                    현재 급위 기준으로 다음 급위 진급 가능 여부를 확인합니다.
                  </span>
                </div>

                <form style={reviewActionFormStyle} onSubmit={handleRunPromotionReview}>
                  <label style={compactFieldLabelStyle}>
                    <span>
                      판정일 <span style={requiredStyle}>*</span>
                    </span>
                    <input
                      style={compactDateInputStyle}
                      type="date"
                      max={getSeoulTodayText()}
                      value={promotionReviewForm.review_date}
                      onChange={(event) =>
                        updatePromotionReviewForm("review_date", event.target.value)
                      }
                      required
                    />
                  </label>

                  <button
                    type="submit"
                    style={primaryButtonStyle}
                    disabled={promotionReviewSubmitting}
                  >
                    {promotionReviewSubmitting ? "판정 중..." : "판정 실행"}
                  </button>
                </form>

                {promotionReviewErrorMessage && (
                  <div style={compactErrorBoxStyle}>{promotionReviewErrorMessage}</div>
                )}
              </div>
            )}

            {selectedScout.current_rank_id && !isCubScoutByGrade(selectedScout) && !getNextRank(selectedScout) && (
              <div style={nextStepBoxStyle}>최종급위에 도달한 대원입니다.</div>
            )}

            <div style={reviewResultCardStyle}>
              <h3 style={subTitleStyle}>진급 판정 결과</h3>

              {selectedScoutReviews.length === 0 ? (
                <div style={emptyStateStyle}>
                  {isCubScoutByGrade(selectedScout)
                    ? "컵스카우트 자동진급 대상은 별도 진급 판정 결과가 없습니다."
                    : "등록된 진급 판정 결과가 없습니다."}
                </div>
              ) : (
                <div>
                  <div style={reviewTabsStyle}>
                    {selectedScoutReviews.map((review) => (
                      <button
                        key={review.id}
                        type="button"
                        style={
                          activeSelectedReview?.id === review.id
                            ? activeReviewTabButtonStyle
                            : reviewTabButtonStyle
                        }
                        onClick={() => {
                          setSelectedReviewId(review.id);
                          setPromotionApprovalErrorMessage("");
                          setPromotionApprovalReviewId(null);
                        }}
                      >
                        {formatDate(review.review_date)} · {getRankName(review.to_rank_id)} ·{" "}
                        {isReviewPassedForApproval(review) ? "가능" : "보완 필요"}
                      </button>
                    ))}
                  </div>

                  {activeSelectedReview && (
                    <div style={reviewDetailBoxStyle}>
                      <div style={reviewSummaryRowStyle}>
                        <div>
                          <div style={reviewTitleStyle}>
                            {getRankName(activeSelectedReview.from_rank_id)} → {" "}
                            {getRankName(activeSelectedReview.to_rank_id)}
                          </div>
                          <div style={selectedScoutMetaStyle}>
                            판정일 {formatDate(activeSelectedReview.review_date)} · 기준일{" "}
                            {formatDate(activeSelectedReview.base_date)} · 가능일{" "}
                            {formatDate(activeSelectedReview.available_at)}
                          </div>
                        </div>

                        <span style={getReviewResultBadgeStyle(isReviewPassedForApproval(activeSelectedReview))}>
                          {isReviewPassedForApproval(activeSelectedReview) ? "진급 가능" : "조건 보완 필요"}
                        </span>
                      </div>

                      <div style={conditionSectionTitleStyle}>조건 확인</div>
                      <div style={conditionGridStyle}>
                        <div style={getConditionItemStyle(activeSelectedReview.period_passed)}>
                          <div style={conditionLabelStyle}>기간</div>
                          <div style={getConditionValueStyle(activeSelectedReview.period_passed)}>
                            {activeSelectedReview.period_passed ? "통과" : "미충족"}
                          </div>
                          <div style={conditionMetaStyle}>
                            필요 {activeSelectedReview.required_months}개월 · 잔여{" "}
                            {activeSelectedReview.days_remaining ?? "-"}일
                          </div>
                        </div>

                        <div style={getConditionItemStyle(activeSelectedReview.required_badges_passed)}>
                          <div style={conditionLabelStyle}>필수 기능장</div>
                          <div style={getConditionValueStyle(activeSelectedReview.required_badges_passed)}>
                            {activeSelectedReview.required_badges_passed ? "통과" : "미충족"}
                          </div>
                        </div>

                        <div style={getConditionItemStyle(activeSelectedReview.general_badges_passed)}>
                          <div style={conditionLabelStyle}>일반 기능장</div>
                          <div style={getConditionValueStyle(activeSelectedReview.general_badges_passed)}>
                            {activeSelectedReview.general_badges_passed ? "통과" : "미충족"}
                          </div>
                        </div>

                        <div
                          style={
                            isProgramRequiredForReview(activeSelectedReview)
                              ? getConditionItemStyle(activeSelectedReview.program_passed)
                              : conditionNotApplicableItemStyle
                          }
                        >
                          <div style={conditionLabelStyle}>WSEP/MoP</div>
                          <div
                            style={
                              isProgramRequiredForReview(activeSelectedReview)
                                ? getConditionValueStyle(activeSelectedReview.program_passed)
                                : conditionNotApplicableValueStyle
                            }
                          >
                            {!isProgramRequiredForReview(activeSelectedReview)
                              ? "해당 없음"
                              : activeSelectedReview.program_passed
                                ? "이수 확인"
                                : "미이수"}
                          </div>
                        </div>
                      </div>

                      {isProgramRequiredForReview(activeSelectedReview) ? (
                        <div style={getConditionItemStyle(activeSelectedReview.attendance_passed)}>
                          <div style={conditionLabelStyle}>출석률</div>
                          <div style={getConditionValueStyle(activeSelectedReview.attendance_passed)}>
                            {activeSelectedReview.attendance_passed ? "통과" : "미충족"}
                          </div>
                          <div style={conditionMetaStyle}>
                            {activeSelectedReview.attendance_rate}% · 출석 인정 {activeSelectedReview.attendance_present_count}/
                            {activeSelectedReview.attendance_total_count}회 · 범 진급 필수
                          </div>
                        </div>
                      ) : (
                        <div style={attendanceReferenceBoxStyle}>
                          참고 지표: 출석률 {activeSelectedReview.attendance_rate}% · 출석 인정{" "}
                          {activeSelectedReview.attendance_present_count}/
                          {activeSelectedReview.attendance_total_count}회
                        </div>
                      )}

                      {(!activeSelectedReview.period_passed ||
                        !activeSelectedReview.required_badges_passed ||
                        !activeSelectedReview.general_badges_passed ||
                        (isProgramRequiredForReview(activeSelectedReview) &&
                          (!activeSelectedReview.program_passed ||
                            !activeSelectedReview.attendance_passed))) && (
                        <div style={missingBoxStyle}>
                          <div style={missingHeaderStyle}>
                            <div>
                              <div style={missingTitleStyle}>보완 필요 항목</div>
                              <div style={missingIntroStyle}>
                                진급 가능 판정을 위해 아래 항목을 보완하세요.
                              </div>
                            </div>

                            {(!activeSelectedReview.required_badges_passed ||
                              !activeSelectedReview.general_badges_passed ||
                              (isProgramRequiredForReview(activeSelectedReview) &&
                                !activeSelectedReview.program_passed)) && (
                              <div style={repairActionGridStyle}>
                                {(!activeSelectedReview.required_badges_passed ||
                                  !activeSelectedReview.general_badges_passed) && (
                                  <Link
                                    to={`/merit-badges?scoutId=${selectedScout.id}`}
                                    style={repairActionLinkStyle}
                                  >
                                    기능장 기록 확인
                                  </Link>
                                )}

                                {isProgramRequiredForReview(activeSelectedReview) &&
                                  !activeSelectedReview.program_passed && (
                                  <Link
                                    to={`/program-completions?scoutId=${selectedScout.id}`}
                                    style={repairActionLinkStyle}
                                  >
                                    프로그램 이수 기록 확인
                                  </Link>
                                )}
                              </div>
                            )}
                          </div>

                          <ul style={missingListStyle}>
                            {!activeSelectedReview.period_passed && (
                              <li>
                                <strong>활동기간이 부족합니다.</strong>
                                <div style={missingDetailStyle}>
                                  진급 가능 예정일 {formatDate(activeSelectedReview.available_at)} · 남은 일수 {activeSelectedReview.days_remaining ?? "-"}일
                                </div>
                              </li>
                            )}

                            {isProgramRequiredForReview(activeSelectedReview) &&
                              !activeSelectedReview.attendance_passed && (
                                <li>
                                  <strong>범 진급 출석률 기준을 충족하지 못했습니다.</strong>
                                  <div style={missingDetailStyle}>
                                    현재 출석률 {activeSelectedReview.attendance_rate}% · 출석 인정 {activeSelectedReview.attendance_present_count}/{activeSelectedReview.attendance_total_count}회
                                  </div>
                                </li>
                              )}

                            {getRelevantMissingItems(activeSelectedReview).map((item, index) => (
                              <li key={`${activeSelectedReview.id}-${index}`}>
                                <strong>{getMissingItemMessage(item)}</strong>
                                {getMissingItemDetail(item) && (
                                  <div style={missingDetailStyle}>{getMissingItemDetail(item)}</div>
                                )}
                              </li>
                            ))}

                            {getRelevantMissingItems(activeSelectedReview).length === 0 &&
                              (activeSelectedReview.required_badges_passed === false ||
                                activeSelectedReview.general_badges_passed === false) && (
                                <li>
                                  <strong>기능장 취득 기록 확인이 필요합니다.</strong>
                                </li>
                              )}

                            {getRelevantMissingItems(activeSelectedReview).length === 0 &&
                              isProgramRequiredForReview(activeSelectedReview) &&
                              activeSelectedReview.program_passed === false && (
                                <li>
                                  <strong>WSEP 또는 MoP 이수 기록 확인이 필요합니다.</strong>
                                </li>
                              )}
                          </ul>

                          <div style={missingNoticeStyle}>
                            진급 가능 판정 후 진급 인가를 등록할 수 있습니다.
                          </div>
                        </div>
                      )}

                      {canManageAdvancements && isReviewPassedForApproval(activeSelectedReview) && (
                        <div style={approvalBoxStyle}>
                          <h4 style={approvalTitleStyle}>진급 인가 저장</h4>

                          {promotionApprovalReviewId !== activeSelectedReview.id ? (
                            <button
                              type="button"
                              style={submitButtonStyle}
                              onClick={() => handleOpenPromotionApproval(activeSelectedReview)}
                            >
                              진급 인가 등록
                            </button>
                          ) : (
                            <form style={initialApprovalFormStyle} onSubmit={handleApprovePromotion}>
                              {promotionApprovalErrorMessage && (
                                <div style={errorBoxStyle}>{promotionApprovalErrorMessage}</div>
                              )}

                              <div style={formGridStyle}>
                                <label style={fieldLabelStyle}>
                                  진급 인가일 <span style={requiredStyle}>*</span>
                                  <input
                                    style={inputStyle}
                                    type="date"
                                    max={getSeoulTodayText()}
                                    value={promotionApprovalForm.approved_at}
                                    onChange={(event) =>
                                      updatePromotionApprovalForm("approved_at", event.target.value)
                                    }
                                    required
                                  />
                                </label>

                                <label style={fieldLabelStyle}>
                                  인가 급위
                                  <input
                                    style={readOnlyInputStyle}
                                    value={getRankName(activeSelectedReview.to_rank_id)}
                                    readOnly
                                  />
                                </label>
                              </div>

                              <label style={fieldLabelStyle}>
                                비고
                                <textarea
                                  style={textareaStyle}
                                  value={promotionApprovalForm.note}
                                  onChange={(event) =>
                                    updatePromotionApprovalForm("note", event.target.value)
                                  }
                                  placeholder="비고를 입력하지 않으면 기본 문구가 자동 저장됩니다."
                                />
                              </label>

                              <div style={formActionStyle}>
                                <button
                                  type="button"
                                  style={secondaryButtonStyle}
                                  onClick={handleClosePromotionApproval}
                                  disabled={promotionApprovalSubmitting}
                                >
                                  취소
                                </button>

                                <button
                                  type="submit"
                                  style={submitButtonStyle}
                                  disabled={promotionApprovalSubmitting}
                                >
                                  {promotionApprovalSubmitting ? "저장 중..." : "진급 인가 저장"}
                                </button>
                              </div>
                            </form>
                          )}
                        </div>
                      )}

                    </div>
                  )}
                </div>
              )}
            </div>

            <h3 style={historyTitleStyle}>진급 인가 기록</h3>

            {selectedScoutHistories.length === 0 ? (
              <div style={emptyStateStyle}>
                {isCubScoutByGrade(selectedScout)
                  ? "컵스카우트 자동 급위는 학년 기준으로 표시되며 별도 진급 이력 등록 없이 관리할 수 있습니다."
                  : "등록된 진급 이력이 없습니다."}
              </div>
            ) : (
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>인가일</th>
                      <th style={thStyle}>급위</th>
                      <th style={thStyle}>인가 유형</th>
                      <th style={thStyle}>비고</th>
                    </tr>
                  </thead>

                  <tbody>
                    {selectedScoutHistories.map((history) => (
                      <tr key={history.id}>
                        <td style={tdStyle}>{formatDate(history.approved_at)}</td>
                        <td style={strongTdStyle}>{getRankName(history.rank_id)}</td>
                        <td style={tdStyle}>
                          {getApprovalTypeLabel(history.approval_type)}
                        </td>
                        <td style={tdStyle}>{history.note ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}


const modalBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
  backgroundColor: "rgba(15, 23, 42, 0.45)",
};

const summaryDetailModalStyle: CSSProperties = {
  width: "min(1080px, calc(100vw - 64px))",
  maxHeight: "82vh",
  overflowY: "auto",
  borderRadius: "14px",
  backgroundColor: "#ffffff",
  boxShadow: "0 24px 80px rgba(15, 23, 42, 0.25)",
  padding: "16px",
};

const advancementDetailModalStyle: CSSProperties = {
  width: "min(1160px, calc(100vw - 64px))",
  maxHeight: "84vh",
  overflowY: "auto",
  borderRadius: "14px",
  backgroundColor: "#ffffff",
  boxShadow: "0 24px 80px rgba(15, 23, 42, 0.25)",
  padding: "0 14px 14px",
};

const modalEmptyStateStyle: CSSProperties = {
  minHeight: "240px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "12px",
  backgroundColor: "#f8fafc",
  color: "#64748b",
  fontWeight: 800,
  textAlign: "center",
};

const modalHeaderStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 20,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "16px",
  padding: "14px 0 12px",
  marginBottom: "12px",
  borderBottom: "1px solid #e5e7eb",
  backgroundColor: "#ffffff",
};

const modalTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "22px",
  fontWeight: 900,
  color: "#0f172a",
};

const modalDescriptionStyle: CSSProperties = {
  marginTop: "6px",
  marginBottom: 0,
  color: "#64748b",
  lineHeight: 1.5,
};

const modalCloseButtonStyle: CSSProperties = {
  width: "36px",
  height: "36px",
  borderRadius: "999px",
  border: "1px solid #cbd5e1",
  backgroundColor: "#ffffff",
  color: "#334155",
  fontSize: "24px",
  fontWeight: 800,
  lineHeight: 1,
  cursor: "pointer",
};

const tableDataRowStyle: CSSProperties = {
  backgroundColor: "#ffffff",
};

const pageHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "24px",
  marginBottom: "18px",
};

const pageTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "28px",
  fontWeight: 800,
  color: "#0f172a",
};

const pageDescriptionStyle: CSSProperties = {
  marginTop: "8px",
  marginBottom: 0,
  color: "#475569",
  lineHeight: 1.6,
};

const roleBadgeStyle: CSSProperties = {
  padding: "8px 12px",
  borderRadius: "999px",
  backgroundColor: "#dbeafe",
  color: "#1d4ed8",
  fontSize: "14px",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "10px",
  marginBottom: "14px",
};

const summaryCardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  padding: "12px 14px",
  backgroundColor: "#ffffff",
};

const summaryCardButtonStyle: CSSProperties = {
  ...summaryCardStyle,
  width: "100%",
  display: "block",
  textAlign: "left",
  fontFamily: "inherit",
  cursor: "pointer",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
  transition: "border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease",
};

const targetSummaryCardButtonStyle: CSSProperties = {
  ...summaryCardButtonStyle,
  borderLeft: "5px solid #94a3b8",
  padding: "12px 14px 12px 12px",
};

const readySummaryCardButtonStyle: CSSProperties = {
  ...summaryCardButtonStyle,
  border: "1px solid #bbf7d0",
  borderLeft: "5px solid #16a34a",
  backgroundColor: "#f0fdf4",
  padding: "12px 14px 12px 12px",
};

const supportSummaryCardButtonStyle: CSSProperties = {
  ...summaryCardButtonStyle,
  border: "1px solid #fed7aa",
  borderLeft: "5px solid #f97316",
  backgroundColor: "#fff7ed",
  padding: "12px 14px 12px 12px",
};

const notReviewedSummaryCardButtonStyle: CSSProperties = {
  ...summaryCardButtonStyle,
  border: "1px solid #bfdbfe",
  borderLeft: "5px solid #2563eb",
  backgroundColor: "#eff6ff",
  padding: "12px 14px 12px 12px",
};

const summaryCardTopRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px",
};

const summaryTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "15px",
  color: "#475569",
};

const readySummaryTitleStyle: CSSProperties = {
  ...summaryTitleStyle,
  color: "#166534",
  fontWeight: 900,
};

const supportSummaryTitleStyle: CSSProperties = {
  ...summaryTitleStyle,
  color: "#c2410c",
  fontWeight: 900,
};

const notReviewedSummaryTitleStyle: CSSProperties = {
  ...summaryTitleStyle,
  color: "#1d4ed8",
  fontWeight: 900,
};

const summaryValueStyle: CSSProperties = {
  marginTop: "5px",
  marginBottom: 0,
  fontSize: "23px",
  fontWeight: 800,
  color: "#0f172a",
};

const actionSummaryValueStyle: CSSProperties = {
  ...summaryValueStyle,
  marginTop: "7px",
  fontSize: "29px",
  fontWeight: 900,
  letterSpacing: "-0.03em",
};

const readySummaryValueStyle: CSSProperties = {
  ...actionSummaryValueStyle,
  color: "#15803d",
};

const supportSummaryValueStyle: CSSProperties = {
  ...actionSummaryValueStyle,
  color: "#c2410c",
};

const notReviewedSummaryValueStyle: CSSProperties = {
  ...actionSummaryValueStyle,
  color: "#1d4ed8",
};

const summaryDescriptionStyle: CSSProperties = {
  marginTop: "4px",
  marginBottom: 0,
  color: "#64748b",
  fontSize: "12px",
  lineHeight: 1.35,
};

const actionSummaryDescriptionStyle: CSSProperties = {
  ...summaryDescriptionStyle,
  marginTop: "5px",
  fontSize: "12.5px",
  fontWeight: 800,
};

const readySummaryDescriptionStyle: CSSProperties = {
  ...actionSummaryDescriptionStyle,
  color: "#166534",
};

const supportSummaryDescriptionStyle: CSSProperties = {
  ...actionSummaryDescriptionStyle,
  color: "#9a3412",
};

const notReviewedSummaryDescriptionStyle: CSSProperties = {
  ...actionSummaryDescriptionStyle,
  color: "#1e40af",
};

const summaryBadgeBaseStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "24px",
  padding: "4px 8px",
  borderRadius: "999px",
  border: "1px solid",
  fontSize: "11.5px",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const targetSummaryBadgeStyle: CSSProperties = {
  ...summaryBadgeBaseStyle,
  borderColor: "#cbd5e1",
  backgroundColor: "#f8fafc",
  color: "#475569",
};

const readySummaryBadgeStyle: CSSProperties = {
  ...summaryBadgeBaseStyle,
  borderColor: "#86efac",
  backgroundColor: "#dcfce7",
  color: "#166534",
};

const supportSummaryBadgeStyle: CSSProperties = {
  ...summaryBadgeBaseStyle,
  borderColor: "#fdba74",
  backgroundColor: "#ffedd5",
  color: "#c2410c",
};

const notReviewedSummaryBadgeStyle: CSSProperties = {
  ...summaryBadgeBaseStyle,
  borderColor: "#93c5fd",
  backgroundColor: "#dbeafe",
  color: "#1d4ed8",
};

const contentCardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  padding: "14px",
  backgroundColor: "#ffffff",
};


const toolbarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "16px",
  marginBottom: "12px",
};

const advancementSearchPanelStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: "12px",
  border: "1px solid #e5e7eb",
  backgroundColor: "#ffffff",
  marginBottom: "10px",
};

const advancementSearchTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "16px",
  fontWeight: 800,
  color: "#0f172a",
};

const advancementSearchCountStyle: CSSProperties = {
  marginLeft: "auto",
  padding: "7px 10px",
  borderRadius: "999px",
  backgroundColor: "#eff6ff",
  color: "#1d4ed8",
  fontSize: "13px",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const advancementSearchControlStyle: CSSProperties = {
  display: "flex",
  gap: "8px",
  alignItems: "center",
  flexWrap: "wrap",
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "21px",
  fontWeight: 800,
  color: "#0f172a",
};

const subTitleStyle: CSSProperties = {
  marginTop: 0,
  marginBottom: "14px",
  fontSize: "16px",
  fontWeight: 800,
  color: "#0f172a",
};

const sectionDescriptionStyle: CSSProperties = {
  marginTop: "5px",
  marginBottom: 0,
  color: "#64748b",
};

const searchInputStyle: CSSProperties = {
  width: "min(100%, 420px)",
  padding: "9px 11px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  fontSize: "14px",
};

const primaryButtonStyle: CSSProperties = {
  padding: "9px 12px",
  borderRadius: "8px",
  border: "none",
  backgroundColor: "#2563eb",
  color: "#ffffff",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  padding: "9px 12px",
  borderRadius: "8px",
  border: "1px solid #cbd5e1",
  backgroundColor: "#ffffff",
  color: "#334155",
  fontWeight: 700,
  cursor: "pointer",
};

const submitButtonStyle: CSSProperties = {
  padding: "9px 12px",
  borderRadius: "8px",
  border: "none",
  backgroundColor: "#16a34a",
  color: "#ffffff",
  fontWeight: 700,
  cursor: "pointer",
};

const smallButtonStyle: CSSProperties = {
  padding: "6px 10px",
  borderRadius: "6px",
  border: "1px solid #cbd5e1",
  backgroundColor: "#ffffff",
  color: "#334155",
  fontSize: "13px",
  fontWeight: 700,
  cursor: "pointer",
};

const emptyStateStyle: CSSProperties = {
  padding: "28px",
  borderRadius: "12px",
  backgroundColor: "#f8fafc",
  color: "#64748b",
  textAlign: "center",
};

const errorBoxStyle: CSSProperties = {
  padding: "12px",
  borderRadius: "10px",
  backgroundColor: "#fef2f2",
  color: "#b91c1c",
  fontWeight: 700,
  marginBottom: "16px",
};

const compactHelpTextStyle: CSSProperties = {
  marginTop: "4px",
  marginBottom: 0,
  color: "#64748b",
  fontSize: "12.5px",
  lineHeight: 1.35,
};

const bulkFixedBarShellStyle: CSSProperties = {
  marginTop: "10px",
};

const bulkFixedBarStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "12px",
  border: "1px solid #bfdbfe",
  backgroundColor: "#eff6ff",
};

const bulkFixedBarHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "10px",
  marginBottom: "8px",
  flexWrap: "wrap",
};

const bulkFixedBarTitleGroupStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: "10px",
  flexWrap: "wrap",
};

const bulkFixedBarTitleStyle: CSSProperties = {
  color: "#0f172a",
  fontSize: "15px",
};

const bulkFixedBarMetaStyle: CSSProperties = {
  color: "#475569",
  fontSize: "13px",
  fontWeight: 700,
};

const bulkFixedHeaderActionStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "8px",
  flexWrap: "wrap",
};

const bulkFixedBarControlStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
  gap: "10px",
  alignItems: "stretch",
};

const bulkTaskPanelStyle: CSSProperties = {
  minWidth: 0,
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid #bfdbfe",
  backgroundColor: "#ffffff",
};

const bulkTaskPanelHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: "8px",
  flexWrap: "wrap",
  marginBottom: "8px",
};

const bulkTaskPanelHelpStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "12px",
  fontWeight: 700,
};

const bulkTaskPanelControlRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  gap: "8px",
  flexWrap: "wrap",
  minWidth: 0,
};

const bulkFixedFieldLabelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  color: "#334155",
  fontSize: "12.5px",
  fontWeight: 800,
};

const bulkDateFieldLabelStyle: CSSProperties = {
  ...bulkFixedFieldLabelStyle,
  flex: "0 0 190px",
  width: "190px",
};

const bulkFixedNoteLabelStyle: CSSProperties = {
  ...bulkFixedFieldLabelStyle,
  flex: "1 1 260px",
  minWidth: "240px",
};

const bulkFixedInputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  padding: "9px 10px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  fontSize: "13.5px",
  backgroundColor: "#ffffff",
};

const bulkInlineTaskTitleStyle: CSSProperties = {
  alignSelf: "center",
  color: "#0f172a",
  fontSize: "13px",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const bulkFixedMessageGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: "8px",
  marginTop: "9px",
};

const bulkFixedSuccessMessageStyle: CSSProperties = {
  padding: "8px 10px",
  borderRadius: "10px",
  backgroundColor: "#f0fdf4",
  color: "#166534",
  fontSize: "12.5px",
  fontWeight: 800,
  lineHeight: 1.45,
};

const bulkFixedErrorMessageStyle: CSSProperties = {
  padding: "8px 10px",
  borderRadius: "10px",
  backgroundColor: "#fef2f2",
  color: "#b91c1c",
  fontSize: "12.5px",
  fontWeight: 800,
  lineHeight: 1.45,
};

const tableWrapStyle: CSSProperties = {
  maxHeight: "660px",
  overflowX: "auto",
  overflowY: "auto",
  border: "1px solid #e5e7eb",
  borderRadius: "10px",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "13.5px",
};

const thStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 2,
  padding: "8px 10px",
  borderBottom: "1px solid #e5e7eb",
  backgroundColor: "#f8fafc",
  color: "#334155",
  textAlign: "left",
  whiteSpace: "nowrap",
};

const centerThStyle: CSSProperties = {
  ...thStyle,
  textAlign: "center",
};

const sortableThStyle: CSSProperties = {
  ...thStyle,
  padding: 0,
};

const centerSortableThStyle: CSSProperties = {
  ...sortableThStyle,
  textAlign: "center",
};

const sortableHeaderButtonStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  minHeight: "34px",
  padding: "8px 10px",
  border: "none",
  backgroundColor: "transparent",
  color: "#334155",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: "6px",
  fontFamily: "inherit",
  fontSize: "14px",
  fontWeight: 800,
  textAlign: "left",
  whiteSpace: "nowrap",
  cursor: "pointer",
};

const activeSortableHeaderButtonStyle: CSSProperties = {
  ...sortableHeaderButtonStyle,
  color: "#1d4ed8",
  backgroundColor: "#eff6ff",
};

const sortIndicatorStyle: CSSProperties = {
  color: "inherit",
  fontSize: "11px",
  fontWeight: 900,
};

const tdStyle: CSSProperties = {
  padding: "7px 10px",
  borderBottom: "1px solid #e5e7eb",
  color: "#475569",
  whiteSpace: "nowrap",
};

const strongTdStyle: CSSProperties = {
  ...tdStyle,
  color: "#0f172a",
  fontWeight: 800,
};

const centerTdStyle: CSSProperties = {
  ...tdStyle,
  textAlign: "center",
};

const selectHeaderLabelStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "5px",
  cursor: "pointer",
};

const expectedDateInlineStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
  whiteSpace: "nowrap",
};


const advancementStatusBadgeBaseStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "78px",
  padding: "4px 8px",
  borderRadius: "999px",
  border: "1px solid",
  fontSize: "12px",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const advancementReadyBadgeStyle: CSSProperties = {
  ...advancementStatusBadgeBaseStyle,
  borderColor: "#86efac",
  backgroundColor: "#dcfce7",
  color: "#166534",
};

const advancementSupportBadgeStyle: CSSProperties = {
  ...advancementStatusBadgeBaseStyle,
  borderColor: "#fdba74",
  backgroundColor: "#ffedd5",
  color: "#c2410c",
};

const advancementReviewNeededBadgeStyle: CSSProperties = {
  ...advancementStatusBadgeBaseStyle,
  borderColor: "#93c5fd",
  backgroundColor: "#dbeafe",
  color: "#1d4ed8",
};

const advancementAutoBadgeStyle: CSSProperties = {
  ...advancementStatusBadgeBaseStyle,
  borderColor: "#c4b5fd",
  backgroundColor: "#ede9fe",
  color: "#6d28d9",
};

const advancementNeutralBadgeStyle: CSSProperties = {
  ...advancementStatusBadgeBaseStyle,
  borderColor: "#cbd5e1",
  backgroundColor: "#f1f5f9",
  color: "#475569",
};

const supportSummaryTdStyle: CSSProperties = {
  ...tdStyle,
  minWidth: "170px",
  color: "#334155",
  fontWeight: 700,
  whiteSpace: "normal",
  lineHeight: 1.4,
};

const statusBadgeStyle: CSSProperties = {
  display: "inline-block",
  padding: "4px 8px",
  borderRadius: "999px",
  border: "1px solid",
  fontSize: "12px",
  fontWeight: 800,
};

const passBadgeStyle: CSSProperties = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: "999px",
  border: "1px solid #bbf7d0",
  backgroundColor: "#dcfce7",
  color: "#166534",
  fontSize: "13px",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const failBadgeStyle: CSSProperties = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: "999px",
  border: "1px solid #fecaca",
  backgroundColor: "#fee2e2",
  color: "#b91c1c",
  fontSize: "13px",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const dateStatusBadgeStyle: CSSProperties = {
  display: "inline-block",
  marginTop: 0,
  padding: "3px 7px",
  borderRadius: "999px",
  border: "1px solid #bfdbfe",
  backgroundColor: "#dbeafe",
  color: "#1d4ed8",
  fontSize: "12px",
  fontWeight: 800,
};


const selectedScoutBoxStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  padding: "12px 14px",
  borderRadius: "12px",
  backgroundColor: "#f8fafc",
  marginBottom: "12px",
};

const selectedScoutNameStyle: CSSProperties = {
  fontSize: "18px",
  fontWeight: 900,
  color: "#0f172a",
};

const selectedScoutMetaStyle: CSSProperties = {
  marginTop: "5px",
  color: "#64748b",
  fontSize: "13px",
  lineHeight: 1.45,
};

const noticeBoxStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: "10px",
  backgroundColor: "#eff6ff",
  color: "#1e40af",
  fontSize: "13px",
  fontWeight: 800,
  lineHeight: 1.55,
  marginTop: "8px",
};

const rankHistoryWarningStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  padding: "11px 13px",
  borderRadius: "10px",
  border: "1px solid #fcd34d",
  backgroundColor: "#fffbeb",
  color: "#92400e",
  fontSize: "13px",
  lineHeight: 1.5,
  marginBottom: "12px",
};

const initialApprovalBoxStyle: CSSProperties = {
  padding: "16px",
  borderRadius: "12px",
  border: "1px solid #fed7aa",
  backgroundColor: "#fff7ed",
  marginBottom: "16px",
};

const initialApprovalFormStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "14px",
  marginTop: "12px",
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "14px",
};

const fieldLabelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  color: "#334155",
  fontSize: "14px",
  fontWeight: 700,
};

const inputStyle: CSSProperties = {
  padding: "9px 11px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  fontSize: "14px",
  backgroundColor: "#ffffff",
};

const readOnlyInputStyle: CSSProperties = {
  ...inputStyle,
  backgroundColor: "#f1f5f9",
  color: "#64748b",
  cursor: "not-allowed",
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: "80px",
  resize: "vertical",
};

const formActionStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "8px",
};

const requiredStyle: CSSProperties = {
  color: "#dc2626",
};

const progressCardStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: "12px",
  border: "1px solid #e5e7eb",
  backgroundColor: "#ffffff",
  marginBottom: "10px",
};

const progressWrapStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(78px, 1fr))",
  gap: "8px",
};

const progressStepStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "4px",
  padding: "8px 6px",
  borderRadius: "10px",
  backgroundColor: "#f8fafc",
};

const progressCircleStyle: CSSProperties = {
  width: "30px",
  height: "30px",
  borderRadius: "999px",
  border: "2px solid #cbd5e1",
  backgroundColor: "#ffffff",
  color: "#94a3b8",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "12px",
  fontWeight: 900,
};

const progressRankNameStyle: CSSProperties = {
  color: "#0f172a",
  fontSize: "13px",
  fontWeight: 900,
};

const progressStatusStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: "12px",
  fontWeight: 700,
  textAlign: "center",
};

const expectedCardStyle: CSSProperties = {
  padding: "12px",
  borderRadius: "12px",
  border: "1px solid #e5e7eb",
  backgroundColor: "#f8fafc",
  marginBottom: "12px",
};

const expectedGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: "10px",
};

const expectedItemStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: "10px",
  backgroundColor: "#ffffff",
  border: "1px solid #e5e7eb",
};

const expectedLabelStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "13px",
  fontWeight: 700,
  marginBottom: "6px",
};

const expectedValueStyle: CSSProperties = {
  color: "#0f172a",
  fontSize: "16px",
  fontWeight: 900,
};

const reviewActionCardStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(180px, 1fr) auto",
  alignItems: "center",
  gap: "10px 14px",
  padding: "10px 12px",
  borderRadius: "12px",
  border: "1px solid #bfdbfe",
  backgroundColor: "#eff6ff",
  marginBottom: "12px",
};

const reviewActionHeaderStyle: CSSProperties = {
  minWidth: 0,
};

const reviewActionTitleStyle: CSSProperties = {
  margin: 0,
  color: "#0f172a",
  fontSize: "16px",
  fontWeight: 900,
};

const reviewActionDescriptionStyle: CSSProperties = {
  display: "block",
  marginTop: "4px",
  color: "#64748b",
  fontSize: "12px",
  lineHeight: 1.4,
};

const reviewActionFormStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-end",
  justifyContent: "flex-end",
  gap: "8px",
};

const compactFieldLabelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  color: "#334155",
  fontSize: "12px",
  fontWeight: 800,
};

const compactDateInputStyle: CSSProperties = {
  ...inputStyle,
  width: "142px",
  padding: "8px 10px",
};

const compactErrorBoxStyle: CSSProperties = {
  ...errorBoxStyle,
  gridColumn: "1 / -1",
  marginTop: "0",
};

const reviewResultCardStyle: CSSProperties = {
  padding: "14px",
  borderRadius: "12px",
  border: "1px solid #e5e7eb",
  backgroundColor: "#ffffff",
  marginBottom: "12px",
};

const reviewTabsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  marginBottom: "16px",
};

const reviewTabButtonStyle: CSSProperties = {
  padding: "8px 10px",
  borderRadius: "999px",
  border: "1px solid #cbd5e1",
  backgroundColor: "#ffffff",
  color: "#334155",
  fontSize: "13px",
  fontWeight: 800,
  cursor: "pointer",
};

const activeReviewTabButtonStyle: CSSProperties = {
  ...reviewTabButtonStyle,
  border: "1px solid #2563eb",
  backgroundColor: "#dbeafe",
  color: "#1d4ed8",
};

const reviewDetailBoxStyle: CSSProperties = {
  padding: "14px",
  borderRadius: "12px",
  backgroundColor: "#f8fafc",
  border: "1px solid #e5e7eb",
};

const reviewSummaryRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "12px",
  marginBottom: "14px",
};

const reviewTitleStyle: CSSProperties = {
  fontSize: "18px",
  fontWeight: 900,
  color: "#0f172a",
};

const conditionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "8px",
  marginBottom: "8px",
};

const conditionItemBaseStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid",
};

const conditionPassItemStyle: CSSProperties = {
  ...conditionItemBaseStyle,
  backgroundColor: "#f0fdf4",
  borderColor: "#bbf7d0",
};

const conditionFailItemStyle: CSSProperties = {
  ...conditionItemBaseStyle,
  backgroundColor: "#fef2f2",
  borderColor: "#fecaca",
};

const conditionNotApplicableItemStyle: CSSProperties = {
  ...conditionItemBaseStyle,
  backgroundColor: "#f8fafc",
  borderColor: "#e2e8f0",
};

const conditionLabelStyle: CSSProperties = {
  color: "#475569",
  fontSize: "13px",
  fontWeight: 800,
  marginBottom: "6px",
};

const conditionValueBaseStyle: CSSProperties = {
  fontSize: "16px",
  fontWeight: 900,
};

const conditionPassValueStyle: CSSProperties = {
  ...conditionValueBaseStyle,
  color: "#15803d",
};

const conditionFailValueStyle: CSSProperties = {
  ...conditionValueBaseStyle,
  color: "#b91c1c",
};

const conditionNotApplicableValueStyle: CSSProperties = {
  ...conditionValueBaseStyle,
  color: "#64748b",
};

const conditionMetaStyle: CSSProperties = {
  marginTop: "6px",
  color: "#64748b",
  fontSize: "12px",
  lineHeight: 1.5,
};

const conditionSectionTitleStyle: CSSProperties = {
  marginBottom: "8px",
  color: "#0f172a",
  fontSize: "14px",
  fontWeight: 900,
};

const attendanceReferenceBoxStyle: CSSProperties = {
  padding: "8px 10px",
  borderRadius: "9px",
  backgroundColor: "#f8fafc",
  border: "1px solid #e2e8f0",
  color: "#64748b",
  fontSize: "12px",
  fontWeight: 800,
  marginBottom: "10px",
};

const missingIntroStyle: CSSProperties = {
  marginTop: "2px",
  color: "#991b1b",
  fontSize: "12px",
  lineHeight: 1.4,
};

const historyTitleStyle: CSSProperties = {
  marginTop: "4px",
  marginBottom: "10px",
  color: "#0f172a",
  fontSize: "16px",
  fontWeight: 900,
};

const missingBoxStyle: CSSProperties = {
  padding: "14px 16px",
  borderRadius: "10px",
  backgroundColor: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#991b1b",
  marginTop: "10px",
  marginBottom: "10px",
};

const missingHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "12px",
};

const missingTitleStyle: CSSProperties = {
  fontSize: "15px",
  fontWeight: 900,
};

const missingListStyle: CSSProperties = {
  margin: "12px 0 0",
  paddingLeft: "20px",
  lineHeight: 1.65,
  fontSize: "13px",
};

const missingDetailStyle: CSSProperties = {
  marginTop: "3px",
  color: "#7f1d1d",
  fontSize: "12px",
};

const missingNoticeStyle: CSSProperties = {
  marginTop: "8px",
  paddingTop: "8px",
  borderTop: "1px solid #fecaca",
  color: "#b45309",
  fontSize: "12px",
  fontWeight: 800,
};

const repairActionGridStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px",
  alignItems: "center",
  justifyContent: "flex-end",
};

const repairActionLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "34px",
  padding: "7px 10px",
  borderRadius: "8px",
  backgroundColor: "#2563eb",
  color: "#ffffff",
  fontWeight: 800,
  textDecoration: "none",
  fontSize: "12px",
  whiteSpace: "nowrap",
};

const approvalBoxStyle: CSSProperties = {
  padding: "14px",
  borderRadius: "10px",
  backgroundColor: "#f0fdf4",
  border: "1px solid #bbf7d0",
  marginTop: "14px",
};

const approvalTitleStyle: CSSProperties = {
  marginTop: 0,
  marginBottom: "10px",
  color: "#166534",
  fontSize: "16px",
  fontWeight: 900,
};

const advancementFilterBarStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(180px, 0.65fr) minmax(360px, 2.35fr)",
  alignItems: "center",
  gap: "12px",
  padding: "10px 12px",
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  backgroundColor: "#f8fafc",
  marginBottom: "12px",
};

const advancementFilterBarTitleRowStyle: CSSProperties = {
  minWidth: 0,
};

const advancementFilterBarTitleStyle: CSSProperties = {
  margin: 0,
  color: "#0f172a",
  fontSize: "16px",
  fontWeight: 900,
};

const activeFilterInlineNoticeStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px",
  alignItems: "center",
  marginTop: "4px",
  color: "#64748b",
  fontSize: "12px",
  lineHeight: 1.4,
};

const advancementFilterButtonGroupStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "flex-end",
  gap: "6px",
  minWidth: 0,
};

const advancementFilterButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "7px",
  padding: "7px 10px",
  borderRadius: "999px",
  border: "1px solid #cbd5e1",
  backgroundColor: "#ffffff",
  color: "#334155",
  fontSize: "13px",
  fontWeight: 800,
  lineHeight: 1,
  whiteSpace: "nowrap",
  cursor: "pointer",
};

const activeAdvancementFilterButtonStyle: CSSProperties = {
  ...advancementFilterButtonStyle,
  border: "1px solid #2563eb",
  backgroundColor: "#dbeafe",
  color: "#1d4ed8",
};

const helpTextStyle: CSSProperties = {
  marginTop: "12px",
  marginBottom: 0,
  color: "#64748b",
  fontSize: "13px",
  lineHeight: 1.6,
};

const nextStepBoxStyle: CSSProperties = {
  marginTop: "16px",
  marginBottom: "16px",
  padding: "14px",
  borderRadius: "10px",
  backgroundColor: "#eff6ff",
  color: "#1d4ed8",
  fontSize: "14px",
  lineHeight: 1.6,
};
