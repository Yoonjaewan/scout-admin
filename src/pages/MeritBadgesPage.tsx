import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { EmptyState, PageHelpButton } from "../components/common/CommonFeedback";
import { supabase } from "../lib/supabase";

type UserRole = "super_admin" | "org_admin" | "leader" | "viewer";
type ScoutStatus = "active" | "inactive" | "graduated";
type BadgeWorkFilter = "all" | "support" | "required" | "general" | "unconfirmed" | "unapproved";

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
  created_at: string;
};

type PromotionBadgeUsage = {
  id: string;
  scout_badge_id: string;
};

type BadgeForm = {
  scout_id: string;
  badge_id: string;
  acquired_at: string;
  approved_at: string;
  instructor_name: string;
  leader_confirmed: boolean;
  note: string;
};

type BadgeEditForm = {
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

type MeritBadgeSortKey =
  | "member_no"
  | "name"
  | "organization"
  | "school_name"
  | "category"
  | "badge"
  | "badge_type"
  | "special_rule"
  | "acquired_at"
  | "approved_at"
  | "leader_confirmed"
  | "usage"
  | "note";

type SortDirection = "asc" | "desc";

type MeritBadgeSortConfig = {
  key: MeritBadgeSortKey;
  direction: SortDirection;
};

const DEFAULT_MERIT_BADGE_SORT: MeritBadgeSortConfig = {
  key: "acquired_at",
  direction: "desc",
};

const DEFAULT_SUMMARY_BADGE_SORT: MeritBadgeSortConfig = {
  key: "category",
  direction: "asc",
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

function getEmptyBadgeForm(): BadgeForm {
  return {
    scout_id: "",
    badge_id: "",
    acquired_at: getTodayText(),
    approved_at: "",
    instructor_name: "",
    leader_confirmed: false,
    note: "",
  };
}

function getEmptyBadgeEditForm(): BadgeEditForm {
  return {
    id: "",
    badge_id: "",
    acquired_at: getTodayText(),
    approved_at: "",
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

function toDateInputText(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return value.slice(0, 10);
}

function getSpecialRuleLabel(value: string) {
  if (value === "none") return "일반 기준";
  if (value === "after_swimming_badge") return "수영장 이후 취득";
  if (value === "after_mugunghwa_rank") return "무궁화 이후 취득";
  return value;
}

function getBadgeTypeLabel(badge: Badge | null) {
  if (!badge) return "-";

  if (badge.is_required_badge && badge.is_general_badge) {
    return "필수/일반";
  }

  if (badge.is_required_badge) {
    return "필수";
  }

  if (badge.is_general_badge) {
    return "일반";
  }

  return "기타";
}

export default function MeritBadgesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [scouts, setScouts] = useState<Scout[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [badgeCategories, setBadgeCategories] = useState<BadgeCategory[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [rankRequirements, setRankRequirements] = useState<RankRequirement[]>([]);
  const [rankRequiredBadges, setRankRequiredBadges] = useState<RankRequiredBadge[]>([]);
  const [scoutBadges, setScoutBadges] = useState<ScoutBadge[]>([]);
  const [promotionBadgeUsages, setPromotionBadgeUsages] = useState<PromotionBadgeUsage[]>([]);

  const [keyword, setKeyword] = useState("");
  const [selectedScoutId, setSelectedScoutId] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [selectedScoutBadgeId, setSelectedScoutBadgeId] = useState("");
  const [selectedSummaryScoutId, setSelectedSummaryScoutId] = useState("");
  const [badgeWorkFilter, setBadgeWorkFilter] = useState<BadgeWorkFilter>("all");

  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [createForm, setCreateForm] = useState<BadgeForm>(getEmptyBadgeForm());

  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
  const [editForm, setEditForm] = useState<BadgeEditForm>(getEmptyBadgeEditForm());

  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [formErrorMessage, setFormErrorMessage] = useState("");
  const [editErrorMessage, setEditErrorMessage] = useState("");

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [sortConfig, setSortConfig] = useState<MeritBadgeSortConfig>(
    DEFAULT_MERIT_BADGE_SORT,
  );
  const [summarySortConfig, setSummarySortConfig] = useState<MeritBadgeSortConfig>(
    DEFAULT_SUMMARY_BADGE_SORT,
  );

  const canManageBadges =
    profile?.role === "super_admin" ||
    profile?.role === "org_admin" ||
    profile?.role === "leader";

  const isSuperAdmin = profile?.role === "super_admin";

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

    const { data: rankRequirementData, error: rankRequirementError } = await supabase
      .from("rank_requirements")
      .select("id, from_rank_id, to_rank_id, required_general_badge_count");

    if (rankRequirementError) {
      console.error("진급 기능장 기준 조회 오류:", rankRequirementError.message);
      setErrorMessage("진급 기능장 기준을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const { data: rankRequiredBadgeData, error: rankRequiredBadgeError } = await supabase
      .from("rank_required_badges")
      .select("id, rank_requirement_id, badge_id, sort_order")
      .order("sort_order", { ascending: true });

    if (rankRequiredBadgeError) {
      console.error("필수 기능장 기준 조회 오류:", rankRequiredBadgeError.message);
      setErrorMessage("필수 기능장 기준을 불러오지 못했습니다.");
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
      .select("id, organization_id, name, member_no, school_name, grade, current_rank_id, status")
      .is("deleted_at", null)
      .order("name", { ascending: true });

    let scoutBadgeQuery = supabase
      .from("scout_badges")
      .select(
        "id, organization_id, scout_id, badge_id, acquired_at, approved_at, instructor_name, leader_confirmed, note, created_at",
      )
      .is("deleted_at", null)
      .order("acquired_at", { ascending: false })
      .order("created_at", { ascending: false });

    let promotionBadgeUsageQuery = supabase
      .from("promotion_badge_usages")
      .select("id, organization_id, scout_badge_id")
      .is("deleted_at", null);

    if (currentProfile.role !== "super_admin") {
      if (!currentProfile.organization_id) {
        setErrorMessage("소속 조직 정보가 없어 기능장 정보를 조회할 수 없습니다.");
        setLoading(false);
        return;
      }

      scoutQuery = scoutQuery.eq("organization_id", currentProfile.organization_id);
      scoutBadgeQuery = scoutBadgeQuery.eq(
        "organization_id",
        currentProfile.organization_id,
      );
      promotionBadgeUsageQuery = promotionBadgeUsageQuery.eq(
        "organization_id",
        currentProfile.organization_id,
      );
    }

    const { data: scoutData, error: scoutError } = await scoutQuery;

    if (scoutError) {
      console.error("대원 목록 조회 오류:", scoutError.message);
      setErrorMessage("대원 목록을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const { data: scoutBadgeData, error: scoutBadgeError } = await scoutBadgeQuery;

    if (scoutBadgeError) {
      console.error("대원 기능장 조회 오류:", scoutBadgeError.message);
      setErrorMessage("대원 기능장 취득 현황을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const { data: promotionBadgeUsageData, error: promotionBadgeUsageError } =
      await promotionBadgeUsageQuery;

    if (promotionBadgeUsageError) {
      console.error("기능장 사용 이력 조회 오류:", promotionBadgeUsageError.message);
      setErrorMessage("기능장 사용 이력을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    setBadgeCategories((categoryData ?? []) as BadgeCategory[]);
    setBadges((badgeData ?? []) as Badge[]);
    setRanks((rankData ?? []) as Rank[]);
    setRankRequirements((rankRequirementData ?? []) as RankRequirement[]);
    setRankRequiredBadges((rankRequiredBadgeData ?? []) as RankRequiredBadge[]);
    setOrganizations((organizationData ?? []) as Organization[]);
    setScouts((scoutData ?? []) as unknown as Scout[]);
    setScoutBadges((scoutBadgeData ?? []) as unknown as ScoutBadge[]);
    setPromotionBadgeUsages(
      (promotionBadgeUsageData ?? []) as unknown as PromotionBadgeUsage[],
    );
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const scoutIdFromUrl = searchParams.get("scoutId") ?? "";

    setSelectedScoutId(scoutIdFromUrl);
    setSelectedScoutBadgeId("");
  }, [searchParams]);

  const handleChangeSelectedScoutId = (value: string) => {
    const nextSearchParams = new URLSearchParams(searchParams);

    if (value) {
      nextSearchParams.set("scoutId", value);
    } else {
      nextSearchParams.delete("scoutId");
    }

    setSearchParams(nextSearchParams);
    setSelectedScoutId(value);
    setSelectedScoutBadgeId("");
    setIsCreateFormOpen(false);
    setIsEditFormOpen(false);
    setFormErrorMessage("");
    setEditErrorMessage("");
  };

  const organizationNameMap = useMemo(() => {
    return new Map(
      organizations.map((organization) => [organization.id, organization.name]),
    );
  }, [organizations]);

  const scoutMap = useMemo(() => {
    return new Map(scouts.map((scout) => [scout.id, scout]));
  }, [scouts]);

  const badgeMap = useMemo(() => {
    return new Map(badges.map((badge) => [badge.id, badge]));
  }, [badges]);

  const categoryMap = useMemo(() => {
    return new Map(
      badgeCategories.map((category) => [category.id, category]),
    );
  }, [badgeCategories]);

  const usedScoutBadgeIdSet = useMemo(() => {
    return new Set(promotionBadgeUsages.map((usage) => usage.scout_badge_id));
  }, [promotionBadgeUsages]);

  const rankMap = useMemo(
    () => new Map(ranks.map((rank) => [rank.id, rank])),
    [ranks],
  );

  const requiredBadgeGroups = useMemo(() => {
    return rankRequirements
      .map((requirement) => {
        const fromRank = rankMap.get(requirement.from_rank_id) ?? null;
        const toRank = rankMap.get(requirement.to_rank_id) ?? null;
        const mappings = rankRequiredBadges
          .filter((row) => row.rank_requirement_id === requirement.id)
          .sort((a, b) => a.sort_order - b.sort_order);
        const groupBadges = mappings
          .map((row) => badgeMap.get(row.badge_id) ?? null)
          .filter((badge): badge is Badge => badge !== null);

        return {
          requirement,
          fromRank,
          toRank,
          label: `${fromRank?.rank_name ?? "현재급위"} → ${toRank?.rank_name ?? "다음급위"} 필수 기능장`,
          badges: groupBadges,
        };
      })
      .filter((group) => group.badges.length > 0)
      .sort((a, b) =>
        (a.fromRank?.sort_order ?? 9999) - (b.fromRank?.sort_order ?? 9999),
      );
  }, [badgeMap, rankMap, rankRequirements, rankRequiredBadges]);

  const requiredBadgeIdSet = useMemo(
    () => new Set(rankRequiredBadges.map((row) => row.badge_id)),
    [rankRequiredBadges],
  );

  const generalBadgesByCategory = useMemo(() => {
    const map = new Map<string, Badge[]>();

    badges.forEach((badge) => {
      if (requiredBadgeIdSet.has(badge.id)) {
        return;
      }

      const current = map.get(badge.category_id) ?? [];
      current.push(badge);
      map.set(badge.category_id, current);
    });

    map.forEach((rows) =>
      rows.sort((a, b) => a.name.localeCompare(b.name, "ko")),
    );

    return map;
  }, [badges, requiredBadgeIdSet]);

  const scoutBadgeCountMap = useMemo(() => {
    const map = new Map<string, number>();

    scoutBadges.forEach((scoutBadge) => {
      map.set(scoutBadge.scout_id, (map.get(scoutBadge.scout_id) ?? 0) + 1);
    });

    return map;
  }, [scoutBadges]);

  const selectedSummaryScout = useMemo(() => {
    if (!selectedSummaryScoutId) return null;
    return scouts.find((scout) => scout.id === selectedSummaryScoutId) ?? null;
  }, [scouts, selectedSummaryScoutId]);

  const selectedSummaryScoutBadges = useMemo(() => {
    if (!selectedSummaryScoutId) return [];

    return scoutBadges.filter(
      (scoutBadge) => scoutBadge.scout_id === selectedSummaryScoutId,
    );
  }, [scoutBadges, selectedSummaryScoutId]);

  const selectedSummaryBadgeStats = useMemo(() => {
    return selectedSummaryScoutBadges.reduce(
      (stats, scoutBadge) => {
        const badge = badgeMap.get(scoutBadge.badge_id) ?? null;

        return {
          total: stats.total + 1,
          required: stats.required + (badge?.is_required_badge ? 1 : 0),
          general: stats.general + (badge?.is_general_badge ? 1 : 0),
          approved: stats.approved + (scoutBadge.approved_at ? 1 : 0),
          used: stats.used + (usedScoutBadgeIdSet.has(scoutBadge.id) ? 1 : 0),
        };
      },
      { total: 0, required: 0, general: 0, approved: 0, used: 0 },
    );
  }, [badgeMap, selectedSummaryScoutBadges, usedScoutBadgeIdSet]);

  const selectedScoutBadge = useMemo(() => {
    return (
      scoutBadges.find((scoutBadge) => scoutBadge.id === selectedScoutBadgeId) ??
      null
    );
  }, [scoutBadges, selectedScoutBadgeId]);

  const selectedScout = selectedScoutBadge
    ? scoutMap.get(selectedScoutBadge.scout_id) ?? null
    : null;
  const selectedBadge = selectedScoutBadge
    ? badgeMap.get(selectedScoutBadge.badge_id) ?? null
    : null;
  const selectedBadgeIsUsed = selectedScoutBadge
    ? usedScoutBadgeIdSet.has(selectedScoutBadge.id)
    : false;

  const usedBadgeCount = scoutBadges.filter((scoutBadge) =>
    usedScoutBadgeIdSet.has(scoutBadge.id),
  ).length;

  const sortedRanks = useMemo(
    () => [...ranks].sort((a, b) => a.sort_order - b.sort_order),
    [ranks],
  );

  const getNextRankForScout = useCallback((scout: Scout) => {
    if (!scout.current_rank_id) return sortedRanks[0] ?? null;
    const currentRank = rankMap.get(scout.current_rank_id) ?? null;
    if (!currentRank) return null;
    return sortedRanks.find((rank) => rank.sort_order === currentRank.sort_order + 1) ?? null;
  }, [rankMap, sortedRanks]);

  const getScoutProgress = useCallback(
    (scout: Scout) => {
      const currentRank = scout.current_rank_id ? rankMap.get(scout.current_rank_id) ?? null : null;
      const nextRank = getNextRankForScout(scout);
      const requirement = scout.current_rank_id
        ? rankRequirements.find((item) => item.from_rank_id === scout.current_rank_id) ?? null
        : null;
      const ownedRows = scoutBadges.filter((row) => row.scout_id === scout.id);
      const ownedBadgeIdSet = new Set(ownedRows.map((row) => row.badge_id));
      const requiredMappings = requirement
        ? rankRequiredBadges.filter((row) => row.rank_requirement_id === requirement.id)
        : [];
      const requiredTotal = requiredMappings.length;
      const requiredOwned = requiredMappings.filter((row) => ownedBadgeIdSet.has(row.badge_id)).length;
      const missingRequiredBadges = requiredMappings
        .filter((row) => !ownedBadgeIdSet.has(row.badge_id))
        .map((row) => badgeMap.get(row.badge_id) ?? null)
        .filter((badge): badge is Badge => badge !== null);
      const generalRequired = requirement?.required_general_badge_count ?? 0;
      const generalOwned = ownedRows.filter((row) => badgeMap.get(row.badge_id)?.is_general_badge).length;
      const requiredMissing = Math.max(requiredTotal - requiredOwned, 0);
      const generalMissing = Math.max(generalRequired - generalOwned, 0);
      const unconfirmedCount = ownedRows.filter((row) => !row.leader_confirmed).length;
      const unapprovedCount = ownedRows.filter((row) => !row.approved_at).length;

      return {
        currentRank,
        nextRank,
        requiredTotal,
        requiredOwned,
        requiredMissing,
        generalRequired,
        generalOwned,
        generalMissing,
        missingRequiredBadges,
        totalOwned: ownedRows.length,
        unconfirmedCount,
        unapprovedCount,
        isReady: Boolean(nextRank) && requiredMissing === 0 && generalMissing === 0,
        needsSupport: requiredMissing > 0 || generalMissing > 0,
      };
    },
    [
      badgeMap,
      getNextRankForScout,
      rankMap,
      rankRequiredBadges,
      rankRequirements,
      scoutBadges,
    ],
  );

  const scoutProgressMap = useMemo(() => {
    return new Map(scouts.map((scout) => [scout.id, getScoutProgress(scout)]));
  }, [scouts, getScoutProgress]);

  const sortedSummaryScouts = useMemo(() => {
    return [...scouts].sort((a, b) => {
      const aProgress = scoutProgressMap.get(a.id);
      const bProgress = scoutProgressMap.get(b.id);
      const score = (progress: ReturnType<typeof getScoutProgress> | undefined) => {
        if (!progress) return 9;
        if (progress.isReady) return 0;
        if (progress.requiredMissing > 0) return 1;
        if (progress.generalMissing > 0) return 2;
        if (progress.totalOwned === 0) return 3;
        return 4;
      };
      const diff = score(aProgress) - score(bProgress);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name, "ko");
    });
  }, [scouts, scoutProgressMap]);

  const requiredShortageScoutCount = scouts.filter((scout) => (scoutProgressMap.get(scout.id)?.requiredMissing ?? 0) > 0).length;
  const generalShortageScoutCount = scouts.filter((scout) => (scoutProgressMap.get(scout.id)?.generalMissing ?? 0) > 0).length;
  const unconfirmedRecordCount = scoutBadges.filter((row) => !row.leader_confirmed).length;

  const filteredScoutBadges = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return scoutBadges.filter((scoutBadge) => {
      const scout = scoutMap.get(scoutBadge.scout_id) ?? null;
      const badge = badgeMap.get(scoutBadge.badge_id) ?? null;
      const category = badge ? categoryMap.get(badge.category_id) ?? null : null;
      const isUsed = usedScoutBadgeIdSet.has(scoutBadge.id);

      if (selectedScoutId && scoutBadge.scout_id !== selectedScoutId) {
        return false;
      }

      if (selectedCategoryId && badge?.category_id !== selectedCategoryId) {
        return false;
      }

      const progress = scout ? scoutProgressMap.get(scout.id) : null;
      if (badgeWorkFilter === "support" && !progress?.needsSupport) return false;
      if (badgeWorkFilter === "required" && !(progress?.requiredMissing && progress.requiredMissing > 0)) return false;
      if (badgeWorkFilter === "general" && !(progress?.generalMissing && progress.generalMissing > 0)) return false;
      if (badgeWorkFilter === "unconfirmed" && scoutBadge.leader_confirmed) return false;
      if (badgeWorkFilter === "unapproved" && scoutBadge.approved_at) return false;

      if (!normalizedKeyword) {
        return true;
      }

      const targetText = [
        scout?.member_no,
        scout?.name,
        scout?.school_name,
        scout?.grade,
        scout ? SCOUT_STATUS_LABELS[scout.status] : "",
        badge?.name,
        badge ? getBadgeTypeLabel(badge) : "",
        category?.name,
        scout ? organizationNameMap.get(scout.organization_id) : "",
        scoutBadge.instructor_name,
        scoutBadge.note,
        isUsed ? "진급반영 반영됨" : "미사용",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return targetText.includes(normalizedKeyword);
    });
  }, [
    keyword,
    selectedScoutId,
    selectedCategoryId,
    scoutBadges,
    scoutMap,
    badgeMap,
    categoryMap,
    organizationNameMap,
    usedScoutBadgeIdSet,
    badgeWorkFilter,
    scoutProgressMap,
  ]);

  const handleOpenCreateForm = () => {
    if (!canManageBadges) return;

    setCreateForm({
      ...getEmptyBadgeForm(),
      scout_id: selectedScoutId,
    });
    setFormErrorMessage("");
    setEditErrorMessage("");
    setIsEditFormOpen(false);
    setIsCreateFormOpen(true);
  };

  const handleCloseCreateForm = () => {
    if (submitting) return;

    setCreateForm(getEmptyBadgeForm());
    setFormErrorMessage("");
    setIsCreateFormOpen(false);
  };

  const handleOpenEditForm = (scoutBadge: ScoutBadge) => {
    if (!canManageBadges) return;

    setSelectedScoutBadgeId(scoutBadge.id);
    setIsCreateFormOpen(false);
    setFormErrorMessage("");
    setEditErrorMessage("");

    if (usedScoutBadgeIdSet.has(scoutBadge.id)) {
      setEditErrorMessage(
        "이미 진급 인가에 사용된 기능장 기록은 수정할 수 없습니다.",
      );
      setIsEditFormOpen(false);
      return;
    }

    setEditForm({
      id: scoutBadge.id,
      badge_id: scoutBadge.badge_id,
      acquired_at: toDateInputText(scoutBadge.acquired_at),
      approved_at: toDateInputText(scoutBadge.approved_at),
      instructor_name: scoutBadge.instructor_name ?? "",
      leader_confirmed: scoutBadge.leader_confirmed,
      note: scoutBadge.note ?? "",
    });
    setIsEditFormOpen(true);
  };

  const handleCloseEditForm = () => {
    if (submitting) return;

    setEditForm(getEmptyBadgeEditForm());
    setEditErrorMessage("");
    setIsEditFormOpen(false);
  };

  const updateCreateForm = <K extends keyof BadgeForm>(
    field: K,
    value: BadgeForm[K],
  ) => {
    setCreateForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const updateEditForm = <K extends keyof BadgeEditForm>(
    field: K,
    value: BadgeEditForm[K],
  ) => {
    setEditForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const validateBadgeForm = (form: Pick<BadgeForm, "scout_id" | "badge_id" | "acquired_at" | "approved_at">) => {
    if (!form.scout_id) {
      return "대원을 선택해야 합니다.";
    }

    if (!form.badge_id) {
      return "기능장을 선택해야 합니다.";
    }

    if (!form.acquired_at) {
      return "취득일을 입력해야 합니다.";
    }

    if (form.approved_at && form.approved_at < form.acquired_at) {
      return "인가일은 취득일보다 빠를 수 없습니다.";
    }

    return "";
  };

  const validateEditForm = (form: BadgeEditForm) => {
    if (!form.id) {
      return "수정할 기능장 취득 기록을 선택해야 합니다.";
    }

    if (!form.badge_id) {
      return "기능장을 선택해야 합니다.";
    }

    if (!form.acquired_at) {
      return "취득일을 입력해야 합니다.";
    }

    if (form.approved_at && form.approved_at < form.acquired_at) {
      return "인가일은 취득일보다 빠를 수 없습니다.";
    }

    return "";
  };

  const handleCreateScoutBadge = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canManageBadges) {
      setFormErrorMessage("기능장 등록 권한이 없습니다.");
      return;
    }

    const validationMessage = validateBadgeForm(createForm);

    if (validationMessage) {
      setFormErrorMessage(validationMessage);
      return;
    }

    setSubmitting(true);
    setFormErrorMessage("");

    const rpcClient = supabase as unknown as RpcClient;

    const { error } = await rpcClient.rpc("create_scout_badge_record", {
      p_scout_id: createForm.scout_id,
      p_badge_id: createForm.badge_id,
      p_acquired_at: createForm.acquired_at,
      p_approved_at: toNullableDate(createForm.approved_at),
      p_instructor_name: toNullableText(createForm.instructor_name),
      p_leader_confirmed: createForm.leader_confirmed,
      p_note: toNullableText(createForm.note),
    });

    if (error) {
      console.error("기능장 등록 오류:", error.message);
      setFormErrorMessage(`기능장 등록에 실패했습니다. ${error.message}`);
      setSubmitting(false);
      return;
    }

    setCreateForm(getEmptyBadgeForm());
    setIsCreateFormOpen(false);
    setSubmitting(false);

    await loadData();
  };

  const handleUpdateScoutBadge = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canManageBadges) {
      setEditErrorMessage("기능장 수정 권한이 없습니다.");
      return;
    }

    if (usedScoutBadgeIdSet.has(editForm.id)) {
      setEditErrorMessage(
        "이미 진급 인가에 사용된 기능장 기록은 수정할 수 없습니다.",
      );
      return;
    }

    const validationMessage = validateEditForm(editForm);

    if (validationMessage) {
      setEditErrorMessage(validationMessage);
      return;
    }

    setSubmitting(true);
    setEditErrorMessage("");

    const rpcClient = supabase as unknown as RpcClient;

    const { error } = await rpcClient.rpc("update_scout_badge_record", {
      p_scout_badge_id: editForm.id,
      p_badge_id: editForm.badge_id,
      p_acquired_at: editForm.acquired_at,
      p_approved_at: toNullableDate(editForm.approved_at),
      p_instructor_name: toNullableText(editForm.instructor_name),
      p_leader_confirmed: editForm.leader_confirmed,
      p_note: toNullableText(editForm.note),
    });

    if (error) {
      console.error("기능장 수정 오류:", error.message);
      setEditErrorMessage(`기능장 수정에 실패했습니다. ${error.message}`);
      setSubmitting(false);
      return;
    }

    setIsEditFormOpen(false);
    setEditForm(getEmptyBadgeEditForm());
    setSubmitting(false);

    await loadData();
  };

  const handleArchiveScoutBadge = async (scoutBadge: ScoutBadge) => {
    if (!canManageBadges) return;

    if (usedScoutBadgeIdSet.has(scoutBadge.id)) {
      setSelectedScoutBadgeId(scoutBadge.id);
      setEditErrorMessage(
        "이미 진급 인가에 사용된 기능장 기록은 삭제할 수 없습니다.",
      );
      return;
    }

    const scout = scoutMap.get(scoutBadge.scout_id) ?? null;
    const badge = badgeMap.get(scoutBadge.badge_id) ?? null;
    const confirmMessage = [
      "선택한 기능장 취득 기록을 삭제합니다.",
      "목록에서 제외되며, 이미 진급 인가에 사용된 기록은 삭제할 수 없습니다.",
      "",
      `대원: ${scout?.name ?? "-"}`,
      `기능장: ${badge?.name ?? "-"}`,
      `취득일: ${formatDate(scoutBadge.acquired_at)}`,
      "",
      "계속 진행하시겠습니까?",
    ].join("\n");

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setDeletingId(scoutBadge.id);
    setEditErrorMessage("");

    const rpcClient = supabase as unknown as RpcClient;

    const { error } = await rpcClient.rpc("archive_scout_badge_record", {
      p_scout_badge_id: scoutBadge.id,
    });

    if (error) {
      console.error("기능장 삭제 오류:", error.message);
      setSelectedScoutBadgeId(scoutBadge.id);
      setEditErrorMessage(`기능장 삭제에 실패했습니다. ${error.message}`);
      setDeletingId("");
      return;
    }

    if (selectedScoutBadgeId === scoutBadge.id) {
      setSelectedScoutBadgeId("");
      setIsEditFormOpen(false);
      setEditForm(getEmptyBadgeEditForm());
    }

    setDeletingId("");
    await loadData();
  };

  const getOrganizationName = useCallback((organizationId: string) => {
    return organizationNameMap.get(organizationId) ?? "-";
  }, [organizationNameMap]);

  const getBadgeName = (badgeId: string) => {
    return badgeMap.get(badgeId)?.name ?? "-";
  };

  const getBadgeCategoryName = (badgeId: string) => {
    const badge = badgeMap.get(badgeId);
    if (!badge) return "-";

    return categoryMap.get(badge.category_id)?.name ?? "-";
  };

  const getScoutBadgeSortValue = useCallback(
    (
      scoutBadge: ScoutBadge,
      key: MeritBadgeSortKey,
    ): string | number => {
      const scout = scoutMap.get(scoutBadge.scout_id) ?? null;
      const badge = badgeMap.get(scoutBadge.badge_id) ?? null;
      const category = badge ? categoryMap.get(badge.category_id) ?? null : null;

      if (key === "member_no") return scout?.member_no ?? "";
      if (key === "name") return scout?.name ?? "";
      if (key === "organization") {
        return scout ? getOrganizationName(scout.organization_id) : "";
      }
      if (key === "school_name") return scout?.school_name ?? "";
      if (key === "category") return category?.name ?? "";
      if (key === "badge") return badge?.name ?? "";
      if (key === "badge_type") return getBadgeTypeLabel(badge);
      if (key === "special_rule") {
        return badge ? getSpecialRuleLabel(badge.special_rule) : "";
      }
      if (key === "acquired_at") return scoutBadge.acquired_at ?? "";
      if (key === "approved_at") return scoutBadge.approved_at ?? "";
      if (key === "leader_confirmed") return scoutBadge.leader_confirmed ? 1 : 0;
      if (key === "usage") {
        return usedScoutBadgeIdSet.has(scoutBadge.id) ? 1 : 0;
      }
      if (key === "note") return scoutBadge.note ?? "";

      return "";
    },
    [
      badgeMap,
      categoryMap,
      getOrganizationName,
      scoutMap,
      usedScoutBadgeIdSet,
    ],
  );

  const compareSortValues = (
    leftValue: string | number,
    rightValue: string | number,
  ) => {
    if (typeof leftValue === "number" && typeof rightValue === "number") {
      return leftValue - rightValue;
    }

    return String(leftValue).localeCompare(String(rightValue), "ko", {
      numeric: true,
      sensitivity: "base",
    });
  };

  const sortedScoutBadges = useMemo(() => {
    return filteredScoutBadges
      .map((scoutBadge, index) => ({ scoutBadge, index }))
      .sort((left, right) => {
        const leftValue = getScoutBadgeSortValue(left.scoutBadge, sortConfig.key);
        const rightValue = getScoutBadgeSortValue(right.scoutBadge, sortConfig.key);
        const directionMultiplier = sortConfig.direction === "asc" ? 1 : -1;
        const primaryCompare = compareSortValues(leftValue, rightValue);

        if (primaryCompare !== 0) {
          return primaryCompare * directionMultiplier;
        }

        return left.index - right.index;
      })
      .map(({ scoutBadge }) => scoutBadge);
  }, [
    filteredScoutBadges,
    getScoutBadgeSortValue,
    sortConfig,
  ]);

  const sortedSelectedSummaryScoutBadges = useMemo(() => {
    return selectedSummaryScoutBadges
      .map((scoutBadge, index) => ({ scoutBadge, index }))
      .sort((left, right) => {
        const leftValue = getScoutBadgeSortValue(
          left.scoutBadge,
          summarySortConfig.key,
        );
        const rightValue = getScoutBadgeSortValue(
          right.scoutBadge,
          summarySortConfig.key,
        );
        const directionMultiplier = summarySortConfig.direction === "asc" ? 1 : -1;
        const primaryCompare = compareSortValues(leftValue, rightValue);

        if (primaryCompare !== 0) {
          return primaryCompare * directionMultiplier;
        }

        const leftBadge = badgeMap.get(left.scoutBadge.badge_id) ?? null;
        const rightBadge = badgeMap.get(right.scoutBadge.badge_id) ?? null;
        const badgeCompare = (leftBadge?.name ?? "").localeCompare(
          rightBadge?.name ?? "",
          "ko",
          { numeric: true, sensitivity: "base" },
        );

        if (badgeCompare !== 0) {
          return badgeCompare;
        }

        const acquiredDateCompare = left.scoutBadge.acquired_at.localeCompare(
          right.scoutBadge.acquired_at,
        );

        if (acquiredDateCompare !== 0) {
          return acquiredDateCompare;
        }

        return left.index - right.index;
      })
      .map(({ scoutBadge }) => scoutBadge);
  }, [
    badgeMap,
    getScoutBadgeSortValue,
    selectedSummaryScoutBadges,
    summarySortConfig,
  ]);

  const handleSort = (key: MeritBadgeSortKey) => {
    setSortConfig((current) => {
      if (current.key === key) {
        return {
          key,
          direction: current.direction === "asc" ? "desc" : "asc",
        };
      }

      return { key, direction: "asc" };
    });
  };

  const getSortIndicator = (key: MeritBadgeSortKey) => {
    if (sortConfig.key !== key) return "↕";
    return sortConfig.direction === "asc" ? "▲" : "▼";
  };

  const renderSortableHeader = (key: MeritBadgeSortKey, label: string) => {
    const isActive = sortConfig.key === key;

    return (
      <th
        style={thStyle}
        aria-sort={
          isActive
            ? sortConfig.direction === "asc"
              ? "ascending"
              : "descending"
            : "none"
        }
      >
        <button
          type="button"
          style={sortableHeaderButtonStyle}
          onClick={() => handleSort(key)}
          title={`${label} 기준 정렬`}
        >
          <span>{label}</span>
          <span style={isActive ? activeSortIndicatorStyle : sortIndicatorStyle}>
            {getSortIndicator(key)}
          </span>
        </button>
      </th>
    );
  };

  const handleSummarySort = (key: MeritBadgeSortKey) => {
    setSummarySortConfig((current) => {
      if (current.key === key) {
        return {
          key,
          direction: current.direction === "asc" ? "desc" : "asc",
        };
      }

      return { key, direction: "asc" };
    });
  };

  const getSummarySortIndicator = (key: MeritBadgeSortKey) => {
    if (summarySortConfig.key !== key) return "↕";
    return summarySortConfig.direction === "asc" ? "▲" : "▼";
  };

  const renderSummarySortableHeader = (key: MeritBadgeSortKey, label: string) => {
    const isActive = summarySortConfig.key === key;

    return (
      <th
        style={thStyle}
        aria-sort={
          isActive
            ? summarySortConfig.direction === "asc"
              ? "ascending"
              : "descending"
            : "none"
        }
      >
        <button
          type="button"
          style={sortableHeaderButtonStyle}
          onClick={() => handleSummarySort(key)}
          title={`${label} 기준 정렬`}
        >
          <span>{label}</span>
          <span style={isActive ? activeSortIndicatorStyle : sortIndicatorStyle}>
            {getSummarySortIndicator(key)}
          </span>
        </button>
      </th>
    );
  };

  const getScoutBadgeOptionContext = (scoutId: string, editingBadgeId = "") => {
    const scout = scoutMap.get(scoutId) ?? null;
    const ownedBadgeIdSet = new Set(
      scoutBadges
        .filter((row) => row.scout_id === scoutId)
        .map((row) => row.badge_id),
    );

    if (editingBadgeId) {
      ownedBadgeIdSet.delete(editingBadgeId);
    }

    const currentRequirement = scout?.current_rank_id
      ? rankRequirements.find(
          (requirement) => requirement.from_rank_id === scout.current_rank_id,
        ) ?? null
      : null;

    const currentRequiredMappings = currentRequirement
      ? rankRequiredBadges
          .filter((row) => row.rank_requirement_id === currentRequirement.id)
          .sort((a, b) => a.sort_order - b.sort_order)
      : [];

    const missingCurrentRequiredBadges = currentRequiredMappings
      .map((row) => badgeMap.get(row.badge_id) ?? null)
      .filter((badge): badge is Badge =>
        Boolean(badge && !ownedBadgeIdSet.has(badge.id)),
      );

    const generalOwnedCount = scoutBadges.filter(
      (row) =>
        row.scout_id === scoutId &&
        row.badge_id !== editingBadgeId &&
        badgeMap.get(row.badge_id)?.is_general_badge,
    ).length;

    const generalRequiredCount = currentRequirement?.required_general_badge_count ?? 0;

    return {
      scout,
      ownedBadgeIdSet,
      currentRequirement,
      missingCurrentRequiredBadges,
      generalOwnedCount,
      generalRequiredCount,
      generalMissingCount: Math.max(0, generalRequiredCount - generalOwnedCount),
    };
  };

  const renderBadgeSelectOptions = (scoutId: string, editingBadgeId = "") => {
    const context = getScoutBadgeOptionContext(scoutId, editingBadgeId);

    return (
      <>
        <option value="">기능장 선택</option>

        {context.missingCurrentRequiredBadges.length > 0 && (
          <optgroup label="현재 진급에 부족한 필수 기능장">
            {context.missingCurrentRequiredBadges.map((badge) => (
              <option key={`missing-${badge.id}`} value={badge.id}>
                {badge.name} · 필수
              </option>
            ))}
          </optgroup>
        )}

        {requiredBadgeGroups.map((group) => {
          const selectableBadges = group.badges.filter(
            (badge) => !context.ownedBadgeIdSet.has(badge.id),
          );

          if (selectableBadges.length === 0) return null;

          return (
            <optgroup key={group.requirement.id} label={group.label}>
              {selectableBadges.map((badge) => (
                <option key={`${group.requirement.id}-${badge.id}`} value={badge.id}>
                  {badge.name} · 필수
                </option>
              ))}
            </optgroup>
          );
        })}

        {badgeCategories.map((category) => {
          const categoryBadges = (generalBadgesByCategory.get(category.id) ?? [])
            .filter((badge) => !context.ownedBadgeIdSet.has(badge.id));

          if (categoryBadges.length === 0) return null;

          return (
            <optgroup key={category.id} label={`일반 기능장 · ${category.name}`}>
              {categoryBadges.map((badge) => (
                <option key={badge.id} value={badge.id}>
                  {badge.name} · 일반
                </option>
              ))}
            </optgroup>
          );
        })}
      </>
    );
  };

  const createFormScout = createForm.scout_id
    ? scoutMap.get(createForm.scout_id) ?? null
    : null;

  const createFormBadgeContext = createForm.scout_id
    ? getScoutBadgeOptionContext(createForm.scout_id)
    : null;

  const isBadgeDrawerOpen =
    canManageBadges &&
    (isCreateFormOpen || (isEditFormOpen && selectedScoutBadge !== null));

  useEffect(() => {
    if (!isBadgeDrawerOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isBadgeDrawerOpen]);

  return (
    <div>
      <div style={pageHeaderStyle}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}><h1 style={pageTitleStyle}>기능장 관리</h1><PageHelpButton title="기능장 관리" description="대원별 기능장 취득·인가 기록을 관리합니다." sections={[{ title: "사용 순서", content: "대원을 선택한 뒤 기능장을 등록하고 지도자 확인과 인가일을 점검합니다." },{ title: "주의사항", content: "이미 진급 인가에 사용된 기록은 수정·삭제가 제한될 수 있습니다." }]} /></div>
          <p style={pageDescriptionStyle}>
            대원별 필수 기능장과 일반 기능장 취득 현황을 조회하고 등록·수정·삭제 처리합니다.
          </p>
        </div>

        {profile && <div style={roleBadgeStyle}>{ROLE_LABELS[profile.role]}</div>}
      </div>

      <div style={summaryGridStyle}>
        <section style={neutralSummaryCardStyle}>
          <div style={summaryCardHeaderStyle}><h2 style={summaryTitleStyle}>전체 대원</h2><span style={neutralSummaryChipStyle}>대상</span></div>
          <p style={summaryValueStyle}>{scouts.length}명</p><p style={summaryDescriptionStyle}>현재 기능장 관리 대상</p>
        </section>
        <section style={requiredSummaryCardStyle}>
          <div style={summaryCardHeaderStyle}><h2 style={summaryTitleStyle}>필수 기능장 부족</h2><span style={requiredSummaryChipStyle}>보완</span></div>
          <p style={requiredSummaryValueStyle}>{requiredShortageScoutCount}명</p><p style={summaryDescriptionStyle}>다음 진급 필수 조건 미충족</p>
        </section>
        <section style={generalSummaryCardStyle}>
          <div style={summaryCardHeaderStyle}><h2 style={summaryTitleStyle}>일반 기능장 부족</h2><span style={generalSummaryChipStyle}>보완</span></div>
          <p style={generalSummaryValueStyle}>{generalShortageScoutCount}명</p><p style={summaryDescriptionStyle}>다음 진급 수량 조건 미충족</p>
        </section>
        <section style={recordSummaryCardStyle}>
          <div style={summaryCardHeaderStyle}><h2 style={summaryTitleStyle}>지도자 확인 필요</h2><span style={recordSummaryChipStyle}>확인</span></div>
          <p style={recordSummaryValueStyle}>{unconfirmedRecordCount}건</p><p style={summaryDescriptionStyle}>확인되지 않은 취득 기록</p>
        </section>
        <section style={usedSummaryCardStyle}>
          <div style={summaryCardHeaderStyle}><h2 style={summaryTitleStyle}>진급 반영 기록</h2><span style={usedSummaryChipStyle}>반영</span></div>
          <p style={usedSummaryValueStyle}>{usedBadgeCount}건</p><p style={summaryDescriptionStyle}>진급 인가에 사용된 기록</p>
        </section>
      </div>

      <section style={contentCardStyle}>
        <div style={summarySectionHeaderStyle}>
          <div>
            <h2 style={sectionTitleStyle}>대원별 기능장 보유 현황</h2>
            <p style={sectionDescriptionStyle}>
              대원별 등록된 기능장 수를 요약합니다. 카드를 선택하면 해당 대원의 기능장 취득 내역을 바로 확인할 수 있습니다.
            </p>
          </div>

          {selectedSummaryScout && (
            <button
              type="button"
              style={secondaryButtonStyle}
              onClick={() => setSelectedSummaryScoutId("")}
            >
              상세 닫기
            </button>
          )}
        </div>

        <div style={miniCardGridStyle}>
          {sortedSummaryScouts.map((scout) => {
            const isSelected = selectedSummaryScoutId === scout.id;
            const badgeCount = scoutBadgeCountMap.get(scout.id) ?? 0;
            const progress = scoutProgressMap.get(scout.id);

            return (
              <div
                key={scout.id}
                role="button"
                tabIndex={0}
                style={isSelected ? selectedMiniCardButtonStyle : miniCardButtonStyle}
                onClick={() => {
                  setSelectedSummaryScoutId((current) =>
                    current === scout.id ? "" : scout.id,
                  );
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedSummaryScoutId((current) =>
                      current === scout.id ? "" : scout.id,
                    );
                  }
                }}
                aria-pressed={isSelected}
              >
                <div style={miniCardTitleStyle}>{scout.name}</div>
                <div style={miniCardMetaStyle}>{scout.member_no ?? "번호 없음"} · {progress?.currentRank?.rank_name ?? "급위 미등록"} → {progress?.nextRank?.rank_name ?? "최종급위"}</div>
                <div style={miniProgressRowStyle}><span>필수</span><strong>{progress?.requiredOwned ?? 0}/{progress?.requiredTotal ?? 0}</strong></div>
                <div style={miniProgressRowStyle}><span>일반</span><strong>{progress?.generalOwned ?? 0}/{progress?.generalRequired ?? 0}</strong></div>
                <div style={progress?.isReady ? miniReadyStatusStyle : progress?.requiredMissing ? miniDangerStatusStyle : progress?.generalMissing ? miniWarningStatusStyle : emptyMiniCardValueStyle}>
                  {progress?.isReady ? "진급 조건 충족" : progress?.requiredMissing ? `필수 ${progress.requiredMissing}개 부족` : progress?.generalMissing ? `일반 ${progress.generalMissing}개 부족` : `${badgeCount}건 등록`}
                </div>
              </div>
            );
          })}
        </div>

        {selectedSummaryScout && (
          <section style={summaryDetailCardStyle}>
            <div style={summaryDetailHeaderStyle}>
              <div>
                <h3 style={formTitleStyle}>
                  {selectedSummaryScout.name} 기능장 보유 상세
                </h3>
                <p style={formDescriptionStyle}>
                  대원번호 {selectedSummaryScout.member_no ?? "번호 없음"} · {selectedSummaryScout.school_name ?? "소속대 미입력"} · {selectedSummaryScout.grade ?? "학년 미입력"}
                </p>
              </div>

              <div style={toolbarRightStyle}>
                <button
                  type="button"
                  style={secondaryButtonStyle}
                  onClick={() => handleChangeSelectedScoutId(selectedSummaryScout.id)}
                >
                  이 대원 기록만 보기
                </button>
              </div>
            </div>

            <div style={summaryStatsGridStyle}>
              <div style={summaryStatItemStyle}><div style={detailLabelStyle}>현재 → 다음</div><div style={summaryStatValueStyle}>{scoutProgressMap.get(selectedSummaryScout.id)?.currentRank?.rank_name ?? "미등록"} → {scoutProgressMap.get(selectedSummaryScout.id)?.nextRank?.rank_name ?? "최종"}</div></div>
              <div style={summaryStatItemStyle}><div style={detailLabelStyle}>필수 진행</div><div style={summaryStatValueStyle}>{scoutProgressMap.get(selectedSummaryScout.id)?.requiredOwned ?? 0}/{scoutProgressMap.get(selectedSummaryScout.id)?.requiredTotal ?? 0}</div></div>
              <div style={summaryStatItemStyle}><div style={detailLabelStyle}>일반 진행</div><div style={summaryStatValueStyle}>{scoutProgressMap.get(selectedSummaryScout.id)?.generalOwned ?? 0}/{scoutProgressMap.get(selectedSummaryScout.id)?.generalRequired ?? 0}</div></div>
              <div style={summaryStatItemStyle}>
                <div style={detailLabelStyle}>전체</div>
                <div style={summaryStatValueStyle}>{selectedSummaryBadgeStats.total}건</div>
              </div>
              <div style={summaryStatItemStyle}>
                <div style={detailLabelStyle}>필수 기능장</div>
                <div style={summaryStatValueStyle}>{selectedSummaryBadgeStats.required}건</div>
              </div>
              <div style={summaryStatItemStyle}>
                <div style={detailLabelStyle}>일반 기능장</div>
                <div style={summaryStatValueStyle}>{selectedSummaryBadgeStats.general}건</div>
              </div>
              <div style={summaryStatItemStyle}>
                <div style={detailLabelStyle}>인가 완료</div>
                <div style={summaryStatValueStyle}>{selectedSummaryBadgeStats.approved}건</div>
              </div>
              <div style={summaryStatItemStyle}>
                <div style={detailLabelStyle}>진급 반영</div>
                <div style={summaryStatValueStyle}>{selectedSummaryBadgeStats.used}건</div>
              </div>
            </div>

            {selectedSummaryScoutBadges.length === 0 ? (
              <div style={emptyStateStyle}>이 대원에게 등록된 기능장 취득 기록이 없습니다.</div>
            ) : (
              <div style={tableWrapStyle}>
                <table style={summaryDetailTableStyle}>
                  <thead>
                    <tr>
                      {renderSummarySortableHeader("category", "분류")}
                      {renderSummarySortableHeader("badge", "기능장")}
                      {renderSummarySortableHeader("badge_type", "구분")}
                      {renderSummarySortableHeader("acquired_at", "취득일")}
                      {renderSummarySortableHeader("approved_at", "인가일")}
                      {renderSummarySortableHeader("leader_confirmed", "확인")}
                      {renderSummarySortableHeader("usage", "진급 반영")}
                      {renderSummarySortableHeader("note", "비고")}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSelectedSummaryScoutBadges.map((scoutBadge) => {
                      const badge = badgeMap.get(scoutBadge.badge_id) ?? null;
                      const isUsed = usedScoutBadgeIdSet.has(scoutBadge.id);

                      return (
                        <tr
                          key={`summary-${scoutBadge.id}`}
                          style={selectedScoutBadgeId === scoutBadge.id ? selectedTrStyle : clickableTrStyle}
                          onClick={() =>
                            setSelectedScoutBadgeId((current) =>
                              current === scoutBadge.id ? "" : scoutBadge.id,
                            )
                          }
                          title="행을 클릭하면 선택 기록 상세를 열거나 닫을 수 있습니다."
                        >
                          <td style={tdStyle}>{getBadgeCategoryName(scoutBadge.badge_id)}</td>
                          <td style={strongTdStyle}>{getBadgeName(scoutBadge.badge_id)}</td>
                          <td style={tdStyle}>
                            <span style={getBadgeTypeBadgeStyle(badge)}>
                              {getBadgeTypeLabel(badge)}
                            </span>
                          </td>
                          <td style={tdStyle}>{formatDate(scoutBadge.acquired_at)}</td>
                          <td style={tdStyle}>{formatDate(scoutBadge.approved_at)}</td>
                          <td style={tdStyle}>
                            {scoutBadge.leader_confirmed ? (
                              <span style={confirmedBadgeStyle}>확인</span>
                            ) : (
                              <span style={unconfirmedBadgeStyle}>미확인</span>
                            )}
                          </td>
                          <td style={tdStyle}>
                            {isUsed ? (
                              <span style={usedBadgeStyle}>진급 반영</span>
                            ) : (
                              <span style={unusedBadgeStyle}>미사용</span>
                            )}
                          </td>
                          <td style={tdStyle}>{scoutBadge.note ?? "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </section>

      <section style={contentCardWithTopMarginStyle}>
        <div style={toolbarStyle}>
          <div>
            <h2 style={sectionTitleStyle}>기능장 취득 현황</h2>
            <p style={sectionDescriptionStyle}>
              대원별 기능장 취득 내역을 확인하고 필요한 기록을 등록·수정합니다.
            </p>
          </div>
        </div>

        <div style={listToolPanelStyle}>
          <label style={listToolFieldStyle}>
            대원 필터
            <select
              style={listToolSelectStyle}
              value={selectedScoutId}
              onChange={(event) => handleChangeSelectedScoutId(event.target.value)}
            >
              <option value="">전체 대원</option>
              {scouts.map((scout) => (
                <option key={scout.id} value={scout.id}>
                  {scout.member_no ?? "번호없음"} · {scout.name}
                </option>
              ))}
            </select>
          </label>

          <label style={listToolFieldStyle}>
            기능장 분류
            <select
              style={listToolSelectStyle}
              value={selectedCategoryId}
              onChange={(event) => setSelectedCategoryId(event.target.value)}
            >
              <option value="">전체 분류</option>
              {badgeCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label style={listToolFieldStyle}>
            업무 필터
            <select style={listToolSelectStyle} value={badgeWorkFilter} onChange={(event) => setBadgeWorkFilter(event.target.value as BadgeWorkFilter)}>
              <option value="all">전체 기록</option>
              <option value="support">보완 필요 대원</option>
              <option value="required">필수 기능장 부족</option>
              <option value="general">일반 기능장 부족</option>
              <option value="unconfirmed">지도자 미확인</option>
              <option value="unapproved">인가일 미등록</option>
            </select>
          </label>

          <input
            style={listToolSearchInputStyle}
            type="search"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="대원번호, 이름, 기능장명 검색"
          />

          <div style={listToolActionsStyle}>
            {canManageBadges && (
              <button
                type="button"
                style={primaryButtonStyle}
                onClick={handleOpenCreateForm}
              >
                기능장 등록
              </button>
            )}

            <button type="button" style={secondaryButtonStyle} onClick={loadData}>새로고침</button>
            <div style={listCountBadgeStyle}>현재 {filteredScoutBadges.length}건</div>
          </div>
        </div>

        {editErrorMessage && !isEditFormOpen && (
          <div style={errorBoxStyle}>{editErrorMessage}</div>
        )}

        {selectedScoutBadge && !isCreateFormOpen && !isEditFormOpen && (
          <section style={selectedDetailCardStyle}>
            <div style={formHeaderStyle}>
              <div>
                <h3 style={formTitleStyle}>선택 기록 상세</h3>
                <p style={formDescriptionStyle}>
                  목록 행을 클릭하면 이 영역에 선택한 기능장 취득 기록이 표시됩니다.
                </p>
              </div>

              <div style={toolbarRightStyle}>
                {selectedBadgeIsUsed && (
                  <span style={usedBadgeStyle}>진급 반영</span>
                )}
                {canManageBadges && (
                  <>
                    <button
                      type="button"
                      style={secondaryButtonStyle}
                      onClick={() => handleOpenEditForm(selectedScoutBadge)}
                      disabled={selectedBadgeIsUsed || submitting || deletingId !== ""}
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      style={dangerButtonStyle}
                      onClick={() => handleArchiveScoutBadge(selectedScoutBadge)}
                      disabled={selectedBadgeIsUsed || deletingId === selectedScoutBadge.id}
                    >
                      {deletingId === selectedScoutBadge.id ? "삭제 중..." : "삭제"}
                    </button>
                  </>
                )}

                <button
                  type="button"
                  style={secondaryButtonStyle}
                  onClick={() => {
                    setSelectedScoutBadgeId("");
                    setEditErrorMessage("");
                  }}
                >
                  상세 닫기
                </button>
              </div>
            </div>

            <div style={detailGridStyle}>
              <div style={detailItemStyle}>
                <div style={detailLabelStyle}>대원</div>
                <div style={detailValueStyle}>
                  {selectedScout?.member_no ?? "번호없음"} · {selectedScout?.name ?? "-"}
                </div>
              </div>
              {isSuperAdmin && selectedScout && (
                <div style={detailItemStyle}>
                  <div style={detailLabelStyle}>소속</div>
                  <div style={detailValueStyle}>{getOrganizationName(selectedScout.organization_id)}</div>
                </div>
              )}
              <div style={detailItemStyle}>
                <div style={detailLabelStyle}>분류</div>
                <div style={detailValueStyle}>{getBadgeCategoryName(selectedScoutBadge.badge_id)}</div>
              </div>
              <div style={detailItemStyle}>
                <div style={detailLabelStyle}>기능장</div>
                <div style={detailValueStyle}>{getBadgeName(selectedScoutBadge.badge_id)}</div>
              </div>
              <div style={detailItemStyle}>
                <div style={detailLabelStyle}>구분</div>
                <div style={detailValueStyle}>{getBadgeTypeLabel(selectedBadge)}</div>
              </div>
              <div style={detailItemStyle}>
                <div style={detailLabelStyle}>인정 기준</div>
                <div style={detailValueStyle}>{selectedBadge ? getSpecialRuleLabel(selectedBadge.special_rule) : "-"}</div>
              </div>
              <div style={detailItemStyle}>
                <div style={detailLabelStyle}>취득일</div>
                <div style={detailValueStyle}>{formatDate(selectedScoutBadge.acquired_at)}</div>
              </div>
              <div style={detailItemStyle}>
                <div style={detailLabelStyle}>인가일</div>
                <div style={detailValueStyle}>{formatDate(selectedScoutBadge.approved_at)}</div>
              </div>
              <div style={detailItemStyle}>
                <div style={detailLabelStyle}>지도자 / 강사명</div>
                <div style={detailValueStyle}>{selectedScoutBadge.instructor_name ?? "-"}</div>
              </div>
              <div style={detailItemStyle}>
                <div style={detailLabelStyle}>확인</div>
                <div style={detailValueStyle}>{selectedScoutBadge.leader_confirmed ? "확인" : "미확인"}</div>
              </div>
              <div style={detailItemWideStyle}>
                <div style={detailLabelStyle}>비고</div>
                <div style={detailValueStyle}>{selectedScoutBadge.note ?? "-"}</div>
              </div>
            </div>
          </section>
        )}

        {loading && <div style={emptyStateStyle}>기능장 정보를 불러오는 중입니다...</div>}

        {!loading && errorMessage && <div style={errorBoxStyle}>{errorMessage}</div>}

        {!loading && !errorMessage && filteredScoutBadges.length === 0 && (
          <EmptyState title="기능장 취득 기록이 없습니다" description="대원을 선택한 뒤 기능장 취득 기록을 등록하세요." />
        )}

        {!loading && !errorMessage && filteredScoutBadges.length > 0 && (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  {renderSortableHeader("member_no", "대원번호")}
                  {renderSortableHeader("name", "이름")}
                  {isSuperAdmin && renderSortableHeader("organization", "소속")}
                  <th style={thStyle}>현재 급위</th>
                  <th style={thStyle}>다음 급위</th>
                  {renderSortableHeader("category", "기능장 분류")}
                  {renderSortableHeader("badge", "기능장")}
                  {renderSortableHeader("badge_type", "필수 여부")}
                  {renderSortableHeader("acquired_at", "취득일")}
                  {renderSortableHeader("approved_at", "인가일")}
                  {renderSortableHeader("leader_confirmed", "확인")}
                  {renderSortableHeader("usage", "진급 반영")}
                  {renderSortableHeader("note", "비고")}
                  {canManageBadges && <th style={thStyle}>관리</th>}
                </tr>
              </thead>

              <tbody>
                {sortedScoutBadges.map((scoutBadge) => {
                  const scout = scoutMap.get(scoutBadge.scout_id) ?? null;
                  const badge = badgeMap.get(scoutBadge.badge_id) ?? null;
                  const isSelected = selectedScoutBadgeId === scoutBadge.id;
                  const isUsed = usedScoutBadgeIdSet.has(scoutBadge.id);

                  return (
                    <tr
                      key={scoutBadge.id}
                      style={isSelected ? selectedTrStyle : clickableTrStyle}
                      onClick={() =>
                        setSelectedScoutBadgeId((current) =>
                          current === scoutBadge.id ? "" : scoutBadge.id,
                        )
                      }
                    >
                      <td style={tdStyle}>{scout?.member_no ?? "-"}</td>
                      <td style={strongTdStyle}>{scout?.name ?? "-"}</td>
                      {isSuperAdmin && (
                        <td style={tdStyle}>
                          {scout ? getOrganizationName(scout.organization_id) : "-"}
                        </td>
                      )}
                      <td style={tdStyle}>{scout ? scoutProgressMap.get(scout.id)?.currentRank?.rank_name ?? "미등록" : "-"}</td>
                      <td style={tdStyle}>{scout ? scoutProgressMap.get(scout.id)?.nextRank?.rank_name ?? "최종급위" : "-"}</td>
                      <td style={tdStyle}>{getBadgeCategoryName(scoutBadge.badge_id)}</td>
                      <td style={strongTdStyle}>{getBadgeName(scoutBadge.badge_id)}</td>
                      <td style={tdStyle}>
                        <span style={getBadgeTypeBadgeStyle(badge)}>
                          {getBadgeTypeLabel(badge)}
                        </span>
                      </td>
                      <td style={tdStyle}>{formatDate(scoutBadge.acquired_at)}</td>
                      <td style={tdStyle}>{formatDate(scoutBadge.approved_at)}</td>
                      <td style={tdStyle}>
                        {scoutBadge.leader_confirmed ? (
                          <span style={confirmedBadgeStyle}>확인</span>
                        ) : (
                          <span style={unconfirmedBadgeStyle}>미확인</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        {isUsed ? (
                          <span style={usedBadgeStyle}>진급 반영</span>
                        ) : (
                          <span style={unusedBadgeStyle}>미사용</span>
                        )}
                      </td>
                      <td style={tdStyle}>{scoutBadge.note ?? "-"}</td>
                      {canManageBadges && (
                        <td style={tdStyle}>
                          <div style={rowActionStyle}>
                            <button
                              type="button"
                              style={smallButtonStyle}
                              onClick={(event) => {
                                event.stopPropagation();
                                handleOpenEditForm(scoutBadge);
                              }}
                              disabled={isUsed || submitting || deletingId !== ""}
                            >
                              수정
                            </button>
                            <button
                              type="button"
                              style={smallDangerButtonStyle}
                              onClick={(event) => {
                                event.stopPropagation();
                                handleArchiveScoutBadge(scoutBadge);
                              }}
                              disabled={isUsed || deletingId === scoutBadge.id}
                            >
                              {deletingId === scoutBadge.id ? "처리중" : "삭제"}
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

      {isBadgeDrawerOpen && createPortal(
        <div
          style={drawerBackdropStyle}
          onMouseDown={() => {
            if (isCreateFormOpen) {
              handleCloseCreateForm();
            }

            if (isEditFormOpen) {
              handleCloseEditForm();
            }
          }}
        >
          <div
            style={drawerPanelStyle}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {isCreateFormOpen && (
              <form style={drawerFormStyle} onSubmit={handleCreateScoutBadge}>
                <div style={drawerHeaderStyle}>
                  <div>
                    <h3 style={drawerTitleStyle}>기능장 등록</h3>
                    <p style={drawerDescriptionStyle}>
                      대원에게 기능장 취득 기록을 등록합니다.
                    </p>
                  </div>

                  <button
                    type="button"
                    style={drawerCloseButtonStyle}
                    onClick={handleCloseCreateForm}
                    disabled={submitting}
                    aria-label="기능장 등록 닫기"
                  >
                    ×
                  </button>
                </div>

                <div style={drawerBodyStyle}>
                  {createFormScout && (
                    <div style={drawerTargetSummaryStyle}>
                      <span style={drawerTargetLabelStyle}>선택 대원</span>
                      <strong>
                        {createFormScout.member_no ?? "번호없음"} · {createFormScout.name}
                      </strong>
                      <span>
                        {createFormScout.school_name ?? "소속대 미입력"} · {createFormScout.grade ?? "학년 미입력"}
                      </span>
                    </div>
                  )}

                  {createFormBadgeContext?.currentRequirement && (
                    <div style={drawerRequirementSummaryStyle}>
                      <div style={drawerRequirementHeaderStyle}>
                        <strong>현재 진급 기능장 보완 현황</strong>
                        <span>
                          {rankMap.get(createFormBadgeContext.currentRequirement.from_rank_id)?.rank_name ?? "현재급위"}
                          {" → "}
                          {rankMap.get(createFormBadgeContext.currentRequirement.to_rank_id)?.rank_name ?? "다음급위"}
                        </span>
                      </div>
                      <div style={drawerRequirementRowStyle}>
                        <span>필수 기능장</span>
                        <strong style={createFormBadgeContext.missingCurrentRequiredBadges.length > 0 ? drawerRequirementDangerStyle : drawerRequirementGoodStyle}>
                          {createFormBadgeContext.missingCurrentRequiredBadges.length > 0
                            ? `${createFormBadgeContext.missingCurrentRequiredBadges.map((badge) => badge.name).join(", ")} 부족`
                            : "충족"}
                        </strong>
                      </div>
                      <div style={drawerRequirementRowStyle}>
                        <span>일반 기능장</span>
                        <strong style={createFormBadgeContext.generalMissingCount > 0 ? drawerRequirementWarningStyle : drawerRequirementGoodStyle}>
                          필요 {createFormBadgeContext.generalRequiredCount}개 · 보유 {createFormBadgeContext.generalOwnedCount}개
                          {createFormBadgeContext.generalMissingCount > 0
                            ? ` · ${createFormBadgeContext.generalMissingCount}개 부족`
                            : " · 충족"}
                        </strong>
                      </div>
                    </div>
                  )}

                  {formErrorMessage && <div style={errorBoxStyle}>{formErrorMessage}</div>}

                  <label style={drawerFieldLabelStyle}>
                    <span style={drawerLabelTextStyle}>
                      대원 <span style={requiredStyle}>*</span>
                    </span>
                    <select
                      style={drawerInputStyle}
                      value={createForm.scout_id}
                      onChange={(event) => updateCreateForm("scout_id", event.target.value)}
                      required
                    >
                      <option value="">대원 선택</option>
                      {scouts.map((scout) => (
                        <option key={scout.id} value={scout.id}>
                          {scout.member_no ?? "번호없음"} · {scout.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={drawerFieldLabelStyle}>
                    <span style={drawerLabelTextStyle}>
                      기능장 <span style={requiredStyle}>*</span>
                    </span>
                    <select
                      style={drawerInputStyle}
                      value={createForm.badge_id}
                      onChange={(event) => updateCreateForm("badge_id", event.target.value)}
                      required
                    >
                      {renderBadgeSelectOptions(createForm.scout_id)}
                    </select>
                  </label>

                  <label style={drawerFieldLabelStyle}>
                    <span style={drawerLabelTextStyle}>
                      취득일 <span style={requiredStyle}>*</span>
                    </span>
                    <input
                      style={drawerInputStyle}
                      type="date"
                      value={createForm.acquired_at}
                      onChange={(event) =>
                        updateCreateForm("acquired_at", event.target.value)
                      }
                      required
                    />
                  </label>

                  <label style={drawerFieldLabelStyle}>
                    <span style={drawerLabelTextStyle}>인가일</span>
                    <input
                      style={drawerInputStyle}
                      type="date"
                      value={createForm.approved_at}
                      onChange={(event) =>
                        updateCreateForm("approved_at", event.target.value)
                      }
                    />
                  </label>

                  <label style={drawerFieldLabelStyle}>
                    <span style={drawerLabelTextStyle}>지도자·강사명</span>
                    <input
                      style={drawerInputStyle}
                      value={createForm.instructor_name}
                      onChange={(event) =>
                        updateCreateForm("instructor_name", event.target.value)
                      }
                      placeholder="예: 홍길동"
                    />
                  </label>

                  <label style={drawerCheckboxLabelStyle}>
                    <input
                      type="checkbox"
                      checked={createForm.leader_confirmed}
                      onChange={(event) =>
                        updateCreateForm("leader_confirmed", event.target.checked)
                      }
                    />
                    지도자 확인 완료
                  </label>

                  <label style={drawerFieldLabelStyle}>
                    <span style={drawerLabelTextStyle}>비고</span>
                    <textarea
                      style={drawerTextareaStyle}
                      value={createForm.note}
                      onChange={(event) => updateCreateForm("note", event.target.value)}
                      placeholder="특이사항 또는 확인 내용을 입력하세요."
                    />
                  </label>
                </div>

                <div style={drawerFooterStyle}>
                  <button
                    type="button"
                    style={secondaryButtonStyle}
                    onClick={handleCloseCreateForm}
                    disabled={submitting}
                  >
                    취소
                  </button>

                  <button type="submit" style={submitButtonStyle} disabled={submitting}>
                    {submitting ? "등록 중..." : "기능장 등록 저장"}
                  </button>
                </div>
              </form>
            )}

            {isEditFormOpen && selectedScoutBadge && (
              <form style={drawerFormStyle} onSubmit={handleUpdateScoutBadge}>
                <div style={drawerHeaderStyle}>
                  <div>
                    <h3 style={drawerTitleStyle}>기능장 수정</h3>
                    <p style={drawerDescriptionStyle}>
                      선택한 기능장 기록의 취득일, 인가일, 지도자 확인 여부를 수정합니다.
                    </p>
                  </div>

                  <button
                    type="button"
                    style={drawerCloseButtonStyle}
                    onClick={handleCloseEditForm}
                    disabled={submitting}
                    aria-label="기능장 수정 닫기"
                  >
                    ×
                  </button>
                </div>

                <div style={drawerBodyStyle}>
                  <div style={drawerTargetSummaryStyle}>
                    <span style={drawerTargetLabelStyle}>수정 대상</span>
                    <strong>
                      {selectedScout?.member_no ?? "번호없음"} · {selectedScout?.name ?? "-"}
                    </strong>
                    <span>
                      수정 전 기능장: {selectedBadge?.name ?? "-"}
                    </span>
                  </div>
                  {selectedScout && (
                    <div style={drawerRequirementSummaryStyle}>
                      <div style={drawerRequirementHeaderStyle}><strong>현재 진급 영향</strong><span>{scoutProgressMap.get(selectedScout.id)?.currentRank?.rank_name ?? "미등록"} → {scoutProgressMap.get(selectedScout.id)?.nextRank?.rank_name ?? "최종급위"}</span></div>
                      <div style={drawerRequirementRowStyle}><span>필수 기능장</span><strong>{scoutProgressMap.get(selectedScout.id)?.requiredOwned ?? 0}/{scoutProgressMap.get(selectedScout.id)?.requiredTotal ?? 0}</strong></div>
                      <div style={drawerRequirementRowStyle}><span>일반 기능장</span><strong>{scoutProgressMap.get(selectedScout.id)?.generalOwned ?? 0}/{scoutProgressMap.get(selectedScout.id)?.generalRequired ?? 0}</strong></div>
                    </div>
                  )}

                  {editErrorMessage && <div style={errorBoxStyle}>{editErrorMessage}</div>}

                  <label style={drawerFieldLabelStyle}>
                    <span style={drawerLabelTextStyle}>
                      기능장 <span style={requiredStyle}>*</span>
                    </span>
                    <select
                      style={drawerInputStyle}
                      value={editForm.badge_id}
                      onChange={(event) => updateEditForm("badge_id", event.target.value)}
                      required
                    >
                      {renderBadgeSelectOptions(selectedScoutBadge.scout_id, selectedScoutBadge.badge_id)}
                    </select>
                  </label>

                  <label style={drawerFieldLabelStyle}>
                    <span style={drawerLabelTextStyle}>
                      취득일 <span style={requiredStyle}>*</span>
                    </span>
                    <input
                      style={drawerInputStyle}
                      type="date"
                      value={editForm.acquired_at}
                      onChange={(event) => updateEditForm("acquired_at", event.target.value)}
                      required
                    />
                  </label>

                  <label style={drawerFieldLabelStyle}>
                    <span style={drawerLabelTextStyle}>인가일</span>
                    <input
                      style={drawerInputStyle}
                      type="date"
                      value={editForm.approved_at}
                      onChange={(event) => updateEditForm("approved_at", event.target.value)}
                    />
                  </label>

                  <label style={drawerFieldLabelStyle}>
                    <span style={drawerLabelTextStyle}>지도자·강사명</span>
                    <input
                      style={drawerInputStyle}
                      value={editForm.instructor_name}
                      onChange={(event) =>
                        updateEditForm("instructor_name", event.target.value)
                      }
                      placeholder="예: 홍길동"
                    />
                  </label>

                  <label style={drawerCheckboxLabelStyle}>
                    <input
                      type="checkbox"
                      checked={editForm.leader_confirmed}
                      onChange={(event) =>
                        updateEditForm("leader_confirmed", event.target.checked)
                      }
                    />
                    지도자 확인 완료
                  </label>

                  <label style={drawerFieldLabelStyle}>
                    <span style={drawerLabelTextStyle}>비고</span>
                    <textarea
                      style={drawerTextareaStyle}
                      value={editForm.note}
                      onChange={(event) => updateEditForm("note", event.target.value)}
                      placeholder="특이사항 또는 확인 내용을 입력하세요."
                    />
                  </label>
                </div>

                <div style={drawerFooterStyle}>
                  <button
                    type="button"
                    style={secondaryButtonStyle}
                    onClick={handleCloseEditForm}
                    disabled={submitting}
                  >
                    취소
                  </button>

                  <button type="submit" style={submitButtonStyle} disabled={submitting}>
                    {submitting ? "수정 중..." : "기능장 수정 저장"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function getBadgeTypeBadgeStyle(badge: Badge | null): CSSProperties {
  if (badge?.is_required_badge) {
    return requiredBadgeStyle;
  }

  if (badge?.is_general_badge) {
    return generalBadgeStyle;
  }

  return otherBadgeStyle;
}

const drawerBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9000,
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "stretch",
  padding: "0",
  backgroundColor: "rgba(15, 23, 42, 0.28)",
};

const drawerPanelStyle: CSSProperties = {
  width: "min(460px, calc(100vw - 32px))",
  height: "100vh",
  backgroundColor: "#ffffff",
  boxShadow: "-18px 0 48px rgba(15, 23, 42, 0.24)",
  borderLeft: "1px solid #e5e7eb",
  overflow: "hidden",
};

const drawerFormStyle: CSSProperties = {
  height: "100%",
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
};

const drawerHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "14px",
  padding: "18px 18px 14px",
  borderBottom: "1px solid #e5e7eb",
  backgroundColor: "#ffffff",
};

const drawerTitleStyle: CSSProperties = {
  margin: 0,
  color: "#0f172a",
  fontSize: "20px",
  fontWeight: 900,
};

const drawerDescriptionStyle: CSSProperties = {
  marginTop: "6px",
  marginBottom: 0,
  color: "#64748b",
  fontSize: "13px",
  lineHeight: 1.45,
};

const drawerCloseButtonStyle: CSSProperties = {
  width: "34px",
  height: "34px",
  borderRadius: "999px",
  border: "1px solid #cbd5e1",
  backgroundColor: "#ffffff",
  color: "#334155",
  fontSize: "22px",
  fontWeight: 800,
  lineHeight: 1,
  cursor: "pointer",
};

const drawerBodyStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  padding: "14px 18px",
  backgroundColor: "#f8fafc",
};

const drawerFooterStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "8px",
  padding: "12px 18px",
  borderTop: "1px solid #e5e7eb",
  backgroundColor: "#ffffff",
};

const drawerTargetSummaryStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  padding: "12px 14px",
  borderRadius: "10px",
  border: "1px solid #bfdbfe",
  backgroundColor: "#eff6ff",
  color: "#1e3a8a",
  fontSize: "13px",
  lineHeight: 1.45,
};

const drawerTargetLabelStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "12px",
  fontWeight: 800,
};

const drawerFieldLabelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  color: "#334155",
  fontSize: "13px",
  fontWeight: 800,
};

const drawerLabelTextStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
};

const drawerInputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  fontSize: "14px",
  backgroundColor: "#ffffff",
};

const drawerTextareaStyle: CSSProperties = {
  ...drawerInputStyle,
  minHeight: "64px",
  resize: "vertical",
};

const drawerCheckboxLabelStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  padding: "10px 12px",
  borderRadius: "8px",
  border: "1px solid #e5e7eb",
  backgroundColor: "#ffffff",
  color: "#334155",
  fontSize: "13px",
  fontWeight: 800,
};

const drawerRequirementSummaryStyle: CSSProperties = {
  display: "grid",
  gap: "9px",
  padding: "12px 14px",
  borderRadius: "10px",
  border: "1px solid #fed7aa",
  backgroundColor: "#fff7ed",
};

const drawerRequirementHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  color: "#9a3412",
  fontSize: "12px",
};

const drawerRequirementRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "12px",
  paddingTop: "8px",
  borderTop: "1px solid #fed7aa",
  color: "#475569",
  fontSize: "12px",
};

const drawerRequirementDangerStyle: CSSProperties = {
  color: "#b91c1c",
  textAlign: "right",
};

const drawerRequirementWarningStyle: CSSProperties = {
  color: "#c2410c",
  textAlign: "right",
};

const drawerRequirementGoodStyle: CSSProperties = {
  color: "#15803d",
  textAlign: "right",
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
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "10px",
  marginBottom: "24px",
};

const summaryCardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderLeft: "5px solid #cbd5e1",
  borderRadius: "12px",
  padding: "14px 16px",
  backgroundColor: "#ffffff",
};

const summaryTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "15px",
  color: "#475569",
};

const summaryValueStyle: CSSProperties = {
  marginTop: "8px",
  marginBottom: 0,
  fontSize: "26px",
  fontWeight: 900,
  color: "#0f172a",
};

const summaryDescriptionStyle: CSSProperties = {
  marginTop: "5px",
  marginBottom: 0,
  color: "#64748b",
  fontSize: "12.5px",
  lineHeight: 1.4,
};

const neutralSummaryCardStyle: CSSProperties = {
  ...summaryCardStyle,
};

const recordSummaryCardStyle: CSSProperties = {
  ...summaryCardStyle,
  borderLeftColor: "#2563eb",
  backgroundColor: "#eff6ff",
};

const requiredSummaryCardStyle: CSSProperties = {
  ...summaryCardStyle,
  borderLeftColor: "#7c3aed",
  backgroundColor: "#f5f3ff",
};

const generalSummaryCardStyle: CSSProperties = {
  ...summaryCardStyle,
  borderLeftColor: "#16a34a",
  backgroundColor: "#f0fdf4",
};

const usedSummaryCardStyle: CSSProperties = {
  ...summaryCardStyle,
  borderLeftColor: "#f97316",
  backgroundColor: "#fff7ed",
};

const summaryCardHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "8px",
};

const summaryChipBaseStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "3px 8px",
  borderRadius: "999px",
  fontSize: "11px",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const neutralSummaryChipStyle: CSSProperties = {
  ...summaryChipBaseStyle,
  backgroundColor: "#f1f5f9",
  color: "#475569",
};

const recordSummaryChipStyle: CSSProperties = {
  ...summaryChipBaseStyle,
  backgroundColor: "#dbeafe",
  color: "#1d4ed8",
};

const requiredSummaryChipStyle: CSSProperties = {
  ...summaryChipBaseStyle,
  backgroundColor: "#ede9fe",
  color: "#6d28d9",
};

const generalSummaryChipStyle: CSSProperties = {
  ...summaryChipBaseStyle,
  backgroundColor: "#dcfce7",
  color: "#15803d",
};

const usedSummaryChipStyle: CSSProperties = {
  ...summaryChipBaseStyle,
  backgroundColor: "#ffedd5",
  color: "#c2410c",
};

const recordSummaryValueStyle: CSSProperties = {
  ...summaryValueStyle,
  color: "#1d4ed8",
};

const requiredSummaryValueStyle: CSSProperties = {
  ...summaryValueStyle,
  color: "#6d28d9",
};

const generalSummaryValueStyle: CSSProperties = {
  ...summaryValueStyle,
  color: "#15803d",
};

const usedSummaryValueStyle: CSSProperties = {
  ...summaryValueStyle,
  color: "#c2410c",
};

const contentCardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  padding: "16px",
  backgroundColor: "#ffffff",
};

const contentCardWithTopMarginStyle: CSSProperties = {
  ...contentCardStyle,
  marginTop: "18px",
};

const toolbarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "16px",
  marginBottom: "10px",
};

const toolbarRightStyle: CSSProperties = {
  display: "flex",
  gap: "8px",
  alignItems: "center",
  flexWrap: "wrap",
  justifyContent: "flex-end",
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
  lineHeight: 1.6,
};

const searchInputStyle: CSSProperties = {
  width: "320px",
  padding: "10px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  fontSize: "14px",
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

const dangerButtonStyle: CSSProperties = {
  padding: "10px 14px",
  borderRadius: "8px",
  border: "none",
  backgroundColor: "#dc2626",
  color: "#ffffff",
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

const formHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "16px",
  marginBottom: "16px",
};

const formTitleStyle: CSSProperties = {
  margin: 0,
  color: "#0f172a",
  fontSize: "18px",
  fontWeight: 800,
};

const formDescriptionStyle: CSSProperties = {
  marginTop: "6px",
  marginBottom: 0,
  color: "#475569",
  fontSize: "14px",
  lineHeight: 1.5,
};

const inputStyle: CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  fontSize: "14px",
  backgroundColor: "#ffffff",
};

const listToolPanelStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(180px, 1fr) minmax(180px, 1fr) minmax(180px, 1fr) minmax(240px, 1.2fr) auto",
  gap: "10px",
  alignItems: "end",
  padding: "10px 12px",
  borderRadius: "12px",
  border: "1px solid #e5e7eb",
  backgroundColor: "#f8fafc",
  marginBottom: "12px",
};

const listToolFieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "5px",
  color: "#334155",
  fontSize: "12.5px",
  fontWeight: 800,
};

const listToolSelectStyle: CSSProperties = {
  ...inputStyle,
  width: "100%",
  minWidth: 0,
  padding: "8px 10px",
  fontSize: "13.5px",
};

const listToolSearchInputStyle: CSSProperties = {
  ...searchInputStyle,
  width: "100%",
  minWidth: 0,
  padding: "8px 10px",
  fontSize: "13.5px",
};

const listToolActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "8px",
  flexWrap: "wrap",
};

const listCountBadgeStyle: CSSProperties = {
  padding: "8px 10px",
  borderRadius: "999px",
  backgroundColor: "#eff6ff",
  color: "#1d4ed8",
  fontSize: "13px",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const requiredStyle: CSSProperties = {
  color: "#dc2626",
};

const errorBoxStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: "8px",
  backgroundColor: "#fee2e2",
  color: "#991b1b",
  fontWeight: 700,
  marginBottom: "16px",
  lineHeight: 1.5,
};

const emptyStateStyle: CSSProperties = {
  padding: "32px",
  textAlign: "center",
  color: "#64748b",
  border: "1px dashed #cbd5e1",
  borderRadius: "12px",
  backgroundColor: "#f8fafc",
};

const selectedDetailCardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  padding: "18px",
  backgroundColor: "#f8fafc",
  marginBottom: "20px",
};

const detailGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: "12px",
};

const detailItemStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: "10px",
  padding: "12px",
  backgroundColor: "#ffffff",
};

const detailItemWideStyle: CSSProperties = {
  ...detailItemStyle,
  gridColumn: "1 / -1",
};

const detailLabelStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "13px",
  fontWeight: 700,
  marginBottom: "6px",
};

const detailValueStyle: CSSProperties = {
  color: "#0f172a",
  fontSize: "15px",
  fontWeight: 700,
  lineHeight: 1.5,
};

const tableWrapStyle: CSSProperties = {
  overflowX: "auto",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: "1240px",
};

const thStyle: CSSProperties = {
  padding: "9px 10px",
  borderBottom: "1px solid #e5e7eb",
  backgroundColor: "#f8fafc",
  color: "#334155",
  textAlign: "left",
  fontSize: "13px",
  fontWeight: 800,
  whiteSpace: "nowrap",
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
  fontFamily: "inherit",
  fontSize: "13px",
  fontWeight: 800,
  textAlign: "left",
  cursor: "pointer",
};

const sortIndicatorStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: "11px",
  fontWeight: 900,
};

const activeSortIndicatorStyle: CSSProperties = {
  ...sortIndicatorStyle,
  color: "#2563eb",
};

const tdStyle: CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid #e5e7eb",
  color: "#475569",
  fontSize: "13.5px",
  verticalAlign: "middle",
  whiteSpace: "nowrap",
};

const strongTdStyle: CSSProperties = {
  ...tdStyle,
  color: "#0f172a",
  fontWeight: 800,
};

const clickableTrStyle: CSSProperties = {
  cursor: "pointer",
};

const selectedTrStyle: CSSProperties = {
  cursor: "pointer",
  backgroundColor: "#eff6ff",
};

const rowActionStyle: CSSProperties = {
  display: "flex",
  gap: "6px",
  alignItems: "center",
};

const smallButtonStyle: CSSProperties = {
  padding: "7px 9px",
  borderRadius: "7px",
  border: "1px solid #cbd5e1",
  backgroundColor: "#ffffff",
  color: "#334155",
  fontSize: "12px",
  fontWeight: 800,
  cursor: "pointer",
};

const smallDangerButtonStyle: CSSProperties = {
  padding: "7px 9px",
  borderRadius: "7px",
  border: "none",
  backgroundColor: "#ef4444",
  color: "#ffffff",
  fontSize: "12px",
  fontWeight: 800,
  cursor: "pointer",
};

const requiredBadgeStyle: CSSProperties = {
  display: "inline-flex",
  padding: "4px 8px",
  borderRadius: "999px",
  backgroundColor: "#fee2e2",
  color: "#b91c1c",
  fontSize: "12px",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const generalBadgeStyle: CSSProperties = {
  display: "inline-flex",
  padding: "4px 8px",
  borderRadius: "999px",
  backgroundColor: "#dcfce7",
  color: "#15803d",
  fontSize: "12px",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const otherBadgeStyle: CSSProperties = {
  display: "inline-flex",
  padding: "4px 8px",
  borderRadius: "999px",
  backgroundColor: "#e2e8f0",
  color: "#475569",
  fontSize: "12px",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const confirmedBadgeStyle: CSSProperties = {
  display: "inline-flex",
  padding: "4px 8px",
  borderRadius: "999px",
  backgroundColor: "#dbeafe",
  color: "#1d4ed8",
  fontSize: "12px",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const unconfirmedBadgeStyle: CSSProperties = {
  display: "inline-flex",
  padding: "4px 8px",
  borderRadius: "999px",
  backgroundColor: "#fef3c7",
  color: "#92400e",
  fontSize: "12px",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const usedBadgeStyle: CSSProperties = {
  display: "inline-flex",
  padding: "4px 8px",
  borderRadius: "999px",
  backgroundColor: "#fef2f2",
  color: "#991b1b",
  fontSize: "12px",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const unusedBadgeStyle: CSSProperties = {
  display: "inline-flex",
  padding: "4px 8px",
  borderRadius: "999px",
  backgroundColor: "#f1f5f9",
  color: "#475569",
  fontSize: "12px",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const summarySectionHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "16px",
};

const miniCardGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
  gap: "8px",
  maxHeight: "218px",
  overflowY: "auto",
  padding: "2px 10px 10px 2px",
  scrollbarGutter: "stable",
};

const miniCardButtonStyle: CSSProperties = {
  border: "1px solid #dbe3ef",
  borderRadius: "10px",
  padding: "10px 12px",
  backgroundColor: "#ffffff",
  textAlign: "left",
  cursor: "pointer",
  fontFamily: "inherit",
  boxSizing: "border-box",
  outline: "none",
  boxShadow: "none",
  WebkitTapHighlightColor: "transparent",
};

const selectedMiniCardButtonStyle: CSSProperties = {
  ...miniCardButtonStyle,
  border: "1px solid #2563eb",
  backgroundColor: "#eff6ff",
  boxShadow: "0 0 0 3px rgba(37, 99, 235, 0.14)",
};

const miniCardTitleStyle: CSSProperties = {
  color: "#0f172a",
  fontSize: "15px",
  fontWeight: 800,
};

const miniCardMetaStyle: CSSProperties = {
  marginTop: "4px",
  color: "#64748b",
  fontSize: "13px",
};

const miniCardValueStyle: CSSProperties = {
  marginTop: "7px",
  color: "#2563eb",
  fontSize: "19px",
  fontWeight: 900,
};

const emptyMiniCardValueStyle: CSSProperties = {
  ...miniCardValueStyle,
  color: "#94a3b8",
};

const summaryDetailCardStyle: CSSProperties = {
  marginTop: "14px",
  padding: "16px",
  borderRadius: "12px",
  border: "1px solid #dbeafe",
  backgroundColor: "#f8fafc",
};

const summaryDetailHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "16px",
  marginBottom: "12px",
};

const summaryStatsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: "8px",
  marginBottom: "12px",
};

const summaryStatItemStyle: CSSProperties = {
  padding: "10px",
  borderRadius: "10px",
  border: "1px solid #e5e7eb",
  backgroundColor: "#ffffff",
};

const summaryStatValueStyle: CSSProperties = {
  color: "#0f172a",
  fontSize: "18px",
  fontWeight: 900,
};

const summaryDetailTableStyle: CSSProperties = {
  ...tableStyle,
  minWidth: "900px",
};

const miniProgressRowStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "8px", marginTop: "6px", color: "#475569", fontSize: "12px" };
const miniReadyStatusStyle: CSSProperties = { marginTop: "8px", color: "#15803d", fontSize: "12px", fontWeight: 900 };
const miniDangerStatusStyle: CSSProperties = { marginTop: "8px", color: "#b91c1c", fontSize: "12px", fontWeight: 900 };
const miniWarningStatusStyle: CSSProperties = { marginTop: "8px", color: "#c2410c", fontSize: "12px", fontWeight: 900 };
