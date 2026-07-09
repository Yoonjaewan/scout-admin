import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, FormEvent } from "react";
import * as XLSX from "xlsx";
import { createPortal } from "react-dom";
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
};

type Organization = {
  id: string;
  name: string;
};

type ScoutCreateForm = {
  organization_id: string;
  name: string;
  grade: string;
  joined_at: string;
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

function getEmptyCreateForm(profile?: UserProfile | null): ScoutCreateForm {
  return {
    organization_id:
      profile && profile.role !== "super_admin" ? profile.organization_id ?? "" : "",
    name: "",
    grade: "",
    joined_at: getTodayText(),
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
    is_from_cub_scout: false,
    cub_promotion_completed: false,
    beginner_course_exempted: false,
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
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [scouts, setScouts] = useState<Scout[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [keyword, setKeyword] = useState("");
  const [sectionFilter, setSectionFilter] = useState<ScoutSectionFilter>("all");
  const [statusFilter, setStatusFilter] = useState<ScoutStatusFilter>("all");
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

  useEffect(() => {
    if ((!isCreateFormOpen && !isEditFormOpen) || typeof document === "undefined") return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isCreateFormOpen, isEditFormOpen]);

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

    if (currentProfile.role !== "super_admin") {
      if (!currentProfile.organization_id) {
        setErrorMessage("소속 조직 정보가 없어 대원 목록을 조회할 수 없습니다.");
        setLoading(false);
        return;
      }

      scoutQuery = scoutQuery.eq("organization_id", currentProfile.organization_id);
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

    const { data: badgeData, error: badgeError } = await supabase
      .from("badges")
      .select("id, name, category_id, sort_order")
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

    setScouts((scoutData ?? []) as unknown as Scout[]);
    setRanks((rankData ?? []) as unknown as Rank[]);
    setBadges((badgeData ?? []) as unknown as Badge[]);
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

    setScouts((prevScouts) =>
      [...prevScouts, createdScout].sort((a, b) => a.name.localeCompare(b.name)),
    );

    setCreateForm(getEmptyCreateForm(profile));
    setIsCreateFormOpen(false);
    setSubmitting(false);
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

    setScouts((prevScouts) =>
      prevScouts
        .map((scout) => (scout.id === editedScout.id ? editedScout : scout))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );

    setEditForm(getEmptyEditForm());
    setIsEditFormOpen(false);
    setEditSubmitting(false);
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
    const organizationName = getBulkTargetOrganizationName().replace(/[\/:*?"<>|]/g, "_");
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

    const text = normalizeText(value).replace(/[.]/g, "-").replace(/[\/]/g, "-");
    const dateMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

    if (!dateMatch) return text;

    const [, year, month, day] = dateMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  };

  const isValidDateText = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00`);
    return !Number.isNaN(date.getTime());
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
          .replace(/[()\[\]{}:：]/g, " ")
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

  const advancementTargetScoutCount = useMemo(() => {
    return scouts.filter(
      (scout) => scout.status === "active" && !isElementarySchoolGrade(scout.grade),
    ).length;
  }, [scouts]);

  const rankSetupNeededScoutCount = useMemo(() => {
    return scouts.filter(
      (scout) =>
        scout.status === "active" &&
        !isElementarySchoolGrade(scout.grade) &&
        !scout.current_rank_id,
    ).length;
  }, [scouts]);

  return (
    <div>
      <div style={pageHeaderStyle}>
        <div>
          <h1 style={pageTitleStyle}>대원 관리</h1>
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
          <h2 style={summaryTitleStyle}>진급관리 대상</h2>
          <p style={summaryValueStyle}>{advancementTargetScoutCount}명</p>
          <p style={summaryDescriptionStyle}>조건 확인이 필요한 스카우트 이상 활동 대원입니다.</p>
        </section>

        <section style={summaryCardStyle}>
          <h2 style={summaryTitleStyle}>급위 확인 필요</h2>
          <p style={summaryValueStyle}>{rankSetupNeededScoutCount}명</p>
          <p style={summaryDescriptionStyle}>진급관리 전에 현재급위 등록이 필요한 대원입니다.</p>
        </section>
      </div>

      <section style={contentCardStyle}>
        <div style={toolbarStyle}>
          <div>
            <h2 style={sectionTitleStyle}>대원 목록</h2>
            <p style={sectionDescriptionStyle}>
              대원번호, 이름, 소속대, 학년, 현재급위와 활동 상태를 확인합니다.
            </p>
          </div>

          <div style={toolbarRightStyle}>
            {canUseExcelImport && (
              <>
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
                  엑셀 등록/수정
                </button>
              </>
            )}

            {canManageScouts && (
              <button
                type="button"
                style={primaryButtonStyle}
                onClick={handleOpenCreateForm}
              >
                대원 등록
              </button>
            )}
          </div>
        </div>

        {canUseExcelImport && (
          <section style={excelPanelStyle}>
            <div style={excelPanelHeaderStyle}>
              <div>
                <h3 style={formTitleStyle}>엑셀 대원 등록/수정</h3>
                <p style={formDescriptionStyle}>
                  엑셀 파일로 대원정보, 급위, 기능장 취득정보를 함께 등록하거나 수정합니다.
                </p>
              </div>
              <div style={excelPanelActionStyle}>
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
                <span style={fieldLabelTextStyle}>엑셀 적용 <span style={fieldLabelTextStyle}>소속 조직 <span style={requiredStyle}>*</span></span></span>
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
            {excelSuccessMessage && <div style={successBoxStyle}>{excelSuccessMessage}</div>}

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
              placeholder="대원번호, 이름, 소속대, 학년, 급위 검색"
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
                      value={createForm.joined_at}
                      onChange={(event) => updateCreateForm("joined_at", event.target.value)}
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
                  <div>컵스카우트 출신 대원이 스카우트로 전환된 경우 초급과정은 면제로 표시할 수 있습니다.</div>
                  <div>초급 인가 기록과 인가일은 진급 관리에서 별도로 등록해야 합니다.</div>
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
                <div>컵스카우트 출신 대원이 스카우트로 전환된 경우 초급과정은 면제로 표시할 수 있습니다.</div>
                <div>초급 인가 기록과 인가일은 진급 관리에서 별도로 등록해야 합니다.</div>
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
          <div style={emptyStateStyle}>조회되는 대원이 없습니다.</div>
        )}

        {!loading && !errorMessage && filteredScouts.length > 0 && (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  {renderSortableHeader("member_no", "대원번호")}
                  {renderSortableHeader("name", "이름")}
                  {isSuperAdmin && renderSortableHeader("organization", "소속")}
                  {renderSortableHeader("school_name", "소속대")}
                  {renderSortableHeader("grade", "학년")}
                  {renderSortableHeader("scout_section", "구분")}
                  {renderSortableHeader("current_rank", "현재급위")}
                  {renderSortableHeader("joined_at", "입단일")}
                  {renderSortableHeader("is_from_cub_scout", "컵 출신")}
                  {renderSortableHeader("beginner_course_exempted", "초급 면제")}
                  {renderSortableHeader("status", "상태")}
                  {canManageScouts && <th style={thStyle}>관리</th>}
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
                    <td style={tdStyle}>{scout.school_name ?? "-"}</td>
                    <td style={tdStyle}>{scout.grade ?? "-"}</td>
                    <td style={tdStyle}>{getScoutSectionLabelByGrade(scout.grade)}</td>
                    <td style={tdStyle}>{getScoutCurrentRankDisplay(scout)}</td>
                    <td style={tdStyle}>{formatDate(scout.joined_at)}</td>
                    <td style={tdStyle}>
                      {isElementarySchoolGrade(scout.grade)
                        ? "현재"
                        : scout.is_from_cub_scout
                          ? "출신"
                          : "-"}
                    </td>
                    <td style={tdStyle}>
                      {scout.beginner_course_exempted ? "면제" : "-"}
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
                    {canManageScouts && (
                      <td style={tdStyle}>
                        <button
                          type="button"
                          style={smallButtonStyle}
                          onClick={() => handleOpenEditForm(scout)}
                        >
                          수정
                        </button>
                      </td>
                    )}
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
  padding: "14px 16px",
  marginBottom: "14px",
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  backgroundColor: "#f8fafc",
  flexWrap: "wrap",
};

const searchFieldLabelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  minWidth: "320px",
  flex: "1 1 420px",
  color: "#334155",
  fontSize: "14px",
  fontWeight: 800,
};

const filterFieldLabelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  minWidth: "150px",
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

const successBoxStyle: CSSProperties = {
  padding: "16px",
  borderRadius: "10px",
  backgroundColor: "#ecfdf5",
  color: "#047857",
  fontWeight: 700,
  marginBottom: "16px",
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