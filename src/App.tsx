import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";

import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import PendingApprovalPage from "./pages/PendingApprovalPage";
import UnauthorizedPage from "./pages/UnauthorizedPage";
import SignupRequestsPage from "./pages/SignupRequestsPage";
import OrganizationsPage from "./pages/OrganizationsPage";
import OrganizationBackupsPage from "./pages/OrganizationBackupsPage";
import ScoutsPage from "./pages/ScoutsPage";
import ScoutIntegratedPage from "./pages/ScoutIntegratedPage";
import AdvancementsPage from "./pages/AdvancementsPage";
import MeritBadgesPage from "./pages/MeritBadgesPage";
import ProgramCompletionsPage from "./pages/ProgramCompletionsPage";
import MeetingsPage from "./pages/MeetingsPage";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/SettingsPage";

import ApprovedRoute from "./routes/ApprovedRoute";
import SuperAdminRoute from "./routes/SuperAdminRoute";

import { supabase } from "./lib/supabase";

type UserRole = "super_admin" | "org_admin" | "leader" | "viewer";
type OrganizationStatus = "active" | "suspended" | "closed" | "inactive" | string;

type OrganizationInfo = {
  id: string;
  name: string;
  unitNumber: string | null;
  logoUrl: string | null;
  logoAvailable: boolean;
  setupComplete: boolean;
  status: OrganizationStatus;
  statusLabel: string;
};

type MenuItem = {
  to: string;
  label: string;
  description: string;
  allowedRoles: UserRole[];
};

type ScoutRow = {
  id: string;
  organization_id?: string | null;
  name: string;
  member_no: string | null;
  school_name: string | null;
  grade: string | null;
  joined_at: string;
  current_rank_id: string | null;
  status?: string | null;
};

type RankRow = {
  id: string;
  rank_code: string;
  rank_name: string;
  sort_order: number;
};

type PromotionReviewRow = {
  id: string;
  scout_id: string;
  to_rank_id: string;
  review_date: string;
  base_date: string | null;
  available_at: string | null;
  required_months: number | null;
  days_remaining: number | null;
  period_passed: boolean;
  required_badges_passed: boolean;
  general_badges_passed: boolean;
  program_passed: boolean;
  final_passed: boolean;
  missing_items: unknown;
  created_at: string;
};

type RankHistoryRow = {
  id: string;
  scout_id: string;
  rank_id: string;
  approved_at: string;
  approval_type: string;
  created_at: string;
};

type ScoutBadgeRow = {
  id: string;
  scout_id: string;
  badge_id: string;
  acquired_at: string;
  approved_at: string | null;
  created_at: string;
};

type MeetingRow = {
  id: string;
  title: string;
  meeting_date: string;
  meeting_type: string;
  is_attendance_target: boolean;
  created_at: string;
};

type AttendanceRow = {
  id: string;
  meeting_id: string;
  status: string;
};

type RankCountItem = {
  rankId: string | null;
  rankName: string;
  count: number;
  sortOrder: number;
};

type DashboardIssueType = "period" | "badge" | "program";
type DashboardOverviewType = "total" | "active" | "promotionPossible" | "notReviewed";

type DashboardOverviewItem = {
  id: string;
  scoutName: string;
  memberNo: string;
  schoolGrade: string;
  currentRankName: string;
  statusLabel: string;
  message: string;
};

type DashboardIssueItem = {
  id: string;
  scoutName: string;
  currentRankName: string;
  targetRankName: string;
  reviewDate: string;
  message: string;
};

type RecentRankApprovalItem = {
  id: string;
  scoutName: string;
  rankName: string;
  approvedAt: string;
  approvalType: string;
};

type RecentBadgeApprovalItem = {
  id: string;
  scoutName: string;
  badgeName: string;
  acquiredAt: string;
  approvedAt: string | null;
};

type RecentMeetingItem = {
  id: string;
  title: string;
  meetingDate: string;
  meetingType: string;
  isAttendanceTarget: boolean;
  attendanceTotal: number;
  attendanceEntered: number;
  attendancePresent: number;
};

type DashboardStats = {
  totalScouts: number;
  activeScouts: number;
  inactiveScouts: number;
  graduatedScouts: number;
  rankCounts: RankCountItem[];
  promotionPossible: number;
  periodShortage: number;
  badgeShortage: number;
  programShortage: number;
  totalScoutItems: DashboardOverviewItem[];
  activeScoutItems: DashboardOverviewItem[];
  promotionPossibleItems: DashboardOverviewItem[];
  notReviewedScoutItems: DashboardOverviewItem[];
  periodShortageItems: DashboardIssueItem[];
  badgeShortageItems: DashboardIssueItem[];
  programShortageItems: DashboardIssueItem[];
  reviewedScouts: number;
  notReviewedScouts: number;
  recentRankApprovals: RecentRankApprovalItem[];
  recentBadgeApprovals: RecentBadgeApprovalItem[];
  recentMeetings: RecentMeetingItem[];
  scoutStatusAvailable: boolean;
  badgeNameAvailable: boolean;
};

type AdminProfileItem = {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  role: UserRole | "unknown";
  organizationId: string | null;
  organizationName: string;
  status: string;
  statusLabel: string;
  createdAt: string | null;
};

type AdminOrganizationItem = {
  id: string;
  name: string;
  unitNumber: string | null;
  createdAt: string | null;
  setupComplete: boolean;
  status: OrganizationStatus;
  statusLabel: string;
  adminCount: number;
  leaderCount: number;
  viewerCount: number;
  activeScoutCount: number;
  totalScoutCount: number;
};

type SuperAdminStats = {
  operations: DashboardStats;
  organizations: AdminOrganizationItem[];
  profiles: AdminProfileItem[];
  pendingRequests: AdminProfileItem[];
  approvedProfiles: AdminProfileItem[];
  rejectedProfiles: AdminProfileItem[];
  suspendedProfiles: AdminProfileItem[];
  setupIncompleteOrganizations: AdminOrganizationItem[];
  organizationsWithoutAdmin: AdminOrganizationItem[];
  activeOrganizations: AdminOrganizationItem[];
  suspendedOrganizations: AdminOrganizationItem[];
  closedOrganizations: AdminOrganizationItem[];
  organizationCount: number;
  activeOrganizationCount: number;
  suspendedOrganizationCount: number;
  closedOrganizationCount: number;
  adminUserCount: number;
  manageUserCount: number;
};

const ALL_ROLES: UserRole[] = ["super_admin", "org_admin", "leader", "viewer"];

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "최고관리자",
  org_admin: "조직관리자",
  leader: "지도자",
  viewer: "조회전용",
};

const APPROVAL_TYPE_LABELS: Record<string, string> = {
  normal: "일반",
  exempted: "면제",
  correction: "정정",
};

const MEETING_TYPE_LABELS: Record<string, string> = {
  regular: "정기집회",
  event: "행사",
  camp: "캠프",
  training: "훈련",
  service: "봉사",
  other: "기타",
};

const SCOUT_STATUS_LABELS: Record<string, string> = {
  active: "활동",
  inactive: "비활동",
  graduated: "졸업",
};

const DASHBOARD_OVERVIEW_LABELS: Record<DashboardOverviewType, string> = {
  total: "전체 대원",
  active: "활동 대원",
  promotionPossible: "진급 가능",
  notReviewed: "판정 필요",
};

const DASHBOARD_OVERVIEW_DESCRIPTIONS: Record<DashboardOverviewType, string> = {
  total: "현재 등록된 전체 대원입니다.",
  active: "현재 활동 상태로 관리되는 대원입니다.",
  promotionPossible: "최근 진급 판정에서 모든 조건을 충족한 대원입니다.",
  notReviewed: "활동 대원 중 아직 진급 판정이 진행되지 않은 대원입니다.",
};

const DASHBOARD_ISSUE_LABELS: Record<DashboardIssueType, string> = {
  period: "기간 부족",
  badge: "기능장 부족",
  program: "WSEP/MoP 미이수",
};

const DASHBOARD_ISSUE_DESCRIPTIONS: Record<DashboardIssueType, string> = {
  period: "다음 급위까지 필요한 활동기간이 부족한 대원입니다.",
  badge: "필수 또는 일반 기능장 조건 확인이 필요한 대원입니다.",
  program: "WSEP 또는 MoP 이수 확인이 필요한 대원입니다.",
};

const MENU_ITEMS: MenuItem[] = [
  {
    to: "/dashboard",
    label: "대시보드",
    description: "대원, 진급, 기능장, 집회·출석 현황을 확인합니다.",
    allowedRoles: ALL_ROLES,
  },
  {
    to: "/scout-integrated",
    label: "대원 통합관리",
    description: "대원별 기본정보와 진급·기능장·프로그램·출석 현황을 통합 관리합니다.",
    allowedRoles: ALL_ROLES,
  },
  {
    to: "/scouts",
    label: "대원 관리",
    description: "대원 정보를 등록·조회·수정합니다.",
    allowedRoles: ALL_ROLES,
  },
  {
    to: "/advancements",
    label: "진급 관리",
    description: "대원별 진급 판정과 인가 내역을 관리합니다.",
    allowedRoles: ALL_ROLES,
  },
  {
    to: "/merit-badges",
    label: "기능장 관리",
    description: "필수 기능장과 일반 기능장 취득 현황을 확인합니다.",
    allowedRoles: ALL_ROLES,
  },
  {
    to: "/program-completions",
    label: "프로그램 이수 관리",
    description: "WSEP, MoP 프로그램 이수 현황을 확인합니다.",
    allowedRoles: ALL_ROLES,
  },
  {
    to: "/meetings",
    label: "집회/출석 관리",
    description: "집회와 활동을 등록하고 대원별 출석을 입력합니다.",
    allowedRoles: ALL_ROLES,
  },
  {
    to: "/reports",
    label: "보고서 출력",
    description: "진급·기능장 인가 보고서와 대원별 진급 서류를 출력합니다.",
    allowedRoles: ALL_ROLES,
  },
  {
    to: "/settings",
    label: "환경설정",
    description: "소속대 정보와 사이드 메뉴 로고를 관리합니다.",
    allowedRoles: ALL_ROLES,
  },
  {
    to: "/admin/signup-requests",
    label: "이용신청 관리",
    description: "이용신청 승인과 반려 처리를 관리합니다.",
    allowedRoles: ["super_admin"],
  },
  {
    to: "/admin/organizations",
    label: "소속대 관리",
    description: "승인된 소속대의 이용 상태를 관리합니다.",
    allowedRoles: ["super_admin"],
  },
  {
    to: "/admin/organization-backups",
    label: "소속대 백업센터",
    description: "소속대별 데이터를 백업하고 제공 이력을 관리합니다.",
    allowedRoles: ["super_admin"],
  },
];

const SUPER_ADMIN_MENU_ORDER = [
  "/dashboard",
  "/admin/signup-requests",
  "/admin/organizations",
  "/admin/organization-backups",
  "/scout-integrated",
  "/scouts",
  "/advancements",
  "/merit-badges",
  "/program-completions",
  "/meetings",
  "/reports",
  "/settings",
];

const SUPER_ADMIN_MENU_LABELS: Record<string, string> = {
  "/dashboard": "대시보드",
  "/admin/signup-requests": "이용신청 관리",
  "/admin/organizations": "소속대 관리",
  "/admin/organization-backups": "소속대 백업센터",
  "/scout-integrated": "전체 대원 통합관리",
  "/scouts": "전체 대원 현황",
  "/advancements": "전체 진급 현황",
  "/merit-badges": "전체 기능장 현황",
  "/program-completions": "전체 프로그램 이수",
  "/meetings": "전체 집회/출석",
  "/reports": "보고서 출력",
  "/settings": "환경설정",
};

function getSidebarGroupLabel(role: UserRole, menuPath: string) {
  if (role === "super_admin") {
    if (menuPath === "/dashboard") return "운영 현황";
    if (menuPath === "/admin/signup-requests") return "최고관리자";
    if (menuPath === "/scout-integrated") return "전체 대원 운영";
    if (menuPath === "/reports") return "문서·설정";
    return null;
  }

  if (menuPath === "/dashboard") return "운영 현황";
  if (menuPath === "/scout-integrated") return "대원 운영";
  if (menuPath === "/reports") return "문서·설정";

  return null;
}

function getMenuLabelForRole(role: UserRole, menu: MenuItem) {
  if (role === "super_admin") {
    return SUPER_ADMIN_MENU_LABELS[menu.to] || menu.label;
  }

  return menu.label;
}

function sortMenusForRole(role: UserRole, menus: MenuItem[]) {
  if (role !== "super_admin") return menus;

  return [...menus].sort((a, b) => {
    const aIndex = SUPER_ADMIN_MENU_ORDER.indexOf(a.to);
    const bIndex = SUPER_ADMIN_MENU_ORDER.indexOf(b.to);

    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  });
}

function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && ALL_ROLES.includes(value as UserRole);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}.${month}.${day}`;
}

function shortId(value: string | null | undefined) {
  if (!value) return "-";
  return value.length > 8 ? value.slice(0, 8) : value;
}

function getScoutDisplayName(scout: ScoutRow | undefined, scoutId: string) {
  if (!scout) return `대원 ${shortId(scoutId)}`;

  if (scout.member_no) {
    return `${scout.name} (${scout.member_no})`;
  }

  return scout.name;
}

function getRankDisplayName(rank: RankRow | undefined, rankId: string | null) {
  if (!rankId) return "급위 미지정";
  return rank?.rank_name || `급위 ${shortId(rankId)}`;
}

function getScoutStatusLabel(scout: ScoutRow, statusAvailable: boolean) {
  if (!statusAvailable) return "활동";

  const status = scout.status || "active";
  return SCOUT_STATUS_LABELS[status] || status;
}

function getScoutSchoolGradeText(scout: ScoutRow) {
  const schoolGrade = [scout.school_name, scout.grade]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .join(" / ");

  return schoolGrade || "-";
}

function isOrganizationSetupRequired(role: UserRole | null) {
  return role !== null && role !== "super_admin";
}

function isOrganizationSetupComplete(
  role: UserRole | null,
  organizationInfo: OrganizationInfo | null,
) {
  if (!isOrganizationSetupRequired(role)) return true;

  return Boolean(organizationInfo?.setupComplete);
}

function buildDashboardOverviewItem({
  scout,
  rankMap,
  statusAvailable,
  message,
}: {
  scout: ScoutRow;
  rankMap: Map<string, RankRow>;
  statusAvailable: boolean;
  message: string;
}): DashboardOverviewItem {
  return {
    id: scout.id,
    scoutName: scout.name,
    memberNo: scout.member_no || "-",
    schoolGrade: getScoutSchoolGradeText(scout),
    currentRankName: getRankDisplayName(
      scout.current_rank_id ? rankMap.get(scout.current_rank_id) : undefined,
      scout.current_rank_id || null
    ),
    statusLabel: getScoutStatusLabel(scout, statusAvailable),
    message,
  };
}

function buildDashboardIssueItem({
  review,
  issueType,
  scoutMap,
  rankMap,
}: {
  review: PromotionReviewRow;
  issueType: DashboardIssueType;
  scoutMap: Map<string, ScoutRow>;
  rankMap: Map<string, RankRow>;
}): DashboardIssueItem {
  const scout = scoutMap.get(review.scout_id);
  const currentRankName = getRankDisplayName(
    scout?.current_rank_id ? rankMap.get(scout.current_rank_id) : undefined,
    scout?.current_rank_id || null
  );
  const targetRankName = getRankDisplayName(rankMap.get(review.to_rank_id), review.to_rank_id);

  let message = "확인이 필요합니다.";

  if (issueType === "period") {
    const remainingText =
      typeof review.days_remaining === "number" && review.days_remaining > 0
        ? `${review.days_remaining}일 부족`
        : "활동기간 확인 필요";
    const availableAtText = review.available_at
      ? ` / 진급 가능 예정일 ${formatDate(review.available_at)}`
      : "";
    message = `${remainingText}${availableAtText}`;
  }

  if (issueType === "badge") {
    if (!review.required_badges_passed && !review.general_badges_passed) {
      message = "필수 기능장과 일반 기능장 조건 확인 필요";
    } else if (!review.required_badges_passed) {
      message = "필수 기능장 조건 확인 필요";
    } else if (!review.general_badges_passed) {
      message = "일반 기능장 조건 확인 필요";
    }
  }

  if (issueType === "program") {
    message = "WSEP/MoP 이수 또는 승인일 확인 필요";
  }

  return {
    id: review.id,
    scoutName: getScoutDisplayName(scout, review.scout_id),
    currentRankName,
    targetRankName,
    reviewDate: review.review_date || review.created_at,
    message,
  };
}

async function fetchScoutsForDashboard(): Promise<{
  scouts: ScoutRow[];
  statusAvailable: boolean;
}> {
  const attempts = [
    {
      select: "id, organization_id, name, member_no, school_name, grade, joined_at, current_rank_id, status",
      useDeletedAt: true,
      statusAvailable: true,
    },
    {
      select: "id, organization_id, name, member_no, school_name, grade, joined_at, current_rank_id",
      useDeletedAt: true,
      statusAvailable: false,
    },
    {
      select: "id, organization_id, name, member_no, school_name, grade, joined_at, current_rank_id, status",
      useDeletedAt: false,
      statusAvailable: true,
    },
    {
      select: "id, organization_id, name, member_no, school_name, grade, joined_at, current_rank_id",
      useDeletedAt: false,
      statusAvailable: false,
    },
  ];

  let lastErrorMessage = "대원 현황을 조회하지 못했습니다.";

  for (const attempt of attempts) {
    let query = supabase.from("scouts").select(attempt.select);

    if (attempt.useDeletedAt) {
      query = query.is("deleted_at", null);
    }

    const { data, error } = await query.order("name", { ascending: true });

    if (!error) {
      return {
        scouts: (data ?? []) as unknown as ScoutRow[],
        statusAvailable: attempt.statusAvailable,
      };
    }

    lastErrorMessage = error.message;
  }

  throw new Error(lastErrorMessage);
}

async function fetchBadgeNameMap(badgeIds: string[]): Promise<{
  badgeNameMap: Map<string, string>;
  badgeNameAvailable: boolean;
}> {
  const uniqueBadgeIds = Array.from(new Set(badgeIds)).filter(Boolean);
  const badgeNameMap = new Map<string, string>();

  if (uniqueBadgeIds.length === 0) {
    return { badgeNameMap, badgeNameAvailable: true };
  }

  const { data, error } = await supabase
    .from("badges")
    .select("id, name")
    .in("id", uniqueBadgeIds);

  if (error) {
    console.error("기능장명 조회 오류:", error.message);
    return { badgeNameMap, badgeNameAvailable: false };
  }

  const badgeRows = (data || []) as unknown as Record<string, unknown>[];

  badgeRows.forEach((row) => {
    const id = typeof row.id === "string" ? row.id : "";
    const name = typeof row.name === "string" && row.name.trim()
      ? row.name.trim()
      : `기능장 ${shortId(id)}`;

    if (id) {
      badgeNameMap.set(id, name);
    }
  });

  return { badgeNameMap, badgeNameAvailable: true };
}

async function fetchOrganizationInfo(
  organizationId: string | null | undefined
): Promise<OrganizationInfo | null> {
  if (!organizationId) return null;

  const attempts = [
    {
      select: "id, name, unit_number, logo_url, status",
      logoAvailable: true,
    },
    {
      select: "id, name, unit_number, status",
      logoAvailable: false,
    },
    {
      select: "id, name, unit_number, logo_url",
      logoAvailable: true,
    },
    {
      select: "id, name, unit_number",
      logoAvailable: false,
    },
  ];

  for (const attempt of attempts) {
    const { data, error } = await supabase
      .from("organizations")
      .select(attempt.select)
      .eq("id", organizationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!error) {
      if (!data) return null;

      const row = data as unknown as Record<string, unknown>;
      const cleanName =
        typeof row.name === "string" && row.name.trim() ? row.name.trim() : "";
      const unitNumber =
        typeof row.unit_number === "string" && row.unit_number.trim()
          ? row.unit_number.trim()
          : null;
      const status = getOrganizationStatus(row);

      return {
        id: organizationId,
        name: cleanName || "소속대",
        unitNumber,
        status,
        statusLabel: getOrganizationStatusLabel(status),
        logoUrl:
          attempt.logoAvailable && typeof row.logo_url === "string" && row.logo_url.trim()
            ? row.logo_url
            : null,
        logoAvailable: attempt.logoAvailable,
        setupComplete: Boolean(cleanName && unitNumber),
      };
    }
  }

  return null;
}

function getStringValue(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function getOrganizationStatus(row: Record<string, unknown>): OrganizationStatus {
  return getStringValue(row, ["status"]) || "active";
}

function getOrganizationStatusLabel(status: string) {
  const statusMap: Record<string, string> = {
    active: "이용중",
    inactive: "이용중지",
    suspended: "이용중지",
    closed: "이용종료",
  };

  return statusMap[status] || status;
}

function isActiveOrganizationStatus(status: string) {
  return status === "active";
}

function isSuspendedOrganizationStatus(status: string) {
  return status === "suspended" || status === "inactive";
}

function isClosedOrganizationStatus(status: string) {
  return status === "closed";
}

function getAdminProfileStatus(row: Record<string, unknown>) {
  const status = getStringValue(row, ["approval_status", "status"]);

  return status || "approved";
}

function getAdminStatusLabel(status: string) {
  const statusMap: Record<string, string> = {
    pending: "승인 대기",
    approved: "승인 완료",
    rejected: "반려",
    suspended: "이용 제한",
    inactive: "비활성",
    active: "승인 완료",
  };

  return statusMap[status] || status;
}

function isApprovedProfileStatus(status: string) {
  return status === "approved" || status === "active";
}

function getAdminRoleLabel(role: UserRole | "unknown") {
  if (role === "unknown") return "권한 미확인";

  return ROLE_LABELS[role];
}

async function fetchAdminOrganizations(): Promise<AdminOrganizationItem[]> {
  const attempts = [
    { useDeletedAt: true },
    { useDeletedAt: false },
  ];

  for (const attempt of attempts) {
    let query = supabase.from("organizations").select("*");

    if (attempt.useDeletedAt) {
      query = query.is("deleted_at", null);
    }

    const { data, error } = await query;

    if (!error) {
      const rows = (data || []) as unknown as Record<string, unknown>[];

      return rows
        .map((row) => {
          const id = getStringValue(row, ["id"]) || "";
          const name = getStringValue(row, ["name"]) || "소속대명 미등록";
          const unitNumber = getStringValue(row, ["unit_number"]);
          const createdAt = getStringValue(row, ["created_at"]);
          const status = getOrganizationStatus(row);

          return {
            id,
            name,
            unitNumber,
            createdAt,
            setupComplete: Boolean(name !== "소속대명 미등록" && unitNumber),
            status,
            statusLabel: getOrganizationStatusLabel(status),
            adminCount: 0,
            leaderCount: 0,
            viewerCount: 0,
            activeScoutCount: 0,
            totalScoutCount: 0,
          };
        })
        .filter((organization) => organization.id)
        .sort((a, b) => a.name.localeCompare(b.name, "ko"));
    }
  }

  return [];
}

async function fetchAdminProfiles(
  organizationNameMap: Map<string, string>,
): Promise<AdminProfileItem[]> {
  const attempts = [
    { useDeletedAt: true },
    { useDeletedAt: false },
  ];

  for (const attempt of attempts) {
    let query = supabase.from("user_profiles").select("*");

    if (attempt.useDeletedAt) {
      query = query.is("deleted_at", null);
    }

    const { data, error } = await query;

    if (!error) {
      const rows = (data || []) as unknown as Record<string, unknown>[];

      return rows
        .map((row) => {
          const id = getStringValue(row, ["id"]) || getStringValue(row, ["user_id"]) || "";
          const userId = getStringValue(row, ["user_id"]) || id;
          const rawRole = getStringValue(row, ["role"]);
          const role: UserRole | "unknown" = rawRole && isUserRole(rawRole) ? rawRole : "unknown";
          const organizationId = getStringValue(row, ["organization_id"]);
          const status = getAdminProfileStatus(row);
          const email = getStringValue(row, ["email"]);
          const name = getStringValue(row, ["name", "full_name", "display_name"]);
          const displayName = name || email || (userId ? `사용자 ${shortId(userId)}` : "사용자");

          return {
            id,
            userId,
            displayName,
            email: email || "-",
            role,
            organizationId,
            organizationName: organizationId
              ? organizationNameMap.get(organizationId) || `소속대 ${shortId(organizationId)}`
              : "전체 관리",
            status,
            statusLabel: getAdminStatusLabel(status),
            createdAt: getStringValue(row, ["created_at"]),
          };
        })
        .filter((profile) => profile.id)
        .sort((a, b) => {
          const dateCompare = (b.createdAt || "").localeCompare(a.createdAt || "");
          if (dateCompare !== 0) return dateCompare;
          return a.displayName.localeCompare(b.displayName, "ko");
        });
    }
  }

  return [];
}

async function loadSuperAdminStats(): Promise<SuperAdminStats> {
  const [operations, organizations, { scouts, statusAvailable }] = await Promise.all([
    loadDashboardStats(),
    fetchAdminOrganizations(),
    fetchScoutsForDashboard(),
  ]);

  const organizationNameMap = new Map(
    organizations.map((organization) => [organization.id, organization.name]),
  );
  const profiles = await fetchAdminProfiles(organizationNameMap);
  const approvedOrganizationIds = new Set(
    profiles
      .filter(
        (profile) =>
          profile.organizationId && isApprovedProfileStatus(profile.status),
      )
      .map((profile) => profile.organizationId as string),
  );
  const managedOrganizations = organizations.filter((organization) =>
    approvedOrganizationIds.has(organization.id),
  );
  const organizationMap = new Map(
    managedOrganizations.map((organization) => [organization.id, organization]),
  );

  profiles.forEach((profile) => {
    if (!profile.organizationId) return;

    const organization = organizationMap.get(profile.organizationId);
    if (!organization || !isApprovedProfileStatus(profile.status)) return;

    if (profile.role === "org_admin") organization.adminCount += 1;
    if (profile.role === "leader") organization.leaderCount += 1;
    if (profile.role === "viewer") organization.viewerCount += 1;
  });

  scouts.forEach((scout) => {
    if (!scout.organization_id) return;

    const organization = organizationMap.get(scout.organization_id);
    if (!organization) return;

    organization.totalScoutCount += 1;

    if (!statusAvailable || !scout.status || scout.status === "active") {
      organization.activeScoutCount += 1;
    }
  });

  const pendingRequests = profiles.filter((profile) => profile.status === "pending");
  const approvedProfiles = profiles.filter((profile) => isApprovedProfileStatus(profile.status));
  const rejectedProfiles = profiles.filter((profile) => profile.status === "rejected");
  const suspendedProfiles = profiles.filter((profile) => profile.status === "suspended");
  const activeOrganizations = managedOrganizations.filter((organization) =>
    isActiveOrganizationStatus(organization.status),
  );
  const suspendedOrganizations = managedOrganizations.filter((organization) =>
    isSuspendedOrganizationStatus(organization.status),
  );
  const closedOrganizations = managedOrganizations.filter((organization) =>
    isClosedOrganizationStatus(organization.status),
  );
  const setupIncompleteOrganizations = activeOrganizations.filter(
    (organization) => !organization.setupComplete,
  );
  const organizationsWithoutAdmin = activeOrganizations.filter(
    (organization) => organization.adminCount === 0,
  );
  const adminUserCount = approvedProfiles.filter(
    (profile) => profile.role === "super_admin" || profile.role === "org_admin",
  ).length;
  const manageUserCount = approvedProfiles.filter(
    (profile) =>
      profile.role === "super_admin" || profile.role === "org_admin" || profile.role === "leader",
  ).length;
  const activeOrganizationCount = activeOrganizations.length;
  const suspendedOrganizationCount = suspendedOrganizations.length;
  const closedOrganizationCount = closedOrganizations.length;

  return {
    operations,
    organizations: managedOrganizations,
    profiles,
    pendingRequests,
    approvedProfiles,
    rejectedProfiles,
    suspendedProfiles,
    setupIncompleteOrganizations,
    organizationsWithoutAdmin,
    activeOrganizations,
    suspendedOrganizations,
    closedOrganizations,
    organizationCount: managedOrganizations.length,
    activeOrganizationCount,
    suspendedOrganizationCount,
    closedOrganizationCount,
    adminUserCount,
    manageUserCount,
  };
}

async function loadDashboardStats(): Promise<DashboardStats> {
  const [{ scouts, statusAvailable }, ranksResult, reviewsResult, rankHistoriesResult, badgesResult, meetingsResult] =
    await Promise.all([
      fetchScoutsForDashboard(),
      supabase
        .from("ranks")
        .select("id, rank_code, rank_name, sort_order")
        .order("sort_order", { ascending: true }),
      supabase
        .from("promotion_reviews")
        .select(
          "id, scout_id, to_rank_id, review_date, base_date, available_at, required_months, days_remaining, period_passed, required_badges_passed, general_badges_passed, program_passed, final_passed, missing_items, created_at"
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase
        .from("scout_rank_histories")
        .select("id, scout_id, rank_id, approved_at, approval_type, created_at")
        .is("deleted_at", null)
        .order("approved_at", { ascending: false })
        .limit(6),
      supabase
        .from("scout_badges")
        .select("id, scout_id, badge_id, acquired_at, approved_at, created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("meetings")
        .select("id, title, meeting_date, meeting_type, is_attendance_target, created_at")
        .is("deleted_at", null)
        .order("meeting_date", { ascending: false })
        .limit(5),
    ]);

  if (ranksResult.error) throw new Error(ranksResult.error.message);
  if (reviewsResult.error) throw new Error(reviewsResult.error.message);
  if (rankHistoriesResult.error) throw new Error(rankHistoriesResult.error.message);
  if (badgesResult.error) throw new Error(badgesResult.error.message);
  if (meetingsResult.error) throw new Error(meetingsResult.error.message);

  const ranks = (ranksResult.data || []) as RankRow[];
  const reviews = (reviewsResult.data || []) as PromotionReviewRow[];
  const rankHistories = (rankHistoriesResult.data || []) as RankHistoryRow[];
  const scoutBadges = (badgesResult.data || []) as ScoutBadgeRow[];
  const meetings = (meetingsResult.data || []) as MeetingRow[];

  const scoutMap: Map<string, ScoutRow> = new Map(scouts.map((scout) => [scout.id, scout]));
  const rankMap: Map<string, RankRow> = new Map(ranks.map((rank) => [rank.id, rank]));

  const activeScouts = scouts.filter((scout) => !statusAvailable || !scout.status || scout.status === "active");
  const activeScoutIds = new Set(activeScouts.map((scout) => scout.id));

  const inactiveScouts = statusAvailable
    ? scouts.filter((scout) => scout.status === "inactive").length
    : 0;
  const graduatedScouts = statusAvailable
    ? scouts.filter((scout) => scout.status === "graduated").length
    : 0;

  const rankCountMap = new Map<string, RankCountItem>();

  activeScouts.forEach((scout) => {
    const key = scout.current_rank_id || "__none__";
    const rank = scout.current_rank_id ? rankMap.get(scout.current_rank_id) : undefined;
    const existing = rankCountMap.get(key);

    if (existing) {
      existing.count += 1;
      return;
    }

    rankCountMap.set(key, {
      rankId: scout.current_rank_id,
      rankName: getRankDisplayName(rank, scout.current_rank_id),
      count: 1,
      sortOrder: rank?.sort_order ?? 999,
    });
  });

  const rankCounts = Array.from(rankCountMap.values()).sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.rankName.localeCompare(b.rankName, "ko");
  });

  const latestReviewByScout = new Map<string, PromotionReviewRow>();

  reviews.forEach((review) => {
    if (!activeScoutIds.has(review.scout_id)) return;
    if (!latestReviewByScout.has(review.scout_id)) {
      latestReviewByScout.set(review.scout_id, review);
    }
  });

  const latestReviews = Array.from(latestReviewByScout.values());

  const promotionPossibleReviews = latestReviews.filter((review) => review.final_passed);
  const promotionPossible = promotionPossibleReviews.length;
  const periodShortageReviews = latestReviews.filter((review) => !review.period_passed);
  const badgeShortageReviews = latestReviews.filter(
    (review) => !review.required_badges_passed || !review.general_badges_passed
  );
  const programShortageReviews = latestReviews.filter((review) => !review.program_passed);

  const periodShortage = periodShortageReviews.length;
  const badgeShortage = badgeShortageReviews.length;
  const programShortage = programShortageReviews.length;
  const notReviewedScouts = activeScouts.length - latestReviews.length;

  const sortOverviewItems = (items: DashboardOverviewItem[]) =>
    [...items].sort((a, b) => {
      const memberCompare = a.memberNo.localeCompare(b.memberNo, "ko");
      if (memberCompare !== 0) return memberCompare;
      return a.scoutName.localeCompare(b.scoutName, "ko");
    });

  const totalScoutItems = sortOverviewItems(
    scouts.map((scout) =>
      buildDashboardOverviewItem({
        scout,
        rankMap,
        statusAvailable,
        message: "대원 관리에서 상세 정보를 확인할 수 있습니다.",
      })
    )
  );

  const activeScoutItems = sortOverviewItems(
    activeScouts.map((scout) =>
      buildDashboardOverviewItem({
        scout,
        rankMap,
        statusAvailable,
        message: "현재 활동 대원으로 관리 중입니다.",
      })
    )
  );

  const promotionPossibleItems = sortOverviewItems(
    promotionPossibleReviews
      .map((review) => {
        const scout = scoutMap.get(review.scout_id);
        if (!scout) return null;

        return buildDashboardOverviewItem({
          scout,
          rankMap,
          statusAvailable,
          message: `${getRankDisplayName(rankMap.get(review.to_rank_id), review.to_rank_id)} 진급 조건을 충족했습니다.`,
        });
      })
      .filter((item): item is DashboardOverviewItem => item !== null)
  );

  const notReviewedScoutItems = sortOverviewItems(
    activeScouts
      .filter((scout) => !latestReviewByScout.has(scout.id))
      .map((scout) =>
        buildDashboardOverviewItem({
          scout,
          rankMap,
          statusAvailable,
          message: "진급 판정이 필요합니다.",
        })
      )
  );

  const periodShortageItems = periodShortageReviews.map((review) =>
    buildDashboardIssueItem({ review, issueType: "period", scoutMap, rankMap })
  );
  const badgeShortageItems = badgeShortageReviews.map((review) =>
    buildDashboardIssueItem({ review, issueType: "badge", scoutMap, rankMap })
  );
  const programShortageItems = programShortageReviews.map((review) =>
    buildDashboardIssueItem({ review, issueType: "program", scoutMap, rankMap })
  );

  const recentRankApprovals = rankHistories.map((history) => ({
    id: history.id,
    scoutName: getScoutDisplayName(scoutMap.get(history.scout_id), history.scout_id),
    rankName: getRankDisplayName(rankMap.get(history.rank_id), history.rank_id),
    approvedAt: history.approved_at,
    approvalType: APPROVAL_TYPE_LABELS[history.approval_type] || history.approval_type,
  }));

  const { badgeNameMap, badgeNameAvailable } = await fetchBadgeNameMap(
    scoutBadges.map((badge) => badge.badge_id)
  );

  const recentBadgeApprovals = scoutBadges.map((badge) => ({
    id: badge.id,
    scoutName: getScoutDisplayName(scoutMap.get(badge.scout_id), badge.scout_id),
    badgeName: badgeNameMap.get(badge.badge_id) || `기능장 ${shortId(badge.badge_id)}`,
    acquiredAt: badge.acquired_at,
    approvedAt: badge.approved_at,
  }));

  const meetingIds = meetings.map((meeting) => meeting.id);
  let attendanceRows: AttendanceRow[] = [];

  if (meetingIds.length > 0) {
    const { data: attendanceData, error: attendanceError } = await supabase
      .from("attendance")
      .select("id, meeting_id, status")
      .is("deleted_at", null)
      .in("meeting_id", meetingIds);

    if (!attendanceError) {
      attendanceRows = (attendanceData || []) as AttendanceRow[];
    }
  }

  const attendanceByMeeting = new Map<string, AttendanceRow[]>();
  attendanceRows.forEach((attendance) => {
    const list = attendanceByMeeting.get(attendance.meeting_id) || [];
    list.push(attendance);
    attendanceByMeeting.set(attendance.meeting_id, list);
  });

  const recentMeetings = meetings.map((meeting) => {
    const list = attendanceByMeeting.get(meeting.id) || [];

    return {
      id: meeting.id,
      title: meeting.title,
      meetingDate: meeting.meeting_date,
      meetingType: MEETING_TYPE_LABELS[meeting.meeting_type] || meeting.meeting_type,
      isAttendanceTarget: meeting.is_attendance_target,
      attendanceTotal: list.length,
      attendanceEntered: list.filter((attendance) => attendance.status !== "not_entered").length,
      attendancePresent: list.filter((attendance) => attendance.status === "present").length,
    };
  });

  return {
    totalScouts: scouts.length,
    activeScouts: activeScouts.length,
    inactiveScouts,
    graduatedScouts,
    rankCounts,
    promotionPossible,
    periodShortage,
    badgeShortage,
    programShortage,
    totalScoutItems,
    activeScoutItems,
    promotionPossibleItems,
    notReviewedScoutItems,
    periodShortageItems,
    badgeShortageItems,
    programShortageItems,
    reviewedScouts: latestReviews.length,
    notReviewedScouts,
    recentRankApprovals,
    recentBadgeApprovals,
    recentMeetings,
    scoutStatusAvailable: statusAvailable,
    badgeNameAvailable,
  };
}

function SuperAdminDashboardHome({
  visibleMenus,
}: {
  visibleMenus: MenuItem[];
}) {
  const [stats, setStats] = useState<SuperAdminStats | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [dashboardError, setDashboardError] = useState("");

  const adminWorkMenus = visibleMenus.filter((menu) => menu.to !== "/dashboard");

  const refreshDashboard = useCallback(async () => {
    setLoadingDashboard(true);
    setDashboardError("");

    try {
      const loadedStats = await loadSuperAdminStats();
      setStats(loadedStats);
    } catch (error) {
      console.error("최고관리자 대시보드 조회 오류:", error);
      setDashboardError(
        error instanceof Error
          ? error.message
          : "최고관리자 현황을 불러오지 못했습니다.",
      );
    } finally {
      setLoadingDashboard(false);
    }
  }, []);

  useEffect(() => {
    refreshDashboard();
  }, [refreshDashboard]);

  return (
    <div>
      <div style={pageHeaderStyle}>
        <div>
          <h1 style={pageTitleStyle}>최고관리자 대시보드</h1>
          <p style={pageDescriptionStyle}>
            이용신청 승인, 소속대 운영 현황, 전체 대원 입력 상태를 확인합니다.
          </p>
        </div>

        <div style={headerActionStyle}>
          <div style={roleBadgeStyle}>{ROLE_LABELS.super_admin}</div>
          <button type="button" onClick={refreshDashboard} style={secondaryButtonStyle}>
            새로고침
          </button>
        </div>
      </div>

      {loadingDashboard ? (
        <section style={cardStyle}>
          <p style={cardTextStyle}>최고관리자 현황을 불러오는 중입니다...</p>
        </section>
      ) : dashboardError ? (
        <section style={errorCardStyle}>
          <h2 style={cardTitleStyle}>현황을 불러오지 못했습니다</h2>
          <p style={cardTextStyle}>{dashboardError}</p>
          <button type="button" onClick={refreshDashboard} style={secondaryButtonStyle}>
            다시 조회
          </button>
        </section>
      ) : stats ? (
        <>
          <div style={summaryGridStyle}>
            <DashboardSummaryCard
              title="승인 대기"
              value={`${stats.pendingRequests.length}건`}
              description="이용신청 관리에서 처리해야 할 신청입니다."
            />
            <DashboardSummaryCard
              title="승인된 소속대"
              value={`${stats.organizationCount}곳`}
              description={`이용중 ${stats.activeOrganizationCount}곳 / 이용중지 ${stats.suspendedOrganizationCount}곳 / 이용종료 ${stats.closedOrganizationCount}곳`}
            />
            <DashboardSummaryCard
              title="전체 대원"
              value={`${stats.operations.totalScouts}명`}
              description={`활동 ${stats.operations.activeScouts}명 / 비활동 ${stats.operations.inactiveScouts}명 / 졸업 ${stats.operations.graduatedScouts}명`}
            />
            <DashboardSummaryCard
              title="관리 사용자"
              value={`${stats.manageUserCount}명`}
              description={`조직관리자·지도자·최고관리자 승인 계정 기준입니다.`}
            />
          </div>

          <div style={noticeCardStyle}>
            <strong>최고관리자 안내</strong>
            <span>
              최고관리자는 이용신청 처리, 승인된 소속대 현황 확인, 전체 입력 상태 점검을 중심으로 관리합니다.
            </span>
          </div>

          <div style={sectionHeaderStyle}>
            <h2 style={sectionTitleStyle}>처리 필요 항목</h2>
            <p style={sectionDescriptionStyle}>
              승인과 소속대 운영 상태 기준으로 우선 확인이 필요한 항목입니다.
            </p>
          </div>

          <div style={summaryGridStyle}>
            <DashboardSummaryCard
              title="승인 대기 신청"
              value={`${stats.pendingRequests.length}건`}
              description="이용 가능 여부를 승인 또는 반려해야 합니다."
            />
            <DashboardSummaryCard
              title="소속대 정보 보완"
              value={`${stats.setupIncompleteOrganizations.length}곳`}
              description="소속대명 또는 대번호 확인이 필요한 소속대입니다."
            />
            <DashboardSummaryCard
              title="관리자 미지정"
              value={`${stats.organizationsWithoutAdmin.length}곳`}
              description="승인된 조직관리자가 확인되지 않는 소속대입니다."
            />
            <DashboardSummaryCard
              title="이용중지·종료"
              value={`${stats.suspendedOrganizationCount + stats.closedOrganizationCount}곳`}
              description="소속대 관리에서 이용 상태를 확인하거나 재개할 수 있습니다."
            />
          </div>

          <div style={dashboardTwoColumnStyle}>
            <section style={dashboardSectionCardStyle}>
              <div style={sectionHeaderStyle}>
                <h2 style={sectionTitleStyle}>승인 대기 신청</h2>
                <p style={sectionDescriptionStyle}>
                  이용신청 관리에서 승인 또는 반려할 수 있습니다.
                </p>
              </div>
              <SuperAdminRequestTable items={stats.pendingRequests.slice(0, 8)} />
            </section>

            <section>
              <div style={sectionHeaderStyle}>
                <h2 style={sectionTitleStyle}>전체 운영 요약</h2>
                <p style={sectionDescriptionStyle}>
                  전체 소속대 기준 진급·기능장·프로그램 확인 상태입니다.
                </p>
              </div>
              <div style={listCardStyle}>
                <div style={listItemStyle}>
                  <div>
                    <div style={listTitleStyle}>진급 가능</div>
                    <div style={listDescriptionStyle}>최근 판정에서 조건을 충족한 대원</div>
                  </div>
                  <div style={listDateStyle}>{stats.operations.promotionPossible}명</div>
                </div>
                <div style={listItemStyle}>
                  <div>
                    <div style={listTitleStyle}>판정 필요</div>
                    <div style={listDescriptionStyle}>아직 진급 판정이 진행되지 않은 활동 대원</div>
                  </div>
                  <div style={listDateStyle}>{stats.operations.notReviewedScouts}명</div>
                </div>
                <div style={listItemStyle}>
                  <div>
                    <div style={listTitleStyle}>기능장 부족</div>
                    <div style={listDescriptionStyle}>필수 또는 일반 기능장 확인 필요</div>
                  </div>
                  <div style={listDateStyle}>{stats.operations.badgeShortage}명</div>
                </div>
                <div style={{ ...listItemStyle, borderBottom: "none" }}>
                  <div>
                    <div style={listTitleStyle}>WSEP/MoP 미이수</div>
                    <div style={listDescriptionStyle}>범스카우트 진급 프로그램 확인 필요</div>
                  </div>
                  <div style={listDateStyle}>{stats.operations.programShortage}명</div>
                </div>
              </div>
            </section>
          </div>

          <div style={{ ...sectionHeaderStyle, marginTop: "32px" }}>
            <h2 style={sectionTitleStyle}>승인된 소속대 현황</h2>
            <p style={sectionDescriptionStyle}>
              소속대별 이용 상태, 관리자 지정 여부와 대원 등록 현황입니다.
            </p>
          </div>
          <SuperAdminOrganizationTable items={stats.organizations} />

          <div style={{ ...sectionHeaderStyle, marginTop: "32px" }}>
            <h2 style={sectionTitleStyle}>전체 소속대 급위 현황</h2>
            <p style={sectionDescriptionStyle}>
              승인된 전체 소속대의 활동 대원 기준 급위 분포입니다.
            </p>
          </div>

          {stats.operations.rankCounts.length === 0 ? (
            <EmptyCard message="급위별 집계 대상 대원이 없습니다." />
          ) : (
            <div style={rankGridStyle}>
              {stats.operations.rankCounts.map((item) => (
                <section key={item.rankId || "none"} style={rankCardStyle}>
                  <div style={rankNameStyle}>{item.rankName}</div>
                  <div style={rankCountStyle}>{item.count}명</div>
                </section>
              ))}
            </div>
          )}

          <div style={dashboardTwoColumnStyle}>
            <section>
              <div style={sectionHeaderStyle}>
                <h2 style={sectionTitleStyle}>최근 진급 인가</h2>
                <p style={sectionDescriptionStyle}>전체 소속대 기준 최근 진급 인가 내역입니다.</p>
              </div>
              <RecentRankApprovalList items={stats.operations.recentRankApprovals} />
            </section>

            <section style={dashboardSectionCardStyle}>
              <div style={sectionHeaderStyle}>
                <h2 style={sectionTitleStyle}>최근 기능장 인가</h2>
                <p style={sectionDescriptionStyle}>전체 소속대 기준 최근 기능장 인가 내역입니다.</p>
              </div>
              <RecentBadgeApprovalList items={stats.operations.recentBadgeApprovals} />
            </section>
          </div>

          <div style={{ ...sectionHeaderStyle, marginTop: "32px" }}>
            <h2 style={sectionTitleStyle}>최근 집회/출석 입력 현황</h2>
            <p style={sectionDescriptionStyle}>
              전체 소속대 기준 최근 집회 5건의 출석 입력 상태입니다.
            </p>
          </div>
          <RecentMeetingList items={stats.operations.recentMeetings} />
        </>
      ) : null}

      {adminWorkMenus.length > 0 ? (
        <section style={shortcutSectionStyle}>
          <div style={shortcutHeaderStyle}>
            <div>
              <h2 style={sectionTitleStyle}>바로가기</h2>
              <p style={sectionDescriptionStyle}>최고관리자 주요 업무 화면으로 이동합니다.</p>
            </div>
          </div>

          <div style={shortcutBarStyle}>
            {adminWorkMenus.map((menu) => (
              <Link key={menu.to} to={menu.to} style={shortcutLinkStyle}>
                {menu.label}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SuperAdminRequestTable({ items }: { items: AdminProfileItem[] }) {
  if (items.length === 0) {
    return <EmptyCard message="승인 대기 중인 이용신청이 없습니다." />;
  }

  return (
    <div style={tableCardStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={tableHeaderStyle}>신청일</th>
            <th style={tableHeaderStyle}>신청자</th>
            <th style={tableHeaderStyle}>소속대</th>
            <th style={tableHeaderStyle}>권한</th>
            <th style={tableHeaderStyle}>상태</th>
            <th style={tableHeaderStyle}>관리</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td style={tableCellStyle}>{formatDate(item.createdAt)}</td>
              <td style={tableCellStyle}>{item.displayName}</td>
              <td style={tableCellStyle}>{item.organizationName}</td>
              <td style={tableCellStyle}>{getAdminRoleLabel(item.role)}</td>
              <td style={tableCellStyle}>{item.statusLabel}</td>
              <td style={tableCellStyle}>
                <Link to="/admin/signup-requests" style={cardLinkStyle}>
                  처리하기
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SuperAdminOrganizationTable({ items }: { items: AdminOrganizationItem[] }) {
  type OrganizationDashboardFilter =
    | "all"
    | "active"
    | "suspended"
    | "closed"
    | "setupIncomplete";

  const [organizationFilter, setOrganizationFilter] =
    useState<OrganizationDashboardFilter>("all");

  const filterCounts = useMemo(
    () => ({
      all: items.length,
      active: items.filter((item) => isActiveOrganizationStatus(item.status)).length,
      suspended: items.filter((item) =>
        isSuspendedOrganizationStatus(item.status),
      ).length,
      closed: items.filter((item) => isClosedOrganizationStatus(item.status)).length,
      setupIncomplete: items.filter((item) => !item.setupComplete).length,
    }),
    [items],
  );

  const filteredItems = useMemo(() => {
    if (organizationFilter === "active") {
      return items.filter((item) => isActiveOrganizationStatus(item.status));
    }

    if (organizationFilter === "suspended") {
      return items.filter((item) =>
        isSuspendedOrganizationStatus(item.status),
      );
    }

    if (organizationFilter === "closed") {
      return items.filter((item) => isClosedOrganizationStatus(item.status));
    }

    if (organizationFilter === "setupIncomplete") {
      return items.filter((item) => !item.setupComplete);
    }

    return items;
  }, [items, organizationFilter]);

  const filterOptions: Array<{
    value: OrganizationDashboardFilter;
    label: string;
    count: number;
  }> = [
    { value: "all", label: "전체", count: filterCounts.all },
    { value: "active", label: "이용중", count: filterCounts.active },
    { value: "suspended", label: "이용중지", count: filterCounts.suspended },
    { value: "closed", label: "이용종료", count: filterCounts.closed },
    {
      value: "setupIncomplete",
      label: "정보 보완 필요",
      count: filterCounts.setupIncomplete,
    },
  ];

  if (items.length === 0) {
    return <EmptyCard message="등록된 소속대가 없습니다." />;
  }

  return (
    <div>
      <div style={organizationFilterBarStyle}>
        {filterOptions.map((option) => {
          const isActive = organizationFilter === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setOrganizationFilter(option.value)}
              style={{
                ...organizationFilterButtonStyle,
                ...(isActive ? organizationFilterButtonActiveStyle : {}),
              }}
              aria-pressed={isActive}
            >
              <span>{option.label}</span>
              <strong style={organizationFilterCountStyle}>{option.count}</strong>
            </button>
          );
        })}
      </div>

      {filteredItems.length === 0 ? (
        <EmptyCard message="현재 선택한 필터에 해당하는 소속대가 없습니다." />
      ) : (
        <div style={tableCardStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={tableHeaderStyle}>소속대</th>
                <th style={tableHeaderStyle}>대번호</th>
                <th style={tableHeaderStyle}>조직관리자</th>
                <th style={tableHeaderStyle}>지도자</th>
                <th style={tableHeaderStyle}>전체 대원</th>
                <th style={tableHeaderStyle}>활동 대원</th>
                <th style={tableHeaderStyle}>이용 상태</th>
                <th style={tableHeaderStyle}>관리</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id}>
                  <td style={tableCellStyle}>{item.name}</td>
                  <td style={tableCellStyle}>{item.unitNumber || "-"}</td>
                  <td style={tableCellStyle}>{item.adminCount}명</td>
                  <td style={tableCellStyle}>{item.leaderCount}명</td>
                  <td style={tableCellStyle}>{item.totalScoutCount}명</td>
                  <td style={tableCellStyle}>{item.activeScoutCount}명</td>
                  <td style={tableCellStyle}>
                    {item.statusLabel}
                    {!item.setupComplete
                      ? " · 정보 보완 필요"
                      : item.adminCount === 0
                        ? " · 관리자 확인 필요"
                        : ""}
                  </td>
                  <td style={tableCellStyle}>
                    <Link to="/admin/organizations" style={cardLinkStyle}>
                      상태 관리
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DashboardHome(props: {
  role: UserRole;
  visibleMenus: MenuItem[];
}) {
  if (props.role === "super_admin") {
    return <SuperAdminDashboardHome visibleMenus={props.visibleMenus} />;
  }

  return <OrganizationDashboardHome {...props} />;
}

function OrganizationDashboardHome({
  role,
  visibleMenus,
}: {
  role: UserRole;
  visibleMenus: MenuItem[];
}) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [dashboardError, setDashboardError] = useState("");
  const [selectedOverviewType, setSelectedOverviewType] = useState<DashboardOverviewType | null>(null);
  const [selectedIssueType, setSelectedIssueType] = useState<DashboardIssueType | null>(null);

  const availableWorkMenus = visibleMenus.filter((menu) => menu.to !== "/dashboard");

  const selectedOverviewInfo = useMemo(() => {
    if (!stats || !selectedOverviewType) return null;

    if (selectedOverviewType === "total") {
      return {
        type: selectedOverviewType,
        title: DASHBOARD_OVERVIEW_LABELS[selectedOverviewType],
        description: DASHBOARD_OVERVIEW_DESCRIPTIONS[selectedOverviewType],
        items: stats.totalScoutItems,
        linkTo: "/scouts",
        linkLabel: "대원 관리에서 보기",
      };
    }

    if (selectedOverviewType === "active") {
      return {
        type: selectedOverviewType,
        title: DASHBOARD_OVERVIEW_LABELS[selectedOverviewType],
        description: DASHBOARD_OVERVIEW_DESCRIPTIONS[selectedOverviewType],
        items: stats.activeScoutItems,
        linkTo: "/scouts",
        linkLabel: "대원 관리에서 보기",
      };
    }

    if (selectedOverviewType === "promotionPossible") {
      return {
        type: selectedOverviewType,
        title: DASHBOARD_OVERVIEW_LABELS[selectedOverviewType],
        description: DASHBOARD_OVERVIEW_DESCRIPTIONS[selectedOverviewType],
        items: stats.promotionPossibleItems,
        linkTo: "/advancements",
        linkLabel: "진급 관리에서 보기",
      };
    }

    return {
      type: selectedOverviewType,
      title: DASHBOARD_OVERVIEW_LABELS[selectedOverviewType],
      description: DASHBOARD_OVERVIEW_DESCRIPTIONS[selectedOverviewType],
      items: stats.notReviewedScoutItems,
      linkTo: "/advancements",
      linkLabel: "진급 관리에서 보기",
    };
  }, [selectedOverviewType, stats]);

  const selectedIssueInfo = useMemo(() => {
    if (!stats || !selectedIssueType) return null;

    if (selectedIssueType === "period") {
      return {
        type: selectedIssueType,
        title: DASHBOARD_ISSUE_LABELS[selectedIssueType],
        description: DASHBOARD_ISSUE_DESCRIPTIONS[selectedIssueType],
        items: stats.periodShortageItems,
      };
    }

    if (selectedIssueType === "badge") {
      return {
        type: selectedIssueType,
        title: DASHBOARD_ISSUE_LABELS[selectedIssueType],
        description: DASHBOARD_ISSUE_DESCRIPTIONS[selectedIssueType],
        items: stats.badgeShortageItems,
      };
    }

    return {
      type: selectedIssueType,
      title: DASHBOARD_ISSUE_LABELS[selectedIssueType],
      description: DASHBOARD_ISSUE_DESCRIPTIONS[selectedIssueType],
      items: stats.programShortageItems,
    };
  }, [selectedIssueType, stats]);

  const refreshDashboard = useCallback(async () => {
    setLoadingDashboard(true);
    setDashboardError("");

    try {
      const loadedStats = await loadDashboardStats();
      setStats(loadedStats);
    } catch (error) {
      console.error("대시보드 조회 오류:", error);
      setDashboardError(
        error instanceof Error
          ? error.message
          : "현황을 불러오지 못했습니다."
      );
    } finally {
      setLoadingDashboard(false);
    }
  }, []);

  useEffect(() => {
    refreshDashboard();
  }, [refreshDashboard]);

  return (
    <div>
      <div style={pageHeaderStyle}>
        <div>
          <h1 style={pageTitleStyle}>대시보드</h1>
          <p style={pageDescriptionStyle}>
            대원 현황과 진급·기능장·집회/출석 업무를 한눈에 확인합니다.
          </p>
        </div>

        <div style={headerActionStyle}>
          <div style={roleBadgeStyle}>{ROLE_LABELS[role]}</div>
          <button type="button" onClick={refreshDashboard} style={secondaryButtonStyle}>
            새로고침
          </button>
        </div>
      </div>

      {loadingDashboard ? (
        <section style={cardStyle}>
          <p style={cardTextStyle}>대원 현황을 불러오는 중입니다...</p>
        </section>
      ) : dashboardError ? (
        <section style={errorCardStyle}>
          <h2 style={cardTitleStyle}>현황을 불러오지 못했습니다</h2>
          <p style={cardTextStyle}>{dashboardError}</p>
          <button type="button" onClick={refreshDashboard} style={secondaryButtonStyle}>
            다시 조회
          </button>
        </section>
      ) : stats ? (
        <>
          <div style={summaryGridStyle}>
            <DashboardSummaryCard
              title="전체 대원"
              value={`${stats.totalScouts}명`}
              tone="neutral"
              description="현재 등록된 대원 기준입니다."
              selected={selectedOverviewType === "total"}
              onClick={() => {
                setSelectedIssueType(null);
                setSelectedOverviewType((current) => (current === "total" ? null : "total"));
              }}
            />
            <DashboardSummaryCard
              title="활동 대원"
              value={`${stats.activeScouts}명`}
              tone="info"
              description={
                stats.scoutStatusAvailable
                  ? `비활동 ${stats.inactiveScouts}명 / 졸업 ${stats.graduatedScouts}명`
                  : "상태 구분을 확인할 수 없어 등록 대원 전체를 표시합니다."
              }
              selected={selectedOverviewType === "active"}
              onClick={() => {
                setSelectedIssueType(null);
                setSelectedOverviewType((current) => (current === "active" ? null : "active"));
              }}
            />
            <DashboardSummaryCard
              title="진급 가능"
              value={`${stats.promotionPossible}명`}
              tone="success"
              description="최근 진급 판정에서 모든 조건을 충족한 대원입니다."
              selected={selectedOverviewType === "promotionPossible"}
              onClick={() => {
                setSelectedIssueType(null);
                setSelectedOverviewType((current) =>
                  current === "promotionPossible" ? null : "promotionPossible"
                );
              }}
            />
            <DashboardSummaryCard
              title="판정 필요"
              value={`${stats.notReviewedScouts}명`}
              tone="warning"
              description={`활동 대원 중 아직 진급 판정이 진행되지 않은 대원입니다.`}
              selected={selectedOverviewType === "notReviewed"}
              onClick={() => {
                setSelectedIssueType(null);
                setSelectedOverviewType((current) =>
                  current === "notReviewed" ? null : "notReviewed"
                );
              }}
            />
          </div>

          {selectedOverviewInfo ? (
            <DashboardOverviewDetail
              title={selectedOverviewInfo.title}
              description={selectedOverviewInfo.description}
              items={selectedOverviewInfo.items}
              linkTo={selectedOverviewInfo.linkTo}
              linkLabel={selectedOverviewInfo.linkLabel}
              onClose={() => setSelectedOverviewType(null)}
            />
          ) : null}

          <div style={noticeCardStyle}>
            <strong>판정 기준 안내</strong>
            <span>
              진급 가능 여부는 활동기간·기능장·WSEP/MoP 조건을 기준으로 확인합니다. 출석률은 현재 참고 지표로 표시됩니다.
            </span>
          </div>

          <div style={sectionHeaderStyle}>
            <h2 style={sectionTitleStyle}>진급 확인 필요 항목</h2>
            <p style={sectionDescriptionStyle}>
              최근 진급 판정이 진행된 활동 대원 {stats.reviewedScouts}명을 기준으로 집계합니다.
            </p>
          </div>

          <div style={dashboardIssueGridStyle}>
            <DashboardIssueCard
              issueType="period"
              title="기간 부족"
              value={`${stats.periodShortage}명`}
              description="다음 급위까지 필요한 활동기간이 부족한 대원입니다."
              selected={selectedIssueType === "period"}
              onClick={() => {
                setSelectedOverviewType(null);
                setSelectedIssueType((current) => (current === "period" ? null : "period"));
              }}
            />
            <DashboardIssueCard
              issueType="badge"
              title="기능장 부족"
              value={`${stats.badgeShortage}명`}
              description="필수 또는 일반 기능장 조건 확인이 필요한 대원입니다."
              selected={selectedIssueType === "badge"}
              onClick={() => {
                setSelectedOverviewType(null);
                setSelectedIssueType((current) => (current === "badge" ? null : "badge"));
              }}
            />
            <DashboardIssueCard
              issueType="program"
              title="WSEP/MoP 미이수"
              value={`${stats.programShortage}명`}
              description="WSEP 또는 MoP 이수 확인이 필요한 대원입니다."
              selected={selectedIssueType === "program"}
              onClick={() => {
                setSelectedOverviewType(null);
                setSelectedIssueType((current) => (current === "program" ? null : "program"));
              }}
            />
          </div>

          {selectedIssueInfo ? (
            <DashboardIssueDetail
              issueType={selectedIssueInfo.type}
              title={selectedIssueInfo.title}
              description={selectedIssueInfo.description}
              items={selectedIssueInfo.items}
              onClose={() => setSelectedIssueType(null)}
            />
          ) : null}

          <div style={{ ...sectionHeaderStyle, marginTop: "24px" }}>
            <h2 style={sectionTitleStyle}>급위별 활동 대원</h2>
            <p style={sectionDescriptionStyle}>
              현재급위별 활동 대원 수입니다.
            </p>
          </div>

          {stats.rankCounts.length === 0 ? (
            <EmptyCard message="급위별 집계 대상 대원이 없습니다." />
          ) : (
            <div style={rankGridStyle}>
              {stats.rankCounts.map((item) => (
                <section key={item.rankId || "none"} style={rankCardStyle}>
                  <div style={rankNameStyle}>{item.rankName}</div>
                  <div style={rankCountStyle}>{item.count}명</div>
                </section>
              ))}
            </div>
          )}

          <div style={dashboardTwoColumnStyle}>
            <section>
              <div style={sectionHeaderStyle}>
                <h2 style={sectionTitleStyle}>최근 진급 인가</h2>
                <p style={sectionDescriptionStyle}>최근 등록된 진급 인가 내역입니다.</p>
              </div>
              <RecentRankApprovalList items={stats.recentRankApprovals} />
            </section>

            <section>
              <div style={sectionHeaderStyle}>
                <h2 style={sectionTitleStyle}>최근 기능장 인가</h2>
                <p style={sectionDescriptionStyle}>
                  최근 등록된 기능장 인가 내역입니다.
                  {!stats.badgeNameAvailable ? " 일부 기능장명이 확인되지 않아 식별번호로 표시됩니다." : ""}
                </p>
              </div>
              <RecentBadgeApprovalList items={stats.recentBadgeApprovals} />
            </section>
          </div>

          <div style={{ ...sectionHeaderStyle, marginTop: "32px" }}>
            <h2 style={sectionTitleStyle}>최근 집회/출석 입력 현황</h2>
            <p style={sectionDescriptionStyle}>
              최근 집회 5건의 출석 입력 상태입니다.
            </p>
          </div>

          <section style={dashboardSectionCardStyle}>
            <RecentMeetingList items={stats.recentMeetings} />
          </section>
        </>
      ) : null}

      {availableWorkMenus.length > 0 ? (
        <section style={shortcutSectionStyle}>
          <div style={shortcutHeaderStyle}>
            <div>
              <h2 style={sectionTitleStyle}>바로가기</h2>
              <p style={sectionDescriptionStyle}>
                자주 사용하는 업무 화면으로 이동합니다.
              </p>
            </div>
          </div>

          <div style={shortcutBarStyle}>
            {availableWorkMenus.map((menu) => (
              <Link key={menu.to} to={menu.to} style={shortcutLinkStyle}>
                {menu.label}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function DashboardSummaryCard({
  title,
  value,
  description,
  selected = false,
  onClick,
  tone = "neutral",
}: {
  title: string;
  value: string;
  description: string;
  selected?: boolean;
  onClick?: () => void;
  tone?: "neutral" | "info" | "success" | "warning";
}) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          ...summaryCardButtonStyle,
          ...summaryCardToneStyle(tone),
          ...(selected ? summaryCardButtonSelectedStyle : {}),
        }}
        aria-pressed={selected}
      >
        <h2 style={summaryTitleStyle}>{title}</h2>
        <p style={summaryValueStyle}>{value}</p>
        <p style={summaryDescriptionStyle}>{description}</p>
        <div style={summaryActionTextStyle}>상세 보기</div>
      </button>
    );
  }

  return (
    <section style={{ ...summaryCardStyle, ...summaryCardToneStyle(tone) }}>
      <h2 style={summaryTitleStyle}>{title}</h2>
      <p style={summaryValueStyle}>{value}</p>
      <p style={summaryDescriptionStyle}>{description}</p>
    </section>
  );
}

function DashboardOverviewDetail({
  title,
  description,
  items,
  linkTo,
  linkLabel,
  onClose,
}: {
  title: string;
  description: string;
  items: DashboardOverviewItem[];
  linkTo: string;
  linkLabel: string;
  onClose: () => void;
}) {
  return (
    <section style={issueDetailCardStyle}>
      <div style={issueDetailHeaderStyle}>
        <div>
          <h3 style={issueDetailTitleStyle}>{title} 상세</h3>
          <p style={issueDetailDescriptionStyle}>{description}</p>
        </div>
        <div style={issueDetailActionStyle}>
          <Link to={linkTo} style={cardLinkStyle}>
            {linkLabel}
          </Link>
          <button type="button" onClick={onClose} style={smallButtonStyle}>
            닫기
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <p style={emptyTextStyle}>해당 대원이 없습니다.</p>
      ) : (
        <div style={tableCardInnerStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={tableHeaderStyle}>대원</th>
                <th style={tableHeaderStyle}>대원번호</th>
                <th style={tableHeaderStyle}>학교/학년</th>
                <th style={tableHeaderStyle}>현재급위</th>
                <th style={tableHeaderStyle}>상태</th>
                <th style={tableHeaderStyle}>확인 내용</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td style={tableCellStyle}>{item.scoutName}</td>
                  <td style={tableCellStyle}>{item.memberNo}</td>
                  <td style={tableCellStyle}>{item.schoolGrade}</td>
                  <td style={tableCellStyle}>{item.currentRankName}</td>
                  <td style={tableCellStyle}>{item.statusLabel}</td>
                  <td style={tableCellStyle}>{item.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DashboardIssueCard({
  issueType,
  title,
  value,
  description,
  selected,
  onClick,
}: {
  issueType: DashboardIssueType;
  title: string;
  value: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...summaryCardButtonStyle,
        ...dashboardIssueCardStyle(issueType),
        ...(selected ? summaryCardButtonSelectedStyle : {}),
      }}
      aria-pressed={selected}
    >
      <h2 style={summaryTitleStyle}>{title}</h2>
      <p style={summaryValueStyle}>{value}</p>
      <p style={summaryDescriptionStyle}>{description}</p>
      <div style={summaryActionTextStyle}>상세 보기</div>
    </button>
  );
}

function DashboardIssueDetail({
  issueType,
  title,
  description,
  items,
  onClose,
}: {
  issueType: DashboardIssueType;
  title: string;
  description: string;
  items: DashboardIssueItem[];
  onClose: () => void;
}) {
  return (
    <section style={issueDetailCardStyle}>
      <div style={issueDetailHeaderStyle}>
        <div>
          <h3 style={issueDetailTitleStyle}>{title} 대원</h3>
          <p style={issueDetailDescriptionStyle}>{description}</p>
        </div>
        <div style={issueDetailActionStyle}>
          <Link to={`/advancements?filter=${issueType}`} style={cardLinkStyle}>
            진급 관리에서 보기
          </Link>
          <button type="button" onClick={onClose} style={smallButtonStyle}>
            닫기
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <p style={emptyTextStyle}>해당 대원이 없습니다.</p>
      ) : (
        <div style={tableCardInnerStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={tableHeaderStyle}>대원</th>
                <th style={tableHeaderStyle}>현재급위</th>
                <th style={tableHeaderStyle}>판정급위</th>
                <th style={tableHeaderStyle}>판정일</th>
                <th style={tableHeaderStyle}>확인 내용</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td style={tableCellStyle}>{item.scoutName}</td>
                  <td style={tableCellStyle}>{item.currentRankName}</td>
                  <td style={tableCellStyle}>{item.targetRankName}</td>
                  <td style={tableCellStyle}>{formatDate(item.reviewDate)}</td>
                  <td style={tableCellStyle}>{item.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function EmptyCard({ message }: { message: string }) {
  return (
    <section style={emptyCardStyle}>
      <p style={emptyTextStyle}>{message}</p>
    </section>
  );
}

function RecentRankApprovalList({ items }: { items: RecentRankApprovalItem[] }) {
  if (items.length === 0) {
    return <EmptyCard message="최근 진급 인가 내역이 없습니다." />;
  }

  return (
    <div style={listCardStyle}>
      {items.map((item) => (
        <div key={item.id} style={listItemStyle}>
          <div>
            <div style={listTitleStyle}>{item.scoutName}</div>
            <div style={listDescriptionStyle}>
              {item.rankName} / {item.approvalType}
            </div>
          </div>
          <div style={listDateStyle}>{formatDate(item.approvedAt)}</div>
        </div>
      ))}
    </div>
  );
}

function RecentBadgeApprovalList({ items }: { items: RecentBadgeApprovalItem[] }) {
  if (items.length === 0) {
    return <EmptyCard message="최근 기능장 인가 내역이 없습니다." />;
  }

  return (
    <div style={listCardStyle}>
      {items.map((item) => (
        <div key={item.id} style={listItemStyle}>
          <div>
            <div style={listTitleStyle}>{item.scoutName}</div>
            <div style={listDescriptionStyle}>{item.badgeName}</div>
          </div>
          <div style={listDateStyle}>{formatDate(item.approvedAt || item.acquiredAt)}</div>
        </div>
      ))}
    </div>
  );
}

function RecentMeetingList({ items }: { items: RecentMeetingItem[] }) {
  if (items.length === 0) {
    return <EmptyCard message="최근 집회 내역이 없습니다." />;
  }

  return (
    <div style={tableCardStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={tableHeaderStyle}>일자</th>
            <th style={tableHeaderStyle}>집회명</th>
            <th style={tableHeaderStyle}>구분</th>
            <th style={tableHeaderStyle}>출석대상</th>
            <th style={tableHeaderStyle}>입력</th>
            <th style={tableHeaderStyle}>출석</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td style={tableCellStyle}>{formatDate(item.meetingDate)}</td>
              <td style={tableCellStyle}>{item.title}</td>
              <td style={tableCellStyle}>{item.meetingType}</td>
              <td style={tableCellStyle}>{item.isAttendanceTarget ? "대상" : "제외"}</td>
              <td style={tableCellStyle}>
                {item.attendanceEntered}/{item.attendanceTotal}
              </td>
              <td style={tableCellStyle}>{item.attendancePresent}명</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const [role, setRole] = useState<UserRole | null>(null);
  const [organizationInfo, setOrganizationInfo] = useState<OrganizationInfo | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loadingRole, setLoadingRole] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const organizationSetupComplete = useMemo(() => {
    return isOrganizationSetupComplete(role, organizationInfo);
  }, [organizationInfo, role]);

  const visibleMenus = useMemo(() => {
    if (!role) return [];

    const menus = MENU_ITEMS.filter((menu) => menu.allowedRoles.includes(role)).map((menu) => ({
      ...menu,
      label: getMenuLabelForRole(role, menu),
    }));

    if (isOrganizationSetupRequired(role) && !organizationSetupComplete) {
      return menus.filter((menu) => menu.to === "/settings");
    }

    return sortMenusForRole(role, menus);
  }, [organizationSetupComplete, role]);

  useEffect(() => {
    const loadRole = async () => {
      setLoadingRole(true);
      setErrorMessage("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        navigate("/login", { replace: true });
        return;
      }

      setCurrentUserId(user.id);

      const { data: profile, error: profileError } = await supabase
        .from("user_profiles")
        .select("role, organization_id")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .maybeSingle();

      if (profileError) {
        console.error("권한 조회 오류:", profileError.message);
        setErrorMessage("사용자 정보를 확인하지 못했습니다.");
        setLoadingRole(false);
        return;
      }

      if (!profile || !isUserRole(profile.role)) {
        setErrorMessage("사용자 정보가 올바르지 않습니다.");
        setLoadingRole(false);
        return;
      }

      setRole(profile.role);

      const organizationId =
        typeof profile.organization_id === "string" ? profile.organization_id : null;

      if (organizationId) {
        const loadedOrganizationInfo = await fetchOrganizationInfo(organizationId);
        setOrganizationInfo(loadedOrganizationInfo);
      } else {
        setOrganizationInfo(null);
      }

      setLoadingRole(false);
    };

    loadRole();
  }, [navigate]);

  useEffect(() => {
    const handleOrganizationInfoUpdated = async () => {
      if (!currentUserId) return;

      const { data: profile, error: profileError } = await supabase
        .from("user_profiles")
        .select("organization_id")
        .eq("user_id", currentUserId)
        .is("deleted_at", null)
        .maybeSingle();

      if (profileError) {
        console.error("소속대 정보 새로고침 오류:", profileError.message);
        return;
      }

      const organizationId =
        typeof profile?.organization_id === "string" ? profile.organization_id : null;

      const loadedOrganizationInfo = await fetchOrganizationInfo(organizationId);
      setOrganizationInfo(loadedOrganizationInfo);
    };

    window.addEventListener("organization-info-updated", handleOrganizationInfoUpdated);

    return () => {
      window.removeEventListener("organization-info-updated", handleOrganizationInfoUpdated);
    };
  }, [currentUserId]);

  useEffect(() => {
    if (loadingRole || !role) return;
    if (!isOrganizationSetupRequired(role)) return;
    if (organizationSetupComplete) return;
    if (location.pathname === "/settings") return;

    navigate("/settings", { replace: true });
  }, [loadingRole, location.pathname, navigate, organizationSetupComplete, role]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  useEffect(() => {
    const handleSidebarPointerDownCapture = (event: PointerEvent) => {
      const target = event.target;

      if (target instanceof Element && target.closest('[data-app-sidebar="true"]')) {
        return;
      }

      if (event.clientX < 0 || event.clientX > 240) {
        return;
      }

      const menuButtons = Array.from(
        document.querySelectorAll<HTMLElement>("[data-sidebar-menu-to]"),
      );

      const matchedButton = menuButtons.find((button) => {
        const rect = button.getBoundingClientRect();

        return (
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom
        );
      });

      const targetPath = matchedButton?.dataset.sidebarMenuTo;

      if (!targetPath || targetPath === location.pathname) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      navigate(targetPath);
    };

    document.addEventListener("pointerdown", handleSidebarPointerDownCapture, true);

    return () => {
      document.removeEventListener("pointerdown", handleSidebarPointerDownCapture, true);
    };
  }, [location.pathname, navigate, visibleMenus]);

  if (loadingRole) {
    return (
      <div style={loadingPageStyle}>
        사용자 정보를 확인하는 중입니다...
      </div>
    );
  }

  if (!role || errorMessage) {
    return (
      <div style={loadingPageStyle}>
        <h1 style={pageTitleStyle}>사용자 확인 필요</h1>
        <p style={pageDescriptionStyle}>
          {errorMessage || "사용자 정보를 확인할 수 없습니다."}
        </p>
        <button type="button" onClick={handleLogout} style={errorLogoutButtonStyle}>
          로그아웃
        </button>
      </div>
    );
  }

  return (
    <div style={layoutStyle}>
      <style>
        {`
          .app-fixed-sidebar,
          .app-fixed-sidebar * {
            pointer-events: auto !important;
          }

          .app-side-menu-button {
            transition:
              background-color 140ms ease,
              color 140ms ease,
              transform 140ms ease,
              box-shadow 140ms ease;
          }

          .app-side-menu-button:hover {
            background-color: rgba(59, 130, 246, 0.16) !important;
            color: #ffffff !important;
            transform: translateX(2px);
          }

          .app-side-menu-button:focus-visible {
            outline: 2px solid #93c5fd;
            outline-offset: 2px;
          }

          .app-fixed-sidebar {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 240px !important;
            height: 100vh !important;
            z-index: 2147483647 !important;
          }

          #app-main-content {
            position: relative !important;
            z-index: 0 !important;
            margin-left: 240px !important;
            width: calc(100vw - 240px) !important;
            max-width: calc(100vw - 240px) !important;
            overflow-x: hidden !important;
          }
        `}
      </style>

      <aside className="app-fixed-sidebar" data-app-sidebar="true" style={sidebarStyle}>
        <div style={logoAreaStyle}>
          <div style={sidebarLogoBoxStyle}>
            {organizationInfo?.logoUrl ? (
              <img
                src={organizationInfo.logoUrl}
                alt={`${organizationInfo.name} 로고`}
                style={sidebarLogoImageStyle}
              />
            ) : (
              <div style={logoTitleStyle}>Scout</div>
            )}
          </div>
          <div style={logoInfoLineStyle}>
            {role === "super_admin" ? (
              <>
                <span>최고관리자</span>
                <span style={logoInfoDividerStyle}>|</span>
                <span>전체 소속대 관리</span>
              </>
            ) : (
              <>
                <span>{organizationInfo?.name || "소속대 정보 등록 필요"}</span>
                {organizationInfo?.unitNumber ? (
                  <>
                    <span style={logoInfoDividerStyle}>|</span>
                    <span>대번호 {organizationInfo.unitNumber}</span>
                  </>
                ) : isOrganizationSetupRequired(role) ? (
                  <>
                    <span style={logoInfoDividerStyle}>|</span>
                    <span>대번호 미등록</span>
                  </>
                ) : null}
              </>
            )}
          </div>
          <div style={loginInfoStyle}>{role === "super_admin" ? "운영 관리" : "로그인 정보"}</div>
          <button type="button" onClick={handleLogout} style={logoutButtonStyle}>
            로그아웃
          </button>
        </div>

        {isOrganizationSetupRequired(role) && !organizationSetupComplete ? (
          <div style={setupRequiredSidebarStyle}>
            소속대 정보 등록 후 이용할 수 있습니다.
          </div>
        ) : null}

        <div style={sidebarSeparatorStyle} />

        <nav style={navStyle}>
          {visibleMenus.map((menu) => {
            const groupLabel = getSidebarGroupLabel(role, menu.to);

            return (
              <div key={menu.to} style={sideMenuItemWrapStyle}>
                {groupLabel ? (
                  <div style={menuGroupLabelStyle}>{groupLabel}</div>
                ) : null}
                <SideMenuLink to={menu.to} label={menu.label} />
              </div>
            );
          })}
        </nav>

      </aside>

      <main id="app-main-content" style={mainStyle}>
        {isOrganizationSetupRequired(role) && !organizationSetupComplete ? (
          <section style={setupRequiredNoticeStyle}>
            <h2 style={setupRequiredTitleStyle}>소속대 정보를 먼저 등록하세요</h2>
            <p style={setupRequiredTextStyle}>
              대번호와 소속 대명을 등록한 뒤 대원 관리, 진급 관리, 기능장 관리, 보고서 출력 기능을 사용할 수 있습니다.
            </p>
          </section>
        ) : null}

        <Routes>
          <Route
            path="/"
            element={<Navigate to={organizationSetupComplete ? "/dashboard" : "/settings"} replace />}
          />

          <Route
            path="/dashboard"
            element={
              organizationSetupComplete ? (
                <DashboardHome role={role} visibleMenus={visibleMenus} />
              ) : (
                <Navigate to="/settings" replace />
              )
            }
          />
          <Route
            path="/scout-integrated"
            element={
              organizationSetupComplete ? (
                <ScoutIntegratedPage />
              ) : (
                <Navigate to="/settings" replace />
              )
            }
          />
          <Route
            path="/scouts"
            element={organizationSetupComplete ? <ScoutsPage /> : <Navigate to="/settings" replace />}
          />
          <Route
            path="/advancements"
            element={organizationSetupComplete ? <AdvancementsPage /> : <Navigate to="/settings" replace />}
          />
          <Route
            path="/merit-badges"
            element={organizationSetupComplete ? <MeritBadgesPage /> : <Navigate to="/settings" replace />}
          />
          <Route
            path="/program-completions"
            element={organizationSetupComplete ? <ProgramCompletionsPage /> : <Navigate to="/settings" replace />}
          />
          <Route
            path="/meetings"
            element={organizationSetupComplete ? <MeetingsPage /> : <Navigate to="/settings" replace />}
          />
          <Route
            path="/reports"
            element={organizationSetupComplete ? <ReportsPage /> : <Navigate to="/settings" replace />}
          />
          <Route path="/settings" element={<SettingsPage />} />

          <Route element={<SuperAdminRoute />}>
            <Route
              path="/admin/signup-requests"
              element={<SignupRequestsPage />}
            />
            <Route
              path="/admin/organizations"
              element={<OrganizationsPage />}
            />
            <Route
              path="/admin/organization-backups"
              element={<OrganizationBackupsPage />}
            />
          </Route>

          <Route
            path="*"
            element={<Navigate to={organizationSetupComplete ? "/dashboard" : "/settings"} replace />}
          />
        </Routes>
      </main>
    </div>
  );
}

function SideMenuLink({ to, label }: { to: string; label: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isActive =
    location.pathname === to ||
    (to !== "/dashboard" && location.pathname.startsWith(`${to}/`));

  const moveToMenu = () => {
    if (location.pathname === to) {
      navigate(to, { replace: true });
      return;
    }

    navigate(to);

    if (location.pathname === "/reports") {
      window.setTimeout(() => {
        if (window.location.pathname === "/reports") {
          window.location.assign(to);
        }
      }, 120);
    }
  };

  return (
    <button
      type="button"
      className="app-side-menu-button"
      data-sidebar-menu-to={to}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        moveToMenu();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        moveToMenu();
      }}
      style={{
        width: "100%",
        display: "block",
        position: "relative",
        zIndex: 2147483647,
        pointerEvents: "auto",
        userSelect: "none",
        minHeight: "42px",
        padding: "10px 12px 10px 14px",
        borderRadius: "9px",
        border: isActive ? "1px solid #60a5fa" : "1px solid transparent",
        color: isActive ? "#ffffff" : "#cbd5e1",
        backgroundColor: isActive ? "#2563eb" : "transparent",
        boxShadow: isActive
          ? "inset 4px 0 0 #bfdbfe, 0 6px 14px rgba(15, 23, 42, 0.18)"
          : "none",
        textAlign: "left",
        textDecoration: "none",
        fontFamily: "inherit",
        fontSize: "14px",
        lineHeight: 1.35,
        fontWeight: isActive ? 800 : 600,
        cursor: "pointer",
      }}
      aria-current={isActive ? "page" : undefined}
    >
      {label}
    </button>
  );
}

function App() {
  return (
    <Routes>
      {/* 공개 페이지 */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/pending-approval" element={<PendingApprovalPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      {/* 승인된 사용자만 접근 가능 */}
      <Route element={<ApprovedRoute />}>
        <Route path="/*" element={<AppLayout />} />
      </Route>
    </Routes>
  );
}

const loadingPageStyle: CSSProperties = {
  minHeight: "100vh",
  padding: "40px",
  boxSizing: "border-box",
  backgroundColor: "#f8fafc",
};

const layoutStyle: CSSProperties = {
  minHeight: "100vh",
  position: "relative",
  isolation: "isolate",
  backgroundColor: "#f8fafc",
  overflowX: "hidden",
};

const sidebarStyle: CSSProperties = {
  width: "240px",
  height: "100vh",
  position: "fixed",
  left: 0,
  top: 0,
  zIndex: 2147483647,
  backgroundColor: "#0f172a",
  color: "#ffffff",
  padding: "18px 14px",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  overflowY: "auto",
  overflowX: "hidden",
  pointerEvents: "auto",
  isolation: "isolate",
  transform: "translateZ(0)",
};

const logoAreaStyle: CSSProperties = {
  marginBottom: "12px",
  padding: 0,
};

const sidebarLogoBoxStyle: CSSProperties = {
  width: "100%",
  height: "82px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  marginBottom: "10px",
  borderRadius: "12px",
  backgroundColor: "#ffffff",
  overflow: "hidden",
  padding: "6px",
  boxSizing: "border-box",
};

const sidebarLogoImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  objectPosition: "center",
  display: "block",
};

const logoTitleStyle: CSSProperties = {
  fontSize: "24px",
  fontWeight: 800,
  lineHeight: "1.2",
  color: "#0f172a",
};

const logoInfoLineStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
  minHeight: "20px",
  color: "#e2e8f0",
  fontSize: "13px",
  fontWeight: 800,
  lineHeight: 1.35,
  textAlign: "center",
  wordBreak: "keep-all",
};

const logoInfoDividerStyle: CSSProperties = {
  color: "#64748b",
  fontWeight: 700,
};

const loginInfoStyle: CSSProperties = {
  marginTop: "6px",
  color: "#93c5fd",
  fontSize: "11px",
  fontWeight: 800,
  textAlign: "center",
};

const sidebarSeparatorStyle: CSSProperties = {
  height: "1px",
  backgroundColor: "rgba(148, 163, 184, 0.22)",
  margin: "0 0 12px",
};

const setupRequiredSidebarStyle: CSSProperties = {
  marginBottom: "14px",
  padding: "10px 12px",
  borderRadius: "10px",
  backgroundColor: "rgba(37, 99, 235, 0.16)",
  color: "#bfdbfe",
  fontSize: "12px",
  fontWeight: 800,
  lineHeight: 1.5,
  textAlign: "center",
};

const navStyle: CSSProperties = {
  display: "flex",
  position: "relative",
  zIndex: 2147483647,
  flexDirection: "column",
  gap: "5px",
  pointerEvents: "auto",
};

const sideMenuItemWrapStyle: CSSProperties = {
  display: "block",
  position: "relative",
  zIndex: 2147483647,
  pointerEvents: "auto",
};

const menuGroupLabelStyle: CSSProperties = {
  margin: "12px 8px 5px",
  color: "#64748b",
  fontSize: "11px",
  fontWeight: 900,
  letterSpacing: "0.04em",
};

const mainStyle: CSSProperties = {
  marginLeft: "240px",
  width: "calc(100vw - 240px)",
  maxWidth: "calc(100vw - 240px)",
  minWidth: 0,
  minHeight: "100vh",
  padding: "40px",
  boxSizing: "border-box",
  position: "relative",
  zIndex: 0,
  overflowX: "hidden",
  isolation: "isolate",
  contain: "paint",
};

const setupRequiredNoticeStyle: CSSProperties = {
  marginBottom: "24px",
  padding: "18px 20px",
  borderRadius: "14px",
  border: "1px solid #bfdbfe",
  backgroundColor: "#eff6ff",
  color: "#1e3a8a",
};

const setupRequiredTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "20px",
  fontWeight: 900,
};

const setupRequiredTextStyle: CSSProperties = {
  marginTop: "8px",
  marginBottom: 0,
  fontSize: "14px",
  lineHeight: 1.6,
};

const pageHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "20px",
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

const headerActionStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  flexWrap: "wrap",
  justifyContent: "flex-end",
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

const secondaryButtonStyle: CSSProperties = {
  padding: "8px 12px",
  borderRadius: "8px",
  border: "1px solid #cbd5e1",
  backgroundColor: "#ffffff",
  color: "#334155",
  fontSize: "14px",
  fontWeight: 700,
  cursor: "pointer",
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: "12px",
  marginBottom: "16px",
};

const summaryCardStyle: CSSProperties = {
  minHeight: "118px",
  border: "1px solid #e5e7eb",
  borderRadius: "14px",
  padding: "15px 16px",
  backgroundColor: "#ffffff",
  display: "flex",
  flexDirection: "column",
  boxSizing: "border-box",
};

function summaryCardToneStyle(
  tone: "neutral" | "info" | "success" | "warning",
): CSSProperties {
  const palette = {
    neutral: { borderColor: "#cbd5e1", backgroundColor: "#ffffff" },
    info: { borderColor: "#bfdbfe", backgroundColor: "#f8fbff" },
    success: { borderColor: "#86efac", backgroundColor: "#f0fdf4" },
    warning: { borderColor: "#fcd34d", backgroundColor: "#fffbeb" },
  }[tone];

  return {
    borderColor: palette.borderColor,
    backgroundColor: palette.backgroundColor,
  };
}

function dashboardIssueCardStyle(
  issueType: DashboardIssueType,
): CSSProperties {
  const palette = {
    period: { borderColor: "#fca5a5", backgroundColor: "#fef2f2" },
    badge: { borderColor: "#fdba74", backgroundColor: "#fff7ed" },
    program: { borderColor: "#fde68a", backgroundColor: "#fffbeb" },
  }[issueType];

  return {
    borderColor: palette.borderColor,
    backgroundColor: palette.backgroundColor,
  };
}

const dashboardIssueGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: "12px",
  marginBottom: "16px",
};

const dashboardSectionCardStyle: CSSProperties = {
  padding: "15px",
  border: "1px solid #e2e8f0",
  borderRadius: "14px",
  backgroundColor: "#ffffff",
};

const summaryCardButtonStyle: CSSProperties = {
  ...summaryCardStyle,
  width: "100%",
  textAlign: "left",
  cursor: "pointer",
  fontFamily: "inherit",
};

const summaryCardButtonSelectedStyle: CSSProperties = {
  border: "2px solid #2563eb",
  boxShadow: "0 0 0 3px rgba(37, 99, 235, 0.14), 0 8px 18px rgba(15, 23, 42, 0.06)",
};

const summaryActionTextStyle: CSSProperties = {
  marginTop: "auto",
  paddingTop: "8px",
  color: "#2563eb",
  fontSize: "12px",
  fontWeight: 800,
};

const summaryTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "15px",
  color: "#475569",
};

const summaryValueStyle: CSSProperties = {
  marginTop: "7px",
  marginBottom: 0,
  fontSize: "25px",
  fontWeight: 800,
  color: "#0f172a",
};

const summaryDescriptionStyle: CSSProperties = {
  marginTop: "6px",
  marginBottom: 0,
  color: "#64748b",
  fontSize: "12px",
  lineHeight: 1.45,
};

const noticeCardStyle: CSSProperties = {
  display: "flex",
  gap: "10px",
  alignItems: "center",
  border: "1px solid #bfdbfe",
  borderRadius: "10px",
  padding: "9px 12px",
  backgroundColor: "#eff6ff",
  color: "#1e3a8a",
  fontSize: "14px",
  lineHeight: 1.5,
  marginBottom: "20px",
};

const sectionHeaderStyle: CSSProperties = {
  marginBottom: "10px",
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "20px",
  fontWeight: 800,
  color: "#0f172a",
};

const sectionDescriptionStyle: CSSProperties = {
  marginTop: "6px",
  marginBottom: 0,
  color: "#64748b",
  lineHeight: 1.5,
};

const shortcutSectionStyle: CSSProperties = {
  marginTop: "28px",
};

const shortcutHeaderStyle: CSSProperties = {
  marginBottom: "12px",
};

const shortcutBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  flexWrap: "wrap",
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  padding: "12px",
  backgroundColor: "#ffffff",
};

const shortcutLinkStyle: CSSProperties = {
  minHeight: "36px",
  padding: "0 14px",
  borderRadius: "9px",
  border: "1px solid #dbeafe",
  backgroundColor: "#eff6ff",
  color: "#2563eb",
  fontSize: "14px",
  fontWeight: 800,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const cardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  padding: "20px",
  backgroundColor: "#ffffff",
};

const emptyCardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  padding: "16px 18px",
  backgroundColor: "#ffffff",
};

const errorCardStyle: CSSProperties = {
  border: "1px solid #fecaca",
  borderRadius: "12px",
  padding: "20px",
  backgroundColor: "#fef2f2",
};

const cardTitleStyle: CSSProperties = {
  fontSize: "20px",
  marginTop: 0,
  marginBottom: "8px",
  color: "#0f172a",
};

const cardTextStyle: CSSProperties = {
  marginTop: 0,
  marginBottom: "16px",
  color: "#475569",
  lineHeight: 1.6,
};

const emptyTextStyle: CSSProperties = {
  margin: 0,
  color: "#64748b",
  lineHeight: 1.6,
};

const issueDetailCardStyle: CSSProperties = {
  border: "1px solid #bfdbfe",
  borderRadius: "14px",
  padding: "18px",
  backgroundColor: "#ffffff",
  boxShadow: "0 8px 22px rgba(15, 23, 42, 0.05)",
  marginTop: "-6px",
  marginBottom: "24px",
};

const issueDetailHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "16px",
  marginBottom: "16px",
};

const issueDetailTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "20px",
  fontWeight: 800,
  color: "#0f172a",
};

const issueDetailDescriptionStyle: CSSProperties = {
  marginTop: "6px",
  marginBottom: 0,
  color: "#64748b",
  lineHeight: 1.5,
};

const issueDetailActionStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const smallButtonStyle: CSSProperties = {
  padding: "6px 10px",
  borderRadius: "8px",
  border: "1px solid #cbd5e1",
  backgroundColor: "#ffffff",
  color: "#334155",
  fontSize: "13px",
  fontWeight: 700,
  cursor: "pointer",
};

const tableCardInnerStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: "10px",
  overflowX: "auto",
};

const cardLinkStyle: CSSProperties = {
  color: "#2563eb",
  fontWeight: 700,
  textDecoration: "none",
};

const rankGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
  gap: "9px",
  marginBottom: "22px",
};

const rankCardStyle: CSSProperties = {
  minHeight: "52px",
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  padding: "10px 12px",
  backgroundColor: "#ffffff",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  boxSizing: "border-box",
};

const rankNameStyle: CSSProperties = {
  color: "#475569",
  fontSize: "14px",
  fontWeight: 800,
};

const rankCountStyle: CSSProperties = {
  color: "#0f172a",
  fontSize: "20px",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const dashboardTwoColumnStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "14px",
  alignItems: "start",
};

const listCardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  backgroundColor: "#ffffff",
  overflow: "hidden",
};

const listItemStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "12px",
  padding: "9px 12px",
  borderBottom: "1px solid #f1f5f9",
};

const listTitleStyle: CSSProperties = {
  color: "#0f172a",
  fontWeight: 800,
};

const listDescriptionStyle: CSSProperties = {
  marginTop: "4px",
  color: "#64748b",
  fontSize: "14px",
};

const listDateStyle: CSSProperties = {
  color: "#475569",
  fontSize: "14px",
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const organizationFilterBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  flexWrap: "wrap",
  marginBottom: "12px",
};

const organizationFilterButtonStyle: CSSProperties = {
  minHeight: "36px",
  padding: "0 12px",
  borderRadius: "999px",
  border: "1px solid #cbd5e1",
  backgroundColor: "#ffffff",
  color: "#334155",
  fontSize: "13px",
  fontWeight: 800,
  display: "inline-flex",
  alignItems: "center",
  gap: "7px",
  cursor: "pointer",
  fontFamily: "inherit",
};

const organizationFilterButtonActiveStyle: CSSProperties = {
  border: "1px solid #2563eb",
  backgroundColor: "#eff6ff",
  color: "#1d4ed8",
  boxShadow: "0 0 0 3px rgba(37, 99, 235, 0.1)",
};

const organizationFilterCountStyle: CSSProperties = {
  color: "inherit",
  fontSize: "13px",
  fontWeight: 900,
};

const tableCardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  backgroundColor: "#ffffff",
  overflowX: "auto",
  marginBottom: "20px",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: "720px",
};

const tableHeaderStyle: CSSProperties = {
  padding: "10px 14px",
  borderBottom: "1px solid #e5e7eb",
  backgroundColor: "#f8fafc",
  color: "#334155",
  fontSize: "14px",
  textAlign: "left",
  whiteSpace: "nowrap",
};

const tableCellStyle: CSSProperties = {
  padding: "10px 14px",
  borderBottom: "1px solid #f1f5f9",
  color: "#475569",
  fontSize: "14px",
  verticalAlign: "top",
};

const logoutButtonStyle: CSSProperties = {
  width: "100%",
  marginTop: "10px",
  position: "relative",
  zIndex: 2147483647,
  pointerEvents: "auto",
  minHeight: "36px",
  padding: "0 12px",
  borderRadius: "8px",
  border: "1px solid rgba(248, 113, 113, 0.72)",
  backgroundColor: "rgba(127, 29, 29, 0.34)",
  color: "#fecaca",
  fontWeight: 800,
  cursor: "pointer",
};

const errorLogoutButtonStyle: CSSProperties = {
  marginTop: "20px",
  padding: "12px 16px",
  borderRadius: "8px",
  border: "none",
  backgroundColor: "#ef4444",
  color: "#ffffff",
  fontWeight: 700,
  cursor: "pointer",
};

export default App;
