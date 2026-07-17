import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { EmptyState, FeedbackToast, PageHelpButton } from "../components/common/CommonFeedback";
import { supabase } from "../lib/supabase";

type UserRole = "super_admin" | "org_admin" | "leader" | "viewer";
type ScoutStatus = "active" | "inactive" | "graduated";
type ProgramType = "WSEP" | "MoP";
type ProgressFilter =
  | "all"
  | "beomTarget"
  | "programMissing"
  | "wsepMissing"
  | "mopMissing"
  | "approvalMissing"
  | "completionMissing";
type SortDirection = "asc" | "desc";
type ScoutSortKey =
  | "name"
  | "organization"
  | "status"
  | "wsep"
  | "mop"
  | "currentRank"
  | "nextRank"
  | "completionStatus"
  | "latestCompletedAt";

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
  status: ScoutStatus;
};

type Organization = {
  id: string;
  name: string;
};

type Rank = {
  id: string;
  rank_code: string;
  rank_name: string;
};

type ScoutRankHistory = {
  id: string;
  organization_id: string;
  scout_id: string;
  rank_id: string;
  approved_at: string;
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
  created_at: string;
};

type ProgramForm = {
  scout_id: string;
  program_type: ProgramType;
  completed_at: string;
  certificate_no: string;
  approved_at: string;
  note: string;
};

type ProgramEditForm = {
  id: string;
  program_type: ProgramType;
  completed_at: string;
  certificate_no: string;
  approved_at: string;
  note: string;
};

type BulkProgramForm = {
  program_type: ProgramType;
  completed_at: string;
  certificate_no: string;
  approved_at: string;
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

const PROGRAM_TYPE_OPTIONS: Array<{
  value: ProgramType;
  label: string;
  description: string;
}> = [
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

function getEmptyProgramForm(): ProgramForm {
  return {
    scout_id: "",
    program_type: "WSEP",
    completed_at: getTodayText(),
    certificate_no: "",
    approved_at: "",
    note: "",
  };
}

function getEmptyProgramEditForm(): ProgramEditForm {
  return {
    id: "",
    program_type: "WSEP",
    completed_at: getTodayText(),
    certificate_no: "",
    approved_at: "",
    note: "",
  };
}

function getEmptyBulkProgramForm(): BulkProgramForm {
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

function getProgramTypeDescription(programType: ProgramType) {
  return (
    PROGRAM_TYPE_OPTIONS.find((item) => item.value === programType)?.description ??
    programType
  );
}

const RANK_ORDER = ["초급", "2급", "1급", "별", "무궁화", "범"] as const;

function normalizeRankName(rankName: string | null | undefined) {
  return (rankName ?? "").replace(/\s+/g, "").trim();
}

function getNextRankName(currentRankName: string | null) {
  const normalized = normalizeRankName(currentRankName);
  const currentIndex = RANK_ORDER.findIndex(
    (rankName) => normalizeRankName(rankName) === normalized,
  );

  if (currentIndex < 0) return "초급";
  if (currentIndex >= RANK_ORDER.length - 1) return "-";

  return RANK_ORDER[currentIndex + 1];
}

function isBeomTargetRank(nextRankName: string) {
  return normalizeRankName(nextRankName) === "범";
}

function getProgramEvidenceStatus(completion: ProgramCompletion | undefined) {
  if (!completion) return "미이수";
  if (!completion.approved_at) return "승인 필요";
  if (!completion.certificate_no) return "수료증 확인";
  return "완료";
}

export default function ProgramCompletionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [scouts, setScouts] = useState<Scout[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [scoutRankHistories, setScoutRankHistories] = useState<ScoutRankHistory[]>([]);
  const [programCompletions, setProgramCompletions] = useState<ProgramCompletion[]>([]);

  const [keyword, setKeyword] = useState("");
  const [selectedScoutId, setSelectedScoutId] = useState("");
  const [selectedProgramType, setSelectedProgramType] = useState<"" | ProgramType>("");
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>("all");
  const [selectedCompletionId, setSelectedCompletionId] = useState("");
  const [selectedScoutIds, setSelectedScoutIds] = useState<string[]>([]);
  const [scoutSortKey, setScoutSortKey] = useState<ScoutSortKey>("name");
  const [scoutSortDirection, setScoutSortDirection] = useState<SortDirection>("asc");

  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [createForm, setCreateForm] = useState<ProgramForm>(getEmptyProgramForm());

  const [isBulkFormOpen, setIsBulkFormOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState<BulkProgramForm>(getEmptyBulkProgramForm());

  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
  const [editForm, setEditForm] = useState<ProgramEditForm>(getEmptyProgramEditForm());

  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [formErrorMessage, setFormErrorMessage] = useState("");
  const [editErrorMessage, setEditErrorMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const canManagePrograms =
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

    const { data: rankData, error: rankError } = await supabase
      .from("ranks")
      .select("id, rank_code, rank_name");

    if (rankError) {
      console.error("급위 목록 조회 오류:", rankError.message);
      setErrorMessage("급위 목록을 불러오지 못했습니다.");
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
      .select("id, organization_id, name, member_no, school_name, grade, status")
      .is("deleted_at", null)
      .order("name", { ascending: true });

    let completionQuery = supabase
      .from("program_completions")
      .select(
        "id, organization_id, scout_id, program_type, completed_at, certificate_no, approved_at, note, created_at",
      )
      .is("deleted_at", null)
      .order("completed_at", { ascending: false })
      .order("created_at", { ascending: false });

    let rankHistoryQuery = supabase
      .from("scout_rank_histories")
      .select("id, organization_id, scout_id, rank_id, approved_at")
      .is("deleted_at", null);

    if (currentProfile.role !== "super_admin") {
      if (!currentProfile.organization_id) {
        setErrorMessage("소속 조직 정보가 없어 프로그램 이수 정보를 조회할 수 없습니다.");
        setLoading(false);
        return;
      }

      scoutQuery = scoutQuery.eq("organization_id", currentProfile.organization_id);
      completionQuery = completionQuery.eq(
        "organization_id",
        currentProfile.organization_id,
      );
      rankHistoryQuery = rankHistoryQuery.eq(
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

    const { data: completionData, error: completionError } = await completionQuery;

    if (completionError) {
      console.error("프로그램 이수 목록 조회 오류:", completionError.message);
      setErrorMessage("프로그램 이수 목록을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const { data: rankHistoryData, error: rankHistoryError } = await rankHistoryQuery;

    if (rankHistoryError) {
      console.error("급위 이력 조회 오류:", rankHistoryError.message);
      setErrorMessage("급위 이력을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    setRanks((rankData ?? []) as Rank[]);
    setOrganizations((organizationData ?? []) as Organization[]);
    setScouts((scoutData ?? []) as unknown as Scout[]);
    setProgramCompletions((completionData ?? []) as unknown as ProgramCompletion[]);
    setScoutRankHistories((rankHistoryData ?? []) as unknown as ScoutRankHistory[]);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const scoutIdFromUrl = searchParams.get("scoutId") ?? "";

    setSelectedScoutId(scoutIdFromUrl);
    setSelectedCompletionId("");
    setSelectedScoutIds([]);
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
    setSelectedCompletionId("");
    setIsCreateFormOpen(false);
    setIsBulkFormOpen(false);
    setIsEditFormOpen(false);
    setFormErrorMessage("");
    setEditErrorMessage("");
    setActionMessage("");
  };

  const scoutMap = useMemo(() => {
    return new Map(scouts.map((scout) => [scout.id, scout]));
  }, [scouts]);

  const organizationNameMap = useMemo(() => {
    return new Map(
      organizations.map((organization) => [organization.id, organization.name]),
    );
  }, [organizations]);

  const beomRankIdSet = useMemo(() => {
    return new Set(
      ranks
        .filter((rank) => rank.rank_code === "beom" || rank.rank_name === "범")
        .map((rank) => rank.id),
    );
  }, [ranks]);

  const scoutHasBeomRankSet = useMemo(() => {
    return new Set(
      scoutRankHistories
        .filter((history) => beomRankIdSet.has(history.rank_id))
        .map((history) => history.scout_id),
    );
  }, [beomRankIdSet, scoutRankHistories]);


  const rankNameMap = useMemo(() => {
    return new Map(ranks.map((rank) => [rank.id, rank.rank_name]));
  }, [ranks]);

  const latestRankHistoryByScoutMap = useMemo(() => {
    const map = new Map<string, ScoutRankHistory>();

    scoutRankHistories.forEach((history) => {
      const current = map.get(history.scout_id);

      if (!current || history.approved_at > current.approved_at) {
        map.set(history.scout_id, history);
      }
    });

    return map;
  }, [scoutRankHistories]);

  const getScoutRankInfo = useCallback(
    (scoutId: string) => {
      const latestHistory = latestRankHistoryByScoutMap.get(scoutId);
      const currentRankName = latestHistory
        ? rankNameMap.get(latestHistory.rank_id) ?? "인가기록 없음"
        : "인가기록 없음";
      const nextRankName =
        currentRankName === "인가기록 없음"
          ? "초급"
          : getNextRankName(currentRankName);

      return {
        currentRankName,
        nextRankName,
        isBeomTarget: isBeomTargetRank(nextRankName),
      };
    },
    [latestRankHistoryByScoutMap, rankNameMap],
  );

  const programCompletionCountByScoutMap = useMemo(() => {
    const map = new Map<string, number>();

    programCompletions.forEach((completion) => {
      map.set(completion.scout_id, (map.get(completion.scout_id) ?? 0) + 1);
    });

    return map;
  }, [programCompletions]);

  const existingProgramKeySet = useMemo(() => {
    return new Set(
      programCompletions.map(
        (completion) => `${completion.scout_id}:${completion.program_type}`,
      ),
    );
  }, [programCompletions]);

  const programCompletionByScoutAndTypeMap = useMemo(() => {
    const map = new Map<string, ProgramCompletion>();

    programCompletions.forEach((completion) => {
      const key = `${completion.scout_id}:${completion.program_type}`;
      const current = map.get(key);

      if (!current || completion.completed_at > current.completed_at) {
        map.set(key, completion);
      }
    });

    return map;
  }, [programCompletions]);

  const activeScouts = useMemo(
    () => scouts.filter((scout) => scout.status === "active"),
    [scouts],
  );

  const beomTargetScoutCount = useMemo(() => {
    return activeScouts.filter((scout) => getScoutRankInfo(scout.id).isBeomTarget)
      .length;
  }, [activeScouts, getScoutRankInfo]);

  const programMissingScoutCount = useMemo(() => {
    return activeScouts.filter((scout) => {
      const { isBeomTarget } = getScoutRankInfo(scout.id);
      const wsepCompletion = programCompletionByScoutAndTypeMap.get(
        `${scout.id}:WSEP`,
      );
      const mopCompletion = programCompletionByScoutAndTypeMap.get(
        `${scout.id}:MoP`,
      );

      return isBeomTarget && !wsepCompletion && !mopCompletion;
    }).length;
  }, [
    activeScouts,
    getScoutRankInfo,
    programCompletionByScoutAndTypeMap,
  ]);

  const needsLeaderReviewCount = useMemo(() => {
    return activeScouts.filter((scout) => {
      const completions = [
        programCompletionByScoutAndTypeMap.get(`${scout.id}:WSEP`),
        programCompletionByScoutAndTypeMap.get(`${scout.id}:MoP`),
      ].filter(Boolean) as ProgramCompletion[];

      return completions.some(
        (completion) => !completion.approved_at || !completion.certificate_no,
      );
    }).length;
  }, [activeScouts, programCompletionByScoutAndTypeMap]);

  const selectedBulkDuplicateCount = useMemo(() => {
    return selectedScoutIds.filter((scoutId) =>
      existingProgramKeySet.has(`${scoutId}:${bulkForm.program_type}`),
    ).length;
  }, [bulkForm.program_type, existingProgramKeySet, selectedScoutIds]);

  const filteredScouts = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return scouts.filter((scout) => {
      if (selectedScoutId && scout.id !== selectedScoutId) {
        return false;
      }

      const rankInfo = getScoutRankInfo(scout.id);
      const wsepCompletion = programCompletionByScoutAndTypeMap.get(
        `${scout.id}:WSEP`,
      );
      const mopCompletion = programCompletionByScoutAndTypeMap.get(
        `${scout.id}:MoP`,
      );
      const hasAnyProgram = Boolean(wsepCompletion || mopCompletion);
      const hasApprovalMissing = [wsepCompletion, mopCompletion]
        .filter(Boolean)
        .some((completion) => !completion?.approved_at);
      const hasEvidenceMissing = [wsepCompletion, mopCompletion]
        .filter(Boolean)
        .some((completion) => !completion?.certificate_no);

      if (selectedProgramType === "WSEP" && !wsepCompletion) {
        return false;
      }

      if (selectedProgramType === "MoP" && !mopCompletion) {
        return false;
      }

      switch (progressFilter) {
        case "beomTarget":
          if (!rankInfo.isBeomTarget) return false;
          break;
        case "programMissing":
          if (!rankInfo.isBeomTarget || hasAnyProgram) return false;
          break;
        case "wsepMissing":
          if (wsepCompletion) return false;
          break;
        case "mopMissing":
          if (mopCompletion) return false;
          break;
        case "approvalMissing":
          if (!hasApprovalMissing) return false;
          break;
        case "completionMissing":
          if (!hasEvidenceMissing) return false;
          break;
        case "all":
        default:
          break;
      }

      if (!normalizedKeyword) {
        return true;
      }

      const targetText = [
        scout.name,
        scout.member_no,
        scout.school_name,
        scout.grade,
        SCOUT_STATUS_LABELS[scout.status],
        organizationNameMap.get(scout.organization_id),
        rankInfo.currentRankName,
        rankInfo.nextRankName,
        wsepCompletion?.certificate_no,
        wsepCompletion?.note,
        mopCompletion?.certificate_no,
        mopCompletion?.note,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return targetText.includes(normalizedKeyword);
    });
  }, [
    getScoutRankInfo,
    keyword,
    organizationNameMap,
    programCompletionByScoutAndTypeMap,
    progressFilter,
    scouts,
    selectedProgramType,
    selectedScoutId,
  ]);

  const sortedFilteredScouts = useMemo(() => {
    const compareText = (a: string, b: string) => a.localeCompare(b, "ko");

    const getLatestCompletion = (scoutId: string) => {
      const wsepCompletion = programCompletionByScoutAndTypeMap.get(
        `${scoutId}:WSEP`,
      );
      const mopCompletion = programCompletionByScoutAndTypeMap.get(`${scoutId}:MoP`);

      return [wsepCompletion, mopCompletion]
        .filter(Boolean)
        .sort((a, b) =>
          String(b?.completed_at).localeCompare(String(a?.completed_at)),
        )[0] as ProgramCompletion | undefined;
    };

    return [...filteredScouts].sort((a, b) => {
      const getSortValue = (scout: Scout) => {
        const wsepCompletion = programCompletionByScoutAndTypeMap.get(
          `${scout.id}:WSEP`,
        );
        const mopCompletion = programCompletionByScoutAndTypeMap.get(
          `${scout.id}:MoP`,
        );
        const latestCompletion = getLatestCompletion(scout.id);

        switch (scoutSortKey) {
          case "organization":
            return organizationNameMap.get(scout.organization_id) ?? "";
          case "status":
            return SCOUT_STATUS_LABELS[scout.status] ?? scout.status;
          case "wsep":
            return wsepCompletion?.completed_at ?? "";
          case "mop":
            return mopCompletion?.completed_at ?? "";
          case "currentRank":
            return getScoutRankInfo(scout.id).currentRankName;
          case "nextRank":
            return getScoutRankInfo(scout.id).nextRankName;
          case "completionStatus":
            return wsepCompletion || mopCompletion ? 1 : 0;
          case "latestCompletedAt":
            return latestCompletion?.completed_at ?? "";
          case "name":
          default:
            return `${scout.name} ${scout.member_no ?? ""}`;
        }
      };

      const valueA = getSortValue(a);
      const valueB = getSortValue(b);
      const result =
        typeof valueA === "number" && typeof valueB === "number"
          ? valueA - valueB
          : compareText(String(valueA), String(valueB));

      return scoutSortDirection === "asc" ? result : -result;
    });
  }, [
    filteredScouts,
    getScoutRankInfo,
    organizationNameMap,
    programCompletionByScoutAndTypeMap,
    scoutSortDirection,
    scoutSortKey,
  ]);

  const visibleScoutIds = useMemo(
    () => sortedFilteredScouts.map((scout) => scout.id),
    [sortedFilteredScouts],
  );

  const allVisibleScoutsSelected = useMemo(() => {
    return (
      visibleScoutIds.length > 0 &&
      visibleScoutIds.every((scoutId) => selectedScoutIds.includes(scoutId))
    );
  }, [selectedScoutIds, visibleScoutIds]);

  const selectedCompletion = useMemo(() => {
    return (
      programCompletions.find(
        (completion) => completion.id === selectedCompletionId,
      ) ?? null
    );
  }, [programCompletions, selectedCompletionId]);

  const getIsDeletionProtected = (completion: ProgramCompletion) => {
    return (
      scoutHasBeomRankSet.has(completion.scout_id) &&
      (programCompletionCountByScoutMap.get(completion.scout_id) ?? 0) <= 1
    );
  };

  const handleOpenCreateForm = (scoutId?: string, programType?: ProgramType) => {
    if (!canManagePrograms) return;

    setCreateForm({
      ...getEmptyProgramForm(),
      scout_id: scoutId ?? selectedScoutId,
      program_type: programType ?? (selectedProgramType || "WSEP"),
    });
    setFormErrorMessage("");
    setEditErrorMessage("");
    setActionMessage("");
    setIsBulkFormOpen(false);
    setIsEditFormOpen(false);
    setIsCreateFormOpen(true);
  };

  const handleOpenBulkForm = () => {
    if (!canManagePrograms) return;

    if (selectedScoutIds.length === 0) {
      setActionMessage("일괄 등록할 대원을 먼저 선택하세요.");
      return;
    }

    setBulkForm({
      ...getEmptyBulkProgramForm(),
      program_type: selectedProgramType || "WSEP",
    });
    setFormErrorMessage("");
    setEditErrorMessage("");
    setActionMessage("");
    setIsCreateFormOpen(false);
    setIsEditFormOpen(false);
    setIsBulkFormOpen(true);
  };

  const handleCloseCreateForm = () => {
    if (submitting) return;

    setIsCreateFormOpen(false);
    setCreateForm(getEmptyProgramForm());
    setFormErrorMessage("");
  };

  const handleCloseBulkForm = () => {
    if (submitting) return;

    setIsBulkFormOpen(false);
    setBulkForm(getEmptyBulkProgramForm());
    setFormErrorMessage("");
  };

  const handleOpenEditForm = (completion: ProgramCompletion) => {
    if (!canManagePrograms) return;

    setEditForm({
      id: completion.id,
      program_type: completion.program_type,
      completed_at: toDateInputText(completion.completed_at),
      certificate_no: completion.certificate_no ?? "",
      approved_at: toDateInputText(completion.approved_at),
      note: completion.note ?? "",
    });
    setSelectedCompletionId(completion.id);
    setEditErrorMessage("");
    setFormErrorMessage("");
    setActionMessage("");
    setIsCreateFormOpen(false);
    setIsBulkFormOpen(false);
    setIsEditFormOpen(true);
  };

  const handleCloseEditForm = () => {
    if (submitting) return;

    setIsEditFormOpen(false);
    setEditForm(getEmptyProgramEditForm());
    setEditErrorMessage("");
  };

  const updateCreateForm = <K extends keyof ProgramForm>(
    field: K,
    value: ProgramForm[K],
  ) => {
    setCreateForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const updateBulkForm = <K extends keyof BulkProgramForm>(
    field: K,
    value: BulkProgramForm[K],
  ) => {
    setBulkForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const updateEditForm = <K extends keyof ProgramEditForm>(
    field: K,
    value: ProgramEditForm[K],
  ) => {
    setEditForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleToggleScoutSelection = (scoutId: string, checked: boolean) => {
    setSelectedScoutIds((prev) => {
      if (checked) {
        return prev.includes(scoutId) ? prev : [...prev, scoutId];
      }

      return prev.filter((id) => id !== scoutId);
    });
  };

  const handleToggleAllVisibleScouts = (checked: boolean) => {
    if (checked) {
      setSelectedScoutIds((prev) => Array.from(new Set([...prev, ...visibleScoutIds])));
      return;
    }

    setSelectedScoutIds((prev) =>
      prev.filter((scoutId) => !visibleScoutIds.includes(scoutId)),
    );
  };

  const handleChangeScoutSort = (sortKey: ScoutSortKey) => {
    if (scoutSortKey === sortKey) {
      setScoutSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setScoutSortKey(sortKey);
    setScoutSortDirection("asc");
  };

  const getSortIndicator = (sortKey: ScoutSortKey) => {
    if (scoutSortKey !== sortKey) return "";
    return scoutSortDirection === "asc" ? " ▲" : " ▼";
  };

  const handleClickScoutRow = (scoutId: string, latestCompletion?: ProgramCompletion) => {
    if (canManagePrograms) {
      handleToggleScoutSelection(scoutId, !selectedScoutIds.includes(scoutId));
      return;
    }

    if (latestCompletion) {
      setSelectedCompletionId(latestCompletion.id);
    }
  };

  const handleCreateProgramCompletion = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!canManagePrograms) {
      setFormErrorMessage("프로그램 이수 등록 권한이 없습니다.");
      return;
    }

    if (!createForm.scout_id) {
      setFormErrorMessage("대원을 선택해야 합니다.");
      return;
    }

    if (!createForm.program_type) {
      setFormErrorMessage("프로그램을 선택해야 합니다.");
      return;
    }

    if (!createForm.completed_at) {
      setFormErrorMessage("이수일을 입력해야 합니다.");
      return;
    }

    if (
      createForm.approved_at &&
      createForm.approved_at < createForm.completed_at
    ) {
      setFormErrorMessage("승인일은 이수일보다 빠를 수 없습니다.");
      return;
    }

    const duplicateKey = `${createForm.scout_id}:${createForm.program_type}`;

    if (existingProgramKeySet.has(duplicateKey)) {
      setFormErrorMessage("선택한 대원에게 이미 같은 프로그램 이수 기록이 있습니다.");
      return;
    }

    setSubmitting(true);
    setFormErrorMessage("");
    setActionMessage("");

    const rpcClient = supabase as unknown as RpcClient;

    const { error } = await rpcClient.rpc("create_program_completion_record", {
      p_scout_id: createForm.scout_id,
      p_program_type: createForm.program_type,
      p_completed_at: createForm.completed_at,
      p_certificate_no: toNullableText(createForm.certificate_no),
      p_approved_at: toNullableDate(createForm.approved_at),
      p_note: toNullableText(createForm.note),
    });

    if (error) {
      console.error("프로그램 이수 등록 오류:", error.message);
      setFormErrorMessage(`프로그램 이수 등록에 실패했습니다. ${error.message}`);
      setSubmitting(false);
      return;
    }

    setCreateForm(getEmptyProgramForm());
    setIsCreateFormOpen(false);
    setSubmitting(false);
    setActionMessage("프로그램 이수 기록을 등록했습니다.");

    await loadData();
  };

  const handleCreateBulkProgramCompletions = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!canManagePrograms) {
      setFormErrorMessage("프로그램 이수 등록 권한이 없습니다.");
      return;
    }

    if (selectedScoutIds.length === 0) {
      setFormErrorMessage("일괄 등록할 대원을 선택해야 합니다.");
      return;
    }

    if (!bulkForm.program_type) {
      setFormErrorMessage("프로그램을 선택해야 합니다.");
      return;
    }

    if (!bulkForm.completed_at) {
      setFormErrorMessage("이수일을 입력해야 합니다.");
      return;
    }

    if (bulkForm.approved_at && bulkForm.approved_at < bulkForm.completed_at) {
      setFormErrorMessage("승인일은 이수일보다 빠를 수 없습니다.");
      return;
    }

    const targetScoutIds = selectedScoutIds.filter(
      (scoutId) => !existingProgramKeySet.has(`${scoutId}:${bulkForm.program_type}`),
    );

    if (targetScoutIds.length === 0) {
      setFormErrorMessage("선택한 대원은 모두 해당 프로그램 이수 기록이 이미 있습니다.");
      return;
    }

    setSubmitting(true);
    setFormErrorMessage("");
    setActionMessage("");

    const rpcClient = supabase as unknown as RpcClient;
    const failedScoutNames: string[] = [];

    for (const scoutId of targetScoutIds) {
      const { error } = await rpcClient.rpc("create_program_completion_record", {
        p_scout_id: scoutId,
        p_program_type: bulkForm.program_type,
        p_completed_at: bulkForm.completed_at,
        p_certificate_no: toNullableText(bulkForm.certificate_no),
        p_approved_at: toNullableDate(bulkForm.approved_at),
        p_note: toNullableText(bulkForm.note),
      });

      if (error) {
        console.error("프로그램 이수 일괄 등록 오류:", error.message);
        failedScoutNames.push(getScoutDisplayName(scoutId));
      }
    }

    setSubmitting(false);
    setIsBulkFormOpen(false);
    setBulkForm(getEmptyBulkProgramForm());
    setSelectedScoutIds([]);

    const skippedCount = selectedScoutIds.length - targetScoutIds.length;

    if (failedScoutNames.length > 0) {
      setActionMessage(
        `${targetScoutIds.length - failedScoutNames.length}명 등록, ${failedScoutNames.length}명 실패${skippedCount > 0 ? `, ${skippedCount}명은 기존 기록이 있어 제외` : ""}`,
      );
    } else {
      setActionMessage(
        `${targetScoutIds.length}명의 프로그램 이수 기록을 등록했습니다.${skippedCount > 0 ? ` 기존 기록이 있는 ${skippedCount}명은 제외했습니다.` : ""}`,
      );
    }

    await loadData();
  };

  const handleUpdateProgramCompletion = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!canManagePrograms) {
      setEditErrorMessage("프로그램 이수 수정 권한이 없습니다.");
      return;
    }

    const currentCompletion = programCompletions.find(
      (completion) => completion.id === editForm.id,
    );

    if (!currentCompletion) {
      setEditErrorMessage("수정할 프로그램 이수 기록을 찾지 못했습니다.");
      return;
    }

    if (!editForm.program_type) {
      setEditErrorMessage("프로그램을 선택해야 합니다.");
      return;
    }

    if (!editForm.completed_at) {
      setEditErrorMessage("이수일을 입력해야 합니다.");
      return;
    }

    if (editForm.approved_at && editForm.approved_at < editForm.completed_at) {
      setEditErrorMessage("승인일은 이수일보다 빠를 수 없습니다.");
      return;
    }

    const hasDuplicate = programCompletions.some(
      (completion) =>
        completion.id !== editForm.id &&
        completion.scout_id === currentCompletion.scout_id &&
        completion.program_type === editForm.program_type,
    );

    if (hasDuplicate) {
      setEditErrorMessage("선택한 대원에게 이미 같은 프로그램 이수 기록이 있습니다.");
      return;
    }

    setSubmitting(true);
    setEditErrorMessage("");
    setActionMessage("");

    const rpcClient = supabase as unknown as RpcClient;

    const { error } = await rpcClient.rpc("update_program_completion_record", {
      p_program_completion_id: editForm.id,
      p_program_type: editForm.program_type,
      p_completed_at: editForm.completed_at,
      p_certificate_no: toNullableText(editForm.certificate_no),
      p_approved_at: toNullableDate(editForm.approved_at),
      p_note: toNullableText(editForm.note),
    });

    if (error) {
      console.error("프로그램 이수 수정 오류:", error.message);
      setEditErrorMessage(`프로그램 이수 수정에 실패했습니다. ${error.message}`);
      setSubmitting(false);
      return;
    }

    setIsEditFormOpen(false);
    setEditForm(getEmptyProgramEditForm());
    setSubmitting(false);
    setActionMessage("프로그램 이수 기록을 수정했습니다.");

    await loadData();
  };

  const handleArchiveProgramCompletion = async (completion: ProgramCompletion) => {
    if (!canManagePrograms) return;

    if (getIsDeletionProtected(completion)) {
      setActionMessage(
        "범스카우트 인가 이력이 있는 대원의 마지막 WSEP/MoP 이수 기록은 삭제할 수 없습니다.",
      );
      return;
    }

    const scoutName = getScoutDisplayName(completion.scout_id);
    const confirmed = window.confirm(
      `${scoutName} 대원의 ${completion.program_type} 이수 기록을 삭제할까요?\n\n삭제한 기록은 목록에서 제외됩니다.`,
    );

    if (!confirmed) return;

    setDeletingId(completion.id);
    setActionMessage("");
    setEditErrorMessage("");

    const rpcClient = supabase as unknown as RpcClient;

    const { error } = await rpcClient.rpc("archive_program_completion_record", {
      p_program_completion_id: completion.id,
    });

    if (error) {
      console.error("프로그램 이수 삭제 오류:", error.message);
      setActionMessage(`프로그램 이수 삭제에 실패했습니다. ${error.message}`);
      setDeletingId("");
      return;
    }

    if (selectedCompletionId === completion.id) {
      setSelectedCompletionId("");
    }

    if (editForm.id === completion.id) {
      setIsEditFormOpen(false);
      setEditForm(getEmptyProgramEditForm());
    }

    setDeletingId("");
    setActionMessage("프로그램 이수 기록을 삭제했습니다.");

    await loadData();
  };

  const getScoutDisplayName = (scoutId: string) => {
    const scout = scoutMap.get(scoutId);

    if (!scout) return "-";

    return `${scout.name}${scout.member_no ? ` (${scout.member_no})` : ""}`;
  };

  const getOrganizationName = (organizationId: string) => {
    return organizationNameMap.get(organizationId) ?? "-";
  };

  const getScoutStatusLabel = (scoutId: string) => {
    const scout = scoutMap.get(scoutId);

    if (!scout) return "-";

    return SCOUT_STATUS_LABELS[scout.status] ?? scout.status;
  };

  const getProtectionLabel = (completion: ProgramCompletion) => {
    if (getIsDeletionProtected(completion)) {
      return "삭제 제한";
    }

    if (scoutHasBeomRankSet.has(completion.scout_id)) {
      return "범 인가 대원";
    }

    return "일반";
  };

  return (
    <div>
      <div style={pageHeaderStyle}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}><h1 style={pageTitleStyle}>프로그램 이수 관리</h1><PageHelpButton title="프로그램 이수 관리" description="WSEP·MoP 이수와 승인 상태를 관리합니다." sections={[{ title: "사용 순서", content: "범 진급 대상과 미이수·승인 필요 대원을 우선 확인합니다." },{ title: "주의사항", content: "이수일, 수료증 번호, 승인일을 실제 증빙과 일치하게 입력합니다." }]} /></div>
          <p style={pageDescriptionStyle}>
            대원의 현재 급위와 다음 급위를 기준으로 WSEP·MoP 이수 여부와 범 진급 영향을 관리합니다.
          </p>
        </div>

        {profile && <div style={roleBadgeStyle}>{ROLE_LABELS[profile.role]}</div>}
      </div>

      <div style={summaryGridStyle}>
        <section style={{ ...summaryCardStyle, ...summaryNeutralCardStyle }}>
          <h2 style={summaryTitleStyle}>관리 대상 대원</h2>
          <p style={summaryValueStyle}>{activeScouts.length}명</p>
          <p style={summaryDescriptionStyle}>현재 활동 중인 대원을 기준으로 확인합니다.</p>
        </section>

        <section style={{ ...summaryCardStyle, ...summaryInfoCardStyle }}>
          <h2 style={summaryTitleStyle}>범 진급 대상</h2>
          <p style={summaryValueStyle}>{beomTargetScoutCount}명</p>
          <p style={summaryDescriptionStyle}>현재 무궁화급으로 다음 급위가 범인 대원입니다.</p>
        </section>

        <section style={{ ...summaryCardStyle, ...summaryDangerCardStyle }}>
          <h2 style={summaryTitleStyle}>프로그램 부족</h2>
          <p style={summaryValueStyle}>{programMissingScoutCount}명</p>
          <p style={summaryDescriptionStyle}>범 진급 대상 중 WSEP·MoP 기록이 없는 대원입니다.</p>
        </section>

        <section style={{ ...summaryCardStyle, ...summaryWarningCardStyle }}>
          <h2 style={summaryTitleStyle}>지도자 확인 필요</h2>
          <p style={summaryValueStyle}>{needsLeaderReviewCount}명</p>
          <p style={summaryDescriptionStyle}>승인일 또는 수료증번호 확인이 필요한 대원입니다.</p>
        </section>
      </div>

      <section style={contentCardStyle}>
        <div style={toolbarStyle}>
          <div>
            <h2 style={sectionTitleStyle}>대원별 프로그램 이수 현황</h2>
            <p style={sectionDescriptionStyle}>
              전체 대원을 기준으로 WSEP / MoP 이수 여부를 확인하고, 선택 대원은 일괄 등록할 수 있습니다.
            </p>
          </div>

          <div style={toolbarRightStyle}>
            <select
              style={filterSelectStyle}
              value={progressFilter}
              onChange={(event) => {
                setProgressFilter(event.target.value as ProgressFilter);
                setSelectedScoutIds([]);
              }}
            >
              <option value="all">전체 현황</option>
              <option value="beomTarget">범 진급 대상</option>
              <option value="programMissing">프로그램 부족</option>
              <option value="wsepMissing">WSEP 미이수</option>
              <option value="mopMissing">MoP 미이수</option>
              <option value="approvalMissing">승인 필요</option>
              <option value="completionMissing">수료증 확인</option>
            </select>

            <select
              style={filterSelectStyle}
              value={selectedScoutId}
              onChange={(event) => handleChangeSelectedScoutId(event.target.value)}
            >
              <option value="">전체 대원</option>
              {scouts.map((scout) => (
                <option key={scout.id} value={scout.id}>
                  {scout.name} {scout.member_no ? `(${scout.member_no})` : ""}
                </option>
              ))}
            </select>

            <select
              style={filterSelectStyle}
              value={selectedProgramType}
              onChange={(event) => {
                setSelectedProgramType(event.target.value as "" | ProgramType);
                setSelectedScoutIds([]);
              }}
            >
              <option value="">전체 프로그램</option>
              {PROGRAM_TYPE_OPTIONS.map((program) => (
                <option key={program.value} value={program.value}>
                  {program.label} 이수 대원
                </option>
              ))}
            </select>

            <input
              style={searchInputStyle}
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="대원명, 대원번호, 수료증번호 검색"
            />

            <button type="button" style={secondaryButtonStyle} onClick={loadData}>
              새로고침
            </button>

            {canManagePrograms && (
              <button
                type="button"
                style={selectedScoutIds.length > 0 ? bulkButtonStyle : disabledBulkButtonStyle}
                onClick={handleOpenBulkForm}
                disabled={selectedScoutIds.length === 0}
              >
                선택 대원 일괄 등록
              </button>
            )}

          </div>
        </div>

        <div style={guideBoxStyle}>
          범 진급 대상은 WSEP 또는 MoP 중 1개 이상의 이수·승인 기록이 필요합니다. 프로그램 부족 대원을 먼저 확인하고, 승인일과 수료증번호까지 점검하세요.
        </div>

        <FeedbackToast message={actionMessage} tone="success" onClose={() => setActionMessage("")} />

        {loading && <div style={emptyStateStyle}>프로그램 이수 현황을 불러오는 중입니다...</div>}

        {!loading && errorMessage && <div style={errorBoxStyle}>{errorMessage}</div>}

        {!loading && !errorMessage && filteredScouts.length === 0 && (
          <EmptyState title="조회되는 대원이 없습니다" description="검색 조건을 초기화하거나 먼저 대원을 등록하세요." />
        )}

        {!loading && !errorMessage && filteredScouts.length > 0 && (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  {canManagePrograms && (
                    <th style={checkThStyle}>
                      <input
                        type="checkbox"
                        checked={allVisibleScoutsSelected}
                        onChange={(event) => handleToggleAllVisibleScouts(event.target.checked)}
                        aria-label="화면에 표시된 대원 전체 선택"
                      />
                    </th>
                  )}
                  <th style={thStyle}>
                    <button
                      type="button"
                      style={sortHeaderButtonStyle}
                      onClick={() => handleChangeScoutSort("name")}
                    >
                      대원{getSortIndicator("name")}
                    </button>
                  </th>
                  {isSuperAdmin && (
                    <th style={thStyle}>
                      <button
                        type="button"
                        style={sortHeaderButtonStyle}
                        onClick={() => handleChangeScoutSort("organization")}
                      >
                        소속{getSortIndicator("organization")}
                      </button>
                    </th>
                  )}
                  <th style={thStyle}>
                    <button
                      type="button"
                      style={sortHeaderButtonStyle}
                      onClick={() => handleChangeScoutSort("status")}
                    >
                      상태{getSortIndicator("status")}
                    </button>
                  </th>
                  <th style={thStyle}>
                    <button
                      type="button"
                      style={sortHeaderButtonStyle}
                      onClick={() => handleChangeScoutSort("currentRank")}
                    >
                      현재급위{getSortIndicator("currentRank")}
                    </button>
                  </th>
                  <th style={thStyle}>
                    <button
                      type="button"
                      style={sortHeaderButtonStyle}
                      onClick={() => handleChangeScoutSort("nextRank")}
                    >
                      다음급위{getSortIndicator("nextRank")}
                    </button>
                  </th>
                  <th style={thStyle}>
                    <button
                      type="button"
                      style={sortHeaderButtonStyle}
                      onClick={() => handleChangeScoutSort("wsep")}
                    >
                      WSEP{getSortIndicator("wsep")}
                    </button>
                  </th>
                  <th style={thStyle}>
                    <button
                      type="button"
                      style={sortHeaderButtonStyle}
                      onClick={() => handleChangeScoutSort("mop")}
                    >
                      MoP{getSortIndicator("mop")}
                    </button>
                  </th>
                  <th style={thStyle}>
                    <button
                      type="button"
                      style={sortHeaderButtonStyle}
                      onClick={() => handleChangeScoutSort("completionStatus")}
                    >
                      범 진급 영향{getSortIndicator("completionStatus")}
                    </button>
                  </th>
                  <th style={thStyle}>
                    <button
                      type="button"
                      style={sortHeaderButtonStyle}
                      onClick={() => handleChangeScoutSort("latestCompletedAt")}
                    >
                      최근 기록{getSortIndicator("latestCompletedAt")}
                    </button>
                  </th>
                  {canManagePrograms && <th style={thStyle}>관리</th>}
                </tr>
              </thead>

              <tbody>
                {sortedFilteredScouts.map((scout) => {
                  const wsepCompletion = programCompletionByScoutAndTypeMap.get(`${scout.id}:WSEP`);
                  const mopCompletion = programCompletionByScoutAndTypeMap.get(`${scout.id}:MoP`);
                  const hasAnyProgram = Boolean(wsepCompletion || mopCompletion);
                  const rankInfo = getScoutRankInfo(scout.id);
                  const hasApprovedProgram = [wsepCompletion, mopCompletion].some(
                    (completion) => Boolean(completion?.approved_at),
                  );
                  const hasCompleteEvidence = [wsepCompletion, mopCompletion].some(
                    (completion) =>
                      Boolean(completion?.approved_at && completion?.certificate_no),
                  );
                  const latestCompletion = [wsepCompletion, mopCompletion]
                    .filter(Boolean)
                    .sort((a, b) => String(b?.completed_at).localeCompare(String(a?.completed_at)))[0] as ProgramCompletion | undefined;
                  const nextProgramType = selectedProgramType || (!wsepCompletion ? "WSEP" : !mopCompletion ? "MoP" : "WSEP");
                  const canRegisterProgram = !existingProgramKeySet.has(`${scout.id}:${nextProgramType}`);
                  const isScoutSelected = selectedScoutIds.includes(scout.id);

                  return (
                    <tr
                      key={scout.id}
                      style={isScoutSelected ? selectedRowStyle : rowStyle}
                      onClick={() => handleClickScoutRow(scout.id, latestCompletion)}
                    >
                      {canManagePrograms && (
                        <td
                          style={checkTdStyle}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isScoutSelected}
                            onChange={(event) =>
                              handleToggleScoutSelection(scout.id, event.target.checked)
                            }
                            aria-label={`${getScoutDisplayName(scout.id)} 선택`}
                          />
                        </td>
                      )}
                      <td style={strongTdStyle}>{getScoutDisplayName(scout.id)}</td>
                      {isSuperAdmin && <td style={tdStyle}>{getOrganizationName(scout.organization_id)}</td>}
                      <td style={tdStyle}>{SCOUT_STATUS_LABELS[scout.status]}</td>
                      <td style={tdStyle}>
                        <span style={rankBadgeStyle}>{rankInfo.currentRankName}</span>
                      </td>
                      <td style={tdStyle}>
                        <span style={nextRankBadgeStyle}>{rankInfo.nextRankName}</span>
                      </td>
                      <td style={tdStyle}>
                        {wsepCompletion ? (
                          <button
                            type="button"
                            style={programDoneButtonStyle}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedCompletionId(wsepCompletion.id);
                            }}
                          >
                            {getProgramEvidenceStatus(wsepCompletion)} · {formatDate(wsepCompletion.completed_at)}
                          </button>
                        ) : (
                          <span style={programMissingBadgeStyle}>미이수</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        {mopCompletion ? (
                          <button
                            type="button"
                            style={programDoneButtonStyle}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedCompletionId(mopCompletion.id);
                            }}
                          >
                            {getProgramEvidenceStatus(mopCompletion)} · {formatDate(mopCompletion.completed_at)}
                          </button>
                        ) : (
                          <span style={programMissingBadgeStyle}>미이수</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        {!rankInfo.isBeomTarget ? (
                          <span style={referenceBadgeStyle}>현재 진급 참고</span>
                        ) : hasCompleteEvidence ? (
                          <span style={promotionReadyBadgeStyle}>프로그램 충족</span>
                        ) : hasApprovedProgram || hasAnyProgram ? (
                          <span style={needCheckBadgeStyle}>증빙 확인 필요</span>
                        ) : (
                          <span style={programMissingImpactBadgeStyle}>프로그램 부족</span>
                        )}
                      </td>
                      <td style={tdStyle}>{latestCompletion ? formatDate(latestCompletion.completed_at) : "-"}</td>
                      {canManagePrograms && (
                        <td style={actionTdStyle} onClick={(event) => event.stopPropagation()}>
                          <button
                            type="button"
                            style={smallSecondaryButtonStyle}
                            onClick={() => handleOpenCreateForm(scout.id, nextProgramType)}
                            disabled={submitting || !canRegisterProgram}
                          >
                            {canRegisterProgram ? "프로그램 등록" : "등록 완료"}
                          </button>
                          {latestCompletion && (
                            <button
                              type="button"
                              style={smallSecondaryButtonStyle}
                              onClick={() => handleOpenEditForm(latestCompletion)}
                              disabled={submitting || deletingId === latestCompletion.id}
                            >
                              수정
                            </button>
                          )}
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

      {selectedCompletion && !isEditFormOpen && (
        <section style={contentCardWithTopMarginStyle}>
          <div style={detailHeaderStyle}>
            <div>
              <h2 style={sectionTitleStyle}>선택 기록 상세</h2>
              <p style={sectionDescriptionStyle}>
                프로그램 이수 기록과 범 진급 반영 상태를 함께 확인합니다.
              </p>
            </div>

            <div style={detailActionStyle}>
              <button
                type="button"
                style={secondaryButtonStyle}
                onClick={() => setSelectedCompletionId("")}
              >
                닫기
              </button>
              {canManagePrograms && (
                <>
                  <button
                    type="button"
                    style={secondaryButtonStyle}
                    onClick={() => handleOpenEditForm(selectedCompletion)}
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    style={
                      getIsDeletionProtected(selectedCompletion)
                        ? disabledDangerButtonStyle
                        : dangerButtonStyle
                    }
                    onClick={() => handleArchiveProgramCompletion(selectedCompletion)}
                    disabled={getIsDeletionProtected(selectedCompletion)}
                    title={
                      getIsDeletionProtected(selectedCompletion)
                        ? "범스카우트 인가 이력이 있는 대원의 마지막 WSEP/MoP 기록은 삭제할 수 없습니다."
                        : "삭제"
                    }
                  >
                    삭제
                  </button>
                </>
              )}
            </div>
          </div>

          <div style={detailGridStyle}>
            <div style={detailItemStyle}>
              <span style={detailLabelStyle}>현재급위</span>
              <strong>{getScoutRankInfo(selectedCompletion.scout_id).currentRankName}</strong>
            </div>
            <div style={detailItemStyle}>
              <span style={detailLabelStyle}>다음급위</span>
              <strong>{getScoutRankInfo(selectedCompletion.scout_id).nextRankName}</strong>
            </div>
            <div style={detailItemStyle}>
              <span style={detailLabelStyle}>범 진급 영향</span>
              <strong>
                {getScoutRankInfo(selectedCompletion.scout_id).isBeomTarget
                  ? selectedCompletion.approved_at && selectedCompletion.certificate_no
                    ? "프로그램 조건 충족"
                    : "증빙 확인 필요"
                  : "현재 진급 참고 기록"}
              </strong>
            </div>
            <div style={detailItemStyle}>
              <span style={detailLabelStyle}>대원</span>
              <strong>{getScoutDisplayName(selectedCompletion.scout_id)}</strong>
            </div>
            <div style={detailItemStyle}>
              <span style={detailLabelStyle}>소속</span>
              <strong>{getOrganizationName(selectedCompletion.organization_id)}</strong>
            </div>
            <div style={detailItemStyle}>
              <span style={detailLabelStyle}>상태</span>
              <strong>{getScoutStatusLabel(selectedCompletion.scout_id)}</strong>
            </div>
            <div style={detailItemStyle}>
              <span style={detailLabelStyle}>프로그램</span>
              <strong>{selectedCompletion.program_type}</strong>
            </div>
            <div style={detailItemStyle}>
              <span style={detailLabelStyle}>프로그램명</span>
              <strong>{getProgramTypeDescription(selectedCompletion.program_type)}</strong>
            </div>
            <div style={detailItemStyle}>
              <span style={detailLabelStyle}>이수일</span>
              <strong>{formatDate(selectedCompletion.completed_at)}</strong>
            </div>
            <div style={detailItemStyle}>
              <span style={detailLabelStyle}>승인일</span>
              <strong>{formatDate(selectedCompletion.approved_at)}</strong>
            </div>
            <div style={detailItemStyle}>
              <span style={detailLabelStyle}>수료증번호</span>
              <strong>{selectedCompletion.certificate_no ?? "-"}</strong>
            </div>
            <div style={detailItemStyle}>
              <span style={detailLabelStyle}>삭제 제한</span>
              <strong>{getProtectionLabel(selectedCompletion)}</strong>
            </div>
            <div style={detailWideItemStyle}>
              <span style={detailLabelStyle}>비고</span>
              <strong>{selectedCompletion.note ?? "-"}</strong>
            </div>
          </div>

          {getIsDeletionProtected(selectedCompletion) && (
            <div style={warningBoxStyle}>
              이 대원은 범스카우트 인가 이력이 있으며, 현재 선택한 기록이 마지막 WSEP/MoP 증빙 기록입니다.
              삭제할 수 없습니다.
            </div>
          )}
        </section>
      )}

      {isCreateFormOpen && canManagePrograms && (
        <div style={sidePanelBackdropStyle}>
          <aside style={sidePanelStyle}>
            <form onSubmit={handleCreateProgramCompletion}>
              <div style={sidePanelHeaderStyle}>
                <div>
                  <h3 style={formTitleStyle}>개별 이수 등록</h3>
                  <p style={formDescriptionStyle}>
                    대원 1명의 WSEP 또는 MoP 이수 기록을 등록합니다.
                  </p>
                </div>

                <button
                  type="button"
                  style={secondaryButtonStyle}
                  onClick={handleCloseCreateForm}
                  disabled={submitting}
                >
                  닫기
                </button>
              </div>

              {formErrorMessage && <div style={errorBoxStyle}>{formErrorMessage}</div>}

              {createForm.scout_id && (
                <div style={promotionImpactBoxStyle}>
                  <strong>진급 영향</strong>
                  <span>
                    현재 {getScoutRankInfo(createForm.scout_id).currentRankName} · 다음{" "}
                    {getScoutRankInfo(createForm.scout_id).nextRankName}
                  </span>
                  <span>
                    {getScoutRankInfo(createForm.scout_id).isBeomTarget
                      ? `${createForm.program_type} 등록 후 승인일과 수료증번호가 확인되면 범 진급 프로그램 조건에 반영됩니다.`
                      : "현재 급위에서는 참고 기록으로 관리되며, 범 진급 시 조건에 반영됩니다."}
                  </span>
                </div>
              )}

              <label style={fieldLabelStyle}>
                대원 <span style={requiredStyle}>*</span>
                <select
                  style={inputStyle}
                  value={createForm.scout_id}
                  onChange={(event) => updateCreateForm("scout_id", event.target.value)}
                  required
                >
                  <option value="">대원 선택</option>
                  {scouts.map((scout) => (
                    <option key={scout.id} value={scout.id}>
                      {scout.name} {scout.member_no ? `(${scout.member_no})` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label style={fieldLabelStyle}>
                프로그램 <span style={requiredStyle}>*</span>
                <select
                  style={inputStyle}
                  value={createForm.program_type}
                  onChange={(event) =>
                    updateCreateForm("program_type", event.target.value as ProgramType)
                  }
                  required
                >
                  {PROGRAM_TYPE_OPTIONS.map((program) => (
                    <option key={program.value} value={program.value}>
                      {program.label} - {program.description}
                    </option>
                  ))}
                </select>
              </label>

              <label style={fieldLabelStyle}>
                이수일 <span style={requiredStyle}>*</span>
                <input
                  style={inputStyle}
                  type="date"
                  value={createForm.completed_at}
                  onChange={(event) => updateCreateForm("completed_at", event.target.value)}
                  required
                />
              </label>

              <label style={fieldLabelStyle}>
                승인일
                <input
                  style={inputStyle}
                  type="date"
                  value={createForm.approved_at}
                  onChange={(event) => updateCreateForm("approved_at", event.target.value)}
                />
              </label>

              <label style={fieldLabelStyle}>
                수료증번호
                <input
                  style={inputStyle}
                  value={createForm.certificate_no}
                  onChange={(event) => updateCreateForm("certificate_no", event.target.value)}
                  placeholder="수료증번호가 있으면 입력"
                />
              </label>

              <label style={fieldLabelStyle}>
                비고
                <textarea
                  style={textareaStyle}
                  value={createForm.note}
                  onChange={(event) => updateCreateForm("note", event.target.value)}
                  placeholder="특이사항이 있으면 입력하세요."
                />
              </label>

              <div style={formActionStyle}>
                <button
                  type="button"
                  style={secondaryButtonStyle}
                  onClick={handleCloseCreateForm}
                  disabled={submitting}
                >
                  취소
                </button>

                <button type="submit" style={submitButtonStyle} disabled={submitting}>
                  {submitting ? "저장 중..." : "저장"}
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}

      {isBulkFormOpen && canManagePrograms && (
        <div style={sidePanelBackdropStyle}>
          <aside style={sidePanelStyle}>
            <form onSubmit={handleCreateBulkProgramCompletions}>
              <div style={sidePanelHeaderStyle}>
                <div>
                  <h3 style={formTitleStyle}>선택 대원 일괄 등록</h3>
                  <p style={formDescriptionStyle}>
                    선택한 {selectedScoutIds.length}명의 이수 기록을 같은 과정 기준으로 등록합니다.
                  </p>
                </div>

                <button
                  type="button"
                  style={secondaryButtonStyle}
                  onClick={handleCloseBulkForm}
                  disabled={submitting}
                >
                  닫기
                </button>
              </div>

              {formErrorMessage && <div style={errorBoxStyle}>{formErrorMessage}</div>}

              <div style={selectedScoutBoxStyle}>
                <strong>선택 대원 {selectedScoutIds.length}명</strong>
                <p style={selectedScoutTextStyle}>
                  {selectedScoutIds.slice(0, 6).map(getScoutDisplayName).join(", ")}
                  {selectedScoutIds.length > 6 ? ` 외 ${selectedScoutIds.length - 6}명` : ""}
                </p>
              </div>

              <label style={fieldLabelStyle}>
                프로그램 <span style={requiredStyle}>*</span>
                <select
                  style={inputStyle}
                  value={bulkForm.program_type}
                  onChange={(event) =>
                    updateBulkForm("program_type", event.target.value as ProgramType)
                  }
                  required
                >
                  {PROGRAM_TYPE_OPTIONS.map((program) => (
                    <option key={program.value} value={program.value}>
                      {program.label} - {program.description}
                    </option>
                  ))}
                </select>
              </label>

              {selectedBulkDuplicateCount > 0 && (
                <div style={warningBoxStyle}>
                  선택 대원 중 {selectedBulkDuplicateCount}명은 이미 해당 프로그램 이수 기록이 있어 저장 시 제외됩니다.
                </div>
              )}

              <label style={fieldLabelStyle}>
                이수일 <span style={requiredStyle}>*</span>
                <input
                  style={inputStyle}
                  type="date"
                  value={bulkForm.completed_at}
                  onChange={(event) => updateBulkForm("completed_at", event.target.value)}
                  required
                />
              </label>

              <label style={fieldLabelStyle}>
                승인일
                <input
                  style={inputStyle}
                  type="date"
                  value={bulkForm.approved_at}
                  onChange={(event) => updateBulkForm("approved_at", event.target.value)}
                />
              </label>

              <label style={fieldLabelStyle}>
                수료증번호
                <input
                  style={inputStyle}
                  value={bulkForm.certificate_no}
                  onChange={(event) => updateBulkForm("certificate_no", event.target.value)}
                  placeholder="공통 번호가 없으면 비워두세요"
                />
              </label>

              <label style={fieldLabelStyle}>
                비고
                <textarea
                  style={textareaStyle}
                  value={bulkForm.note}
                  onChange={(event) => updateBulkForm("note", event.target.value)}
                  placeholder="예: 2026년 WSEP 과정 단체 참가"
                />
              </label>

              <div style={formActionStyle}>
                <button
                  type="button"
                  style={secondaryButtonStyle}
                  onClick={handleCloseBulkForm}
                  disabled={submitting}
                >
                  취소
                </button>

                <button type="submit" style={submitButtonStyle} disabled={submitting}>
                  {submitting ? "저장 중..." : "일괄 저장"}
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}

      {isEditFormOpen && canManagePrograms && selectedCompletion && (
        <div style={sidePanelBackdropStyle}>
          <aside style={sidePanelStyle}>
            <form onSubmit={handleUpdateProgramCompletion}>
              <div style={sidePanelHeaderStyle}>
                <div>
                  <h3 style={formTitleStyle}>이수 기록 수정</h3>
                  <p style={formDescriptionStyle}>
                    선택한 대원의 프로그램 이수 정보를 수정합니다.
                  </p>
                </div>

                <button
                  type="button"
                  style={secondaryButtonStyle}
                  onClick={handleCloseEditForm}
                  disabled={submitting}
                >
                  닫기
                </button>
              </div>

              {editErrorMessage && <div style={errorBoxStyle}>{editErrorMessage}</div>}

              <div style={selectedMetaGridStyle}>
                <div style={selectedMetaItemStyle}>
                  <span style={selectedMetaLabelStyle}>대원</span>
                  <strong>{getScoutDisplayName(selectedCompletion.scout_id)}</strong>
                </div>
                <div style={selectedMetaItemStyle}>
                  <span style={selectedMetaLabelStyle}>소속</span>
                  <strong>{getOrganizationName(selectedCompletion.organization_id)}</strong>
                </div>
                <div style={selectedMetaItemStyle}>
                  <span style={selectedMetaLabelStyle}>삭제 제한</span>
                  <strong>{getProtectionLabel(selectedCompletion)}</strong>
                </div>
              </div>

              <label style={fieldLabelStyle}>
                프로그램 <span style={requiredStyle}>*</span>
                <select
                  style={inputStyle}
                  value={editForm.program_type}
                  onChange={(event) =>
                    updateEditForm("program_type", event.target.value as ProgramType)
                  }
                  required
                >
                  {PROGRAM_TYPE_OPTIONS.map((program) => (
                    <option key={program.value} value={program.value}>
                      {program.label} - {program.description}
                    </option>
                  ))}
                </select>
              </label>

              <label style={fieldLabelStyle}>
                이수일 <span style={requiredStyle}>*</span>
                <input
                  style={inputStyle}
                  type="date"
                  value={editForm.completed_at}
                  onChange={(event) => updateEditForm("completed_at", event.target.value)}
                  required
                />
              </label>

              <label style={fieldLabelStyle}>
                승인일
                <input
                  style={inputStyle}
                  type="date"
                  value={editForm.approved_at}
                  onChange={(event) => updateEditForm("approved_at", event.target.value)}
                />
              </label>

              <label style={fieldLabelStyle}>
                수료증번호
                <input
                  style={inputStyle}
                  value={editForm.certificate_no}
                  onChange={(event) => updateEditForm("certificate_no", event.target.value)}
                  placeholder="수료증번호가 있으면 입력"
                />
              </label>

              <label style={fieldLabelStyle}>
                비고
                <textarea
                  style={textareaStyle}
                  value={editForm.note}
                  onChange={(event) => updateEditForm("note", event.target.value)}
                  placeholder="특이사항이 있으면 입력하세요."
                />
              </label>

              <div style={formActionStyle}>
                <button
                  type="button"
                  style={secondaryButtonStyle}
                  onClick={handleCloseEditForm}
                  disabled={submitting}
                >
                  취소
                </button>

                <button type="submit" style={submitButtonStyle} disabled={submitting}>
                  {submitting ? "수정 중..." : "수정 저장"}
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}
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

const contentCardWithTopMarginStyle: CSSProperties = {
  ...contentCardStyle,
  marginTop: "24px",
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

const filterSelectStyle: CSSProperties = {
  minWidth: "160px",
  padding: "10px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  fontSize: "14px",
  backgroundColor: "#ffffff",
};

const searchInputStyle: CSSProperties = {
  width: "280px",
  padding: "10px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  fontSize: "14px",
};

const secondaryButtonStyle: CSSProperties = {
  padding: "10px 14px",
  borderRadius: "8px",
  border: "1px solid #cbd5e1",
  backgroundColor: "#ffffff",
  color: "#334155",
  fontWeight: 700,
  whiteSpace: "nowrap",
  cursor: "pointer",
};

const submitButtonStyle: CSSProperties = {
  padding: "10px 14px",
  borderRadius: "8px",
  border: "none",
  backgroundColor: "#16a34a",
  color: "#ffffff",
  fontWeight: 700,
  whiteSpace: "nowrap",
  cursor: "pointer",
};

const dangerButtonStyle: CSSProperties = {
  padding: "10px 14px",
  borderRadius: "8px",
  border: "none",
  backgroundColor: "#dc2626",
  color: "#ffffff",
  fontWeight: 700,
  whiteSpace: "nowrap",
  cursor: "pointer",
};

const disabledDangerButtonStyle: CSSProperties = {
  ...dangerButtonStyle,
  backgroundColor: "#fecaca",
  color: "#991b1b",
  cursor: "not-allowed",
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


const warningBoxStyle: CSSProperties = {
  padding: "14px 16px",
  borderRadius: "10px",
  backgroundColor: "#fffbeb",
  color: "#92400e",
  fontWeight: 700,
  marginTop: "16px",
  lineHeight: 1.6,
};

const tableWrapStyle: CSSProperties = {
  overflowX: "auto",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "14px",
};

const thStyle: CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid #e5e7eb",
  backgroundColor: "#f8fafc",
  color: "#334155",
  textAlign: "left",
  whiteSpace: "nowrap",
};

const sortHeaderButtonStyle: CSSProperties = {
  width: "100%",
  padding: 0,
  border: "none",
  backgroundColor: "transparent",
  color: "#334155",
  font: "inherit",
  fontWeight: 800,
  textAlign: "left",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid #e5e7eb",
  color: "#475569",
  whiteSpace: "nowrap",
};

const strongTdStyle: CSSProperties = {
  ...tdStyle,
  color: "#0f172a",
  fontWeight: 800,
};

const actionTdStyle: CSSProperties = {
  ...tdStyle,
  display: "flex",
  gap: "6px",
};

const rowStyle: CSSProperties = {
  cursor: "pointer",
};

const selectedRowStyle: CSSProperties = {
  cursor: "pointer",
  backgroundColor: "#eff6ff",
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

const fieldLabelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  color: "#334155",
  fontSize: "14px",
  fontWeight: 700,
  marginTop: "12px",
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  fontSize: "14px",
  backgroundColor: "#ffffff",
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: "80px",
  resize: "vertical",
};

const formActionStyle: CSSProperties = {
  position: "sticky",
  bottom: 0,
  zIndex: 2,
  display: "flex",
  justifyContent: "flex-end",
  gap: "8px",
  margin: "20px -24px 0",
  padding: "14px 24px 18px",
  borderTop: "1px solid #e5e7eb",
  backgroundColor: "#ffffff",
  boxSizing: "border-box",
};

const requiredStyle: CSSProperties = {
  color: "#dc2626",
};

const smallSecondaryButtonStyle: CSSProperties = {
  padding: "7px 10px",
  borderRadius: "7px",
  border: "1px solid #cbd5e1",
  backgroundColor: "#ffffff",
  color: "#334155",
  fontSize: "13px",
  fontWeight: 700,
  cursor: "pointer",
};



const selectedMetaGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "10px",
  marginBottom: "10px",
};

const selectedMetaItemStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  padding: "12px",
  borderRadius: "10px",
  backgroundColor: "#ffffff",
  border: "1px solid #dbeafe",
  color: "#0f172a",
};

const selectedMetaLabelStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "13px",
  fontWeight: 700,
};

const detailHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "16px",
  alignItems: "flex-start",
  marginBottom: "16px",
};

const detailActionStyle: CSSProperties = {
  display: "flex",
  gap: "8px",
  alignItems: "center",
};

const detailGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "12px",
};

const detailItemStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  padding: "14px",
  borderRadius: "10px",
  border: "1px solid #e5e7eb",
  backgroundColor: "#f8fafc",
  color: "#0f172a",
};

const detailWideItemStyle: CSSProperties = {
  ...detailItemStyle,
  gridColumn: "1 / -1",
};

const detailLabelStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "13px",
  fontWeight: 700,
};

const summaryNeutralCardStyle: CSSProperties = {
  borderColor: "#dbeafe",
  backgroundColor: "#f8fbff",
};


const summaryWarningCardStyle: CSSProperties = {
  borderColor: "#fed7aa",
  backgroundColor: "#fff7ed",
};

const summaryInfoCardStyle: CSSProperties = {
  borderColor: "#bfdbfe",
  backgroundColor: "#eff6ff",
};

const summaryDangerCardStyle: CSSProperties = {
  borderColor: "#fecaca",
  backgroundColor: "#fef2f2",
};

const rankBadgeStyle: CSSProperties = {
  display: "inline-flex",
  padding: "5px 9px",
  borderRadius: "999px",
  backgroundColor: "#f1f5f9",
  color: "#334155",
  fontSize: "12px",
  fontWeight: 800,
};

const nextRankBadgeStyle: CSSProperties = {
  ...rankBadgeStyle,
  backgroundColor: "#dbeafe",
  color: "#1d4ed8",
};

const promotionReadyBadgeStyle: CSSProperties = {
  display: "inline-flex",
  padding: "5px 9px",
  borderRadius: "999px",
  backgroundColor: "#dcfce7",
  color: "#166534",
  fontSize: "12px",
  fontWeight: 800,
};

const programMissingImpactBadgeStyle: CSSProperties = {
  ...promotionReadyBadgeStyle,
  backgroundColor: "#fee2e2",
  color: "#991b1b",
};

const referenceBadgeStyle: CSSProperties = {
  ...promotionReadyBadgeStyle,
  backgroundColor: "#e0f2fe",
  color: "#075985",
};

const promotionImpactBoxStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "5px",
  padding: "14px",
  borderRadius: "10px",
  border: "1px solid #bfdbfe",
  backgroundColor: "#eff6ff",
  color: "#1e3a8a",
  lineHeight: 1.5,
  marginBottom: "8px",
};

const guideBoxStyle: CSSProperties = {
  padding: "14px 16px",
  borderRadius: "10px",
  backgroundColor: "#f8fafc",
  border: "1px solid #e2e8f0",
  color: "#475569",
  fontWeight: 700,
  lineHeight: 1.6,
  marginBottom: "16px",
};

const bulkButtonStyle: CSSProperties = {
  padding: "10px 14px",
  borderRadius: "8px",
  border: "none",
  backgroundColor: "#0f766e",
  color: "#ffffff",
  fontWeight: 700,
  cursor: "pointer",
};

const disabledBulkButtonStyle: CSSProperties = {
  ...bulkButtonStyle,
  backgroundColor: "#ccfbf1",
  color: "#0f766e",
  cursor: "not-allowed",
};

const checkThStyle: CSSProperties = {
  ...thStyle,
  width: "44px",
  textAlign: "center",
};

const checkTdStyle: CSSProperties = {
  ...tdStyle,
  width: "44px",
  textAlign: "center",
};

const programDoneButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "6px 10px",
  borderRadius: "999px",
  border: "1px solid #bbf7d0",
  backgroundColor: "#dcfce7",
  color: "#166534",
  fontSize: "12px",
  fontWeight: 800,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const programMissingBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "6px 10px",
  borderRadius: "999px",
  backgroundColor: "#fee2e2",
  color: "#991b1b",
  fontSize: "12px",
  fontWeight: 800,
  whiteSpace: "nowrap",
};


const needCheckBadgeStyle: CSSProperties = {
  display: "inline-flex",
  padding: "5px 9px",
  borderRadius: "999px",
  backgroundColor: "#ffedd5",
  color: "#9a3412",
  fontSize: "12px",
  fontWeight: 800,
};

const sidePanelBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 50,
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "stretch",
  paddingRight: "24px",
  boxSizing: "border-box",
  overflow: "hidden",
  backgroundColor: "rgba(15, 23, 42, 0.24)",
};

const sidePanelStyle: CSSProperties = {
  width: "min(520px, 100%)",
  maxWidth: "100%",
  height: "100dvh",
  overflowY: "auto",
  overflowX: "hidden",
  backgroundColor: "#ffffff",
  padding: "24px 24px 0",
  boxSizing: "border-box",
  boxShadow: "-18px 0 40px rgba(15, 23, 42, 0.18)",
};

const sidePanelHeaderStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  alignItems: "flex-start",
  gap: "16px",
  marginBottom: "18px",
  minWidth: 0,
};

const selectedScoutBoxStyle: CSSProperties = {
  padding: "14px",
  borderRadius: "10px",
  border: "1px solid #dbeafe",
  backgroundColor: "#eff6ff",
  color: "#0f172a",
  marginBottom: "8px",
};

const selectedScoutTextStyle: CSSProperties = {
  marginTop: "6px",
  marginBottom: 0,
  color: "#475569",
  lineHeight: 1.5,
};
