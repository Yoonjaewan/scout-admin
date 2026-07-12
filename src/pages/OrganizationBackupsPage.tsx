import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase";

type OrganizationStatus = "active" | "suspended" | "closed" | "inactive" | string;

type OrganizationItem = {
  id: string;
  name: string;
  unitNumber: string | null;
  status: OrganizationStatus;
  statusLabel: string;
};

type BackupLog = {
  id: string;
  organization_id: string;
  backup_type: "business_excel" | "system_excel" | string;
  file_name: string;
  row_count: number;
  status: string;
  created_by: string | null;
  created_at: string;
  downloaded_at: string | null;
  provided_at: string | null;
  note: string | null;
};

type RawTableDefinition = {
  sheetName: string;
  tableName: string;
  organizationScoped: boolean;
};

type ScoutRow = Record<string, unknown> & {
  id: string;
  organization_id: string;
  member_no?: string | null;
  name?: string | null;
  school_name?: string | null;
  grade?: string | null;
  joined_at?: string | null;
  current_rank_id?: string | null;
  status?: string | null;
  note?: string | null;
};

type RankRow = Record<string, unknown> & {
  id: string;
  rank_code?: string | null;
  rank_name?: string | null;
  sort_order?: number | null;
};

type RankHistoryRow = Record<string, unknown> & {
  scout_id: string;
  rank_id: string;
  approved_at?: string | null;
  approval_type?: string | null;
  note?: string | null;
};

type BadgeRow = Record<string, unknown> & {
  id: string;
  name?: string | null;
  is_required_badge?: boolean | null;
  is_general_badge?: boolean | null;
  category_id?: string | null;
};

type BadgeCategoryRow = Record<string, unknown> & {
  id: string;
  name?: string | null;
};

type ScoutBadgeRow = Record<string, unknown> & {
  id: string;
  scout_id: string;
  badge_id: string;
  acquired_at?: string | null;
  approved_at?: string | null;
  instructor_name?: string | null;
  leader_confirmed?: boolean | null;
  note?: string | null;
};

type ProgramRow = Record<string, unknown> & {
  scout_id: string;
  program_type?: string | null;
  completed_at?: string | null;
  approved_at?: string | null;
  certificate_no?: string | null;
  note?: string | null;
};

type MeetingRow = Record<string, unknown> & {
  id: string;
  meeting_date?: string | null;
  title?: string | null;
  meeting_type?: string | null;
};

type AttendanceRow = Record<string, unknown> & {
  meeting_id: string;
  scout_id: string;
  status?: string | null;
  note?: string | null;
};

type PromotionReviewRow = Record<string, unknown> & {
  scout_id: string;
  from_rank_id?: string | null;
  to_rank_id?: string | null;
  review_date?: string | null;
  available_at?: string | null;
  period_passed?: boolean | null;
  required_badges_passed?: boolean | null;
  general_badges_passed?: boolean | null;
  program_passed?: boolean | null;
  attendance_rate?: number | null;
  final_passed?: boolean | null;
  missing_items?: unknown;
  note?: string | null;
  created_at?: string | null;
};

const SYSTEM_BACKUP_TABLES: RawTableDefinition[] = [
  { sheetName: "소속대정보", tableName: "organizations", organizationScoped: false },
  { sheetName: "사용자목록", tableName: "user_profiles", organizationScoped: true },
  { sheetName: "대원목록", tableName: "scouts", organizationScoped: true },
  { sheetName: "진급이력", tableName: "scout_rank_histories", organizationScoped: true },
  { sheetName: "기능장기록", tableName: "scout_badges", organizationScoped: true },
  { sheetName: "프로그램이수", tableName: "program_completions", organizationScoped: true },
  { sheetName: "집회목록", tableName: "meetings", organizationScoped: true },
  { sheetName: "출석기록", tableName: "attendance", organizationScoped: true },
  { sheetName: "진급판정", tableName: "promotion_reviews", organizationScoped: true },
  { sheetName: "기능장진급반영", tableName: "promotion_badge_usages", organizationScoped: true },
  { sheetName: "급위기준", tableName: "ranks", organizationScoped: false },
  { sheetName: "진급요건", tableName: "rank_requirements", organizationScoped: false },
  { sheetName: "필수기능장기준", tableName: "rank_required_badges", organizationScoped: false },
  { sheetName: "기능장목록", tableName: "badges", organizationScoped: false },
  { sheetName: "기능장분류", tableName: "badge_categories", organizationScoped: false },
];

const ATTENDANCE_LABELS: Record<string, string> = {
  present: "출석",
  recognized: "인정출석",
  excused: "인정결석",
  late: "지각",
  early_leave: "조퇴",
  absent: "결석",
  not_entered: "미입력",
};

const SCOUT_STATUS_LABELS: Record<string, string> = {
  active: "활동",
  inactive: "비활동",
  graduated: "졸업",
};

function getStringValue(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function getStatusLabel(status: string) {
  if (status === "active") return "이용중";
  if (status === "suspended" || status === "inactive") return "이용중지";
  if (status === "closed") return "이용종료";
  return status;
}

function formatDate(value: unknown) {
  if (typeof value !== "string" || !value) return "";
  return value.slice(0, 10);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");
}

function getTodayCompact() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${y}${m}${d}_${hh}${mm}`;
}

function normalizeRows(rows: Record<string, unknown>[]) {
  return rows.map((row) => {
    const next: Record<string, unknown> = {};
    Object.entries(row).forEach(([key, value]) => {
      if (value && typeof value === "object") {
        next[key] = JSON.stringify(value);
      } else {
        next[key] = value ?? "";
      }
    });
    return next;
  });
}

function setSheetLayout(sheet: XLSX.WorkSheet, widths: number[], freeze = true) {
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  if (freeze) {
    (sheet as XLSX.WorkSheet & { ["!freeze"]?: unknown })["!freeze"] = {
      xSplit: 0,
      ySplit: 1,
      topLeftCell: "A2",
      activePane: "bottomLeft",
      state: "frozen",
    };
  }
  if (sheet["!ref"]) {
    sheet["!autofilter"] = { ref: sheet["!ref"] };
  }
}

function appendJsonSheet(
  workbook: XLSX.WorkBook,
  sheetName: string,
  rows: Record<string, unknown>[],
  widths: number[],
) {
  const sheet =
    rows.length > 0
      ? XLSX.utils.json_to_sheet(rows)
      : XLSX.utils.aoa_to_sheet([["등록된 데이터가 없습니다."]]);
  setSheetLayout(sheet, widths, rows.length > 0);
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName.slice(0, 31));
}

export default function OrganizationBackupsPage() {
  const [organizations, setOrganizations] = useState<OrganizationItem[]>([]);
  const [logs, setLogs] = useState<BackupLog[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [generatingType, setGeneratingType] = useState<"" | "business" | "system">("");
  const [processingLogId, setProcessingLogId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    const [organizationResult, logResult] = await Promise.all([
      supabase
        .from("organizations")
        .select("*")
        .is("deleted_at", null)
        .order("name", { ascending: true }),
      supabase
        .from("organization_backup_logs")
        .select("id, organization_id, backup_type, file_name, row_count, status, created_by, created_at, downloaded_at, provided_at, note")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    if (organizationResult.error) {
      setErrorMessage(`소속대 목록을 불러오지 못했습니다. ${organizationResult.error.message}`);
      setLoading(false);
      return;
    }

    if (logResult.error) {
      setErrorMessage(
        `백업 이력을 불러오지 못했습니다. 먼저 제공된 SQL을 실행해야 합니다. ${logResult.error.message}`,
      );
      setLoading(false);
      return;
    }

    const organizationRows = ((organizationResult.data ?? []) as unknown as Record<string, unknown>[])
      .map((row) => {
        const id = getStringValue(row, ["id"]) ?? "";
        const status = getStringValue(row, ["status"]) ?? "active";
        return {
          id,
          name: getStringValue(row, ["name"]) ?? "소속대명 미등록",
          unitNumber: getStringValue(row, ["unit_number"]),
          status,
          statusLabel: getStatusLabel(status),
        };
      })
      .filter((row) => row.id);

    setOrganizations(organizationRows);
    setLogs((logResult.data ?? []) as unknown as BackupLog[]);
    setSelectedOrganizationId((current) => current || organizationRows[0]?.id || "");
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedOrganization =
    organizations.find((organization) => organization.id === selectedOrganizationId) ?? null;

  const filteredOrganizations = useMemo(() => {
    const clean = keyword.trim().toLowerCase();
    if (!clean) return organizations;
    return organizations.filter((organization) =>
      [organization.name, organization.unitNumber, organization.statusLabel]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(clean),
    );
  }, [keyword, organizations]);

  const selectedLogs = useMemo(
    () => logs.filter((log) => log.organization_id === selectedOrganizationId),
    [logs, selectedOrganizationId],
  );

  const businessLogs = selectedLogs.filter((log) => log.backup_type === "business_excel");
  const latestBusinessLog = businessLogs[0] ?? null;
  const latestProvidedBusinessLog =
    businessLogs.find((log) => Boolean(log.provided_at)) ?? null;

  const fetchRows = async (
    tableName: string,
    organizationId: string,
    organizationScoped: boolean,
  ): Promise<Record<string, unknown>[]> => {
    let query = supabase.from(tableName).select("*");

    if (tableName === "organizations") {
      query = query.eq("id", organizationId);
    } else if (organizationScoped) {
      query = query.eq("organization_id", organizationId);
    }

    const { data, error } = await query;
    if (error) throw new Error(`${tableName} 조회 실패: ${error.message}`);
    return (data ?? []) as unknown as Record<string, unknown>[];
  };

  const saveDownloadLog = async ({
    backupType,
    fileName,
    rowCount,
    note,
  }: {
    backupType: "business_excel" | "system_excel";
    fileName: string;
    rowCount: number;
    note: string;
  }) => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) throw new Error("로그인 사용자 정보를 확인하지 못했습니다.");

    const { error } = await supabase.from("organization_backup_logs").insert({
      organization_id: selectedOrganizationId,
      backup_type: backupType,
      file_name: fileName,
      row_count: rowCount,
      status: "downloaded",
      created_by: user.id,
      downloaded_at: new Date().toISOString(),
      note,
    });

    if (error) throw new Error(`백업 이력 저장 실패: ${error.message}`);
  };

  const loadBusinessData = async () => {
    const organizationId = selectedOrganizationId;

    const [
      scouts,
      ranks,
      rankHistories,
      badges,
      badgeCategories,
      scoutBadges,
      programs,
      meetings,
      attendance,
      reviews,
    ] = await Promise.all([
      fetchRows("scouts", organizationId, true),
      fetchRows("ranks", organizationId, false),
      fetchRows("scout_rank_histories", organizationId, true),
      fetchRows("badges", organizationId, false),
      fetchRows("badge_categories", organizationId, false),
      fetchRows("scout_badges", organizationId, true),
      fetchRows("program_completions", organizationId, true),
      fetchRows("meetings", organizationId, true),
      fetchRows("attendance", organizationId, true),
      fetchRows("promotion_reviews", organizationId, true),
    ]);

    return {
      scouts: scouts as ScoutRow[],
      ranks: ranks as RankRow[],
      rankHistories: rankHistories as RankHistoryRow[],
      badges: badges as BadgeRow[],
      badgeCategories: badgeCategories as BadgeCategoryRow[],
      scoutBadges: scoutBadges as ScoutBadgeRow[],
      programs: programs as ProgramRow[],
      meetings: meetings as MeetingRow[],
      attendance: attendance as AttendanceRow[],
      reviews: reviews as PromotionReviewRow[],
    };
  };

  const handleCreateBusinessBackup = async () => {
    if (!selectedOrganization) {
      setErrorMessage("백업할 소속대를 선택하세요.");
      return;
    }

    if (
      !window.confirm(
        `${selectedOrganization.name}에서 Excel로 계속 관리할 수 있는 업무용 인수인계 파일을 생성하시겠습니까?`,
      )
    ) {
      return;
    }

    setGeneratingType("business");
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const data = await loadBusinessData();
      const workbook = XLSX.utils.book_new();

      const rankMap = new Map(data.ranks.map((rank) => [rank.id, rank]));
      const scoutMap = new Map(data.scouts.map((scout) => [scout.id, scout]));
      const badgeMap = new Map(data.badges.map((badge) => [badge.id, badge]));
      const categoryMap = new Map(
        data.badgeCategories.map((category) => [category.id, category]),
      );
      const meetingMap = new Map(data.meetings.map((meeting) => [meeting.id, meeting]));

      const rankHistoriesByScout = new Map<string, RankHistoryRow[]>();
      data.rankHistories.forEach((row) => {
        const current = rankHistoriesByScout.get(row.scout_id) ?? [];
        current.push(row);
        rankHistoriesByScout.set(row.scout_id, current);
      });

      const scoutBadgesByScout = new Map<string, ScoutBadgeRow[]>();
      data.scoutBadges.forEach((row) => {
        const current = scoutBadgesByScout.get(row.scout_id) ?? [];
        current.push(row);
        scoutBadgesByScout.set(row.scout_id, current);
      });

      const programsByScout = new Map<string, ProgramRow[]>();
      data.programs.forEach((row) => {
        const current = programsByScout.get(row.scout_id) ?? [];
        current.push(row);
        programsByScout.set(row.scout_id, current);
      });

      const attendanceByScout = new Map<string, AttendanceRow[]>();
      data.attendance.forEach((row) => {
        const current = attendanceByScout.get(row.scout_id) ?? [];
        current.push(row);
        attendanceByScout.set(row.scout_id, current);
      });

      const reviewsByScout = new Map<string, PromotionReviewRow[]>();
      data.reviews.forEach((row) => {
        const current = reviewsByScout.get(row.scout_id) ?? [];
        current.push(row);
        reviewsByScout.set(row.scout_id, current);
      });

      const guideRows = [
        ["구분", "내용"],
        ["파일 용도", "시스템 사용 종료 후 소속대가 Excel로 계속 관리하기 위한 업무용 인수인계 파일"],
        ["소속대", selectedOrganization.name],
        ["대번호", selectedOrganization.unitNumber ?? ""],
        ["생성일시", new Date().toISOString()],
        ["주요 시트", "대원 통합현황, 진급 관리대장, 기능장 관리대장, 프로그램 이수대장, 출석 관리대장"],
        ["사용 방법", "각 시트의 첫 행 필터를 사용하여 대원·급위·상태별로 조회합니다."],
        ["주의", "이 파일은 생성 시점의 현황입니다. 이후 변경사항은 Excel에서 직접 기록해야 합니다."],
      ];
      const guideSheet = XLSX.utils.aoa_to_sheet(guideRows);
      guideSheet["!cols"] = [{ wch: 18 }, { wch: 90 }];
      XLSX.utils.book_append_sheet(workbook, guideSheet, "사용안내");

      const rankNames = [...data.ranks]
        .sort((a, b) => Number(a.sort_order ?? 999) - Number(b.sort_order ?? 999))
        .map((rank) => rank.rank_name ?? "")
        .filter(Boolean);

      const integratedRows = data.scouts.map((scout) => {
        const histories = [...(rankHistoriesByScout.get(scout.id) ?? [])].sort(
          (a, b) => String(a.approved_at ?? "").localeCompare(String(b.approved_at ?? "")),
        );
        const scoutBadgeRows = scoutBadgesByScout.get(scout.id) ?? [];
        const programRows = programsByScout.get(scout.id) ?? [];
        const attendanceRows = attendanceByScout.get(scout.id) ?? [];
        const reviews = [...(reviewsByScout.get(scout.id) ?? [])].sort((a, b) =>
          String(b.review_date ?? b.created_at ?? "").localeCompare(
            String(a.review_date ?? a.created_at ?? ""),
          ),
        );
        const latestReview = reviews[0] ?? null;

        const rankDates: Record<string, string> = {};
        histories.forEach((history) => {
          const rankName = rankMap.get(history.rank_id)?.rank_name ?? "";
          if (rankName && !rankDates[rankName]) rankDates[rankName] = formatDate(history.approved_at);
        });

        const enteredAttendance = attendanceRows.filter(
          (row) => row.status && row.status !== "not_entered",
        );
        const recognizedAttendance = enteredAttendance.filter((row) =>
          ["present", "recognized", "excused", "late", "early_leave"].includes(
            String(row.status),
          ),
        );
        const attendanceRate =
          enteredAttendance.length > 0
            ? Math.round((recognizedAttendance.length / enteredAttendance.length) * 1000) / 10
            : "";

        const wsep = programRows.find((row) => row.program_type === "WSEP");
        const mop = programRows.find((row) => row.program_type === "MoP");
        const generalBadgeCount = scoutBadgeRows.filter(
          (row) => badgeMap.get(row.badge_id)?.is_general_badge,
        ).length;
        const requiredBadgeCount = scoutBadgeRows.filter(
          (row) => badgeMap.get(row.badge_id)?.is_required_badge,
        ).length;

        const base: Record<string, unknown> = {
          대원번호: scout.member_no ?? "",
          성명: scout.name ?? "",
          학교: scout.school_name ?? "",
          학년: scout.grade ?? "",
          상태: SCOUT_STATUS_LABELS[String(scout.status ?? "")] ?? scout.status ?? "",
          입단일: formatDate(scout.joined_at),
          현재급위: rankMap.get(String(scout.current_rank_id ?? ""))?.rank_name ?? "",
          "필수 기능장 보유": requiredBadgeCount,
          "일반 기능장 보유": generalBadgeCount,
          출석률: attendanceRate === "" ? "" : `${attendanceRate}%`,
          "WSEP 이수일": formatDate(wsep?.completed_at),
          "WSEP 승인일": formatDate(wsep?.approved_at),
          "WSEP 수료증번호": wsep?.certificate_no ?? "",
          "MoP 이수일": formatDate(mop?.completed_at),
          "MoP 승인일": formatDate(mop?.approved_at),
          "MoP 수료증번호": mop?.certificate_no ?? "",
          "최근 판정일": formatDate(latestReview?.review_date ?? latestReview?.created_at),
          "진급 가능 예정일": formatDate(latestReview?.available_at),
          활동기간: latestReview ? (latestReview.period_passed ? "충족" : "보완 필요") : "미판정",
          필수기능장: latestReview ? (latestReview.required_badges_passed ? "충족" : "보완 필요") : "미판정",
          일반기능장: latestReview ? (latestReview.general_badges_passed ? "충족" : "보완 필요") : "미판정",
          프로그램: latestReview ? (latestReview.program_passed ? "충족" : "보완 필요") : "미판정",
          최종판정: latestReview ? (latestReview.final_passed ? "진급 가능" : "조건 보완") : "미판정",
          부족항목: latestReview?.missing_items
            ? JSON.stringify(latestReview.missing_items)
            : "",
          비고: scout.note ?? "",
        };

        rankNames.forEach((rankName) => {
          base[`${rankName} 인가일`] = rankDates[rankName] ?? "";
        });

        return base;
      });

      appendJsonSheet(
        workbook,
        "대원 통합현황",
        integratedRows,
        [14, 12, 18, 16, 10, 13, 12, ...rankNames.map(() => 14), 14, 14, 11, 14, 14, 18, 14, 14, 18, 14, 14, 14, 14, 14, 14, 28, 24],
      );

      const advancementRows = data.scouts.flatMap((scout) => {
        const histories = [...(rankHistoriesByScout.get(scout.id) ?? [])].sort(
          (a, b) => String(a.approved_at ?? "").localeCompare(String(b.approved_at ?? "")),
        );
        const reviews = [...(reviewsByScout.get(scout.id) ?? [])].sort((a, b) =>
          String(b.review_date ?? b.created_at ?? "").localeCompare(
            String(a.review_date ?? a.created_at ?? ""),
          ),
        );

        const historyRows = histories.map((history) => ({
          대원번호: scout.member_no ?? "",
          성명: scout.name ?? "",
          구분: "진급 인가",
          현재급위: rankMap.get(String(scout.current_rank_id ?? ""))?.rank_name ?? "",
          대상급위: rankMap.get(history.rank_id)?.rank_name ?? "",
          기준일: "",
          진급가능일: "",
          활동기간: "",
          필수기능장: "",
          일반기능장: "",
          프로그램: "",
          출석률: "",
          최종판정: "",
          인가일: formatDate(history.approved_at),
          인가구분: history.approval_type ?? "",
          비고: history.note ?? "",
        }));

        const reviewRows = reviews.map((review) => ({
          대원번호: scout.member_no ?? "",
          성명: scout.name ?? "",
          구분: "진급 판정",
          현재급위: rankMap.get(String(review.from_rank_id ?? ""))?.rank_name ?? "",
          대상급위: rankMap.get(String(review.to_rank_id ?? ""))?.rank_name ?? "",
          기준일: formatDate(review.review_date),
          진급가능일: formatDate(review.available_at),
          활동기간: review.period_passed ? "충족" : "보완 필요",
          필수기능장: review.required_badges_passed ? "충족" : "보완 필요",
          일반기능장: review.general_badges_passed ? "충족" : "보완 필요",
          프로그램: review.program_passed ? "충족" : "보완 필요",
          출석률:
            typeof review.attendance_rate === "number"
              ? `${review.attendance_rate}%`
              : "",
          최종판정: review.final_passed ? "진급 가능" : "조건 보완",
          인가일: "",
          인가구분: "",
          비고: review.note ?? "",
        }));

        return [...historyRows, ...reviewRows];
      });

      appendJsonSheet(
        workbook,
        "진급 관리대장",
        advancementRows,
        [14, 12, 12, 12, 12, 13, 13, 12, 12, 12, 12, 11, 12, 13, 12, 24],
      );

      const badgeRows = data.scoutBadges.map((row) => {
        const scout = scoutMap.get(row.scout_id);
        const badge = badgeMap.get(row.badge_id);
        const category = badge?.category_id
          ? categoryMap.get(badge.category_id)?.name ?? ""
          : "";
        const currentRankName = scout?.current_rank_id
          ? rankMap.get(String(scout.current_rank_id))?.rank_name ?? ""
          : "";

        return {
          대원번호: scout?.member_no ?? "",
          성명: scout?.name ?? "",
          현재급위: currentRankName,
          기능장명: badge?.name ?? "",
          분류: category,
          구분:
            badge?.is_required_badge && badge?.is_general_badge
              ? "필수/일반"
              : badge?.is_required_badge
                ? "필수"
                : badge?.is_general_badge
                  ? "일반"
                  : "기타",
          취득일: formatDate(row.acquired_at),
          인가일: formatDate(row.approved_at),
          지도자: row.instructor_name ?? "",
          지도자확인: row.leader_confirmed ? "확인" : "미확인",
          비고: row.note ?? "",
        };
      });

      appendJsonSheet(
        workbook,
        "기능장 관리대장",
        badgeRows,
        [14, 12, 12, 18, 16, 12, 13, 13, 14, 12, 26],
      );

      const programRows = data.programs.map((row) => {
        const scout = scoutMap.get(row.scout_id);
        return {
          대원번호: scout?.member_no ?? "",
          성명: scout?.name ?? "",
          프로그램: row.program_type ?? "",
          이수일: formatDate(row.completed_at),
          승인일: formatDate(row.approved_at),
          수료증번호: row.certificate_no ?? "",
          비고: row.note ?? "",
        };
      });

      appendJsonSheet(
        workbook,
        "프로그램 이수대장",
        programRows,
        [14, 12, 12, 13, 13, 20, 28],
      );

      const attendanceRows = data.attendance.map((row) => {
        const scout = scoutMap.get(row.scout_id);
        const meeting = meetingMap.get(row.meeting_id);
        return {
          집회일: formatDate(meeting?.meeting_date),
          집회명: meeting?.title ?? "",
          집회구분: meeting?.meeting_type ?? "",
          대원번호: scout?.member_no ?? "",
          성명: scout?.name ?? "",
          출석상태:
            ATTENDANCE_LABELS[String(row.status ?? "")] ?? row.status ?? "",
          비고: row.note ?? "",
        };
      });

      appendJsonSheet(
        workbook,
        "출석 관리대장",
        attendanceRows,
        [13, 24, 14, 14, 12, 12, 26],
      );

      const fileName = `${sanitizeFileName(selectedOrganization.name)}_업무용_대원진급관리대장_${getTodayCompact()}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      const totalRows =
        integratedRows.length +
        advancementRows.length +
        badgeRows.length +
        programRows.length +
        attendanceRows.length;

      await saveDownloadLog({
        backupType: "business_excel",
        fileName,
        rowCount: totalRows,
        note: "소속대 Excel 계속 관리용 업무 인수인계 파일",
      });

      setSuccessMessage(`${selectedOrganization.name} 업무용 Excel을 생성하고 다운로드했습니다.`);
      await loadData();
    } catch (error) {
      console.error("업무용 Excel 생성 오류:", error);
      setErrorMessage(
        error instanceof Error ? error.message : "업무용 Excel을 생성하지 못했습니다.",
      );
    } finally {
      setGeneratingType("");
    }
  };

  const handleCreateSystemBackup = async () => {
    if (!selectedOrganization) {
      setErrorMessage("백업할 소속대를 선택하세요.");
      return;
    }

    if (
      !window.confirm(
        `${selectedOrganization.name}의 시스템 원본 데이터를 Excel로 생성하시겠습니까?`,
      )
    ) {
      return;
    }

    setGeneratingType("system");
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const workbook = XLSX.utils.book_new();
      let totalRows = 0;

      const guideRows = [
        ["항목", "내용"],
        ["백업 소속대", selectedOrganization.name],
        ["대번호", selectedOrganization.unitNumber ?? ""],
        ["생성일시", new Date().toISOString()],
        ["백업 형식", "시스템 원본 테이블 백업"],
        ["용도", "관리자 보관·검증·향후 복원 개발용"],
        ["주의", "소속대가 일상 업무에 직접 사용하는 파일은 '업무용 Excel'입니다."],
      ];
      const guideSheet = XLSX.utils.aoa_to_sheet(guideRows);
      guideSheet["!cols"] = [{ wch: 18 }, { wch: 85 }];
      XLSX.utils.book_append_sheet(workbook, guideSheet, "백업안내");

      for (const definition of SYSTEM_BACKUP_TABLES) {
        const rows = await fetchRows(
          definition.tableName,
          selectedOrganization.id,
          definition.organizationScoped,
        );
        totalRows += rows.length;

        appendJsonSheet(
          workbook,
          definition.sheetName,
          normalizeRows(rows),
          Array.from({ length: 20 }, () => 18),
        );
      }

      const fileName = `${sanitizeFileName(selectedOrganization.name)}_시스템원본백업_${getTodayCompact()}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      await saveDownloadLog({
        backupType: "system_excel",
        fileName,
        rowCount: totalRows,
        note: "관리자 보관용 시스템 원본 백업",
      });

      setSuccessMessage(`${selectedOrganization.name} 시스템 원본 백업을 생성하고 다운로드했습니다.`);
      await loadData();
    } catch (error) {
      console.error("시스템 원본 백업 생성 오류:", error);
      setErrorMessage(
        error instanceof Error ? error.message : "시스템 원본 백업을 생성하지 못했습니다.",
      );
    } finally {
      setGeneratingType("");
    }
  };

  const handleMarkProvided = async (log: BackupLog) => {
    if (log.backup_type !== "business_excel") {
      setErrorMessage("이용종료 요건은 업무용 Excel 제공 완료 기록으로 확인합니다.");
      return;
    }

    if (
      !window.confirm(
        [
          `${selectedOrganization?.name ?? "선택 소속대"}에 업무용 Excel을 전달한 것으로 처리합니다.`,
          "",
          "처리 후 해당 소속대는 이용종료 요건을 충족합니다.",
          "",
          "계속 진행하시겠습니까?",
        ].join("\n"),
      )
    ) {
      return;
    }

    setProcessingLogId(log.id);
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase
      .from("organization_backup_logs")
      .update({
        status: "provided",
        provided_at: new Date().toISOString(),
      })
      .eq("id", log.id)
      .eq("backup_type", "business_excel");

    if (error) {
      setErrorMessage(`백업 제공 완료 처리에 실패했습니다. ${error.message}`);
      setProcessingLogId("");
      return;
    }

    setSuccessMessage("업무용 Excel 제공 완료로 처리했습니다.");
    await loadData();
    setProcessingLogId("");
  };

  return (
    <div>
      <header style={pageHeaderStyle}>
        <div>
          <span style={roleBadgeStyle}>최고관리자</span>
          <h1 style={titleStyle}>소속대 백업센터</h1>
          <p style={descriptionStyle}>
            소속대가 Excel로 계속 업무를 수행할 수 있는 인수인계 파일과 시스템 원본 백업을 구분하여 제공합니다.
          </p>
        </div>
        <button type="button" style={secondaryButtonStyle} onClick={() => void loadData()}>
          새로고침
        </button>
      </header>

      <section style={noticeStyle}>
        <strong>제공 기준</strong>
        <span>
          이용종료 전에는 대원 중심으로 정리된 ‘업무용 Excel’을 담당자에게 전달하고 제공 완료 처리해야 합니다.
          시스템 원본 백업은 관리자 보관용입니다.
        </span>
      </section>

      {errorMessage && <div style={errorStyle}>{errorMessage}</div>}
      {successMessage && <div style={successStyle}>{successMessage}</div>}

      {loading ? (
        <div style={emptyStyle}>백업센터 정보를 불러오는 중입니다...</div>
      ) : (
        <div style={workspaceStyle}>
          <section style={listPanelStyle}>
            <div style={listHeaderStyle}>
              <div>
                <h2 style={sectionTitleStyle}>소속대 선택</h2>
                <p style={sectionDescriptionStyle}>{organizations.length}개 소속대</p>
              </div>
            </div>
            <input
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="소속대명 또는 대번호 검색"
              style={searchStyle}
            />
            <div style={organizationListStyle}>
              {filteredOrganizations.map((organization) => {
                const selected = organization.id === selectedOrganizationId;
                const organizationLogs = logs.filter(
                  (log) => log.organization_id === organization.id,
                );
                const provided = organizationLogs.some(
                  (log) =>
                    log.backup_type === "business_excel" &&
                    Boolean(log.provided_at),
                );
                const hasBusiness = organizationLogs.some(
                  (log) => log.backup_type === "business_excel",
                );

                return (
                  <button
                    key={organization.id}
                    type="button"
                    style={{
                      ...organizationButtonStyle,
                      ...(selected ? organizationButtonSelectedStyle : {}),
                    }}
                    onClick={() => setSelectedOrganizationId(organization.id)}
                  >
                    <div style={organizationButtonTopStyle}>
                      <strong>{organization.name}</strong>
                      <span style={statusBadgeStyle(organization.status)}>
                        {organization.statusLabel}
                      </span>
                    </div>
                    <span style={organizationMetaStyle}>
                      대번호 {organization.unitNumber ?? "미등록"} ·{" "}
                      {provided
                        ? "업무용 Excel 제공 완료"
                        : hasBusiness
                          ? "업무용 Excel 생성됨"
                          : "업무용 Excel 없음"}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section style={detailPanelStyle}>
            {!selectedOrganization ? (
              <div style={emptyStyle}>관리할 소속대를 선택하세요.</div>
            ) : (
              <>
                <div style={detailHeaderStyle}>
                  <div>
                    <h2 style={detailTitleStyle}>{selectedOrganization.name}</h2>
                    <p style={sectionDescriptionStyle}>
                      대번호 {selectedOrganization.unitNumber ?? "미등록"} ·{" "}
                      {selectedOrganization.statusLabel}
                    </p>
                  </div>
                </div>

                <div style={exportGridStyle}>
                  <section style={businessCardStyle}>
                    <div>
                      <span style={recommendedBadgeStyle}>이용종료 필수</span>
                      <h3 style={exportTitleStyle}>업무용 Excel</h3>
                      <p style={exportDescriptionStyle}>
                        대원 통합현황, 진급, 기능장, 프로그램, 출석을 사람이 읽고 계속 수정할 수 있는 관리대장으로 제공합니다.
                      </p>
                    </div>
                    <button
                      type="button"
                      style={primaryButtonStyle}
                      onClick={() => void handleCreateBusinessBackup()}
                      disabled={generatingType !== ""}
                    >
                      {generatingType === "business"
                        ? "업무용 파일 생성 중..."
                        : "업무용 Excel 다운로드"}
                    </button>
                  </section>

                  <section style={systemCardStyle}>
                    <div>
                      <span style={systemBadgeStyle}>관리자 보관용</span>
                      <h3 style={exportTitleStyle}>시스템 원본 백업</h3>
                      <p style={exportDescriptionStyle}>
                        내부 ID와 원본 테이블 구조를 포함하며 향후 검증·복원 개발에 사용합니다. 소속대 일상 업무용은 아닙니다.
                      </p>
                    </div>
                    <button
                      type="button"
                      style={secondaryExportButtonStyle}
                      onClick={() => void handleCreateSystemBackup()}
                      disabled={generatingType !== ""}
                    >
                      {generatingType === "system"
                        ? "원본 백업 생성 중..."
                        : "시스템 원본 백업"}
                    </button>
                  </section>
                </div>

                <div style={summaryGridStyle}>
                  <SummaryItem label="전체 백업 이력" value={`${selectedLogs.length}건`} />
                  <SummaryItem
                    label="최근 업무용 파일"
                    value={
                      latestBusinessLog
                        ? formatDateTime(latestBusinessLog.created_at)
                        : "없음"
                    }
                  />
                  <SummaryItem
                    label="업무용 파일 제공"
                    value={latestProvidedBusinessLog ? "완료" : "미완료"}
                  />
                </div>

                <section style={guideStyle}>
                  <strong>이용종료 처리 기준</strong>
                  <span>
                    업무용 Excel을 소속대 담당자에게 전달한 뒤 ‘제공 완료’로 처리해야 소속대 관리에서 이용종료할 수 있습니다.
                  </span>
                </section>

                <div style={tableWrapStyle}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>생성일</th>
                        <th style={thCenterStyle}>구분</th>
                        <th style={thStyle}>파일명</th>
                        <th style={thCenterStyle}>데이터</th>
                        <th style={thCenterStyle}>상태</th>
                        <th style={thCenterStyle}>제공일</th>
                        <th style={thCenterStyle}>관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedLogs.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={emptyTableStyle}>
                            생성된 백업 이력이 없습니다.
                          </td>
                        </tr>
                      ) : (
                        selectedLogs.map((log) => (
                          <tr key={log.id}>
                            <td style={tdStyle}>{formatDateTime(log.created_at)}</td>
                            <td style={tdCenterStyle}>
                              {log.backup_type === "business_excel"
                                ? "업무용"
                                : log.backup_type === "system_excel"
                                  ? "시스템 원본"
                                  : log.backup_type}
                            </td>
                            <td style={tdStyle}>{log.file_name}</td>
                            <td style={tdCenterStyle}>{log.row_count}건</td>
                            <td style={tdCenterStyle}>
                              {log.provided_at
                                ? "제공 완료"
                                : log.downloaded_at
                                  ? "다운로드 완료"
                                  : "생성 완료"}
                            </td>
                            <td style={tdCenterStyle}>{formatDateTime(log.provided_at)}</td>
                            <td style={tdCenterStyle}>
                              {log.backup_type === "business_excel" &&
                              !log.provided_at ? (
                                <button
                                  type="button"
                                  style={smallButtonStyle}
                                  disabled={processingLogId === log.id}
                                  onClick={() => void handleMarkProvided(log)}
                                >
                                  {processingLogId === log.id ? "처리 중..." : "제공 완료"}
                                </button>
                              ) : (
                                "-"
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={summaryItemStyle}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const pageHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "20px", marginBottom: "20px" };
const roleBadgeStyle: CSSProperties = { display: "inline-flex", padding: "6px 10px", borderRadius: "999px", backgroundColor: "#dbeafe", color: "#1d4ed8", fontSize: "13px", fontWeight: 900, marginBottom: "10px" };
const titleStyle: CSSProperties = { margin: 0, color: "#0f172a", fontSize: "30px", fontWeight: 900 };
const descriptionStyle: CSSProperties = { margin: "8px 0 0", color: "#64748b", fontSize: "15px", lineHeight: 1.6 };
const secondaryButtonStyle: CSSProperties = { minHeight: "40px", padding: "0 14px", border: "1px solid #cbd5e1", borderRadius: "9px", backgroundColor: "#fff", color: "#334155", fontWeight: 800, cursor: "pointer" };
const noticeStyle: CSSProperties = { display: "flex", gap: "10px", padding: "13px 15px", marginBottom: "18px", border: "1px solid #bfdbfe", borderRadius: "12px", backgroundColor: "#eff6ff", color: "#1e3a8a", fontSize: "14px", lineHeight: 1.5 };
const errorStyle: CSSProperties = { padding: "13px 15px", marginBottom: "16px", border: "1px solid #fecaca", borderRadius: "10px", backgroundColor: "#fef2f2", color: "#b91c1c" };
const successStyle: CSSProperties = { padding: "13px 15px", marginBottom: "16px", border: "1px solid #a7f3d0", borderRadius: "10px", backgroundColor: "#ecfdf5", color: "#047857" };
const workspaceStyle: CSSProperties = { display: "grid", gridTemplateColumns: "320px minmax(0, 1fr)", gap: "18px", alignItems: "start" };
const listPanelStyle: CSSProperties = { border: "1px solid #e2e8f0", borderRadius: "14px", backgroundColor: "#fff", overflow: "hidden" };
const listHeaderStyle: CSSProperties = { padding: "16px", borderBottom: "1px solid #e2e8f0" };
const sectionTitleStyle: CSSProperties = { margin: 0, color: "#0f172a", fontSize: "19px", fontWeight: 900 };
const sectionDescriptionStyle: CSSProperties = { margin: "5px 0 0", color: "#64748b", fontSize: "13px", lineHeight: 1.5 };
const searchStyle: CSSProperties = { width: "calc(100% - 24px)", height: "40px", margin: "12px", padding: "0 12px", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: "9px", fontSize: "14px" };
const organizationListStyle: CSSProperties = { maxHeight: "calc(100vh - 300px)", overflowY: "auto", padding: "0 8px 8px" };
const organizationButtonStyle: CSSProperties = { width: "100%", padding: "12px", marginBottom: "7px", border: "1px solid transparent", borderRadius: "10px", backgroundColor: "#fff", textAlign: "left", fontFamily: "inherit", cursor: "pointer" };
const organizationButtonSelectedStyle: CSSProperties = { border: "1px solid #2563eb", backgroundColor: "#eff6ff" };
const organizationButtonTopStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center", color: "#0f172a" };
const organizationMetaStyle: CSSProperties = { display: "block", marginTop: "5px", color: "#64748b", fontSize: "12px" };
const detailPanelStyle: CSSProperties = { minWidth: 0, padding: "20px", border: "1px solid #e2e8f0", borderRadius: "14px", backgroundColor: "#fff" };
const detailHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", marginBottom: "16px" };
const detailTitleStyle: CSSProperties = { margin: 0, color: "#0f172a", fontSize: "23px", fontWeight: 900 };
const exportGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px", marginBottom: "14px" };
const businessCardStyle: CSSProperties = { minHeight: "210px", padding: "16px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "14px", border: "1px solid #93c5fd", borderRadius: "12px", backgroundColor: "#eff6ff" };
const systemCardStyle: CSSProperties = { ...businessCardStyle, border: "1px solid #cbd5e1", backgroundColor: "#f8fafc" };
const recommendedBadgeStyle: CSSProperties = { display: "inline-flex", padding: "4px 8px", borderRadius: "999px", backgroundColor: "#dbeafe", color: "#1d4ed8", fontSize: "11px", fontWeight: 900 };
const systemBadgeStyle: CSSProperties = { ...recommendedBadgeStyle, backgroundColor: "#e2e8f0", color: "#475569" };
const exportTitleStyle: CSSProperties = { margin: "10px 0 0", color: "#0f172a", fontSize: "19px", fontWeight: 900 };
const exportDescriptionStyle: CSSProperties = { margin: "7px 0 0", color: "#475569", fontSize: "13px", lineHeight: 1.55 };
const primaryButtonStyle: CSSProperties = { minHeight: "42px", padding: "0 16px", border: "none", borderRadius: "9px", backgroundColor: "#2563eb", color: "#fff", fontWeight: 900, cursor: "pointer" };
const secondaryExportButtonStyle: CSSProperties = { ...primaryButtonStyle, border: "1px solid #cbd5e1", backgroundColor: "#fff", color: "#334155" };
const summaryGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px", marginBottom: "14px" };
const summaryItemStyle: CSSProperties = { padding: "12px", border: "1px solid #e2e8f0", borderRadius: "10px", backgroundColor: "#f8fafc", display: "grid", gap: "5px", color: "#64748b", fontSize: "13px" };
const guideStyle: CSSProperties = { display: "grid", gap: "5px", padding: "13px 14px", marginBottom: "16px", border: "1px solid #fde68a", borderRadius: "10px", backgroundColor: "#fffbeb", color: "#92400e", fontSize: "13px", lineHeight: 1.5 };
const tableWrapStyle: CSSProperties = { overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "11px" };
const tableStyle: CSSProperties = { width: "100%", minWidth: "920px", borderCollapse: "collapse", fontSize: "13px" };
const thStyle: CSSProperties = { padding: "11px 12px", borderBottom: "1px solid #e2e8f0", backgroundColor: "#f8fafc", color: "#334155", textAlign: "left", fontWeight: 900, whiteSpace: "nowrap" };
const thCenterStyle: CSSProperties = { ...thStyle, textAlign: "center" };
const tdStyle: CSSProperties = { padding: "11px 12px", borderBottom: "1px solid #f1f5f9", color: "#475569", verticalAlign: "top" };
const tdCenterStyle: CSSProperties = { ...tdStyle, textAlign: "center", whiteSpace: "nowrap" };
const emptyTableStyle: CSSProperties = { padding: "28px", color: "#64748b", textAlign: "center" };
const smallButtonStyle: CSSProperties = { minHeight: "32px", padding: "0 10px", border: "1px solid #93c5fd", borderRadius: "7px", backgroundColor: "#eff6ff", color: "#1d4ed8", fontWeight: 900, cursor: "pointer" };
const emptyStyle: CSSProperties = { padding: "40px 20px", border: "1px dashed #cbd5e1", borderRadius: "12px", backgroundColor: "#f8fafc", color: "#64748b", textAlign: "center" };
const statusBadgeStyle = (status: string): CSSProperties => ({ display: "inline-flex", padding: "4px 8px", borderRadius: "999px", backgroundColor: status === "active" ? "#dcfce7" : status === "closed" ? "#e2e8f0" : "#fef3c7", color: status === "active" ? "#166534" : status === "closed" ? "#334155" : "#92400e", fontSize: "11px", fontWeight: 900, whiteSpace: "nowrap" });
