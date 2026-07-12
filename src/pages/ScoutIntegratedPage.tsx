import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHelpButton } from "../components/common/CommonFeedback";
import { supabase } from "../lib/supabase";
import {
  InfoItem,
  RankProgressOverview,
  ReadinessProgressItem,
  SummaryFilterCard
} from "./scout-integrated/ScoutIntegratedDisplayComponents";
import { AttendancePanel,
  ProgramPanel } from "./scout-integrated/ScoutIntegratedSecondaryPanels";
import { AdvancementPanel, OverviewPanel } from "./scout-integrated/ScoutIntegratedPrimaryPanels";
import { BadgePanel } from "./scout-integrated/ScoutIntegratedBadgePanel";
import { BadgeDrawer, ProgramDrawer, ScoutCreateDrawer } from "./scout-integrated/ScoutIntegratedDrawers";
import { ScoutExcelImportDrawer } from "./scout-integrated/ScoutExcelImportDrawer";
import {
  summaryCardGridStyle,
  getReadinessBadgeStyle,
  scoutRankFlowStyle,
  selectedReadinessBannerStyle,
  selectedReadinessEyebrowStyle,
  selectedReadinessTitleStyle,
  selectedReadinessDetailStyle,
  selectedReadinessActionStyle,
  readinessProgressGridStyle,
  pageHeaderStyle,
  pageTitleStyle,
  pageDescriptionStyle,
  headerActionStyle,
  roleBadgeStyle,
  secondaryButtonStyle,
  workspaceStyle,
  scoutPanelStyle,
  panelHeaderStyle,
  panelTitleStyle,
  panelDescriptionStyle,
  panelHeaderActionStyle,
  registrationMenuWrapStyle,
  registrationMenuButtonStyle,
  registrationMenuStyle,
  registrationMenuItemStyle,
  registrationMenuItemDescriptionStyle,
  searchAreaStyle,
  searchInputStyle,
  filterGridStyle,
  selectStyle,
  scoutListStyle,
  emptyStateStyle,
  scoutItemStyle,
  selectedScoutItemStyle,
  scoutItemTopStyle,
  scoutNameStyle,
  scoutItemMetaStyle,
  statusBadgeBaseStyle,
  detailPanelStyle,
  emptyDetailStyle,
  profileCardStyle,
  profileHeaderStyle,
  profileTitleRowStyle,
  profileNameStyle,
  profileMetaStyle,
  profileInfoGridStyle,
  compactPriorityStyle,
  compactPriorityHeaderStyle,
  compactPriorityTitleStyle,
  compactPriorityCountStyle,
  compactPriorityListStyle,
  compactPriorityItemStyle,
  compactPriorityMoveStyle,
  tabBarStyle,
  tabButtonStyle,
  activeTabButtonStyle,
  errorBoxStyle,
  collapsedWorkspaceStyle,
  collapsedScoutPanelStyle,
  scoutPanelCollapseButtonStyle,
  collapsedScoutPanelHeaderStyle,
  collapsedScoutPanelLabelStyle
} from "./scout-integrated/ScoutIntegratedPage.styles";

type UserRole = "super_admin" | "org_admin" | "leader" | "viewer";
type ScoutStatus = "active" | "inactive" | "graduated";
type StatusFilter = "active" | "all" | "inactive" | "graduated";
type ReadinessFilter = "all" | "ready" | "needs_attention" | "review_needed" | "action_needed";
type DetailTab =
  "overview" | "advancement" | "badges" | "programs" | "attendance";

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
  status: ScoutStatus;
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

type Organization = {
  id: string;
  name: string;
  beom_attendance_required: boolean;
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

type BadgeCategory = {
  id: string;
  name: string;
  sort_order: number;
};

type PromotionBadgeUsage = {
  id: string;
  scout_badge_id: string;
};

type BadgeForm = {
  id: string;
  badge_id: string;
  acquired_at: string;
  approved_at: string;
  instructor_name: string;
  leader_confirmed: boolean;
  note: string;
};

type RpcClient = {
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
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

type ProgramForm = {
  id: string;
  program_type: "WSEP" | "MoP";
  completed_at: string;
  certificate_no: string;
  approved_at: string;
  note: string;
};


type RankApprovalDateMap = Record<string, string>;

type ScoutCreateForm = {
  organization_id: string;
  name: string;
  grade: string;
  joined_at: string;
  current_rank_id: string;
  rank_approval_dates: RankApprovalDateMap;
  is_from_cub_scout: boolean;
  cub_promotion_completed: boolean;
  beginner_course_exempted: boolean;
  note: string;
};

type Attendance = {
  id: string;
  scout_id: string;
  status: string;
};

type IntegratedData = {
  profile: UserProfile | null;
  scouts: Scout[];
  ranks: Rank[];
  rankRequirements: RankRequirement[];
  rankRequiredBadges: RankRequiredBadge[];
  organizations: Organization[];
  rankHistories: RankHistory[];
  promotionReviews: PromotionReview[];
  scoutBadges: ScoutBadge[];
  badges: Badge[];
  badgeCategories: BadgeCategory[];
  promotionBadgeUsages: PromotionBadgeUsage[];
  programCompletions: ProgramCompletion[];
  attendance: Attendance[];
};

const EMPTY_DATA: IntegratedData = {
  profile: null,
  scouts: [],
  ranks: [],
  rankRequirements: [],
  rankRequiredBadges: [],
  organizations: [],
  rankHistories: [],
  promotionReviews: [],
  scoutBadges: [],
  badges: [],
  badgeCategories: [],
  promotionBadgeUsages: [],
  programCompletions: [],
  attendance: [],
};

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "최고관리자",
  org_admin: "조직관리자",
  leader: "지도자",
  viewer: "조회전용",
};

const STATUS_LABELS: Record<ScoutStatus, string> = {
  active: "활동",
  inactive: "비활동",
  graduated: "졸업",
};



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
const TAB_OPTIONS: Array<{ value: DetailTab; label: string }> = [
  { value: "overview", label: "종합현황" },
  { value: "advancement", label: "진급" },
  { value: "badges", label: "기능장" },
  { value: "programs", label: "프로그램" },
  { value: "attendance", label: "출석" },
];

function isUserRole(value: unknown): value is UserRole {
  return (
    value === "super_admin" ||
    value === "org_admin" ||
    value === "leader" ||
    value === "viewer"
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return value.slice(0, 10).replaceAll("-", ".");
}

function getTodayText() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const GRADE_OPTIONS = [
  "초등학교 1학년", "초등학교 2학년", "초등학교 3학년",
  "초등학교 4학년", "초등학교 5학년", "초등학교 6학년",
  "중학교 1학년", "중학교 2학년", "중학교 3학년",
  "고등학교 1학년", "고등학교 2학년", "고등학교 3학년",
];

function getEmptyScoutCreateForm(profile?: UserProfile | null): ScoutCreateForm {
  return {
    organization_id: profile?.role === "super_admin" ? "" : profile?.organization_id ?? "",
    name: "",
    grade: "",
    joined_at: getTodayText(),
    current_rank_id: "",
    rank_approval_dates: {},
    is_from_cub_scout: false,
    cub_promotion_completed: false,
    beginner_course_exempted: false,
    note: "",
  };
}

function getAutoBeginnerExempted(grade: string, isFromCub: boolean, promotionCompleted: boolean) {
  if (grade.includes("초등학교")) return false;
  return isFromCub && promotionCompleted;
}

function getEmptyProgramForm(): ProgramForm {
  return {
    id: "",
    program_type: "WSEP",
    completed_at: getTodayText(),
    certificate_no: "",
    approved_at: "",
    note: "",
  };
}

function getEmptyBadgeForm(): BadgeForm {
  return {
    id: "",
    badge_id: "",
    acquired_at: getTodayText(),
    approved_at: getTodayText(),
    instructor_name: "",
    leader_confirmed: false,
    note: "",
  };
}

function toNullableText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNullableDate(value: string) {
  return value ? value : null;
}





function getStatusStyle(status: ScoutStatus): CSSProperties {
  if (status === "inactive") {
    return {
      ...statusBadgeBaseStyle,
      backgroundColor: "#f1f5f9",
      border: "1px solid #cbd5e1",
      color: "#475569",
    };
  }

  if (status === "graduated") {
    return {
      ...statusBadgeBaseStyle,
      backgroundColor: "#ede9fe",
      border: "1px solid #ddd6fe",
      color: "#6d28d9",
    };
  }

  return {
    ...statusBadgeBaseStyle,
    backgroundColor: "#dcfce7",
    border: "1px solid #bbf7d0",
    color: "#166534",
  };
}



function getAttendanceSummary(rows: Attendance[]) {
  const enteredRows = rows.filter((row) => row.status !== "not_entered");
  const recognizedRows = enteredRows.filter(
    (row) =>
      row.status === "present" ||
      row.status === "late" ||
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


function getCurrentStagePromotionReview(
  scout: Scout,
  promotionReviews: PromotionReview[],
) {
  if (!scout.current_rank_id) return null;

  return (
    promotionReviews.find(
      (review) =>
        review.scout_id === scout.id &&
        review.from_rank_id === scout.current_rank_id,
    ) ?? null
  );
}

function getScoutReadinessSummary(
  scout: Scout,
  ranks: Rank[],
  rankRequirements: RankRequirement[],
  rankRequiredBadges: RankRequiredBadge[],
  promotionReviews: PromotionReview[],
  scoutBadges: ScoutBadge[],
  badges: Badge[],
  programCompletions: ProgramCompletion[],
  attendance: Attendance[],
  organizations: Organization[],
) {
  const badgeMap = new Map(badges.map((badge) => [badge.id, badge]));
  const latestReview = getCurrentStagePromotionReview(
    scout,
    promotionReviews,
  );
  const ownedBadges = scoutBadges.filter((row) => row.scout_id === scout.id);
  const programs = programCompletions.filter(
    (row) => row.scout_id === scout.id,
  );
  const attendanceSummary = getAttendanceSummary(
    attendance.filter((row) => row.scout_id === scout.id),
  );
  const attendanceRequiredForBeom = Boolean(
    organizations.find((organization) => organization.id === scout.organization_id)
      ?.beom_attendance_required,
  );
  const stageSummary = getStageBadgeSummary(
    scout,
    ranks,
    rankRequirements,
    rankRequiredBadges,
    ownedBadges,
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
  const periodPassed = latestReview?.period_passed ?? false;
  const requiredPassed =
    stageSummary.stage !== null &&
    stageSummary.missingRequiredNames.length === 0;
  const generalPassed =
    stageSummary.stage !== null && stageSummary.generalMissing === 0;
  const programPassed =
    !isBeomTarget || programs.some((program) => Boolean(program.approved_at));
  const attendancePassed =
    !isBeomTarget ||
    !attendanceRequiredForBeom ||
    (attendanceSummary.rate !== null && attendanceSummary.rate >= 80);
  const effectivePassed =
    Boolean(latestReview) &&
    periodPassed &&
    requiredPassed &&
    generalPassed &&
    programPassed &&
    attendancePassed;

  const missingLabels: string[] = [];
  if (!latestReview) missingLabels.push("진급 판정");
  if (latestReview && !periodPassed) missingLabels.push("활동기간");
  if (!requiredPassed) missingLabels.push("필수 기능장");
  if (!generalPassed) missingLabels.push("일반 기능장");
  if (!programPassed) missingLabels.push("프로그램");
  if (!attendancePassed) missingLabels.push("출석률");

  const status: Exclude<ReadinessFilter, "all"> =
    !scout.current_rank_id || !latestReview
      ? "review_needed"
      : effectivePassed
        ? "ready"
        : "needs_attention";

  return {
    status,
    latestReview,
    targetRank,
    stageSummary,
    attendanceSummary,
    isBeomTarget,
    periodPassed,
    requiredPassed,
    generalPassed,
    programPassed,
    attendancePassed,
    attendanceRequiredForBeom,
    effectivePassed,
    missingLabels,
  };
}

export default function ScoutIntegratedPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedScoutId = searchParams.get("scoutId") ?? "";
  const [data, setData] = useState<IntegratedData>(EMPTY_DATA);
  const [selectedScoutId, setSelectedScoutId] = useState("");
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [readinessFilter, setReadinessFilter] =
    useState<ReadinessFilter>("all");
  const [rankFilter, setRankFilter] = useState("");
  const [registrationMenuOpen, setRegistrationMenuOpen] = useState(false);
  const registrationMenuRef = useRef<HTMLDivElement | null>(null);
  const [excelImportOpen, setExcelImportOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [showUsageGuide, setShowUsageGuide] = useState(false);
  const [usageGuideExpanded, setUsageGuideExpanded] = useState(false);
  const [scoutListCollapsed, setScoutListCollapsed] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [badgeFormMode, setBadgeFormMode] = useState<"create" | "edit" | null>(
    null,
  );
  const [badgeForm, setBadgeForm] = useState<BadgeForm>(getEmptyBadgeForm());
  const [badgeFormError, setBadgeFormError] = useState("");
  const [badgeSubmitting, setBadgeSubmitting] = useState(false);
  const [badgeDeletingId, setBadgeDeletingId] = useState("");
  const [scoutCreateOpen, setScoutCreateOpen] = useState(false);
  const [scoutCreateForm, setScoutCreateForm] = useState<ScoutCreateForm>(getEmptyScoutCreateForm());
  const [scoutCreateError, setScoutCreateError] = useState("");
  const [scoutCreateSubmitting, setScoutCreateSubmitting] = useState(false);

  const [promotionReviewDate, setPromotionReviewDate] =
    useState(getTodayText());
  const [promotionReviewSubmitting, setPromotionReviewSubmitting] =
    useState(false);
  const [promotionReviewError, setPromotionReviewError] = useState("");
  const [promotionApprovalDate, setPromotionApprovalDate] =
    useState(getTodayText());
  const [promotionApprovalNote, setPromotionApprovalNote] = useState("");
  const [promotionApprovalSubmitting, setPromotionApprovalSubmitting] =
    useState(false);
  const [promotionApprovalError, setPromotionApprovalError] = useState("");
  const [promotionActionMessage, setPromotionActionMessage] = useState("");
  const [programFormMode, setProgramFormMode] = useState<
    "create" | "edit" | null
  >(null);
  const [programForm, setProgramForm] = useState<ProgramForm>(
    getEmptyProgramForm(),
  );
  const [programFormError, setProgramFormError] = useState("");
  const [programSubmitting, setProgramSubmitting] = useState(false);
  const [programDeletingId, setProgramDeletingId] = useState("");
  const [programActionMessage, setProgramActionMessage] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error("로그인 사용자 정보를 확인하지 못했습니다.");
      }

      const { data: profileData, error: profileError } = await supabase
        .from("user_profiles")
        .select("role, organization_id")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .maybeSingle();

      if (profileError) {
        throw new Error("사용자 권한 정보를 불러오지 못했습니다.");
      }

      if (!profileData || !isUserRole(profileData.role)) {
        throw new Error("사용자 권한 정보가 올바르지 않습니다.");
      }

      const profile: UserProfile = {
        role: profileData.role,
        organization_id:
          typeof profileData.organization_id === "string"
            ? profileData.organization_id
            : null,
      };

      let scoutQuery = supabase
        .from("scouts")
        .select(
          "id, organization_id, name, member_no, school_name, grade, joined_at, current_rank_id, status",
        )
        .is("deleted_at", null)
        .order("name", { ascending: true });

      let historyQuery = supabase
        .from("scout_rank_histories")
        .select("id, scout_id, rank_id, approved_at, approval_type")
        .is("deleted_at", null)
        .order("approved_at", { ascending: false });

      let reviewQuery = supabase
        .from("promotion_reviews")
        .select(
          "id, scout_id, from_rank_id, to_rank_id, review_date, base_date, available_at, required_months, days_remaining, period_passed, attendance_total_count, attendance_present_count, attendance_rate, attendance_passed, required_badges_passed, general_badges_passed, program_passed, final_passed, missing_items, note, created_at",
        )
        .is("deleted_at", null)
        .order("review_date", { ascending: false })
        .order("created_at", { ascending: false });

      let scoutBadgeQuery = supabase
        .from("scout_badges")
        .select(
          "id, organization_id, scout_id, badge_id, acquired_at, approved_at, instructor_name, leader_confirmed, note, created_at",
        )
        .is("deleted_at", null)
        .order("acquired_at", { ascending: false });

      let promotionBadgeUsageQuery = supabase
        .from("promotion_badge_usages")
        .select("id, scout_badge_id")
        .is("deleted_at", null);

      let programQuery = supabase
        .from("program_completions")
        .select(
          "id, scout_id, program_type, completed_at, certificate_no, approved_at, note",
        )
        .is("deleted_at", null)
        .order("completed_at", { ascending: false });

      let attendanceQuery = supabase
        .from("attendance")
        .select("id, scout_id, status")
        .is("deleted_at", null);

      if (profile.role !== "super_admin") {
        if (!profile.organization_id) {
          throw new Error("소속대 정보가 없어 대원 정보를 조회할 수 없습니다.");
        }

        scoutQuery = scoutQuery.eq("organization_id", profile.organization_id);
        historyQuery = historyQuery.eq(
          "organization_id",
          profile.organization_id,
        );
        reviewQuery = reviewQuery.eq(
          "organization_id",
          profile.organization_id,
        );
        scoutBadgeQuery = scoutBadgeQuery.eq(
          "organization_id",
          profile.organization_id,
        );
        promotionBadgeUsageQuery = promotionBadgeUsageQuery.eq(
          "organization_id",
          profile.organization_id,
        );
        programQuery = programQuery.eq(
          "organization_id",
          profile.organization_id,
        );
        attendanceQuery = attendanceQuery.eq(
          "organization_id",
          profile.organization_id,
        );
      }

      const [
        scoutResult,
        rankResult,
        rankRequirementResult,
        rankRequiredBadgeResult,
        organizationResult,
        historyResult,
        reviewResult,
        scoutBadgeResult,
        badgeResult,
        badgeCategoryResult,
        promotionBadgeUsageResult,
        programResult,
        attendanceResult,
      ] = await Promise.all([
        scoutQuery,
        supabase
          .from("ranks")
          .select("id, rank_code, rank_name, sort_order")
          .order("sort_order", { ascending: true }),
        supabase
          .from("rank_requirements")
          .select("id, from_rank_id, to_rank_id, required_general_badge_count"),
        supabase
          .from("rank_required_badges")
          .select("id, rank_requirement_id, badge_id, sort_order")
          .order("sort_order", { ascending: true }),
        supabase
          .from("organizations")
          .select("id, name, beom_attendance_required")
          .is("deleted_at", null)
          .order("name", { ascending: true }),
        historyQuery,
        reviewQuery,
        scoutBadgeQuery,
        supabase
          .from("badges")
          .select(
            "id, category_id, name, is_required_badge, is_general_badge, special_rule, sort_order",
          )
          .order("sort_order", { ascending: true, nullsFirst: false })
          .order("name", { ascending: true }),
        supabase
          .from("badge_categories")
          .select("id, name, sort_order")
          .order("sort_order", { ascending: true }),
        promotionBadgeUsageQuery,
        programQuery,
        attendanceQuery,
      ]);

      const firstError =
        scoutResult.error ||
        rankResult.error ||
        rankRequirementResult.error ||
        rankRequiredBadgeResult.error ||
        historyResult.error ||
        reviewResult.error ||
        scoutBadgeResult.error ||
        badgeResult.error ||
        badgeCategoryResult.error ||
        promotionBadgeUsageResult.error ||
        programResult.error ||
        attendanceResult.error;

      if (firstError) {
        throw new Error(firstError.message);
      }

      const scouts = (scoutResult.data ?? []) as unknown as Scout[];

      setData({
        profile,
        scouts,
        ranks: (rankResult.data ?? []) as Rank[],
        rankRequirements: (rankRequirementResult.data ??
          []) as RankRequirement[],
        rankRequiredBadges: (rankRequiredBadgeResult.data ??
          []) as RankRequiredBadge[],
        organizations: (organizationResult.data ?? []) as Organization[],
        rankHistories: (historyResult.data ?? []) as unknown as RankHistory[],
        promotionReviews: (reviewResult.data ??
          []) as unknown as PromotionReview[],
        scoutBadges: (scoutBadgeResult.data ?? []) as unknown as ScoutBadge[],
        badges: (badgeResult.data ?? []) as Badge[],
        badgeCategories: (badgeCategoryResult.data ?? []) as BadgeCategory[],
        promotionBadgeUsages: (promotionBadgeUsageResult.data ??
          []) as unknown as PromotionBadgeUsage[],
        programCompletions: (programResult.data ??
          []) as unknown as ProgramCompletion[],
        attendance: (attendanceResult.data ?? []) as unknown as Attendance[],
      });

      setSelectedScoutId((current) => {
        if (profile.role === "super_admin") {
          return current && scouts.some((scout) => scout.id === current)
            ? current
            : "";
        }

        if (current && scouts.some((scout) => scout.id === current)) {
          return current;
        }

        return (
          scouts.find((scout) => scout.status === "active")?.id ??
          scouts[0]?.id ??
          ""
        );
      });
    } catch (error) {
      console.error("대원 통합관리 조회 오류:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "대원 통합관리 정보를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setShowUsageGuide(
      window.localStorage.getItem("scout-integrated-guide-dismissed") !== "true",
    );
  }, []);

  const handleDismissUsageGuide = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("scout-integrated-guide-dismissed", "true");
    }
    setUsageGuideExpanded(false);
    setShowUsageGuide(false);
  };

  useEffect(() => {
    if (!requestedScoutId || data.scouts.length === 0) return;

    const requestedScout = data.scouts.find(
      (scout) => scout.id === requestedScoutId,
    );

    if (!requestedScout) return;

    setSelectedOrganizationId(requestedScout.organization_id);
    setSelectedScoutId(requestedScout.id);
    setStatusFilter(requestedScout.status);
    setReadinessFilter("all");
    setRankFilter("");
    setKeyword("");
    setActiveTab("overview");

    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(
          `[data-scout-id="${CSS.escape(requestedScout.id)}"]`,
        )
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, [data.scouts, requestedScoutId]);

  const rankMap = useMemo(
    () => new Map(data.ranks.map((rank) => [rank.id, rank])),
    [data.ranks],
  );

  const organizationMap = useMemo(
    () =>
      new Map(
        data.organizations.map((organization) => [
          organization.id,
          organization.name,
        ]),
      ),
    [data.organizations],
  );

  const organizationAttendanceRequiredMap = useMemo(
    () =>
      new Map(
        data.organizations.map((organization) => [
          organization.id,
          organization.beom_attendance_required,
        ]),
      ),
    [data.organizations],
  );

  const badgeMap = useMemo(
    () => new Map(data.badges.map((badge) => [badge.id, badge])),
    [data.badges],
  );

  const categoryMap = useMemo(
    () =>
      new Map(data.badgeCategories.map((category) => [category.id, category])),
    [data.badgeCategories],
  );

  const usedScoutBadgeIdSet = useMemo(
    () =>
      new Set(data.promotionBadgeUsages.map((usage) => usage.scout_badge_id)),
    [data.promotionBadgeUsages],
  );

  const canManageBadges =
    data.profile?.role === "super_admin" ||
    data.profile?.role === "org_admin" ||
    data.profile?.role === "leader";

  const canManageScouts = canManageBadges;
  const canManageAdvancements = canManageBadges;
  const canManagePrograms = canManageBadges;
  const isSuperAdmin = data.profile?.role === "super_admin";

  const organizationScopedScouts = useMemo(() => {
    if (!isSuperAdmin) return data.scouts;
    if (!selectedOrganizationId) return data.scouts;
    return data.scouts.filter(
      (scout) => scout.organization_id === selectedOrganizationId,
    );
  }, [data.scouts, isSuperAdmin, selectedOrganizationId]);

  const scoutReadinessMap = useMemo(() => {
    return new Map(
      data.scouts.map((scout) => [
        scout.id,
        getScoutReadinessSummary(
          scout,
          data.ranks,
          data.rankRequirements,
          data.rankRequiredBadges,
          data.promotionReviews,
          data.scoutBadges,
          data.badges,
          data.programCompletions,
          data.attendance,
          data.organizations,
        ),
      ]),
    );
  }, [data]);

  const summaryCounts = useMemo(() => {
    const activeScouts = organizationScopedScouts.filter(
      (scout) => scout.status === "active",
    );
    return activeScouts.reduce(
      (counts, scout) => {
        const readiness = scoutReadinessMap.get(scout.id);
        counts.all += 1;
        if (readiness?.status === "ready") counts.ready += 1;
        if (readiness?.status === "needs_attention")
          counts.needs_attention += 1;
        if (readiness?.status === "review_needed") counts.review_needed += 1;
        if (readiness?.status === "needs_attention" || readiness?.status === "review_needed") {
          counts.action_needed += 1;
        }
        return counts;
      },
      { all: 0, ready: 0, needs_attention: 0, review_needed: 0, action_needed: 0 },
    );
  }, [organizationScopedScouts, scoutReadinessMap]);

  const selectedScout = useMemo(() => {
    if (isSuperAdmin && !selectedOrganizationId) return null;

    return (
      organizationScopedScouts.find((scout) => scout.id === selectedScoutId) ??
      null
    );
  }, [isSuperAdmin, organizationScopedScouts, selectedOrganizationId, selectedScoutId]);

  const filteredScouts = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    if (isSuperAdmin && !selectedOrganizationId) return [];

    return organizationScopedScouts.filter((scout) => {
      if (statusFilter !== "all" && scout.status !== statusFilter) {
        return false;
      }

      if (rankFilter && scout.current_rank_id !== rankFilter) {
        return false;
      }

      const scoutReadinessStatus = scoutReadinessMap.get(scout.id)?.status;
      if (
        readinessFilter === "action_needed" &&
        scoutReadinessStatus !== "needs_attention" &&
        scoutReadinessStatus !== "review_needed"
      ) {
        return false;
      }

      if (
        readinessFilter !== "all" &&
        readinessFilter !== "action_needed" &&
        scoutReadinessStatus !== readinessFilter
      ) {
        return false;
      }

      if (!normalizedKeyword) {
        return true;
      }

      const targetText = [
        scout.name,
        scout.member_no,
        scout.school_name,
        scout.grade,
        scout.current_rank_id
          ? rankMap.get(scout.current_rank_id)?.rank_name
          : "",
        organizationMap.get(scout.organization_id),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return targetText.includes(normalizedKeyword);
    });
  }, [
    isSuperAdmin,
    keyword,
    organizationMap,
    organizationScopedScouts,
    rankFilter,
    rankMap,
    readinessFilter,
    scoutReadinessMap,
    selectedOrganizationId,
    statusFilter,
  ]);

  const selectedRankHistories = useMemo(() => {
    if (!selectedScout) return [];

    return data.rankHistories.filter(
      (history) => history.scout_id === selectedScout.id,
    );
  }, [data.rankHistories, selectedScout]);

  const selectedReviews = useMemo(() => {
    if (!selectedScout) return [];

    return data.promotionReviews.filter(
      (review) => review.scout_id === selectedScout.id,
    );
  }, [data.promotionReviews, selectedScout]);

  const latestReview = selectedScout
    ? getCurrentStagePromotionReview(selectedScout, selectedReviews)
    : null;

  const selectedScoutBadges = useMemo(() => {
    if (!selectedScout) return [];

    return data.scoutBadges.filter(
      (scoutBadge) => scoutBadge.scout_id === selectedScout.id,
    );
  }, [data.scoutBadges, selectedScout]);

  const selectedPrograms = useMemo(() => {
    if (!selectedScout) return [];

    return data.programCompletions.filter(
      (completion) => completion.scout_id === selectedScout.id,
    );
  }, [data.programCompletions, selectedScout]);

  const selectedAttendance = useMemo(() => {
    if (!selectedScout) return [];

    return data.attendance.filter(
      (attendance) => attendance.scout_id === selectedScout.id,
    );
  }, [data.attendance, selectedScout]);

  const attendanceSummary = useMemo(
    () => getAttendanceSummary(selectedAttendance),
    [selectedAttendance],
  );

  const currentRankName = selectedScout?.current_rank_id
    ? (rankMap.get(selectedScout.current_rank_id)?.rank_name ??
      "급위 확인 필요")
    : "급위 미등록";

  const selectedReadiness = selectedScout
    ? (scoutReadinessMap.get(selectedScout.id) ?? null)
    : null;

  const targetRankName = selectedReadiness?.targetRank?.rank_name ?? "-";

  const handleSelectScout = (scoutId: string) => {
    const scout = data.scouts.find((item) => item.id === scoutId);
    if (isSuperAdmin && scout) {
      setSelectedOrganizationId(scout.organization_id);
    }
    setSelectedScoutId(scoutId);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("scoutId", scoutId);
      return next;
    }, { replace: true });
    setBadgeFormMode(null);
    setBadgeForm(getEmptyBadgeForm());
    setBadgeFormError("");
    setPromotionReviewError("");
    setPromotionApprovalError("");
    setPromotionActionMessage("");
    setProgramFormMode(null);
    setProgramForm(getEmptyProgramForm());
    setProgramFormError("");
    setProgramActionMessage("");
  };

  const handleRunPromotionReview = async () => {
    if (!canManageAdvancements) {
      setPromotionReviewError("진급 판정 권한이 없습니다.");
      return;
    }

    if (!selectedScout) {
      setPromotionReviewError("진급 판정할 대원을 선택해야 합니다.");
      return;
    }

    if (!selectedScout.current_rank_id) {
      setPromotionReviewError(
        "현재급위가 등록되지 않았습니다. 먼저 초급 인가 또는 현재급위 정보를 등록해야 합니다.",
      );
      return;
    }

    if (!promotionReviewDate) {
      setPromotionReviewError("판정일을 입력해야 합니다.");
      return;
    }

    setPromotionReviewSubmitting(true);
    setPromotionReviewError("");
    setPromotionApprovalError("");
    setPromotionActionMessage("");

    const rpcClient = supabase as unknown as RpcClient;
    const { error } = await rpcClient.rpc("review_scout_promotion", {
      p_scout_id: selectedScout.id,
      p_review_date: promotionReviewDate,
    });

    if (error) {
      console.error("통합관리 진급 판정 오류:", error.message);
      setPromotionReviewError(`진급 판정에 실패했습니다. ${error.message}`);
      setPromotionReviewSubmitting(false);
      return;
    }

    setPromotionReviewSubmitting(false);
    setPromotionActionMessage(
      "진급 판정을 완료했습니다. 판정 결과와 보완 항목을 확인하세요.",
    );
    await loadData();
  };

  const handleApprovePromotion = async () => {
    if (!canManageAdvancements) {
      setPromotionApprovalError("진급 인가 권한이 없습니다.");
      return;
    }

    if (!latestReview) {
      setPromotionApprovalError("먼저 진급 판정을 실행해야 합니다.");
      return;
    }

    if (!selectedScout) {
      setPromotionApprovalError("진급 인가할 대원을 확인하지 못했습니다.");
      return;
    }

    const currentStageSummary = getStageBadgeSummary(
      selectedScout,
      data.ranks,
      data.rankRequirements,
      data.rankRequiredBadges,
      selectedScoutBadges,
      badgeMap,
    );
    const currentRequiredBadgesPassed =
      currentStageSummary.stage !== null &&
      currentStageSummary.missingRequiredNames.length === 0;
    const currentGeneralBadgesPassed =
      currentStageSummary.stage !== null &&
      currentStageSummary.generalMissing === 0;
    const approvalTargetRank =
      data.ranks.find((rank) => rank.id === latestReview.to_rank_id) ?? null;
    const isBeomApproval =
      approvalTargetRank?.rank_code === "beom" ||
      normalizeRankOrBadgeName(approvalTargetRank?.rank_name ?? "") === "범";
    const currentProgramPassed =
      !isBeomApproval ||
      selectedPrograms.some((program) => Boolean(program.approved_at));
    const attendanceRequiredForBeom = Boolean(
      organizationAttendanceRequiredMap.get(selectedScout.organization_id),
    );
    const currentAttendancePassed =
      !isBeomApproval ||
      !attendanceRequiredForBeom ||
      (attendanceSummary.rate !== null && attendanceSummary.rate >= 80);
    const effectiveFinalPassed =
      latestReview.period_passed &&
      currentRequiredBadgesPassed &&
      currentGeneralBadgesPassed &&
      currentProgramPassed &&
      currentAttendancePassed;

    if (!effectiveFinalPassed) {
      const missingConditions: string[] = [];

      if (!latestReview.period_passed) missingConditions.push("활동기간");
      if (!currentRequiredBadgesPassed) missingConditions.push("필수 기능장");
      if (!currentGeneralBadgesPassed) missingConditions.push("일반 기능장");
      if (!currentProgramPassed) missingConditions.push("WSEP/MoP");
      if (!currentAttendancePassed) missingConditions.push("출석률");

      setPromotionApprovalError(
        `현재 실제 기록 기준으로 ${missingConditions.join(", ")} 조건이 미충족되어 진급 인가할 수 없습니다. 기록을 보완한 뒤 진급 판정을 다시 실행하세요.`,
      );
      return;
    }

    if (!promotionApprovalDate) {
      setPromotionApprovalError("인가일을 입력해야 합니다.");
      return;
    }

    setPromotionApprovalSubmitting(true);
    setPromotionApprovalError("");
    setPromotionReviewError("");
    setPromotionActionMessage("");

    const rpcClient = supabase as unknown as RpcClient;
    const { error } = await rpcClient.rpc("approve_scout_promotion", {
      p_promotion_review_id: latestReview.id,
      p_approved_at: promotionApprovalDate,
      p_note: toNullableText(promotionApprovalNote),
    });

    if (error) {
      console.error("통합관리 진급 인가 오류:", error.message);
      setPromotionApprovalError(
        `진급 인가 저장에 실패했습니다. ${error.message}`,
      );
      setPromotionApprovalSubmitting(false);
      return;
    }

    const approvedRankName =
      data.ranks.find((rank) => rank.id === latestReview.to_rank_id)?.rank_name ??
      "다음 급위";

    setPromotionApprovalSubmitting(false);
    setPromotionApprovalNote("");
    setPromotionActionMessage(
      `${approvedRankName} 진급 인가를 저장했습니다. 현재급위가 갱신되어 다음 진급 단계를 표시합니다.`,
    );
    await loadData();
  };

  const handleOpenCreateProgram = (programType: "WSEP" | "MoP" = "WSEP") => {
    if (!canManagePrograms || !selectedScout) return;

    const duplicate = selectedPrograms.some(
      (completion) => completion.program_type === programType,
    );

    if (duplicate) {
      setProgramFormError(
        `${programType} 이수 기록이 이미 있습니다. 기존 기록을 수정하세요.`,
      );
      setActiveTab("programs");
      return;
    }

    setProgramForm({
      ...getEmptyProgramForm(),
      program_type: programType,
    });
    setProgramFormError("");
    setProgramActionMessage("");
    setProgramFormMode("create");
  };

  const handleOpenEditProgram = (completion: ProgramCompletion) => {
    if (!canManagePrograms) return;

    setProgramForm({
      id: completion.id,
      program_type: completion.program_type,
      completed_at: completion.completed_at.slice(0, 10),
      certificate_no: completion.certificate_no ?? "",
      approved_at: completion.approved_at?.slice(0, 10) ?? "",
      note: completion.note ?? "",
    });
    setProgramFormError("");
    setProgramActionMessage("");
    setProgramFormMode("edit");
  };

  const handleCloseProgramForm = () => {
    if (programSubmitting) return;

    setProgramFormMode(null);
    setProgramForm(getEmptyProgramForm());
    setProgramFormError("");
  };

  const validateProgramForm = () => {
    if (!selectedScout) return "대원을 선택해야 합니다.";
    if (!programForm.completed_at) return "이수일을 입력해야 합니다.";

    if (
      programForm.approved_at &&
      programForm.approved_at < programForm.completed_at
    ) {
      return "승인일은 이수일보다 빠를 수 없습니다.";
    }

    const duplicate = selectedPrograms.some(
      (completion) =>
        completion.id !== programForm.id &&
        completion.program_type === programForm.program_type,
    );

    if (duplicate) {
      return `${programForm.program_type} 이수 기록이 이미 있습니다.`;
    }

    return "";
  };

  const handleSaveProgram = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canManagePrograms) {
      setProgramFormError("프로그램 이수 기록을 관리할 권한이 없습니다.");
      return;
    }

    const validationMessage = validateProgramForm();

    if (validationMessage) {
      setProgramFormError(validationMessage);
      return;
    }

    setProgramSubmitting(true);
    setProgramFormError("");
    setProgramActionMessage("");

    const rpcClient = supabase as unknown as RpcClient;
    const isEdit = programFormMode === "edit";

    const result = isEdit
      ? await rpcClient.rpc("update_program_completion_record", {
          p_program_completion_id: programForm.id,
          p_program_type: programForm.program_type,
          p_completed_at: programForm.completed_at,
          p_certificate_no: toNullableText(programForm.certificate_no),
          p_approved_at: toNullableDate(programForm.approved_at),
          p_note: toNullableText(programForm.note),
        })
      : await rpcClient.rpc("create_program_completion_record", {
          p_scout_id: selectedScout?.id,
          p_program_type: programForm.program_type,
          p_completed_at: programForm.completed_at,
          p_certificate_no: toNullableText(programForm.certificate_no),
          p_approved_at: toNullableDate(programForm.approved_at),
          p_note: toNullableText(programForm.note),
        });

    if (result.error) {
      setProgramFormError(
        `${isEdit ? "프로그램 이수 수정" : "프로그램 이수 등록"}에 실패했습니다. ${result.error.message}`,
      );
      setProgramSubmitting(false);
      return;
    }

    setProgramSubmitting(false);
    setProgramFormMode(null);
    setProgramForm(getEmptyProgramForm());
    setProgramActionMessage(
      isEdit
        ? "프로그램 이수 기록을 수정했습니다."
        : "프로그램 이수 기록을 등록했습니다.",
    );
    await loadData();
    setActiveTab("programs");
  };

  const handleDeleteProgram = async (completion: ProgramCompletion) => {
    if (!canManagePrograms) return;

    const confirmed = window.confirm(
      `${selectedScout?.name ?? "선택 대원"}의 ${completion.program_type} 이수 기록을 삭제할까요?`,
    );

    if (!confirmed) return;

    setProgramDeletingId(completion.id);
    setProgramFormError("");
    setProgramActionMessage("");

    const rpcClient = supabase as unknown as RpcClient;
    const { error } = await rpcClient.rpc("archive_program_completion_record", {
      p_program_completion_id: completion.id,
    });

    if (error) {
      setProgramFormError(
        `프로그램 이수 삭제에 실패했습니다. ${error.message}`,
      );
      setProgramDeletingId("");
      return;
    }

    setProgramDeletingId("");
    setProgramActionMessage("프로그램 이수 기록을 삭제했습니다.");
    await loadData();
    setActiveTab("programs");
  };

  const handleOpenCreateBadge = () => {
    if (!canManageBadges || !selectedScout) return;
    setBadgeForm({
      ...getEmptyBadgeForm(),
      id: "",
    });
    setBadgeFormError("");
    setBadgeFormMode("create");
  };

  const handleOpenEditBadge = (scoutBadge: ScoutBadge) => {
    if (!canManageBadges) return;

    if (usedScoutBadgeIdSet.has(scoutBadge.id)) {
      setBadgeFormError(
        "이미 진급 인가에 사용된 기능장 기록은 수정할 수 없습니다.",
      );
      return;
    }

    setBadgeForm({
      id: scoutBadge.id,
      badge_id: scoutBadge.badge_id,
      acquired_at: scoutBadge.acquired_at.slice(0, 10),
      approved_at: scoutBadge.approved_at?.slice(0, 10) ?? "",
      instructor_name: scoutBadge.instructor_name ?? "",
      leader_confirmed: scoutBadge.leader_confirmed,
      note: scoutBadge.note ?? "",
    });
    setBadgeFormError("");
    setBadgeFormMode("edit");
  };

  const handleCloseBadgeForm = () => {
    if (badgeSubmitting) return;
    setBadgeFormMode(null);
    setBadgeForm(getEmptyBadgeForm());
    setBadgeFormError("");
  };

  const validateBadgeForm = () => {
    if (!selectedScout) return "대원을 선택해야 합니다.";
    if (!badgeForm.badge_id) return "기능장을 선택해야 합니다.";
    if (!badgeForm.acquired_at) return "취득일을 입력해야 합니다.";
    if (
      badgeForm.approved_at &&
      badgeForm.approved_at < badgeForm.acquired_at
    ) {
      return "인가일은 취득일보다 빠를 수 없습니다.";
    }
    return "";
  };

  const handleSaveBadge = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canManageBadges) {
      setBadgeFormError("기능장 기록을 관리할 권한이 없습니다.");
      return;
    }

    const validationMessage = validateBadgeForm();
    if (validationMessage) {
      setBadgeFormError(validationMessage);
      return;
    }

    setBadgeSubmitting(true);
    setBadgeFormError("");

    const rpcClient = supabase as unknown as RpcClient;
    const isEdit = badgeFormMode === "edit";

    const result = isEdit
      ? await rpcClient.rpc("update_scout_badge_record", {
          p_scout_badge_id: badgeForm.id,
          p_badge_id: badgeForm.badge_id,
          p_acquired_at: badgeForm.acquired_at,
          p_approved_at: toNullableDate(badgeForm.approved_at),
          p_instructor_name: toNullableText(badgeForm.instructor_name),
          p_leader_confirmed: badgeForm.leader_confirmed,
          p_note: toNullableText(badgeForm.note),
        })
      : await rpcClient.rpc("create_scout_badge_record", {
          p_scout_id: selectedScout?.id,
          p_badge_id: badgeForm.badge_id,
          p_acquired_at: badgeForm.acquired_at,
          p_approved_at: toNullableDate(badgeForm.approved_at),
          p_instructor_name: toNullableText(badgeForm.instructor_name),
          p_leader_confirmed: badgeForm.leader_confirmed,
          p_note: toNullableText(badgeForm.note),
        });

    if (result.error) {
      setBadgeFormError(
        `${isEdit ? "기능장 수정" : "기능장 등록"}에 실패했습니다. ${result.error.message}`,
      );
      setBadgeSubmitting(false);
      return;
    }

    setBadgeSubmitting(false);
    setBadgeFormMode(null);
    setBadgeForm(getEmptyBadgeForm());
    await loadData();
    setActiveTab("badges");
  };

  const handleDeleteBadge = async (scoutBadge: ScoutBadge) => {
    if (!canManageBadges) return;

    if (usedScoutBadgeIdSet.has(scoutBadge.id)) {
      setBadgeFormError(
        "이미 진급 인가에 사용된 기능장 기록은 삭제할 수 없습니다.",
      );
      return;
    }

    const badgeName = badgeMap.get(scoutBadge.badge_id)?.name ?? "선택 기능장";
    const confirmed = window.confirm(
      `${selectedScout?.name ?? "선택 대원"}의 ${badgeName} 기록을 삭제할까요?`,
    );

    if (!confirmed) return;

    setBadgeDeletingId(scoutBadge.id);
    setBadgeFormError("");

    const rpcClient = supabase as unknown as RpcClient;
    const { error } = await rpcClient.rpc("archive_scout_badge_record", {
      p_scout_badge_id: scoutBadge.id,
    });

    if (error) {
      setBadgeFormError(`기능장 삭제에 실패했습니다. ${error.message}`);
      setBadgeDeletingId("");
      return;
    }

    setBadgeDeletingId("");
    await loadData();
    setActiveTab("badges");
  };

  const getRequiredRankHistoryRanks = (currentRankId: string) => {
    const selectedRank = data.ranks.find((rank) => rank.id === currentRankId);
    if (!selectedRank) return [];
    return data.ranks
      .filter((rank) => rank.sort_order <= selectedRank.sort_order)
      .sort((a, b) => a.sort_order - b.sort_order);
  };

  useEffect(() => {
    if (!registrationMenuOpen) return;

    const handleOutsidePointer = (event: MouseEvent) => {
      if (registrationMenuRef.current && !registrationMenuRef.current.contains(event.target as Node)) {
        setRegistrationMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRegistrationMenuOpen(false);
    };

    document.addEventListener("mousedown", handleOutsidePointer);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsidePointer);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [registrationMenuOpen]);

  const handleOpenScoutCreate = () => {
    if (!canManageScouts) return;
    setScoutCreateForm({
      ...getEmptyScoutCreateForm(data.profile),
      organization_id:
        data.profile?.role === "super_admin"
          ? selectedOrganizationId
          : data.profile?.organization_id ?? "",
    });
    setScoutCreateError("");
    setScoutCreateOpen(true);
  };

  const handleCloseScoutCreate = () => {
    if (scoutCreateSubmitting) return;
    setScoutCreateOpen(false);
    setScoutCreateError("");
  };

  const handleScoutCreateRankChange = (rankId: string) => {
    const nextDates: RankApprovalDateMap = {};
    getRequiredRankHistoryRanks(rankId).forEach((rank) => {
      nextDates[rank.id] = scoutCreateForm.rank_approval_dates[rank.id] ?? "";
    });
    setScoutCreateForm((current) => ({ ...current, current_rank_id: rankId, rank_approval_dates: nextDates }));
  };

  const saveScoutRankHistory = async (scoutId: string, organizationId: string, rankId: string, approvedAt: string) => {
    const { data: existing, error: lookupError } = await supabase
      .from("scout_rank_histories")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("scout_id", scoutId)
      .eq("rank_id", rankId)
      .is("deleted_at", null)
      .maybeSingle();
    if (lookupError) throw new Error(lookupError.message);
    if (existing) {
      const { error } = await supabase.from("scout_rank_histories").update({ approved_at: approvedAt, approval_type: "normal", note: "대원 통합관리에서 입력" }).eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("scout_rank_histories").insert({ organization_id: organizationId, scout_id: scoutId, rank_id: rankId, approved_at: approvedAt, approval_type: "normal", note: "대원 통합관리에서 입력" });
      if (error) throw new Error(error.message);
    }
  };

  const handleCreateScout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!data.profile || !canManageScouts) { setScoutCreateError("대원 등록 권한이 없습니다."); return; }
    const organizationId = data.profile.role === "super_admin" ? scoutCreateForm.organization_id : data.profile.organization_id;
    if (!organizationId) { setScoutCreateError("소속대를 선택해야 합니다."); return; }
    if (!scoutCreateForm.name.trim()) { setScoutCreateError("대원명을 입력해야 합니다."); return; }
    if (!scoutCreateForm.joined_at) { setScoutCreateError("입단일을 입력해야 합니다."); return; }
    const requiredRanks = getRequiredRankHistoryRanks(scoutCreateForm.current_rank_id);
    const missingDate = requiredRanks.find((rank) => !scoutCreateForm.rank_approval_dates[rank.id]);
    if (missingDate) { setScoutCreateError(`${missingDate.rank_name} 인가일을 입력해야 합니다.`); return; }
    const organizationName = organizationMap.get(organizationId) ?? null;
    setScoutCreateSubmitting(true); setScoutCreateError("");
    try {
      const rpcClient = supabase as unknown as RpcClient;
      const { data: created, error } = await rpcClient.rpc("create_scout_auto_member_no", {
        p_name: scoutCreateForm.name.trim(),
        p_organization_id: organizationId,
        p_school_name: organizationName,
        p_grade: toNullableText(scoutCreateForm.grade),
        p_joined_at: scoutCreateForm.joined_at,
        p_is_from_cub_scout: scoutCreateForm.is_from_cub_scout,
        p_cub_promotion_completed: scoutCreateForm.cub_promotion_completed,
        p_beginner_course_exempted: getAutoBeginnerExempted(scoutCreateForm.grade, scoutCreateForm.is_from_cub_scout, scoutCreateForm.cub_promotion_completed),
        p_note: toNullableText(scoutCreateForm.note),
      });
      if (error) throw new Error(error.message);
      const createdScout = created as { id: string };
      if (scoutCreateForm.current_rank_id) {
        for (const rank of requiredRanks) await saveScoutRankHistory(createdScout.id, organizationId, rank.id, scoutCreateForm.rank_approval_dates[rank.id]);
        const { error: rankError } = await supabase.from("scouts").update({ current_rank_id: scoutCreateForm.current_rank_id }).eq("id", createdScout.id).eq("organization_id", organizationId);
        if (rankError) throw new Error(rankError.message);
      }
      setScoutCreateOpen(false);
      setKeyword(""); setStatusFilter("active"); setReadinessFilter("all"); setRankFilter("");
      await loadData();
      setSelectedScoutId(createdScout.id); setActiveTab("overview");
    } catch (error) {
      setScoutCreateError(error instanceof Error ? `대원 등록에 실패했습니다. ${error.message}` : "대원 등록에 실패했습니다.");
    } finally { setScoutCreateSubmitting(false); }
  };

  useEffect(() => {
    if (!badgeFormMode && !programFormMode && !scoutCreateOpen && !excelImportOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [badgeFormMode, programFormMode, scoutCreateOpen, excelImportOpen]);

  return (
    <div>
      <div style={pageHeaderStyle}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}><h1 style={pageTitleStyle}>대원 통합관리</h1><PageHelpButton title="대원 통합관리" description="대원별 진급 준비상태와 활동기록을 한 화면에서 확인합니다." sections={[{ title: "사용 순서", content: "왼쪽에서 대원을 선택하고 종합현황을 확인한 뒤 필요한 탭으로 이동합니다." },{ title: "주의사항", content: "판정 결과보다 현재 실제 기능장·프로그램·출석 기록을 우선 확인합니다." }]} /></div>
          <p style={pageDescriptionStyle}>
            대원을 선택해 현재 진급 상태를 확인하고, 필요한 기록을 탭별로 관리합니다.
          </p>
        </div>

        <div style={headerActionStyle}>
          {data.profile && (
            <span style={roleBadgeStyle}>{ROLE_LABELS[data.profile.role]}</span>
          )}
          <button type="button" style={secondaryButtonStyle} onClick={loadData}>
            새로고침
          </button>
        </div>
      </div>

      {showUsageGuide && (
        <section
          style={{
            display: "grid",
            gap: usageGuideExpanded ? "10px" : "0",
            padding: usageGuideExpanded ? "14px 16px" : "10px 14px",
            marginBottom: "16px",
            border: "1px solid #bfdbfe",
            borderRadius: "12px",
            backgroundColor: "#eff6ff",
          }}
          aria-label="대원 통합관리 사용 안내"
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <div>
              <strong style={{ color: "#1e3a8a", fontSize: "14px" }}>
                처음 사용하는 방법
              </strong>
              {!usageGuideExpanded && (
                <span style={{ marginLeft: "8px", color: "#64748b", fontSize: "12px" }}>
                  대원 선택부터 기록 관리까지의 순서를 확인합니다.
                </span>
              )}
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                style={{
                  border: "1px solid #93c5fd",
                  borderRadius: "8px",
                  backgroundColor: "#ffffff",
                  color: "#1d4ed8",
                  padding: "6px 10px",
                  fontWeight: 800,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
                onClick={() => setUsageGuideExpanded((current) => !current)}
                aria-expanded={usageGuideExpanded}
              >
                {usageGuideExpanded ? "접기" : "펼쳐보기"}
              </button>
              {usageGuideExpanded && (
                <button
                  type="button"
                  style={{
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    backgroundColor: "#ffffff",
                    color: "#475569",
                    padding: "6px 10px",
                    fontWeight: 800,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                  onClick={handleDismissUsageGuide}
                >
                  다시 표시하지 않기
                </button>
              )}
            </div>
          </div>

          {usageGuideExpanded && (
            <div style={{ display: "grid", gap: "8px" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
                  gap: "8px 16px",
                  color: "#334155",
                  fontSize: "14px",
                  lineHeight: 1.55,
                }}
              >
                <span><b>1.</b> 왼쪽에서 대원을 선택합니다.</span>
                <span><b>2.</b> 상단에서 현재 진급 상태와 보완 건수를 확인합니다.</span>
                <span><b>3.</b> 필요한 업무는 진급·기능장·프로그램·출석 탭에서 처리합니다.</span>
              </div>
              <span style={{ color: "#64748b", fontSize: "13px" }}>
                대원 등록·기본정보 수정은 대원 관리에서, 진급 준비와 활동 기록 관리는 이 화면에서 진행합니다.
              </span>
            </div>
          )}
        </section>
      )}

      {isSuperAdmin && (
        <section
          style={{
            ...searchAreaStyle,
            marginBottom: "16px",
            display: "grid",
            gridTemplateColumns: "minmax(260px, 420px) 1fr",
            alignItems: "end",
            gap: "16px",
          }}
          aria-label="소속대 선택"
        >
          <label style={{ display: "grid", gap: "7px", fontWeight: 800, color: "#334155" }}>
            소속대 선택
            <select
              style={selectStyle}
              value={selectedOrganizationId}
              onChange={(event) => {
                const organizationId = event.target.value;
                setSelectedOrganizationId(organizationId);
                setKeyword("");
                setStatusFilter("active");
                setReadinessFilter("all");
                setRankFilter("");
                setActiveTab("overview");

                if (!organizationId) {
                  setSelectedScoutId("");
                  const nextParams = new URLSearchParams(searchParams);
                  nextParams.delete("scoutId");
                  setSearchParams(nextParams, { replace: true });
                  return;
                }

                const firstScout =
                  data.scouts.find(
                    (scout) =>
                      scout.organization_id === organizationId &&
                      scout.status === "active",
                  ) ??
                  data.scouts.find(
                    (scout) => scout.organization_id === organizationId,
                  );

                setSelectedScoutId(firstScout?.id ?? "");
                const nextParams = new URLSearchParams(searchParams);
                if (firstScout) nextParams.set("scoutId", firstScout.id);
                else nextParams.delete("scoutId");
                setSearchParams(nextParams, { replace: true });
              }}
            >
              <option value="">전체 소속대 요약</option>
              {data.organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>
          <div style={{ color: "#64748b", fontSize: "14px", lineHeight: 1.6 }}>
            {selectedOrganizationId
              ? `${organizationMap.get(selectedOrganizationId) ?? "선택 소속대"} 대원을 조회하고 관리합니다.`
              : "전체 소속대에서는 요약 현황만 표시합니다. 개별 대원 관리는 소속대를 선택한 후 진행하세요."}
          </div>
        </section>
      )}

      {errorMessage && <div style={errorBoxStyle}>{errorMessage}</div>}

      <section style={summaryCardGridStyle} aria-label="대원 진급 준비 요약">
        <SummaryFilterCard
          label="활동 대원"
          count={summaryCounts.all}
          description="현재 활동 중인 대원"
          tone="neutral"
          selected={readinessFilter === "all"}
          onClick={() => {
            setStatusFilter("active");
            setReadinessFilter("all");
          }}
        />
        <SummaryFilterCard
          label="진급 가능"
          count={summaryCounts.ready}
          description="현재 조건을 모두 충족"
          tone="success"
          selected={readinessFilter === "ready"}
          onClick={() => {
            setStatusFilter("active");
            setReadinessFilter("ready");
          }}
        />
        <SummaryFilterCard
          label="조건 보완"
          count={summaryCounts.needs_attention}
          description="기간·기능장 등 보완 필요"
          tone="danger"
          selected={readinessFilter === "needs_attention"}
          onClick={() => {
            setStatusFilter("active");
            setReadinessFilter("needs_attention");
          }}
        />
        <SummaryFilterCard
          label="오늘 확인"
          count={summaryCounts.action_needed}
          description="판정 또는 보완 조치 필요"
          tone="warning"
          selected={readinessFilter === "action_needed"}
          onClick={() => {
            setStatusFilter("active");
            setReadinessFilter("action_needed");
          }}
        />
      </section>

      {isSuperAdmin && !selectedOrganizationId ? (
        <section style={emptyDetailStyle}>
          <h2 style={panelTitleStyle}>소속대를 선택하세요</h2>
          <p style={panelDescriptionStyle}>
            전체 소속대 요약을 확인한 뒤, 상단에서 소속대를 선택하면 해당 대원의 통합관리 화면이 표시됩니다.
          </p>
        </section>
      ) : (
      <div
        style={{
          ...workspaceStyle,
          ...(scoutListCollapsed ? collapsedWorkspaceStyle : {}),
        }}
      >
        <aside
          style={{
            ...scoutPanelStyle,
            ...(scoutListCollapsed ? collapsedScoutPanelStyle : {}),
          }}
        >
          <div
            style={{
              ...panelHeaderStyle,
              ...(scoutListCollapsed ? collapsedScoutPanelHeaderStyle : {}),
            }}
          >
            {scoutListCollapsed ? (
              <span style={collapsedScoutPanelLabelStyle}>대원</span>
            ) : (
              <div>
                <h2 style={panelTitleStyle}>대원 목록</h2>
                <p style={panelDescriptionStyle}>
                  현재 {filteredScouts.length}명
                </p>
              </div>
            )}

            <div style={panelHeaderActionStyle}>
              {!scoutListCollapsed && canManageScouts && (
                <div ref={registrationMenuRef} style={registrationMenuWrapStyle}>
                  <button
                    type="button"
                    style={registrationMenuButtonStyle}
                    onClick={() => setRegistrationMenuOpen((current) => !current)}
                    aria-haspopup="menu"
                    aria-expanded={registrationMenuOpen}
                  >
                    + 등록 <span aria-hidden="true">▾</span>
                  </button>
                  {registrationMenuOpen && (
                    <div style={registrationMenuStyle} role="menu">
                      <button
                        type="button"
                        style={registrationMenuItemStyle}
                        onClick={() => {
                          setRegistrationMenuOpen(false);
                          handleOpenScoutCreate();
                        }}
                        role="menuitem"
                      >
                        <strong>대원 직접 등록</strong>
                        <span style={registrationMenuItemDescriptionStyle}>한 명의 기본정보와 현재급위를 등록합니다.</span>
                      </button>
                      <button
                        type="button"
                        style={registrationMenuItemStyle}
                        onClick={() => {
                          setRegistrationMenuOpen(false);
                          setExcelImportOpen(true);
                        }}
                        role="menuitem"
                      >
                        <strong>엑셀 일괄등록</strong>
                        <span style={registrationMenuItemDescriptionStyle}>현재 화면에서 여러 대원을 한 번에 등록·수정합니다.</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                style={scoutPanelCollapseButtonStyle}
                onClick={() => {
                  setRegistrationMenuOpen(false);
                  setScoutListCollapsed((current) => !current);
                }}
                aria-label={scoutListCollapsed ? "대원 목록 펼치기" : "대원 목록 접기"}
                title={scoutListCollapsed ? "대원 목록 펼치기" : "대원 목록 접기"}
              >
                {scoutListCollapsed ? "≫" : "≪"}
              </button>
            </div>
          </div>

          {!scoutListCollapsed && (
          <>
          <div style={searchAreaStyle}>
            <input
              style={searchInputStyle}
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="이름·대원번호·학교 검색"
            />

            <div style={filterGridStyle}>
              <select
                style={selectStyle}
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as StatusFilter);
                  setReadinessFilter("all");
                }}
              >
                <option value="active">활동 대원</option>
                <option value="all">전체 상태</option>
                <option value="inactive">비활동</option>
                <option value="graduated">졸업</option>
              </select>

              <select
                style={selectStyle}
                value={rankFilter}
                onChange={(event) => setRankFilter(event.target.value)}
              >
                <option value="">전체 급위</option>
                {data.ranks.map((rank) => (
                  <option key={rank.id} value={rank.id}>
                    {rank.rank_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={scoutListStyle}>
            {loading ? (
              <div style={emptyStateStyle}>
                대원 목록을 불러오는 중입니다...
              </div>
            ) : filteredScouts.length === 0 ? (
              <div style={emptyStateStyle}>
                검색 조건에 해당하는 대원이 없습니다.
              </div>
            ) : (
              filteredScouts.map((scout) => {
                const isSelected = selectedScoutId === scout.id;
                const rankName = scout.current_rank_id
                  ? (rankMap.get(scout.current_rank_id)?.rank_name ??
                    "급위 확인 필요")
                  : "급위 미등록";
                const readiness = scoutReadinessMap.get(scout.id) ?? null;
                const readinessLabel =
                  readiness?.status === "ready"
                    ? "● 진급 가능"
                    : readiness?.status === "needs_attention"
                      ? "● 조건 보완"
                      : "● 판정 필요";

                return (
                  <button
                    key={scout.id}
                    data-scout-id={scout.id}
                    type="button"
                    style={{
                      ...scoutItemStyle,
                      ...(isSelected ? selectedScoutItemStyle : {}),
                    }}
                    onClick={() => handleSelectScout(scout.id)}
                    aria-pressed={isSelected}
                  >
                    <div style={scoutItemTopStyle}>
                      <strong style={scoutNameStyle}>{scout.name}</strong>
                      <span
                        style={getReadinessBadgeStyle(
                          readiness?.status ?? "review_needed",
                        )}
                      >
                        {readinessLabel}
                      </span>
                    </div>
                    <div style={scoutRankFlowStyle}>
                      <strong>{rankName}</strong>
                      <span>→</span>
                      <strong>
                        {readiness?.targetRank?.rank_name ?? "다음급 확인"}
                      </strong>
                    </div>
                    <div style={scoutItemMetaStyle}>
                      {readiness?.missingLabels.length
                        ? `보완 ${readiness.missingLabels.length}건`
                        : readiness?.latestReview?.available_at
                          ? `예상 진급일 ${formatDate(readiness.latestReview.available_at)}`
                          : (scout.member_no ?? "대원번호 미등록")}
                    </div>
                  </button>
                );
              })
            )}
          </div>
          </>
          )}
        </aside>

        <main style={detailPanelStyle}>
          {!selectedScout ? (
            <section style={emptyDetailStyle}>
              <h2 style={panelTitleStyle}>대원을 선택하세요</h2>
              <p style={panelDescriptionStyle}>
                왼쪽 목록에서 대원을 선택하면 통합 현황이 표시됩니다.
              </p>
            </section>
          ) : (
            <>
              <section style={profileCardStyle}>
                <div style={profileHeaderStyle}>
                  <div>
                    <div style={profileTitleRowStyle}>
                      <h2 style={profileNameStyle}>{selectedScout.name}</h2>
                      <span style={getStatusStyle(selectedScout.status)}>
                        {STATUS_LABELS[selectedScout.status]}
                      </span>
                    </div>
                    <p style={profileMetaStyle}>
                      {selectedScout.member_no ?? "대원번호 미등록"} ·{" "}
                      {organizationMap.get(selectedScout.organization_id) ??
                        "소속대 확인 필요"}
                    </p>
                  </div>
                </div>

                {selectedReadiness && (
                  <div
                    style={selectedReadinessBannerStyle(
                      selectedReadiness.status,
                    )}
                  >
                    <div>
                      <span style={selectedReadinessEyebrowStyle}>
                        다음 진급 준비 상태
                      </span>
                      <strong style={selectedReadinessTitleStyle}>
                        {selectedReadiness.status === "ready"
                          ? "현재 진급 가능"
                          : selectedReadiness.status === "needs_attention"
                            ? `현재 진급 불가 · 보완 ${selectedReadiness.missingLabels.length}건`
                            : "진급 판정 필요"}
                      </strong>
                      <span style={selectedReadinessDetailStyle}>
                        {currentRankName} → {targetRankName}
                        {selectedReadiness.missingLabels.length > 0
                          ? ` · 확인: ${selectedReadiness.missingLabels.join(", ")}`
                          : selectedReadiness.latestReview?.available_at
                            ? ` · 예상 진급일 ${formatDate(selectedReadiness.latestReview.available_at)}`
                            : ""}
                      </span>
                    </div>
                    <button
                      type="button"
                      style={selectedReadinessActionStyle}
                      onClick={() => setActiveTab("advancement")}
                    >
                      진급 업무 확인
                    </button>
                  </div>
                )}

                <div>
                  <div style={{ margin: "10px 0 6px", fontSize: "13px", fontWeight: 800, color: "#475569" }}>진급조건 체크</div>
                  <div style={{ ...readinessProgressGridStyle, gap: "6px" }}> 
                  <ReadinessProgressItem
                    label="활동기간"
                    passed={selectedReadiness?.periodPassed ?? false}
                    pending={!selectedReadiness?.latestReview}
                    detail={
                      selectedReadiness?.latestReview
                        ? selectedReadiness.periodPassed
                          ? "충족"
                          : formatDate(
                              selectedReadiness.latestReview.available_at,
                            )
                        : "판정 필요"
                    }
                  />
                  <ReadinessProgressItem
                    label="필수 기능장"
                    passed={selectedReadiness?.requiredPassed ?? false}
                    detail={
                      selectedReadiness
                        ? `${selectedReadiness.stageSummary.requiredOwned}/${selectedReadiness.stageSummary.requiredTotal}개`
                        : "-"
                    }
                  />
                  <ReadinessProgressItem
                    label="일반 기능장"
                    passed={selectedReadiness?.generalPassed ?? false}
                    detail={
                      selectedReadiness
                        ? `${selectedReadiness.stageSummary.generalOwned}/${selectedReadiness.stageSummary.generalRequired}개`
                        : "-"
                    }
                  />
                  <ReadinessProgressItem
                    label="프로그램"
                    passed={selectedReadiness?.programPassed ?? false}
                    pending={!selectedReadiness?.isBeomTarget}
                    detail={
                      selectedReadiness?.isBeomTarget
                        ? selectedReadiness.programPassed
                          ? "충족"
                          : "미이수"
                        : "해당 없음"
                    }
                  />
                  <ReadinessProgressItem
                    label="출석"
                    passed={selectedReadiness?.attendancePassed ?? false}
                    pending={
                      !selectedReadiness?.isBeomTarget ||
                      !selectedReadiness?.attendanceRequiredForBeom
                    }
                    detail={
                      !selectedReadiness?.isBeomTarget
                        ? "해당 없음"
                        : !selectedReadiness.attendanceRequiredForBeom
                          ? "참고 지표"
                          : selectedReadiness.attendanceSummary.rate === null
                            ? "기록 없음"
                            : `${selectedReadiness.attendanceSummary.rate}%`
                    }
                  />
                  </div>
                </div>

                <div
                  style={{
                    ...profileInfoGridStyle,
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    gap: "8px",
                  }}
                >
                  <InfoItem
                    label="학교/학년"
                    value={
                      [selectedScout.school_name, selectedScout.grade]
                        .filter(Boolean)
                        .join(" / ") || "-"
                    }
                  />
                  <InfoItem label="현재 → 다음" value={`${currentRankName} → ${targetRankName}`} />
                  <InfoItem
                    label="예상 진급일"
                    value={formatDate(latestReview?.available_at)}
                  />
                  <InfoItem
                    label="출석률"
                    value={
                      attendanceSummary.rate === null
                        ? "-"
                        : `${attendanceSummary.rate}%`
                    }
                  />
                </div>
              </section>

              {selectedReadiness && (
                <section style={compactPriorityStyle}>
                  <div style={compactPriorityHeaderStyle}>
                    <h3 style={compactPriorityTitleStyle}>지금 확인할 사항</h3>
                    <span style={compactPriorityCountStyle}>
                      {selectedReadiness.missingLabels.length > 0
                        ? `${selectedReadiness.missingLabels.length}건`
                        : "이상 없음"}
                    </span>
                  </div>

                  <div style={compactPriorityListStyle}>
                    {selectedReadiness.missingLabels.length > 0 ? (
                      selectedReadiness.missingLabels.map((label) => {
                        const targetTab: DetailTab =
                          label === "진급 판정" || label === "활동기간"
                            ? "advancement"
                            : label.includes("기능장")
                              ? "badges"
                              : label === "프로그램"
                                ? "programs"
                                : "attendance";

                        return (
                          <button
                            key={`priority-${label}`}
                            type="button"
                            style={compactPriorityItemStyle}
                            onClick={() => setActiveTab(targetTab)}
                          >
                            <span>{label} 확인이 필요합니다.</span>
                            <span style={compactPriorityMoveStyle}>확인</span>
                          </button>
                        );
                      })
                    ) : (
                      <div style={compactPriorityItemStyle}>
                        <span>현재 우선 확인이 필요한 항목이 없습니다.</span>
                        <span style={compactPriorityMoveStyle}>정상</span>
                      </div>
                    )}
                  </div>
                </section>
              )}

              <RankProgressOverview
                scout={selectedScout}
                ranks={data.ranks}
                histories={selectedRankHistories}
                targetRank={selectedReadiness?.targetRank ?? null}
              />

              <section
                style={{
                  margin: "12px 0 10px",
                  padding: "12px 14px 10px",
                  border: "1px solid #dbe3ee",
                  borderRadius: "12px",
                  backgroundColor: "#ffffff",
                }}
                aria-labelledby="scout-management-tabs-title"
              >
                <div style={{ marginBottom: "8px" }}>
                  <h3
                    id="scout-management-tabs-title"
                    style={{ margin: 0, color: "#0f172a", fontSize: "16px", fontWeight: 900 }}
                  >
                    대원 관리 항목
                  </h3>
                  <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "12px", lineHeight: 1.45 }}>
                    선택한 대원의 종합현황을 확인하거나 진급·기능장·프로그램·출석 기록을 관리합니다.
                  </p>
                </div>

                <nav style={{ ...tabBarStyle, margin: 0 }} aria-label="대원 통합관리 상세 탭">
                  {TAB_OPTIONS.map((tab) => (
                    <button
                      key={tab.value}
                      type="button"
                      style={{
                        ...tabButtonStyle,
                        ...(activeTab === tab.value ? activeTabButtonStyle : {}),
                      }}
                      onClick={() => setActiveTab(tab.value)}
                      aria-pressed={activeTab === tab.value}
                    >
                      {tab.label}
                    </button>
                  ))}
                </nav>
              </section>

              {activeTab === "overview" && (
                <OverviewPanel
                  scout={selectedScout}
                  ranks={data.ranks}
                  rankRequirements={data.rankRequirements}
                  rankRequiredBadges={data.rankRequiredBadges}
                  latestReview={latestReview}
                  histories={selectedRankHistories}
                  scoutBadges={selectedScoutBadges}
                  badgeMap={badgeMap}
                  programs={selectedPrograms}
                  attendanceRows={selectedAttendance}
                  attendanceRate={attendanceSummary.rate}
                  attendanceRequiredForBeom={Boolean(
                    organizationAttendanceRequiredMap.get(selectedScout.organization_id),
                  )}
                  onMoveToAdvancement={() => setActiveTab("advancement")}
                  onMoveToBadges={() => setActiveTab("badges")}
                  onMoveToPrograms={() => setActiveTab("programs")}
                  onMoveToAttendance={() => setActiveTab("attendance")}
                  showPriority={false}
                />
              )}

              {activeTab === "advancement" && (
                <AdvancementPanel
                  scout={selectedScout}
                  ranks={data.ranks}
                  rankRequirements={data.rankRequirements}
                  rankRequiredBadges={data.rankRequiredBadges}
                  latestReview={latestReview}
                  histories={selectedRankHistories}
                  scoutBadges={selectedScoutBadges}
                  badgeMap={badgeMap}
                  programs={selectedPrograms}
                  attendanceRows={selectedAttendance}
                  attendanceRequiredForBeom={Boolean(
                    organizationAttendanceRequiredMap.get(selectedScout.organization_id),
                  )}
                  canManage={canManageAdvancements}
                  reviewDate={promotionReviewDate}
                  approvalDate={promotionApprovalDate}
                  approvalNote={promotionApprovalNote}
                  reviewSubmitting={promotionReviewSubmitting}
                  approvalSubmitting={promotionApprovalSubmitting}
                  reviewError={promotionReviewError}
                  approvalError={promotionApprovalError}
                  actionMessage={promotionActionMessage}
                  onReviewDateChange={setPromotionReviewDate}
                  onApprovalDateChange={setPromotionApprovalDate}
                  onApprovalNoteChange={setPromotionApprovalNote}
                  onRunReview={handleRunPromotionReview}
                  onApprove={handleApprovePromotion}
                />
              )}

              {activeTab === "badges" && (
                <BadgePanel
                  scout={selectedScout}
                  ranks={data.ranks}
                  rankRequirements={data.rankRequirements}
                  rankRequiredBadges={data.rankRequiredBadges}
                  scoutBadges={selectedScoutBadges}
                  badgeMap={badgeMap}
                  categoryMap={categoryMap}
                  usedScoutBadgeIdSet={usedScoutBadgeIdSet}
                  canManage={canManageBadges}
                  formError={badgeFormError}
                  deletingId={badgeDeletingId}
                  onCreate={handleOpenCreateBadge}
                  onEdit={handleOpenEditBadge}
                  onDelete={handleDeleteBadge}
                />
              )}

              {activeTab === "programs" && (
                <ProgramPanel
                  completions={selectedPrograms}
                  canManage={canManagePrograms}
                  actionMessage={programActionMessage}
                  errorMessage={programFormError}
                  deletingId={programDeletingId}
                  onCreate={handleOpenCreateProgram}
                  onEdit={handleOpenEditProgram}
                  onDelete={handleDeleteProgram}
                />
              )}

              {activeTab === "attendance" && (
                <AttendancePanel rows={selectedAttendance} />
              )}
            </>
          )}
        </main>
      </div>
      )}

      {excelImportOpen && data.profile && (
        <ScoutExcelImportDrawer
          profile={data.profile}
          organizations={data.organizations}
          ranks={data.ranks}
          badges={data.badges}
          onClose={() => setExcelImportOpen(false)}
          onCompleted={async (selectedId) => {
            setExcelImportOpen(false);
            setKeyword("");
            setStatusFilter("active");
            setReadinessFilter("all");
            setRankFilter("");
            await loadData();
            if (selectedId) {
              setSelectedScoutId(selectedId);
              setActiveTab("overview");
            }
          }}
        />
      )}

      {scoutCreateOpen && data.profile && (
        <ScoutCreateDrawer
          profile={data.profile}
          organizations={data.organizations}
          ranks={data.ranks}
          gradeOptions={GRADE_OPTIONS}
          form={scoutCreateForm}
          requiredRanks={getRequiredRankHistoryRanks(scoutCreateForm.current_rank_id)}
          errorMessage={scoutCreateError}
          submitting={scoutCreateSubmitting}
          onFormChange={setScoutCreateForm}
          onRankChange={handleScoutCreateRankChange}
          onClose={handleCloseScoutCreate}
          onSubmit={handleCreateScout}
        />
      )}

      {programFormMode && selectedScout && (
        <ProgramDrawer
          mode={programFormMode}
          scout={selectedScout}
          form={programForm}
          errorMessage={programFormError}
          submitting={programSubmitting}
          onFormChange={setProgramForm}
          onClose={handleCloseProgramForm}
          onSubmit={handleSaveProgram}
        />
      )}

      {badgeFormMode && selectedScout && (
        <BadgeDrawer
          mode={badgeFormMode}
          scout={selectedScout}
          form={badgeForm}
          errorMessage={badgeFormError}
          submitting={badgeSubmitting}
          ranks={data.ranks}
          histories={selectedRankHistories}
          rankRequirements={data.rankRequirements}
          rankRequiredBadges={data.rankRequiredBadges}
          badges={data.badges}
          badgeCategories={data.badgeCategories}
          scoutBadges={selectedScoutBadges}
          stageSummary={getStageBadgeSummary(
            selectedScout,
            data.ranks,
            data.rankRequirements,
            data.rankRequiredBadges,
            selectedScoutBadges,
            badgeMap,
          )}
          stageRules={buildRequiredBadgeStageRules(
            data.ranks,
            data.rankRequirements,
            data.rankRequiredBadges,
            badgeMap,
          )}
          onFormChange={(nextForm) => setBadgeForm(nextForm)}
          onClose={handleCloseBadgeForm}
          onSubmit={handleSaveBadge}
        />
      )}
    </div>
  );
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
