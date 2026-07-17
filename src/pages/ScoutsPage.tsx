import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, FormEvent } from "react";
import * as XLSX from "xlsx";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { EmptyState, FeedbackToast, PageHelpButton } from "../components/common/CommonFeedback";
import { supabase } from "../lib/supabase";

type UserRole = "super_admin" | "org_admin" | "leader" | "viewer";

type ScoutStatus = "active" | "inactive" | "graduated";
type ScoutStatusFilter = ScoutStatus | "all";
type ScoutSectionFilter = "all" | "cub" | "scout" | "venture" | "unspecified";

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
  note: string | null;
};

type Rank = {
  id: string;
  rank_name: string;
  sort_order: number;
};

type Badge = {
  id: string;
  name: string;
  category_id: string | null;
  sort_order: number | null;
  is_general_badge: boolean;
};

type GeneralBadgeSortDirection = "asc" | "desc";

type RankRequirement = {
  id: string;
  from_rank_id: string;
  to_rank_id: string;
  required_months: number | null;
  required_attendance_rate: number | null;
  required_general_badge_count: number | null;
  requires_wsep_or_mop: boolean | null;
};

type ScoutRankHistory = {
  id: string;
  organization_id: string;
  scout_id: string;
  rank_id: string;
  approved_at: string;
  approval_type: string;
  note: string | null;
};

type ScoutBadgeRecord = {
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

type ProgramType = "WSEP" | "MoP";

type ProgramCompletion = {
  id: string;
  organization_id: string;
  scout_id: string;
  program_type: ProgramType;
  completed_at: string;
  certificate_no: string | null;
  approved_at: string | null;
  note: string | null;
  created_at: string;
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

type Meeting = {
  id: string;
  organization_id: string;
  meeting_date: string;
  title: string;
  meeting_type: string;
  is_attendance_target: boolean;
  note: string | null;
};

type AttendanceStatus =
  | "present"
  | "recognized"
  | "late"
  | "early_leave"
  | "absent"
  | "not_entered";

type AttendanceRecord = {
  id: string;
  organization_id: string;
  meeting_id: string;
  scout_id: string;
  status: AttendanceStatus;
  note: string | null;
};

type IntegratedSection =
  | "profile"
  | "rank"
  | "badges"
  | "programs"
  | "attendance"
  | "review";

type RankQuickForm = {
  rank_id: string;
  approved_at: string;
  rank_approval_dates: RankApprovalDateMap;
  note: string;
};

type BadgeQuickForm = {
  badge_id: string;
  acquired_at: string;
  approved_at: string;
  instructor_name: string;
  leader_confirmed: boolean;
  note: string;
};

type ProgramQuickForm = {
  program_type: ProgramType;
  completed_at: string;
  certificate_no: string;
  approved_at: string;
  note: string;
};

type Organization = {
  id: string;
  name: string;
};

type RankApprovalDateMap = Record<string, string>;

type ScoutCreateForm = {
  organization_id: string;
  name: string;
  grade: string;
  joined_at: string;
  current_rank_id: string;
  current_rank_approved_at: string;
  rank_approval_dates: RankApprovalDateMap;
  is_from_cub_scout: boolean;
  cub_promotion_completed: boolean;
  beginner_course_exempted: boolean;
  note: string;
};

type ScoutEditForm = {
  id: string;
  member_no: string;
  school_name: string;
  joined_at: string;
  name: string;
  grade: string;
  current_rank_id: string;
  current_rank_approved_at: string;
  rank_approval_dates: RankApprovalDateMap;
  is_from_cub_scout: boolean;
  cub_promotion_completed: boolean;
  beginner_course_exempted: boolean;
  note: string;
};

type ExcelImportAction = "create" | "update";
type ExcelSectionType = "cub" | "scout" | "venture";

type ExcelSourceRow = Record<string, unknown> & {
  __sheetName?: string;
  __sectionType?: ExcelSectionType | null;
  __sectionLabel?: string;
  __sourceRowNumber?: number;
};

type ExcelRankImportItem = {
  rankId: string;
  rankName: string;
  approvedAt: string;
};

type ExcelBadgeImportItem = {
  badgeId: string;
  badgeName: string;
  approvedAt: string;
};

type ExcelImportRow = {
  rowNumber: number;
  sectionLabel: string;
  action: ExcelImportAction | null;
  matchedScoutId: string | null;
  member_no: string;
  name: string;
  grade: string;
  joined_at: string;
  status: ScoutStatus;
  current_rank_id: string | null;
  current_rank_name: string;
  rank_items: ExcelRankImportItem[];
  badge_items: ExcelBadgeImportItem[];
  is_from_cub_scout: boolean;
  cub_promotion_completed: boolean;
  beginner_course_exempted: boolean;
  note: string;
  errors: string[];
};

type ParsedBoolean = {
  value: boolean;
  valid: boolean;
};

type ScoutSortKey =
  | "member_no"
  | "name"
  | "organization"
  | "school_name"
  | "grade"
  | "scout_section"
  | "current_rank"
  | "joined_at"
  | "is_from_cub_scout"
  | "beginner_course_exempted"
  | "status";

type SortDirection = "asc" | "desc";

type ScoutSortConfig = {
  key: ScoutSortKey;
  direction: SortDirection;
};

const EXCEL_BADGE_PAIR_COUNT = 12;

const DATE_INPUT_MIN = "1900-01-01";
const DATE_INPUT_MAX = "2099-12-31";

const EXCEL_TEMPLATE_HEADERS = [
  "대원번호",
  "대원명",
  "학년",
  "입단일",
  "상태",
  "컵스카우트 출신",
  "컵스카우트 승진과정 이수",
  "초급과정 면제",
  "비고",
  "현재급위",
  "초급 인가일",
  "2급 인가일",
  "1급 인가일",
  "별 인가일",
  "무궁화 인가일",
  "범 인가일",
  ...Array.from({ length: EXCEL_BADGE_PAIR_COUNT }).flatMap((_, index) => [
    `기능장${index + 1}`,
    `기능장${index + 1} 인가일`,
  ]),
];

const RANK_DATE_ALIAS_DEFINITIONS: Array<{
  label: string;
  aliases: string[];
  dateKeys: string[];
}> = [
  { label: "초급", aliases: ["초급", "beginner"], dateKeys: ["초급 인가일", "초급인가일", "초급 승인일"] },
  { label: "2급", aliases: ["2급", "이급", "rank2", "second"], dateKeys: ["2급 인가일", "2급인가일", "이급 인가일", "2급 승인일"] },
  { label: "1급", aliases: ["1급", "일급", "rank1", "first"], dateKeys: ["1급 인가일", "1급인가일", "일급 인가일", "1급 승인일"] },
  { label: "별", aliases: ["별", "star"], dateKeys: ["별 인가일", "별인가일", "별 승인일"] },
  { label: "무궁화", aliases: ["무궁화", "mugunghwa"], dateKeys: ["무궁화 인가일", "무궁화인가일", "무궁화 승인일"] },
  { label: "범", aliases: ["범", "범스카우트", "beom", "tiger"], dateKeys: ["범 인가일", "범인가일", "범스카우트 인가일", "범 승인일"] },
];

const EXCEL_IMPORT_SHEET_DEFINITIONS: Array<{
  type: ExcelSectionType;
  sheetName: string;
  gradePrefix: "초등학교" | "중학교" | "고등학교";
  minGrade: number;
  maxGrade: number;
}> = [
  { type: "cub", sheetName: "컵스카우트", gradePrefix: "초등학교", minGrade: 1, maxGrade: 6 },
  { type: "scout", sheetName: "스카우트", gradePrefix: "중학교", minGrade: 1, maxGrade: 3 },
  { type: "venture", sheetName: "벤처스카우트", gradePrefix: "고등학교", minGrade: 1, maxGrade: 3 },
];

const EXCEL_GUIDE_ROWS = [
  ["항목", "작성 기준"],
  ["시트", "컵스카우트, 스카우트, 벤처스카우트 탭 중 해당 탭에 입력합니다."],
  ["대원번호", "기존 대원을 수정할 때만 입력합니다. 신규 대원은 비워두면 저장 시 자동 발번됩니다."],
  ["대원명", "필수 입력 항목입니다."],
  ["학년", "숫자만 입력합니다. 컵스카우트 탭은 1~6, 스카우트/벤처스카우트 탭은 1~3으로 입력합니다."],
  ["입단일", "신규 대원 등록 시 필수입니다. 예: 2026-03-01"],
  ["상태", "활동, 비활동, 졸업 중 하나로 입력합니다. 비워두면 신규 대원은 활동으로 저장됩니다."],
  ["현재급위", "스카우트 급위를 입력합니다. 컵스카우트 탭은 학년에 따라 다람쥐, 토끼, 사슴, 곰, 무지개가 자동 표시됩니다."],
  ["급위별 인가일", "초급 인가일, 2급 인가일, 1급 인가일, 별 인가일, 무궁화 인가일, 범 인가일에 날짜를 입력하면 진급이력에 반영됩니다."],
  ["기능장", "기능장1~기능장12에 기능장명을 입력하고, 바로 오른쪽 인가일 칸에 취득 인가일을 입력합니다."],
  ["기능장 인가일", "기능장명이 입력된 경우 인가일도 입력해야 합니다. 예: 2026-05-10"],
  ["컵스카우트 출신", "예/아니오, O/X, Y/N, TRUE/FALSE, 1/0 입력이 가능합니다."],
  ["컵스카우트 승진과정 이수", "예/아니오, O/X, Y/N, TRUE/FALSE, 1/0 입력이 가능합니다."],
  ["초급과정 면제", "비워두면 컵스카우트 출신과 승진과정 이수 여부에 따라 자동 판단합니다. 무지개 대원이 스카우트로 전환된 경우 초급과정은 면제로 표시하되 초급 인가일은 별도로 등록합니다."],
  ["비고", "필요 시 특이사항을 입력합니다."],
];

const EXCEL_SAMPLE_ROWS_BY_SECTION: Record<ExcelSectionType, string[][]> = {
  cub: [
    ["", "홍길동", "5", "2026-03-01", "활동", "아니오", "아니오", "", "컵스카우트 신규 등록 예시", "", "", "", "", "", "", ""],
    ["기존 대원번호", "김컵", "6", "", "활동", "아니오", "아니오", "", "기존 대원 수정 예시", "", "", "", "", "", "", ""],
  ],
  scout: [
    ["", "이태극", "1", "2026-03-01", "활동", "예", "예", "", "스카우트 신규 등록 예시", "초급", "2026-03-01", "", "", "", "", "", "시민장", "2026-04-01", "하이킹장", "2026-05-01"],
    ["기존 대원번호", "박무궁", "2", "", "활동", "예", "예", "예", "기존 대원 수정 예시", "1급", "2025-03-01", "2025-07-01", "2025-12-01", "", "", "", "야영장", "2025-08-01", "응급처치장", "2025-11-01"],
  ],
  venture: [
    ["", "최벤처", "1", "2026-03-01", "활동", "아니오", "아니오", "", "벤처스카우트 신규 등록 예시", "별", "2024-03-01", "2024-07-01", "2024-12-01", "2025-06-01", "", "", "안전장", "2025-01-01", "개척장", "2025-03-01"],
    ["기존 대원번호", "정진급", "2", "", "활동", "아니오", "아니오", "", "기존 대원 수정 예시", "무궁화", "2023-03-01", "2023-07-01", "2023-12-01", "2024-06-01", "2025-01-01", "", "수영장", "2024-08-01", "세계우애장", "2024-10-01"],
  ],
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

const SCOUT_STATUS_OPTIONS: Array<{ value: ScoutStatus; label: string }> = [
  { value: "active", label: "활동" },
  { value: "inactive", label: "비활동" },
  { value: "graduated", label: "졸업" },
];

const PROGRAM_TYPE_OPTIONS: Array<{ value: ProgramType; label: string; description: string }> = [
  {
    value: "WSEP",
    label: "WSEP",
    description: "세계스카우트 자연환경 프로그램",
  },
  {
    value: "MoP",
    label: "MoP",
    description: "Messengers of Peace 프로그램",
  },
];

const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "출석",
  recognized: "인정출석",
  late: "지각",
  early_leave: "조퇴",
  absent: "결석",
  not_entered: "미입력",
};

const ATTENDANCE_PASS_STATUSES: AttendanceStatus[] = [
  "present",
  "recognized",
  "late",
  "early_leave",
];

const INTEGRATED_SECTION_OPTIONS: Array<{ value: IntegratedSection; label: string }> = [
  { value: "profile", label: "기본정보" },
  { value: "rank", label: "진급/급위" },
  { value: "badges", label: "기능장" },
  { value: "programs", label: "프로그램" },
  { value: "attendance", label: "출석/활동" },
  { value: "review", label: "진급판정" },
];

const STATUS_COLOR_STYLES: Record<
  ScoutStatus,
  Pick<CSSProperties, "backgroundColor" | "color" | "borderColor">
> = {
  active: {
    backgroundColor: "#dcfce7",
    color: "#166534",
    borderColor: "#bbf7d0",
  },
  inactive: {
    backgroundColor: "#f1f5f9",
    color: "#475569",
    borderColor: "#cbd5e1",
  },
  graduated: {
    backgroundColor: "#ede9fe",
    color: "#6d28d9",
    borderColor: "#ddd6fe",
  },
};

const ELEMENTARY_GRADE_OPTIONS = [
  "초등학교 1학년",
  "초등학교 2학년",
  "초등학교 3학년",
  "초등학교 4학년",
  "초등학교 5학년",
  "초등학교 6학년",
];

const MIDDLE_SCHOOL_GRADE_OPTIONS = [
  "중학교 1학년",
  "중학교 2학년",
  "중학교 3학년",
];

const HIGH_SCHOOL_GRADE_OPTIONS = [
  "고등학교 1학년",
  "고등학교 2학년",
  "고등학교 3학년",
];

const ALL_GRADE_OPTIONS = [
  ...ELEMENTARY_GRADE_OPTIONS,
  ...MIDDLE_SCHOOL_GRADE_OPTIONS,
  ...HIGH_SCHOOL_GRADE_OPTIONS,
];

const CUB_RANK_BY_GRADE_NUMBER: Record<number, string> = {
  1: "다람쥐",
  2: "다람쥐",
  3: "토끼",
  4: "사슴",
  5: "곰",
  6: "무지개",
};

const SCOUT_ADVANCEMENT_RANK_KEYS = [
  "beginner",
  "second",
  "first",
  "star",
  "mugunghwa",
  "beom",
] as const;

type ScoutAdvancementRankKey = (typeof SCOUT_ADVANCEMENT_RANK_KEYS)[number];

type RequiredBadgeGuide = {
  targetRankKey: Exclude<ScoutAdvancementRankKey, "beginner">;
  label: string;
  badgeNames: string[];
};

const REQUIRED_BADGE_GUIDES: RequiredBadgeGuide[] = [
  {
    targetRankKey: "second",
    label: "초급 → 2급",
    badgeNames: ["시민장", "하이킹장"],
  },
  {
    targetRankKey: "first",
    label: "2급 → 1급",
    badgeNames: ["야영장", "야외취사장", "측정지도장", "응급처치장"],
  },
  {
    targetRankKey: "star",
    label: "1급 → 별",
    badgeNames: ["안전장", "전통예절장", "개척장"],
  },
  {
    targetRankKey: "mugunghwa",
    label: "별 → 무궁화",
    badgeNames: ["수영장", "환경보전장", "세계우애장"],
  },
  {
    targetRankKey: "beom",
    label: "무궁화 → 범",
    badgeNames: ["학업장", "구조장", "생존장"],
  },
];

const GENERAL_BADGE_REQUIRED_COUNT_BY_TARGET_RANK: Record<
  Exclude<ScoutAdvancementRankKey, "beginner">,
  number
> = {
  second: 0,
  first: 1,
  star: 2,
  mugunghwa: 3,
  beom: 3,
};

const REQUIRED_BADGE_NAME_SET = new Set(
  REQUIRED_BADGE_GUIDES.flatMap((guide) => guide.badgeNames).map((name) =>
    normalizeBadgeGuideName(name),
  ),
);


function normalizeBadgeGuideName(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, "").trim();
}

function getScoutAdvancementRankKey(rankName: string | null | undefined): ScoutAdvancementRankKey | null {
  if (!rankName) return null;

  const normalized = rankName.replace(/[\s·_()-]/g, "").toLowerCase();

  if (normalized.includes("초급") || normalized.includes("beginner")) return "beginner";
  if (normalized.includes("2급") || normalized.includes("이급") || normalized.includes("rank2") || normalized.includes("second")) return "second";
  if (normalized.includes("1급") || normalized.includes("일급") || normalized.includes("rank1") || normalized.includes("first")) return "first";
  if (normalized.includes("별") || normalized.includes("star")) return "star";
  if (normalized.includes("무궁화") || normalized.includes("mugunghwa")) return "mugunghwa";
  if (normalized.includes("범") || normalized.includes("beom") || normalized.includes("tiger")) return "beom";

  return null;
}

function getScoutAdvancementRankIndexByKey(rankKey: ScoutAdvancementRankKey | null) {
  if (!rankKey) return -1;
  return SCOUT_ADVANCEMENT_RANK_KEYS.indexOf(rankKey);
}

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

function isMiddleSchoolGrade(value: string | null | undefined) {
  return Boolean(value?.replace(/\s/g, "").includes("중학교"));
}

function getCubRankNameByGrade(value: string | null | undefined) {
  if (!isElementarySchoolGrade(value)) return "";

  const gradeNumber = getGradeNumber(value);
  if (!gradeNumber) return "";

  return CUB_RANK_BY_GRADE_NUMBER[gradeNumber] ?? "";
}

function getScoutSectionLabelByGrade(value: string | null | undefined) {
  if (isElementarySchoolGrade(value)) return "컵스카우트";
  if (isMiddleSchoolGrade(value)) return "스카우트";
  if (value?.replace(/\s/g, "").includes("고등학교")) return "벤처스카우트";
  return "구분 미지정";
}

function getScoutSectionFilterValueByGrade(
  value: string | null | undefined,
): Exclude<ScoutSectionFilter, "all"> {
  if (isElementarySchoolGrade(value)) return "cub";
  if (isMiddleSchoolGrade(value)) return "scout";
  if (value?.replace(/\s/g, "").includes("고등학교")) return "venture";
  return "unspecified";
}

function getAutoBeginnerExempted(
  grade: string,
  isFromCubScout: boolean,
  cubPromotionCompleted: boolean,
) {
  if (isElementarySchoolGrade(grade)) return false;

  return isFromCubScout && cubPromotionCompleted;
}

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

function normalizeDateInputValue(value: string) {
  if (!value) return "";

  const match = value.match(/^([+-]?\d{4,})-(\d{2})-(\d{2})$/);
  if (!match) return value;

  const normalizedYear = match[1].replace(/^\+/, "").slice(0, 4);
  return `${normalizedYear}-${match[2]}-${match[3]}`;
}

function limitDateInputYear(event: FormEvent<HTMLInputElement>) {
  const input = event.currentTarget;
  const normalizedValue = normalizeDateInputValue(input.value);

  if (normalizedValue !== input.value) {
    input.value = normalizedValue;
  }
}

function isManagedDateValueValid(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  if (value < DATE_INPUT_MIN || value > DATE_INPUT_MAX) return false;

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function getEmptyCreateForm(profile?: UserProfile | null): ScoutCreateForm {
  return {
    organization_id:
      profile && profile.role !== "super_admin" ? profile.organization_id ?? "" : "",
    name: "",
    grade: "",
    joined_at: getTodayText(),
    current_rank_id: "",
    current_rank_approved_at: "",
    rank_approval_dates: {},
    is_from_cub_scout: false,
    cub_promotion_completed: false,
    beginner_course_exempted: false,
    note: "",
  };
}

function getEmptyEditForm(): ScoutEditForm {
  return {
    id: "",
    member_no: "",
    school_name: "",
    joined_at: "",
    name: "",
    grade: "",
    current_rank_id: "",
    current_rank_approved_at: "",
    rank_approval_dates: {},
    is_from_cub_scout: false,
    cub_promotion_completed: false,
    beginner_course_exempted: false,
    note: "",
  };
}

function getEmptyRankQuickForm(): RankQuickForm {
  return {
    rank_id: "",
    approved_at: getTodayText(),
    rank_approval_dates: {},
    note: "",
  };
}

function getEmptyBadgeQuickForm(): BadgeQuickForm {
  return {
    badge_id: "",
    acquired_at: getTodayText(),
    approved_at: "",
    instructor_name: "",
    leader_confirmed: false,
    note: "",
  };
}

function getEmptyProgramQuickForm(): ProgramQuickForm {
  return {
    program_type: "WSEP",
    completed_at: getTodayText(),
    certificate_no: "",
    approved_at: "",
    note: "",
  };
}

function toNullableText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeLookupText(value: unknown) {
  if (value === null || value === undefined) return "";

  return String(value).replace(/\s+/g, "").toLowerCase();
}

export default function ScoutsPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [scouts, setScouts] = useState<Scout[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [rankRequirements, setRankRequirements] = useState<RankRequirement[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [rankHistories, setRankHistories] = useState<ScoutRankHistory[]>([]);
  const [scoutBadges, setScoutBadges] = useState<ScoutBadgeRecord[]>([]);
  const [programCompletions, setProgramCompletions] = useState<ProgramCompletion[]>([]);
  const [promotionReviews, setPromotionReviews] = useState<PromotionReview[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [keyword, setKeyword] = useState("");
  const [sectionFilter, setSectionFilter] = useState<ScoutSectionFilter>("all");
  const [statusFilter, setStatusFilter] = useState<ScoutStatusFilter>("all");
  const [isExcelPanelOpen, setIsExcelPanelOpen] = useState(false);
  const [isExcelGuideOpen, setIsExcelGuideOpen] = useState(false);
  const [scoutSortConfig, setScoutSortConfig] = useState<ScoutSortConfig>({
    key: "member_no",
    direction: "asc",
  });
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [createForm, setCreateForm] = useState<ScoutCreateForm>(getEmptyCreateForm());
  const [submitting, setSubmitting] = useState(false);
  const [formErrorMessage, setFormErrorMessage] = useState("");

  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
  const [editForm, setEditForm] = useState<ScoutEditForm>(getEmptyEditForm());
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editErrorMessage, setEditErrorMessage] = useState("");

  const [integratedScoutId, setIntegratedScoutId] = useState<string | null>(null);
  const [integratedSection, setIntegratedSection] = useState<IntegratedSection>("profile");
  const [rankQuickForm, setRankQuickForm] = useState<RankQuickForm>(getEmptyRankQuickForm());
  const [badgeQuickForm, setBadgeQuickForm] = useState<BadgeQuickForm>(getEmptyBadgeQuickForm());
  const [generalBadgeSortDirection, setGeneralBadgeSortDirection] =
    useState<GeneralBadgeSortDirection>("asc");
  const [programQuickForm, setProgramQuickForm] = useState<ProgramQuickForm>(getEmptyProgramQuickForm());
  const [integratedSubmitting, setIntegratedSubmitting] = useState(false);
  const [integratedErrorMessage, setIntegratedErrorMessage] = useState("");
  const [integratedSuccessMessage, setIntegratedSuccessMessage] = useState("");
  const [integratedReviewDate, setIntegratedReviewDate] = useState(getTodayText());
  const [integratedReviewSubmitting, setIntegratedReviewSubmitting] = useState(false);
  const [integratedReviewErrorMessage, setIntegratedReviewErrorMessage] = useState("");
  const [integratedReviewSuccessMessage, setIntegratedReviewSuccessMessage] = useState("");
  const [integratedApprovalDate, setIntegratedApprovalDate] = useState(getTodayText());
  const [integratedApprovalNote, setIntegratedApprovalNote] = useState("");
  const [integratedApprovalSubmitting, setIntegratedApprovalSubmitting] = useState(false);
  const [integratedApprovalErrorMessage, setIntegratedApprovalErrorMessage] = useState("");

  useEffect(() => {
    if ((!isCreateFormOpen && !isEditFormOpen && !integratedScoutId) || typeof document === "undefined") return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isCreateFormOpen, isEditFormOpen, integratedScoutId]);

  const [statusUpdatingScoutId, setStatusUpdatingScoutId] = useState<string | null>(null);
  const [statusErrorMessage, setStatusErrorMessage] = useState("");

  const excelFileInputRef = useRef<HTMLInputElement | null>(null);
  const [bulkOrganizationId, setBulkOrganizationId] = useState("");
  const [excelFileName, setExcelFileName] = useState("");
  const [excelPreviewRows, setExcelPreviewRows] = useState<ExcelImportRow[]>([]);
  const [excelErrorMessage, setExcelErrorMessage] = useState("");
  const [excelSuccessMessage, setExcelSuccessMessage] = useState("");
  const [excelSubmitting, setExcelSubmitting] = useState(false);

  const canManageScouts =
    profile?.role === "super_admin" ||
    profile?.role === "org_admin" ||
    profile?.role === "leader";

  const isSuperAdmin = profile?.role === "super_admin";
  const canUseExcelImport =
    profile?.role === "super_admin" || profile?.role === "org_admin";

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
    setCreateForm(getEmptyCreateForm(currentProfile));
    if (currentProfile.role !== "super_admin") {
      setBulkOrganizationId(currentProfile.organization_id ?? "");
    }

    let scoutQuery = supabase
      .from("scouts")
      .select(
        "id, organization_id, name, member_no, school_name, grade, joined_at, current_rank_id, is_from_cub_scout, cub_promotion_completed, beginner_course_exempted, status, note"
      )
      .is("deleted_at", null)
      .order("name", { ascending: true });

    let rankHistoryQuery = supabase
      .from("scout_rank_histories")
      .select("id, organization_id, scout_id, rank_id, approved_at, approval_type, note")
      .is("deleted_at", null)
      .order("approved_at", { ascending: false });

    let scoutBadgeQuery = supabase
      .from("scout_badges")
      .select("id, organization_id, scout_id, badge_id, acquired_at, approved_at, instructor_name, leader_confirmed, note, created_at")
      .is("deleted_at", null)
      .order("acquired_at", { ascending: false })
      .order("created_at", { ascending: false });

    let programCompletionQuery = supabase
      .from("program_completions")
      .select("id, organization_id, scout_id, program_type, completed_at, certificate_no, approved_at, note, created_at")
      .is("deleted_at", null)
      .order("completed_at", { ascending: false })
      .order("created_at", { ascending: false });

    let promotionReviewQuery = supabase
      .from("promotion_reviews")
      .select(
        "id, organization_id, scout_id, from_rank_id, to_rank_id, review_date, base_date, available_at, required_months, days_remaining, period_passed, attendance_total_count, attendance_present_count, attendance_rate, attendance_passed, required_badges_passed, general_badges_passed, program_passed, final_passed, missing_items, note, created_at",
      )
      .is("deleted_at", null)
      .order("review_date", { ascending: false })
      .order("created_at", { ascending: false });

    let meetingQuery = supabase
      .from("meetings")
      .select("id, organization_id, meeting_date, title, meeting_type, is_attendance_target, note")
      .is("deleted_at", null)
      .order("meeting_date", { ascending: false });

    let attendanceQuery = supabase
      .from("attendance")
      .select("id, organization_id, meeting_id, scout_id, status, note")
      .is("deleted_at", null);

    if (currentProfile.role !== "super_admin") {
      if (!currentProfile.organization_id) {
        setErrorMessage("소속 조직 정보가 없어 대원 목록을 조회할 수 없습니다.");
        setLoading(false);
        return;
      }

      scoutQuery = scoutQuery.eq("organization_id", currentProfile.organization_id);
      rankHistoryQuery = rankHistoryQuery.eq("organization_id", currentProfile.organization_id);
      scoutBadgeQuery = scoutBadgeQuery.eq("organization_id", currentProfile.organization_id);
      programCompletionQuery = programCompletionQuery.eq("organization_id", currentProfile.organization_id);
      promotionReviewQuery = promotionReviewQuery.eq("organization_id", currentProfile.organization_id);
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

    const { data: rankData, error: rankError } = await supabase
      .from("ranks")
      .select("id, rank_name, sort_order")
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
      setErrorMessage("급위별 일반기능장 기준을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const { data: badgeData, error: badgeError } = await supabase
      .from("badges")
      .select("id, name, category_id, sort_order, is_general_badge")
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });

    if (badgeError) {
      console.error("기능장 목록 조회 오류:", badgeError.message);
      setErrorMessage("기능장 목록을 불러오지 못했습니다.");
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

    const { data: rankHistoryData, error: rankHistoryError } = await rankHistoryQuery;

    if (rankHistoryError) {
      console.error("진급이력 조회 오류:", rankHistoryError.message);
      setErrorMessage("대원별 진급 이력을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const { data: scoutBadgeData, error: scoutBadgeError } = await scoutBadgeQuery;

    if (scoutBadgeError) {
      console.error("기능장 취득현황 조회 오류:", scoutBadgeError.message);
      setErrorMessage("대원별 기능장 취득현황을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const { data: programCompletionData, error: programCompletionError } =
      await programCompletionQuery;

    if (programCompletionError) {
      console.error("프로그램 이수현황 조회 오류:", programCompletionError.message);
      setErrorMessage("대원별 프로그램 이수현황을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const { data: promotionReviewData, error: promotionReviewError } =
      await promotionReviewQuery;

    if (promotionReviewError) {
      console.error("진급판정 조회 오류:", promotionReviewError.message);
      setErrorMessage("대원별 진급판정 결과를 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const { data: meetingData, error: meetingError } = await meetingQuery;

    if (meetingError) {
      console.error("집회 목록 조회 오류:", meetingError.message);
      setErrorMessage("집회 목록을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const { data: attendanceData, error: attendanceError } = await attendanceQuery;

    if (attendanceError) {
      console.error("출석현황 조회 오류:", attendanceError.message);
      setErrorMessage("대원별 출석현황을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    setScouts((scoutData ?? []) as unknown as Scout[]);
    setRanks((rankData ?? []) as unknown as Rank[]);
    setRankRequirements((requirementData ?? []) as unknown as RankRequirement[]);
    setBadges((badgeData ?? []) as unknown as Badge[]);
    setRankHistories((rankHistoryData ?? []) as unknown as ScoutRankHistory[]);
    setScoutBadges((scoutBadgeData ?? []) as unknown as ScoutBadgeRecord[]);
    setProgramCompletions((programCompletionData ?? []) as unknown as ProgramCompletion[]);
    setPromotionReviews((promotionReviewData ?? []) as unknown as PromotionReview[]);
    setMeetings((meetingData ?? []) as unknown as Meeting[]);
    setAttendanceRecords((attendanceData ?? []) as unknown as AttendanceRecord[]);
    const loadedOrganizations = (organizationData ?? []) as unknown as Organization[];
    setOrganizations(loadedOrganizations);
    if (currentProfile.role === "super_admin" && !bulkOrganizationId && loadedOrganizations.length > 0) {
      setBulkOrganizationId(loadedOrganizations[0].id);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const rankNameMap = useMemo(() => {
    return new Map(ranks.map((rank) => [rank.id, rank.rank_name]));
  }, [ranks]);

  const rankMap = useMemo(() => {
    return new Map(ranks.map((rank) => [rank.id, rank]));
  }, [ranks]);

  const rankByNormalizedName = useMemo(() => {
    const map = new Map<string, Rank>();

    ranks.forEach((rank) => {
      const normalizedName = normalizeLookupText(rank.rank_name);
      if (normalizedName) {
        map.set(normalizedName, rank);
      }
    });

    return map;
  }, [ranks]);

  const resolveRankByText = (value: unknown) => {
    const normalizedValue = normalizeLookupText(value);

    if (!normalizedValue) return null;

    const exactMatch = rankByNormalizedName.get(normalizedValue);
    if (exactMatch) return exactMatch;

    return (
      ranks.find((rank) => {
        const normalizedRankName = normalizeLookupText(rank.rank_name);
        return (
          normalizedRankName.includes(normalizedValue) ||
          normalizedValue.includes(normalizedRankName)
        );
      }) ?? null
    );
  };

  const getAutoCubRank = (grade: string | null | undefined) => {
    const cubRankName = getCubRankNameByGrade(grade);
    return cubRankName ? resolveRankByText(cubRankName) : null;
  };

  const applyAutomaticCubRank = async (scout: Scout, grade: string | null | undefined) => {
    const cubRankName = getCubRankNameByGrade(grade);
    if (!cubRankName) return scout;

    const cubRank = getAutoCubRank(grade);
    if (!cubRank || scout.current_rank_id === cubRank.id) {
      return {
        ...scout,
        current_rank_id: cubRank?.id ?? scout.current_rank_id,
      };
    }

    const { error } = await supabase
      .from("scouts")
      .update({ current_rank_id: cubRank.id })
      .eq("id", scout.id)
      .eq("organization_id", scout.organization_id)
      .is("deleted_at", null);

    if (error) {
      console.error("컵스카우트 자동 급위 반영 오류:", error.message);
      return scout;
    }

    return {
      ...scout,
      current_rank_id: cubRank.id,
    };
  };

  const getScoutCurrentRankDisplay = (scout: Scout) => {
    const storedRankName = scout.current_rank_id
      ? rankNameMap.get(scout.current_rank_id)
      : "";

    if (storedRankName) return storedRankName;

    const cubRankName = getCubRankNameByGrade(scout.grade);
    return cubRankName || "-";
  };

  const getCreateFormCubRankNotice = () => {
    const cubRankName = getCubRankNameByGrade(createForm.grade);
    if (!cubRankName) return "";

    const cubRank = getAutoCubRank(createForm.grade);
    if (!cubRank) {
      return `${createForm.grade}은 ${cubRankName} 급위로 자동 표시됩니다. 급위 목록에 ${cubRankName}이 없으면 현재급위 저장은 건너뜁니다.`;
    }

    return `${createForm.grade}은 ${cubRankName} 급위로 자동 반영됩니다.`;
  };

  const getEditFormCubRankNotice = () => {
    const cubRankName = getCubRankNameByGrade(editForm.grade);
    if (!cubRankName) return "";

    const cubRank = getAutoCubRank(editForm.grade);
    if (!cubRank) {
      return `${editForm.grade}은 ${cubRankName} 급위로 자동 표시됩니다. 급위 목록에 ${cubRankName}이 없으면 현재급위 저장은 건너뜁니다.`;
    }

    return `${editForm.grade}은 ${cubRankName} 급위로 자동 반영됩니다.`;
  };

  const badgeByNormalizedName = useMemo(() => {
    const map = new Map<string, Badge>();

    badges.forEach((badge) => {
      const normalizedName = normalizeLookupText(badge.name);
      if (normalizedName) {
        map.set(normalizedName, badge);
      }
    });

    return map;
  }, [badges]);

  const organizationNameMap = useMemo(() => {
    return new Map(organizations.map((organization) => [organization.id, organization.name]));
  }, [organizations]);

  const badgeNameMap = useMemo(() => {
    return new Map(badges.map((badge) => [badge.id, badge.name]));
  }, [badges]);


  const requiredBadgeOptionGroups = useMemo(() => {
    const badgeByNormalizedName = new Map(
      badges.map((badge) => [normalizeBadgeGuideName(badge.name), badge]),
    );

    return REQUIRED_BADGE_GUIDES.map((guide) => ({
      label: guide.label,
      badges: guide.badgeNames
        .map((badgeName) =>
          badgeByNormalizedName.get(normalizeBadgeGuideName(badgeName)) ?? null,
        )
        .filter((badge): badge is Badge => badge !== null),
    })).filter((group) => group.badges.length > 0);
  }, [badges]);

  const generalBadgeOptions = useMemo(() => {
    const sortedBadges = badges
      .filter(
        (badge) =>
          !REQUIRED_BADGE_NAME_SET.has(normalizeBadgeGuideName(badge.name)),
      )
      .sort((firstBadge, secondBadge) =>
        firstBadge.name.localeCompare(secondBadge.name, "ko", {
          numeric: true,
          sensitivity: "base",
        }),
      );

    return generalBadgeSortDirection === "asc"
      ? sortedBadges
      : [...sortedBadges].reverse();
  }, [badges, generalBadgeSortDirection]);

  const rankHistoriesByScoutId = useMemo(() => {
    const map = new Map<string, ScoutRankHistory[]>();

    rankHistories.forEach((history) => {
      const current = map.get(history.scout_id) ?? [];
      current.push(history);
      map.set(history.scout_id, current);
    });

    return map;
  }, [rankHistories]);

  const scoutBadgesByScoutId = useMemo(() => {
    const map = new Map<string, ScoutBadgeRecord[]>();

    scoutBadges.forEach((record) => {
      const current = map.get(record.scout_id) ?? [];
      current.push(record);
      map.set(record.scout_id, current);
    });

    return map;
  }, [scoutBadges]);

  const programCompletionsByScoutId = useMemo(() => {
    const map = new Map<string, ProgramCompletion[]>();

    programCompletions.forEach((completion) => {
      const current = map.get(completion.scout_id) ?? [];
      current.push(completion);
      map.set(completion.scout_id, current);
    });

    return map;
  }, [programCompletions]);

  const promotionReviewsByScoutId = useMemo(() => {
    const map = new Map<string, PromotionReview[]>();

    promotionReviews.forEach((review) => {
      const current = map.get(review.scout_id) ?? [];
      current.push(review);
      map.set(review.scout_id, current);
    });

    map.forEach((items) => {
      items.sort((a, b) => {
        const dateCompare = b.review_date.localeCompare(a.review_date);
        if (dateCompare !== 0) return dateCompare;
        return (b.created_at ?? "").localeCompare(a.created_at ?? "");
      });
    });

    return map;
  }, [promotionReviews]);

  const attendanceRecordByMeetingAndScoutMap = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();

    attendanceRecords.forEach((record) => {
      map.set(`${record.meeting_id}:${record.scout_id}`, record);
    });

    return map;
  }, [attendanceRecords]);

  const attendanceStatsByScoutId = useMemo(() => {
    const map = new Map<
      string,
      {
        targetMeetingCount: number;
        enteredCount: number;
        presentCount: number;
        absentCount: number;
        notEnteredCount: number;
        attendanceRate: number;
        recentItems: Array<{
          meetingId: string;
          meetingDate: string;
          title: string;
          status: AttendanceStatus;
          note: string | null;
        }>;
      }
    >();

    scouts.forEach((scout) => {
      const targetMeetings = meetings
        .filter(
          (meeting) =>
            meeting.organization_id === scout.organization_id &&
            meeting.is_attendance_target,
        )
        .sort((a, b) => b.meeting_date.localeCompare(a.meeting_date));

      let presentCount = 0;
      let absentCount = 0;
      let enteredCount = 0;
      let notEnteredCount = 0;

      const recentItems = targetMeetings.slice(0, 8).map((meeting) => {
        const record = attendanceRecordByMeetingAndScoutMap.get(
          `${meeting.id}:${scout.id}`,
        );
        const status = record?.status ?? "not_entered";

        return {
          meetingId: meeting.id,
          meetingDate: meeting.meeting_date,
          title: meeting.title,
          status,
          note: record?.note ?? null,
        };
      });

      targetMeetings.forEach((meeting) => {
        const record = attendanceRecordByMeetingAndScoutMap.get(
          `${meeting.id}:${scout.id}`,
        );
        const status = record?.status ?? "not_entered";

        if (status === "not_entered") {
          notEnteredCount += 1;
          return;
        }

        enteredCount += 1;

        if (ATTENDANCE_PASS_STATUSES.includes(status)) {
          presentCount += 1;
        }

        if (status === "absent") {
          absentCount += 1;
        }
      });

      const attendanceRate =
        enteredCount > 0 ? Math.round((presentCount * 10000) / enteredCount) / 100 : 0;

      map.set(scout.id, {
        targetMeetingCount: targetMeetings.length,
        enteredCount,
        presentCount,
        absentCount,
        notEnteredCount,
        attendanceRate,
        recentItems,
      });
    });

    return map;
  }, [attendanceRecordByMeetingAndScoutMap, meetings, scouts]);

  const integratedScout = useMemo(() => {
    if (!integratedScoutId) return null;
    return scouts.find((scout) => scout.id === integratedScoutId) ?? null;
  }, [integratedScoutId, scouts]);

  const integratedScoutRankHistories = useMemo(() => {
    if (!integratedScout) return [];
    return rankHistoriesByScoutId.get(integratedScout.id) ?? [];
  }, [integratedScout, rankHistoriesByScoutId]);

  const integratedRankApprovalTimeline = useMemo(() => {
    if (!integratedScout?.current_rank_id) return [];

    const currentRank = rankMap.get(integratedScout.current_rank_id) ?? null;
    const currentRankKey = getScoutAdvancementRankKey(currentRank?.rank_name);
    const currentRankIndex = getScoutAdvancementRankIndexByKey(currentRankKey);

    if (currentRankIndex < 0) return [];

    const latestApprovalDateByRankId = new Map<string, string>();

    [...integratedScoutRankHistories]
      .sort((a, b) => b.approved_at.localeCompare(a.approved_at))
      .forEach((history) => {
        if (!latestApprovalDateByRankId.has(history.rank_id)) {
          latestApprovalDateByRankId.set(history.rank_id, history.approved_at.slice(0, 10));
        }
      });

    return ranks
      .map((rank) => ({
        rank,
        rankKey: getScoutAdvancementRankKey(rank.rank_name),
      }))
      .filter(({ rankKey }) => getScoutAdvancementRankIndexByKey(rankKey) >= 0)
      .sort((a, b) => {
        return (
          getScoutAdvancementRankIndexByKey(a.rankKey) -
          getScoutAdvancementRankIndexByKey(b.rankKey)
        );
      })
      .map(({ rank, rankKey }) => {
        const rankIndex = getScoutAdvancementRankIndexByKey(rankKey);
        const approvedAt = latestApprovalDateByRankId.get(rank.id) ?? "";
        const state =
          rank.id === integratedScout.current_rank_id
            ? "current"
            : approvedAt
              ? "completed"
              : rankIndex < currentRankIndex
                ? "missing_history"
                : rankIndex === currentRankIndex + 1
                  ? "next"
                  : "pending";

        return {
          rankId: rank.id,
          rankName: rank.rank_name,
          approvedAt,
          state,
        };
      });
  }, [integratedScout, integratedScoutRankHistories, rankMap, ranks]);

  const integratedScoutBadges = useMemo(() => {
    if (!integratedScout) return [];
    return scoutBadgesByScoutId.get(integratedScout.id) ?? [];
  }, [integratedScout, scoutBadgesByScoutId]);


  const integratedBadgeGuide = useMemo(() => {
    if (!integratedScout) return null;

    const currentRank = integratedScout.current_rank_id
      ? rankMap.get(integratedScout.current_rank_id) ?? null
      : null;
    const currentRankKey = getScoutAdvancementRankKey(currentRank?.rank_name);
    const currentRankIndex = getScoutAdvancementRankIndexByKey(currentRankKey);

    if (!currentRank || currentRankIndex < 0) return null;

    const acquiredBadgeNameSet = new Set(
      integratedScoutBadges
        .map((record) => normalizeBadgeGuideName(badgeNameMap.get(record.badge_id)))
        .filter(Boolean),
    );

    const generalBadgeCount = integratedScoutBadges.filter((record) => {
      const badgeName = normalizeBadgeGuideName(badgeNameMap.get(record.badge_id));
      return Boolean(badgeName) && !REQUIRED_BADGE_NAME_SET.has(badgeName);
    }).length;

    const buildGuideGroup = (guide: RequiredBadgeGuide, kind: "current" | "next") => {
      const badgeItems = guide.badgeNames.map((badgeName) => {
        const acquired = acquiredBadgeNameSet.has(normalizeBadgeGuideName(badgeName));
        return {
          name: badgeName,
          acquired,
        };
      });

      return {
        ...guide,
        kind,
        badgeItems,
        requiredBadgeMissingCount: badgeItems.filter((item) => !item.acquired).length,
        generalRequiredCount:
          GENERAL_BADGE_REQUIRED_COUNT_BY_TARGET_RANK[guide.targetRankKey],
      };
    };

    let allocatedGeneralBadgeCount = 0;

    const currentGroups = REQUIRED_BADGE_GUIDES.filter((guide) => {
      const guideIndex = getScoutAdvancementRankIndexByKey(guide.targetRankKey);
      return guideIndex > 0 && guideIndex <= currentRankIndex;
    }).map((guide) => {
      const group = buildGuideGroup(guide, "current");
      const remainingGeneralBadgeCount = Math.max(
        generalBadgeCount - allocatedGeneralBadgeCount,
        0,
      );
      const generalRegisteredCount = Math.min(
        group.generalRequiredCount,
        remainingGeneralBadgeCount,
      );
      const generalMissingCount = Math.max(
        group.generalRequiredCount - generalRegisteredCount,
        0,
      );

      allocatedGeneralBadgeCount += group.generalRequiredCount;

      return {
        ...group,
        generalRegisteredCount,
        generalMissingCount,
        totalMissingCount:
          group.requiredBadgeMissingCount + generalMissingCount,
      };
    });

    const nextGuide = REQUIRED_BADGE_GUIDES.find((guide) => {
      return getScoutAdvancementRankIndexByKey(guide.targetRankKey) === currentRankIndex + 1;
    });

    const nextGroup = nextGuide
      ? (() => {
          const group = buildGuideGroup(nextGuide, "next");
          const availableGeneralBadgeCount = Math.max(
            generalBadgeCount - allocatedGeneralBadgeCount,
            0,
          );
          const generalRegisteredCount = Math.min(
            group.generalRequiredCount,
            availableGeneralBadgeCount,
          );
          const generalMissingCount = Math.max(
            group.generalRequiredCount - generalRegisteredCount,
            0,
          );

          return {
            ...group,
            generalRegisteredCount,
            generalMissingCount,
            totalMissingCount:
              group.requiredBadgeMissingCount + generalMissingCount,
            availableGeneralBadgeCount,
          };
        })()
      : null;

    const currentRequiredBadgeCount = currentGroups.reduce(
      (total, group) => total + group.badgeItems.length,
      0,
    );
    const currentRequiredBadgeMissingCount = currentGroups.reduce(
      (total, group) => total + group.requiredBadgeMissingCount,
      0,
    );
    const currentRequiredBadgeAcquiredCount = Math.max(
      currentRequiredBadgeCount - currentRequiredBadgeMissingCount,
      0,
    );
    const currentGeneralRequiredCount = currentGroups.reduce(
      (total, group) => total + group.generalRequiredCount,
      0,
    );
    const currentGeneralMissingCount = currentGroups.reduce(
      (total, group) => total + group.generalMissingCount,
      0,
    );

    return {
      currentRankName: currentRank.rank_name,
      currentGroups,
      currentMissingCount: currentGroups.reduce(
        (total, group) => total + group.totalMissingCount,
        0,
      ),
      currentRequiredBadgeCount,
      currentRequiredBadgeAcquiredCount,
      currentRequiredBadgeMissingCount,
      currentGeneralRequiredCount,
      currentGeneralMissingCount,
      generalBadgeCount,
      availableGeneralBadgeCount: Math.max(
        generalBadgeCount - currentGeneralRequiredCount,
        0,
      ),
      nextGroup,
    };
  }, [
    badgeNameMap,
    integratedScout,
    integratedScoutBadges,
    rankMap,
  ]);

  const integratedScoutPrograms = useMemo(() => {
    if (!integratedScout) return [];
    return programCompletionsByScoutId.get(integratedScout.id) ?? [];
  }, [integratedScout, programCompletionsByScoutId]);

  const integratedAttendanceStats = useMemo(() => {
    if (!integratedScout) return null;
    return attendanceStatsByScoutId.get(integratedScout.id) ?? null;
  }, [attendanceStatsByScoutId, integratedScout]);


  const integratedNextRank = useMemo(() => {
    if (!integratedScout?.current_rank_id) return null;

    const currentRank = rankMap.get(integratedScout.current_rank_id) ?? null;
    const currentRankKey = getScoutAdvancementRankKey(currentRank?.rank_name);
    const currentRankIndex = getScoutAdvancementRankIndexByKey(currentRankKey);

    if (currentRankIndex < 0 || currentRankIndex >= SCOUT_ADVANCEMENT_RANK_KEYS.length - 1) {
      return null;
    }

    const nextRankKey = SCOUT_ADVANCEMENT_RANK_KEYS[currentRankIndex + 1];
    return (
      ranks.find(
        (rank) => getScoutAdvancementRankKey(rank.rank_name) === nextRankKey,
      ) ?? null
    );
  }, [integratedScout, rankMap, ranks]);

  const integratedNextRequirement = useMemo(() => {
    if (!integratedScout?.current_rank_id || !integratedNextRank) return null;

    return (
      rankRequirements.find(
        (requirement) =>
          requirement.from_rank_id === integratedScout.current_rank_id &&
          requirement.to_rank_id === integratedNextRank.id,
      ) ??
      rankRequirements.find(
        (requirement) => requirement.to_rank_id === integratedNextRank.id,
      ) ??
      null
    );
  }, [integratedNextRank, integratedScout, rankRequirements]);

  const integratedScoutReviews = useMemo(() => {
    if (!integratedScout) return [];
    return promotionReviewsByScoutId.get(integratedScout.id) ?? [];
  }, [integratedScout, promotionReviewsByScoutId]);

  const integratedCurrentStepReviews = useMemo(() => {
    if (!integratedScout?.current_rank_id || !integratedNextRank) return [];

    return integratedScoutReviews.filter(
      (review) =>
        review.from_rank_id === integratedScout.current_rank_id &&
        review.to_rank_id === integratedNextRank.id,
    );
  }, [integratedNextRank, integratedScout, integratedScoutReviews]);

  const integratedLatestReview = integratedCurrentStepReviews[0] ?? null;

  const integratedProgramRequired = useMemo(() => {
    return getScoutAdvancementRankKey(integratedNextRank?.rank_name) === "beom";
  }, [integratedNextRank]);

  const getLatestRankHistoryForScout = (scout: Scout, rankId: string | null) => {
    if (!rankId) return null;

    return (
      (rankHistoriesByScoutId.get(scout.id) ?? [])
        .filter((history) => history.rank_id === rankId)
        .sort((a, b) => b.approved_at.localeCompare(a.approved_at))[0] ?? null
    );
  };


  const getRankChainKey = (rank: Rank | null | undefined) => {
    return getScoutAdvancementRankKey(rank?.rank_name);
  };

  const getRequiredRankHistoryRanks = (currentRankId: string) => {
    if (!currentRankId) return [];

    const selectedRank = rankMap.get(currentRankId);
    if (!selectedRank) return [];

    const selectedRankKey = getRankChainKey(selectedRank);
    const selectedRankIndex = getScoutAdvancementRankIndexByKey(selectedRankKey);

    if (selectedRankIndex < 0) {
      return [selectedRank];
    }

    const rankByKey = new Map<ScoutAdvancementRankKey, Rank>();

    [...ranks]
      .sort((a, b) => a.sort_order - b.sort_order)
      .forEach((rank) => {
        const rankKey = getRankChainKey(rank);
        if (!rankKey || rankByKey.has(rankKey)) return;
        rankByKey.set(rankKey, rank);
      });

    return SCOUT_ADVANCEMENT_RANK_KEYS.slice(0, selectedRankIndex + 1)
      .map((rankKey) => rankByKey.get(rankKey) ?? null)
      .filter((rank): rank is Rank => rank !== null);
  };

  const getRankApprovalDateMapForScout = (scout: Scout | null) => {
    const dateMap: RankApprovalDateMap = {};

    if (!scout) return dateMap;

    [...(rankHistoriesByScoutId.get(scout.id) ?? [])]
      .sort((a, b) => b.approved_at.localeCompare(a.approved_at))
      .forEach((history) => {
        if (!dateMap[history.rank_id]) {
          dateMap[history.rank_id] = history.approved_at.slice(0, 10);
        }
      });

    return dateMap;
  };

  const buildRankApprovalDateMapForRankSelection = ({
    currentRankId,
    previousCurrentRankId,
    previousCurrentApprovedAt,
    previousDateMap,
    scout,
  }: {
    currentRankId: string;
    previousCurrentRankId?: string;
    previousCurrentApprovedAt?: string;
    previousDateMap?: RankApprovalDateMap;
    scout?: Scout | null;
  }) => {
    if (!currentRankId) return {};

    const scoutDateMap = getRankApprovalDateMapForScout(scout ?? null);
    const nextDateMap: RankApprovalDateMap = {};

    getRequiredRankHistoryRanks(currentRankId).forEach((rank) => {
      nextDateMap[rank.id] =
        previousDateMap?.[rank.id] ??
        scoutDateMap[rank.id] ??
        (rank.id === previousCurrentRankId ? previousCurrentApprovedAt ?? "" : "");
    });

    return nextDateMap;
  };

  const getRankApprovalDateInputItems = (
    currentRankId: string,
    dateMap: RankApprovalDateMap,
  ) => {
    return getRequiredRankHistoryRanks(currentRankId).map((rank) => ({
      rank,
      approvedAt: dateMap[rank.id] ?? "",
    }));
  };

  const getMissingRequiredRankApprovalDates = (
    currentRankId: string,
    dateMap: RankApprovalDateMap,
  ) => {
    return getRankApprovalDateInputItems(currentRankId, dateMap).filter(
      (item) => !item.approvedAt,
    );
  };


  const getInvalidRankApprovalDates = (
    currentRankId: string,
    dateMap: RankApprovalDateMap,
  ) => {
    return getRankApprovalDateInputItems(currentRankId, dateMap).filter(
      (item) => item.approvedAt && !isManagedDateValueValid(item.approvedAt),
    );
  };

  const getInvalidRankApprovalDateOrder = (
    currentRankId: string,
    dateMap: RankApprovalDateMap,
  ) => {
    const items = getRankApprovalDateInputItems(currentRankId, dateMap);

    for (let index = 1; index < items.length; index += 1) {
      const previous = items[index - 1];
      const current = items[index];

      if (previous.approvedAt && current.approvedAt && current.approvedAt < previous.approvedAt) {
        return { previous, current };
      }
    }

    return null;
  };

  const getRankHistoryItemsForSave = (
    currentRankId: string,
    dateMap: RankApprovalDateMap,
  ) => {
    return getRankApprovalDateInputItems(currentRankId, dateMap).map((item) => ({
      rankId: item.rank.id,
      rankName: item.rank.rank_name,
      approvedAt: item.approvedAt,
    }));
  };

  const getRankChainNotice = (currentRankId: string) => {
    if (!currentRankId) return "";

    const selectedRank = rankMap.get(currentRankId) ?? null;
    const selectedRankKey = getRankChainKey(selectedRank);

    if (!selectedRank || !selectedRankKey) {
      return "선택한 급위의 인가일을 등록합니다.";
    }

    const requiredRanks = getRequiredRankHistoryRanks(currentRankId);
    const rankNames = requiredRanks.map((rank) => rank.rank_name).join(" → ");

    return `현재급위가 ${selectedRank.rank_name}이면 ${rankNames}까지의 인가 이력이 필요합니다.`;
  };

  const updateCreateCurrentRankId = (currentRankId: string) => {
    setCreateForm((prev) => {
      const rankApprovalDates = buildRankApprovalDateMapForRankSelection({
        currentRankId,
        previousCurrentRankId: prev.current_rank_id,
        previousCurrentApprovedAt: prev.current_rank_approved_at,
        previousDateMap: prev.rank_approval_dates,
      });

      return {
        ...prev,
        current_rank_id: currentRankId,
        current_rank_approved_at: currentRankId ? rankApprovalDates[currentRankId] ?? "" : "",
        rank_approval_dates: rankApprovalDates,
      };
    });
  };

  const updateCreateRankApprovalDate = (rankId: string, approvedAt: string) => {
    setCreateForm((prev) => {
      const rankApprovalDates = {
        ...prev.rank_approval_dates,
        [rankId]: approvedAt,
      };

      return {
        ...prev,
        current_rank_approved_at:
          rankId === prev.current_rank_id ? approvedAt : prev.current_rank_approved_at,
        rank_approval_dates: rankApprovalDates,
      };
    });
  };

  const updateEditCurrentRankId = (currentRankId: string) => {
    const currentScout = scouts.find((scout) => scout.id === editForm.id) ?? null;

    setEditForm((prev) => {
      const rankApprovalDates = buildRankApprovalDateMapForRankSelection({
        currentRankId,
        previousCurrentRankId: prev.current_rank_id,
        previousCurrentApprovedAt: prev.current_rank_approved_at,
        previousDateMap: prev.rank_approval_dates,
        scout: currentScout,
      });

      return {
        ...prev,
        current_rank_id: currentRankId,
        current_rank_approved_at: currentRankId ? rankApprovalDates[currentRankId] ?? "" : "",
        rank_approval_dates: rankApprovalDates,
      };
    });
  };

  const updateEditRankApprovalDate = (rankId: string, approvedAt: string) => {
    setEditForm((prev) => {
      const rankApprovalDates = {
        ...prev.rank_approval_dates,
        [rankId]: approvedAt,
      };

      return {
        ...prev,
        current_rank_approved_at:
          rankId === prev.current_rank_id ? approvedAt : prev.current_rank_approved_at,
        rank_approval_dates: rankApprovalDates,
      };
    });
  };

  const updateRankQuickCurrentRankId = (currentRankId: string) => {
    setRankQuickForm((prev) => {
      const rankApprovalDates = buildRankApprovalDateMapForRankSelection({
        currentRankId,
        previousCurrentRankId: prev.rank_id,
        previousCurrentApprovedAt: prev.approved_at,
        previousDateMap: prev.rank_approval_dates,
        scout: integratedScout,
      });

      return {
        ...prev,
        rank_id: currentRankId,
        approved_at: currentRankId ? rankApprovalDates[currentRankId] ?? "" : "",
        rank_approval_dates: rankApprovalDates,
      };
    });
  };

  const updateRankQuickApprovalDate = (rankId: string, approvedAt: string) => {
    setRankQuickForm((prev) => {
      const rankApprovalDates = {
        ...prev.rank_approval_dates,
        [rankId]: approvedAt,
      };

      return {
        ...prev,
        approved_at: rankId === prev.rank_id ? approvedAt : prev.approved_at,
        rank_approval_dates: rankApprovalDates,
      };
    });
  };

  const scoutByMemberNo = useMemo(() => {
    const map = new Map<string, Scout>();

    scouts.forEach((scout) => {
      if (scout.member_no) {
        map.set(`${scout.organization_id}::${scout.member_no.trim()}`, scout);
      }
    });

    return map;
  }, [scouts]);

  const filteredScouts = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    const keywordMatchedScouts = scouts.filter((scout) => {
      if (sectionFilter !== "all" && getScoutSectionFilterValueByGrade(scout.grade) !== sectionFilter) {
        return false;
      }

      if (statusFilter !== "all" && scout.status !== statusFilter) {
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
        scout.status,
        SCOUT_STATUS_LABELS[scout.status],
        getScoutSectionLabelByGrade(scout.grade),
        getScoutCurrentRankDisplay(scout),
        organizationNameMap.get(scout.organization_id),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return targetText.includes(normalizedKeyword);
    });

    const getStringSortValue = (scout: Scout) => {
      if (scoutSortConfig.key === "member_no") return scout.member_no ?? "";
      if (scoutSortConfig.key === "name") return scout.name;
      if (scoutSortConfig.key === "organization") return organizationNameMap.get(scout.organization_id) ?? "";
      if (scoutSortConfig.key === "school_name") return scout.school_name ?? "";
      if (scoutSortConfig.key === "grade") return scout.grade ?? "";
      if (scoutSortConfig.key === "scout_section") return getScoutSectionLabelByGrade(scout.grade);
      if (scoutSortConfig.key === "current_rank") return getScoutCurrentRankDisplay(scout);
      if (scoutSortConfig.key === "joined_at") return scout.joined_at ?? "";
      if (scoutSortConfig.key === "status") return SCOUT_STATUS_LABELS[scout.status] ?? scout.status;
      return "";
    };

    const getBooleanSortValue = (scout: Scout) => {
      if (scoutSortConfig.key === "is_from_cub_scout") return scout.is_from_cub_scout ? 1 : 0;
      if (scoutSortConfig.key === "beginner_course_exempted") return scout.beginner_course_exempted ? 1 : 0;
      return 0;
    };

    return [...keywordMatchedScouts].sort((a, b) => {
      let result = 0;

      if (scoutSortConfig.key === "current_rank") {
        const aRank = a.current_rank_id ? rankMap.get(a.current_rank_id) : getAutoCubRank(a.grade);
        const bRank = b.current_rank_id ? rankMap.get(b.current_rank_id) : getAutoCubRank(b.grade);
        const aSortOrder = aRank?.sort_order ?? 9999;
        const bSortOrder = bRank?.sort_order ?? 9999;
        result = aSortOrder - bSortOrder;

        if (result === 0) {
          result = getScoutCurrentRankDisplay(a).localeCompare(getScoutCurrentRankDisplay(b), "ko", { numeric: true });
        }
      } else if (
        scoutSortConfig.key === "is_from_cub_scout" ||
        scoutSortConfig.key === "beginner_course_exempted"
      ) {
        result = getBooleanSortValue(a) - getBooleanSortValue(b);
      } else {
        result = getStringSortValue(a).localeCompare(getStringSortValue(b), "ko", {
          numeric: true,
          sensitivity: "base",
        });
      }

      if (result === 0) {
        result = (a.member_no ?? "").localeCompare(b.member_no ?? "", "ko", { numeric: true });
      }

      if (result === 0) {
        result = a.name.localeCompare(b.name, "ko", { numeric: true, sensitivity: "base" });
      }

      return scoutSortConfig.direction === "asc" ? result : -result;
    });
  }, [keyword, organizationNameMap, rankMap, rankNameMap, scoutSortConfig, scouts, sectionFilter, statusFilter]);

  const handleSortScoutColumn = (key: ScoutSortKey) => {
    setScoutSortConfig((current) => {
      if (current.key !== key) {
        return { key, direction: "asc" };
      }

      return {
        key,
        direction: current.direction === "asc" ? "desc" : "asc",
      };
    });
  };

  const getSortIndicator = (key: ScoutSortKey) => {
    if (scoutSortConfig.key !== key) return "↕";
    return scoutSortConfig.direction === "asc" ? "▲" : "▼";
  };

  const renderSortableHeader = (key: ScoutSortKey, label: string) => (
    <th style={thStyle}>
      <button
        type="button"
        style={sortableHeaderButtonStyle}
        onClick={() => handleSortScoutColumn(key)}
        title={`${label} 기준 정렬`}
      >
        <span>{label}</span>
        <span style={sortIndicatorStyle}>{getSortIndicator(key)}</span>
      </button>
    </th>
  );

  const handleOpenCreateForm = () => {
    setCreateForm(getEmptyCreateForm(profile));
    setFormErrorMessage("");
    setIsEditFormOpen(false);
    setEditErrorMessage("");
    setStatusErrorMessage("");
    setEditForm(getEmptyEditForm());
    setIsCreateFormOpen(true);
  };

  const handleCloseCreateForm = () => {
    if (submitting) return;

    setIsCreateFormOpen(false);
    setFormErrorMessage("");
    setCreateForm(getEmptyCreateForm(profile));
  };

  const updateCreateForm = <K extends keyof ScoutCreateForm>(
    field: K,
    value: ScoutCreateForm[K],
  ) => {
    setCreateForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleCreateGradeChange = (grade: string) => {
    setCreateForm((prev) => ({
      ...prev,
      grade,
      beginner_course_exempted: getAutoBeginnerExempted(
        grade,
        prev.is_from_cub_scout,
        prev.cub_promotion_completed,
      ),
    }));
  };

  const updateCreateBooleanForm = (
    field:
      | "is_from_cub_scout"
      | "cub_promotion_completed"
      | "beginner_course_exempted",
    value: boolean,
  ) => {
    setCreateForm((prev) => {
      const next = {
        ...prev,
        [field]: value,
      };

      if (field === "is_from_cub_scout" || field === "cub_promotion_completed") {
        return {
          ...next,
          beginner_course_exempted: getAutoBeginnerExempted(
            next.grade,
            next.is_from_cub_scout,
            next.cub_promotion_completed,
          ),
        };
      }

      return next;
    });
  };

  const handleCreateScout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!profile || !canManageScouts) {
      setFormErrorMessage("대원 등록 권한이 없습니다.");
      return;
    }

    const organizationId =
      profile.role === "super_admin"
        ? createForm.organization_id
        : profile.organization_id;

    if (!organizationId) {
      setFormErrorMessage("소속 조직을 선택해야 합니다.");
      return;
    }

    if (!createForm.name.trim()) {
      setFormErrorMessage("대원명을 입력해야 합니다.");
      return;
    }

    if (!createForm.joined_at) {
      setFormErrorMessage("입단일을 입력해야 합니다.");
      return;
    }

    if (!isManagedDateValueValid(createForm.joined_at)) {
      setFormErrorMessage(`입단일은 ${DATE_INPUT_MIN}부터 ${DATE_INPUT_MAX}까지의 날짜로 입력해야 합니다.`);
      return;
    }

    if (!createForm.current_rank_id && Object.values(createForm.rank_approval_dates).some(Boolean)) {
      setFormErrorMessage("진급 인가일을 입력하려면 현재급위를 먼저 선택해야 합니다.");
      return;
    }

    if (createForm.current_rank_id) {
      const missingRankDates = getMissingRequiredRankApprovalDates(
        createForm.current_rank_id,
        createForm.rank_approval_dates,
      );

      if (missingRankDates.length > 0) {
        setFormErrorMessage(
          `${missingRankDates.map((item) => item.rank.rank_name).join(", ")} 인가일을 입력해야 합니다.`,
        );
        return;
      }

      const invalidRankDates = getInvalidRankApprovalDates(
        createForm.current_rank_id,
        createForm.rank_approval_dates,
      );

      if (invalidRankDates.length > 0) {
        setFormErrorMessage(
          `${invalidRankDates.map((item) => item.rank.rank_name).join(", ")} 인가일은 ${DATE_INPUT_MIN}부터 ${DATE_INPUT_MAX}까지의 날짜로 입력해야 합니다.`,
        );
        return;
      }

      const invalidDateOrder = getInvalidRankApprovalDateOrder(
        createForm.current_rank_id,
        createForm.rank_approval_dates,
      );

      if (invalidDateOrder) {
        setFormErrorMessage(
          `${invalidDateOrder.current.rank.rank_name} 인가일은 ${invalidDateOrder.previous.rank.rank_name} 인가일보다 빠를 수 없습니다.`,
        );
        return;
      }
    }

    const organizationNameForSave = organizationNameMap.get(organizationId);

    if (!organizationNameForSave) {
      setFormErrorMessage("소속 조직명을 확인하지 못했습니다.");
      return;
    }

    const beginnerCourseExempted = getAutoBeginnerExempted(
      createForm.grade,
      createForm.is_from_cub_scout,
      createForm.cub_promotion_completed,
    );

    setSubmitting(true);
    setFormErrorMessage("");

    const rpcClient = supabase as unknown as {
      rpc: (
        functionName: string,
        args: Record<string, unknown>,
      ) => Promise<{
        data: unknown;
        error: { message: string } | null;
      }>;
    };

    const { data: insertedScout, error: insertError } = await rpcClient.rpc(
      "create_scout_auto_member_no",
      {
        p_name: createForm.name.trim(),
        p_organization_id: organizationId,
        p_school_name: organizationNameForSave,
        p_grade: toNullableText(createForm.grade),
        p_joined_at: createForm.joined_at,
        p_is_from_cub_scout: createForm.is_from_cub_scout,
        p_cub_promotion_completed: createForm.cub_promotion_completed,
        p_beginner_course_exempted: beginnerCourseExempted,
        p_note: toNullableText(createForm.note),
      },
    );

    if (insertError) {
      console.error("대원 등록 오류:", insertError.message);
      setFormErrorMessage(`대원 등록에 실패했습니다. ${insertError.message}`);
      setSubmitting(false);
      return;
    }

    const createdScout = await applyAutomaticCubRank(
      insertedScout as unknown as Scout,
      createForm.grade,
    );

    if (createForm.current_rank_id) {
      try {
        await saveRankHistoryChain({
          scoutId: createdScout.id,
          organizationId,
          currentRankId: createForm.current_rank_id,
          rankItems: getRankHistoryItemsForSave(
            createForm.current_rank_id,
            createForm.rank_approval_dates,
          ),
          note: "대원 등록 시 입력",
        });
      } catch (error) {
        console.error("대원 등록 후 진급 이력 저장 오류:", error);
        setFormErrorMessage(
          error instanceof Error
            ? error.message
            : "대원은 등록되었지만 진급 이력을 저장하지 못했습니다.",
        );
        setSubmitting(false);
        await loadData();
        return;
      }
    }

    setCreateForm(getEmptyCreateForm(profile));
    setIsCreateFormOpen(false);
    setSubmitting(false);
    await loadData();
  };

  const handleOpenEditForm = (scout: Scout) => {
    if (!canManageScouts) return;

    setIsCreateFormOpen(false);
    setFormErrorMessage("");
    setEditErrorMessage("");
    setStatusErrorMessage("");
    setEditForm({
      id: scout.id,
      member_no: scout.member_no ?? "-",
      school_name: scout.school_name ?? getOrganizationName(scout.organization_id),
      joined_at: scout.joined_at,
      name: scout.name,
      grade: scout.grade ?? "",
      current_rank_id: scout.current_rank_id ?? "",
      current_rank_approved_at: getRankHistoryApprovedDate(scout, scout.current_rank_id),
      rank_approval_dates: buildRankApprovalDateMapForRankSelection({
        currentRankId: scout.current_rank_id ?? "",
        scout,
      }),
      is_from_cub_scout: scout.is_from_cub_scout,
      cub_promotion_completed: scout.cub_promotion_completed,
      beginner_course_exempted: scout.beginner_course_exempted,
      note: scout.note ?? "",
    });
    setIsEditFormOpen(true);
  };

  const handleCloseEditForm = () => {
    if (editSubmitting) return;

    setIsEditFormOpen(false);
    setEditErrorMessage("");
    setEditForm(getEmptyEditForm());
  };

  const updateEditForm = <K extends keyof ScoutEditForm>(
    field: K,
    value: ScoutEditForm[K],
  ) => {
    setEditForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleEditGradeChange = (grade: string) => {
    setEditForm((prev) => ({
      ...prev,
      grade,
      beginner_course_exempted: getAutoBeginnerExempted(
        grade,
        prev.is_from_cub_scout,
        prev.cub_promotion_completed,
      ),
    }));
  };

  const updateEditBooleanForm = (
    field:
      | "is_from_cub_scout"
      | "cub_promotion_completed"
      | "beginner_course_exempted",
    value: boolean,
  ) => {
    setEditForm((prev) => {
      const next = {
        ...prev,
        [field]: value,
      };

      if (field === "is_from_cub_scout" || field === "cub_promotion_completed") {
        return {
          ...next,
          beginner_course_exempted: getAutoBeginnerExempted(
            next.grade,
            next.is_from_cub_scout,
            next.cub_promotion_completed,
          ),
        };
      }

      return next;
    });
  };

  const handleUpdateScout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!profile || !canManageScouts) {
      setEditErrorMessage("대원 수정 권한이 없습니다.");
      return;
    }

    if (!editForm.id) {
      setEditErrorMessage("수정할 대원 정보가 없습니다.");
      return;
    }

    if (!editForm.name.trim()) {
      setEditErrorMessage("대원명을 입력해야 합니다.");
      return;
    }

    if (!editForm.current_rank_id && Object.values(editForm.rank_approval_dates).some(Boolean)) {
      setEditErrorMessage("진급 인가일을 입력하려면 현재급위를 먼저 선택해야 합니다.");
      return;
    }

    if (editForm.current_rank_id) {
      const missingRankDates = getMissingRequiredRankApprovalDates(
        editForm.current_rank_id,
        editForm.rank_approval_dates,
      );

      if (missingRankDates.length > 0) {
        setEditErrorMessage(
          `${missingRankDates.map((item) => item.rank.rank_name).join(", ")} 인가일을 입력해야 합니다.`,
        );
        return;
      }

      const invalidRankDates = getInvalidRankApprovalDates(
        editForm.current_rank_id,
        editForm.rank_approval_dates,
      );

      if (invalidRankDates.length > 0) {
        setEditErrorMessage(
          `${invalidRankDates.map((item) => item.rank.rank_name).join(", ")} 인가일은 ${DATE_INPUT_MIN}부터 ${DATE_INPUT_MAX}까지의 날짜로 입력해야 합니다.`,
        );
        return;
      }

      const invalidDateOrder = getInvalidRankApprovalDateOrder(
        editForm.current_rank_id,
        editForm.rank_approval_dates,
      );

      if (invalidDateOrder) {
        setEditErrorMessage(
          `${invalidDateOrder.current.rank.rank_name} 인가일은 ${invalidDateOrder.previous.rank.rank_name} 인가일보다 빠를 수 없습니다.`,
        );
        return;
      }
    }

    const beginnerCourseExempted = getAutoBeginnerExempted(
      editForm.grade,
      editForm.is_from_cub_scout,
      editForm.cub_promotion_completed,
    );

    setEditSubmitting(true);
    setEditErrorMessage("");

    const rpcClient = supabase as unknown as {
      rpc: (
        functionName: string,
        args: Record<string, unknown>,
      ) => Promise<{
        data: unknown;
        error: { message: string } | null;
      }>;
    };

    const { data: updatedScout, error: updateError } = await rpcClient.rpc(
      "update_scout_basic_info",
      {
        p_scout_id: editForm.id,
        p_name: editForm.name.trim(),
        p_grade: toNullableText(editForm.grade),
        p_is_from_cub_scout: editForm.is_from_cub_scout,
        p_cub_promotion_completed: editForm.cub_promotion_completed,
        p_beginner_course_exempted: beginnerCourseExempted,
        p_note: toNullableText(editForm.note),
      },
    );

    if (updateError) {
      console.error("대원 수정 오류:", updateError.message);
      setEditErrorMessage(`대원 수정에 실패했습니다. ${updateError.message}`);
      setEditSubmitting(false);
      return;
    }

    const editedScout = await applyAutomaticCubRank(
      updatedScout as unknown as Scout,
      editForm.grade,
    );

    if (editForm.current_rank_id) {
      try {
        await saveRankHistoryChain({
          scoutId: editedScout.id,
          organizationId: editedScout.organization_id,
          currentRankId: editForm.current_rank_id,
          rankItems: getRankHistoryItemsForSave(
            editForm.current_rank_id,
            editForm.rank_approval_dates,
          ),
          note: "대원 기본정보 수정 시 입력",
        });
      } catch (error) {
        console.error("대원 수정 후 진급 이력 저장 오류:", error);
        setEditErrorMessage(
          error instanceof Error
            ? error.message
            : "대원 기본정보는 수정되었지만 진급 이력을 저장하지 못했습니다.",
        );
        setEditSubmitting(false);
        await loadData();
        return;
      }
    }

    setEditForm(getEmptyEditForm());
    setIsEditFormOpen(false);
    setEditSubmitting(false);
    await loadData();
  };

  const handleUpdateScoutStatus = async (scout: Scout, nextStatus: ScoutStatus) => {
    if (!profile || !canManageScouts) {
      setStatusErrorMessage("대원 상태 변경 권한이 없습니다.");
      return;
    }

    if (scout.status === nextStatus) {
      return;
    }

    setStatusUpdatingScoutId(scout.id);
    setStatusErrorMessage("");

    const rpcClient = supabase as unknown as {
      rpc: (
        functionName: string,
        args: Record<string, unknown>,
      ) => Promise<{
        data: unknown;
        error: { message: string } | null;
      }>;
    };

    const { data: updatedScout, error: updateError } = await rpcClient.rpc(
      "update_scout_status",
      {
        p_scout_id: scout.id,
        p_status: nextStatus,
      },
    );

    if (updateError) {
      console.error("대원 상태 변경 오류:", updateError.message);
      setStatusErrorMessage(`대원 상태 변경에 실패했습니다. ${updateError.message}`);
      setStatusUpdatingScoutId(null);
      return;
    }

    const changedScout = updatedScout as unknown as Scout;

    setScouts((prevScouts) =>
      prevScouts
        .map((item) => (item.id === changedScout.id ? changedScout : item))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );

    setStatusUpdatingScoutId(null);
  };

  const formatDate = (value: string | null) => {
    if (!value) return "-";
    return value.slice(0, 10);
  };

  const getStatusLabel = (status: ScoutStatus) => {
    return SCOUT_STATUS_LABELS[status] ?? status;
  };

  const getStatusBadgeStyle = (status: ScoutStatus): CSSProperties => {
    return {
      ...statusBadgeStyle,
      ...STATUS_COLOR_STYLES[status],
    };
  };

  const getStatusSelectStyle = (status: ScoutStatus): CSSProperties => {
    return {
      ...statusSelectStyle,
      ...STATUS_COLOR_STYLES[status],
    };
  };

  const getOrganizationName = (organizationId: string) => {
    return organizationNameMap.get(organizationId) ?? "-";
  };

  const getProgramTypeLabel = (programType: ProgramType) => {
    return PROGRAM_TYPE_OPTIONS.find((option) => option.value === programType)?.label ?? programType;
  };

  const getProgramTypeDescription = (programType: ProgramType) => {
    return PROGRAM_TYPE_OPTIONS.find((option) => option.value === programType)?.description ?? programType;
  };

  const getRankHistoryApprovedDate = (scout: Scout, rankId: string | null) => {
    return getLatestRankHistoryForScout(scout, rankId)?.approved_at.slice(0, 10) ?? "";
  };

  const saveRankHistoryRecord = async ({
    scoutId,
    organizationId,
    rankId,
    approvedAt,
    note,
  }: {
    scoutId: string;
    organizationId: string;
    rankId: string;
    approvedAt: string;
    note?: string | null;
  }) => {
    const { data: existingHistory, error: historyLookupError } = await supabase
      .from("scout_rank_histories")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("scout_id", scoutId)
      .eq("rank_id", rankId)
      .is("deleted_at", null)
      .maybeSingle();

    if (historyLookupError) {
      throw new Error(`진급 이력 확인에 실패했습니다. ${historyLookupError.message}`);
    }

    const cleanNote = note && note.trim().length > 0 ? note.trim() : null;

    if (existingHistory) {
      const { error: historyUpdateError } = await supabase
        .from("scout_rank_histories")
        .update({
          approved_at: approvedAt,
          approval_type: "normal",
          note: cleanNote,
        })
        .eq("id", existingHistory.id);

      if (historyUpdateError) {
        throw new Error(`진급 이력 수정에 실패했습니다. ${historyUpdateError.message}`);
      }

      return;
    }

    const { error: historyInsertError } = await supabase
      .from("scout_rank_histories")
      .insert({
        organization_id: organizationId,
        scout_id: scoutId,
        rank_id: rankId,
        approved_at: approvedAt,
        approval_type: "normal",
        note: cleanNote,
      });

    if (historyInsertError) {
      throw new Error(`진급 이력 등록에 실패했습니다. ${historyInsertError.message}`);
    }
  };

  const saveRankHistoryChain = async ({
    scoutId,
    organizationId,
    currentRankId,
    rankItems,
    note,
  }: {
    scoutId: string;
    organizationId: string;
    currentRankId: string;
    rankItems: Array<{ rankId: string; rankName: string; approvedAt: string }>;
    note?: string | null;
  }) => {
    if (!currentRankId) return;

    if (rankItems.length === 0) {
      throw new Error("저장할 진급 이력이 없습니다. 현재급위를 다시 선택해 주세요.");
    }

    const missingRankItem = rankItems.find((item) => !item.approvedAt);

    if (missingRankItem) {
      throw new Error(`${missingRankItem.rankName} 인가일을 입력해야 합니다.`);
    }

    for (const item of rankItems) {
      await saveRankHistoryRecord({
        scoutId,
        organizationId,
        rankId: item.rankId,
        approvedAt: item.approvedAt,
        note: note ?? "대원 통합관리에서 입력",
      });
    }

    const { error: currentRankUpdateError } = await supabase
      .from("scouts")
      .update({ current_rank_id: currentRankId })
      .eq("id", scoutId)
      .eq("organization_id", organizationId)
      .is("deleted_at", null);

    if (currentRankUpdateError) {
      throw new Error(`현재급위 반영에 실패했습니다. ${currentRankUpdateError.message}`);
    }
  };

  const handleGoToIntegratedManagement = (scout: Scout) => {
    const searchParams = new URLSearchParams({ scoutId: scout.id });
    navigate(`/scout-integrated?${searchParams.toString()}`);
  };

  const handleCloseIntegratedManagement = () => {
    if (integratedSubmitting) return;

    setIntegratedScoutId(null);
    setIntegratedSection("profile");
    setIntegratedErrorMessage("");
    setIntegratedSuccessMessage("");
    setIntegratedReviewDate(getTodayText());
    setIntegratedReviewErrorMessage("");
    setIntegratedReviewSuccessMessage("");
    setIntegratedApprovalDate(getTodayText());
    setIntegratedApprovalNote("");
    setIntegratedApprovalErrorMessage("");
    setRankQuickForm(getEmptyRankQuickForm());
    setBadgeQuickForm(getEmptyBadgeQuickForm());
    setProgramQuickForm(getEmptyProgramQuickForm());
  };

  const updateRankQuickForm = <K extends keyof RankQuickForm>(
    field: K,
    value: RankQuickForm[K],
  ) => {
    setRankQuickForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const updateBadgeQuickForm = <K extends keyof BadgeQuickForm>(
    field: K,
    value: BadgeQuickForm[K],
  ) => {
    setBadgeQuickForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const updateProgramQuickForm = <K extends keyof ProgramQuickForm>(
    field: K,
    value: ProgramQuickForm[K],
  ) => {
    setProgramQuickForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSaveIntegratedRank = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!integratedScout || !canManageScouts) {
      setIntegratedErrorMessage("현재급위 저장 권한이 없습니다.");
      return;
    }

    if (!rankQuickForm.rank_id) {
      setIntegratedErrorMessage("현재급위를 선택해야 합니다.");
      return;
    }

    const missingRankDates = getMissingRequiredRankApprovalDates(
      rankQuickForm.rank_id,
      rankQuickForm.rank_approval_dates,
    );

    if (missingRankDates.length > 0) {
      setIntegratedErrorMessage(
        `${missingRankDates.map((item) => item.rank.rank_name).join(", ")} 인가일을 입력해야 합니다.`,
      );
      return;
    }

    const invalidRankDates = getInvalidRankApprovalDates(
      rankQuickForm.rank_id,
      rankQuickForm.rank_approval_dates,
    );

    if (invalidRankDates.length > 0) {
      setIntegratedErrorMessage(
        `${invalidRankDates.map((item) => item.rank.rank_name).join(", ")} 인가일은 ${DATE_INPUT_MIN}부터 ${DATE_INPUT_MAX}까지의 날짜로 입력해야 합니다.`,
      );
      return;
    }

    const invalidDateOrder = getInvalidRankApprovalDateOrder(
      rankQuickForm.rank_id,
      rankQuickForm.rank_approval_dates,
    );

    if (invalidDateOrder) {
      setIntegratedErrorMessage(
        `${invalidDateOrder.current.rank.rank_name} 인가일은 ${invalidDateOrder.previous.rank.rank_name} 인가일보다 빠를 수 없습니다.`,
      );
      return;
    }

    setIntegratedSubmitting(true);
    setIntegratedErrorMessage("");
    setIntegratedSuccessMessage("");

    try {
      await saveRankHistoryChain({
        scoutId: integratedScout.id,
        organizationId: integratedScout.organization_id,
        currentRankId: rankQuickForm.rank_id,
        rankItems: getRankHistoryItemsForSave(
          rankQuickForm.rank_id,
          rankQuickForm.rank_approval_dates,
        ),
        note: rankQuickForm.note,
      });

      setIntegratedSuccessMessage("현재급위와 해당 급위까지의 진급 이력을 저장했습니다.");
      await loadData();
    } catch (error) {
      console.error("현재급위 저장 오류:", error);
      setIntegratedErrorMessage(
        error instanceof Error
          ? error.message
          : "현재급위 저장 중 문제가 발생했습니다.",
      );
    } finally {
      setIntegratedSubmitting(false);
    }
  };

  const handleCreateIntegratedBadge = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!integratedScout || !canManageScouts) {
      setIntegratedErrorMessage("기능장 등록 권한이 없습니다.");
      return;
    }

    if (!badgeQuickForm.badge_id) {
      setIntegratedErrorMessage("기능장을 선택해야 합니다.");
      return;
    }

    if (!badgeQuickForm.acquired_at) {
      setIntegratedErrorMessage("취득일을 입력해야 합니다.");
      return;
    }

    if (!isManagedDateValueValid(badgeQuickForm.acquired_at)) {
      setIntegratedErrorMessage(`취득일은 ${DATE_INPUT_MIN}부터 ${DATE_INPUT_MAX}까지의 날짜로 입력해야 합니다.`);
      return;
    }

    if (!badgeQuickForm.approved_at) {
      setIntegratedErrorMessage("인가일을 입력해야 합니다.");
      return;
    }

    if (!isManagedDateValueValid(badgeQuickForm.approved_at)) {
      setIntegratedErrorMessage(`인가일은 ${DATE_INPUT_MIN}부터 ${DATE_INPUT_MAX}까지의 날짜로 입력해야 합니다.`);
      return;
    }

    if (badgeQuickForm.approved_at < badgeQuickForm.acquired_at) {
      setIntegratedErrorMessage("인가일은 취득일보다 빠를 수 없습니다.");
      return;
    }

    setIntegratedSubmitting(true);
    setIntegratedErrorMessage("");
    setIntegratedSuccessMessage("");

    const rpcClient = supabase as unknown as {
      rpc: (
        functionName: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    };

    const { error } = await rpcClient.rpc("create_scout_badge_record", {
      p_scout_id: integratedScout.id,
      p_badge_id: badgeQuickForm.badge_id,
      p_acquired_at: badgeQuickForm.acquired_at,
      p_approved_at: badgeQuickForm.approved_at,
      p_instructor_name:
        badgeQuickForm.instructor_name.trim().length > 0
          ? badgeQuickForm.instructor_name.trim()
          : null,
      p_leader_confirmed: badgeQuickForm.leader_confirmed,
      p_note:
        badgeQuickForm.note.trim().length > 0 ? badgeQuickForm.note.trim() : null,
    });

    if (error) {
      console.error("통합관리 기능장 등록 오류:", error.message);
      setIntegratedErrorMessage(`기능장 등록에 실패했습니다. ${error.message}`);
      setIntegratedSubmitting(false);
      return;
    }

    setBadgeQuickForm(getEmptyBadgeQuickForm());
    setIntegratedSuccessMessage("기능장 취득기록을 등록했습니다.");
    setIntegratedSubmitting(false);
    await loadData();
  };

  const handleCreateIntegratedProgram = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!integratedScout || !canManageScouts) {
      setIntegratedErrorMessage("프로그램 이수 등록 권한이 없습니다.");
      return;
    }

    if (!programQuickForm.completed_at) {
      setIntegratedErrorMessage("이수일을 입력해야 합니다.");
      return;
    }

    if (!isManagedDateValueValid(programQuickForm.completed_at)) {
      setIntegratedErrorMessage(`이수일은 ${DATE_INPUT_MIN}부터 ${DATE_INPUT_MAX}까지의 날짜로 입력해야 합니다.`);
      return;
    }

    if (programQuickForm.approved_at && !isManagedDateValueValid(programQuickForm.approved_at)) {
      setIntegratedErrorMessage(`승인일은 ${DATE_INPUT_MIN}부터 ${DATE_INPUT_MAX}까지의 날짜로 입력해야 합니다.`);
      return;
    }

    if (programQuickForm.approved_at && programQuickForm.approved_at < programQuickForm.completed_at) {
      setIntegratedErrorMessage("승인일은 이수일보다 빠를 수 없습니다.");
      return;
    }

    const duplicateProgram = integratedScoutPrograms.some(
      (completion) => completion.program_type === programQuickForm.program_type,
    );

    if (duplicateProgram) {
      setIntegratedErrorMessage("선택한 프로그램 이수 기록이 이미 있습니다.");
      return;
    }

    setIntegratedSubmitting(true);
    setIntegratedErrorMessage("");
    setIntegratedSuccessMessage("");

    const rpcClient = supabase as unknown as {
      rpc: (
        functionName: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    };

    const { error } = await rpcClient.rpc("create_program_completion_record", {
      p_scout_id: integratedScout.id,
      p_program_type: programQuickForm.program_type,
      p_completed_at: programQuickForm.completed_at,
      p_certificate_no:
        programQuickForm.certificate_no.trim().length > 0
          ? programQuickForm.certificate_no.trim()
          : null,
      p_approved_at: programQuickForm.approved_at || null,
      p_note:
        programQuickForm.note.trim().length > 0
          ? programQuickForm.note.trim()
          : null,
    });

    if (error) {
      console.error("통합관리 프로그램 등록 오류:", error.message);
      setIntegratedErrorMessage(`프로그램 이수 등록에 실패했습니다. ${error.message}`);
      setIntegratedSubmitting(false);
      return;
    }

    setProgramQuickForm(getEmptyProgramQuickForm());
    setIntegratedSuccessMessage("프로그램 이수기록을 등록했습니다.");
    setIntegratedSubmitting(false);
    await loadData();
  };

  const handleRunIntegratedPromotionReview = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!integratedScout || !canManageScouts) {
      setIntegratedReviewErrorMessage("진급 판정 권한이 없습니다.");
      return;
    }

    if (!integratedScout.current_rank_id) {
      setIntegratedReviewErrorMessage("현재급위를 먼저 등록해야 합니다.");
      return;
    }

    if (!integratedNextRank) {
      setIntegratedReviewErrorMessage("다음 급위가 없어 진급 판정을 실행할 수 없습니다.");
      return;
    }

    if (!isManagedDateValueValid(integratedReviewDate)) {
      setIntegratedReviewErrorMessage(
        `판정일은 ${DATE_INPUT_MIN}부터 ${DATE_INPUT_MAX}까지의 날짜로 입력해야 합니다.`,
      );
      return;
    }

    setIntegratedReviewSubmitting(true);
    setIntegratedReviewErrorMessage("");
    setIntegratedReviewSuccessMessage("");
    setIntegratedApprovalErrorMessage("");

    const rpcClient = supabase as unknown as {
      rpc: (
        functionName: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    };

    try {
      const { error } = await rpcClient.rpc("review_scout_promotion", {
        p_scout_id: integratedScout.id,
        p_review_date: integratedReviewDate,
      });

      if (error) {
        console.error("통합관리 진급 판정 오류:", error.message);
        setIntegratedReviewErrorMessage(`진급 판정에 실패했습니다. ${error.message}`);
        return;
      }

      await loadData();
      setIntegratedReviewSuccessMessage("진급 판정을 완료했습니다.");
    } catch (error) {
      console.error("통합관리 진급 판정 실행 오류:", error);
      setIntegratedReviewErrorMessage(
        error instanceof Error
          ? `진급 판정 실행 중 오류가 발생했습니다. ${error.message}`
          : "진급 판정 실행 중 오류가 발생했습니다.",
      );
    } finally {
      setIntegratedReviewSubmitting(false);
    }
  };

  const handleApproveIntegratedPromotion = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!integratedScout || !canManageScouts) {
      setIntegratedApprovalErrorMessage("진급 인가 권한이 없습니다.");
      return;
    }

    if (!integratedLatestReview || !integratedLatestReview.final_passed) {
      setIntegratedApprovalErrorMessage("진급 가능한 최신 판정 결과가 없습니다.");
      return;
    }

    if (!isManagedDateValueValid(integratedApprovalDate)) {
      setIntegratedApprovalErrorMessage(
        `인가일은 ${DATE_INPUT_MIN}부터 ${DATE_INPUT_MAX}까지의 날짜로 입력해야 합니다.`,
      );
      return;
    }

    setIntegratedApprovalSubmitting(true);
    setIntegratedApprovalErrorMessage("");
    setIntegratedReviewSuccessMessage("");

    const rpcClient = supabase as unknown as {
      rpc: (
        functionName: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    };

    const { error } = await rpcClient.rpc("approve_scout_promotion", {
      p_promotion_review_id: integratedLatestReview.id,
      p_approved_at: integratedApprovalDate,
      p_note: toNullableText(integratedApprovalNote),
    });

    if (error) {
      console.error("통합관리 진급 인가 오류:", error.message);
      setIntegratedApprovalErrorMessage(`진급 인가 저장에 실패했습니다. ${error.message}`);
      setIntegratedApprovalSubmitting(false);
      return;
    }

    setIntegratedApprovalSubmitting(false);
    setIntegratedApprovalDate(getTodayText());
    setIntegratedApprovalNote("");
    setIntegratedReviewSuccessMessage(
      `${integratedNextRank?.rank_name ?? "다음 급위"} 진급 인가를 저장했습니다.`,
    );
    await loadData();
  };

  const getCreateFormOrganizationName = () => {
    const organizationId =
      profile?.role === "super_admin"
        ? createForm.organization_id
        : profile?.organization_id ?? "";

    if (!organizationId) {
      return "소속 조직 선택 후 자동 표시";
    }

    return organizationNameMap.get(organizationId) ?? "소속 조직명 확인 중";
  };

  const getBulkTargetOrganizationId = () => {
    if (!profile) return "";
    if (profile.role === "super_admin") return bulkOrganizationId;
    return profile.organization_id ?? "";
  };

  const getBulkTargetOrganizationName = () => {
    const organizationId = getBulkTargetOrganizationId();
    if (!organizationId) return "소속 조직을 선택하세요.";
    return organizationNameMap.get(organizationId) ?? "소속 조직명 확인 중";
  };

  const getTemplateFileName = () => {
    const organizationName = getBulkTargetOrganizationName().replace(/[/:*?"<>|]/g, "_");
    return `대원_엑셀_등록양식_${organizationName}_${getTodayText()}.xlsx`;
  };

  const downloadExcelTemplate = () => {
    setExcelErrorMessage("");
    setExcelSuccessMessage("");

    const workbook = XLSX.utils.book_new();

    const guideSheet = XLSX.utils.aoa_to_sheet(EXCEL_GUIDE_ROWS);
    guideSheet["!cols"] = [{ wch: 24 }, { wch: 100 }];
    XLSX.utils.book_append_sheet(workbook, guideSheet, "작성안내");

    EXCEL_IMPORT_SHEET_DEFINITIONS.forEach((definition) => {
      const templateRows = [EXCEL_TEMPLATE_HEADERS, ...EXCEL_SAMPLE_ROWS_BY_SECTION[definition.type]];
      const templateSheet = XLSX.utils.aoa_to_sheet(templateRows);
      templateSheet["!cols"] = EXCEL_TEMPLATE_HEADERS.map((header) => {
        if (header.includes("비고")) return { wch: 36 };
        if (header.includes("승진과정")) return { wch: 24 };
        if (header.includes("기능장")) return { wch: 18 };
        if (header.includes("인가일") || header.includes("입단일")) return { wch: 14 };
        if (header.includes("대원번호")) return { wch: 18 };
        if (header.includes("대원명")) return { wch: 16 };
        return { wch: 12 };
      });

      XLSX.utils.book_append_sheet(workbook, templateSheet, definition.sheetName);
    });

    XLSX.writeFile(workbook, getTemplateFileName());
  };

  const readCell = (row: Record<string, unknown>, keys: string[]) => {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(row, key)) {
        return row[key];
      }
    }
    return "";
  };

  const normalizeText = (value: unknown) => {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  };

  const getExcelSectionDefinition = (sheetName: string) => {
    const normalizedSheetName = sheetName.replace(/\s/g, "");

    if (normalizedSheetName.includes("벤처")) {
      return EXCEL_IMPORT_SHEET_DEFINITIONS.find((definition) => definition.type === "venture") ?? null;
    }

    if (normalizedSheetName.includes("컵")) {
      return EXCEL_IMPORT_SHEET_DEFINITIONS.find((definition) => definition.type === "cub") ?? null;
    }

    if (normalizedSheetName.includes("스카우트")) {
      return EXCEL_IMPORT_SHEET_DEFINITIONS.find((definition) => definition.type === "scout") ?? null;
    }

    return null;
  };

  const normalizeGradeValue = (value: unknown, sectionType: ExcelSectionType | null | undefined) => {
    const text = normalizeText(value);

    if (!text) {
      return { value: "", valid: true, message: "" };
    }

    if (ALL_GRADE_OPTIONS.includes(text)) {
      return { value: text, valid: true, message: "" };
    }

    const numericMatch = text.match(/^(\d)(?:\s*학년)?$/);

    if (!numericMatch) {
      return {
        value: text,
        valid: false,
        message: "학년은 해당 부문 탭에서 숫자로 입력하세요. 예: 스카우트 탭 1, 2, 3",
      };
    }

    const gradeNumber = Number(numericMatch[1]);
    const definition = EXCEL_IMPORT_SHEET_DEFINITIONS.find((item) => item.type === sectionType);

    if (!definition) {
      return {
        value: text,
        valid: false,
        message: "숫자 학년은 컵스카우트, 스카우트, 벤처스카우트 탭에서 입력해야 합니다.",
      };
    }

    if (gradeNumber < definition.minGrade || gradeNumber > definition.maxGrade) {
      return {
        value: text,
        valid: false,
        message: `${definition.sheetName} 탭의 학년은 ${definition.minGrade}~${definition.maxGrade}만 입력할 수 있습니다.`,
      };
    }

    return {
      value: `${definition.gradePrefix} ${gradeNumber}학년`,
      valid: true,
      message: "",
    };
  };

  const parseExcelDate = (value: unknown) => {
    if (value === null || value === undefined || value === "") return "";

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return "";
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, "0");
      const day = String(value.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }

    if (typeof value === "number") {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (!parsed) return "";
      const year = String(parsed.y).padStart(4, "0");
      const month = String(parsed.m).padStart(2, "0");
      const day = String(parsed.d).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }

    const text = normalizeText(value).replace(/[.]/g, "-").replace(/[/]/g, "-");
    const dateMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

    if (!dateMatch) return text;

    const [, year, month, day] = dateMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  };

  const isValidDateText = (value: string) => {
    return isManagedDateValueValid(value);
  };

  const parseBooleanValue = (value: unknown, defaultValue = false): ParsedBoolean => {
    const text = normalizeText(value).toLowerCase();

    if (!text) {
      return { value: defaultValue, valid: true };
    }

    if (["예", "네", "y", "yes", "true", "1", "o", "○", "해당", "면제", "완료", "이수"].includes(text)) {
      return { value: true, valid: true };
    }

    if (["아니오", "아니요", "n", "no", "false", "0", "x", "×", "-", "미해당", "미이수"].includes(text)) {
      return { value: false, valid: true };
    }

    return { value: defaultValue, valid: false };
  };

  const parseStatusValue = (value: unknown, defaultValue: ScoutStatus): { value: ScoutStatus; valid: boolean } => {
    const text = normalizeText(value).toLowerCase();

    if (!text) return { value: defaultValue, valid: true };
    if (text === "활동" || text === "active") return { value: "active", valid: true };
    if (text === "비활동" || text === "inactive") return { value: "inactive", valid: true };
    if (text === "졸업" || text === "graduated") return { value: "graduated", valid: true };

    return { value: defaultValue, valid: false };
  };

  const isBlankExcelRow = (row: Record<string, unknown>) => {
    return Object.entries(row)
      .filter(([key]) => !key.startsWith("__"))
      .every(([, value]) => normalizeText(value).length === 0);
  };

  const resolveRankByAliases = (aliases: string[]) => {
    for (const alias of aliases) {
      const rank = resolveRankByText(alias);
      if (rank) return rank;
    }

    return null;
  };

  const resolveBadgeByText = (value: unknown) => {
    const normalizedValue = normalizeLookupText(value);

    if (!normalizedValue) return null;

    const exactMatch = badgeByNormalizedName.get(normalizedValue);
    if (exactMatch) return exactMatch;

    return (
      badges.find((badge) => {
        const normalizedBadgeName = normalizeLookupText(badge.name);
        return (
          normalizedBadgeName.includes(normalizedValue) ||
          normalizedValue.includes(normalizedBadgeName)
        );
      }) ?? null
    );
  };

  const getRankDateKeys = (rankName: string) => [
    `${rankName} 인가일`,
    `${rankName}인가일`,
    `${rankName} 승인일`,
    `${rankName}승인일`,
    `${rankName} 진급일`,
    `${rankName}진급일`,
  ];

  const addRankImportItem = (
    itemsByRankId: Map<string, ExcelRankImportItem>,
    rank: Rank,
    rawDateValue: unknown,
    errors: string[],
    label: string,
  ) => {
    const approvedAt = parseExcelDate(rawDateValue);

    if (!approvedAt) return;

    if (!isValidDateText(approvedAt)) {
      errors.push(`${label} 형식이 올바르지 않습니다. 예: 2026-03-01`);
      return;
    }

    itemsByRankId.set(rank.id, {
      rankId: rank.id,
      rankName: rank.rank_name,
      approvedAt,
    });
  };

  const parseRankImportItems = (row: Record<string, unknown>, errors: string[]) => {
    const itemsByRankId = new Map<string, ExcelRankImportItem>();
    const currentRankRawValue = readCell(row, ["현재급위", "현재 급위", "급위", "current_rank", "current_rank_name"]);
    const currentRankRawText = normalizeText(currentRankRawValue);
    const currentRank = currentRankRawText ? resolveRankByText(currentRankRawText) : null;

    if (currentRankRawText && !currentRank) {
      errors.push(`현재급위 '${currentRankRawText}'가 등록된 급위와 일치하지 않습니다.`);
    }

    ranks.forEach((rank) => {
      const rawDateValue = readCell(row, getRankDateKeys(rank.rank_name));
      addRankImportItem(itemsByRankId, rank, rawDateValue, errors, `${rank.rank_name} 인가일`);
    });

    RANK_DATE_ALIAS_DEFINITIONS.forEach((definition) => {
      const rank = resolveRankByAliases(definition.aliases);
      const rawDateValue = readCell(row, definition.dateKeys);
      const rawDateText = normalizeText(rawDateValue);

      if (rawDateText && !rank) {
        errors.push(`${definition.label} 급위를 찾지 못했습니다.`);
        return;
      }

      if (rank) {
        addRankImportItem(itemsByRankId, rank, rawDateValue, errors, `${definition.label} 인가일`);
      }
    });

    if (currentRank) {
      const genericApprovalDate = readCell(row, ["급위 인가일", "진급 인가일", "현재급위 인가일", "인가일"]);
      addRankImportItem(itemsByRankId, currentRank, genericApprovalDate, errors, "급위 인가일");
    }

    const rankItems = Array.from(itemsByRankId.values()).sort((a, b) => {
      const rankA = rankMap.get(a.rankId);
      const rankB = rankMap.get(b.rankId);
      return (rankA?.sort_order ?? 999) - (rankB?.sort_order ?? 999);
    });

    const highestRankItem = rankItems[rankItems.length - 1] ?? null;
    const currentRankId = highestRankItem?.rankId ?? currentRank?.id ?? null;
    const currentRankName = currentRankId ? rankNameMap.get(currentRankId) ?? "" : "";

    return {
      currentRankId,
      currentRankName,
      rankItems,
    };
  };

  const splitCombinedBadgeText = (value: unknown) => {
    const text = normalizeText(value);

    if (!text) return [] as Array<{ badgeName: string; approvedAt: string }>;

    return text
      .split(/[\n,;]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const dateMatch = entry.match(/(\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2})/);
        const approvedAt = dateMatch ? parseExcelDate(dateMatch[1]) : "";
        const badgeName = entry
          .replace(dateMatch?.[1] ?? "", "")
          .replace(/[()[\]{}:：]/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        return { badgeName, approvedAt };
      })
      .filter((item) => item.badgeName.length > 0);
  };

  const addBadgeImportItem = (
    itemsByBadgeId: Map<string, ExcelBadgeImportItem>,
    rawBadgeNameValue: unknown,
    rawDateValue: unknown,
    errors: string[],
    label: string,
  ) => {
    const badgeNameText = normalizeText(rawBadgeNameValue);
    const approvedAt = parseExcelDate(rawDateValue);

    if (!badgeNameText && !approvedAt) return;

    if (!badgeNameText && approvedAt) {
      errors.push(`${label} 기능장명을 입력해야 합니다.`);
      return;
    }

    const badge = resolveBadgeByText(badgeNameText);

    if (!badge) {
      errors.push(`${label} '${badgeNameText}' 기능장을 찾지 못했습니다.`);
      return;
    }

    if (!approvedAt) {
      errors.push(`${label} 인가일을 입력해야 합니다.`);
      return;
    }

    if (!isValidDateText(approvedAt)) {
      errors.push(`${label} 인가일 형식이 올바르지 않습니다. 예: 2026-03-01`);
      return;
    }

    itemsByBadgeId.set(badge.id, {
      badgeId: badge.id,
      badgeName: badge.name,
      approvedAt,
    });
  };

  const parseBadgeImportItems = (row: Record<string, unknown>, errors: string[]) => {
    const itemsByBadgeId = new Map<string, ExcelBadgeImportItem>();

    addBadgeImportItem(
      itemsByBadgeId,
      readCell(row, ["기능장명", "취득기능장", "취득 기능장", "기능장"]),
      readCell(row, ["기능장 인가일", "기능장 취득일", "취득 인가일", "기능장취득일"]),
      errors,
      "기능장",
    );

    for (let index = 1; index <= EXCEL_BADGE_PAIR_COUNT; index += 1) {
      addBadgeImportItem(
        itemsByBadgeId,
        readCell(row, [`기능장${index}`, `기능장 ${index}`, `기능장명${index}`, `기능장명 ${index}`]),
        readCell(row, [
          `기능장${index} 인가일`,
          `기능장 ${index} 인가일`,
          `기능장${index} 취득일`,
          `기능장 ${index} 취득일`,
          `기능장${index} 취득 인가일`,
          `기능장 ${index} 취득 인가일`,
        ]),
        errors,
        `기능장${index}`,
      );
    }

    splitCombinedBadgeText(readCell(row, ["기능장 취득정보", "기능장취득정보", "기능장 목록", "취득 기능장 목록"])).forEach(
      (item, index) => {
        addBadgeImportItem(
          itemsByBadgeId,
          item.badgeName,
          item.approvedAt,
          errors,
          `기능장 취득정보 ${index + 1}`,
        );
      },
    );

    return Array.from(itemsByBadgeId.values()).sort((a, b) => a.badgeName.localeCompare(b.badgeName, "ko"));
  };

  const buildExcelPreviewRows = (rows: ExcelSourceRow[]): ExcelImportRow[] => {
    const targetOrganizationId = getBulkTargetOrganizationId();

    return rows.map((row, index) => {
      const rowNumber = typeof row.__sourceRowNumber === "number" ? row.__sourceRowNumber : index + 2;
      const sectionType = row.__sectionType ?? null;
      const sectionLabel = row.__sectionLabel || row.__sheetName || "확인 필요";
      const errors: string[] = [];
      const memberNo = normalizeText(readCell(row, ["대원번호", "회원번호", "member_no", "Member No"]));
      const name = normalizeText(readCell(row, ["대원명", "이름", "성명", "name"]));
      const gradeResult = normalizeGradeValue(readCell(row, ["학년", "grade"]), sectionType);
      const grade = gradeResult.value;
      const joinedAt = parseExcelDate(readCell(row, ["입단일", "가입일", "joined_at"]));
      const note = normalizeText(readCell(row, ["비고", "메모", "note"]));
      const rankImportResult = parseRankImportItems(row, errors);
      const badgeItems = parseBadgeImportItems(row, errors);
      const autoCubRankName = getCubRankNameByGrade(grade);
      const autoCubRank = autoCubRankName ? resolveRankByText(autoCubRankName) : null;
      const currentRankId = autoCubRank?.id ?? rankImportResult.currentRankId;
      const currentRankName =
        autoCubRank?.rank_name ?? autoCubRankName ?? rankImportResult.currentRankName;

      const existingScout = memberNo
        ? scoutByMemberNo.get(`${targetOrganizationId}::${memberNo}`) ?? null
        : null;
      const action: ExcelImportAction | null = memberNo ? "update" : "create";

      const defaultStatus = existingScout?.status ?? "active";
      const parsedStatus = parseStatusValue(readCell(row, ["상태", "status"]), defaultStatus);
      const parsedIsFromCub = parseBooleanValue(
        readCell(row, ["컵스카우트 출신", "컵 출신", "is_from_cub_scout"]),
        existingScout?.is_from_cub_scout ?? false,
      );
      const parsedCubPromotion = parseBooleanValue(
        readCell(row, ["컵스카우트 승진과정 이수", "승진과정 이수", "cub_promotion_completed"]),
        existingScout?.cub_promotion_completed ?? false,
      );

      const beginnerRawValue = readCell(row, ["초급과정 면제", "초급면제", "beginner_course_exempted"]);
      const beginnerDefault = getAutoBeginnerExempted(
        grade,
        parsedIsFromCub.value,
        parsedCubPromotion.value,
      );
      const parsedBeginnerExempted = parseBooleanValue(
        beginnerRawValue,
        normalizeText(beginnerRawValue) ? existingScout?.beginner_course_exempted ?? beginnerDefault : beginnerDefault,
      );
      const beginnerCourseExempted = isElementarySchoolGrade(grade)
        ? false
        : parsedBeginnerExempted.value;

      if (!targetOrganizationId) {
        errors.push("소속 조직을 선택해야 합니다.");
      }

      if (!name) {
        errors.push("대원명을 입력해야 합니다.");
      }

      if (!gradeResult.valid) {
        errors.push(gradeResult.message);
      }

      if (action === "create") {
        if (!joinedAt) {
          errors.push("신규 대원은 입단일을 입력해야 합니다.");
        } else if (!isValidDateText(joinedAt)) {
          errors.push("입단일 형식이 올바르지 않습니다. 예: 2026-03-01");
        }
      }

      if (action === "update" && !existingScout) {
        errors.push("대원번호가 일치하는 기존 대원이 없습니다. 신규 등록은 대원번호를 비워두세요.");
      }

      if (!parsedStatus.valid) {
        errors.push("상태는 활동, 비활동, 졸업 중 하나로 입력해야 합니다.");
      }

      if (!parsedIsFromCub.valid) {
        errors.push("컵스카우트 출신은 예/아니오 형식으로 입력해야 합니다.");
      }

      if (!parsedCubPromotion.valid) {
        errors.push("컵스카우트 승진과정 이수는 예/아니오 형식으로 입력해야 합니다.");
      }

      if (!parsedBeginnerExempted.valid) {
        errors.push("초급과정 면제는 예/아니오 형식으로 입력해야 합니다.");
      }

      return {
        rowNumber,
        sectionLabel,
        action,
        matchedScoutId: existingScout?.id ?? null,
        member_no: memberNo,
        name,
        grade,
        joined_at: action === "update" ? existingScout?.joined_at ?? joinedAt : joinedAt,
        status: parsedStatus.value,
        current_rank_id: currentRankId,
        current_rank_name: currentRankName,
        rank_items: rankImportResult.rankItems,
        badge_items: badgeItems,
        is_from_cub_scout: parsedIsFromCub.value,
        cub_promotion_completed: parsedCubPromotion.value,
        beginner_course_exempted: beginnerCourseExempted,
        note,
        errors,
      };
    });
  };

  const handleExcelFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!canUseExcelImport) {
      setExcelErrorMessage("엑셀 등록/수정은 관리자만 사용할 수 있습니다.");
      return;
    }

    if (!getBulkTargetOrganizationId()) {
      setExcelErrorMessage("엑셀 파일을 선택하기 전에 소속 조직을 선택하세요.");
      return;
    }

    setExcelErrorMessage("");
    setExcelSuccessMessage("");
    setExcelFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });

      if (workbook.SheetNames.length === 0) {
        setExcelPreviewRows([]);
        setExcelErrorMessage("엑셀 파일에서 시트를 찾지 못했습니다.");
        return;
      }

      const sectionSheetNames = workbook.SheetNames.filter((sheetName) => getExcelSectionDefinition(sheetName));
      const sheetNamesToRead = sectionSheetNames.length > 0 ? sectionSheetNames : [workbook.SheetNames[0]];
      const rows: ExcelSourceRow[] = [];

      sheetNamesToRead.forEach((sheetName) => {
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) return;

        const sectionDefinition = getExcelSectionDefinition(sheetName);
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
          defval: "",
        });

        rawRows.forEach((row, index) => {
          const sourceRow: ExcelSourceRow = {
            ...row,
            __sheetName: sheetName,
            __sectionType: sectionDefinition?.type ?? null,
            __sectionLabel: sectionDefinition?.sheetName ?? sheetName,
            __sourceRowNumber: index + 2,
          };

          if (!isBlankExcelRow(sourceRow)) {
            rows.push(sourceRow);
          }
        });
      });

      if (rows.length === 0) {
        setExcelPreviewRows([]);
        setExcelErrorMessage("업로드할 대원 정보가 없습니다.");
        return;
      }

      setExcelPreviewRows(buildExcelPreviewRows(rows));
    } catch (error) {
      console.error("엑셀 파일 확인 오류:", error);
      setExcelPreviewRows([]);
      setExcelErrorMessage("엑셀 파일을 확인하지 못했습니다. 양식 파일인지 확인하세요.");
    }
  };

  const saveExcelRankItems = async (
    scoutId: string,
    organizationId: string,
    row: ExcelImportRow,
  ) => {
    for (const item of row.rank_items) {
      const { data: existingHistory, error: historyLookupError } = await supabase
        .from("scout_rank_histories")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("scout_id", scoutId)
        .eq("rank_id", item.rankId)
        .is("deleted_at", null)
        .maybeSingle();

      if (historyLookupError) {
        throw new Error(`${row.rowNumber}행 ${item.rankName} 진급이력 확인 실패: ${historyLookupError.message}`);
      }

      if (existingHistory) {
        const { error: historyUpdateError } = await supabase
          .from("scout_rank_histories")
          .update({
            approved_at: item.approvedAt,
            approval_type: "normal",
          })
          .eq("id", existingHistory.id);

        if (historyUpdateError) {
          throw new Error(`${row.rowNumber}행 ${item.rankName} 진급이력 수정 실패: ${historyUpdateError.message}`);
        }
      } else {
        const { error: historyInsertError } = await supabase
          .from("scout_rank_histories")
          .insert({
            organization_id: organizationId,
            scout_id: scoutId,
            rank_id: item.rankId,
            approved_at: item.approvedAt,
            approval_type: "normal",
          });

        if (historyInsertError) {
          throw new Error(`${row.rowNumber}행 ${item.rankName} 진급이력 등록 실패: ${historyInsertError.message}`);
        }
      }
    }

    if (row.current_rank_id) {
      const { error: currentRankUpdateError } = await supabase
        .from("scouts")
        .update({ current_rank_id: row.current_rank_id })
        .eq("id", scoutId)
        .eq("organization_id", organizationId)
        .is("deleted_at", null);

      if (currentRankUpdateError) {
        throw new Error(`${row.rowNumber}행 현재급위 반영 실패: ${currentRankUpdateError.message}`);
      }
    }
  };

  const saveExcelBadgeItems = async (
    scoutId: string,
    organizationId: string,
    row: ExcelImportRow,
  ) => {
    for (const item of row.badge_items) {
      const { data: existingBadge, error: badgeLookupError } = await supabase
        .from("scout_badges")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("scout_id", scoutId)
        .eq("badge_id", item.badgeId)
        .is("deleted_at", null)
        .maybeSingle();

      if (badgeLookupError) {
        throw new Error(`${row.rowNumber}행 ${item.badgeName} 기능장 확인 실패: ${badgeLookupError.message}`);
      }

      if (existingBadge) {
        const { error: badgeUpdateError } = await supabase
          .from("scout_badges")
          .update({
            acquired_at: item.approvedAt,
            approved_at: item.approvedAt,
            leader_confirmed: true,
          })
          .eq("id", existingBadge.id);

        if (badgeUpdateError) {
          throw new Error(`${row.rowNumber}행 ${item.badgeName} 기능장 수정 실패: ${badgeUpdateError.message}`);
        }
      } else {
        const { error: badgeInsertError } = await supabase
          .from("scout_badges")
          .insert({
            organization_id: organizationId,
            scout_id: scoutId,
            badge_id: item.badgeId,
            acquired_at: item.approvedAt,
            approved_at: item.approvedAt,
            leader_confirmed: true,
          });

        if (badgeInsertError) {
          throw new Error(`${row.rowNumber}행 ${item.badgeName} 기능장 등록 실패: ${badgeInsertError.message}`);
        }
      }
    }
  };

  const handleSaveExcelRows = async () => {
    if (!profile || !canUseExcelImport) {
      setExcelErrorMessage("엑셀 등록/수정은 관리자만 사용할 수 있습니다.");
      return;
    }

    const targetOrganizationId = getBulkTargetOrganizationId();
    const targetOrganizationName = organizationNameMap.get(targetOrganizationId);

    if (!targetOrganizationId || !targetOrganizationName) {
      setExcelErrorMessage("소속 조직 정보를 확인하지 못했습니다.");
      return;
    }

    const invalidRows = excelPreviewRows.filter((row) => row.errors.length > 0);
    if (invalidRows.length > 0) {
      setExcelErrorMessage("오류가 있는 행이 있습니다. 오류 내용을 수정한 뒤 다시 업로드하세요.");
      return;
    }

    const validRows = excelPreviewRows.filter((row) => row.action);
    if (validRows.length === 0) {
      setExcelErrorMessage("저장할 대원 정보가 없습니다.");
      return;
    }

    const rankItemCount = validRows.reduce((sum, row) => sum + row.rank_items.length, 0);
    const badgeItemCount = validRows.reduce((sum, row) => sum + row.badge_items.length, 0);

    const confirmed = window.confirm(
      `엑셀 대원 정보를 저장하시겠습니까?\n신규 등록 ${validRows.filter((row) => row.action === "create").length}건, 기존 수정 ${validRows.filter((row) => row.action === "update").length}건, 진급정보 ${rankItemCount}건, 기능장 ${badgeItemCount}건`,
    );

    if (!confirmed) return;

    setExcelSubmitting(true);
    setExcelErrorMessage("");
    setExcelSuccessMessage("");

    const rpcClient = supabase as unknown as {
      rpc: (
        functionName: string,
        args: Record<string, unknown>,
      ) => Promise<{
        data: unknown;
        error: { message: string } | null;
      }>;
    };

    let createdCount = 0;
    let updatedCount = 0;
    let rankSavedCount = 0;
    let badgeSavedCount = 0;

    try {
      for (const row of validRows) {
        if (row.action === "create") {
          const { data: createdScoutData, error: createError } = await rpcClient.rpc(
            "create_scout_auto_member_no",
            {
              p_name: row.name,
              p_organization_id: targetOrganizationId,
              p_school_name: targetOrganizationName,
              p_grade: toNullableText(row.grade),
              p_joined_at: row.joined_at,
              p_is_from_cub_scout: row.is_from_cub_scout,
              p_cub_promotion_completed: row.cub_promotion_completed,
              p_beginner_course_exempted: row.beginner_course_exempted,
              p_note: toNullableText(row.note),
            },
          );

          if (createError) {
            throw new Error(`${row.rowNumber}행 신규 등록 실패: ${createError.message}`);
          }

          const createdScout = createdScoutData as unknown as Scout;

          if (row.status !== "active") {
            const { error: statusError } = await rpcClient.rpc("update_scout_status", {
              p_scout_id: createdScout.id,
              p_status: row.status,
            });

            if (statusError) {
              throw new Error(`${row.rowNumber}행 상태 저장 실패: ${statusError.message}`);
            }
          }

          await saveExcelRankItems(createdScout.id, targetOrganizationId, row);
          await saveExcelBadgeItems(createdScout.id, targetOrganizationId, row);
          rankSavedCount += row.rank_items.length;
          badgeSavedCount += row.badge_items.length;

          createdCount += 1;
        }

        if (row.action === "update" && row.matchedScoutId) {
          const { error: updateError } = await rpcClient.rpc("update_scout_basic_info", {
            p_scout_id: row.matchedScoutId,
            p_name: row.name,
            p_grade: toNullableText(row.grade),
            p_is_from_cub_scout: row.is_from_cub_scout,
            p_cub_promotion_completed: row.cub_promotion_completed,
            p_beginner_course_exempted: row.beginner_course_exempted,
            p_note: toNullableText(row.note),
          });

          if (updateError) {
            throw new Error(`${row.rowNumber}행 수정 실패: ${updateError.message}`);
          }

          const existingScout = scouts.find((scout) => scout.id === row.matchedScoutId);
          if (existingScout && existingScout.status !== row.status) {
            const { error: statusError } = await rpcClient.rpc("update_scout_status", {
              p_scout_id: row.matchedScoutId,
              p_status: row.status,
            });

            if (statusError) {
              throw new Error(`${row.rowNumber}행 상태 저장 실패: ${statusError.message}`);
            }
          }

          await saveExcelRankItems(row.matchedScoutId, targetOrganizationId, row);
          await saveExcelBadgeItems(row.matchedScoutId, targetOrganizationId, row);
          rankSavedCount += row.rank_items.length;
          badgeSavedCount += row.badge_items.length;

          updatedCount += 1;
        }
      }

      setExcelPreviewRows([]);
      setExcelFileName("");
      setExcelSuccessMessage(`엑셀 대원 정보 저장이 완료되었습니다. 신규 ${createdCount}건, 수정 ${updatedCount}건, 진급정보 ${rankSavedCount}건, 기능장 ${badgeSavedCount}건`);
      await loadData();
    } catch (error) {
      console.error("엑셀 대원 저장 오류:", error);
      setExcelErrorMessage(
        error instanceof Error ? error.message : "엑셀 대원 정보 저장에 실패했습니다.",
      );
    } finally {
      setExcelSubmitting(false);
    }
  };

  const handleClearExcelPreview = () => {
    if (excelSubmitting) return;
    setExcelPreviewRows([]);
    setExcelFileName("");
    setExcelErrorMessage("");
    setExcelSuccessMessage("");
  };

  const excelImportSummary = useMemo(() => {
    return {
      total: excelPreviewRows.length,
      create: excelPreviewRows.filter((row) => row.action === "create" && row.errors.length === 0).length,
      update: excelPreviewRows.filter((row) => row.action === "update" && row.errors.length === 0).length,
      rank: excelPreviewRows.reduce((sum, row) => sum + (row.errors.length === 0 ? row.rank_items.length : 0), 0),
      badge: excelPreviewRows.reduce((sum, row) => sum + (row.errors.length === 0 ? row.badge_items.length : 0), 0),
      error: excelPreviewRows.filter((row) => row.errors.length > 0).length,
    };
  }, [excelPreviewRows]);

  const activeScoutCount = useMemo(() => {
    return scouts.filter((scout) => scout.status === "active").length;
  }, [scouts]);

  const inactiveScoutCount = useMemo(() => {
    return scouts.filter((scout) => scout.status === "inactive").length;
  }, [scouts]);

  const graduatedScoutCount = useMemo(() => {
    return scouts.filter((scout) => scout.status === "graduated").length;
  }, [scouts]);

  return (
    <div>
      <div style={pageHeaderStyle}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}><h1 style={pageTitleStyle}>대원 관리</h1><PageHelpButton title="대원 관리" description="대원 등록·기본정보 수정·상태 변경을 처리하는 화면입니다." sections={[{ title: "사용 순서", content: "대원을 등록하거나 엑셀로 일괄 입력한 뒤 기본정보와 활동 상태를 관리합니다." },{ title: "주의사항", content: "진급·기능장·프로그램·출석의 종합 확인은 대원 통합관리를 사용합니다." }]} /></div>
          <p style={pageDescriptionStyle}>
            소속대의 대원 정보를 등록하고 관리합니다.
          </p>
        </div>

        {profile && (
          <div style={roleBadgeStyle}>
            {ROLE_LABELS[profile.role]}
          </div>
        )}
      </div>

      <div style={summaryGridStyle}>
        <section style={summaryCardStyle}>
          <h2 style={summaryTitleStyle}>전체 대원</h2>
          <p style={summaryValueStyle}>{scouts.length}명</p>
          <p style={summaryDescriptionStyle}>등록되어 관리 중인 전체 대원입니다.</p>
        </section>

        <section style={summaryCardStyle}>
          <h2 style={summaryTitleStyle}>활동 대원</h2>
          <p style={summaryValueStyle}>{activeScoutCount}명</p>
          <p style={summaryDescriptionStyle}>현재 활동 상태로 관리되는 대원입니다.</p>
        </section>

        <section style={summaryCardStyle}>
          <h2 style={summaryTitleStyle}>비활동 대원</h2>
          <p style={summaryValueStyle}>{inactiveScoutCount}명</p>
          <p style={summaryDescriptionStyle}>현재 비활동 상태로 관리되는 대원입니다.</p>
        </section>

        <section style={summaryCardStyle}>
          <h2 style={summaryTitleStyle}>졸업 대원</h2>
          <p style={summaryValueStyle}>{graduatedScoutCount}명</p>
          <p style={summaryDescriptionStyle}>졸업 상태로 관리되는 대원입니다.</p>
        </section>
      </div>

      <section style={contentCardStyle}>
        <div style={toolbarStyle}>
          <div>
            <h2 style={sectionTitleStyle}>대원 목록</h2>
            <p style={sectionDescriptionStyle}>
              대원번호, 이름, 학년, 현재급위와 활동 상태를 확인합니다.
            </p>
          </div>

          <div style={toolbarRightStyle}>
            {canManageScouts && (
              <button
                type="button"
                style={primaryButtonStyle}
                onClick={handleOpenCreateForm}
              >
                대원 등록
              </button>
            )}

            {canUseExcelImport && (
              <button
                type="button"
                style={secondaryButtonStyle}
                onClick={() => setIsExcelPanelOpen((current) => !current)}
              >
                {isExcelPanelOpen ? "엑셀 작업 접기" : "엑셀 대량 등록"}
              </button>
            )}
          </div>
        </div>

        {canUseExcelImport && isExcelPanelOpen && (
          <section style={excelPanelStyle}>
            <div style={excelPanelHeaderStyle}>
              <div>
                <h3 style={formTitleStyle}>엑셀 대원 등록/수정</h3>
                <p style={formDescriptionStyle}>
                  엑셀 파일로 대원정보, 급위, 기능장 취득정보를 함께 등록하거나 수정합니다.
                </p>
              </div>
              <div style={excelPanelActionStyle}>
                <input
                  ref={excelFileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  style={hiddenInputStyle}
                  onChange={handleExcelFileChange}
                />
                <button
                  type="button"
                  style={secondaryButtonStyle}
                  onClick={downloadExcelTemplate}
                >
                  양식 내려받기
                </button>
                <button
                  type="button"
                  style={excelButtonStyle}
                  onClick={() => excelFileInputRef.current?.click()}
                >
                  엑셀 파일 선택
                </button>
                <button
                  type="button"
                  style={secondaryButtonStyle}
                  onClick={() => setIsExcelGuideOpen((current) => !current)}
                >
                  {isExcelGuideOpen ? "안내 접기" : "안내 보기"}
                </button>
                {excelPreviewRows.length > 0 && (
                  <button
                    type="button"
                    style={secondaryButtonStyle}
                    onClick={handleClearExcelPreview}
                    disabled={excelSubmitting}
                  >
                    업로드 내용 지우기
                  </button>
                )}
              </div>
            </div>

            {isSuperAdmin && (
              <label style={{ ...fieldLabelStyle, maxWidth: "420px", marginBottom: "12px" }}>
                <span style={fieldLabelTextStyle}>엑셀 적용 소속 조직 <span style={requiredStyle}>*</span></span>
                <select
                  style={inputStyle}
                  value={bulkOrganizationId}
                  onChange={(event) => {
                    setBulkOrganizationId(event.target.value);
                    setExcelPreviewRows([]);
                    setExcelFileName("");
                    setExcelErrorMessage("");
                    setExcelSuccessMessage("");
                  }}
                >
                  <option value="">소속 조직 선택</option>
                  {organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div style={excelCompactGuideStyle}>
              엑셀 파일은 컵스카우트, 스카우트, 벤처스카우트 탭으로 작성합니다. 신규 대원번호는 저장 시 자동 발번됩니다.
            </div>

            {isExcelGuideOpen && (
              <div style={excelGuideBoxStyle}>
                <strong>업로드 기준</strong>
                <span>현재 적용 소속: {getBulkTargetOrganizationName()}</span>
                <span>탭명에 따라 학년을 자동 변환합니다. 컵스카우트는 1~6, 스카우트와 벤처스카우트는 1~3으로 입력합니다.</span>
                <span>대원번호가 비어 있으면 신규 등록, 기존 대원번호와 일치하면 기존 대원 수정으로 처리합니다.</span>
                <span>급위별 인가일은 진급이력으로, 기능장명과 인가일은 기능장 취득정보로 반영합니다.</span>
              </div>
            )}

            {excelErrorMessage && <div style={errorBoxStyle}>{excelErrorMessage}</div>}
            <FeedbackToast message={excelSuccessMessage} tone="success" onClose={() => setExcelSuccessMessage("")} />

            {excelPreviewRows.length > 0 && (
              <div style={excelPreviewWrapStyle}>
                <div style={excelSummaryStyle}>
                  <span>파일: {excelFileName || "-"}</span>
                  <span>전체 {excelImportSummary.total}건</span>
                  <span>신규 {excelImportSummary.create}건</span>
                  <span>수정 {excelImportSummary.update}건</span>
                  <span>진급정보 {excelImportSummary.rank}건</span>
                  <span>기능장 {excelImportSummary.badge}건</span>
                  <span>오류 {excelImportSummary.error}건</span>
                </div>

                <div style={tableWrapStyle}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>행</th>
                        <th style={thStyle}>구분</th>
                        <th style={thStyle}>처리</th>
                        <th style={thStyle}>대원번호</th>
                        <th style={thStyle}>대원명</th>
                        <th style={thStyle}>학년</th>
                        <th style={thStyle}>입단일</th>
                        <th style={thStyle}>상태</th>
                        <th style={thStyle}>현재급위</th>
                        <th style={thStyle}>진급정보</th>
                        <th style={thStyle}>기능장</th>
                        <th style={thStyle}>초급 면제</th>
                        <th style={thStyle}>확인 내용</th>
                      </tr>
                    </thead>
                    <tbody>
                      {excelPreviewRows.map((row) => (
                        <tr key={`${row.rowNumber}-${row.member_no}-${row.name}`}>
                          <td style={tdStyle}>{row.rowNumber}</td>
                          <td style={tdStyle}>{row.sectionLabel}</td>
                          <td style={tdStyle}>
                            <span style={row.errors.length > 0 ? errorBadgeStyle : importActionBadgeStyle(row.action)}>
                              {row.errors.length > 0
                                ? "오류"
                                : row.action === "update"
                                  ? "수정"
                                  : "신규"}
                            </span>
                          </td>
                          <td style={tdStyle}>{row.member_no || "자동 발번"}</td>
                          <td style={strongTdStyle}>{row.name || "-"}</td>
                          <td style={tdStyle}>{row.grade || "-"}</td>
                          <td style={tdStyle}>{row.joined_at || "-"}</td>
                          <td style={tdStyle}>{getStatusLabel(row.status)}</td>
                          <td style={tdStyle}>{row.current_rank_name || "-"}</td>
                          <td style={tdStyle}>{row.rank_items.length > 0 ? `${row.rank_items.length}건` : "-"}</td>
                          <td style={tdStyle}>{row.badge_items.length > 0 ? `${row.badge_items.length}건` : "-"}</td>
                          <td style={tdStyle}>{row.beginner_course_exempted ? "면제" : "-"}</td>
                          <td style={row.errors.length > 0 ? errorTdStyle : tdStyle}>
                            {row.errors.length > 0 ? row.errors.join(" / ") : "저장 가능"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={formActionStyle}>
                  <button
                    type="button"
                    style={secondaryButtonStyle}
                    onClick={handleClearExcelPreview}
                    disabled={excelSubmitting}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    style={submitButtonStyle}
                    onClick={handleSaveExcelRows}
                    disabled={excelSubmitting || excelImportSummary.error > 0}
                  >
                    {excelSubmitting ? "저장 중..." : "엑셀 내용 저장"}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        <div style={listSearchPanelStyle}>
          <label style={searchFieldLabelStyle}>
            검색 조건
            <input
              style={searchInputStyle}
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="대원번호, 이름, 학년, 급위 검색"
            />
          </label>

          <label style={filterFieldLabelStyle}>
            구분
            <select
              style={filterSelectStyle}
              value={sectionFilter}
              onChange={(event) => setSectionFilter(event.target.value as ScoutSectionFilter)}
            >
              <option value="all">전체</option>
              <option value="cub">컵스카우트</option>
              <option value="scout">스카우트</option>
              <option value="venture">벤처스카우트</option>
              <option value="unspecified">구분 미지정</option>
            </select>
          </label>

          <label style={filterFieldLabelStyle}>
            상태
            <select
              style={filterSelectStyle}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as ScoutStatusFilter)}
            >
              <option value="all">전체</option>
              {SCOUT_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div style={searchResultInfoStyle}>
            현재 {filteredScouts.length}명이 표시됩니다.
          </div>

          {(keyword.trim().length > 0 || sectionFilter !== "all" || statusFilter !== "all") && (
            <button
              type="button"
              style={secondaryButtonStyle}
              onClick={() => {
                setKeyword("");
                setSectionFilter("all");
                setStatusFilter("all");
              }}
            >
              조건 초기화
            </button>
          )}
        </div>

        {isCreateFormOpen &&
          canManageScouts &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              style={modalOverlayStyle}
              role="presentation"
              onClick={handleCloseCreateForm}
            >
              <form
                style={modalPanelStyle}
                onSubmit={handleCreateScout}
                onClick={(event) => event.stopPropagation()}
              >
                <div style={modalHeaderStyle}>
                  <div>
                    <h3 style={formTitleStyle}>대원 등록</h3>
                    <p style={formDescriptionStyle}>
                      신규 대원의 기본정보를 입력합니다. 대원번호는 저장 시 자동 발번됩니다.
                    </p>
                  </div>

                  <button
                    type="button"
                    style={modalCloseButtonStyle}
                    onClick={handleCloseCreateForm}
                    disabled={submitting}
                    aria-label="대원 등록 닫기"
                  >
                    ×
                  </button>
                </div>

                {formErrorMessage && (
                  <div style={errorBoxStyle}>{formErrorMessage}</div>
                )}

                <div style={createModalGridStyle}>
                  <label style={fieldLabelStyle}>
                    <span style={fieldLabelTextStyle}>대원명 <span style={requiredStyle}>*</span></span>
                    <input
                      style={inputStyle}
                      value={createForm.name}
                      onChange={(event) => updateCreateForm("name", event.target.value)}
                      placeholder="예: 홍길동"
                      required
                    />
                  </label>

                  <label style={fieldLabelStyle}>
                    학년
                    <select
                      style={inputStyle}
                      value={createForm.grade}
                      onChange={(event) => handleCreateGradeChange(event.target.value)}
                    >
                      <option value="">학년 선택</option>
                      <optgroup label="초등학교">
                        {ELEMENTARY_GRADE_OPTIONS.map((gradeOption) => (
                          <option key={gradeOption} value={gradeOption}>
                            {gradeOption}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="중학교">
                        {MIDDLE_SCHOOL_GRADE_OPTIONS.map((gradeOption) => (
                          <option key={gradeOption} value={gradeOption}>
                            {gradeOption}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="고등학교">
                        {HIGH_SCHOOL_GRADE_OPTIONS.map((gradeOption) => (
                          <option key={gradeOption} value={gradeOption}>
                            {gradeOption}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </label>

                  <label style={fieldLabelStyle}>
                    <span style={fieldLabelTextStyle}>입단일 <span style={requiredStyle}>*</span></span>
                    <input
                      style={inputStyle}
                      type="date"
                      min={DATE_INPUT_MIN}
                      max={DATE_INPUT_MAX}
                      value={createForm.joined_at}
                      onInput={limitDateInputYear}
                      onChange={(event) =>
                        updateCreateForm("joined_at", normalizeDateInputValue(event.target.value))
                      }
                      required
                    />
                  </label>

                  {isSuperAdmin ? (
                    <label style={fieldLabelStyle}>
                      <span style={fieldLabelTextStyle}>소속대 <span style={requiredStyle}>*</span></span>
                      <select
                        style={inputStyle}
                        value={createForm.organization_id}
                        onChange={(event) =>
                          updateCreateForm("organization_id", event.target.value)
                        }
                        required
                      >
                        <option value="">소속대 선택</option>
                        {organizations.map((organization) => (
                          <option key={organization.id} value={organization.id}>
                            {organization.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label style={fieldLabelStyle}>
                      소속대
                      <input
                        style={readOnlyInputStyle}
                        value={getCreateFormOrganizationName()}
                        readOnly
                      />
                    </label>
                  )}

                  <label style={fieldLabelStyle}>
                    대원번호
                    <input
                      style={readOnlyInputStyle}
                      value="저장 시 자동 발번"
                      readOnly
                    />
                  </label>

                  <label style={fieldLabelStyle}>
                    현재급위
                    <select
                      style={inputStyle}
                      value={createForm.current_rank_id}
                      onChange={(event) => updateCreateCurrentRankId(event.target.value)}
                    >
                      <option value="">현재급위 선택</option>
                      {ranks.map((rank) => (
                        <option key={rank.id} value={rank.id}>
                          {rank.rank_name}
                        </option>
                      ))}
                    </select>
                  </label>

                  {createForm.current_rank_id && (
                    <div style={rankHistoryInputPanelStyle}>
                      <div style={rankHistoryInputHeaderStyle}>
                        <strong>진급 이력 입력</strong>
                        <span>{getRankChainNotice(createForm.current_rank_id)}</span>
                      </div>
                      <div style={rankHistoryInputGridStyle}>
                        {getRankApprovalDateInputItems(
                          createForm.current_rank_id,
                          createForm.rank_approval_dates,
                        ).map(({ rank, approvedAt }) => (
                          <label key={rank.id} style={fieldLabelStyle}>
                            <span style={fieldLabelTextStyle}>
                              {rank.rank_name} 인가일 <span style={requiredStyle}>*</span>
                            </span>
                            <input
                              style={inputStyle}
                              type="date"
                              min={DATE_INPUT_MIN}
                              max={DATE_INPUT_MAX}
                              value={approvedAt}
                              onInput={limitDateInputYear}
                              onChange={(event) =>
                                updateCreateRankApprovalDate(
                                  rank.id,
                                  normalizeDateInputValue(event.target.value),
                                )
                              }
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {getCreateFormCubRankNotice() && (
                  <div style={autoRankNoticeStyle}>{getCreateFormCubRankNotice()}</div>
                )}

                <div style={checkboxPanelStyle}>
                  <div style={checkboxSectionStyle}>
                    <div style={checkboxSectionTitleStyle}>컵스카우트 이력</div>
                    <div style={checkboxRowStyle}>
                      <label style={checkboxLabelStyle}>
                        <input
                          type="checkbox"
                          checked={createForm.is_from_cub_scout}
                          onChange={(event) =>
                            updateCreateBooleanForm("is_from_cub_scout", event.target.checked)
                          }
                        />
                        컵스카우트 출신
                      </label>

                      <label style={checkboxLabelStyle}>
                        <input
                          type="checkbox"
                          checked={createForm.cub_promotion_completed}
                          onChange={(event) =>
                            updateCreateBooleanForm(
                              "cub_promotion_completed",
                              event.target.checked,
                            )
                          }
                        />
                        컵스카우트 승진과정 이수
                      </label>
                    </div>
                  </div>

                  <div style={checkboxSectionStyle}>
                    <div style={checkboxSectionTitleStyle}>스카우트 전환</div>
                    <label style={checkboxLabelStyle}>
                      <input
                        type="checkbox"
                        checked={createForm.beginner_course_exempted}
                        onChange={(event) =>
                          updateCreateBooleanForm(
                            "beginner_course_exempted",
                            event.target.checked,
                          )
                        }
                      />
                      초급과정 면제
                    </label>
                  </div>
                </div>

                <div style={helpTextBoxStyle}>
                  <div>초등학교 대원은 학년에 따라 컵스카우트 급위가 자동 표시됩니다.</div>
                  <div>스카우트 이상 대원은 현재급위와 인가일을 함께 입력하면 진급 이력에 바로 반영됩니다.</div>
                  <div>현재급위 인가일은 예상 진급일과 진급 판정 기준일 계산에 사용됩니다.</div>
                </div>

                <label style={fieldLabelStyle}>
                  비고
                  <textarea
                    style={textareaStyle}
                    value={createForm.note}
                    onChange={(event) => updateCreateForm("note", event.target.value)}
                    placeholder="특이사항이 있으면 입력하세요."
                  />
                </label>

                <div style={modalActionStyle}>
                  <button
                    type="button"
                    style={secondaryButtonStyle}
                    onClick={handleCloseCreateForm}
                    disabled={submitting}
                  >
                    취소
                  </button>

                  <button
                    type="submit"
                    style={submitButtonStyle}
                    disabled={submitting}
                  >
                    {submitting ? "등록 중..." : "등록 저장"}
                  </button>
                </div>
              </form>
            </div>,
            document.body,
          )}

        {isEditFormOpen &&
          canManageScouts &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              style={modalOverlayStyle}
              role="presentation"
              onClick={handleCloseEditForm}
            >
            <form
              style={modalPanelStyle}
              onSubmit={handleUpdateScout}
              onClick={(event) => event.stopPropagation()}
            >
              <div style={modalHeaderStyle}>
                <div>
                  <h3 style={formTitleStyle}>대원 기본정보 수정</h3>
                  <p style={formDescriptionStyle}>
                    선택한 대원의 기본정보를 수정합니다. 저장 또는 닫기 후 원래 목록 위치에서 계속 확인할 수 있습니다.
                  </p>
                </div>

                <button
                  type="button"
                  style={modalCloseButtonStyle}
                  onClick={handleCloseEditForm}
                  disabled={editSubmitting}
                  aria-label="수정창 닫기"
                >
                  ×
                </button>
              </div>

              {editErrorMessage && (
                <div style={errorBoxStyle}>{editErrorMessage}</div>
              )}

              <div style={formGridStyle}>
                <label style={fieldLabelStyle}>
                  대원번호
                  <input
                    style={readOnlyInputStyle}
                    value={editForm.member_no}
                    readOnly
                  />
                </label>

                <label style={fieldLabelStyle}>
                  소속대
                  <input
                    style={readOnlyInputStyle}
                    value={editForm.school_name}
                    readOnly
                  />
                </label>

                <label style={fieldLabelStyle}>
                  입단일
                  <input
                    style={readOnlyInputStyle}
                    value={formatDate(editForm.joined_at)}
                    readOnly
                  />
                </label>

                <label style={fieldLabelStyle}>
                  <span style={fieldLabelTextStyle}>대원명 <span style={requiredStyle}>*</span></span>
                  <input
                    style={inputStyle}
                    value={editForm.name}
                    onChange={(event) => updateEditForm("name", event.target.value)}
                    required
                  />
                </label>

                <label style={fieldLabelStyle}>
                  학년
                  <select
                    style={inputStyle}
                    value={editForm.grade}
                    onChange={(event) => handleEditGradeChange(event.target.value)}
                  >
                    <option value="">학년 선택</option>
                    <optgroup label="초등학교">
                      {ELEMENTARY_GRADE_OPTIONS.map((gradeOption) => (
                        <option key={gradeOption} value={gradeOption}>
                          {gradeOption}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="중학교">
                      {MIDDLE_SCHOOL_GRADE_OPTIONS.map((gradeOption) => (
                        <option key={gradeOption} value={gradeOption}>
                          {gradeOption}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="고등학교">
                      {HIGH_SCHOOL_GRADE_OPTIONS.map((gradeOption) => (
                        <option key={gradeOption} value={gradeOption}>
                          {gradeOption}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </label>

                <label style={fieldLabelStyle}>
                  현재급위
                  <select
                    style={inputStyle}
                    value={editForm.current_rank_id}
                    onChange={(event) => updateEditCurrentRankId(event.target.value)}
                  >
                    <option value="">현재급위 선택</option>
                    {ranks.map((rank) => (
                      <option key={rank.id} value={rank.id}>
                        {rank.rank_name}
                      </option>
                    ))}
                  </select>
                </label>

                {editForm.current_rank_id && (
                  <div style={rankHistoryInputPanelStyle}>
                    <div style={rankHistoryInputHeaderStyle}>
                      <strong>진급 이력 입력</strong>
                      <span>{getRankChainNotice(editForm.current_rank_id)}</span>
                    </div>
                    <div style={rankHistoryInputGridStyle}>
                      {getRankApprovalDateInputItems(
                        editForm.current_rank_id,
                        editForm.rank_approval_dates,
                      ).map(({ rank, approvedAt }) => (
                        <label key={rank.id} style={fieldLabelStyle}>
                          <span style={fieldLabelTextStyle}>
                            {rank.rank_name} 인가일 <span style={requiredStyle}>*</span>
                          </span>
                          <input
                            style={inputStyle}
                            type="date"
                            min={DATE_INPUT_MIN}
                            max={DATE_INPUT_MAX}
                            value={approvedAt}
                            onInput={limitDateInputYear}
                            onChange={(event) =>
                              updateEditRankApprovalDate(
                                rank.id,
                                normalizeDateInputValue(event.target.value),
                              )
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {getEditFormCubRankNotice() && (
                  <div style={autoRankNoticeStyle}>{getEditFormCubRankNotice()}</div>
                )}
              </div>

              <div style={checkboxPanelStyle}>
                <div style={checkboxSectionStyle}>
                  <div style={checkboxSectionTitleStyle}>컵스카우트 이력</div>
                  <div style={checkboxRowStyle}>
                    <label style={checkboxLabelStyle}>
                      <input
                        type="checkbox"
                        checked={editForm.is_from_cub_scout}
                        onChange={(event) =>
                          updateEditBooleanForm("is_from_cub_scout", event.target.checked)
                        }
                      />
                      컵스카우트 출신
                    </label>

                    <label style={checkboxLabelStyle}>
                      <input
                        type="checkbox"
                        checked={editForm.cub_promotion_completed}
                        onChange={(event) =>
                          updateEditBooleanForm(
                            "cub_promotion_completed",
                            event.target.checked,
                          )
                        }
                      />
                      컵스카우트 승진과정 이수
                    </label>
                  </div>
                </div>

                <div style={checkboxSectionStyle}>
                  <div style={checkboxSectionTitleStyle}>스카우트 전환</div>
                  <label style={checkboxLabelStyle}>
                    <input
                      type="checkbox"
                      checked={editForm.beginner_course_exempted}
                      onChange={(event) =>
                        updateEditBooleanForm(
                          "beginner_course_exempted",
                          event.target.checked,
                        )
                      }
                    />
                    초급과정 면제
                  </label>
                </div>
              </div>

              <div style={helpTextBoxStyle}>
                <div>초등학교 대원은 학년에 따라 컵스카우트 급위가 자동 표시됩니다.</div>
                <div>스카우트 이상 대원은 현재급위와 인가일을 함께 저장하면 진급 이력에 반영됩니다.</div>
                <div>현재급위 인가일이 없으면 예상 진급일과 진급 판정 기준을 계산할 수 없습니다.</div>
              </div>

              <label style={fieldLabelStyle}>
                비고
                <textarea
                  style={textareaStyle}
                  value={editForm.note}
                  onChange={(event) => updateEditForm("note", event.target.value)}
                  placeholder="특이사항이 있으면 입력하세요."
                />
              </label>

              <div style={modalActionStyle}>
                <button
                  type="button"
                  style={secondaryButtonStyle}
                  onClick={handleCloseEditForm}
                  disabled={editSubmitting}
                >
                  취소
                </button>

                <button
                  type="submit"
                  style={submitButtonStyle}
                  disabled={editSubmitting}
                >
                  {editSubmitting ? "수정 중..." : "수정 저장"}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}

        {integratedScout &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              style={modalOverlayStyle}
              role="presentation"
              onClick={handleCloseIntegratedManagement}
            >
              <section
                style={integratedModalPanelStyle}
                onClick={(event) => event.stopPropagation()}
              >
                <div style={modalHeaderStyle}>
                  <div>
                    <h3 style={formTitleStyle}>
                      대원 통합관리 · {integratedScout.name}
                    </h3>
                    <p style={formDescriptionStyle}>
                      기본정보, 현재급위, 기능장, 프로그램 이수, 출석률을 한 화면에서 확인하고 관리합니다.
                    </p>
                  </div>

                  <button
                    type="button"
                    style={modalCloseButtonStyle}
                    onClick={handleCloseIntegratedManagement}
                    disabled={integratedSubmitting}
                    aria-label="대원 통합관리 닫기"
                  >
                    ×
                  </button>
                </div>

                <div style={integratedSummaryGridStyle}>
                  <div style={integratedSummaryCardStyle}>
                    <span style={integratedSummaryLabelStyle}>대원번호</span>
                    <strong style={integratedSummaryValueStyle}>
                      {integratedScout.member_no ?? "-"}
                    </strong>
                  </div>
                  <div style={integratedSummaryCardStyle}>
                    <span style={integratedSummaryLabelStyle}>학년 / 구분</span>
                    <strong style={integratedSummaryValueStyle}>
                      {integratedScout.grade ?? "-"} · {getScoutSectionLabelByGrade(integratedScout.grade)}
                    </strong>
                  </div>
                  <div style={integratedSummaryCardStyle}>
                    <span style={integratedSummaryLabelStyle}>현재급위</span>
                    <strong style={integratedSummaryValueStyle}>
                      {getScoutCurrentRankDisplay(integratedScout)}
                    </strong>
                  </div>
                  <div style={integratedSummaryCardStyle}>
                    <span style={integratedSummaryLabelStyle}>전체 출석률</span>
                    <strong style={integratedSummaryValueStyle}>
                      {integratedAttendanceStats
                        ? `${integratedAttendanceStats.attendanceRate.toFixed(1)}%`
                        : "-"}
                    </strong>
                    <small style={integratedSummaryHelpStyle}>
                      {integratedAttendanceStats
                        ? `출석 ${integratedAttendanceStats.presentCount}회 / 입력완료 ${integratedAttendanceStats.enteredCount}회`
                        : "출석 자료 없음"}
                    </small>
                  </div>
                </div>

                <div style={integratedTabListStyle}>
                  {INTEGRATED_SECTION_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      style={
                        integratedSection === option.value
                          ? integratedTabActiveStyle
                          : integratedTabButtonStyle
                      }
                      onClick={() => {
                        setIntegratedSection(option.value);
                        setIntegratedErrorMessage("");
                        setIntegratedSuccessMessage("");
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {integratedErrorMessage && (
                  <div style={errorBoxStyle}>{integratedErrorMessage}</div>
                )}

                <FeedbackToast message={integratedSuccessMessage} tone="success" onClose={() => setIntegratedSuccessMessage("")} />

                {integratedSection === "profile" && (
                  <div style={integratedSectionStyle}>
                    <div style={integratedInfoGridStyle}>
                      <div style={integratedInfoItemStyle}>
                        <span>대원명</span>
                        <strong>{integratedScout.name}</strong>
                      </div>
                      <div style={integratedInfoItemStyle}>
                        <span>소속대</span>
                        <strong>{integratedScout.school_name ?? getOrganizationName(integratedScout.organization_id)}</strong>
                      </div>
                      <div style={integratedInfoItemStyle}>
                        <span>입단일</span>
                        <strong>{formatDate(integratedScout.joined_at)}</strong>
                      </div>
                      <div style={integratedInfoItemStyle}>
                        <span>상태</span>
                        <strong>{getStatusLabel(integratedScout.status)}</strong>
                      </div>
                      <div style={integratedInfoItemStyle}>
                        <span>컵스카우트 출신</span>
                        <strong>{integratedScout.is_from_cub_scout ? "예" : "아니오"}</strong>
                      </div>
                      <div style={integratedInfoItemStyle}>
                        <span>초급과정 면제</span>
                        <strong>{integratedScout.beginner_course_exempted ? "면제" : "-"}</strong>
                      </div>
                    </div>

                    <div style={helpTextBoxStyle}>
                      <div>대원 기본정보는 진급, 기능장, 프로그램, 출석 기록의 기준 정보입니다.</div>
                      <div>현재급위 인가일이 없으면 예상 진급일과 진급 판정 기준일을 계산할 수 없습니다.</div>
                    </div>

                    {canManageScouts && (
                      <div style={formActionStyle}>
                        <button
                          type="button"
                          style={secondaryButtonStyle}
                          onClick={() => {
                            handleCloseIntegratedManagement();
                            handleOpenEditForm(integratedScout);
                          }}
                        >
                          기본정보 수정
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {integratedSection === "rank" && (
                  <div style={integratedSectionStyle}>
                    {integratedRankApprovalTimeline.length > 0 && (
                      <div style={rankProgressPanelStyle}>
                        <div style={rankProgressHeaderStyle}>
                          <div>
                            <strong>급위 진행 현황</strong>
                            <span>실제 진급 인가 기록을 기준으로 표시합니다.</span>
                          </div>
                          {integratedRankApprovalTimeline.some((item) => item.state === "missing_history") && (
                            <span style={rankProgressWarningBadgeStyle}>인가기록 확인 필요</span>
                          )}
                        </div>
                        <div style={rankProgressGridStyle}>
                          {integratedRankApprovalTimeline.map((item) => (
                            <div
                              key={`rank-progress-${item.rankId}`}
                              style={
                                item.state === "completed"
                                  ? rankProgressCompletedItemStyle
                                  : item.state === "current"
                                    ? rankProgressCurrentItemStyle
                                    : item.state === "next"
                                      ? rankProgressNextItemStyle
                                      : item.state === "missing_history"
                                        ? rankProgressMissingItemStyle
                                        : rankProgressPendingItemStyle
                              }
                            >
                              <strong>{item.rankName}</strong>
                              <span>
                                {item.state === "completed"
                                  ? "완료"
                                  : item.state === "current"
                                    ? "현재"
                                    : item.state === "next"
                                      ? "다음"
                                      : item.state === "missing_history"
                                        ? "인가기록 없음"
                                        : "미도달"}
                              </span>
                              {item.approvedAt && <small>{item.approvedAt}</small>}
                            </div>
                          ))}
                        </div>
                        {integratedRankApprovalTimeline.some((item) => item.state === "missing_history") && (
                          <div style={rankProgressWarningNoticeStyle}>
                            현재급위 이전 단계 중 인가 기록이 없는 급위가 있습니다. 실제 인가일을 확인하여 아래 진급 이력 입력란에 등록해 주세요.
                          </div>
                        )}
                      </div>
                    )}

                    {canManageScouts && (
                      <form style={integratedInlineFormStyle} onSubmit={handleSaveIntegratedRank}>
                        <label style={fieldLabelStyle}>
                          <span style={fieldLabelTextStyle}>
                            현재급위 <span style={requiredStyle}>*</span>
                          </span>
                          <select
                            style={inputStyle}
                            value={rankQuickForm.rank_id}
                            onChange={(event) =>
                              updateRankQuickCurrentRankId(event.target.value)
                            }
                          >
                            <option value="">현재급위 선택</option>
                            {ranks.map((rank) => (
                              <option key={rank.id} value={rank.id}>
                                {rank.rank_name}
                              </option>
                            ))}
                          </select>
                        </label>

                        {rankQuickForm.rank_id && (
                          <div style={rankHistoryInputPanelStyle}>
                            <div style={rankHistoryInputHeaderStyle}>
                              <strong>진급 이력 입력</strong>
                              <span>{getRankChainNotice(rankQuickForm.rank_id)}</span>
                            </div>
                            <div style={rankHistoryInputGridStyle}>
                              {getRankApprovalDateInputItems(
                                rankQuickForm.rank_id,
                                rankQuickForm.rank_approval_dates,
                              ).map(({ rank, approvedAt }) => (
                                <label key={rank.id} style={fieldLabelStyle}>
                                  <span style={fieldLabelTextStyle}>
                                    {rank.rank_name} 인가일 <span style={requiredStyle}>*</span>
                                  </span>
                                  <input
                                    style={inputStyle}
                                    type="date"
                                    min={DATE_INPUT_MIN}
                                    max={DATE_INPUT_MAX}
                                    value={approvedAt}
                                    onInput={limitDateInputYear}
                                    onChange={(event) =>
                                      updateRankQuickApprovalDate(
                                        rank.id,
                                        normalizeDateInputValue(event.target.value),
                                      )
                                    }
                                  />
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                        <label style={fieldLabelStyle}>
                          비고
                          <input
                            style={inputStyle}
                            value={rankQuickForm.note}
                            onChange={(event) =>
                              updateRankQuickForm("note", event.target.value)
                            }
                            placeholder="예: 기존 기록 입력, 정정 등"
                          />
                        </label>

                        <div style={integratedFormButtonCellStyle}>
                          <button
                            type="submit"
                            style={submitButtonStyle}
                            disabled={integratedSubmitting}
                          >
                            {integratedSubmitting ? "저장 중..." : "진급 이력 저장"}
                          </button>
                        </div>
                      </form>
                    )}

                    <div style={subsectionHeaderStyle}>
                      <h4 style={subsectionTitleStyle}>진급 이력</h4>
                      <span style={subsectionCountStyle}>
                        {integratedScoutRankHistories.length}건
                      </span>
                    </div>

                    {integratedScoutRankHistories.length === 0 ? (
                      <EmptyState title="진급 이력이 없습니다" description="현재급위와 급위별 인가일을 확인하세요." />
                    ) : (
                      <div style={compactTableWrapStyle}>
                        <table style={tableStyle}>
                          <thead>
                            <tr>
                              <th style={thStyle}>급위</th>
                              <th style={thStyle}>인가일</th>
                              <th style={thStyle}>구분</th>
                              <th style={thStyle}>비고</th>
                            </tr>
                          </thead>
                          <tbody>
                            {integratedScoutRankHistories.map((history) => (
                              <tr key={history.id}>
                                <td style={strongTdStyle}>
                                  {rankNameMap.get(history.rank_id) ?? "-"}
                                </td>
                                <td style={tdStyle}>{formatDate(history.approved_at)}</td>
                                <td style={tdStyle}>{history.approval_type || "일반"}</td>
                                <td style={tdStyle}>{history.note ?? "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {integratedSection === "badges" && (
                  <div style={integratedSectionStyle}>
                    {integratedBadgeGuide && (
                      <div style={badgeGuidePanelStyle}>
                        <div style={badgeGuideHeaderStyle}>
                          <strong>현재급위 기준 기능장 확인</strong>
                          <span>현재급위 {integratedBadgeGuide.currentRankName}</span>
                        </div>
                        <p style={badgeGuideDescriptionStyle}>
                          현재급위가 {integratedBadgeGuide.currentRankName}이면 현재급위까지의 진급 단계에 맞는 기능장 취득기록이 등록되어 있어야 합니다.
                          아래 목록에서 필수기능장과 일반기능장 필요 수를 함께 확인한 뒤 기능장을 등록하세요.
                        </p>

                        <div style={badgeGuideGeneralSummaryStyle}>
                          <div style={badgeGuideSummaryGroupStyle}>
                            <strong style={badgeGuideSummaryGroupTitleStyle}>필수기능장</strong>
                            <span>
                              필요 {integratedBadgeGuide.currentRequiredBadgeCount}개 · 등록 {integratedBadgeGuide.currentRequiredBadgeAcquiredCount}개
                            </span>
                            <span
                              style={
                                integratedBadgeGuide.currentRequiredBadgeMissingCount > 0
                                  ? badgeGuideGeneralSummaryMissingStyle
                                  : badgeGuideGeneralSummaryCompleteStyle
                              }
                            >
                              {integratedBadgeGuide.currentRequiredBadgeMissingCount > 0
                                ? `필수기능장 부족 ${integratedBadgeGuide.currentRequiredBadgeMissingCount}개`
                                : "필수기능장 충족"}
                            </span>
                          </div>

                          <div style={badgeGuideSummaryDividerStyle} />

                          <div style={badgeGuideSummaryGroupStyle}>
                            <strong style={badgeGuideSummaryGroupTitleStyle}>일반기능장</strong>
                            <span>
                              필요 {integratedBadgeGuide.currentGeneralRequiredCount}개 · 등록 {integratedBadgeGuide.generalBadgeCount}개
                            </span>
                            <span
                              style={
                                integratedBadgeGuide.currentGeneralMissingCount > 0
                                  ? badgeGuideGeneralSummaryMissingStyle
                                  : badgeGuideGeneralSummaryCompleteStyle
                              }
                            >
                              {integratedBadgeGuide.currentGeneralMissingCount > 0
                                ? `일반기능장 부족 ${integratedBadgeGuide.currentGeneralMissingCount}개`
                                : "일반기능장 충족"}
                            </span>
                          </div>
                        </div>

                        {integratedBadgeGuide.currentGroups.length > 0 ? (
                          <div style={badgeGuideGridStyle}>
                            {integratedBadgeGuide.currentGroups.map((group) => (
                              <div key={group.targetRankKey} style={badgeGuideGroupStyle}>
                                <div style={badgeGuideGroupHeaderStyle}>
                                  <strong>{group.label}</strong>
                                  <span
                                    style={
                                      group.totalMissingCount > 0
                                        ? badgeGuideMissingCountStyle
                                        : badgeGuideCompleteCountStyle
                                    }
                                  >
                                    {group.totalMissingCount > 0
                                      ? `누락 ${group.totalMissingCount}개`
                                      : "완료"}
                                  </span>
                                </div>
                                <div style={badgeGuideBadgeListStyle}>
                                  {group.badgeItems.map((item) => (
                                    <span
                                      key={item.name}
                                      style={
                                        item.acquired
                                          ? badgeGuideBadgeCompleteStyle
                                          : badgeGuideBadgeMissingStyle
                                      }
                                    >
                                      {item.acquired ? "✓" : "!"} {item.name}
                                    </span>
                                  ))}
                                </div>
                                <div style={badgeGuideGeneralRequirementStyle}>
                                  <strong>일반기능장</strong>
                                  {group.generalMissingCount > 0 ? (
                                    <span style={badgeGuideGeneralRequirementMissingStyle}>
                                      필요 {group.generalRequiredCount}개 · 등록 반영 {group.generalRegisteredCount ?? 0}개 · 부족 {group.generalMissingCount}개
                                    </span>
                                  ) : (
                                    <span style={badgeGuideGeneralRequirementCompleteStyle}>
                                      필요 {group.generalRequiredCount}개 · 등록 반영 {group.generalRegisteredCount ?? 0}개 · 충족
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={badgeGuideEmptyStyle}>
                            현재급위까지 별도로 확인할 필수 기능장 기준이 없습니다.
                          </div>
                        )}

                        {integratedBadgeGuide.nextGroup && (
                          <div style={badgeGuideNextBoxStyle}>
                            <strong>다음 진급 준비 기능장</strong>
                            <span>
                              필수기능장 · {integratedBadgeGuide.nextGroup.label}: {integratedBadgeGuide.nextGroup.badgeNames.join(", ")}
                            </span>
                            <span>
                              일반기능장 · 필요 {integratedBadgeGuide.nextGroup.generalRequiredCount}개 · 현재 등록 여유 {integratedBadgeGuide.nextGroup.availableGeneralBadgeCount}개 · 부족 {integratedBadgeGuide.nextGroup.generalMissingCount}개
                            </span>
                          </div>
                        )}

                        <div style={badgeGuideFootnoteStyle}>
                          일반기능장 수는 현재 등록된 일반기능장을 이전 진급 단계부터 순서대로 배분해 표시합니다.
                          취득 시기와 실제 사용 이력의 인정 여부는 진급관리 판정에서 최종 확인합니다.
                        </div>
                      </div>
                    )}

                    {integratedRankApprovalTimeline.length > 0 && (
                      <div style={badgeRankDatePanelStyle}>
                        <div style={badgeRankDateHeaderStyle}>
                          <strong>급위별 진급 인가일</strong>
                          <span>
                            기능장 취득일과 인가일 입력 시 해당 급위의 진급 인가일을 확인하세요.
                          </span>
                        </div>
                        <div style={badgeRankDateGridStyle}>
                          {integratedRankApprovalTimeline.map((item) => (
                            <div key={item.rankId} style={badgeRankDateItemStyle}>
                              <span style={badgeRankDateLabelStyle}>{item.rankName}</span>
                              <strong
                                style={
                                  item.approvedAt
                                    ? badgeRankDateValueStyle
                                    : badgeRankDateMissingValueStyle
                                }
                              >
                                {item.approvedAt || "미등록"}
                              </strong>
                            </div>
                          ))}
                        </div>
                        <div style={badgeRankDateNoticeStyle}>
                          필수기능장의 취득 인가일은 해당 급위 진급 인가일 이전인지 확인한 후 등록하세요.
                        </div>
                      </div>
                    )}

                    {canManageScouts && (
                      <form style={badgeEntryFormStyle} onSubmit={handleCreateIntegratedBadge}>
                        <label style={fieldLabelStyle}>
                          <span style={badgeSelectHeaderStyle}>
                            <span style={fieldLabelTextStyle}>
                              기능장 <span style={requiredStyle}>*</span>
                            </span>
                            <select
                              style={badgeSortSelectStyle}
                              value={generalBadgeSortDirection}
                              onChange={(event) =>
                                setGeneralBadgeSortDirection(
                                  event.target.value as GeneralBadgeSortDirection,
                                )
                              }
                              aria-label="일반기능장 정렬"
                            >
                              <option value="asc">일반 가나다순</option>
                              <option value="desc">일반 역순</option>
                            </select>
                          </span>
                          <select
                            style={badgeEntryInputStyle}
                            value={badgeQuickForm.badge_id}
                            onChange={(event) =>
                              updateBadgeQuickForm("badge_id", event.target.value)
                            }
                          >
                            <option value="">기능장 선택</option>
                            {requiredBadgeOptionGroups.map((group) => (
                              <optgroup
                                key={group.label}
                                label={`필수 · ${group.label}`}
                              >
                                {group.badges.map((badge) => (
                                  <option key={badge.id} value={badge.id}>
                                    {badge.name}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                            {generalBadgeOptions.length > 0 && (
                              <optgroup
                                label={`일반기능장 · ${
                                  generalBadgeSortDirection === "asc"
                                    ? "가나다순"
                                    : "역순"
                                }`}
                              >
                                {generalBadgeOptions.map((badge) => (
                                  <option key={badge.id} value={badge.id}>
                                    {badge.name}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                        </label>

                        <label style={fieldLabelStyle}>
                          <span style={fieldLabelTextStyle}>
                            취득일 <span style={requiredStyle}>*</span>
                          </span>
                          <input
                            style={badgeEntryInputStyle}
                            type="date"
                            min={DATE_INPUT_MIN}
                            max={DATE_INPUT_MAX}
                            value={badgeQuickForm.acquired_at}
                            required
                            onInput={limitDateInputYear}
                            onChange={(event) =>
                              updateBadgeQuickForm(
                                "acquired_at",
                                normalizeDateInputValue(event.target.value),
                              )
                            }
                          />
                        </label>

                        <label style={fieldLabelStyle}>
                          <span style={fieldLabelTextStyle}>
                            인가일 <span style={requiredStyle}>*</span>
                          </span>
                          <input
                            style={badgeEntryInputStyle}
                            type="date"
                            min={DATE_INPUT_MIN}
                            max={DATE_INPUT_MAX}
                            value={badgeQuickForm.approved_at}
                            required
                            onInput={limitDateInputYear}
                            onChange={(event) =>
                              updateBadgeQuickForm(
                                "approved_at",
                                normalizeDateInputValue(event.target.value),
                              )
                            }
                          />
                        </label>

                        <label style={fieldLabelStyle}>
                          <span style={badgeLeaderFieldHeaderStyle}>
                            <span>지도자/비고</span>
                            <span style={badgeCompactCheckboxLabelStyle}>
                              <input
                                type="checkbox"
                                checked={badgeQuickForm.leader_confirmed}
                                onChange={(event) =>
                                  updateBadgeQuickForm("leader_confirmed", event.target.checked)
                                }
                              />
                              지도자 확인
                            </span>
                          </span>
                          <input
                            style={badgeEntryInputStyle}
                            value={badgeQuickForm.instructor_name}
                            onChange={(event) =>
                              updateBadgeQuickForm("instructor_name", event.target.value)
                            }
                            placeholder="지도자명 또는 비고"
                          />
                        </label>

                        <div style={badgeEntryButtonCellStyle}>
                          <button
                            type="submit"
                            style={submitButtonStyle}
                            disabled={integratedSubmitting}
                          >
                            {integratedSubmitting ? "등록 중..." : "기능장 등록"}
                          </button>
                        </div>

                        <div style={badgeEntryHelpStyle}>
                          취득일과 인가일은 모두 필수입니다. 필수기능장은 진급 단계별로, 일반기능장은 선택한 정렬 순서로 표시됩니다.
                        </div>
                      </form>
                    )}

                    <div style={subsectionHeaderStyle}>
                      <h4 style={subsectionTitleStyle}>기능장 취득현황</h4>
                      <span style={subsectionCountStyle}>
                        {integratedScoutBadges.length}건
                      </span>
                    </div>

                    {integratedScoutBadges.length === 0 ? (
                      <EmptyState title="기능장 기록이 없습니다" description="기능장 탭에서 취득 기록을 등록하세요." />
                    ) : (
                      <div style={compactTableWrapStyle}>
                        <table style={tableStyle}>
                          <thead>
                            <tr>
                              <th style={thStyle}>기능장</th>
                              <th style={thStyle}>취득일</th>
                              <th style={thStyle}>인가일</th>
                              <th style={thStyle}>지도자 확인</th>
                              <th style={thStyle}>비고</th>
                            </tr>
                          </thead>
                          <tbody>
                            {integratedScoutBadges.map((record) => (
                              <tr key={record.id}>
                                <td style={strongTdStyle}>
                                  {badgeNameMap.get(record.badge_id) ?? "-"}
                                </td>
                                <td style={tdStyle}>{formatDate(record.acquired_at)}</td>
                                <td style={tdStyle}>{formatDate(record.approved_at)}</td>
                                <td style={tdStyle}>
                                  {record.leader_confirmed ? "확인" : "-"}
                                </td>
                                <td style={tdStyle}>{record.note ?? "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {integratedSection === "programs" && (
                  <div style={integratedSectionStyle}>
                    {canManageScouts && (
                      <form style={integratedInlineFormStyle} onSubmit={handleCreateIntegratedProgram}>
                        <label style={programSelectFieldStyle}>
                          <span style={fieldLabelTextStyle}>
                            프로그램 <span style={requiredStyle}>*</span>
                          </span>
                          <select
                            style={programSelectStyle}
                            value={programQuickForm.program_type}
                            onChange={(event) =>
                              updateProgramQuickForm(
                                "program_type",
                                event.target.value as ProgramType,
                              )
                            }
                          >
                            {PROGRAM_TYPE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label} · {option.description}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label style={fieldLabelStyle}>
                          <span style={fieldLabelTextStyle}>
                            이수일 <span style={requiredStyle}>*</span>
                          </span>
                          <input
                            style={inputStyle}
                            type="date"
                            min={DATE_INPUT_MIN}
                            max={DATE_INPUT_MAX}
                            value={programQuickForm.completed_at}
                            onInput={limitDateInputYear}
                            onChange={(event) =>
                              updateProgramQuickForm(
                                "completed_at",
                                normalizeDateInputValue(event.target.value),
                              )
                            }
                          />
                        </label>

                        <label style={fieldLabelStyle}>
                          수료증번호
                          <input
                            style={inputStyle}
                            value={programQuickForm.certificate_no}
                            onChange={(event) =>
                              updateProgramQuickForm("certificate_no", event.target.value)
                            }
                            placeholder="수료증번호"
                          />
                        </label>

                        <label style={fieldLabelStyle}>
                          승인일
                          <input
                            style={inputStyle}
                            type="date"
                            min={DATE_INPUT_MIN}
                            max={DATE_INPUT_MAX}
                            value={programQuickForm.approved_at}
                            onInput={limitDateInputYear}
                            onChange={(event) =>
                              updateProgramQuickForm(
                                "approved_at",
                                normalizeDateInputValue(event.target.value),
                              )
                            }
                          />
                        </label>

                        <div style={integratedFormButtonCellStyle}>
                          <button
                            type="submit"
                            style={submitButtonStyle}
                            disabled={integratedSubmitting}
                          >
                            {integratedSubmitting ? "등록 중..." : "프로그램 등록"}
                          </button>
                        </div>
                      </form>
                    )}

                    <div style={subsectionHeaderStyle}>
                      <h4 style={subsectionTitleStyle}>프로그램 이수현황</h4>
                      <span style={subsectionCountStyle}>
                        {integratedScoutPrograms.length}건
                      </span>
                    </div>

                    {integratedScoutPrograms.length === 0 ? (
                      <EmptyState title="프로그램 이수 기록이 없습니다" description="WSEP 또는 MoP 이수 기록을 등록하세요." />
                    ) : (
                      <div style={compactTableWrapStyle}>
                        <table style={tableStyle}>
                          <thead>
                            <tr>
                              <th style={thStyle}>프로그램</th>
                              <th style={thStyle}>이수일</th>
                              <th style={thStyle}>수료증번호</th>
                              <th style={thStyle}>승인일</th>
                              <th style={thStyle}>비고</th>
                            </tr>
                          </thead>
                          <tbody>
                            {integratedScoutPrograms.map((completion) => (
                              <tr key={completion.id}>
                                <td style={strongTdStyle}>
                                  {getProgramTypeLabel(completion.program_type)}
                                  <div style={mutedCellTextStyle}>
                                    {getProgramTypeDescription(completion.program_type)}
                                  </div>
                                </td>
                                <td style={tdStyle}>{formatDate(completion.completed_at)}</td>
                                <td style={tdStyle}>{completion.certificate_no ?? "-"}</td>
                                <td style={tdStyle}>{formatDate(completion.approved_at)}</td>
                                <td style={tdStyle}>{completion.note ?? "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {integratedSection === "attendance" && (
                  <div style={integratedSectionStyle}>
                    <div style={integratedAttendanceSummaryStyle}>
                      <div>
                        <span>출석 대상 집회</span>
                        <strong>{integratedAttendanceStats?.targetMeetingCount ?? 0}회</strong>
                      </div>
                      <div>
                        <span>입력 완료</span>
                        <strong>{integratedAttendanceStats?.enteredCount ?? 0}회</strong>
                      </div>
                      <div>
                        <span>출석 인정</span>
                        <strong>{integratedAttendanceStats?.presentCount ?? 0}회</strong>
                      </div>
                      <div>
                        <span>결석</span>
                        <strong>{integratedAttendanceStats?.absentCount ?? 0}회</strong>
                      </div>
                      <div>
                        <span>미입력</span>
                        <strong>{integratedAttendanceStats?.notEnteredCount ?? 0}회</strong>
                      </div>
                      <div>
                        <span>전체 출석률</span>
                        <strong>
                          {integratedAttendanceStats
                            ? `${integratedAttendanceStats.attendanceRate.toFixed(1)}%`
                            : "0.0%"}
                        </strong>
                      </div>
                    </div>

                    <div style={helpTextBoxStyle}>
                      <div>현재 체험판에서는 출석률을 조회용 지표로 표시합니다.</div>
                      <div>실제 운영판에서는 환경설정 기준에 따라 출석률을 진급 판정 조건에 반영할 수 있도록 설계해야 합니다.</div>
                    </div>

                    <div style={subsectionHeaderStyle}>
                      <h4 style={subsectionTitleStyle}>최근 출석 내역</h4>
                      <span style={subsectionCountStyle}>최근 8건</span>
                    </div>

                    {!integratedAttendanceStats || integratedAttendanceStats.recentItems.length === 0 ? (
                      <EmptyState title="출석 대상 집회가 없습니다" description="집회/출석 관리에서 출석 대상 집회를 먼저 등록하세요." />
                    ) : (
                      <div style={compactTableWrapStyle}>
                        <table style={tableStyle}>
                          <thead>
                            <tr>
                              <th style={thStyle}>일자</th>
                              <th style={thStyle}>집회/활동명</th>
                              <th style={thStyle}>출석 상태</th>
                              <th style={thStyle}>비고</th>
                            </tr>
                          </thead>
                          <tbody>
                            {integratedAttendanceStats.recentItems.map((item) => (
                              <tr key={item.meetingId}>
                                <td style={tdStyle}>{formatDate(item.meetingDate)}</td>
                                <td style={strongTdStyle}>{item.title}</td>
                                <td style={tdStyle}>
                                  {ATTENDANCE_STATUS_LABELS[item.status]}
                                </td>
                                <td style={tdStyle}>{item.note ?? "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {integratedSection === "review" && (
                  <div style={integratedSectionStyle}>
                    <div style={integratedInfoGridStyle}>
                      <div style={integratedInfoItemStyle}>
                        <span>현재급위</span>
                        <strong>{getScoutCurrentRankDisplay(integratedScout)}</strong>
                      </div>
                      <div style={integratedInfoItemStyle}>
                        <span>현재급위 인가일</span>
                        <strong>
                          {formatDate(getRankHistoryApprovedDate(integratedScout, integratedScout.current_rank_id) || null)}
                        </strong>
                      </div>
                      <div style={integratedInfoItemStyle}>
                        <span>다음급위</span>
                        <strong>{integratedNextRank?.rank_name ?? "최종급위"}</strong>
                      </div>
                      <div style={integratedInfoItemStyle}>
                        <span>필요 활동기간</span>
                        <strong>
                          {integratedNextRequirement?.required_months
                            ? `${integratedNextRequirement.required_months}개월`
                            : "기준 확인 필요"}
                        </strong>
                      </div>
                    </div>

                    {!integratedScout.current_rank_id ? (
                      <div style={reviewNoticeStyle}>
                        현재급위와 인가일을 먼저 등록한 후 진급 판정을 실행하세요.
                      </div>
                    ) : !integratedNextRank ? (
                      <div style={reviewNoticeStyle}>최종급위에 도달한 대원입니다.</div>
                    ) : (
                      <>
                        {canManageScouts && (
                          <form
                            style={integratedReviewActionStyle}
                            onSubmit={handleRunIntegratedPromotionReview}
                          >
                            <div>
                              <strong style={reviewActionTitleStyle}>진급 판정 실행</strong>
                              <p style={reviewActionDescriptionStyle}>
                                통합관리 화면에서 현재급위 기준으로 다음급위 진급 가능 여부를 바로 판정합니다.
                              </p>
                            </div>
                            <label style={reviewDateFieldStyle}>
                              <span style={fieldLabelTextStyle}>
                                판정일 <span style={requiredStyle}>*</span>
                              </span>
                              <input
                                style={inputStyle}
                                type="date"
                                min={DATE_INPUT_MIN}
                                max={DATE_INPUT_MAX}
                                value={integratedReviewDate}
                                onInput={limitDateInputYear}
                                onChange={(event) =>
                                  setIntegratedReviewDate(
                                    normalizeDateInputValue(event.target.value),
                                  )
                                }
                                required
                              />
                            </label>
                            <button
                              type="submit"
                              style={primaryButtonStyle}
                              disabled={integratedReviewSubmitting}
                            >
                              {integratedReviewSubmitting ? "판정 중..." : "진급 판정 실행"}
                            </button>
                          </form>
                        )}

                        {integratedReviewErrorMessage && (
                          <div style={errorBoxStyle}>{integratedReviewErrorMessage}</div>
                        )}
                        <FeedbackToast message={integratedReviewSuccessMessage} tone="success" onClose={() => setIntegratedReviewSuccessMessage("")} />

                        <div style={subsectionHeaderStyle}>
                          <h4 style={subsectionTitleStyle}>최근 진급 판정 결과</h4>
                          <span style={subsectionCountStyle}>
                            {integratedCurrentStepReviews.length}건
                          </span>
                        </div>

                        {!integratedLatestReview ? (
                          <div style={emptyStateStyle}>
                            현재 진급 단계의 판정 결과가 없습니다.
                          </div>
                        ) : (
                          <div style={reviewResultPanelStyle}>
                            <div style={reviewResultHeaderStyle}>
                              <div>
                                <strong style={reviewResultTitleStyle}>
                                  {rankNameMap.get(integratedLatestReview.from_rank_id) ?? "-"} → {rankNameMap.get(integratedLatestReview.to_rank_id) ?? "-"}
                                </strong>
                                <span style={reviewResultMetaStyle}>
                                  판정일 {formatDate(integratedLatestReview.review_date)}
                                </span>
                              </div>
                              <span
                                style={
                                  integratedLatestReview.final_passed
                                    ? reviewFinalPassStyle
                                    : reviewFinalFailStyle
                                }
                              >
                                {integratedLatestReview.final_passed
                                  ? "진급 가능"
                                  : "조건 보완 필요"}
                              </span>
                            </div>

                            <div style={reviewCriteriaGridStyle}>
                              <div style={reviewCriterionStyle}>
                                <span>활동기간</span>
                                <strong style={integratedLatestReview.period_passed ? reviewPassTextStyle : reviewFailTextStyle}>
                                  {integratedLatestReview.period_passed ? "통과" : "미충족"}
                                </strong>
                              </div>
                              <div style={reviewCriterionStyle}>
                                <span>필수기능장</span>
                                <strong style={integratedLatestReview.required_badges_passed ? reviewPassTextStyle : reviewFailTextStyle}>
                                  {integratedLatestReview.required_badges_passed ? "통과" : "미충족"}
                                </strong>
                              </div>
                              <div style={reviewCriterionStyle}>
                                <span>일반기능장</span>
                                <strong style={integratedLatestReview.general_badges_passed ? reviewPassTextStyle : reviewFailTextStyle}>
                                  {integratedLatestReview.general_badges_passed ? "통과" : "미충족"}
                                </strong>
                              </div>
                              <div style={reviewCriterionStyle}>
                                <span>WSEP/MoP</span>
                                {integratedProgramRequired ? (
                                  <strong
                                    style={
                                      integratedLatestReview.program_passed
                                        ? reviewPassTextStyle
                                        : reviewFailTextStyle
                                    }
                                  >
                                    {integratedLatestReview.program_passed ? "이수 확인" : "미이수"}
                                  </strong>
                                ) : (
                                  <strong style={reviewNotApplicableTextStyle}>해당 없음</strong>
                                )}
                              </div>
                              <div style={reviewCriterionStyle}>
                                <span>출석률</span>
                                <strong style={reviewReferenceTextStyle}>
                                  {integratedLatestReview.attendance_rate.toFixed(1)}% · 참고
                                </strong>
                              </div>
                            </div>

                            {!integratedLatestReview.final_passed && (
                              <div style={reviewMissingBoxStyle}>
                                <strong>보완 필요 항목</strong>
                                <span>
                                  {[
                                    !integratedLatestReview.period_passed ? "활동기간" : "",
                                    !integratedLatestReview.required_badges_passed ? "필수기능장" : "",
                                    !integratedLatestReview.general_badges_passed ? "일반기능장" : "",
                                    integratedProgramRequired && !integratedLatestReview.program_passed
                                      ? "WSEP/MoP"
                                      : "",
                                  ]
                                    .filter(Boolean)
                                    .join(", ") || "판정 기준 확인"}
                                </span>
                                {integratedLatestReview.available_at && (
                                  <span>
                                    진급 가능 예정일 {formatDate(integratedLatestReview.available_at)}
                                    {integratedLatestReview.days_remaining !== null &&
                                    integratedLatestReview.days_remaining > 0
                                      ? ` · ${integratedLatestReview.days_remaining}일 남음`
                                      : ""}
                                  </span>
                                )}
                              </div>
                            )}

                            {canManageScouts && integratedLatestReview.final_passed && (
                              <form
                                style={integratedApprovalFormStyle}
                                onSubmit={handleApproveIntegratedPromotion}
                              >
                                <div style={approvalFormHeaderStyle}>
                                  <strong>진급 인가 저장</strong>
                                  <span style={approvalFormDescriptionStyle}>
                                    진급 가능 판정일 때만 인가할 수 있습니다.
                                  </span>
                                </div>
                                <label style={fieldLabelStyle}>
                                  <span style={fieldLabelTextStyle}>
                                    인가일 <span style={requiredStyle}>*</span>
                                  </span>
                                  <input
                                    style={inputStyle}
                                    type="date"
                                    min={DATE_INPUT_MIN}
                                    max={DATE_INPUT_MAX}
                                    value={integratedApprovalDate}
                                    onInput={limitDateInputYear}
                                    onChange={(event) =>
                                      setIntegratedApprovalDate(
                                        normalizeDateInputValue(event.target.value),
                                      )
                                    }
                                    required
                                  />
                                </label>
                                <label style={approvalNoteFieldStyle}>
                                  비고
                                  <input
                                    style={inputStyle}
                                    value={integratedApprovalNote}
                                    onChange={(event) =>
                                      setIntegratedApprovalNote(event.target.value)
                                    }
                                    placeholder="인가 관련 비고"
                                  />
                                </label>
                                <button
                                  type="submit"
                                  style={submitButtonStyle}
                                  disabled={integratedApprovalSubmitting}
                                >
                                  {integratedApprovalSubmitting
                                    ? "인가 저장 중..."
                                    : `${integratedNextRank.rank_name} 진급 인가`}
                                </button>
                              </form>
                            )}

                            {integratedApprovalErrorMessage && (
                              <div style={errorBoxStyle}>{integratedApprovalErrorMessage}</div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div style={modalActionStyle}>
                  <button
                    type="button"
                    style={secondaryButtonStyle}
                    onClick={handleCloseIntegratedManagement}
                    disabled={integratedSubmitting}
                  >
                    닫기
                  </button>
                </div>
              </section>
            </div>,
            document.body,
          )}

        {statusErrorMessage && (
          <div style={errorBoxStyle}>{statusErrorMessage}</div>
        )}

        {loading && (
          <div style={emptyStateStyle}>대원 목록을 불러오는 중입니다...</div>
        )}

        {!loading && errorMessage && (
          <div style={errorBoxStyle}>{errorMessage}</div>
        )}

        {!loading && !errorMessage && filteredScouts.length === 0 && (
          <EmptyState title="조회되는 대원이 없습니다" description="검색 조건을 초기화하거나 먼저 대원을 등록하세요." />
        )}

        {!loading && !errorMessage && filteredScouts.length > 0 && (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  {renderSortableHeader("member_no", "대원번호")}
                  {renderSortableHeader("name", "이름")}
                  {isSuperAdmin && renderSortableHeader("organization", "소속")}
                  {isSuperAdmin && renderSortableHeader("school_name", "소속대")}
                  {renderSortableHeader("grade", "학년")}
                  {renderSortableHeader("scout_section", "구분")}
                  {renderSortableHeader("current_rank", "현재급위")}
                  {renderSortableHeader("joined_at", "입단일")}
                  {renderSortableHeader("is_from_cub_scout", "컵 출신")}
                  {renderSortableHeader("beginner_course_exempted", "초급 면제")}
                  {renderSortableHeader("status", "상태")}
                  <th style={thStyle}>대원통합관리</th>
                </tr>
              </thead>

              <tbody>
                {filteredScouts.map((scout) => (
                  <tr key={scout.id}>
                    <td style={tdStyle}>{scout.member_no ?? "-"}</td>
                    <td style={strongTdStyle}>{scout.name}</td>
                    {isSuperAdmin && (
                      <td style={tdStyle}>{getOrganizationName(scout.organization_id)}</td>
                    )}
                    {isSuperAdmin && <td style={tdStyle}>{scout.school_name ?? "-"}</td>}
                    <td style={tdStyle}>{scout.grade ?? "-"}</td>
                    <td style={tdStyle}>{getScoutSectionLabelByGrade(scout.grade)}</td>
                    <td style={tdStyle}>{getScoutCurrentRankDisplay(scout)}</td>
                    <td style={tdStyle}>{formatDate(scout.joined_at)}</td>
                    <td style={tdStyle}>
                      <span
                        style={
                          isElementarySchoolGrade(scout.grade) || scout.is_from_cub_scout
                            ? booleanCheckActiveStyle
                            : booleanCheckEmptyStyle
                        }
                        title={
                          isElementarySchoolGrade(scout.grade)
                            ? "현재 컵스카우트"
                            : scout.is_from_cub_scout
                              ? "컵스카우트 출신"
                              : "해당 없음"
                        }
                      >
                        {isElementarySchoolGrade(scout.grade) || scout.is_from_cub_scout ? "✓" : "-"}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span
                        style={
                          scout.beginner_course_exempted
                            ? booleanCheckActiveStyle
                            : booleanCheckEmptyStyle
                        }
                        title={scout.beginner_course_exempted ? "초급과정 면제" : "해당 없음"}
                      >
                        {scout.beginner_course_exempted ? "✓" : "-"}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {canManageScouts ? (
                        <select
                          style={getStatusSelectStyle(scout.status)}
                          value={scout.status}
                          disabled={statusUpdatingScoutId === scout.id}
                          onChange={(event) =>
                            handleUpdateScoutStatus(
                              scout,
                              event.target.value as ScoutStatus,
                            )
                          }
                        >
                          {SCOUT_STATUS_OPTIONS.map((statusOption) => (
                            <option key={statusOption.value} value={statusOption.value}>
                              {statusOption.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span style={getStatusBadgeStyle(scout.status)}>
                          {getStatusLabel(scout.status)}
                        </span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <div style={rowActionGroupStyle}>
                        <button
                          type="button"
                          style={primarySmallButtonStyle}
                          onClick={() => handleGoToIntegratedManagement(scout)}
                        >
                          {canManageScouts ? "통합관리" : "상세조회"}
                        </button>
                        {canManageScouts && (
                          <button
                            type="button"
                            style={smallButtonStyle}
                            onClick={() => handleOpenEditForm(scout)}
                          >
                            정보수정
                          </button>
                        )}
                      </div>
                    </td>
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

const summaryTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "15px",
  color: "#475569",
};

const summaryValueStyle: CSSProperties = {
  marginTop: "12px",
  marginBottom: 0,
  fontSize: "26px",
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
  gap: "8px",
  alignItems: "center",
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const listSearchPanelStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: "12px",
  padding: "10px 12px",
  marginBottom: "12px",
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  backgroundColor: "#f8fafc",
  flexWrap: "wrap",
};

const searchFieldLabelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  minWidth: "280px",
  flex: "1 1 420px",
  color: "#334155",
  fontSize: "14px",
  fontWeight: 800,
};

const filterFieldLabelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  minWidth: "138px",
  color: "#334155",
  fontSize: "14px",
  fontWeight: 800,
};

const searchResultInfoStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: "8px",
  backgroundColor: "#ffffff",
  border: "1px solid #e5e7eb",
  color: "#475569",
  fontSize: "14px",
  fontWeight: 700,
  whiteSpace: "nowrap",
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

const searchInputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  fontSize: "14px",
  backgroundColor: "#ffffff",
};

const filterSelectStyle: CSSProperties = {
  minWidth: "150px",
  height: "40px",
  padding: "0 10px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  fontSize: "14px",
  backgroundColor: "#ffffff",
};

const hiddenInputStyle: CSSProperties = {
  display: "none",
};

const excelButtonStyle: CSSProperties = {
  padding: "10px 14px",
  borderRadius: "8px",
  border: "none",
  backgroundColor: "#0f172a",
  color: "#ffffff",
  fontWeight: 700,
  cursor: "pointer",
};

const excelPanelStyle: CSSProperties = {
  padding: "16px",
  marginBottom: "18px",
  border: "1px solid #bfdbfe",
  borderRadius: "12px",
  backgroundColor: "#eff6ff",
};

const excelPanelHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "16px",
  marginBottom: "12px",
};

const excelPanelActionStyle: CSSProperties = {
  display: "flex",
  gap: "8px",
  alignItems: "center",
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const excelCompactGuideStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: "10px",
  backgroundColor: "#ffffff",
  border: "1px solid #dbeafe",
  color: "#1e3a8a",
  fontSize: "14px",
  lineHeight: 1.5,
};

const excelGuideBoxStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  padding: "12px",
  marginTop: "10px",
  marginBottom: "12px",
  borderRadius: "10px",
  backgroundColor: "#ffffff",
  border: "1px solid #dbeafe",
  color: "#1e3a8a",
  fontSize: "14px",
  lineHeight: 1.5,
};

const excelPreviewWrapStyle: CSSProperties = {
  marginTop: "16px",
};

const excelSummaryStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "10px",
  marginBottom: "12px",
  color: "#334155",
  fontSize: "14px",
  fontWeight: 800,
};


const errorBadgeStyle: CSSProperties = {
  display: "inline-block",
  padding: "4px 8px",
  borderRadius: "999px",
  backgroundColor: "#fee2e2",
  color: "#991b1b",
  fontSize: "12px",
  fontWeight: 800,
};

const importActionBadgeStyle = (action: ExcelImportAction | null): CSSProperties => ({
  display: "inline-block",
  padding: "4px 8px",
  borderRadius: "999px",
  backgroundColor: action === "update" ? "#fef3c7" : "#dcfce7",
  color: action === "update" ? "#92400e" : "#166534",
  fontSize: "12px",
  fontWeight: 800,
});

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

const primarySmallButtonStyle: CSSProperties = {
  ...smallButtonStyle,
  border: "none",
  backgroundColor: "#2563eb",
  color: "#ffffff",
};

const booleanCheckActiveStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "24px",
  height: "24px",
  borderRadius: "999px",
  backgroundColor: "#dcfce7",
  color: "#166534",
  fontSize: "14px",
  fontWeight: 900,
};

const booleanCheckEmptyStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "24px",
  height: "24px",
  color: "#94a3b8",
  fontSize: "14px",
  fontWeight: 700,
};

const rowActionGroupStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  flexWrap: "wrap",
};

const submitButtonStyle: CSSProperties = {
  padding: "10px 14px",
  borderRadius: "8px",
  border: "none",
  backgroundColor: "#16a34a",
  color: "#ffffff",
  fontWeight: 700,
  cursor: "pointer",
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

const tableWrapStyle: CSSProperties = {
  overflowX: "auto",
  maxHeight: "calc(100vh - 360px)",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "14px",
};

const thStyle: CSSProperties = {
  padding: "11px 12px",
  borderBottom: "1px solid #e5e7eb",
  backgroundColor: "#f8fafc",
  color: "#334155",
  textAlign: "left",
  whiteSpace: "nowrap",
  position: "sticky",
  top: 0,
  zIndex: 2,
};

const sortableHeaderButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  width: "100%",
  padding: 0,
  border: "none",
  backgroundColor: "transparent",
  color: "inherit",
  font: "inherit",
  fontWeight: 900,
  textAlign: "left",
  cursor: "pointer",
};

const sortIndicatorStyle: CSSProperties = {
  color: "#2563eb",
  fontSize: "11px",
  fontWeight: 900,
  lineHeight: 1,
};

const tdStyle: CSSProperties = {
  padding: "11px 12px",
  borderBottom: "1px solid #e5e7eb",
  color: "#475569",
  whiteSpace: "nowrap",
};

const errorTdStyle: CSSProperties = {
  ...tdStyle,
  color: "#b91c1c",
  whiteSpace: "normal",
  minWidth: "220px",
};

const strongTdStyle: CSSProperties = {
  ...tdStyle,
  color: "#0f172a",
  fontWeight: 800,
};

const statusBadgeStyle: CSSProperties = {
  display: "inline-block",
  padding: "4px 8px",
  borderRadius: "999px",
  border: "1px solid",
  backgroundColor: "#e0f2fe",
  color: "#0369a1",
  fontSize: "12px",
  fontWeight: 800,
};

const statusSelectStyle: CSSProperties = {
  padding: "6px 8px",
  borderRadius: "6px",
  border: "1px solid #cbd5e1",
  backgroundColor: "#ffffff",
  color: "#334155",
  fontSize: "13px",
  fontWeight: 700,
};

const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  zIndex: 2147483000,
  backgroundColor: "rgba(15, 23, 42, 0.45)",
};

const modalPanelStyle: CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: "min(920px, calc(100vw - 48px))",
  maxHeight: "calc(100vh - 96px)",
  overflowY: "auto",
  overscrollBehavior: "contain",
  padding: "22px",
  border: "1px solid #cbd5e1",
  borderRadius: "16px",
  backgroundColor: "#ffffff",
  boxShadow: "0 24px 80px rgba(15, 23, 42, 0.28)",
};

const integratedModalPanelStyle: CSSProperties = {
  ...modalPanelStyle,
  width: "min(1120px, calc(100vw - 48px))",
};

const integratedSummaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: "12px",
  marginBottom: "14px",
};

const integratedSummaryCardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "5px",
  padding: "12px",
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  backgroundColor: "#f8fafc",
  minWidth: 0,
};

const integratedSummaryLabelStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "12px",
  fontWeight: 900,
};

const integratedSummaryValueStyle: CSSProperties = {
  color: "#0f172a",
  fontSize: "16px",
  fontWeight: 900,
  lineHeight: 1.35,
};

const integratedSummaryHelpStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "12px",
  fontWeight: 700,
  lineHeight: 1.35,
};

const integratedTabListStyle: CSSProperties = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
  padding: "8px",
  marginBottom: "14px",
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  backgroundColor: "#f8fafc",
};

const integratedTabButtonStyle: CSSProperties = {
  padding: "8px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: "999px",
  backgroundColor: "#ffffff",
  color: "#334155",
  fontWeight: 900,
  cursor: "pointer",
};

const integratedTabActiveStyle: CSSProperties = {
  ...integratedTabButtonStyle,
  border: "1px solid #2563eb",
  backgroundColor: "#dbeafe",
  color: "#1d4ed8",
};

const rankProgressPanelStyle: CSSProperties = {
  padding: "12px",
  borderRadius: "12px",
  border: "1px solid #e2e8f0",
  backgroundColor: "#ffffff",
  marginBottom: "12px",
};

const rankProgressHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "12px",
  marginBottom: "10px",
};

const rankProgressWarningBadgeStyle: CSSProperties = {
  padding: "5px 9px",
  borderRadius: "999px",
  border: "1px solid #fcd34d",
  backgroundColor: "#fef3c7",
  color: "#92400e",
  fontSize: "12px",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const rankProgressGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: "8px",
};

const rankProgressItemBaseStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "4px",
  minHeight: "78px",
  padding: "10px 8px",
  borderRadius: "10px",
  border: "1px solid",
  textAlign: "center",
};

const rankProgressCompletedItemStyle: CSSProperties = {
  ...rankProgressItemBaseStyle,
  borderColor: "#bbf7d0",
  backgroundColor: "#f0fdf4",
  color: "#166534",
};

const rankProgressCurrentItemStyle: CSSProperties = {
  ...rankProgressItemBaseStyle,
  borderColor: "#60a5fa",
  backgroundColor: "#eff6ff",
  color: "#1d4ed8",
};

const rankProgressNextItemStyle: CSSProperties = {
  ...rankProgressItemBaseStyle,
  borderColor: "#fdba74",
  backgroundColor: "#fff7ed",
  color: "#c2410c",
};

const rankProgressMissingItemStyle: CSSProperties = {
  ...rankProgressItemBaseStyle,
  borderColor: "#fcd34d",
  backgroundColor: "#fffbeb",
  color: "#92400e",
};

const rankProgressPendingItemStyle: CSSProperties = {
  ...rankProgressItemBaseStyle,
  borderColor: "#e2e8f0",
  backgroundColor: "#f8fafc",
  color: "#94a3b8",
};

const rankProgressWarningNoticeStyle: CSSProperties = {
  marginTop: "10px",
  padding: "9px 11px",
  borderRadius: "9px",
  backgroundColor: "#fffbeb",
  color: "#92400e",
  fontSize: "12.5px",
  fontWeight: 700,
  lineHeight: 1.5,
};

const integratedSectionStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "14px",
};

const integratedInfoGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: "12px",
};

const integratedInfoItemStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  padding: "12px",
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  backgroundColor: "#ffffff",
  color: "#334155",
};

const integratedInlineFormStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: "12px",
  padding: "14px",
  border: "1px solid #dbeafe",
  borderRadius: "12px",
  backgroundColor: "#eff6ff",
  alignItems: "end",
};

const integratedFormButtonCellStyle: CSSProperties = {
  gridColumn: "1 / -1",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "flex-end",
  paddingTop: "2px",
};

const subsectionHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  marginTop: "2px",
};

const subsectionTitleStyle: CSSProperties = {
  margin: 0,
  color: "#0f172a",
  fontSize: "16px",
  fontWeight: 900,
};

const subsectionCountStyle: CSSProperties = {
  display: "inline-flex",
  padding: "4px 8px",
  borderRadius: "999px",
  backgroundColor: "#f1f5f9",
  color: "#475569",
  fontSize: "12px",
  fontWeight: 900,
};

const compactTableWrapStyle: CSSProperties = {
  overflowX: "auto",
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  maxHeight: "280px",
};

const mutedCellTextStyle: CSSProperties = {
  marginTop: "3px",
  color: "#64748b",
  fontSize: "12px",
  fontWeight: 700,
};

const integratedAttendanceSummaryStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: "10px",
};

const modalHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "16px",
  paddingBottom: "14px",
  marginBottom: "16px",
  borderBottom: "1px solid #e5e7eb",
};

const modalCloseButtonStyle: CSSProperties = {
  width: "36px",
  height: "36px",
  borderRadius: "999px",
  border: "1px solid #cbd5e1",
  backgroundColor: "#ffffff",
  color: "#334155",
  fontSize: "22px",
  fontWeight: 800,
  lineHeight: 1,
  cursor: "pointer",
};

const modalActionStyle: CSSProperties = {
  position: "sticky",
  bottom: 0,
  display: "flex",
  justifyContent: "flex-end",
  gap: "8px",
  paddingTop: "14px",
  marginTop: "16px",
  borderTop: "1px solid #e5e7eb",
  backgroundColor: "#ffffff",
};

const formTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "20px",
  fontWeight: 800,
  color: "#0f172a",
};

const formDescriptionStyle: CSSProperties = {
  marginTop: "6px",
  marginBottom: 0,
  color: "#64748b",
  lineHeight: 1.5,
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "14px",
};

const createModalGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "14px",
  marginBottom: "14px",
};

const fieldLabelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  color: "#334155",
  fontSize: "14px",
  fontWeight: 700,
};

const fieldLabelTextStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  lineHeight: 1.4,
};


const badgeSelectHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px",
  minWidth: 0,
};

const badgeSortSelectStyle: CSSProperties = {
  minWidth: "112px",
  padding: "4px 7px",
  border: "1px solid #cbd5e1",
  borderRadius: "7px",
  backgroundColor: "#ffffff",
  color: "#475569",
  fontSize: "12px",
  fontWeight: 700,
};

const badgeRankDatePanelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  padding: "12px 14px",
  borderRadius: "12px",
  border: "1px solid #cbd5e1",
  backgroundColor: "#f8fafc",
};

const badgeRankDateHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "12px",
  flexWrap: "wrap",
  color: "#0f172a",
  fontSize: "14px",
};

const badgeRankDateGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
  gap: "8px",
};

const badgeRankDateItemStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  minWidth: 0,
  padding: "9px 10px",
  borderRadius: "9px",
  border: "1px solid #e2e8f0",
  backgroundColor: "#ffffff",
};

const badgeRankDateLabelStyle: CSSProperties = {
  color: "#475569",
  fontSize: "13px",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const badgeRankDateValueStyle: CSSProperties = {
  color: "#0f172a",
  fontSize: "13px",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const badgeRankDateMissingValueStyle: CSSProperties = {
  ...badgeRankDateValueStyle,
  color: "#b91c1c",
};

const badgeRankDateNoticeStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "12px",
  fontWeight: 700,
  lineHeight: 1.45,
};

const badgeEntryFormStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "minmax(250px, 1.55fr) minmax(155px, 0.9fr) minmax(155px, 0.9fr) minmax(220px, 1.25fr) auto",
  gap: "12px",
  padding: "14px",
  border: "1px solid #dbeafe",
  borderRadius: "12px",
  backgroundColor: "#eff6ff",
  alignItems: "end",
};

const badgeEntryInputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  padding: "10px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  fontSize: "14px",
  backgroundColor: "#ffffff",
};

const badgeLeaderFieldHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px",
  minWidth: 0,
};

const badgeCompactCheckboxLabelStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "5px",
  color: "#475569",
  fontSize: "12px",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const badgeEntryButtonCellStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "flex-end",
  minWidth: "102px",
};

const badgeEntryHelpStyle: CSSProperties = {
  gridColumn: "1 / -1",
  color: "#64748b",
  fontSize: "11.5px",
  fontWeight: 600,
  lineHeight: 1.4,
  marginTop: "-4px",
};

const inputStyle: CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  fontSize: "14px",
  backgroundColor: "#ffffff",
};

const readOnlyInputStyle: CSSProperties = {
  ...inputStyle,
  backgroundColor: "#f1f5f9",
  border: "1px solid #cbd5e1",
  color: "#64748b",
  cursor: "not-allowed",
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: "80px",
  resize: "vertical",
};

const checkboxPanelStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "12px",
  marginTop: "16px",
  marginBottom: "10px",
  padding: "14px",
  borderRadius: "12px",
  border: "1px solid #e2e8f0",
  backgroundColor: "#f8fafc",
};

const checkboxSectionStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  minWidth: 0,
};

const checkboxSectionTitleStyle: CSSProperties = {
  color: "#334155",
  fontSize: "13px",
  fontWeight: 900,
};

const checkboxRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "12px 18px",
};

const checkboxLabelStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "7px",
  color: "#334155",
  fontSize: "14px",
  fontWeight: 700,
  lineHeight: 1.4,
};

const autoRankNoticeStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  minHeight: "43px",
  padding: "10px 12px",
  borderRadius: "8px",
  border: "1px solid #fed7aa",
  backgroundColor: "#fff7ed",
  color: "#c2410c",
  fontSize: "13px",
  fontWeight: 800,
  lineHeight: 1.5,
};

const requiredStyle: CSSProperties = {
  color: "#dc2626",
};

const rankHistoryInputPanelStyle: CSSProperties = {
  gridColumn: "1 / -1",
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  padding: "14px",
  borderRadius: "12px",
  border: "1px solid #bfdbfe",
  backgroundColor: "#eff6ff",
};

const rankHistoryInputHeaderStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  color: "#1e3a8a",
  fontSize: "13px",
  lineHeight: 1.5,
};

const rankHistoryInputGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "12px",
};

const helpTextBoxStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "3px",
  marginTop: "8px",
  marginBottom: "16px",
  padding: "10px 12px",
  borderRadius: "10px",
  backgroundColor: "#f8fafc",
  color: "#64748b",
  fontSize: "13px",
  lineHeight: 1.55,
};

const formActionStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "8px",
  marginTop: "16px",
};

const programSelectFieldStyle: CSSProperties = {
  ...fieldLabelStyle,
  gridColumn: "span 2",
  minWidth: 0,
};

const programSelectStyle: CSSProperties = {
  ...inputStyle,
  width: "100%",
  minWidth: 0,
};

const reviewNoticeStyle: CSSProperties = {
  padding: "18px",
  borderRadius: "12px",
  border: "1px solid #e2e8f0",
  backgroundColor: "#f8fafc",
  color: "#475569",
  fontWeight: 800,
  textAlign: "center",
};

const integratedReviewActionStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(280px, 1fr) minmax(180px, 220px) auto",
  alignItems: "end",
  gap: "12px",
  padding: "14px",
  border: "1px solid #bfdbfe",
  borderRadius: "12px",
  backgroundColor: "#eff6ff",
};

const reviewActionTitleStyle: CSSProperties = {
  display: "block",
  color: "#0f172a",
  fontSize: "15px",
  fontWeight: 900,
};

const reviewActionDescriptionStyle: CSSProperties = {
  margin: "5px 0 0",
  color: "#475569",
  fontSize: "13px",
  lineHeight: 1.5,
};

const reviewDateFieldStyle: CSSProperties = {
  ...fieldLabelStyle,
  minWidth: 0,
};

const reviewResultPanelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  padding: "16px",
  border: "1px solid #e2e8f0",
  borderRadius: "14px",
  backgroundColor: "#ffffff",
};

const reviewResultHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
};

const reviewResultTitleStyle: CSSProperties = {
  display: "block",
  color: "#0f172a",
  fontSize: "17px",
  fontWeight: 900,
};

const reviewResultMetaStyle: CSSProperties = {
  display: "block",
  marginTop: "4px",
  color: "#64748b",
  fontSize: "13px",
  fontWeight: 700,
};

const reviewFinalPassStyle: CSSProperties = {
  display: "inline-flex",
  padding: "6px 11px",
  borderRadius: "999px",
  backgroundColor: "#dcfce7",
  color: "#166534",
  fontSize: "13px",
  fontWeight: 900,
};

const reviewFinalFailStyle: CSSProperties = {
  ...reviewFinalPassStyle,
  backgroundColor: "#fee2e2",
  color: "#991b1b",
};

const reviewCriteriaGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "10px",
};

const reviewCriterionStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "5px",
  padding: "11px 12px",
  border: "1px solid #e5e7eb",
  borderRadius: "10px",
  backgroundColor: "#f8fafc",
  color: "#475569",
  fontSize: "13px",
  fontWeight: 800,
};

const reviewPassTextStyle: CSSProperties = {
  color: "#15803d",
  fontSize: "14px",
  fontWeight: 900,
};

const reviewFailTextStyle: CSSProperties = {
  color: "#b91c1c",
  fontSize: "14px",
  fontWeight: 900,
};

const reviewReferenceTextStyle: CSSProperties = {
  color: "#475569",
  fontSize: "14px",
  fontWeight: 900,
};

const reviewNotApplicableTextStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "14px",
  fontWeight: 900,
};

const reviewMissingBoxStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  padding: "12px",
  borderRadius: "10px",
  border: "1px solid #fecaca",
  backgroundColor: "#fef2f2",
  color: "#991b1b",
  fontSize: "13px",
  lineHeight: 1.5,
};

const integratedApprovalFormStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(290px, 1.25fr) minmax(160px, 220px) minmax(240px, 1.5fr) auto",
  alignItems: "end",
  gap: "12px",
  padding: "14px",
  border: "1px solid #bbf7d0",
  borderRadius: "12px",
  backgroundColor: "#f0fdf4",
};

const approvalFormHeaderStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  color: "#166534",
  fontSize: "13px",
  lineHeight: 1.45,
  minWidth: 0,
};

const approvalFormDescriptionStyle: CSSProperties = {
  whiteSpace: "nowrap",
};

const approvalNoteFieldStyle: CSSProperties = {
  ...fieldLabelStyle,
  minWidth: 0,
};

const badgeGuidePanelStyle: CSSProperties = {
  padding: "16px",
  borderRadius: "14px",
  border: "1px solid #bfdbfe",
  backgroundColor: "#eff6ff",
};

const badgeGuideHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
  color: "#0f172a",
  fontSize: "15px",
  fontWeight: 900,
  marginBottom: "8px",
};

const badgeGuideDescriptionStyle: CSSProperties = {
  margin: "0 0 12px",
  color: "#475569",
  fontSize: "13px",
  lineHeight: 1.6,
  wordBreak: "keep-all",
};

const badgeGuideGeneralSummaryStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px 14px",
  flexWrap: "wrap",
  padding: "10px 12px",
  marginBottom: "12px",
  borderRadius: "10px",
  border: "1px solid #dbeafe",
  backgroundColor: "#ffffff",
  color: "#334155",
  fontSize: "13px",
  lineHeight: 1.5,
};

const badgeGuideSummaryGroupStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  flexWrap: "wrap",
};

const badgeGuideSummaryGroupTitleStyle: CSSProperties = {
  color: "#0f172a",
  fontWeight: 900,
};

const badgeGuideSummaryDividerStyle: CSSProperties = {
  width: "1px",
  alignSelf: "stretch",
  minHeight: "24px",
  backgroundColor: "#dbeafe",
};

const badgeGuideGeneralSummaryMissingStyle: CSSProperties = {
  padding: "3px 8px",
  borderRadius: "999px",
  backgroundColor: "#fee2e2",
  color: "#991b1b",
  fontWeight: 900,
};

const badgeGuideGeneralSummaryCompleteStyle: CSSProperties = {
  ...badgeGuideGeneralSummaryMissingStyle,
  backgroundColor: "#dcfce7",
  color: "#166534",
};

const badgeGuideGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "10px",
};

const badgeGuideGroupStyle: CSSProperties = {
  padding: "12px",
  borderRadius: "12px",
  border: "1px solid #dbeafe",
  backgroundColor: "#ffffff",
};

const badgeGuideGroupHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "8px",
  marginBottom: "9px",
  color: "#0f172a",
  fontSize: "13px",
};

const badgeGuideBadgeListStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px",
};

const badgeGuideGeneralRequirementStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "8px",
  flexWrap: "wrap",
  marginTop: "10px",
  paddingTop: "9px",
  borderTop: "1px solid #e2e8f0",
  color: "#334155",
  fontSize: "12px",
  lineHeight: 1.5,
};

const badgeGuideGeneralRequirementMissingStyle: CSSProperties = {
  color: "#b91c1c",
  fontWeight: 900,
};

const badgeGuideGeneralRequirementCompleteStyle: CSSProperties = {
  color: "#166534",
  fontWeight: 900,
};

const badgeGuideBadgeCompleteStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "5px 8px",
  borderRadius: "999px",
  backgroundColor: "#dcfce7",
  color: "#166534",
  fontSize: "12px",
  fontWeight: 900,
};

const badgeGuideBadgeMissingStyle: CSSProperties = {
  ...badgeGuideBadgeCompleteStyle,
  backgroundColor: "#fee2e2",
  color: "#991b1b",
};

const badgeGuideMissingCountStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "3px 8px",
  borderRadius: "999px",
  backgroundColor: "#fee2e2",
  color: "#991b1b",
  fontSize: "12px",
  fontWeight: 900,
};

const badgeGuideCompleteCountStyle: CSSProperties = {
  ...badgeGuideMissingCountStyle,
  backgroundColor: "#dcfce7",
  color: "#166534",
};

const badgeGuideEmptyStyle: CSSProperties = {
  padding: "12px",
  borderRadius: "12px",
  backgroundColor: "#ffffff",
  border: "1px dashed #bfdbfe",
  color: "#475569",
  fontSize: "13px",
};

const badgeGuideNextBoxStyle: CSSProperties = {
  marginTop: "10px",
  padding: "11px 12px",
  borderRadius: "12px",
  backgroundColor: "#f8fafc",
  border: "1px solid #e2e8f0",
  color: "#334155",
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
  fontSize: "13px",
  lineHeight: 1.5,
};

const badgeGuideFootnoteStyle: CSSProperties = {
  marginTop: "9px",
  color: "#64748b",
  fontSize: "12px",
  lineHeight: 1.5,
};

