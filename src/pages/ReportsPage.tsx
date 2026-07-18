import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, KeyboardEvent } from "react";
import { EmptyState, PageHelpButton } from "../components/common/CommonFeedback";
import { supabase } from "../lib/supabase";

type UserRole = "super_admin" | "org_admin" | "leader" | "viewer";
type ScoutStatus = "active" | "inactive" | "graduated";
type ReportType =
  | "rank_approval"
  | "badge_approval"
  | "rank_history"
  | "beom_application"
  | "rank_certificate";
type AttendanceStatus =
  | "present"
  | "recognized"
  | "late"
  | "early_leave"
  | "absent"
  | "not_entered";
type ProgramType = "WSEP" | "MoP";

type UserProfile = {
  role: UserRole;
  organization_id: string | null;
};

type Organization = {
  id: string;
  name: string;
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

type RankHistory = {
  id: string;
  organization_id: string;
  scout_id: string;
  rank_id: string;
  approved_at: string;
  approval_type: string;
  note: string | null;
};

type BadgeCategory = {
  id: string;
  name: string;
  sort_order: number;
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
};

type ProgramCompletion = {
  id: string;
  organization_id: string;
  scout_id: string;
  program_type: ProgramType;
  completed_at: string;
  certificate_no: string | null;
  approved_at: string | null;
  note: string | null;
};

type Meeting = {
  id: string;
  organization_id: string;
  meeting_date: string;
  title: string;
  meeting_type: string;
  is_attendance_target: boolean;
  note: string | null;
};

type AttendanceRecord = {
  id: string;
  organization_id: string;
  meeting_id: string;
  scout_id: string;
  status: AttendanceStatus;
  note: string | null;
};

type RankReportRow = {
  id: string;
  organizationName: string;
  scoutName: string;
  memberNo: string;
  previousRankName: string;
  approvedRankName: string;
  approvedAt: string;
};

type BadgeReportRow = {
  id: string;
  organizationName: string;
  scoutName: string;
  memberNo: string;
  currentRankName: string;
  badgeName: string;
  badgeCategoryName: string;
  approvedAt: string;
};

type RankHistoryReportRow = {
  id: string;
  organizationName: string;
  scoutName: string;
  memberNo: string;
  schoolName: string;
  grade: string;
  joinedAt: string;
  currentRankName: string;
  statusLabel: string;
  rankApprovedAtByRankId: Record<string, string>;
};

type ReportTargetPreviewRow = {
  id: string;
  memberNo: string;
  scoutName: string;
  organizationName: string;
  reportContent: string;
  standardDate: string;
  note: string;
};

type ReportFooterSettings = {
  reportDate: string;
  districtAssociationName: string;
  unitName: string;
  leaderName: string;
  federationName: string;
};

type BeomApplicationManualFields = {
  photoDataUrl: string;
  birthDate: string;
  address: string;
  specialty: string;
  email: string;
  phone: string;
  serviceCareerMonths: string;
  juniorLeaderTrainingCount: string;
  volunteerHours: string;
  applicationDate: string;
  unitLeaderName: string;
  sponsorRepresentativeName: string;
  interviewChairName: string;
};

type BeomApplicationData = {
  scout: Scout;
  organizationName: string;
  manual: BeomApplicationManualFields;
  rankDateByLabel: Record<string, string>;
  totalPromotionMonths: number | null;
  requiredBadgeRows: Array<{ group: string; badgeName: string; approvedAt: string }>;
  generalBadgeRows: Array<{ categoryName: string; badgeName: string; approvedAt: string }>;
  program: ProgramCompletion | null;
  attendanceRate: number | null;
  attendanceTotalCount: number;
  attendancePresentCount: number;
};

const REPORT_FOOTER_SETTINGS_STORAGE_KEY = "scout_report_footer_settings_v1";
const BEOM_APPLICATION_INPUTS_STORAGE_KEY = "scout_beom_application_inputs_v1";

const REPORT_ASSET_BASE_PATH = "/report-assets";
const SCOUT_SYMBOL_IMAGE_SRC = `${REPORT_ASSET_BASE_PATH}/scout-symbol.png`;
const BEOM_MEDAL_IMAGE_SRC = `${REPORT_ASSET_BASE_PATH}/beom-medal.png`;
const BEOM_PATCH_IMAGE_SRC = `${REPORT_ASSET_BASE_PATH}/beom-patch.png`;
const CERTIFICATE_IMAGE_SRC_BY_KEY: Record<string, string> = {
  chogeup: `${REPORT_ASSET_BASE_PATH}/certificate_chogeup.jpg`,
  rank2: `${REPORT_ASSET_BASE_PATH}/certificate_2nd.jpg`,
  rank1: `${REPORT_ASSET_BASE_PATH}/certificate_1st.jpg`,
  star: `${REPORT_ASSET_BASE_PATH}/certificate_star.jpg`,
  mugunghwa: `${REPORT_ASSET_BASE_PATH}/certificate_mugunghwa.jpg`,
};

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

const REPORT_TYPE_OPTIONS: Array<{ value: ReportType; label: string }> = [
  { value: "rank_approval", label: "진급 인가 보고서" },
  { value: "badge_approval", label: "기능장 인가 보고서" },
  { value: "rank_history", label: "대원별 진급 이력표" },
  { value: "beom_application", label: "범스카우트 진급 신청서" },
  { value: "rank_certificate", label: "진급 인증서" },
];

const REPORT_TYPE_GUIDES: Record<
  ReportType,
  {
    purpose: string;
    standard: string;
    outputRule: string;
  }
> = {
  rank_approval: {
    purpose: "기간 내 진급 인가 기록을 연맹 보고용 양식으로 출력합니다.",
    standard: "진급 인가일 기준",
    outputRule: "선택한 인가 기록만 보고서에 포함됩니다.",
  },
  badge_approval: {
    purpose: "기간 내 기능장 인가 기록을 연맹 보고용 양식으로 출력합니다.",
    standard: "기능장 인가일 기준",
    outputRule: "인가일이 등록된 기능장 기록만 출력할 수 있습니다.",
  },
  rank_history: {
    purpose: "대원별 급위 인가 이력을 한 표에서 확인하고 출력합니다.",
    standard: "현재 실제 인가 기록 기준",
    outputRule: "선택한 소속과 검색 조건에 맞는 대원을 출력합니다.",
  },
  beom_application: {
    purpose: "범스카우트 진급 신청에 필요한 인적사항·진급·기능장·프로그램·출석 자료를 확인합니다.",
    standard: "현재 등록된 대원 기록 기준",
    outputRule: "누락 항목을 확인한 뒤 대원 1명 단위로 출력합니다.",
  },
  rank_certificate: {
    purpose: "진급 인가 기록을 급위별 인증서 원본 양식에 반영하여 출력합니다.",
    standard: "진급 인가일 기준",
    outputRule: "초급·2급·1급·별·무궁화만 지원하며 범 인증서는 제외합니다.",
  },
};

const ATTENDANCE_PASS_STATUSES: AttendanceStatus[] = [
  "present",
  "recognized",
  "late",
  "early_leave",
];

const BEOM_REQUIRED_BADGE_GROUPS: Array<{ group: string; badgeNames: string[] }> = [
  { group: "2급", badgeNames: ["시민장", "하이킹장"] },
  { group: "1급", badgeNames: ["야영장", "야외취사장", "측정지도장", "응급처치장"] },
  { group: "별", badgeNames: ["안전장", "전통예절장", "개척장"] },
  { group: "무궁화", badgeNames: ["수영장", "환경보전장", "세계우애장"] },
  { group: "범", badgeNames: ["학업장", "구조장", "생존장"] },
];

const BEOM_REQUIRED_BADGE_NAME_SET = new Set(
  BEOM_REQUIRED_BADGE_GROUPS.flatMap((group) => group.badgeNames),
);

function isUserRole(value: unknown): value is UserRole {
  return (
    value === "super_admin" ||
    value === "org_admin" ||
    value === "leader" ||
    value === "viewer"
  );
}

function getTodayText() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getYearStartText() {
  const today = new Date();
  return `${today.getFullYear()}-01-01`;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return value.slice(0, 10);
}

function formatDateBlank(value: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function isDateInRange(value: string | null, startDate: string, endDate: string) {
  if (!value) return false;

  const dateText = value.slice(0, 10);

  if (startDate && dateText < startDate) return false;
  if (endDate && dateText > endDate) return false;

  return true;
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

/** 진급·기능장 인가: 좌 20 + 우 20 = 40건/페이지 */
const RANK_APPROVAL_PAGE_SIZE = 40;
const BADGE_APPROVAL_PAGE_SIZE = 40;
const APPROVAL_TABLE_ROW_COUNT = 20;
/** 대원별 진급 이력표: 20명/페이지 */
const RANK_HISTORY_PAGE_SIZE = 20;

function getCurrentYearText() {
  return String(new Date().getFullYear());
}

function getDefaultReportFooterSettings(): ReportFooterSettings {
  return {
    reportDate: getTodayText(),
    districtAssociationName: "",
    unitName: "",
    leaderName: "",
    federationName: "한국스카우트 00연맹장",
  };
}

function loadReportFooterSettings(): ReportFooterSettings {
  if (typeof window === "undefined") {
    return getDefaultReportFooterSettings();
  }

  try {
    const storedValue = window.localStorage.getItem(
      REPORT_FOOTER_SETTINGS_STORAGE_KEY,
    );

    if (!storedValue) {
      return getDefaultReportFooterSettings();
    }

    const parsedValue = JSON.parse(storedValue) as Partial<ReportFooterSettings>;
    const defaultValue = getDefaultReportFooterSettings();

    return {
      reportDate:
        typeof parsedValue.reportDate === "string"
          ? parsedValue.reportDate
          : defaultValue.reportDate,
      districtAssociationName:
        typeof parsedValue.districtAssociationName === "string"
          ? parsedValue.districtAssociationName
          : defaultValue.districtAssociationName,
      unitName:
        typeof parsedValue.unitName === "string"
          ? parsedValue.unitName
          : defaultValue.unitName,
      leaderName:
        typeof parsedValue.leaderName === "string"
          ? parsedValue.leaderName
          : defaultValue.leaderName,
      federationName:
        typeof parsedValue.federationName === "string"
          ? parsedValue.federationName
          : defaultValue.federationName,
    };
  } catch (error) {
    console.error("보고서 하단 정보 불러오기 오류:", error);
    return getDefaultReportFooterSettings();
  }
}

function getDefaultBeomApplicationManualFields(): BeomApplicationManualFields {
  return {
    photoDataUrl: "",
    birthDate: "",
    address: "",
    specialty: "",
    email: "",
    phone: "",
    serviceCareerMonths: "",
    juniorLeaderTrainingCount: "",
    volunteerHours: "",
    applicationDate: getTodayText(),
    unitLeaderName: "",
    sponsorRepresentativeName: "",
    interviewChairName: "",
  };
}

function normalizeBeomManualFields(
  value: Partial<BeomApplicationManualFields> | undefined,
): BeomApplicationManualFields {
  const defaultValue = getDefaultBeomApplicationManualFields();

  return {
    photoDataUrl: typeof value?.photoDataUrl === "string" ? value.photoDataUrl : defaultValue.photoDataUrl,
    birthDate: typeof value?.birthDate === "string" ? value.birthDate : defaultValue.birthDate,
    address: typeof value?.address === "string" ? value.address : defaultValue.address,
    specialty: typeof value?.specialty === "string" ? value.specialty : defaultValue.specialty,
    email: typeof value?.email === "string" ? value.email : defaultValue.email,
    phone: typeof value?.phone === "string" ? value.phone : defaultValue.phone,
    serviceCareerMonths:
      typeof value?.serviceCareerMonths === "string"
        ? value.serviceCareerMonths
        : defaultValue.serviceCareerMonths,
    juniorLeaderTrainingCount:
      typeof value?.juniorLeaderTrainingCount === "string"
        ? value.juniorLeaderTrainingCount
        : defaultValue.juniorLeaderTrainingCount,
    volunteerHours:
      typeof value?.volunteerHours === "string"
        ? value.volunteerHours
        : defaultValue.volunteerHours,
    applicationDate:
      typeof value?.applicationDate === "string" && value.applicationDate
        ? value.applicationDate
        : defaultValue.applicationDate,
    unitLeaderName:
      typeof value?.unitLeaderName === "string"
        ? value.unitLeaderName
        : defaultValue.unitLeaderName,
    sponsorRepresentativeName:
      typeof value?.sponsorRepresentativeName === "string"
        ? value.sponsorRepresentativeName
        : defaultValue.sponsorRepresentativeName,
    interviewChairName:
      typeof value?.interviewChairName === "string"
        ? value.interviewChairName
        : defaultValue.interviewChairName,
  };
}

function loadBeomApplicationManualInputMap() {
  if (typeof window === "undefined") {
    return {} as Record<string, BeomApplicationManualFields>;
  }

  try {
    const storedValue = window.localStorage.getItem(
      BEOM_APPLICATION_INPUTS_STORAGE_KEY,
    );

    if (!storedValue) {
      return {} as Record<string, BeomApplicationManualFields>;
    }

    const parsedValue = JSON.parse(storedValue) as Record<
      string,
      Partial<BeomApplicationManualFields>
    >;
    const result: Record<string, BeomApplicationManualFields> = {};

    Object.entries(parsedValue).forEach(([scoutId, fields]) => {
      result[scoutId] = normalizeBeomManualFields(fields);
    });

    return result;
  } catch (error) {
    console.error("범스카우트 신청서 입력값 불러오기 오류:", error);
    return {} as Record<string, BeomApplicationManualFields>;
  }
}

function formatReportDate(value: string) {
  if (!value) {
    return `${getCurrentYearText()}년&nbsp;&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;&nbsp;일`;
  }

  const [year, month, day] = value.slice(0, 10).split("-");

  if (!year || !month || !day) {
    return `${getCurrentYearText()}년&nbsp;&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;&nbsp;일`;
  }

  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

function formatKoreanDate(value: string) {
  if (!value) return "202 년      월      일";

  const [year, month, day] = value.slice(0, 10).split("-");

  if (!year || !month || !day) return "202 년      월      일";

  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

function getReportFooterSignatureLine(settings: ReportFooterSettings) {
  const unitName = settings.unitName.trim() || "제&nbsp;&nbsp;&nbsp;&nbsp;대(단)";
  const leaderName = settings.leaderName.trim();
  const leaderText = leaderName ? `${leaderName}(인)` : "(인)";

  return `${unitName} 대장 ${leaderText}`;
}

function getReportFooterFederationLine(settings: ReportFooterSettings) {
  const federationName =
    settings.federationName.trim() || "한국스카우트 00연맹장";

  return `${federationName} 귀하`;
}

function getReportFooterActionText(reportType: ReportType) {
  if (reportType === "rank_approval") return "진급을 인가하고";
  if (reportType === "badge_approval") return "기능장 취득을 인가하고";
  if (reportType === "rank_history") return "대원별 진급 이력을 확인하고";
  if (reportType === "rank_certificate") return "진급 인증서를 출력하고";
  return "범스카우트 진급 신청 내용을 확인하고";
}

function getMonthsBetween(startDate: string | null, endDate: string | null) {
  if (!startDate || !endDate) return null;

  const [startYearText, startMonthText, startDayText] = startDate.slice(0, 10).split("-");
  const [endYearText, endMonthText, endDayText] = endDate.slice(0, 10).split("-");
  const startYear = Number(startYearText);
  const startMonth = Number(startMonthText);
  const startDay = Number(startDayText);
  const endYear = Number(endYearText);
  const endMonth = Number(endMonthText);
  const endDay = Number(endDayText);

  if (!startYear || !startMonth || !startDay || !endYear || !endMonth || !endDay) {
    return null;
  }

  let months = (endYear - startYear) * 12 + (endMonth - startMonth);

  if (endDay < startDay) {
    months -= 1;
  }

  return Math.max(months, 0);
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

function findRankByCandidates(ranks: Rank[], candidates: string[]) {
  const normalizedCandidates = candidates.map(normalizeText);

  return (
    ranks.find((rank) => {
      const code = normalizeText(rank.rank_code);
      const name = normalizeText(rank.rank_name);

      return normalizedCandidates.some(
        (candidate) => code.includes(candidate) || name.includes(candidate),
      );
    }) ?? null
  );
}

function getDisplayValue(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  return text.length > 0 ? text : "-";
}

function isBeomRankName(rankName: string) {
  const normalizedRankName = normalizeText(rankName);

  return (
    normalizedRankName.includes("범") ||
    normalizedRankName.includes("beom") ||
    normalizedRankName.includes("tiger")
  );
}

function isRankCertificateSupported(rankName: string) {
  return Boolean(getCertificateImageSrc(rankName));
}

function getCertificateImageSrc(rankName: string) {
  const normalizedRankName = normalizeText(rankName);

  if (isBeomRankName(rankName)) {
    return "";
  }

  if (normalizedRankName.includes("무궁화")) {
    return CERTIFICATE_IMAGE_SRC_BY_KEY.mugunghwa;
  }

  if (normalizedRankName.includes("별") || normalizedRankName.includes("star")) {
    return CERTIFICATE_IMAGE_SRC_BY_KEY.star;
  }

  if (normalizedRankName.includes("2급") || normalizedRankName.includes("rank2")) {
    return CERTIFICATE_IMAGE_SRC_BY_KEY.rank2;
  }

  if (normalizedRankName.includes("1급") || normalizedRankName.includes("rank1")) {
    return CERTIFICATE_IMAGE_SRC_BY_KEY.rank1;
  }

  if (normalizedRankName.includes("초급") || normalizedRankName.includes("beginner")) {
    return CERTIFICATE_IMAGE_SRC_BY_KEY.chogeup;
  }

  return "";
}

function getCertificateFieldFontSize(value: string, defaultSize: string, compactSize: string, narrowSize: string) {
  const normalizedLength = value.replace(/\s+/g, "").length;

  if (normalizedLength >= 14) return narrowSize;
  if (normalizedLength >= 10) return compactSize;
  return defaultSize;
}

function getCertificateDateText(value: string) {
  if (!value) {
    return "";
  }

  const [year, month, day] = value.slice(0, 10).split("-");

  if (!year || !month || !day) {
    return "";
  }

  return `${year} . ${Number(month)} . ${Number(day)}`;
}

function getRankApprovalTargetId(row: RankReportRow) {
  return `rank-target-${row.id}`;
}

function getRankCertificateTargetId(row: RankReportRow) {
  return `certificate-target-${row.id}`;
}

function getBadgeApprovalTargetId(row: BadgeReportRow) {
  return `badge-target-${row.id}`;
}

function getRankHistoryTargetId(row: RankHistoryReportRow) {
  return `history-target-${row.id}`;
}

function getBeomApplicationTargetId(data: BeomApplicationData) {
  return `beom-target-${data.scout.id}`;
}

export default function ReportsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [scouts, setScouts] = useState<Scout[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [rankHistories, setRankHistories] = useState<RankHistory[]>([]);
  const [badgeCategories, setBadgeCategories] = useState<BadgeCategory[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [scoutBadges, setScoutBadges] = useState<ScoutBadge[]>([]);
  const [programCompletions, setProgramCompletions] = useState<ProgramCompletion[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);

  const [reportType, setReportType] = useState<ReportType>("rank_approval");
  const [startDate, setStartDate] = useState(getYearStartText());
  const [endDate, setEndDate] = useState(getTodayText());
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [selectedRankId, setSelectedRankId] = useState("");
  const [selectedBadgeCategoryId, setSelectedBadgeCategoryId] = useState("");
  const [selectedBadgeId, setSelectedBadgeId] = useState("");
  const [selectedBeomScoutId, setSelectedBeomScoutId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [reportFooterSettings, setReportFooterSettings] =
    useState<ReportFooterSettings>(loadReportFooterSettings);
  const [beomApplicationManualInputMap, setBeomApplicationManualInputMap] =
    useState<Record<string, BeomApplicationManualFields>>(
      loadBeomApplicationManualInputMap,
    );

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isTargetPreviewOpen, setIsTargetPreviewOpen] = useState(false);
  const [selectedReportTargetIds, setSelectedReportTargetIds] = useState<string[]>([]);
  const [previewScale, setPreviewScale] = useState(1);
  const [previewScaledHeight, setPreviewScaledHeight] = useState<number | undefined>(undefined);
  const previewViewportRef = useRef<HTMLDivElement | null>(null);
  const previewScaleWrapperRef = useRef<HTMLDivElement | null>(null);

  const isSuperAdmin = profile?.role === "super_admin";
  const currentOrganizationFilter = isSuperAdmin
    ? selectedOrganizationId
    : profile?.organization_id ?? "";

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

    if (currentProfile.role !== "super_admin" && currentProfile.organization_id) {
      setSelectedOrganizationId(currentProfile.organization_id);
    }

    const { data: organizationData, error: organizationError } = await supabase
      .from("organizations")
      .select("id, name")
      .is("deleted_at", null)
      .order("name", { ascending: true });

    if (organizationError) {
      console.error("조직 목록 조회 오류:", organizationError.message);
      setErrorMessage("조직 목록을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

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

    const { data: categoryData, error: categoryError } = await supabase
      .from("badge_categories")
      .select("id, name, sort_order")
      .order("sort_order", { ascending: true });

    if (categoryError) {
      console.error("기능장 분류 조회 오류:", categoryError.message);
      setErrorMessage("기능장 분류를 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const { data: badgeData, error: badgeError } = await supabase
      .from("badges")
      .select(
        "id, category_id, name, is_required_badge, is_general_badge, special_rule, sort_order",
      )
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });

    if (badgeError) {
      console.error("기능장 목록 조회 오류:", badgeError.message);
      setErrorMessage("기능장 목록을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    let scoutQuery = supabase
      .from("scouts")
      .select(
        "id, organization_id, name, member_no, school_name, grade, joined_at, current_rank_id, status",
      )
      .is("deleted_at", null)
      .order("name", { ascending: true });

    let historyQuery = supabase
      .from("scout_rank_histories")
      .select("id, organization_id, scout_id, rank_id, approved_at, approval_type, note")
      .is("deleted_at", null)
      .order("approved_at", { ascending: true });

    let scoutBadgeQuery = supabase
      .from("scout_badges")
      .select(
        "id, organization_id, scout_id, badge_id, acquired_at, approved_at, instructor_name, leader_confirmed, note",
      )
      .is("deleted_at", null)
      .order("approved_at", { ascending: true, nullsFirst: false })
      .order("acquired_at", { ascending: true });

    let programCompletionQuery = supabase
      .from("program_completions")
      .select(
        "id, organization_id, scout_id, program_type, completed_at, certificate_no, approved_at, note",
      )
      .is("deleted_at", null)
      .order("approved_at", { ascending: true, nullsFirst: false })
      .order("completed_at", { ascending: true });

    let meetingQuery = supabase
      .from("meetings")
      .select(
        "id, organization_id, meeting_date, title, meeting_type, is_attendance_target, note",
      )
      .is("deleted_at", null)
      .order("meeting_date", { ascending: true });

    let attendanceQuery = supabase
      .from("attendance")
      .select("id, organization_id, meeting_id, scout_id, status, note")
      .is("deleted_at", null);

    if (currentProfile.role !== "super_admin") {
      if (!currentProfile.organization_id) {
        setErrorMessage("소속 정보가 없어 보고서 정보를 조회할 수 없습니다.");
        setLoading(false);
        return;
      }

      scoutQuery = scoutQuery.eq("organization_id", currentProfile.organization_id);
      historyQuery = historyQuery.eq("organization_id", currentProfile.organization_id);
      scoutBadgeQuery = scoutBadgeQuery.eq("organization_id", currentProfile.organization_id);
      programCompletionQuery = programCompletionQuery.eq(
        "organization_id",
        currentProfile.organization_id,
      );
      meetingQuery = meetingQuery.eq("organization_id", currentProfile.organization_id);
      attendanceQuery = attendanceQuery.eq("organization_id", currentProfile.organization_id);
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
      setErrorMessage("진급이력을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const { data: scoutBadgeData, error: scoutBadgeError } = await scoutBadgeQuery;

    if (scoutBadgeError) {
      console.error("대원 기능장 조회 오류:", scoutBadgeError.message);
      setErrorMessage("기능장 취득 기록을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const { data: programCompletionData, error: programCompletionError } =
      await programCompletionQuery;

    if (programCompletionError) {
      console.error("프로그램 이수 조회 오류:", programCompletionError.message);
      setErrorMessage("프로그램 이수 기록을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const { data: meetingData, error: meetingError } = await meetingQuery;

    if (meetingError) {
      console.error("집회 조회 오류:", meetingError.message);
      setErrorMessage("집회 기록을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const { data: attendanceData, error: attendanceError } = await attendanceQuery;

    if (attendanceError) {
      console.error("출석 조회 오류:", attendanceError.message);
      setErrorMessage("출석 기록을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    setOrganizations((organizationData ?? []) as Organization[]);
    setRanks((rankData ?? []) as Rank[]);
    setBadgeCategories((categoryData ?? []) as BadgeCategory[]);
    setBadges((badgeData ?? []) as Badge[]);
    setScouts((scoutData ?? []) as unknown as Scout[]);
    setRankHistories((historyData ?? []) as unknown as RankHistory[]);
    setScoutBadges((scoutBadgeData ?? []) as unknown as ScoutBadge[]);
    setProgramCompletions(
      (programCompletionData ?? []) as unknown as ProgramCompletion[],
    );
    setMeetings((meetingData ?? []) as unknown as Meeting[]);
    setAttendanceRecords((attendanceData ?? []) as unknown as AttendanceRecord[]);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.localStorage.setItem(
      REPORT_FOOTER_SETTINGS_STORAGE_KEY,
      JSON.stringify(reportFooterSettings),
    );
  }, [reportFooterSettings]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.localStorage.setItem(
      BEOM_APPLICATION_INPUTS_STORAGE_KEY,
      JSON.stringify(beomApplicationManualInputMap),
    );
  }, [beomApplicationManualInputMap]);

  const updateReportFooterSettings = <K extends keyof ReportFooterSettings>(
    field: K,
    value: ReportFooterSettings[K],
  ) => {
    setReportFooterSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleResetReportFooterSettings = () => {
    setReportFooterSettings(getDefaultReportFooterSettings());
  };

  const handleResetReportFilters = () => {
    setReportType("rank_approval");
    setStartDate(getYearStartText());
    setEndDate(getTodayText());
    setSelectedOrganizationId("");
    setSelectedRankId("");
    setSelectedBadgeCategoryId("");
    setSelectedBadgeId("");
    setSelectedBeomScoutId("");
    setKeyword("");
  };

  const updateBeomManualField = <K extends keyof BeomApplicationManualFields>(
    field: K,
    value: BeomApplicationManualFields[K],
  ) => {
    if (!selectedBeomScoutId) return;

    setBeomApplicationManualInputMap((prev) => ({
      ...prev,
      [selectedBeomScoutId]: {
        ...normalizeBeomManualFields(prev[selectedBeomScoutId]),
        [field]: value,
      },
    }));
  };

  const handleResetBeomManualInput = () => {
    if (!selectedBeomScoutId) return;

    setBeomApplicationManualInputMap((prev) => ({
      ...prev,
      [selectedBeomScoutId]: getDefaultBeomApplicationManualFields(),
    }));
  };

  const handleBeomPhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;

      if (typeof result === "string") {
        updateBeomManualField("photoDataUrl", result);
      }
    };
    reader.readAsDataURL(file);
  };

  const organizationNameMap = useMemo(() => {
    return new Map(organizations.map((organization) => [organization.id, organization.name]));
  }, [organizations]);

  const scoutMap = useMemo(() => {
    return new Map(scouts.map((scout) => [scout.id, scout]));
  }, [scouts]);

  const rankMap = useMemo(() => {
    return new Map(ranks.map((rank) => [rank.id, rank]));
  }, [ranks]);

  const badgeMap = useMemo(() => {
    return new Map(badges.map((badge) => [badge.id, badge]));
  }, [badges]);

  const categoryMap = useMemo(() => {
    return new Map(badgeCategories.map((category) => [category.id, category]));
  }, [badgeCategories]);

  const sortedRanks = useMemo(() => {
    return [...ranks].sort((a, b) => a.sort_order - b.sort_order);
  }, [ranks]);

  const supportedCertificateRanks = useMemo(() => {
    return sortedRanks.filter((rank) => isRankCertificateSupported(rank.rank_name));
  }, [sortedRanks]);

  const badgesForSelectedCategory = useMemo(() => {
    if (!selectedBadgeCategoryId) return badges;

    return badges.filter((badge) => badge.category_id === selectedBadgeCategoryId);
  }, [badges, selectedBadgeCategoryId]);

  useEffect(() => {
    if (!selectedBadgeCategoryId) return;

    const selectedBadge = badges.find((badge) => badge.id === selectedBadgeId);

    if (selectedBadge && selectedBadge.category_id !== selectedBadgeCategoryId) {
      setSelectedBadgeId("");
    }
  }, [badges, selectedBadgeCategoryId, selectedBadgeId]);

  useEffect(() => {
    if (reportType !== "rank_certificate" || !selectedRankId) return;

    const selectedRank = rankMap.get(selectedRankId);
    if (selectedRank && !isRankCertificateSupported(selectedRank.rank_name)) {
      setSelectedRankId("");
    }
  }, [rankMap, reportType, selectedRankId]);

  const getOrganizationName = useCallback(
    (organizationId: string) => {
      return organizationNameMap.get(organizationId) ?? "-";
    },
    [organizationNameMap],
  );

  const getRankName = useCallback(
    (rankId: string | null) => {
      if (!rankId) return "-";
      return rankMap.get(rankId)?.rank_name ?? "-";
    },
    [rankMap],
  );

  const getPreviousRankName = useCallback(
    (rank: Rank | null) => {
      if (!rank) return "-";

      const previousRank = sortedRanks.find(
        (candidate) => candidate.sort_order === rank.sort_order - 1,
      );

      if (!previousRank) return "입단";

      return previousRank.rank_name;
    },
    [sortedRanks],
  );

  const selectedOrganizationName = useMemo(() => {
    if (!currentOrganizationFilter) return "전체 소속";
    return organizationNameMap.get(currentOrganizationFilter) ?? "-";
  }, [currentOrganizationFilter, organizationNameMap]);

  const rankHistoriesByScoutId = useMemo(() => {
    const map = new Map<string, RankHistory[]>();

    rankHistories.forEach((history) => {
      const current = map.get(history.scout_id) ?? [];
      current.push(history);
      map.set(history.scout_id, current);
    });

    map.forEach((histories) => {
      histories.sort((a, b) => a.approved_at.localeCompare(b.approved_at));
    });

    return map;
  }, [rankHistories]);

  const scoutBadgesByScoutId = useMemo(() => {
    const map = new Map<string, ScoutBadge[]>();

    scoutBadges.forEach((scoutBadge) => {
      const current = map.get(scoutBadge.scout_id) ?? [];
      current.push(scoutBadge);
      map.set(scoutBadge.scout_id, current);
    });

    return map;
  }, [scoutBadges]);

  const programCompletionsByScoutId = useMemo(() => {
    const map = new Map<string, ProgramCompletion[]>();

    programCompletions.forEach((programCompletion) => {
      const current = map.get(programCompletion.scout_id) ?? [];
      current.push(programCompletion);
      map.set(programCompletion.scout_id, current);
    });

    return map;
  }, [programCompletions]);

  const attendanceByMeetingScoutKey = useMemo(() => {
    return new Map(
      attendanceRecords.map((attendance) => [
        `${attendance.meeting_id}:${attendance.scout_id}`,
        attendance,
      ]),
    );
  }, [attendanceRecords]);

  const filteredBeomScouts = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return scouts
      .filter((scout) => {
        if (currentOrganizationFilter && scout.organization_id !== currentOrganizationFilter) {
          return false;
        }

        if (!normalizedKeyword) return true;

        const targetText = [
          scout.name,
          scout.member_no,
          scout.school_name,
          scout.grade,
          getRankName(scout.current_rank_id),
          getOrganizationName(scout.organization_id),
          SCOUT_STATUS_LABELS[scout.status],
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return targetText.includes(normalizedKeyword);
      })
      .sort((a, b) => {
        const memberCompare = (a.member_no ?? "").localeCompare(b.member_no ?? "");
        if (memberCompare !== 0) return memberCompare;
        return a.name.localeCompare(b.name);
      });
  }, [currentOrganizationFilter, getOrganizationName, getRankName, keyword, scouts]);

  useEffect(() => {
    setSelectedBeomScoutId((currentScoutId) => {
      if (currentScoutId) {
        const exists = filteredBeomScouts.some((scout) => scout.id === currentScoutId);
        if (exists) return currentScoutId;
      }

      const nextScoutId = filteredBeomScouts[0]?.id ?? "";
      return currentScoutId === nextScoutId ? currentScoutId : nextScoutId;
    });
  }, [filteredBeomScouts]);

  const rankHistoryReportRows = useMemo<RankHistoryReportRow[]>(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return scouts
      .map((scout) => {
        if (currentOrganizationFilter && scout.organization_id !== currentOrganizationFilter) {
          return null;
        }

        const histories = rankHistoriesByScoutId.get(scout.id) ?? [];
        const rankApprovedAtByRankId: Record<string, string> = {};

        histories.forEach((history) => {
          rankApprovedAtByRankId[history.rank_id] = formatDate(history.approved_at);
        });

        const row: RankHistoryReportRow = {
          id: scout.id,
          organizationName: getOrganizationName(scout.organization_id),
          scoutName: scout.name,
          memberNo: scout.member_no ?? "-",
          schoolName: scout.school_name ?? "-",
          grade: scout.grade ?? "-",
          joinedAt: formatDate(scout.joined_at),
          currentRankName: getRankName(scout.current_rank_id),
          statusLabel: SCOUT_STATUS_LABELS[scout.status] ?? scout.status,
          rankApprovedAtByRankId,
        };

        if (normalizedKeyword) {
          const targetText = [
            row.organizationName,
            row.memberNo,
            row.scoutName,
            row.schoolName,
            row.grade,
            row.joinedAt,
            row.currentRankName,
            row.statusLabel,
            ...sortedRanks.map((rank) => rankApprovedAtByRankId[rank.id] ?? ""),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          if (!targetText.includes(normalizedKeyword)) {
            return null;
          }
        }

        return row;
      })
      .filter((row): row is RankHistoryReportRow => row !== null)
      .sort((a, b) => {
        const organizationCompare = a.organizationName.localeCompare(b.organizationName);
        if (organizationCompare !== 0) return organizationCompare;

        const memberCompare = a.memberNo.localeCompare(b.memberNo);
        if (memberCompare !== 0) return memberCompare;

        return a.scoutName.localeCompare(b.scoutName);
      });
  }, [
    currentOrganizationFilter,
    getRankName,
    keyword,
    rankHistoriesByScoutId,
    scouts,
    sortedRanks,
    getOrganizationName,
  ]);

  const rankReportRows = useMemo<RankReportRow[]>(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return rankHistories
      .map((history) => {
        const scout = scoutMap.get(history.scout_id);
        const rank = rankMap.get(history.rank_id) ?? null;

        if (!scout || !rank) return null;

        if (currentOrganizationFilter && history.organization_id !== currentOrganizationFilter) {
          return null;
        }

        if (selectedRankId && history.rank_id !== selectedRankId) {
          return null;
        }

        if (!isDateInRange(history.approved_at, startDate, endDate)) {
          return null;
        }

        const row: RankReportRow = {
          id: history.id,
          organizationName: getOrganizationName(history.organization_id),
          scoutName: scout.name,
          memberNo: scout.member_no ?? "-",
          previousRankName: getPreviousRankName(rank),
          approvedRankName: rank.rank_name,
          approvedAt: formatDate(history.approved_at),
        };

        if (normalizedKeyword) {
          const targetText = [
            row.organizationName,
            row.memberNo,
            row.scoutName,
            row.previousRankName,
            row.approvedRankName,
            row.approvedAt,
            scout.school_name,
            scout.grade,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          if (!targetText.includes(normalizedKeyword)) {
            return null;
          }
        }

        return row;
      })
      .filter((row): row is RankReportRow => row !== null)
      .sort((a, b) => {
        const dateCompare = a.approvedAt.localeCompare(b.approvedAt);
        if (dateCompare !== 0) return dateCompare;

        const organizationCompare = a.organizationName.localeCompare(b.organizationName);
        if (organizationCompare !== 0) return organizationCompare;

        return a.scoutName.localeCompare(b.scoutName);
      });
  }, [
    currentOrganizationFilter,
    endDate,
    getPreviousRankName,
    keyword,
    rankHistories,
    rankMap,
    scoutMap,
    selectedRankId,
    startDate,
    getOrganizationName,
  ]);

  const badgeReportRows = useMemo<BadgeReportRow[]>(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return scoutBadges
      .map((scoutBadge) => {
        if (!scoutBadge.approved_at) return null;

        const scout = scoutMap.get(scoutBadge.scout_id);
        const badge = badgeMap.get(scoutBadge.badge_id) ?? null;

        if (!scout || !badge) return null;

        const category = categoryMap.get(badge.category_id) ?? null;

        if (currentOrganizationFilter && scoutBadge.organization_id !== currentOrganizationFilter) {
          return null;
        }

        if (selectedBadgeCategoryId && badge.category_id !== selectedBadgeCategoryId) {
          return null;
        }

        if (selectedBadgeId && scoutBadge.badge_id !== selectedBadgeId) {
          return null;
        }

        if (!isDateInRange(scoutBadge.approved_at, startDate, endDate)) {
          return null;
        }

        const row: BadgeReportRow = {
          id: scoutBadge.id,
          organizationName: getOrganizationName(scoutBadge.organization_id),
          scoutName: scout.name,
          memberNo: scout.member_no ?? "-",
          currentRankName: getRankName(scout.current_rank_id),
          badgeName: badge.name,
          badgeCategoryName: category?.name ?? "-",
          approvedAt: formatDate(scoutBadge.approved_at),
        };

        if (normalizedKeyword) {
          const targetText = [
            row.organizationName,
            row.memberNo,
            row.scoutName,
            row.currentRankName,
            row.badgeName,
            row.badgeCategoryName,
            row.approvedAt,
            scout.school_name,
            scout.grade,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          if (!targetText.includes(normalizedKeyword)) {
            return null;
          }
        }

        return row;
      })
      .filter((row): row is BadgeReportRow => row !== null)
      .sort((a, b) => {
        const dateCompare = a.approvedAt.localeCompare(b.approvedAt);
        if (dateCompare !== 0) return dateCompare;

        const organizationCompare = a.organizationName.localeCompare(b.organizationName);
        if (organizationCompare !== 0) return organizationCompare;

        const scoutCompare = a.scoutName.localeCompare(b.scoutName);
        if (scoutCompare !== 0) return scoutCompare;

        return a.badgeName.localeCompare(b.badgeName);
      });
  }, [
    badgeMap,
    categoryMap,
    currentOrganizationFilter,
    endDate,
    getRankName,
    keyword,
    scoutBadges,
    scoutMap,
    selectedBadgeCategoryId,
    selectedBadgeId,
    startDate,
    getOrganizationName,
  ]);

  const selectedBeomApplicationData = useMemo<BeomApplicationData | null>(() => {
    if (!selectedBeomScoutId) return null;

    const scout = scoutMap.get(selectedBeomScoutId) ?? null;

    if (!scout) return null;

    const manual = normalizeBeomManualFields(
      beomApplicationManualInputMap[selectedBeomScoutId],
    );
    const histories = rankHistoriesByScoutId.get(scout.id) ?? [];
    const rankDateByLabel: Record<string, string> = {};
    const rankCandidates: Array<{ label: string; candidates: string[] }> = [
      { label: "초급", candidates: ["초급", "beginner"] },
      { label: "2급", candidates: ["2급", "rank2", "second"] },
      { label: "1급", candidates: ["1급", "rank1", "first"] },
      { label: "별", candidates: ["별", "star"] },
      { label: "무궁화", candidates: ["무궁화", "mugunghwa"] },
      { label: "범", candidates: ["범", "beom", "tiger"] },
    ];

    rankCandidates.forEach((item) => {
      const rank = findRankByCandidates(sortedRanks, item.candidates);
      const history = rank
        ? histories
            .filter((candidate) => candidate.rank_id === rank.id)
            .sort((a, b) => b.approved_at.localeCompare(a.approved_at))[0]
        : null;

      rankDateByLabel[item.label] = formatDateBlank(history?.approved_at ?? null);
    });

    const scoutBadgeRecords = scoutBadgesByScoutId.get(scout.id) ?? [];
    const scoutBadgeRows = scoutBadgeRecords
      .map((scoutBadge) => {
        const badge = badgeMap.get(scoutBadge.badge_id) ?? null;
        if (!badge) return null;
        const category = categoryMap.get(badge.category_id) ?? null;
        return {
          scoutBadge,
          badge,
          categoryName: category?.name ?? "-",
          approvedAt: formatDateBlank(scoutBadge.approved_at ?? scoutBadge.acquired_at),
        };
      })
      .filter(
        (row): row is {
          scoutBadge: ScoutBadge;
          badge: Badge;
          categoryName: string;
          approvedAt: string;
        } => row !== null,
      );

    const requiredBadgeRows = BEOM_REQUIRED_BADGE_GROUPS.flatMap((group) => {
      return group.badgeNames.map((badgeName) => {
        const foundBadgeRow = scoutBadgeRows.find(
          (row) => normalizeText(row.badge.name) === normalizeText(badgeName),
        );

        return {
          group: group.group,
          badgeName,
          approvedAt: foundBadgeRow?.approvedAt ?? "",
        };
      });
    });

    const generalBadgeRows = scoutBadgeRows
      .filter((row) => !BEOM_REQUIRED_BADGE_NAME_SET.has(row.badge.name))
      .map((row) => ({
        categoryName: row.categoryName,
        badgeName: row.badge.name,
        approvedAt: row.approvedAt,
      }))
      .sort((a, b) => {
        const categoryCompare = a.categoryName.localeCompare(b.categoryName);
        if (categoryCompare !== 0) return categoryCompare;
        return a.badgeName.localeCompare(b.badgeName);
      });

    const scoutPrograms = programCompletionsByScoutId.get(scout.id) ?? [];
    const program =
      [...scoutPrograms].sort((a, b) => {
        if (a.program_type !== b.program_type) {
          if (a.program_type === "WSEP") return -1;
          if (b.program_type === "WSEP") return 1;
        }

        const aDate = a.approved_at ?? a.completed_at;
        const bDate = b.approved_at ?? b.completed_at;
        return bDate.localeCompare(aDate);
      })[0] ?? null;

    const targetMeetings = meetings.filter(
      (meeting) =>
        meeting.organization_id === scout.organization_id && meeting.is_attendance_target,
    );
    const attendanceTotalCount = targetMeetings.length;
    const attendancePresentCount = targetMeetings.filter((meeting) => {
      const attendance = attendanceByMeetingScoutKey.get(`${meeting.id}:${scout.id}`);
      return attendance ? ATTENDANCE_PASS_STATUSES.includes(attendance.status) : false;
    }).length;
    const attendanceRate =
      attendanceTotalCount > 0
        ? Math.round((attendancePresentCount * 10000) / attendanceTotalCount) / 100
        : null;

    return {
      scout,
      organizationName: getOrganizationName(scout.organization_id),
      manual,
      rankDateByLabel,
      totalPromotionMonths: getMonthsBetween(scout.joined_at, manual.applicationDate),
      requiredBadgeRows,
      generalBadgeRows,
      program,
      attendanceRate,
      attendanceTotalCount,
      attendancePresentCount,
    };
  }, [
    attendanceByMeetingScoutKey,
    badgeMap,
    beomApplicationManualInputMap,
    categoryMap,
    getOrganizationName,
    meetings,
    programCompletionsByScoutId,
    rankHistoriesByScoutId,
    scoutBadgesByScoutId,
    scoutMap,
    selectedBeomScoutId,
    sortedRanks,
  ]);

  const rankCertificateRows = useMemo(() => {
    return rankReportRows.filter((row) => isRankCertificateSupported(row.approvedRankName));
  }, [rankReportRows]);

  const currentReportTitle =
    REPORT_TYPE_OPTIONS.find((option) => option.value === reportType)?.label ?? "보고서";

  const currentReportGuide = REPORT_TYPE_GUIDES[reportType];

  const currentRowCount =
    reportType === "rank_approval"
      ? rankReportRows.length
      : reportType === "rank_certificate"
        ? rankCertificateRows.length
      : reportType === "badge_approval"
        ? badgeReportRows.length
        : reportType === "rank_history"
          ? rankHistoryReportRows.length
          : selectedBeomApplicationData
            ? 1
            : 0;

  const reportTypeTotalCount = useMemo(() => {
    if (reportType === "rank_approval") {
      return rankHistories.filter((history) => {
        if (
          currentOrganizationFilter &&
          history.organization_id !== currentOrganizationFilter
        ) {
          return false;
        }
        return Boolean(scoutMap.get(history.scout_id));
      }).length;
    }

    if (reportType === "rank_certificate") {
      return rankHistories.filter((history) => {
        if (
          currentOrganizationFilter &&
          history.organization_id !== currentOrganizationFilter
        ) {
          return false;
        }
        if (!scoutMap.get(history.scout_id)) return false;
        const rank = rankMap.get(history.rank_id);
        return Boolean(rank && isRankCertificateSupported(rank.rank_name));
      }).length;
    }

    if (reportType === "badge_approval") {
      return scoutBadges.filter((scoutBadge) => {
        if (!scoutBadge.approved_at) return false;
        if (
          currentOrganizationFilter &&
          scoutBadge.organization_id !== currentOrganizationFilter
        ) {
          return false;
        }
        return Boolean(scoutMap.get(scoutBadge.scout_id));
      }).length;
    }

    if (reportType === "rank_history") {
      return scouts.filter((scout) => {
        if (
          currentOrganizationFilter &&
          scout.organization_id !== currentOrganizationFilter
        ) {
          return false;
        }
        return true;
      }).length;
    }

    if (reportType === "beom_application") {
      return scouts.filter((scout) => {
        if (
          currentOrganizationFilter &&
          scout.organization_id !== currentOrganizationFilter
        ) {
          return false;
        }
        return true;
      }).length;
    }

    return 0;
  }, [
    currentOrganizationFilter,
    rankHistories,
    rankMap,
    reportType,
    scoutBadges,
    scoutMap,
    scouts,
  ]);

  const isBeomScoutFilterActive =
    reportType === "beom_application" && selectedBeomScoutId !== "";

  const isReportFilterDirty =
    reportType !== "rank_approval" ||
    startDate !== getYearStartText() ||
    endDate !== getTodayText() ||
    selectedOrganizationId !== "" ||
    selectedRankId !== "" ||
    selectedBadgeCategoryId !== "" ||
    selectedBadgeId !== "" ||
    keyword.trim().length > 0 ||
    isBeomScoutFilterActive;

  const reportReviewItems = useMemo(() => {
    if (reportType !== "beom_application" || !selectedBeomApplicationData) {
      return [] as string[];
    }

    const data = selectedBeomApplicationData;
    const items: string[] = [];

    if (!data.scout.member_no) items.push("회원번호");
    if (!data.scout.joined_at) items.push("등록일");
    if (!data.manual.birthDate) items.push("생년월일");
    if (!data.manual.address) items.push("주소");
    if (!data.manual.phone) items.push("연락처");
    if (!data.manual.unitLeaderName) items.push("대장 성명");
    if (!data.manual.sponsorRepresentativeName) items.push("육성단체대표");
    if (!data.program) items.push("WSEP/MoP 이수");
    if (data.program && !data.program.certificate_no) items.push("수료증번호");
    if (data.program && !data.program.approved_at) items.push("프로그램 승인일");
    if (data.requiredBadgeRows.some((row) => !row.approvedAt)) {
      items.push("필수 기능장 인가일");
    }
    if (Object.values(data.rankDateByLabel).filter(Boolean).length < 5) {
      items.push("급위별 인가일");
    }
    if (data.attendanceTotalCount === 0) items.push("출석 집회");
    if (data.attendanceRate === null) items.push("출석률");

    return Array.from(new Set(items));
  }, [reportType, selectedBeomApplicationData]);

  const reportReviewCount = reportReviewItems.length;

  const reportTargetPreviewRows = useMemo<ReportTargetPreviewRow[]>(() => {
    if (reportType === "rank_approval") {
      return rankReportRows.map((row) => ({
        id: getRankApprovalTargetId(row),
        memberNo: row.memberNo,
        scoutName: row.scoutName,
        organizationName: row.organizationName,
        reportContent: `${row.previousRankName} → ${row.approvedRankName}`,
        standardDate: row.approvedAt,
        note: "진급 인가 대상",
      }));
    }

    if (reportType === "rank_certificate") {
      return rankCertificateRows.map((row) => ({
        id: getRankCertificateTargetId(row),
        memberNo: row.memberNo,
        scoutName: row.scoutName,
        organizationName: row.organizationName,
        reportContent: `${row.approvedRankName} 인증서`,
        standardDate: row.approvedAt,
        note: "인증서 출력 대상",
      }));
    }

    if (reportType === "badge_approval") {
      return badgeReportRows.map((row) => ({
        id: getBadgeApprovalTargetId(row),
        memberNo: row.memberNo,
        scoutName: row.scoutName,
        organizationName: row.organizationName,
        reportContent: row.badgeName,
        standardDate: row.approvedAt,
        note: row.badgeCategoryName,
      }));
    }

    if (reportType === "rank_history") {
      return rankHistoryReportRows.map((row) => ({
        id: getRankHistoryTargetId(row),
        memberNo: row.memberNo,
        scoutName: row.scoutName,
        organizationName: row.organizationName,
        reportContent: row.currentRankName,
        standardDate: row.joinedAt,
        note: `${row.schoolName} / ${row.grade} / ${row.statusLabel}`,
      }));
    }

    if (reportType === "beom_application" && selectedBeomApplicationData) {
      const data = selectedBeomApplicationData;
      const programStatusText = data.program
        ? `${data.program.program_type} 확인`
        : "WSEP/MoP 확인 필요";

      return [
        {
          id: getBeomApplicationTargetId(data),
          memberNo: data.scout.member_no ?? "-",
          scoutName: data.scout.name,
          organizationName: data.organizationName,
          reportContent: "범스카우트 진급 신청서",
          standardDate: formatDate(data.manual.applicationDate),
          note: programStatusText,
        },
      ];
    }

    return [];
  }, [
    badgeReportRows,
    rankCertificateRows,
    rankHistoryReportRows,
    rankReportRows,
    reportType,
    selectedBeomApplicationData,
  ]);

  const reportTargetIdSignature = useMemo(() => {
    return reportTargetPreviewRows.map((row) => row.id).join("|");
  }, [reportTargetPreviewRows]);

  useEffect(() => {
    const nextTargetIds = reportTargetIdSignature
      ? reportTargetIdSignature.split("|")
      : [];

    setSelectedReportTargetIds((currentTargetIds) => {
      const isSameSelection =
        currentTargetIds.length === nextTargetIds.length &&
        currentTargetIds.every((id, index) => id === nextTargetIds[index]);

      return isSameSelection ? currentTargetIds : nextTargetIds;
    });
  }, [reportTargetIdSignature]);

  const selectedReportTargetIdSet = useMemo(() => {
    return new Set(selectedReportTargetIds);
  }, [selectedReportTargetIds]);

  const selectedReportTargetRows = useMemo(() => {
    return reportTargetPreviewRows.filter((row) => selectedReportTargetIdSet.has(row.id));
  }, [reportTargetPreviewRows, selectedReportTargetIdSet]);

  const selectedRankReportRows = useMemo(() => {
    return rankReportRows.filter((row) =>
      selectedReportTargetIdSet.has(getRankApprovalTargetId(row)),
    );
  }, [rankReportRows, selectedReportTargetIdSet]);

  const selectedRankCertificateRows = useMemo(() => {
    return rankCertificateRows.filter((row) =>
      selectedReportTargetIdSet.has(getRankCertificateTargetId(row)),
    );
  }, [rankCertificateRows, selectedReportTargetIdSet]);

  const selectedBadgeReportRows = useMemo(() => {
    return badgeReportRows.filter((row) =>
      selectedReportTargetIdSet.has(getBadgeApprovalTargetId(row)),
    );
  }, [badgeReportRows, selectedReportTargetIdSet]);

  const selectedRankHistoryReportRows = useMemo(() => {
    return rankHistoryReportRows.filter((row) =>
      selectedReportTargetIdSet.has(getRankHistoryTargetId(row)),
    );
  }, [rankHistoryReportRows, selectedReportTargetIdSet]);

  const selectedBeomApplicationDataForPrint = useMemo(() => {
    if (reportType !== "beom_application" || !selectedBeomApplicationData) {
      return null;
    }

    return selectedReportTargetIdSet.has(
      getBeomApplicationTargetId(selectedBeomApplicationData),
    )
      ? selectedBeomApplicationData
      : null;
  }, [reportType, selectedBeomApplicationData, selectedReportTargetIdSet]);

  const selectedPrintRowCount = selectedReportTargetRows.length;

  const rankReportPages = useMemo(
    () => chunkArray(selectedRankReportRows, RANK_APPROVAL_PAGE_SIZE),
    [selectedRankReportRows],
  );
  const rankCertificatePages = useMemo(() => selectedRankCertificateRows, [selectedRankCertificateRows]);
  const badgeReportPages = useMemo(
    () => chunkArray(selectedBadgeReportRows, BADGE_APPROVAL_PAGE_SIZE),
    [selectedBadgeReportRows],
  );
  const rankHistoryReportPages = useMemo(
    () => chunkArray(selectedRankHistoryReportRows, RANK_HISTORY_PAGE_SIZE),
    [selectedRankHistoryReportRows],
  );

  const previewPageCount = useMemo(() => {
    if (reportType === "rank_approval") return rankReportPages.length;
    if (reportType === "badge_approval") return badgeReportPages.length;
    if (reportType === "rank_history") return rankHistoryReportPages.length;
    if (reportType === "rank_certificate") return rankCertificatePages.length;
    if (reportType === "beom_application") {
      return selectedBeomApplicationDataForPrint ? 1 : 0;
    }
    return 0;
  }, [
    badgeReportPages.length,
    rankCertificatePages.length,
    rankHistoryReportPages.length,
    rankReportPages.length,
    reportType,
    selectedBeomApplicationDataForPrint,
  ]);

  useLayoutEffect(() => {
    if (selectedPrintRowCount === 0 || previewPageCount === 0) {
      setPreviewScale(1);
      setPreviewScaledHeight(undefined);
      return;
    }

    const viewport = previewViewportRef.current;
    const wrapper = previewScaleWrapperRef.current;
    if (!viewport || !wrapper) return;

    const updatePreviewScale = () => {
      const page = wrapper.querySelector(".report-page") as HTMLElement | null;
      if (!page) {
        setPreviewScale(1);
        setPreviewScaledHeight(undefined);
        return;
      }

      const pageWidth = page.offsetWidth;
      const availableWidth = viewport.clientWidth;
      const nextScale =
        pageWidth > 0 ? Math.min(1, Math.max(0.35, (availableWidth - 8) / pageWidth)) : 1;

      setPreviewScale(nextScale);
      setPreviewScaledHeight(wrapper.scrollHeight * nextScale);
    };

    updatePreviewScale();

    const observer = new ResizeObserver(() => {
      updatePreviewScale();
    });
    observer.observe(viewport);
    observer.observe(wrapper);

    return () => observer.disconnect();
  }, [
    badgeReportPages,
    previewPageCount,
    rankCertificatePages,
    rankHistoryReportPages,
    rankReportPages,
    reportType,
    selectedBeomApplicationDataForPrint,
    selectedPrintRowCount,
  ]);

  const handleOpenTargetPreview = () => {
    setIsTargetPreviewOpen(true);
  };

  const handleTargetCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleOpenTargetPreview();
    }
  };

  const handleToggleReportTarget = (targetId: string) => {
    setSelectedReportTargetIds((prev) => {
      if (prev.includes(targetId)) {
        return prev.filter((id) => id !== targetId);
      }

      return [...prev, targetId];
    });
  };

  const handleSelectAllReportTargets = () => {
    setSelectedReportTargetIds(reportTargetPreviewRows.map((row) => row.id));
  };

  const handleClearReportTargets = () => {
    setSelectedReportTargetIds([]);
  };

  const getPrintPeriodText = () => {
    if (reportType === "rank_history" || reportType === "beom_application") {
      return "기간 조건 없음";
    }

    return `${startDate} ~ ${endDate}`;
  };

  const handlePrint = () => {
    if (loading) {
      return;
    }

    if (currentRowCount === 0) {
      window.alert("현재 선택한 조건에 맞는 출력 대상이 없습니다.");
      return;
    }

    if (selectedPrintRowCount === 0) {
      window.alert("출력할 대상을 선택하세요.");
      setIsTargetPreviewOpen(true);
      return;
    }

    const confirmed = window.confirm(
      [
        "선택한 항목만 보고서로 출력합니다.",
        "",
        `보고서: ${currentReportTitle}`,
        `선택 대상: ${selectedPrintRowCount}건 / 전체 ${currentRowCount}건`,
        `출력 소속: ${selectedOrganizationName}`,
        `출력 범위: ${getPrintPeriodText()}`,
        "",
        "출력 전 확인 목록에서 체크한 항목만 인쇄 또는 PDF 저장 대상에 포함됩니다.",
        "기존에 출력했던 보고서도 같은 조건으로 다시 조회하여 현재 등록된 자료 기준으로 재출력할 수 있습니다.",
        "계속 진행할까요?",
      ].join("\n"),
    );

    if (!confirmed) {
      return;
    }

    window.print();
  };

  return (
    <div className="reports-page-root" style={reportsPageRootStyle}>
      <style>
        {`
          @media screen {
            .preview-scale-viewport {
              width: 100%;
              overflow: hidden;
              box-sizing: border-box;
            }

            .preview-scale-wrapper {
              transform-origin: top center;
            }

            #report-print-area {
              position: relative;
              z-index: 0;
            }

            #report-print-area .report-page {
              width: 210mm;
              height: 297mm;
            }
          }

          @media print {
            @page {
              size: A4 portrait;
              margin: 0;
            }

            .no-print-section,
            .app-fixed-sidebar {
              display: none !important;
            }

            html,
            body,
            #root,
            #app-main-content,
            .reports-page-root,
            .preview-print-shell,
            .preview-scale-viewport,
            .preview-scale-wrapper,
            #report-print-area {
              margin: 0 !important;
              padding: 0 !important;
              width: auto !important;
              max-width: none !important;
              height: auto !important;
              min-height: 0 !important;
              overflow: visible !important;
              background: transparent !important;
              box-shadow: none !important;
              border: none !important;
              contain: none !important;
              isolation: auto !important;
              transform: none !important;
              zoom: 1 !important;
            }

            #app-main-content,
            .reports-page-root,
            .preview-print-shell,
            .preview-scale-viewport,
            .preview-scale-wrapper,
            #report-print-area {
              display: block !important;
              position: static !important;
            }

            /* 보고서 내부 크기·여백·표·footer는 미리보기와 동일하게 유지.
               화면용 장식(그림자·테두리·페이지 간격)만 제거한다. */
            #report-print-area .report-page {
              box-shadow: none !important;
              border: none !important;
              margin: 0 !important;
              page-break-after: always;
              break-after: page;
            }

            #report-print-area .report-page:last-child {
              page-break-after: auto;
              break-after: auto;
            }

            #report-print-area .rank-certificate-page {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            #report-print-area .rank-certificate-page img,
            #report-print-area .rank-certificate-page div,
            #report-print-area .rank-certificate-date-overlay {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            #report-print-area .rank-certificate-date-overlay {
              background-color: rgb(250, 250, 255) !important;
            }
          }
        `}
      </style>

      <div className="no-print-section" style={pageHeaderStyle}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h1 style={pageTitleStyle}>보고서 출력</h1>
            <PageHelpButton
              title="보고서 출력"
              description="진급·기능장 인가 보고서, 진급 이력표, 범 진급 신청서 및 인증서를 조회하고 출력합니다."
              sections={[
                {
                  title: "사용 순서",
                  items: [
                    "출력할 보고서 종류를 선택합니다.",
                    "기간, 급위, 대원 또는 기능장 조건을 설정합니다.",
                    "출력 대상을 조회하고 필요한 항목을 선택합니다.",
                    "미리보기에서 내용과 보고서 하단 정보를 확인합니다.",
                    "선택 항목 인쇄 또는 PDF 저장을 실행합니다.",
                  ],
                },
                {
                  title: "주의사항",
                  items: [
                    "미리보기와 실제 인쇄 대상이 일치하는지 확인합니다.",
                    "인쇄창에서 A4, 배율 100%, 여백 없음, 머리글·바닥글 해제를 권장합니다.",
                    "보고서별 출력 대상과 페이지 분할 방식이 다를 수 있습니다.",
                    "범스카우트 진급 인증서는 출력 대상에서 제외되며 진급 신청서를 사용합니다.",
                    "출력 이력은 별도로 저장되지 않을 수 있습니다.",
                  ],
                },
              ]}
            />
          </div>
          <p style={pageDescriptionStyle}>
            진급 인가 보고서, 기능장 인가 보고서, 대원별 진급 이력표, 범스카우트 진급 신청서, 진급 인증서를 확인하고 인쇄 또는 PDF로 저장합니다.
          </p>
        </div>

        {profile && <div style={roleBadgeStyle}>{ROLE_LABELS[profile.role]}</div>}
      </div>

      <div className="no-print-section" style={summaryGridStyle}>
        <section style={summaryCardStyle}>
          <h2 style={summaryTitleStyle}>선택 보고서</h2>
          <p style={summaryValueStyle}>{currentReportTitle}</p>
          <p style={summaryDescriptionStyle}>{currentReportGuide.standard}</p>
        </section>

        <section style={summarySuccessCardStyle}>
          <h2 style={summaryTitleStyle}>출력 가능</h2>
          <p style={summaryValueStyle}>{currentRowCount}건</p>
          <p style={summaryDescriptionStyle}>현재 조건으로 조회된 전체 출력 대상입니다.</p>
        </section>

        <div
          role="button"
          tabIndex={0}
          style={{
            ...summarySelectedCardStyle,
            cursor: "pointer",
            outline: "none",
            ...(isTargetPreviewOpen ? summaryTargetCardOpenStyle : {}),
          }}
          onClick={handleOpenTargetPreview}
          onKeyDown={handleTargetCardKeyDown}
        >
          <h2 style={summaryTitleStyle}>선택 대상</h2>
          <p style={summaryValueStyle}>{selectedPrintRowCount}건</p>
          <p style={summaryDescriptionStyle}>
            카드를 눌러 출력 대상을 확인하거나 선택합니다.
          </p>
        </div>

        <section style={reportReviewCount > 0 ? summaryWarningCardStyle : summaryCardStyle}>
          <h2 style={summaryTitleStyle}>확인 필요</h2>
          <p style={summaryValueStyle}>{reportReviewCount}건</p>
          <p style={summaryDescriptionStyle}>
            {reportType === "beom_application"
              ? "범 진급 신청서의 누락 입력·증빙 항목입니다."
              : "현재 보고서는 별도 확인 항목이 없습니다."}
          </p>
        </section>
      </div>

      <section className="no-print-section" style={contentCardStyle}>
        <div style={toolbarStyle}>
          <div>
            <h2 style={sectionTitleStyle}>출력 조건</h2>
            <p style={sectionDescriptionStyle}>
              출력 조건을 선택한 뒤 미리보기를 확인하고 인쇄 또는 PDF 저장을 진행합니다.
            </p>
          </div>

          <div style={toolbarRightStyle}>
            <button
              type="button"
              style={primaryButtonStyle}
              onClick={handlePrint}
              disabled={loading || currentRowCount === 0 || selectedPrintRowCount === 0}
            >
              선택 항목 인쇄 / PDF 저장
            </button>
          </div>
        </div>

        <div style={reportGuideBoxStyle}>
          <div style={reportGuideMainStyle}>
            <strong style={reportGuideTitleStyle}>{currentReportTitle}</strong>
            <p style={reportGuideRuleStyle}>{currentReportGuide.outputRule}</p>
          </div>
          <div style={reportGuideMetaStyle}>
            <span>기준: {currentReportGuide.standard}</span>
            <span>소속: {selectedOrganizationName}</span>
            <span>기간: {getPrintPeriodText()}</span>
          </div>
        </div>

        {reportReviewItems.length > 0 && (
          <div style={reviewWarningBoxStyle}>
            <strong>출력 전 확인:</strong> {reportReviewItems.join(", ")}
          </div>
        )}

        <div style={reportSearchPanelStyle}>
          <div style={reportSearchFiltersRowStyle}>
            <label style={reportSearchFieldStyle}>
              보고서 종류
              <select
                style={reportSearchSelectStyle}
                value={reportType}
                onChange={(event) => setReportType(event.target.value as ReportType)}
              >
                {REPORT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {reportType !== "rank_history" && reportType !== "beom_application" && (
              <>
                <label style={reportSearchFieldStyle}>
                  시작일
                  <input
                    style={reportSearchSelectStyle}
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                  />
                </label>

                <label style={reportSearchFieldStyle}>
                  종료일
                  <input
                    style={reportSearchSelectStyle}
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                  />
                </label>
              </>
            )}

            {(reportType === "rank_approval" || reportType === "rank_certificate") && (
              <label style={reportSearchFieldStyle}>
                인가 급위
                <select
                  style={reportSearchSelectStyle}
                  value={selectedRankId}
                  onChange={(event) => setSelectedRankId(event.target.value)}
                >
                  <option value="">전체 급위</option>
                  {(reportType === "rank_certificate" ? supportedCertificateRanks : sortedRanks).map((rank) => (
                    <option key={rank.id} value={rank.id}>
                      {rank.rank_name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {isSuperAdmin && (
              <label style={reportSearchFieldStyle}>
                소속
                <select
                  style={reportSearchSelectStyle}
                  value={selectedOrganizationId}
                  onChange={(event) => setSelectedOrganizationId(event.target.value)}
                >
                  <option value="">전체 소속</option>
                  {organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {reportType === "badge_approval" && (
              <>
                <label style={reportSearchFieldStyle}>
                  기능장 분류
                  <select
                    style={reportSearchSelectStyle}
                    value={selectedBadgeCategoryId}
                    onChange={(event) => setSelectedBadgeCategoryId(event.target.value)}
                  >
                    <option value="">전체 분류</option>
                    {badgeCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={reportSearchFieldStyle}>
                  기능장
                  <select
                    style={reportSearchSelectStyle}
                    value={selectedBadgeId}
                    onChange={(event) => setSelectedBadgeId(event.target.value)}
                  >
                    <option value="">전체 기능장</option>
                    {badgesForSelectedCategory.map((badge) => (
                      <option key={badge.id} value={badge.id}>
                        {badge.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}

            {reportType === "beom_application" && (
              <label style={reportSearchFieldStyle}>
                신청서 대상 대원
                <select
                  style={reportSearchSelectStyle}
                  value={selectedBeomScoutId}
                  onChange={(event) => setSelectedBeomScoutId(event.target.value)}
                >
                  <option value="">대원 선택</option>
                  {filteredBeomScouts.map((scout) => (
                    <option key={scout.id} value={scout.id}>
                      {scout.name} {scout.member_no ? `(${scout.member_no})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div style={reportSearchActionsRowStyle}>
            <input
              style={reportSearchInputStyle}
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="대원명, 대원번호, 급위, 기능장 검색"
              aria-label="검색어"
            />

            {isReportFilterDirty && (
              <button
                type="button"
                style={reportSearchResetButtonStyle}
                onClick={handleResetReportFilters}
              >
                초기화
              </button>
            )}

            <button
              type="button"
              style={{ ...secondaryButtonStyle, flex: "0 0 auto" }}
              onClick={loadData}
            >
              새로고침
            </button>

            <div style={reportSearchCountStyle} aria-live="polite">
              <span style={reportSearchCountLabelStyle}>조회 결과</span>
              <strong style={reportSearchCountNumberStyle}>{currentRowCount}건</strong>
              <span style={reportSearchCountTotalStyle}>
                / 전체 {reportTypeTotalCount}건
              </span>
            </div>
          </div>
        </div>

        <div style={printCheckBoxStyle}>
          <div style={printCheckHeaderStyle}>
            <div style={printCheckTextStyle}>
              <h3 style={printCheckTitleStyle}>출력 전 확인</h3>
              <p style={printCheckDescriptionStyle}>
                출력 대상{" "}
                <strong style={printCheckCountStrongStyle}>{currentRowCount}</strong>건 · 선택{" "}
                <strong style={printCheckCountStrongStyle}>{selectedPrintRowCount}</strong>건
              </p>
              <p style={reprintNoticeStyle}>
                출력 이력은 저장되지 않습니다. 같은 조건으로 다시 조회하면 현재 자료 기준으로 출력됩니다.
              </p>
            </div>

            <button
              type="button"
              style={targetPreviewOpenButtonStyle}
              onClick={() => setIsTargetPreviewOpen((prev) => !prev)}
              disabled={loading || currentRowCount === 0}
            >
              {isTargetPreviewOpen ? "출력 대상 목록 닫기" : "출력 대상 목록 열기"}
            </button>
          </div>

          {isTargetPreviewOpen && (
            <div style={targetPreviewBoxStyle}>
              <div style={targetPreviewHeaderStyle}>
                <div>
                  <h3 style={targetPreviewTitleStyle}>출력 대상 목록</h3>
                  <p style={targetPreviewDescriptionStyle}>
                    체크된 항목만 미리보기와 출력물에 포함됩니다. 대상자를 확인한 뒤 출력하세요.
                  </p>
                </div>
                <div style={targetPreviewActionStyle}>
                  <strong style={targetPreviewCountStyle}>
                    {selectedPrintRowCount}건 선택 / 전체 {reportTargetPreviewRows.length}건
                  </strong>
                  <button
                    type="button"
                    style={smallSecondaryButtonStyle}
                    onClick={handleSelectAllReportTargets}
                  >
                    전체 선택
                  </button>
                  <button
                    type="button"
                    style={smallSecondaryButtonStyle}
                    onClick={handleClearReportTargets}
                  >
                    전체 해제
                  </button>
                </div>
              </div>

              {reportTargetPreviewRows.length === 0 ? (
                <EmptyState title="출력 대상이 없습니다" description="조회 조건을 조정한 뒤 출력 대상을 다시 확인하세요." />
              ) : (
                <div style={targetPreviewTableWrapStyle}>
                  <table style={targetPreviewTableStyle}>
                    <thead>
                      <tr>
                        <th style={targetPreviewCheckThStyle}>선택</th>
                        <th style={targetPreviewThNarrowStyle}>순번</th>
                        <th style={targetPreviewThCenterStyle}>대원번호</th>
                        <th style={targetPreviewThStyle}>성명</th>
                        <th style={targetPreviewThStyle}>소속</th>
                        <th style={targetPreviewThStyle}>출력 내용</th>
                        <th style={targetPreviewThCenterStyle}>기준일</th>
                        <th style={targetPreviewThStyle}>비고</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportTargetPreviewRows.map((row, index) => {
                        const checked = selectedReportTargetIdSet.has(row.id);

                        return (
                          <tr key={row.id} style={checked ? undefined : targetPreviewUncheckedRowStyle}>
                            <td style={targetPreviewTdCenterStyle}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => handleToggleReportTarget(row.id)}
                                aria-label={`${row.scoutName} 출력 선택`}
                              />
                            </td>
                            <td style={targetPreviewTdCenterStyle}>{index + 1}</td>
                            <td style={targetPreviewTdCenterStyle}>{row.memberNo}</td>
                            <td style={targetPreviewStrongTdStyle}>{row.scoutName}</td>
                            <td style={targetPreviewTdStyle}>{row.organizationName}</td>
                            <td style={targetPreviewTdStyle}>{row.reportContent}</td>
                            <td style={targetPreviewTdCenterStyle}>{row.standardDate}</td>
                            <td style={targetPreviewTdStyle}>{row.note}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {loading && (
        <div className="no-print-section" style={emptyStateStyle}>
          보고서 정보를 불러오는 중입니다...
        </div>
      )}

      {!loading && errorMessage && (
        <div className="no-print-section" style={errorBoxStyle}>
          {errorMessage}
        </div>
      )}

      {!loading && !errorMessage && currentRowCount === 0 && (
        <div className="no-print-section">
          <EmptyState title="출력 대상이 없습니다" description="보고서 종류, 기간, 소속대 및 대상 조건을 다시 확인하세요." />
        </div>
      )}

      {!loading && !errorMessage && currentRowCount > 0 && selectedPrintRowCount === 0 && (
        <div className="no-print-section" style={emptyStateStyle}>
          출력할 대상을 선택하세요.
        </div>
      )}

      {!loading && !errorMessage && selectedPrintRowCount > 0 && (
        <section className="preview-print-shell" style={previewCardStyle}>
          <div className="no-print-section" style={previewHeaderStyle}>
            <div>
              <h2 style={sectionTitleStyle}>미리보기</h2>
              <p style={sectionDescriptionStyle}>
                아래 미리보기는 실제 인쇄 원본과 동일한 서식입니다. 화면에서만 축소되어 보이며, 인쇄·PDF에는 원본 크기로 출력됩니다.
              </p>
              <p style={printGuideTextStyle}>
                인쇄 권장 설정: 용지 A4 · 배율 100% · 여백 없음 · 머리글/바닥글 해제
              </p>
            </div>
          </div>

          <div
            ref={previewViewportRef}
            className="preview-scale-viewport"
            style={{
              ...previewScaleViewportStyle,
              height: previewScaledHeight,
            }}
          >
            <div
              ref={previewScaleWrapperRef}
              className="preview-scale-wrapper"
              style={{
                ...previewScaleWrapperStyle,
                transform: `scale(${previewScale})`,
              }}
            >
              <div id="report-print-area" style={printAreaStyle}>
                {reportType === "rank_approval" &&
                  rankReportPages.map((pageRows, pageIndex) => (
                    <RankApprovalReportPage
                      key={`rank-page-${pageIndex}`}
                      rows={pageRows}
                      pageIndex={pageIndex}
                      organizationName={selectedOrganizationName}
                      startDate={startDate}
                      endDate={endDate}
                      reportFooterSettings={reportFooterSettings}
                    />
                  ))}

                {reportType === "badge_approval" &&
                  badgeReportPages.map((pageRows, pageIndex) => (
                    <BadgeApprovalReportPage
                      key={`badge-page-${pageIndex}`}
                      rows={pageRows}
                      pageIndex={pageIndex}
                      organizationName={selectedOrganizationName}
                      startDate={startDate}
                      endDate={endDate}
                      reportFooterSettings={reportFooterSettings}
                    />
                  ))}

                {reportType === "rank_history" &&
                  rankHistoryReportPages.map((pageRows, pageIndex) => (
                    <RankHistoryReportPage
                      key={`rank-history-page-${pageIndex}`}
                      rows={pageRows}
                      ranks={sortedRanks}
                      pageIndex={pageIndex}
                      organizationName={selectedOrganizationName}
                      reportFooterSettings={reportFooterSettings}
                    />
                  ))}

                {reportType === "rank_certificate" &&
                  rankCertificatePages.map((row) => (
                    <RankCertificatePage
                      key={`rank-certificate-${row.id}`}
                      row={row}
                      leaderName={reportFooterSettings.leaderName}
                    />
                  ))}

                {reportType === "beom_application" && selectedBeomApplicationDataForPrint && (
                  <BeomApplicationReportPage data={selectedBeomApplicationDataForPrint} />
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="no-print-section" style={contentCardStyle}>
        {reportType !== "beom_application" && reportType !== "rank_certificate" && (
          <div style={footerSettingsBoxStyle}>
            <div style={footerSettingsHeaderStyle}>
              <div style={footerSettingsHeaderTextStyle}>
                <h3 style={footerSettingsTitleStyle}>보고서 하단 정보</h3>
                <p style={footerSettingsDescriptionStyle}>
                  한 번 입력한 하단 정보는 다음 출력 때 다시 사용할 수 있습니다.
                </p>
              </div>

              <button
                type="button"
                style={footerResetButtonStyle}
                onClick={handleResetReportFooterSettings}
              >
                초기화
              </button>
            </div>

            <div style={filterGridStyle}>
              <label style={fieldLabelStyle}>
                보고일자
                <input
                  style={inputStyle}
                  type="date"
                  value={reportFooterSettings.reportDate}
                  onChange={(event) =>
                    updateReportFooterSettings("reportDate", event.target.value)
                  }
                />
              </label>

              <label style={fieldLabelStyle}>
                지구연합회명
                <input
                  style={inputStyle}
                  value={reportFooterSettings.districtAssociationName}
                  onChange={(event) =>
                    updateReportFooterSettings(
                      "districtAssociationName",
                      event.target.value,
                    )
                  }
                  placeholder="예: 00 지구연합회"
                />
              </label>

              <label style={fieldLabelStyle}>
                대(단)명
                <input
                  style={inputStyle}
                  value={reportFooterSettings.unitName}
                  onChange={(event) =>
                    updateReportFooterSettings("unitName", event.target.value)
                  }
                  placeholder="예: 제 00대(단)"
                />
              </label>

              <label style={fieldLabelStyle}>
                대장 성명
                <input
                  style={inputStyle}
                  value={reportFooterSettings.leaderName}
                  onChange={(event) =>
                    updateReportFooterSettings("leaderName", event.target.value)
                  }
                  placeholder="예: 홍길동"
                />
              </label>

              <label style={fieldLabelStyle}>
                수신 연맹장
                <input
                  style={inputStyle}
                  value={reportFooterSettings.federationName}
                  onChange={(event) =>
                    updateReportFooterSettings("federationName", event.target.value)
                  }
                  placeholder="예: 한국스카우트OO연맹장 또는 한국스카우트 OO연맹 OO지구연합회 회장"
                />
              </label>
            </div>

            <div style={footerPreviewStyle}>
              <div>위와 같이 {getReportFooterActionText(reportType)} 보고합니다.</div>
              <div dangerouslySetInnerHTML={{ __html: formatReportDate(reportFooterSettings.reportDate) }} />
              <div dangerouslySetInnerHTML={{ __html: getReportFooterSignatureLine(reportFooterSettings) }} />
              <div>{getReportFooterFederationLine(reportFooterSettings)}</div>
            </div>

            <div style={footerPrintActionStyle}>
              <button
                type="button"
                style={primaryButtonStyle}
                onClick={handlePrint}
                disabled={loading || currentRowCount === 0 || selectedPrintRowCount === 0}
              >
                선택 항목 인쇄 / PDF 저장
              </button>
            </div>
          </div>
        )}

        {reportType === "beom_application" && selectedBeomApplicationData && (
          <BeomApplicationInputPanel
            data={selectedBeomApplicationData}
            onChange={updateBeomManualField}
            onPhotoChange={handleBeomPhotoChange}
            onReset={handleResetBeomManualInput}
            onPrint={handlePrint}
            printDisabled={loading || currentRowCount === 0 || selectedPrintRowCount === 0}
          />
        )}

        {reportType === "rank_certificate" && (
          <div style={footerSettingsBoxStyle}>
            <div style={footerSettingsHeaderStyle}>
              <div style={footerSettingsHeaderTextStyle}>
                <h3 style={footerSettingsTitleStyle}>진급 인증서 입력 정보</h3>
                <p style={footerSettingsDescriptionStyle}>
                  인가일 기준으로 조회된 진급 이력에 대해 급위별 인증서 양식을 적용합니다.
                  소속, 성명, 인가일은 진급 이력에서 자동 표시되며, 대장확인 성명은 아래 입력값을 사용합니다.
                  범스카우트는 한국스카우트연맹에서 별도로 수여하므로 인증서 출력 대상에서 제외합니다.
                </p>
              </div>

              <button
                type="button"
                style={footerResetButtonStyle}
                onClick={handleResetReportFooterSettings}
              >
                초기화
              </button>
            </div>

            <div style={filterGridStyle}>
              <label style={fieldLabelStyle}>
                대장확인 성명
                <input
                  style={inputStyle}
                  value={reportFooterSettings.leaderName}
                  onChange={(event) =>
                    updateReportFooterSettings("leaderName", event.target.value)
                  }
                  placeholder="예: 홍길동"
                />
              </label>
            </div>

            <p style={footerSettingsDescriptionStyle}>
              인쇄창에서는 여백을 “없음” 또는 “최소”로 설정하는 것을 권장합니다.
            </p>

            <div style={footerPrintActionStyle}>
              <button
                type="button"
                style={primaryButtonStyle}
                onClick={handlePrint}
                disabled={loading || currentRowCount === 0 || selectedPrintRowCount === 0}
              >
                선택 항목 인쇄 / PDF 저장
              </button>
            </div>
          </div>
        )}

        <p style={helpTextStyle}>
          진급 인가 보고서와 기능장 인가 보고서는 인가일을 기준으로 출력합니다.
          기능장 인가일이 입력되지 않은 기록은 기능장 인가 보고서에 포함되지 않습니다.
          대원별 진급 이력표는 선택한 소속과 검색어에 맞는 대원의 급위별 인가일을 표시합니다.
          범스카우트 진급 신청서의 사진, 주소, 연락처 등 추가 입력 항목은 대원별로 보관됩니다.
          진급 인증서는 초급, 2급, 1급, 별, 무궁화 인증서만 출력하며 범스카우트는 제외합니다.
        </p>
      </section>
    </div>
  );
}

function BeomApplicationInputPanel({
  data,
  onChange,
  onPhotoChange,
  onReset,
  onPrint,
  printDisabled,
}: {
  data: BeomApplicationData;
  onChange: <K extends keyof BeomApplicationManualFields>(
    field: K,
    value: BeomApplicationManualFields[K],
  ) => void;
  onPhotoChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onReset: () => void;
  onPrint: () => void;
  printDisabled: boolean;
}) {
  const manual = data.manual;

  return (
    <div style={footerSettingsBoxStyle}>
      <div style={footerSettingsHeaderStyle}>
        <div>
          <h3 style={footerSettingsTitleStyle}>범스카우트 진급 신청서 수기 입력</h3>
          <p style={footerSettingsDescriptionStyle}>
            성명, 회원번호, 소속, 학교/학년, 진급사항, 기능장, WSEP/MoP, 출석률은 등록된 자료로 채워집니다. 사진, 주소, 연락처 등 추가 항목은 대원별로 입력합니다.
          </p>
        </div>

        <button type="button" style={secondaryButtonStyle} onClick={onReset}>
          이 대원 입력값 초기화
        </button>
      </div>

      <div style={filterGridStyle}>
        <label style={fieldLabelStyle}>
          사진 파일
          <input style={inputStyle} type="file" accept="image/*" onChange={onPhotoChange} />
        </label>

        <label style={fieldLabelStyle}>
          생년월일
          <input
            style={inputStyle}
            type="date"
            value={manual.birthDate}
            onChange={(event) => onChange("birthDate", event.target.value)}
          />
        </label>

        <label style={fieldLabelStyle}>
          특기
          <input
            style={inputStyle}
            value={manual.specialty}
            onChange={(event) => onChange("specialty", event.target.value)}
            placeholder="예: 매듭, 야영, 수영"
          />
        </label>

        <label style={fieldLabelStyle}>
          E-mail
          <input
            style={inputStyle}
            value={manual.email}
            onChange={(event) => onChange("email", event.target.value)}
            placeholder="이메일"
          />
        </label>

        <label style={fieldLabelStyle}>
          연락처
          <input
            style={inputStyle}
            value={manual.phone}
            onChange={(event) => onChange("phone", event.target.value)}
            placeholder="휴대전화"
          />
        </label>

        <label style={fieldLabelStyle}>
          신청일
          <input
            style={inputStyle}
            type="date"
            value={manual.applicationDate}
            onChange={(event) => onChange("applicationDate", event.target.value)}
          />
        </label>

        <label style={fieldLabelStyle}>
          봉사경력 개월
          <input
            style={inputStyle}
            value={manual.serviceCareerMonths}
            onChange={(event) => onChange("serviceCareerMonths", event.target.value)}
            placeholder="예: 6"
          />
        </label>

        <label style={fieldLabelStyle}>
          지도횟수
          <input
            style={inputStyle}
            value={manual.juniorLeaderTrainingCount}
            onChange={(event) => onChange("juniorLeaderTrainingCount", event.target.value)}
            placeholder="예: 5"
          />
        </label>

        <label style={fieldLabelStyle}>
          봉사시간
          <input
            style={inputStyle}
            value={manual.volunteerHours}
            onChange={(event) => onChange("volunteerHours", event.target.value)}
            placeholder="예: 15"
          />
        </label>

        <label style={fieldLabelStyle}>
          대장 성명
          <input
            style={inputStyle}
            value={manual.unitLeaderName}
            onChange={(event) => onChange("unitLeaderName", event.target.value)}
            placeholder="예: 홍길동"
          />
        </label>

        <label style={fieldLabelStyle}>
          육성단체대표
          <input
            style={inputStyle}
            value={manual.sponsorRepresentativeName}
            onChange={(event) => onChange("sponsorRepresentativeName", event.target.value)}
            placeholder="예: 대표자명"
          />
        </label>

        <div style={beomDeferredFieldNoticeStyle}>
          진급면접위원장 성명은 소속대에서 연맹으로 송부한 후 작성하는 항목입니다.
          출력물에는 수기 기재용 빈 영역만 표시됩니다.
        </div>
      </div>

      <label style={{ ...fieldLabelStyle, marginTop: "14px" }}>
        주소
        <input
          style={inputStyle}
          value={manual.address}
          onChange={(event) => onChange("address", event.target.value)}
          placeholder="주소"
        />
      </label>

      <div style={footerPrintActionStyle}>
        <button
          type="button"
          style={primaryButtonStyle}
          onClick={onPrint}
          disabled={printDisabled}
        >
          선택 항목 인쇄 / PDF 저장
        </button>
      </div>
    </div>
  );
}

function OfficialApprovalReportHeader({
  title,
  variant = "rank",
}: {
  title: string;
  variant?: "rank" | "badge";
}) {
  const isBadge = variant === "badge";

  return (
    <div
      className="official-approval-header"
      style={isBadge ? badgeApprovalHeaderStyle : rankApprovalHeaderStyle}
    >
      <img
        src={SCOUT_SYMBOL_IMAGE_SRC}
        alt="스카우트 휘장"
        style={isBadge ? badgeApprovalSymbolStyle : rankApprovalSymbolStyle}
      />
      <h2 style={isBadge ? badgeApprovalTitleStyle : rankApprovalTitleStyle}>{title}</h2>
    </div>
  );
}

function OfficialBeomApplicationHeader() {
  return (
    <div style={officialBeomHeaderStyle}>
      <img src={BEOM_MEDAL_IMAGE_SRC} alt="범스카우트 메달" style={officialBeomMedalStyle} />
      <h2 style={officialBeomTitleStyle}>범스카우트 진급 신청서</h2>
      <img src={BEOM_PATCH_IMAGE_SRC} alt="범스카우트 패치" style={officialBeomPatchStyle} />
    </div>
  );
}

function ReportHeader({
  title,
  organizationName,
  startDate,
  endDate,
  periodText,
  variant = "default",
}: {
  title: string;
  organizationName: string;
  startDate: string;
  endDate: string;
  periodText?: string;
  variant?: "default" | "rank_history";
}) {
  if (variant === "rank_history") {
    return (
      <div className="report-header" style={rankHistoryHeaderStyle}>
        <h2 style={rankHistoryTitleStyle}>{title}</h2>
        <div style={rankHistoryMetaGridStyle}>
          <div style={rankHistoryMetaOrgStyle}>소속: {organizationName}</div>
          <div style={rankHistoryMetaPeriodStyle}>
            조회범위: {periodText ?? "선택 소속 및 검색 결과"}
          </div>
          <div style={rankHistoryMetaDateStyle}>작성일: {getTodayText()}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="report-header" style={reportHeaderStyle}>
      <h2 style={reportTitleStyle}>{title}</h2>
      <div style={reportMetaGridStyle}>
        <div>소속: {organizationName}</div>
        <div>조회범위: {periodText ?? `${startDate} ~ ${endDate}`}</div>
        <div>작성일: {getTodayText()}</div>
      </div>
    </div>
  );
}

function ReportFooter({
  reportType,
  footerSettings,
  style,
  textStyle,
  dateStyle,
}: {
  reportType: ReportType;
  footerSettings: ReportFooterSettings;
  style?: CSSProperties;
  textStyle?: CSSProperties;
  dateStyle?: CSSProperties;
}) {
  const lineStyle = { ...reportFooterTextStyle, ...textStyle };
  const dateLineStyle = { ...reportFooterDateStyle, ...dateStyle };

  return (
    <div className="report-print-footer" style={{ ...reportFooterStyle, ...style }}>
      <p style={{ ...lineStyle, marginTop: 0 }}>
        위와 같이 {getReportFooterActionText(reportType)} 보고합니다.
      </p>
      <p
        className="report-footer-date"
        style={dateLineStyle}
        dangerouslySetInnerHTML={{ __html: formatReportDate(footerSettings.reportDate) }}
      />
      <p
        style={lineStyle}
        dangerouslySetInnerHTML={{
          __html: getReportFooterSignatureLine(footerSettings),
        }}
      />
      <p style={lineStyle}>
        {getReportFooterFederationLine(footerSettings)}
      </p>
    </div>
  );
}

function RankApprovalReportPage({
  rows,
  pageIndex,
  reportFooterSettings,
}: {
  rows: RankReportRow[];
  pageIndex: number;
  organizationName: string;
  startDate: string;
  endDate: string;
  reportFooterSettings: ReportFooterSettings;
}) {
  return (
    <div className="report-page rank-approval-page" style={rankApprovalPageStyle}>
      <div className="report-content-frame" style={rankApprovalContentFrameStyle}>
        <div className="report-header" style={rankApprovalHeaderAreaStyle}>
          <OfficialApprovalReportHeader title="진급 인가 보고서" variant="rank" />
        </div>

        <div className="report-table" style={rankApprovalTableAreaStyle}>
          <table style={rankApprovalTableStyle}>
            <thead>
              <tr>
                <th style={rankApprovalThNarrowStyle}>순</th>
                <th style={rankApprovalThStyle}>성명</th>
                <th style={rankApprovalThStyle}>현급위</th>
                <th style={rankApprovalThStyle}>급위</th>
                <th style={rankApprovalThStyle}>인가일</th>
                <th style={rankApprovalThNarrowStyle}>순</th>
                <th style={rankApprovalThStyle}>성명</th>
                <th style={rankApprovalThStyle}>현급위</th>
                <th style={rankApprovalThStyle}>급위</th>
                <th style={rankApprovalThStyle}>인가일</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: APPROVAL_TABLE_ROW_COUNT }).map((_, index) => {
                const left = rows[index] ?? null;
                const right = rows[index + APPROVAL_TABLE_ROW_COUNT] ?? null;
                const leftNo = pageIndex * RANK_APPROVAL_PAGE_SIZE + index + 1;
                const rightNo = pageIndex * RANK_APPROVAL_PAGE_SIZE + index + APPROVAL_TABLE_ROW_COUNT + 1;

                return (
                  <tr key={`rank-row-${pageIndex}-${index}`}>
                    <td style={rankApprovalTdCenterStyle}>{leftNo}</td>
                    <td style={rankApprovalTdStyle}>{left?.scoutName ?? ""}</td>
                    <td style={rankApprovalTdStyle}>{left?.previousRankName ?? ""}</td>
                    <td style={rankApprovalTdStyle}>{left?.approvedRankName ?? ""}</td>
                    <td style={rankApprovalTdCenterStyle}>{left?.approvedAt ?? ""}</td>
                    <td style={rankApprovalTdCenterStyle}>{rightNo}</td>
                    <td style={rankApprovalTdStyle}>{right?.scoutName ?? ""}</td>
                    <td style={rankApprovalTdStyle}>{right?.previousRankName ?? ""}</td>
                    <td style={rankApprovalTdStyle}>{right?.approvedRankName ?? ""}</td>
                    <td style={rankApprovalTdCenterStyle}>{right?.approvedAt ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="report-footer" style={rankApprovalFooterAreaStyle}>
          <ReportFooter
            reportType="rank_approval"
            footerSettings={reportFooterSettings}
            style={rankApprovalFooterStyle}
            textStyle={rankApprovalFooterTextStyle}
            dateStyle={rankApprovalFooterDateStyle}
          />
        </div>
      </div>
    </div>
  );
}

function RankHistoryReportPage({
  rows,
  ranks,
  pageIndex,
  organizationName,
  reportFooterSettings,
}: {
  rows: RankHistoryReportRow[];
  ranks: Rank[];
  pageIndex: number;
  organizationName: string;
  reportFooterSettings: ReportFooterSettings;
}) {
  return (
    <div className="report-page rank-history-page" style={rankHistoryPageStyle}>
      <div className="report-content-frame" style={rankHistoryContentFrameStyle}>
        <div className="report-header" style={rankHistoryHeaderAreaStyle}>
          <ReportHeader
            title="대원별 진급 이력표"
            organizationName={organizationName}
            startDate=""
            endDate=""
            periodText="선택 소속 및 검색 결과"
            variant="rank_history"
          />
        </div>

        <div className="report-table" style={rankHistoryTableAreaStyle}>
          <table style={rankHistoryTableStyle}>
            <thead>
              <tr>
                <th style={rankHistoryThNarrowStyle}>순</th>
                <th style={rankHistoryThStyle}>대원번호</th>
                <th style={rankHistoryThStyle}>성명</th>
                <th style={rankHistoryThStyle}>학교/학년</th>
                <th style={rankHistoryThStyle}>입단일</th>
                <th style={rankHistoryThStyle}>현재급위</th>
                {ranks.map((rank) => (
                  <th key={rank.id} style={rankHistoryThStyle}>{rank.rank_name}</th>
                ))}
                <th style={rankHistoryThStyle}>상태</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: RANK_HISTORY_PAGE_SIZE }).map((_, index) => {
                const row = rows[index] ?? null;
                const rowNo = pageIndex * RANK_HISTORY_PAGE_SIZE + index + 1;

                return (
                  <tr key={`rank-history-row-${pageIndex}-${index}`}>
                  <td style={rankHistoryTdCenterStyle}>{rowNo}</td>
                  <td style={rankHistoryTdCenterStyle}>{row?.memberNo ?? ""}</td>
                  <td style={rankHistoryTdStyle}>{row?.scoutName ?? ""}</td>
                  <td style={rankHistoryTdSchoolStyle}>
                    {row
                      ? [row.schoolName, row.grade].filter((value) => value !== "-").join(" / ") || "-"
                      : ""}
                  </td>
                    <td style={rankHistoryTdCenterStyle}>{row?.joinedAt ?? ""}</td>
                    <td style={rankHistoryTdCenterStyle}>{row?.currentRankName ?? ""}</td>
                    {ranks.map((rank) => (
                      <td key={`${row?.id ?? "empty"}-${rank.id}`} style={rankHistoryTdCenterStyle}>
                        {row?.rankApprovedAtByRankId[rank.id] ?? ""}
                      </td>
                    ))}
                    <td style={rankHistoryTdCenterStyle}>{row?.statusLabel ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="report-footer" style={rankHistoryFooterAreaStyle}>
          <ReportFooter
            reportType="rank_history"
            footerSettings={reportFooterSettings}
            style={rankHistoryFooterStyle}
            textStyle={rankHistoryFooterTextStyle}
            dateStyle={rankHistoryFooterDateStyle}
          />
        </div>
      </div>
    </div>
  );
}

function BadgeApprovalReportPage({
  rows,
  pageIndex,
  reportFooterSettings,
}: {
  rows: BadgeReportRow[];
  pageIndex: number;
  organizationName: string;
  startDate: string;
  endDate: string;
  reportFooterSettings: ReportFooterSettings;
}) {
  return (
    <div className="report-page badge-approval-page" style={badgeApprovalPageStyle}>
      <div className="report-content-frame" style={badgeApprovalContentFrameStyle}>
        <div className="report-header" style={badgeApprovalHeaderAreaStyle}>
          <OfficialApprovalReportHeader title="기능장 인가 보고서" variant="badge" />
        </div>

        <div className="report-table" style={badgeApprovalTableAreaStyle}>
          <table style={badgeApprovalTableStyle}>
            <thead>
              <tr>
                <th style={badgeApprovalThNarrowStyle}>순</th>
                <th style={badgeApprovalThStyle}>성명</th>
                <th style={badgeApprovalThStyle}>현급위</th>
                <th style={badgeApprovalThStyle}>기능장명</th>
                <th style={badgeApprovalThStyle}>인가일</th>
                <th style={badgeApprovalThNarrowStyle}>순</th>
                <th style={badgeApprovalThStyle}>성명</th>
                <th style={badgeApprovalThStyle}>현급위</th>
                <th style={badgeApprovalThStyle}>기능장명</th>
                <th style={badgeApprovalThStyle}>인가일</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: APPROVAL_TABLE_ROW_COUNT }).map((_, index) => {
                const left = rows[index] ?? null;
                const right = rows[index + APPROVAL_TABLE_ROW_COUNT] ?? null;
                const leftNo = pageIndex * BADGE_APPROVAL_PAGE_SIZE + index + 1;
                const rightNo = pageIndex * BADGE_APPROVAL_PAGE_SIZE + index + APPROVAL_TABLE_ROW_COUNT + 1;

                return (
                  <tr key={`badge-row-${pageIndex}-${index}`}>
                    <td style={badgeApprovalTdCenterStyle}>{leftNo}</td>
                    <td style={badgeApprovalTdStyle}>{left?.scoutName ?? ""}</td>
                    <td style={badgeApprovalTdStyle}>{left?.currentRankName ?? ""}</td>
                    <td style={badgeApprovalTdStyle}>{left?.badgeName ?? ""}</td>
                    <td style={badgeApprovalTdCenterStyle}>{left?.approvedAt ?? ""}</td>
                    <td style={badgeApprovalTdCenterStyle}>{rightNo}</td>
                    <td style={badgeApprovalTdStyle}>{right?.scoutName ?? ""}</td>
                    <td style={badgeApprovalTdStyle}>{right?.currentRankName ?? ""}</td>
                    <td style={badgeApprovalTdStyle}>{right?.badgeName ?? ""}</td>
                    <td style={badgeApprovalTdCenterStyle}>{right?.approvedAt ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="report-footer" style={badgeApprovalFooterAreaStyle}>
          <ReportFooter
            reportType="badge_approval"
            footerSettings={reportFooterSettings}
            style={badgeApprovalFooterStyle}
            textStyle={badgeApprovalFooterTextStyle}
            dateStyle={badgeApprovalFooterDateStyle}
          />
        </div>
      </div>
    </div>
  );
}

function RankCertificatePage({
  row,
  leaderName,
}: {
  row: RankReportRow;
  leaderName: string;
}) {
  const certificateImageSrc = getCertificateImageSrc(row.approvedRankName);
  const organizationName = row.organizationName === "-" ? "" : row.organizationName;
  const scoutName = row.scoutName === "-" ? "" : row.scoutName;
  const cleanLeaderName = leaderName.trim();
  const certificateDateText = getCertificateDateText(row.approvedAt);
  const organizationFontSize = getCertificateFieldFontSize(organizationName, "11pt", "9.8pt", "8.6pt");
  const scoutNameFontSize = getCertificateFieldFontSize(scoutName, "12pt", "10.8pt", "9.4pt");
  const leaderFontSize = getCertificateFieldFontSize(cleanLeaderName, "11pt", "10pt", "9pt");

  return (
    <div className="report-page rank-certificate-page" style={rankCertificatePageStyle}>
      {certificateImageSrc ? (
        <img
          src={certificateImageSrc}
          alt={`${row.approvedRankName} 진급 인증서`}
          style={rankCertificateBackgroundStyle}
        />
      ) : (
        <div style={rankCertificateFallbackBackgroundStyle}>
          {row.approvedRankName} 인증서 양식이 등록되지 않았습니다.
        </div>
      )}

      {certificateImageSrc && (
        <>
          <div style={{ ...rankCertificateOrganizationStyle, fontSize: organizationFontSize }}>
            {organizationName}
          </div>
          <div style={{ ...rankCertificateNameStyle, fontSize: scoutNameFontSize }}>
            {scoutName}
          </div>
          <div className="rank-certificate-date-overlay" style={rankCertificateDateOverlayStyle}>
            {certificateDateText}
          </div>
          <div style={{ ...rankCertificateLeaderStyle, fontSize: leaderFontSize }}>
            {cleanLeaderName}
          </div>
        </>
      )}
    </div>
  );
}

function BeomApplicationReportPage({ data }: { data: BeomApplicationData }) {
  const manual = data.manual;
  const programCertificateNo = data.program?.certificate_no ?? "";
  const programApprovedAt = formatDateBlank(data.program?.approved_at ?? data.program?.completed_at ?? null);
  const attendanceRateText =
    data.attendanceRate === null ? "" : `${data.attendanceRate}%`;

  const badgeApprovedAtByName = new Map(
    [...data.requiredBadgeRows, ...data.generalBadgeRows].map((row) => [
      row.badgeName,
      row.approvedAt,
    ]),
  );

  const getBadgeApprovedAt = (badgeName: string) => {
    return badgeApprovedAtByName.get(badgeName) ?? "";
  };

  const leftBadgeSlots = [
    { group: "2급", groupRowSpan: 2, badgeName: "시민장", approvedAt: getBadgeApprovedAt("시민장") },
    { badgeName: "하이킹장", approvedAt: getBadgeApprovedAt("하이킹장") },
    { group: "1급", groupRowSpan: 5, badgeName: "야영장", approvedAt: getBadgeApprovedAt("야영장") },
    { badgeName: "야외취사장", approvedAt: getBadgeApprovedAt("야외취사장") },
    { badgeName: "측정지도장", approvedAt: getBadgeApprovedAt("측정지도장") },
    { badgeName: "응급처치장", approvedAt: getBadgeApprovedAt("응급처치장") },
    { badgeName: "일반", approvedAt: "", isGeneralPlaceholder: true },
    { group: "별", groupRowSpan: 5, badgeName: "안전장", approvedAt: getBadgeApprovedAt("안전장") },
    { badgeName: "전통예절장", approvedAt: getBadgeApprovedAt("전통예절장") },
    { badgeName: "개척장", approvedAt: getBadgeApprovedAt("개척장") },
    { badgeName: "일반", approvedAt: "", isGeneralPlaceholder: true },
    { badgeName: "일반", approvedAt: "", isGeneralPlaceholder: true },
  ];

  const middleBadgeSlots = [
    { group: "무궁화", groupRowSpan: 6, badgeName: "수영장", approvedAt: getBadgeApprovedAt("수영장") },
    { badgeName: "환경보전장", approvedAt: getBadgeApprovedAt("환경보전장") },
    { badgeName: "세계우애장", approvedAt: getBadgeApprovedAt("세계우애장") },
    { badgeName: "일반", approvedAt: "", isGeneralPlaceholder: true },
    { badgeName: "일반", approvedAt: "", isGeneralPlaceholder: true },
    { badgeName: "일반", approvedAt: "", isGeneralPlaceholder: true },
    { group: "범", groupRowSpan: 6, badgeName: "학업장", approvedAt: getBadgeApprovedAt("학업장") },
    { badgeName: "구조장", approvedAt: getBadgeApprovedAt("구조장") },
    { badgeName: "생존장", approvedAt: getBadgeApprovedAt("생존장") },
    { badgeName: "일반", approvedAt: "", isGeneralPlaceholder: true },
    { badgeName: "일반", approvedAt: "", isGeneralPlaceholder: true },
    { badgeName: "일반", approvedAt: "", isGeneralPlaceholder: true },
  ];

  const rightGeneralBadgeSlots = Array.from({ length: 12 }).map((_, index) => {
    const generalBadge = data.generalBadgeRows[index] ?? null;

    return {
      group: index === 0 ? "일반" : undefined,
      groupRowSpan: index === 0 ? 12 : undefined,
      badgeName: generalBadge?.badgeName ?? "",
      approvedAt: generalBadge?.approvedAt ?? "",
    };
  });

  return (
    <div className="report-page beom-application-page" style={beomApplicationPageStyle}>
      <OfficialBeomApplicationHeader />

      <section style={beomSectionStyle}>
        <h3 style={beomSectionTitleStyle}>1. 인적사항</h3>
        <div style={beomPersonalGridStyle}>
          <div style={beomPhotoCellStyle}>
            {manual.photoDataUrl ? (
              <img src={manual.photoDataUrl} alt="대원 사진" style={beomPhotoStyle} />
            ) : (
              <div style={beomPhotoPlaceholderStyle}>사 진<br />3cm × 4cm<br />제복사진</div>
            )}
          </div>

          <table style={beomInfoTableStyle}>
            <tbody>
              <tr>
                <th style={beomThStyle}>성 명</th>
                <td style={beomTdStyle}>{data.scout.name}</td>
                <th style={beomThStyle}>회원번호</th>
                <td style={beomTdStyle}>{getDisplayValue(data.scout.member_no)}</td>
                <th style={beomThStyle}>학교/학년</th>
                <td style={beomTdStyle}>{[data.scout.school_name, data.scout.grade].filter(Boolean).join(" / ") || "-"}</td>
              </tr>
              <tr>
                <th style={beomThStyle}>소 속<br />(연맹/대)</th>
                <td style={beomTdStyle} colSpan={3}>{data.organizationName}</td>
                <th style={beomThStyle}>생년월일</th>
                <td style={beomTdStyle}>{formatDate(manual.birthDate)}</td>
              </tr>
              <tr>
                <th style={beomThStyle}>주 소</th>
                <td style={beomTdStyle} colSpan={3}>{getDisplayValue(manual.address)}</td>
                <th style={beomThStyle}>특 기</th>
                <td style={beomTdStyle}>{getDisplayValue(manual.specialty)}</td>
              </tr>
              <tr>
                <th style={beomThStyle}>E-mail</th>
                <td style={beomTdStyle} colSpan={3}>{getDisplayValue(manual.email)}</td>
                <th style={beomThStyle}>연락처<br />(휴대전화)</th>
                <td style={beomTdStyle}>{getDisplayValue(manual.phone)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section style={beomSectionStyle}>
        <h3 style={beomSectionTitleStyle}>
          2. 진급사항 / 진급 총 소요기간 : {data.totalPromotionMonths ?? ""}개월
          <span style={beomSmallTextStyle}> (스카우트 또는 벤처스카우트 등록일 ~ 범스카우트 진급 신청일)</span>
        </h3>
        <table style={beomInfoTableStyle}>
          <tbody>
            <tr>
              <th style={beomThStyle}>급 위</th>
              <th style={beomThStyle}>인 가 일</th>
              <th style={beomThStyle}>급 위</th>
              <th style={beomThStyle}>인 가 일</th>
              <th style={beomThStyle}>급 위</th>
              <th style={beomThStyle}>인 가 일</th>
            </tr>
            <tr>
              <td style={beomTdCenterStyle}>등록일(S,V)</td>
              <td style={beomTdCenterStyle}>{formatDate(data.scout.joined_at)}</td>
              <td style={beomTdCenterStyle}>2급</td>
              <td style={beomTdCenterStyle}>{data.rankDateByLabel["2급"]}</td>
              <td style={beomTdCenterStyle}>별</td>
              <td style={beomTdCenterStyle}>{data.rankDateByLabel["별"]}</td>
            </tr>
            <tr>
              <td style={beomTdCenterStyle}>초급</td>
              <td style={beomTdCenterStyle}>{data.rankDateByLabel["초급"]}</td>
              <td style={beomTdCenterStyle}>1급</td>
              <td style={beomTdCenterStyle}>{data.rankDateByLabel["1급"]}</td>
              <td style={beomTdCenterStyle}>무궁화</td>
              <td style={beomTdCenterStyle}>{data.rankDateByLabel["무궁화"]}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section style={beomSectionStyle}>
        <h3 style={beomSectionTitleStyle}>3. 기능장취득사항</h3>
        <table style={beomBadgeTableStyle}>
          <thead>
            <tr>
              <th style={beomBadgeGroupHeaderStyle}></th>
              <th style={beomThStyle}>기능장명</th>
              <th style={beomThStyle}>취득 인가일</th>
              <th style={beomBadgeGroupHeaderStyle}></th>
              <th style={beomThStyle}>기능장명</th>
              <th style={beomThStyle}>취득 인가일</th>
              <th style={beomBadgeGroupHeaderStyle}></th>
              <th style={beomThStyle}>기능장명</th>
              <th style={beomThStyle}>취득 인가일</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 12 }).map((_, index) => {
              const left = leftBadgeSlots[index];
              const middle = middleBadgeSlots[index];
              const right = rightGeneralBadgeSlots[index];

              return (
                <tr key={`beom-badge-row-${index}`}>
                  {left.group && (
                    <td rowSpan={left.groupRowSpan} style={beomBadgeGroupCellStyle}>
                      {left.group}
                    </td>
                  )}
                  <td
                    style={
                      left.isGeneralPlaceholder
                        ? beomGeneralPlaceholderCellStyle
                        : beomBadgeNameTdStyle
                    }
                  >
                    {left.badgeName}
                  </td>
                  <td style={beomTdCenterStyle}>{left.approvedAt}</td>

                  {middle.group && (
                    <td rowSpan={middle.groupRowSpan} style={beomBadgeGroupCellStyle}>
                      {middle.group}
                    </td>
                  )}
                  <td
                    style={
                      middle.isGeneralPlaceholder
                        ? beomGeneralPlaceholderCellStyle
                        : beomBadgeNameTdStyle
                    }
                  >
                    {middle.badgeName}
                  </td>
                  <td style={beomTdCenterStyle}>{middle.approvedAt}</td>

                  {right.group && (
                    <td rowSpan={right.groupRowSpan} style={beomBadgeGroupCellStyle}>
                      {right.group}
                    </td>
                  )}
                  <td style={beomBadgeNameTdStyle}>{right.badgeName}</td>
                  <td style={beomTdCenterStyle}>{right.approvedAt}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p style={beomFootnoteStyle}>※ 각 급위에 표시된 기능장의 취득 인가일은 해당 급위의 진급 인가일 이전이어야 함.</p>
      </section>

      <section style={beomSectionStyle}>
        <h3 style={beomSectionTitleStyle}>4. 활동 및 봉사사항</h3>
        <table style={beomInfoTableStyle}>
          <tbody>
            <tr>
              <th style={beomActivityThStyle}>대집회, 대활동 참가사항(80% 이상)</th>
              <td style={beomTdStyle}>출석률 {attendanceRateText} <span style={beomSmallTextStyle}>({data.attendancePresentCount}/{data.attendanceTotalCount}, 참고 지표)</span></td>
            </tr>
            <tr>
              <th style={beomActivityThStyle}>연소지도자로서의 봉사경력 및 지도횟수(총 5회 이상)</th>
              <td style={beomTdStyle}>봉사경력 {getDisplayValue(manual.serviceCareerMonths)} 개월 / 지도횟수 {getDisplayValue(manual.juniorLeaderTrainingCount)} 회</td>
            </tr>
            <tr>
              <th style={beomActivityThStyle}>가정, 학교, 지역사회에의 봉사활동 실천도(15시간 이상)</th>
              <td style={beomTdStyle}>봉사 : {getDisplayValue(manual.volunteerHours)} 시간</td>
            </tr>
            <tr>
              <th style={beomActivityThStyle}>세계스카우트 자연환경 프로그램 참가 확인</th>
              <td style={beomTdStyle}>수료증번호: {getDisplayValue(programCertificateNo)} / 승인일: {programApprovedAt || "-"} {data.program ? `(${data.program.program_type})` : ""}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section style={beomSignatureSectionStyle}>
        <p style={beomStatementStyle}>
          위 사항과 첨부된 진급 과제 체크리스트가 사실과 이상이 없으므로<br />
          이에 범스카우트 진급을 신청합니다.
        </p>
        <div style={beomDateLineStyle}>{formatKoreanDate(manual.applicationDate)}</div>
        <div style={beomSignatureLineStyle}>대 장&nbsp;&nbsp;{getDisplayValue(manual.unitLeaderName)}&nbsp;&nbsp;(인)</div>
        <div style={beomSignatureLineStyle}>육성단체대표&nbsp;&nbsp;{getDisplayValue(manual.sponsorRepresentativeName)}&nbsp;&nbsp;(인)</div>

        <p style={beomStatementStyle}>
          위 사실에 근거하여 진급면접위원회에서 범스카우트로 진급할 수 있는 자격을<br />
          인정 하였기에 이에 범스카우트 인가를 신청합니다.
        </p>
        <div style={beomDateLineStyle}>{formatKoreanDate(manual.applicationDate)}</div>
        <div style={beomSignatureLineStyle}>
          진급면접위원장&nbsp;&nbsp;<span style={beomHandwriteNameLineStyle} />&nbsp;&nbsp;(인)
        </div>
      </section>
    </div>
  );
}

const pageHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "24px",
  marginBottom: "24px",
};

const pageTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "30px",
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

const reportsPageRootStyle: CSSProperties = {
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  position: "relative",
  zIndex: 0,
  overflowX: "hidden",
  isolation: "isolate",
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "16px",
  marginBottom: "32px",
};

const summaryCardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  padding: "20px",
  backgroundColor: "#ffffff",
};

const summarySuccessCardStyle: CSSProperties = {
  ...summaryCardStyle,
  borderColor: "#bbf7d0",
  backgroundColor: "#f0fdf4",
};

const summarySelectedCardStyle: CSSProperties = {
  ...summaryCardStyle,
  borderColor: "#bfdbfe",
  backgroundColor: "#eff6ff",
};

const summaryWarningCardStyle: CSSProperties = {
  ...summaryCardStyle,
  borderColor: "#fed7aa",
  backgroundColor: "#fff7ed",
};

const summaryTargetCardOpenStyle: CSSProperties = {
  border: "2px solid #2563eb",
  backgroundColor: "#eff6ff",
  cursor: "pointer",
  outline: "none",
};

const summaryTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "15px",
  color: "#475569",
};

const summaryValueStyle: CSSProperties = {
  marginTop: "12px",
  marginBottom: 0,
  fontSize: "20px",
  fontWeight: 800,
  color: "#0f172a",
};

const summaryDescriptionStyle: CSSProperties = {
  marginTop: "8px",
  marginBottom: 0,
  color: "#64748b",
  fontSize: "14px",
  lineHeight: 1.5,
};

const contentCardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  padding: "20px",
  backgroundColor: "#ffffff",
  marginBottom: "24px",
  boxSizing: "border-box",
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
};

const previewCardStyle: CSSProperties = {
  ...contentCardStyle,
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  position: "relative",
  zIndex: 0,
  overflowX: "auto",
  isolation: "isolate",
};

const toolbarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "16px",
  marginBottom: "20px",
};

const toolbarRightStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "flex-end",
  gap: "8px",
  alignItems: "center",
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "22px",
  fontWeight: 800,
  color: "#0f172a",
};

const sectionDescriptionStyle: CSSProperties = {
  marginTop: "6px",
  marginBottom: 0,
  color: "#64748b",
};

const reportGuideBoxStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "10px 24px",
  marginBottom: "14px",
  padding: "12px 14px",
  border: "1px solid #dbeafe",
  borderRadius: "12px",
  backgroundColor: "#f8fbff",
  boxSizing: "border-box",
  width: "100%",
  minWidth: 0,
};

const reportGuideMainStyle: CSSProperties = {
  flex: "1 1 240px",
  minWidth: 0,
};

const reportGuideTitleStyle: CSSProperties = {
  display: "block",
  color: "#0f172a",
  fontSize: "16px",
  fontWeight: 800,
};

const reportGuideMetaStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: "0 1 220px",
  alignItems: "flex-start",
  gap: "4px",
  minWidth: 0,
  color: "#334155",
  fontSize: "12.5px",
  fontWeight: 700,
  lineHeight: 1.45,
};

const reportGuideRuleStyle: CSSProperties = {
  margin: "6px 0 0",
  color: "#475569",
  fontSize: "13px",
  fontWeight: 500,
  lineHeight: 1.45,
};

const reviewWarningBoxStyle: CSSProperties = {
  marginBottom: "16px",
  padding: "12px 14px",
  border: "1px solid #fed7aa",
  borderRadius: "10px",
  backgroundColor: "#fff7ed",
  color: "#9a3412",
  fontSize: "13px",
  lineHeight: 1.6,
};

const filterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "14px",
};

const reportSearchPanelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  padding: "10px 12px",
  borderRadius: "12px",
  border: "1px solid #e5e7eb",
  backgroundColor: "#f8fafc",
  boxSizing: "border-box",
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
};

const reportSearchFiltersRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
  gap: "10px 12px",
  alignItems: "end",
  width: "100%",
  minWidth: 0,
};

const reportSearchActionsRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "10px 12px",
  alignItems: "center",
  width: "100%",
  minWidth: 0,
};

const reportSearchFieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  width: "100%",
  minWidth: 0,
  maxWidth: "100%",
  boxSizing: "border-box",
  color: "#334155",
  fontSize: "12.5px",
  fontWeight: 800,
};

const reportSearchSelectStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  maxWidth: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  fontSize: "13.5px",
  backgroundColor: "#ffffff",
};

const reportSearchInputStyle: CSSProperties = {
  flex: "1 1 280px",
  width: "100%",
  maxWidth: "520px",
  minWidth: 0,
  boxSizing: "border-box",
  padding: "8px 10px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  fontSize: "14px",
  backgroundColor: "#ffffff",
};

const reportSearchResetButtonStyle: CSSProperties = {
  flex: "0 0 auto",
  padding: 0,
  border: "none",
  backgroundColor: "transparent",
  color: "#64748b",
  fontSize: "12px",
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "underline",
  textUnderlineOffset: "2px",
  whiteSpace: "nowrap",
};

const reportSearchCountStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "baseline",
  gap: "4px 6px",
  flex: "0 1 auto",
  minWidth: 0,
  margin: 0,
  padding: 0,
  border: "none",
  backgroundColor: "transparent",
  color: "#64748b",
  fontSize: "13px",
  fontWeight: 500,
  lineHeight: 1.4,
  cursor: "default",
  userSelect: "none",
};

const reportSearchCountLabelStyle: CSSProperties = {
  color: "#94a3b8",
  fontWeight: 500,
};

const reportSearchCountNumberStyle: CSSProperties = {
  color: "#0f172a",
  fontWeight: 700,
};

const reportSearchCountTotalStyle: CSSProperties = {
  color: "#94a3b8",
  fontWeight: 500,
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
  padding: "10px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  fontSize: "14px",
  backgroundColor: "#ffffff",
};

const primaryButtonStyle: CSSProperties = {
  padding: "10px 14px",
  borderRadius: "8px",
  border: "none",
  backgroundColor: "#2563eb",
  color: "#ffffff",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  padding: "10px 14px",
  borderRadius: "8px",
  border: "1px solid #cbd5e1",
  backgroundColor: "#ffffff",
  color: "#334155",
  fontWeight: 700,
  cursor: "pointer",
};

const smallSecondaryButtonStyle: CSSProperties = {
  padding: "7px 10px",
  borderRadius: "8px",
  border: "1px solid #cbd5e1",
  backgroundColor: "#ffffff",
  color: "#334155",
  fontSize: "12px",
  fontWeight: 800,
  cursor: "pointer",
};

const printCheckBoxStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: "8px",
  marginTop: "12px",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid #bbf7d0",
  backgroundColor: "#f0fdf4",
};

const printCheckHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
};

const printCheckTextStyle: CSSProperties = {
  flex: "1 1 240px",
  minWidth: 0,
};

const targetPreviewOpenButtonStyle: CSSProperties = {
  padding: "8px 12px",
  borderRadius: "8px",
  border: "1px solid #86efac",
  backgroundColor: "#ffffff",
  color: "#14532d",
  fontSize: "13px",
  fontWeight: 800,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const printCheckTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "15px",
  fontWeight: 800,
  color: "#14532d",
};

const printCheckDescriptionStyle: CSSProperties = {
  marginTop: "4px",
  marginBottom: 0,
  color: "#166534",
  fontSize: "13px",
  lineHeight: 1.45,
};

const printCheckCountStrongStyle: CSSProperties = {
  color: "#14532d",
  fontWeight: 800,
};

const reprintNoticeStyle: CSSProperties = {
  marginTop: "4px",
  marginBottom: 0,
  color: "#64748b",
  fontSize: "12px",
  fontWeight: 500,
  lineHeight: 1.45,
};

const targetPreviewBoxStyle: CSSProperties = {
  marginTop: "8px",
  padding: "16px",
  borderRadius: "12px",
  border: "1px solid #e5e7eb",
  backgroundColor: "#ffffff",
};

const targetPreviewHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "16px",
  marginBottom: "12px",
};

const targetPreviewTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "18px",
  fontWeight: 800,
  color: "#0f172a",
};

const targetPreviewDescriptionStyle: CSSProperties = {
  marginTop: "6px",
  marginBottom: 0,
  color: "#64748b",
  fontSize: "13px",
  lineHeight: 1.5,
};

const targetPreviewCountStyle: CSSProperties = {
  padding: "8px 12px",
  borderRadius: "999px",
  backgroundColor: "#eff6ff",
  color: "#1d4ed8",
  fontSize: "14px",
  whiteSpace: "nowrap",
};

const targetPreviewActionStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: "8px",
};


const targetPreviewTableWrapStyle: CSSProperties = {
  maxHeight: "360px",
  overflow: "auto",
  border: "1px solid #e5e7eb",
  borderRadius: "10px",
};

const targetPreviewTableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "13px",
};

const targetPreviewThStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 1,
  padding: "10px 8px",
  borderBottom: "1px solid #e5e7eb",
  backgroundColor: "#f8fafc",
  color: "#334155",
  textAlign: "left",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const targetPreviewCheckThStyle: CSSProperties = {
  ...targetPreviewThStyle,
  width: "54px",
  textAlign: "center",
};

const targetPreviewThNarrowStyle: CSSProperties = {
  ...targetPreviewThStyle,
  width: "54px",
  textAlign: "center",
};

const targetPreviewThCenterStyle: CSSProperties = {
  ...targetPreviewThStyle,
  textAlign: "center",
};

const targetPreviewTdStyle: CSSProperties = {
  padding: "10px 8px",
  borderBottom: "1px solid #f1f5f9",
  color: "#334155",
  verticalAlign: "middle",
  wordBreak: "keep-all",
};

const targetPreviewTdCenterStyle: CSSProperties = {
  ...targetPreviewTdStyle,
  textAlign: "center",
  whiteSpace: "nowrap",
};

const targetPreviewStrongTdStyle: CSSProperties = {
  ...targetPreviewTdStyle,
  color: "#0f172a",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const targetPreviewUncheckedRowStyle: CSSProperties = {
  opacity: 0.48,
  backgroundColor: "#f8fafc",
};

const footerSettingsBoxStyle: CSSProperties = {
  marginTop: 0,
  padding: "16px",
  borderRadius: "12px",
  border: "1px solid #bfdbfe",
  backgroundColor: "#eff6ff",
  boxSizing: "border-box",
  width: "100%",
  minWidth: 0,
};

const footerPrintActionStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: "8px",
  marginTop: "16px",
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
};

const footerSettingsHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "16px",
  marginBottom: "14px",
  flexWrap: "wrap",
};

const footerSettingsHeaderTextStyle: CSSProperties = {
  flex: "1 1 240px",
  minWidth: 0,
};

const footerResetButtonStyle: CSSProperties = {
  ...secondaryButtonStyle,
  flexShrink: 0,
  alignSelf: "flex-start",
  whiteSpace: "nowrap",
  minWidth: "88px",
  width: "auto",
};

const footerSettingsTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "18px",
  fontWeight: 800,
  color: "#0f172a",
};

const footerSettingsDescriptionStyle: CSSProperties = {
  marginTop: "6px",
  marginBottom: 0,
  color: "#64748b",
  fontSize: "13px",
  lineHeight: 1.5,
};

const footerPreviewStyle: CSSProperties = {
  marginTop: "14px",
  padding: "12px",
  borderRadius: "10px",
  border: "1px solid #bfdbfe",
  backgroundColor: "#ffffff",
  color: "#0f172a",
  fontSize: "13px",
  fontWeight: 700,
  lineHeight: 1.8,
  textAlign: "center",
};

const helpTextStyle: CSSProperties = {
  marginTop: "12px",
  marginBottom: 0,
  color: "#64748b",
  fontSize: "13px",
  lineHeight: 1.6,
};

const emptyStateStyle: CSSProperties = {
  padding: "32px",
  borderRadius: "12px",
  backgroundColor: "#f8fafc",
  color: "#64748b",
  textAlign: "center",
};

const errorBoxStyle: CSSProperties = {
  padding: "16px",
  borderRadius: "10px",
  backgroundColor: "#fef2f2",
  color: "#b91c1c",
  fontWeight: 700,
  marginBottom: "16px",
};

const previewHeaderStyle: CSSProperties = {
  marginBottom: "16px",
};

const printGuideTextStyle: CSSProperties = {
  marginTop: "8px",
  marginBottom: 0,
  color: "#64748b",
  fontSize: "12.5px",
  lineHeight: 1.5,
};

const previewScaleViewportStyle: CSSProperties = {
  width: "100%",
  overflow: "hidden",
  backgroundColor: "#f8fafc",
  borderRadius: "10px",
  boxSizing: "border-box",
  display: "flex",
  justifyContent: "center",
};

const previewScaleWrapperStyle: CSSProperties = {
  width: "210mm",
  transformOrigin: "top center",
  flexShrink: 0,
};

const printAreaStyle: CSSProperties = {
  position: "relative",
  zIndex: 0,
  backgroundColor: "transparent",
  padding: 0,
  margin: 0,
};

const reportA4BaseStyle: CSSProperties = {
  width: "210mm",
  maxWidth: "210mm",
  height: "297mm",
  minHeight: "297mm",
  margin: "0 auto 24px",
  boxSizing: "border-box",
  backgroundColor: "#ffffff",
  color: "#111827",
  border: "1px solid #e5e7eb",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
  fontFamily: "Arial, 'Noto Sans KR', sans-serif",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

/** 범·기타 공용 A4 (보고서 3종은 각자 전용 스타일 사용) */
const reportPageStyle: CSSProperties = {
  ...reportA4BaseStyle,
  padding: "18mm",
};

/* ----- 진급 인가 보고서 (연속 content-frame, 표·글꼴 유지) -----
 * CSS 설계값 합산(1mm≈3.78px 환산 포함):
 * page inner = 297−17−16 = 264mm
 * header ≈ 48px+8px+30px ≈ 22.8mm
 * header–table = 8mm
 * table = 21×8mm = 168mm
 * table–footer = 12mm
 * footer ≈ 28mm (문구+간격)
 * frame total ≈ 238.8mm + frame margin-top 6mm
 * footer bottom clearance ≈ 264−6−238.8 ≈ 19.2mm
 */
const rankApprovalPageStyle: CSSProperties = {
  ...reportA4BaseStyle,
  display: "block",
  padding: "17mm 14mm 16mm",
};

const rankApprovalContentFrameStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "auto",
  width: "100%",
  marginTop: "6mm",
};

const rankApprovalHeaderAreaStyle: CSSProperties = {
  flex: "0 0 auto",
};

const rankApprovalHeaderStyle: CSSProperties = {
  textAlign: "center",
  marginBottom: "8mm",
};

const rankApprovalSymbolStyle: CSSProperties = {
  width: "48px",
  height: "48px",
  objectFit: "contain",
  display: "block",
  margin: "0 auto 8px",
};

const rankApprovalTitleStyle: CSSProperties = {
  display: "inline-block",
  margin: 0,
  paddingBottom: "3px",
  borderBottom: "2px solid #111827",
  fontFamily: "'Noto Serif KR', 'Batang', serif",
  fontSize: "30px",
  fontWeight: 900,
  letterSpacing: "5px",
  color: "#111827",
};

const rankApprovalTableAreaStyle: CSSProperties = {
  flex: "0 0 auto",
  width: "100%",
};

const rankApprovalTableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
  fontSize: "10.5px",
};

const rankApprovalThStyle: CSSProperties = {
  border: "1px solid #111827",
  padding: "2px 3px",
  height: "8mm",
  textAlign: "center",
  backgroundColor: "#f3f4f6",
  fontWeight: 900,
  boxSizing: "border-box",
  lineHeight: 1.15,
};

const rankApprovalThNarrowStyle: CSSProperties = {
  ...rankApprovalThStyle,
  width: "26px",
};

const rankApprovalTdStyle: CSSProperties = {
  border: "1px solid #111827",
  padding: "1px 3px",
  height: "8mm",
  maxHeight: "8mm",
  verticalAlign: "middle",
  wordBreak: "keep-all",
  overflow: "hidden",
  boxSizing: "border-box",
  lineHeight: 1.15,
};

const rankApprovalTdCenterStyle: CSSProperties = {
  ...rankApprovalTdStyle,
  textAlign: "center",
};

const rankApprovalFooterAreaStyle: CSSProperties = {
  flex: "0 0 auto",
  marginTop: "12mm",
};

const rankApprovalFooterStyle: CSSProperties = {
  marginTop: 0,
  textAlign: "center",
  fontSize: "12px",
  color: "#111827",
  lineHeight: 1.45,
};

const rankApprovalFooterTextStyle: CSSProperties = {
  marginTop: "4.5mm",
  marginBottom: 0,
};

const rankApprovalFooterDateStyle: CSSProperties = {
  marginTop: "6mm",
  marginBottom: 0,
};

/* ----- 기능장 인가 보고서 (기준 템플릿, 최소 미세 조정) -----
 * page inner = 297−11−14 = 272mm
 * header ≈ 50px+10px+30px ≈ 23.8mm
 * header–table = 7mm
 * table = 21×9mm = 189mm
 * table–footer = 10mm
 * footer ≈ 28mm
 * frame total ≈ 257.8mm + frame margin-top 2mm
 * footer bottom clearance ≈ 272−2−257.8 ≈ 12.2mm
 */
const badgeApprovalPageStyle: CSSProperties = {
  ...reportA4BaseStyle,
  display: "block",
  padding: "11mm 12mm 14mm",
};

const badgeApprovalContentFrameStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "auto",
  width: "100%",
  marginTop: "2mm",
};

const badgeApprovalHeaderAreaStyle: CSSProperties = {
  flex: "0 0 auto",
};

const badgeApprovalHeaderStyle: CSSProperties = {
  textAlign: "center",
  marginBottom: "7mm",
};

const badgeApprovalSymbolStyle: CSSProperties = {
  width: "50px",
  height: "50px",
  objectFit: "contain",
  display: "block",
  margin: "0 auto 10px",
};

const badgeApprovalTitleStyle: CSSProperties = {
  display: "inline-block",
  margin: 0,
  paddingBottom: "3px",
  borderBottom: "2px solid #111827",
  fontFamily: "'Noto Serif KR', 'Batang', serif",
  fontSize: "30px",
  fontWeight: 900,
  letterSpacing: "5px",
  color: "#111827",
};

const badgeApprovalTableAreaStyle: CSSProperties = {
  flex: "0 0 auto",
  width: "100%",
};

const badgeApprovalTableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
  fontSize: "11px",
};

const badgeApprovalThStyle: CSSProperties = {
  border: "1px solid #111827",
  padding: "3px 4px",
  height: "9mm",
  textAlign: "center",
  backgroundColor: "#f3f4f6",
  fontWeight: 900,
  boxSizing: "border-box",
  lineHeight: 1.2,
};

const badgeApprovalThNarrowStyle: CSSProperties = {
  ...badgeApprovalThStyle,
  width: "26px",
};

const badgeApprovalTdStyle: CSSProperties = {
  border: "1px solid #111827",
  padding: "2px 4px",
  height: "9mm",
  maxHeight: "9mm",
  verticalAlign: "middle",
  wordBreak: "keep-all",
  overflow: "hidden",
  boxSizing: "border-box",
  lineHeight: 1.2,
};

const badgeApprovalTdCenterStyle: CSSProperties = {
  ...badgeApprovalTdStyle,
  textAlign: "center",
};

const badgeApprovalFooterAreaStyle: CSSProperties = {
  flex: "0 0 auto",
  marginTop: "10mm",
};

const badgeApprovalFooterStyle: CSSProperties = {
  marginTop: 0,
  textAlign: "center",
  fontSize: "12px",
  color: "#111827",
  lineHeight: 1.45,
};

const badgeApprovalFooterTextStyle: CSSProperties = {
  marginTop: "4.5mm",
  marginBottom: 0,
};

const badgeApprovalFooterDateStyle: CSSProperties = {
  marginTop: "6mm",
  marginBottom: 0,
};

/* ----- 대원별 진급 이력표 (연속 content-frame, 20명/페이지) -----
 * 행 9.0mm, table≈189mm, frame margin-top 14mm, table–footer 7mm
 * page inner = 297−13−14 = 270mm
 * header block ≈ 20.3mm
 * table = 21×9.0mm = 189mm
 * table–footer = 7mm
 * footer ≈ 26mm
 * frame total ≈ 242.3mm + frame margin-top 14mm
 * footer bottom clearance ≈ 270−14−242.3 ≈ 13.7mm
 */
const rankHistoryPageStyle: CSSProperties = {
  ...reportA4BaseStyle,
  display: "block",
  padding: "13mm 7mm 14mm",
};

const rankHistoryContentFrameStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "auto",
  width: "100%",
  marginTop: "14mm",
};

const rankHistoryHeaderAreaStyle: CSSProperties = {
  flex: "0 0 auto",
};

const rankHistoryHeaderStyle: CSSProperties = {
  marginBottom: "5.5mm",
};

const rankHistoryTitleStyle: CSSProperties = {
  margin: 0,
  textAlign: "center",
  fontSize: "22px",
  fontWeight: 900,
  color: "#111827",
};

const rankHistoryMetaGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "30% 40% 30%",
  gap: "0 6px",
  marginTop: "5mm",
  fontSize: "11px",
  color: "#374151",
  alignItems: "center",
  width: "100%",
};

const rankHistoryMetaOrgStyle: CSSProperties = {
  minWidth: 0,
  whiteSpace: "nowrap",
  overflow: "hidden",
};

const rankHistoryMetaPeriodStyle: CSSProperties = {
  minWidth: 0,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textAlign: "center",
};

const rankHistoryMetaDateStyle: CSSProperties = {
  minWidth: 0,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textAlign: "right",
};

const rankHistoryTableAreaStyle: CSSProperties = {
  flex: "0 0 auto",
  width: "100%",
};

const rankHistoryTableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
  fontSize: "8.5px",
};

const rankHistoryThStyle: CSSProperties = {
  border: "1px solid #111827",
  padding: "1px 2px",
  height: "9mm",
  maxHeight: "9mm",
  minHeight: "9mm",
  textAlign: "center",
  backgroundColor: "#f3f4f6",
  fontWeight: 900,
  boxSizing: "border-box",
  lineHeight: 1.1,
  overflow: "hidden",
  verticalAlign: "middle",
};

const rankHistoryThNarrowStyle: CSSProperties = {
  ...rankHistoryThStyle,
  width: "22px",
};

const rankHistoryTdStyle: CSSProperties = {
  border: "1px solid #111827",
  padding: "1px 2px",
  height: "9mm",
  maxHeight: "9mm",
  minHeight: "9mm",
  verticalAlign: "middle",
  wordBreak: "keep-all",
  overflow: "hidden",
  boxSizing: "border-box",
  lineHeight: 1.1,
  whiteSpace: "nowrap",
};

const rankHistoryTdCenterStyle: CSSProperties = {
  ...rankHistoryTdStyle,
  textAlign: "center",
};

/** 학교/학년: 행 높이 안에서 최대 2줄까지 허용 */
const rankHistoryTdSchoolStyle: CSSProperties = {
  ...rankHistoryTdStyle,
  whiteSpace: "normal",
  wordBreak: "keep-all",
  lineHeight: 1.15,
};

const rankHistoryFooterAreaStyle: CSSProperties = {
  flex: "0 0 auto",
  marginTop: "7mm",
};

const rankHistoryFooterStyle: CSSProperties = {
  marginTop: 0,
  textAlign: "center",
  fontSize: "11.5px",
  color: "#111827",
  lineHeight: 1.4,
};

const rankHistoryFooterTextStyle: CSSProperties = {
  marginTop: "4.5mm",
  marginBottom: 0,
};

const rankHistoryFooterDateStyle: CSSProperties = {
  marginTop: "6mm",
  marginBottom: 0,
};

const officialBeomHeaderStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "32px max-content 38px",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
  width: "fit-content",
  maxWidth: "92%",
  margin: "0 auto 8px",
  padding: "4px 10px",
  borderTop: "2px solid #111827",
  borderBottom: "2px solid #111827",
};

const officialBeomMedalStyle: CSSProperties = {
  width: "32px",
  height: "32px",
  objectFit: "contain",
};

const officialBeomPatchStyle: CSSProperties = {
  width: "38px",
  height: "38px",
  objectFit: "contain",
  justifySelf: "end",
};

const officialBeomTitleStyle: CSSProperties = {
  margin: 0,
  textAlign: "center",
  fontSize: "25px",
  fontWeight: 900,
  letterSpacing: "5px",
  color: "#111827",
  whiteSpace: "nowrap",
};

const reportHeaderStyle: CSSProperties = {
  marginBottom: "18px",
};

const reportTitleStyle: CSSProperties = {
  margin: 0,
  textAlign: "center",
  fontSize: "24px",
  fontWeight: 900,
  color: "#111827",
};

const reportMetaGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: "8px",
  marginTop: "16px",
  fontSize: "12px",
  color: "#374151",
};

const reportFooterStyle: CSSProperties = {
  marginTop: "28px",
  textAlign: "center",
  fontSize: "13px",
  color: "#111827",
  lineHeight: 1.8,
};

const reportFooterTextStyle: CSSProperties = {
  marginTop: "8px",
  marginBottom: 0,
};

const reportFooterDateStyle: CSSProperties = {
  marginTop: "18px",
  marginBottom: 0,
};

const rankCertificatePageStyle: CSSProperties = {
  width: "210mm",
  minHeight: "297mm",
  height: "297mm",
  margin: "0 auto 24px",
  padding: 0,
  boxSizing: "border-box",
  backgroundColor: "#ffffff",
  color: "#111827",
  border: "1px solid #e5e7eb",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
  position: "relative",
  overflow: "hidden",
  fontFamily: "'Noto Serif KR', 'Batang', serif",
};

const rankCertificateBackgroundStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const rankCertificateFallbackBackgroundStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "6mm solid #0f172a",
  color: "#0f172a",
  fontSize: "20px",
  fontWeight: 900,
  backgroundColor: "#ffffff",
};

const rankCertificateTextBaseStyle: CSSProperties = {
  position: "absolute",
  color: "#111827",
  fontFamily: "'Noto Serif KR', 'Batang', serif",
  fontWeight: 900,
  lineHeight: 1.2,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const rankCertificateOrganizationStyle: CSSProperties = {
  ...rankCertificateTextBaseStyle,
  left: "173.5mm",
  top: "95.4mm",
  width: "34mm",
  minHeight: "7mm",
  fontSize: "11pt",
  padding: "0.2mm 0",
  boxSizing: "border-box",
};

const rankCertificateNameStyle: CSSProperties = {
  ...rankCertificateTextBaseStyle,
  left: "173.5mm",
  top: "103.9mm",
  width: "34mm",
  minHeight: "7mm",
  fontSize: "12pt",
  padding: "0.2mm 0",
  boxSizing: "border-box",
};

const rankCertificateDateOverlayStyle: CSSProperties = {
  ...rankCertificateTextBaseStyle,
  left: "111.8mm",
  top: "193.9mm",
  width: "50mm",
  height: "9mm",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  fontSize: "14.5pt",
  letterSpacing: "0.35mm",
  backgroundColor: "rgb(250, 250, 255)",
  boxSizing: "border-box",
  overflow: "visible",
  textOverflow: "clip",
};

const rankCertificateLeaderStyle: CSSProperties = {
  ...rankCertificateTextBaseStyle,
  left: "174.3mm",
  top: "226.0mm",
  width: "32mm",
  minHeight: "7mm",
  fontSize: "11pt",
  padding: "0.2mm 0",
  boxSizing: "border-box",
};

const beomApplicationPageStyle: CSSProperties = {
  ...reportPageStyle,
  padding: "8mm 15mm",
  fontSize: "9.2px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
};

const beomSectionStyle: CSSProperties = {
  marginTop: "8px",
};

const beomSectionTitleStyle: CSSProperties = {
  margin: "0 0 4px",
  fontSize: "12px",
  fontWeight: 900,
  color: "#111827",
};

const beomSmallTextStyle: CSSProperties = {
  fontSize: "9px",
  fontWeight: 500,
};

const beomPersonalGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "28mm 1fr",
  gap: "4px",
};

const beomPhotoCellStyle: CSSProperties = {
  border: "1px solid #111827",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "36mm",
  overflow: "hidden",
};

const beomPhotoStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const beomPhotoPlaceholderStyle: CSSProperties = {
  textAlign: "center",
  color: "#374151",
  lineHeight: 1.7,
  fontSize: "10px",
};

const beomInfoTableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
};


const beomThStyle: CSSProperties = {
  border: "1px solid #111827",
  backgroundColor: "#fef3c7",
  padding: "2px 3px",
  textAlign: "center",
  fontWeight: 900,
  verticalAlign: "middle",
  wordBreak: "keep-all",
};

const beomTdStyle: CSSProperties = {
  border: "1px solid #111827",
  padding: "2px 3px",
  height: "15px",
  verticalAlign: "middle",
  wordBreak: "keep-all",
};

const beomTdCenterStyle: CSSProperties = {
  ...beomTdStyle,
  textAlign: "center",
};

const beomBadgeTableStyle: CSSProperties = {
  ...beomInfoTableStyle,
  fontSize: "9px",
};

const beomBadgeGroupHeaderStyle: CSSProperties = {
  ...beomThStyle,
  width: "22px",
  padding: "2px",
};

const beomBadgeGroupCellStyle: CSSProperties = {
  ...beomTdCenterStyle,
  width: "22px",
  backgroundColor: "#e5e7eb",
  fontWeight: 900,
  writingMode: "vertical-rl",
  textOrientation: "upright",
  letterSpacing: "1px",
};

const beomBadgeNameTdStyle: CSSProperties = {
  ...beomTdStyle,
  textAlign: "center",
};

const beomGeneralPlaceholderCellStyle: CSSProperties = {
  ...beomBadgeNameTdStyle,
  color: "#dc2626",
  textAlign: "center",
  fontWeight: 800,
};

const beomActivityThStyle: CSSProperties = {
  ...beomThStyle,
  width: "45%",
  textAlign: "left",
};

const beomFootnoteStyle: CSSProperties = {
  margin: "3px 0 0",
  fontSize: "9px",
  color: "#374151",
};

const beomSignatureSectionStyle: CSSProperties = {
  marginTop: "8px",
  textAlign: "center",
  lineHeight: 1.45,
  fontSize: "11px",
};

const beomStatementStyle: CSSProperties = {
  margin: "5px 0",
  fontWeight: 700,
};

const beomDateLineStyle: CSSProperties = {
  marginTop: "4px",
  fontWeight: 700,
};

const beomSignatureLineStyle: CSSProperties = {
  marginTop: "4px",
  textAlign: "right",
  paddingRight: "30mm",
  fontWeight: 700,
};

const beomHandwriteNameLineStyle: CSSProperties = {
  display: "inline-block",
  width: "30mm",
  borderBottom: "1px solid #111827",
  verticalAlign: "baseline",
};

const beomDeferredFieldNoticeStyle: CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #fed7aa",
  borderRadius: "8px",
  backgroundColor: "#fff7ed",
  color: "#c2410c",
  fontSize: "13px",
  fontWeight: 700,
  lineHeight: 1.5,
};
