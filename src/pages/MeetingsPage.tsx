import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { createPortal } from "react-dom";
import { EmptyState, FeedbackToast, PageHelpButton } from "../components/common/CommonFeedback";
import { supabase } from "../lib/supabase";

type UserRole = "super_admin" | "org_admin" | "leader" | "viewer";
type ScoutStatus = "active" | "inactive" | "graduated";
type AttendanceStatus =
  | "present"
  | "recognized"
  | "late"
  | "early_leave"
  | "absent"
  | "not_entered";
type MeetingType = "regular" | "event" | "camp" | "training" | "service" | "other";

type UserProfile = {
  role: UserRole;
  organization_id: string | null;
};

type Organization = {
  id: string;
  name: string;
};

type Rank = {
  id: string;
  rank_name: string;
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

type MeetingCreateForm = {
  organization_id: string;
  meeting_date: string;
  title: string;
  meeting_type: MeetingType;
  is_attendance_target: boolean;
  note: string;
};

type MeetingEditForm = {
  meeting_date: string;
  title: string;
  meeting_type: MeetingType;
  is_attendance_target: boolean;
  note: string;
};

type AttendanceDraft = {
  status: AttendanceStatus;
  note: string;
};

type MeetingSortKey = "meeting_date" | "title" | "organization" | "meeting_type" | "target" | "note";
type AttendanceSortKey = "member_no" | "name" | "school_grade" | "status" | "attendance_status";
type SortDirection = "asc" | "desc";
type MeetingStatusFilter = "" | "needs_input" | "complete" | "has_absence" | "attendance_target";

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

const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus | "excused", string> = {
  present: "출석",
  recognized: "인정출석",
  late: "지각",
  early_leave: "조퇴",
  excused: "인정결석",
  absent: "결석",
  not_entered: "미입력",
};

const ATTENDANCE_STATUS_OPTIONS: Array<{ value: AttendanceStatus; label: string }> = [
  { value: "present", label: "출석" },
  { value: "recognized", label: "인정출석" },
  { value: "late", label: "지각" },
  { value: "early_leave", label: "조퇴" },
  { value: "absent", label: "결석" },
  { value: "not_entered", label: "미입력" },
];

const MEETING_TYPE_LABELS: Record<string, string> = {
  regular: "정기집회",
  event: "행사",
  camp: "캠프",
  training: "훈련",
  service: "봉사",
  other: "기타",
};

const MEETING_TYPE_OPTIONS: Array<{ value: MeetingType; label: string }> = [
  { value: "regular", label: "정기집회" },
  { value: "event", label: "행사" },
  { value: "camp", label: "캠프" },
  { value: "training", label: "훈련" },
  { value: "service", label: "봉사" },
  { value: "other", label: "기타" },
];

const ATTENDANCE_PASS_STATUSES: Array<AttendanceStatus | "excused"> = [
  "present",
  "recognized",
  "late",
  "early_leave",
  "excused",
];

const ATTENDANCE_STATUS_SORT_ORDER: Record<AttendanceStatus | "excused", number> = {
  not_entered: 0,
  absent: 1,
  late: 2,
  early_leave: 3,
  recognized: 4,
  excused: 4,
  present: 5,
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

function getEmptyMeetingCreateForm(profile?: UserProfile | null): MeetingCreateForm {
  return {
    organization_id:
      profile && profile.role !== "super_admin" ? profile.organization_id ?? "" : "",
    meeting_date: getTodayText(),
    title: "",
    meeting_type: "regular",
    is_attendance_target: true,
    note: "",
  };
}

function getMeetingEditForm(meeting: Meeting): MeetingEditForm {
  return {
    meeting_date: formatDate(meeting.meeting_date),
    title: meeting.title,
    meeting_type: meeting.meeting_type as MeetingType,
    is_attendance_target: meeting.is_attendance_target,
    note: meeting.note ?? "",
  };
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return value.slice(0, 10);
}

function toNullableText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function compareText(a: string, b: string) {
  return a.localeCompare(b, "ko-KR", { numeric: true, sensitivity: "base" });
}

export default function MeetingsPage() {
  const meetingListRef = useRef<HTMLElement | null>(null);
  const attendanceSectionRef = useRef<HTMLElement | null>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [scouts, setScouts] = useState<Scout[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);

  const [keyword, setKeyword] = useState("");
  const [selectedMeetingType, setSelectedMeetingType] = useState<"" | string>("");
  const [selectedMeetingStatus, setSelectedMeetingStatus] = useState<MeetingStatusFilter>("");
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [meetingSort, setMeetingSort] = useState<{
    key: MeetingSortKey;
    direction: SortDirection;
  }>({ key: "meeting_date", direction: "desc" });
  const [attendanceSort, setAttendanceSort] = useState<{
    key: AttendanceSortKey;
    direction: SortDirection;
  }>({ key: "attendance_status", direction: "asc" });

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [createForm, setCreateForm] = useState<MeetingCreateForm>(
    getEmptyMeetingCreateForm(),
  );
  const [submitting, setSubmitting] = useState(false);
  const [formErrorMessage, setFormErrorMessage] = useState("");

  const [editingMeetingId, setEditingMeetingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<MeetingEditForm | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editErrorMessage, setEditErrorMessage] = useState("");
  const [archivingMeetingId, setArchivingMeetingId] = useState<string | null>(null);
  const [archiveErrorMessage, setArchiveErrorMessage] = useState("");

  const [attendanceDrafts, setAttendanceDrafts] = useState<Record<string, AttendanceDraft>>({});
  const [attendanceSavingScoutId, setAttendanceSavingScoutId] = useState<string | null>(null);
  const [attendanceErrorMessage, setAttendanceErrorMessage] = useState("");
  const [attendanceSuccessMessage, setAttendanceSuccessMessage] = useState("");

  const [bulkAttendanceStatus, setBulkAttendanceStatus] =
    useState<AttendanceStatus>("present");
  const [bulkAttendanceNote, setBulkAttendanceNote] = useState("");
  const [bulkAttendanceSaving, setBulkAttendanceSaving] = useState(false);
  const [selectedAttendanceScoutIds, setSelectedAttendanceScoutIds] = useState<string[]>([]);

  const canManageMeetings =
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
    setCreateForm(getEmptyMeetingCreateForm(currentProfile));

    const { data: organizationData, error: organizationError } = await supabase
      .from("organizations")
      .select("id, name")
      .is("deleted_at", null)
      .order("name", { ascending: true });

    if (organizationError) {
      console.error("조직 목록 조회 오류:", organizationError.message);
    }

    const { data: rankData, error: rankError } = await supabase
      .from("ranks")
      .select("id, rank_name")
      .order("sort_order", { ascending: true });

    if (rankError) {
      console.error("급위 목록 조회 오류:", rankError.message);
    }

    let scoutQuery = supabase
      .from("scouts")
      .select(
        "id, organization_id, name, member_no, school_name, grade, current_rank_id, status",
      )
      .is("deleted_at", null)
      .order("name", { ascending: true });

    let meetingQuery = supabase
      .from("meetings")
      .select("id, organization_id, meeting_date, title, meeting_type, is_attendance_target, note")
      .is("deleted_at", null)
      .order("meeting_date", { ascending: false })
      .order("created_at", { ascending: false });

    let attendanceQuery = supabase
      .from("attendance")
      .select("id, organization_id, meeting_id, scout_id, status, note")
      .is("deleted_at", null);

    if (currentProfile.role !== "super_admin") {
      if (!currentProfile.organization_id) {
        setErrorMessage("소속 조직 정보가 없어 집회/출석 정보를 조회할 수 없습니다.");
        setLoading(false);
        return;
      }

      scoutQuery = scoutQuery.eq("organization_id", currentProfile.organization_id);
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

    const { data: meetingData, error: meetingError } = await meetingQuery;

    if (meetingError) {
      console.error("집회 목록 조회 오류:", meetingError.message);
      setErrorMessage("집회 목록을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const { data: attendanceData, error: attendanceError } = await attendanceQuery;

    if (attendanceError) {
      console.error("출석 목록 조회 오류:", attendanceError.message);
      setErrorMessage("출석 정보를 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const loadedMeetings = (meetingData ?? []) as Meeting[];

    setOrganizations((organizationData ?? []) as Organization[]);
    setRanks((rankData ?? []) as Rank[]);
    setScouts((scoutData ?? []) as unknown as Scout[]);
    setMeetings(loadedMeetings);
    setAttendanceRecords((attendanceData ?? []) as unknown as AttendanceRecord[]);

    setSelectedMeetingId((prevSelectedMeetingId) => {
      if (
        prevSelectedMeetingId &&
        loadedMeetings.some((meeting) => meeting.id === prevSelectedMeetingId)
      ) {
        return prevSelectedMeetingId;
      }

      return loadedMeetings[0]?.id ?? null;
    });

    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const organizationNameMap = useMemo(() => {
    return new Map(organizations.map((organization) => [organization.id, organization.name]));
  }, [organizations]);

  const rankNameMap = useMemo(() => {
    return new Map(ranks.map((rank) => [rank.id, rank.rank_name]));
  }, [ranks]);

  const selectedMeeting = useMemo(() => {
    if (!selectedMeetingId) return null;
    return meetings.find((meeting) => meeting.id === selectedMeetingId) ?? null;
  }, [meetings, selectedMeetingId]);

  const selectedMeetingAttendanceMap = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();

    if (!selectedMeeting) return map;

    attendanceRecords
      .filter((attendance) => attendance.meeting_id === selectedMeeting.id)
      .forEach((attendance) => {
        map.set(attendance.scout_id, attendance);
      });

    return map;
  }, [attendanceRecords, selectedMeeting]);

  const meetingAttendanceCountMap = useMemo(() => {
    const map = new Map<string, number>();

    attendanceRecords.forEach((attendance) => {
      map.set(attendance.meeting_id, (map.get(attendance.meeting_id) ?? 0) + 1);
    });

    return map;
  }, [attendanceRecords]);

  const activeScoutCountByOrganizationMap = useMemo(() => {
    const map = new Map<string, number>();

    scouts.forEach((scout) => {
      if (scout.status !== "active") return;
      map.set(
        scout.organization_id,
        (map.get(scout.organization_id) ?? 0) + 1,
      );
    });

    return map;
  }, [scouts]);

  const meetingAttendanceSummaryMap = useMemo(() => {
    const map = new Map<
      string,
      {
        totalCount: number;
        enteredCount: number;
        presentCount: number;
        absentCount: number;
        notEnteredCount: number;
        attendanceRate: number;
      }
    >();

    meetings.forEach((meeting) => {
      const totalCount =
        activeScoutCountByOrganizationMap.get(meeting.organization_id) ?? 0;
      const records = attendanceRecords.filter(
        (attendance) => attendance.meeting_id === meeting.id,
      );
      const enteredRecords = records.filter(
        (attendance) => attendance.status !== "not_entered",
      );
      const enteredCount = new Set(
        enteredRecords.map((attendance) => attendance.scout_id),
      ).size;
      const presentCount = new Set(
        enteredRecords
          .filter((attendance) =>
            ATTENDANCE_PASS_STATUSES.includes(attendance.status),
          )
          .map((attendance) => attendance.scout_id),
      ).size;
      const absentCount = new Set(
        enteredRecords
          .filter((attendance) => attendance.status === "absent")
          .map((attendance) => attendance.scout_id),
      ).size;
      const notEnteredCount = Math.max(totalCount - enteredCount, 0);
      const attendanceRate =
        totalCount > 0
          ? Math.round((presentCount * 10000) / totalCount) / 100
          : 0;

      map.set(meeting.id, {
        totalCount,
        enteredCount,
        presentCount,
        absentCount,
        notEnteredCount,
        attendanceRate,
      });
    });

    return map;
  }, [
    activeScoutCountByOrganizationMap,
    attendanceRecords,
    meetings,
  ]);

  const attendanceTargetMeetingCount = useMemo(
    () => meetings.filter((meeting) => meeting.is_attendance_target).length,
    [meetings],
  );

  const needsInputMeetingCount = useMemo(
    () =>
      meetings.filter(
        (meeting) =>
          (meetingAttendanceSummaryMap.get(meeting.id)?.notEnteredCount ?? 0) >
          0,
      ).length,
    [meetingAttendanceSummaryMap, meetings],
  );

  const absenceMeetingCount = useMemo(
    () =>
      meetings.filter(
        (meeting) =>
          (meetingAttendanceSummaryMap.get(meeting.id)?.absentCount ?? 0) > 0,
      ).length,
    [meetingAttendanceSummaryMap, meetings],
  );

  const selectedMeetingScouts = useMemo(() => {
    if (!selectedMeeting) return [];

    return scouts
      .filter(
        (scout) =>
          scout.organization_id === selectedMeeting.organization_id &&
          scout.status === "active",
      )
      .sort((a, b) => {
        const aMemberNo = a.member_no ?? "";
        const bMemberNo = b.member_no ?? "";
        const memberCompare = compareText(aMemberNo, bMemberNo);

        if (memberCompare !== 0) return memberCompare;
        return compareText(a.name, b.name);
      });
  }, [scouts, selectedMeeting]);

  useEffect(() => {
    setSelectedAttendanceScoutIds([]);
    setAttendanceSuccessMessage("");
  }, [selectedMeeting?.id]);

  useEffect(() => {
    const validScoutIds = new Set(selectedMeetingScouts.map((scout) => scout.id));

    setSelectedAttendanceScoutIds((prev) =>
      prev.filter((scoutId) => validScoutIds.has(scoutId)),
    );
  }, [selectedMeetingScouts]);

  useEffect(() => {
    if (!selectedMeeting) {
      setAttendanceDrafts({});
      return;
    }

    const nextDrafts: Record<string, AttendanceDraft> = {};

    selectedMeetingScouts.forEach((scout) => {
      const attendance = selectedMeetingAttendanceMap.get(scout.id);
      nextDrafts[scout.id] = {
        status: attendance?.status ?? "not_entered",
        note: attendance?.note ?? "",
      };
    });

    setAttendanceDrafts(nextDrafts);
    setAttendanceErrorMessage("");
  }, [selectedMeeting, selectedMeetingAttendanceMap, selectedMeetingScouts]);

  const filteredMeetings = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    const filtered = meetings.filter((meeting) => {
      if (selectedMeetingType && meeting.meeting_type !== selectedMeetingType) {
        return false;
      }

      const summary = meetingAttendanceSummaryMap.get(meeting.id);

      if (
        selectedMeetingStatus === "needs_input" &&
        (summary?.notEnteredCount ?? 0) === 0
      ) {
        return false;
      }

      if (
        selectedMeetingStatus === "complete" &&
        (summary?.notEnteredCount ?? 0) > 0
      ) {
        return false;
      }

      if (
        selectedMeetingStatus === "has_absence" &&
        (summary?.absentCount ?? 0) === 0
      ) {
        return false;
      }

      if (
        selectedMeetingStatus === "attendance_target" &&
        !meeting.is_attendance_target
      ) {
        return false;
      }

      if (!normalizedKeyword) return true;

      const targetText = [
        meeting.title,
        meeting.meeting_date,
        MEETING_TYPE_LABELS[meeting.meeting_type] ?? meeting.meeting_type,
        meeting.is_attendance_target ? "출석 반영 대상" : "출석 반영 제외",
        organizationNameMap.get(meeting.organization_id),
        meeting.note,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return targetText.includes(normalizedKeyword);
    });

    const directionFactor = meetingSort.direction === "asc" ? 1 : -1;

    return [...filtered].sort((a, b) => {
      let result = 0;

      if (meetingSort.key === "meeting_date") {
        result = compareText(formatDate(a.meeting_date), formatDate(b.meeting_date));
      } else if (meetingSort.key === "title") {
        result = compareText(a.title, b.title);
      } else if (meetingSort.key === "organization") {
        result = compareText(
          organizationNameMap.get(a.organization_id) ?? "",
          organizationNameMap.get(b.organization_id) ?? "",
        );
      } else if (meetingSort.key === "meeting_type") {
        result = compareText(
          MEETING_TYPE_LABELS[a.meeting_type] ?? a.meeting_type,
          MEETING_TYPE_LABELS[b.meeting_type] ?? b.meeting_type,
        );
      } else if (meetingSort.key === "target") {
        result = Number(a.is_attendance_target) - Number(b.is_attendance_target);
      } else if (meetingSort.key === "note") {
        result = compareText(a.note ?? "", b.note ?? "");
      }

      if (result !== 0) return result * directionFactor;
      return compareText(formatDate(b.meeting_date), formatDate(a.meeting_date));
    });
  }, [keyword, meetingAttendanceSummaryMap, meetingSort, meetings, organizationNameMap, selectedMeetingStatus, selectedMeetingType]);

  const attendanceSummary = useMemo(() => {
    const totalCount = selectedMeetingScouts.length;
    const presentCount = selectedMeetingScouts.filter((scout) => {
      const status = attendanceDrafts[scout.id]?.status ?? "not_entered";
      return ATTENDANCE_PASS_STATUSES.includes(status);
    }).length;
    const absentCount = selectedMeetingScouts.filter((scout) => {
      const status = attendanceDrafts[scout.id]?.status ?? "not_entered";
      return status === "absent";
    }).length;
    const notEnteredCount = selectedMeetingScouts.filter((scout) => {
      const status = attendanceDrafts[scout.id]?.status ?? "not_entered";
      return status === "not_entered";
    }).length;
    const attendanceRate = totalCount > 0 ? Math.round((presentCount * 10000) / totalCount) / 100 : 0;

    return {
      totalCount,
      presentCount,
      absentCount,
      notEnteredCount,
      attendanceRate,
    };
  }, [attendanceDrafts, selectedMeetingScouts]);

  const selectedAttendanceScoutIdSet = useMemo(() => {
    return new Set(selectedAttendanceScoutIds);
  }, [selectedAttendanceScoutIds]);

  const selectedAttendanceScoutCount = useMemo(() => {
    return selectedMeetingScouts.filter((scout) =>
      selectedAttendanceScoutIdSet.has(scout.id),
    ).length;
  }, [selectedAttendanceScoutIdSet, selectedMeetingScouts]);

  const sortedSelectedMeetingScouts = useMemo(() => {
    const directionFactor = attendanceSort.direction === "asc" ? 1 : -1;

    return [...selectedMeetingScouts].sort((a, b) => {
      let result = 0;

      if (attendanceSort.key === "member_no") {
        result = compareText(a.member_no ?? "", b.member_no ?? "");
      } else if (attendanceSort.key === "name") {
        result = compareText(a.name, b.name);
      } else if (attendanceSort.key === "school_grade") {
        result = compareText(
          `${a.school_name ?? ""} ${a.grade ?? ""}`,
          `${b.school_name ?? ""} ${b.grade ?? ""}`,
        );
      } else if (attendanceSort.key === "status") {
        result = compareText(SCOUT_STATUS_LABELS[a.status], SCOUT_STATUS_LABELS[b.status]);
      } else if (attendanceSort.key === "attendance_status") {
        result =
          ATTENDANCE_STATUS_SORT_ORDER[
            attendanceDrafts[a.id]?.status ?? "not_entered"
          ] -
          ATTENDANCE_STATUS_SORT_ORDER[
            attendanceDrafts[b.id]?.status ?? "not_entered"
          ];
      }

      if (result !== 0) return result * directionFactor;
      return compareText(a.member_no ?? "", b.member_no ?? "");
    });
  }, [attendanceDrafts, attendanceSort, selectedMeetingScouts]);

  const isAllAttendanceScoutsSelected =
    selectedMeetingScouts.length > 0 &&
    selectedMeetingScouts.every((scout) => selectedAttendanceScoutIdSet.has(scout.id));

  const getOrganizationName = (organizationId: string) => {
    return organizationNameMap.get(organizationId) ?? "-";
  };

  const updateCreateForm = <K extends keyof MeetingCreateForm>(
    field: K,
    value: MeetingCreateForm[K],
  ) => {
    setCreateForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const updateEditForm = <K extends keyof MeetingEditForm>(
    field: K,
    value: MeetingEditForm[K],
  ) => {
    setEditForm((prev) => {
      if (!prev) return prev;

      return {
        ...prev,
        [field]: value,
      };
    });
  };

  const handleToggleMeetingSort = (key: MeetingSortKey) => {
    setMeetingSort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const handleToggleAttendanceSort = (key: AttendanceSortKey) => {
    setAttendanceSort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const getMeetingSortLabel = (key: MeetingSortKey) => {
    if (meetingSort.key !== key) return "";
    return meetingSort.direction === "asc" ? " ▲" : " ▼";
  };

  const getAttendanceSortLabel = (key: AttendanceSortKey) => {
    if (attendanceSort.key !== key) return "";
    return attendanceSort.direction === "asc" ? " ▲" : " ▼";
  };

  const handleSelectMeeting = (meetingId: string) => {
    setSelectedMeetingId((prev) => (prev === meetingId ? meetingId : meetingId));

    setTimeout(() => {
      attendanceSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  const handleOpenCreateForm = () => {
    if (!canManageMeetings) return;

    setCreateForm(getEmptyMeetingCreateForm(profile));
    setFormErrorMessage("");
    setEditErrorMessage("");
    setArchiveErrorMessage("");
    setEditingMeetingId(null);
    setEditForm(null);
    setIsCreateFormOpen(true);
  };

  const handleCloseCreateForm = () => {
    if (submitting) return;

    setCreateForm(getEmptyMeetingCreateForm(profile));
    setFormErrorMessage("");
    setIsCreateFormOpen(false);
  };

  const handleCloseEditForm = () => {
    if (editSubmitting) return;

    setEditingMeetingId(null);
    setEditForm(null);
    setEditErrorMessage("");
  };

  const handleClosePanel = () => {
    handleCloseCreateForm();
    handleCloseEditForm();
  };

  const handleCreateMeeting = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!profile || !canManageMeetings) {
      setFormErrorMessage("집회/활동 등록 권한이 없습니다.");
      return;
    }

    const organizationId =
      profile.role === "super_admin" ? createForm.organization_id : profile.organization_id;

    if (!organizationId) {
      setFormErrorMessage("소속 조직을 선택해야 합니다.");
      return;
    }

    if (!createForm.meeting_date) {
      setFormErrorMessage("집회일을 입력해야 합니다.");
      return;
    }

    if (!createForm.title.trim()) {
      setFormErrorMessage("집회/활동명을 입력해야 합니다.");
      return;
    }

    setSubmitting(true);
    setFormErrorMessage("");

    const rpcClient = supabase as unknown as RpcClient;

    const { data, error } = await rpcClient.rpc("create_meeting_record", {
      p_organization_id: organizationId,
      p_meeting_date: createForm.meeting_date,
      p_title: createForm.title.trim(),
      p_meeting_type: createForm.meeting_type,
      p_is_attendance_target: createForm.is_attendance_target,
      p_note: toNullableText(createForm.note),
    });

    if (error) {
      console.error("집회 등록 오류:", error.message);
      setFormErrorMessage(`집회/활동 등록에 실패했습니다. ${error.message}`);
      setSubmitting(false);
      return;
    }

    const createdMeetingId = data as string;

    setCreateForm(getEmptyMeetingCreateForm(profile));
    setIsCreateFormOpen(false);
    setSubmitting(false);

    await loadData();
    setSelectedMeetingId(createdMeetingId);
  };

  const handleStartEditMeeting = (meeting: Meeting) => {
    if (!canManageMeetings) {
      setEditErrorMessage("집회/활동 수정 권한이 없습니다.");
      return;
    }

    setEditingMeetingId(meeting.id);
    setSelectedMeetingId(meeting.id);
    setEditForm(getMeetingEditForm(meeting));
    setIsCreateFormOpen(false);
    setFormErrorMessage("");
    setEditErrorMessage("");
    setArchiveErrorMessage("");
  };

  const handleUpdateMeeting = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!editingMeetingId) {
      setEditErrorMessage("수정할 집회/활동을 선택해야 합니다.");
      return;
    }

    if (!canManageMeetings) {
      setEditErrorMessage("집회/활동 수정 권한이 없습니다.");
      return;
    }

    if (!editForm) {
      setEditErrorMessage("수정할 집회/활동 정보가 없습니다.");
      return;
    }

    if (!editForm.meeting_date) {
      setEditErrorMessage("집회일을 입력해야 합니다.");
      return;
    }

    if (!editForm.title.trim()) {
      setEditErrorMessage("집회/활동명을 입력해야 합니다.");
      return;
    }

    setEditSubmitting(true);
    setEditErrorMessage("");

    const rpcClient = supabase as unknown as RpcClient;

    const { error } = await rpcClient.rpc("update_meeting_record", {
      p_meeting_id: editingMeetingId,
      p_meeting_date: editForm.meeting_date,
      p_title: editForm.title.trim(),
      p_meeting_type: editForm.meeting_type,
      p_is_attendance_target: editForm.is_attendance_target,
      p_note: toNullableText(editForm.note),
    });

    if (error) {
      console.error("집회 수정 오류:", error.message);
      setEditErrorMessage(`집회/활동 수정에 실패했습니다. ${error.message}`);
      setEditSubmitting(false);
      return;
    }

    const updatedMeetingId = editingMeetingId;

    setEditingMeetingId(null);
    setEditForm(null);
    setEditSubmitting(false);

    await loadData();
    setSelectedMeetingId(updatedMeetingId);
  };

  const handleArchiveMeeting = async (meeting: Meeting) => {
    if (!canManageMeetings) {
      setArchiveErrorMessage("집회/활동 삭제 권한이 없습니다.");
      return;
    }

    const attendanceCount = meetingAttendanceCountMap.get(meeting.id) ?? 0;
    const confirmMessage =
      attendanceCount > 0
        ? `이 집회에는 출석 기록 ${attendanceCount}건이 있습니다. 집회를 삭제하면 해당 출석 기록도 함께 삭제됩니다. 계속 진행할까요?`
        : "이 집회/활동을 삭제할까요?";

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setArchivingMeetingId(meeting.id);
    setArchiveErrorMessage("");
    setEditErrorMessage("");

    const rpcClient = supabase as unknown as RpcClient;

    const { error } = await rpcClient.rpc("archive_meeting_record", {
      p_meeting_id: meeting.id,
    });

    if (error) {
      console.error("집회 삭제 오류:", error.message);
      setArchiveErrorMessage(`집회/활동 삭제에 실패했습니다. ${error.message}`);
      setArchivingMeetingId(null);
      return;
    }

    if (editingMeetingId === meeting.id) {
      setEditingMeetingId(null);
      setEditForm(null);
    }

    if (selectedMeetingId === meeting.id) {
      setSelectedAttendanceScoutIds([]);
      setAttendanceDrafts({});
    }

    setArchivingMeetingId(null);
    await loadData();
  };

  const updateAttendanceDraft = (
    scoutId: string,
    field: keyof AttendanceDraft,
    value: string,
  ) => {
    setAttendanceDrafts((prev) => ({
      ...prev,
      [scoutId]: {
        status: prev[scoutId]?.status ?? "not_entered",
        note: prev[scoutId]?.note ?? "",
        [field]: value,
      },
    }));
  };

  const handleToggleAttendanceScoutSelection = (scoutId: string, checked: boolean) => {
    setSelectedAttendanceScoutIds((prev) => {
      if (checked) {
        if (prev.includes(scoutId)) return prev;
        return [...prev, scoutId];
      }

      return prev.filter((selectedScoutId) => selectedScoutId !== scoutId);
    });
  };

  const handleSelectAllAttendanceScouts = () => {
    setSelectedAttendanceScoutIds(selectedMeetingScouts.map((scout) => scout.id));
    setAttendanceErrorMessage("");
  };

  const handleClearAttendanceScoutSelection = () => {
    setSelectedAttendanceScoutIds([]);
    setAttendanceErrorMessage("");
  };

  const handleSaveAttendance = async (scoutId: string) => {
    if (!selectedMeeting) {
      setAttendanceErrorMessage("출석을 저장할 집회/활동을 선택해야 합니다.");
      return;
    }

    if (!canManageMeetings) {
      setAttendanceErrorMessage("출석 입력 권한이 없습니다.");
      return;
    }

    const draft = attendanceDrafts[scoutId] ?? {
      status: "not_entered" as AttendanceStatus,
      note: "",
    };

    setAttendanceSavingScoutId(scoutId);
    setAttendanceErrorMessage("");
    setAttendanceSuccessMessage("");

    const rpcClient = supabase as unknown as RpcClient;

    const { error } = await rpcClient.rpc("set_attendance_record", {
      p_meeting_id: selectedMeeting.id,
      p_scout_id: scoutId,
      p_status: draft.status,
      p_note: toNullableText(draft.note),
    });

    if (error) {
      console.error("출석 저장 오류:", error.message);
      setAttendanceErrorMessage(`출석 저장에 실패했습니다. ${error.message}`);
      setAttendanceSavingScoutId(null);
      return;
    }

    setAttendanceSavingScoutId(null);
    await loadData();
  };

  const handleApplyBulkAttendance = async (
    target: "selected" | "selected_not_entered",
  ) => {
    if (!selectedMeeting) {
      setAttendanceErrorMessage("출석을 적용할 집회/활동을 선택해야 합니다.");
      return;
    }

    if (!canManageMeetings) {
      setAttendanceErrorMessage("출석 입력 권한이 없습니다.");
      return;
    }

    if (selectedAttendanceScoutCount === 0) {
      setAttendanceErrorMessage("출석 상태를 적용할 대원을 먼저 선택해야 합니다.");
      return;
    }

    const targetScouts = selectedMeetingScouts.filter((scout) => {
      if (!selectedAttendanceScoutIdSet.has(scout.id)) {
        return false;
      }

      if (target === "selected_not_entered") {
        const currentStatus =
          attendanceDrafts[scout.id]?.status ??
          selectedMeetingAttendanceMap.get(scout.id)?.status ??
          "not_entered";

        return currentStatus === "not_entered";
      }

      return true;
    });

    if (targetScouts.length === 0) {
      setAttendanceErrorMessage(
        target === "selected_not_entered"
          ? "선택한 대원 중 미입력 상태인 대원이 없습니다."
          : "출석 상태를 적용할 대원이 없습니다.",
      );
      return;
    }

    setBulkAttendanceSaving(true);
    setAttendanceErrorMessage("");
    setAttendanceSuccessMessage("");

    const noteText = bulkAttendanceNote.trim();
    const rpcClient = supabase as unknown as RpcClient;

    for (const scout of targetScouts) {
      const currentDraft = attendanceDrafts[scout.id] ?? {
        status:
          selectedMeetingAttendanceMap.get(scout.id)?.status ??
          ("not_entered" as AttendanceStatus),
        note: selectedMeetingAttendanceMap.get(scout.id)?.note ?? "",
      };

      const nextNote = noteText.length > 0 ? noteText : currentDraft.note;

      const { error } = await rpcClient.rpc("set_attendance_record", {
        p_meeting_id: selectedMeeting.id,
        p_scout_id: scout.id,
        p_status: bulkAttendanceStatus,
        p_note: toNullableText(nextNote),
      });

      if (error) {
        console.error("선택 대원 출석 일괄 적용 오류:", error.message);
        setAttendanceErrorMessage(
          `선택 대원 출석 적용에 실패했습니다. 대원=${scout.name}, 오류=${error.message}`,
        );
        setBulkAttendanceSaving(false);
        return;
      }
    }

    setAttendanceDrafts((prev) => {
      const nextDrafts = { ...prev };

      targetScouts.forEach((scout) => {
        const currentDraft = nextDrafts[scout.id] ?? {
          status: "not_entered" as AttendanceStatus,
          note: "",
        };

        nextDrafts[scout.id] = {
          status: bulkAttendanceStatus,
          note: noteText.length > 0 ? noteText : currentDraft.note,
        };
      });

      return nextDrafts;
    });

    setBulkAttendanceSaving(false);
    setAttendanceSuccessMessage(
      `${targetScouts.length}명의 출석 상태를 '${ATTENDANCE_STATUS_LABELS[bulkAttendanceStatus]}'(으)로 적용했습니다.`,
    );

    await loadData();
  };


  const getAttendanceBadgeStyle = (status: AttendanceStatus): CSSProperties => {
    if (status === "present" || status === "recognized") {
      return {
        ...attendanceBadgeStyle,
        backgroundColor: "#dcfce7",
        borderColor: "#bbf7d0",
        color: "#166534",
      };
    }

    if (status === "late" || status === "early_leave") {
      return {
        ...attendanceBadgeStyle,
        backgroundColor: "#fef9c3",
        borderColor: "#fde68a",
        color: "#854d0e",
      };
    }

    if (status === "absent") {
      return {
        ...attendanceBadgeStyle,
        backgroundColor: "#fee2e2",
        borderColor: "#fecaca",
        color: "#b91c1c",
      };
    }

    return attendanceBadgeStyle;
  };

  const getAttendanceSelectStyle = (
    status: AttendanceStatus,
  ): CSSProperties => {
    const baseStyle: CSSProperties = {
      ...attendanceSelectStyle,
      fontWeight: 800,
    };

    if (status === "present") {
      return {
        ...baseStyle,
        backgroundColor: "#dcfce7",
        borderColor: "#86efac",
        color: "#166534",
      };
    }

    if (status === "recognized") {
      return {
        ...baseStyle,
        backgroundColor: "#ccfbf1",
        borderColor: "#5eead4",
        color: "#115e59",
      };
    }

    if (status === "late") {
      return {
        ...baseStyle,
        backgroundColor: "#fef9c3",
        borderColor: "#fde047",
        color: "#854d0e",
      };
    }

    if (status === "early_leave") {
      return {
        ...baseStyle,
        backgroundColor: "#ffedd5",
        borderColor: "#fdba74",
        color: "#9a3412",
      };
    }

    if (status === "absent") {
      return {
        ...baseStyle,
        backgroundColor: "#fee2e2",
        borderColor: "#fca5a5",
        color: "#991b1b",
      };
    }

    return {
      ...baseStyle,
      backgroundColor: "#f1f5f9",
      borderColor: "#cbd5e1",
      color: "#475569",
    };
  };

  const renderMeetingSortButton = (key: MeetingSortKey, label: string) => (
    <button
      type="button"
      style={sortableHeaderButtonStyle}
      onClick={() => handleToggleMeetingSort(key)}
    >
      {label}{getMeetingSortLabel(key)}
    </button>
  );

  const renderAttendanceSortButton = (key: AttendanceSortKey, label: string) => (
    <button
      type="button"
      style={sortableHeaderButtonStyle}
      onClick={() => handleToggleAttendanceSort(key)}
    >
      {label}{getAttendanceSortLabel(key)}
    </button>
  );

  const isPanelOpen = isCreateFormOpen || Boolean(editingMeetingId && editForm);

  useEffect(() => {
    if (!isPanelOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isPanelOpen]);

  return (
    <div>
      <div style={pageHeaderStyle}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}><h1 style={pageTitleStyle}>집회/출석 관리</h1><PageHelpButton title="집회/출석 관리" description="집회를 등록하고 활동 대원의 출석을 입력합니다." sections={[{ title: "사용 순서", content: "집회를 선택한 뒤 미입력 대원을 확인하고 개별 또는 일괄 저장합니다." },{ title: "주의사항", content: "출석 대상은 활동 상태 대원만 적용됩니다." }]} /></div>
          <p style={pageDescriptionStyle}>
            집회별 출석 입력 누락과 결석 현황을 우선 확인하고, 활동 대원의 출석 기록을 관리합니다.
          </p>
        </div>

        <div style={headerActionStyle}>
          {profile && <div style={roleBadgeStyle}>{ROLE_LABELS[profile.role]}</div>}
        </div>
      </div>

      <div style={summaryGridStyle}>
        <section style={summaryCardStyle}>
          <h2 style={summaryTitleStyle}>등록 집회</h2>
          <p style={summaryValueStyle}>{meetings.length}건</p>
          <p style={summaryDescriptionStyle}>
            출석률 산정 대상 {attendanceTargetMeetingCount}건을 포함합니다.
          </p>
        </section>

        <section style={needsInputMeetingCount > 0 ? summaryCardOrangeStyle : summaryCardStyle}>
          <h2 style={summaryTitleStyle}>출석 입력 필요</h2>
          <p style={summaryValueStyle}>{needsInputMeetingCount}건</p>
          <p style={summaryDescriptionStyle}>
            활동 대원 중 출석 상태가 입력되지 않은 집회입니다.
          </p>
        </section>

        <section style={absenceMeetingCount > 0 ? summaryCardRedStyle : summaryCardStyle}>
          <h2 style={summaryTitleStyle}>결석 발생 집회</h2>
          <p style={summaryValueStyle}>{absenceMeetingCount}건</p>
          <p style={summaryDescriptionStyle}>
            결석 대원이 있어 지도자 확인이 필요한 집회입니다.
          </p>
        </section>

        <section style={selectedMeeting ? summaryCardBlueStyle : summaryCardStyle}>
          <h2 style={summaryTitleStyle}>선택 집회 출석률</h2>
          <p style={summaryValueStyle}>
            {selectedMeeting ? `${attendanceSummary.attendanceRate}%` : "-"}
          </p>
          <p style={summaryDescriptionStyle}>
            출석·인정출석·지각·조퇴를 출석 인정으로 계산합니다.
          </p>
        </section>
      </div>

      <section ref={meetingListRef} style={contentCardStyle}>
        <div style={toolbarStyle}>
          <div>
            <h2 style={sectionTitleStyle}>집회/활동 목록</h2>
            <p style={sectionDescriptionStyle}>
              출석 참고 지표에 반영할 집회와 활동을 등록·관리합니다.
            </p>
          </div>

          <div style={toolbarRightStyle}>
            <select
              style={filterSelectStyle}
              value={selectedMeetingType}
              onChange={(event) => setSelectedMeetingType(event.target.value)}
            >
              <option value="">전체 유형</option>
              {MEETING_TYPE_OPTIONS.map((meetingType) => (
                <option key={meetingType.value} value={meetingType.value}>
                  {meetingType.label}
                </option>
              ))}
            </select>

            <select
              style={filterSelectStyle}
              value={selectedMeetingStatus}
              onChange={(event) =>
                setSelectedMeetingStatus(
                  event.target.value as MeetingStatusFilter,
                )
              }
            >
              <option value="">전체 입력 상태</option>
              <option value="needs_input">출석 입력 필요</option>
              <option value="complete">입력 완료</option>
              <option value="has_absence">결석 발생</option>
              <option value="attendance_target">출석률 산정 대상</option>
            </select>

            <input
              style={searchInputStyle}
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="집회명, 일자, 소속 검색"
            />

            <button type="button" style={secondaryButtonStyle} onClick={loadData}>
              새로고침
            </button>

            {canManageMeetings && (
              <button type="button" style={primaryButtonStyle} onClick={handleOpenCreateForm}>
                집회/활동 등록
              </button>
            )}
          </div>
        </div>

        {editErrorMessage && <div style={errorBoxStyle}>{editErrorMessage}</div>}
        {archiveErrorMessage && <div style={errorBoxStyle}>{archiveErrorMessage}</div>}

        {loading && <div style={emptyStateStyle}>집회/출석 정보를 불러오는 중입니다...</div>}

        {!loading && errorMessage && <div style={errorBoxStyle}>{errorMessage}</div>}

        {!loading && !errorMessage && filteredMeetings.length === 0 && (
          <EmptyState title="등록된 집회가 없습니다" description="집회 또는 활동을 먼저 등록하면 출석 입력을 시작할 수 있습니다." />
        )}

        {!loading && !errorMessage && filteredMeetings.length > 0 && (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>{renderMeetingSortButton("meeting_date", "집회일")}</th>
                  <th style={thStyle}>{renderMeetingSortButton("title", "집회/활동명")}</th>
                  {isSuperAdmin && (
                    <th style={thStyle}>{renderMeetingSortButton("organization", "소속")}</th>
                  )}
                  <th style={thStyle}>{renderMeetingSortButton("meeting_type", "유형")}</th>
                  <th style={thStyle}>{renderMeetingSortButton("target", "출석률 산정")}</th>
                  <th style={centerThStyle}>대상</th>
                  <th style={centerThStyle}>출석 인정</th>
                  <th style={centerThStyle}>결석</th>
                  <th style={centerThStyle}>미입력</th>
                  <th style={thStyle}>입력 상태</th>
                  <th style={thStyle}>관리</th>
                </tr>
              </thead>

              <tbody>
                {filteredMeetings.map((meeting) => {
                  const meetingSummary =
                    meetingAttendanceSummaryMap.get(meeting.id) ?? {
                      totalCount: 0,
                      enteredCount: 0,
                      presentCount: 0,
                      absentCount: 0,
                      notEnteredCount: 0,
                      attendanceRate: 0,
                    };
                  const isComplete = meetingSummary.notEnteredCount === 0;

                  return (
                  <tr
                    key={meeting.id}
                    style={
                      selectedMeetingId === meeting.id
                        ? selectedClickableMeetingRowStyle
                        : clickableMeetingRowStyle
                    }
                    onClick={() => handleSelectMeeting(meeting.id)}
                    title="이 행을 선택하면 아래에 출석 입력 목록이 표시됩니다."
                  >
                    <td style={tdStyle}>{formatDate(meeting.meeting_date)}</td>
                    <td style={strongTdStyle}>{meeting.title}</td>
                    {isSuperAdmin && (
                      <td style={tdStyle}>{getOrganizationName(meeting.organization_id)}</td>
                    )}
                    <td style={tdStyle}>
                      {MEETING_TYPE_LABELS[meeting.meeting_type] ?? meeting.meeting_type}
                    </td>
                    <td style={tdStyle}>
                      <span
                        style={
                          meeting.is_attendance_target
                            ? targetBadgeStyle
                            : nonTargetBadgeStyle
                        }
                      >
                        {meeting.is_attendance_target ? "대상" : "제외"}
                      </span>
                    </td>
                    <td style={centerTdStyle}>{meetingSummary.totalCount}명</td>
                    <td style={centerTdStyle}>{meetingSummary.presentCount}명</td>
                    <td style={centerTdStyle}>
                      <span style={meetingSummary.absentCount > 0 ? absentCountStyle : normalCountStyle}>
                        {meetingSummary.absentCount}명
                      </span>
                    </td>
                    <td style={centerTdStyle}>
                      <span style={meetingSummary.notEnteredCount > 0 ? missingCountStyle : normalCountStyle}>
                        {meetingSummary.notEnteredCount}명
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={isComplete ? completeStatusBadgeStyle : incompleteStatusBadgeStyle}>
                        {isComplete ? "입력 완료" : "입력 필요"}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <div
                        style={rowActionStyle}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {canManageMeetings && (
                          <>
                            <button
                              type="button"
                              style={smallButtonStyle}
                              onClick={() => handleStartEditMeeting(meeting)}
                              disabled={editSubmitting || archivingMeetingId === meeting.id}
                            >
                              수정
                            </button>

                            <button
                              type="button"
                              style={smallDangerButtonStyle}
                              onClick={() => handleArchiveMeeting(meeting)}
                              disabled={editSubmitting || archivingMeetingId === meeting.id}
                            >
                              {archivingMeetingId === meeting.id ? "삭제 중" : "삭제"}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section ref={attendanceSectionRef} style={detailCardStyle}>
        <div style={detailHeaderStyle}>
          <div>
            <h2 style={{ ...sectionTitleStyle, fontSize: "20px" }}>출석 입력</h2>
            <p style={sectionDescriptionStyle}>
              집회 목록에서 집회를 선택하면 해당 소속대의 활동 대원만 출석을 입력할 수 있습니다.
            </p>
          </div>
        </div>

        {!selectedMeeting && <div style={emptyStateStyle}>출석을 입력할 집회를 목록에서 선택하세요.</div>}

        {selectedMeeting && (
          <>
            <div style={attendanceOverviewGridStyle}>
              <section style={selectedMeetingOverviewCardStyle}>
                <div>
                  <h3 style={selectedMeetingTitleStyle}>{selectedMeeting.title}</h3>
                  <p style={selectedMeetingDescriptionStyle}>
                    {formatDate(selectedMeeting.meeting_date)} · {getOrganizationName(selectedMeeting.organization_id)} · {MEETING_TYPE_LABELS[selectedMeeting.meeting_type] ?? selectedMeeting.meeting_type}
                  </p>
                </div>

                <span
                  style={
                    selectedMeeting.is_attendance_target
                      ? targetBadgeStyle
                      : nonTargetBadgeStyle
                  }
                >
                  {selectedMeeting.is_attendance_target
                    ? "출석률 산정 대상"
                    : "출석 반영 제외"}
                </span>
              </section>

              <section style={miniSummaryCardStyle}>
                <h3 style={miniSummaryTitleStyle}>대상 대원</h3>
                <p style={miniSummaryValueStyle}>{attendanceSummary.totalCount}명</p>
              </section>
              <section style={miniSummaryCardStyle}>
                <h3 style={miniSummaryTitleStyle}>출석 인정</h3>
                <p style={miniSummaryValueStyle}>{attendanceSummary.presentCount}명</p>
              </section>
              <section style={miniSummaryCardStyle}>
                <h3 style={miniSummaryTitleStyle}>결석</h3>
                <p style={miniSummaryValueStyle}>{attendanceSummary.absentCount}명</p>
              </section>
              <section style={miniSummaryCardStyle}>
                <h3 style={miniSummaryTitleStyle}>미입력</h3>
                <p style={miniSummaryValueStyle}>{attendanceSummary.notEnteredCount}명</p>
              </section>
            </div>

            <p style={attendanceGuideStyle}>
              출석 인정에는 출석, 인정출석, 지각, 조퇴가 포함됩니다. 일반 진급에서는 참고 지표로 사용하고, 소속대 환경설정에서 범 진급 출석률 적용이 켜진 경우 무궁화 → 범 판정의 필수 조건으로 사용합니다.
            </p>

            {attendanceErrorMessage && <div style={errorBoxStyle}>{attendanceErrorMessage}</div>}
            <FeedbackToast message={attendanceSuccessMessage} tone="success" onClose={() => setAttendanceSuccessMessage("")} />

            {canManageMeetings && (
              <div style={bulkPanelStyle}>
                <div style={bulkHeaderStyle}>
                  <div>
                    <h3 style={bulkTitleStyle}>출석 선택 일괄 입력</h3>
                    <p style={bulkDescriptionStyle}>
                      대원 선택 후 출석 상태와 비고를 한 번에 적용하면 바로 저장됩니다.
                    </p>
                  </div>

                  <span style={selectedCountBadgeStyle}>
                    선택 {selectedAttendanceScoutCount}명 / 전체 {selectedMeetingScouts.length}명
                  </span>
                </div>

                <div style={bulkControlRowStyle}>
                  <div style={bulkButtonGroupStyle}>
                    <button
                      type="button"
                      style={secondaryButtonStyle}
                      onClick={handleSelectAllAttendanceScouts}
                      disabled={bulkAttendanceSaving}
                    >
                      전체 선택
                    </button>
                    <button
                      type="button"
                      style={secondaryButtonStyle}
                      onClick={handleClearAttendanceScoutSelection}
                      disabled={bulkAttendanceSaving}
                    >
                      선택 해제
                    </button>
                  </div>

                  <label
                    style={{
                      ...compactFieldLabelStyle,
                      minWidth: "210px",
                    }}
                  >
                    일괄 적용 상태
                    <select
                      style={inputStyle}
                      value={bulkAttendanceStatus}
                      onChange={(event) =>
                        setBulkAttendanceStatus(event.target.value as AttendanceStatus)
                      }
                      disabled={bulkAttendanceSaving}
                    >
                      {ATTENDANCE_STATUS_OPTIONS.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label
                    style={{
                      ...compactFieldLabelStyle,
                      minWidth: "300px",
                    }}
                  >
                    일괄 비고
                    <input
                      style={inputStyle}
                      value={bulkAttendanceNote}
                      onChange={(event) => setBulkAttendanceNote(event.target.value)}
                      placeholder="비고를 일괄 적용할 때만 입력"
                      disabled={bulkAttendanceSaving}
                    />
                  </label>

                  <button
                    type="button"
                    style={submitButtonStyle}
                    onClick={() => handleApplyBulkAttendance("selected")}
                    disabled={bulkAttendanceSaving || selectedAttendanceScoutCount === 0}
                  >
                    {bulkAttendanceSaving ? "적용 중..." : "선택 대원 적용"}
                  </button>

                  <button
                    type="button"
                    style={secondaryButtonStyle}
                    onClick={() => handleApplyBulkAttendance("selected_not_entered")}
                    disabled={bulkAttendanceSaving || selectedAttendanceScoutCount === 0}
                  >
                    미입력 대원만 적용
                  </button>
                </div>
              </div>
            )}

            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={centerThStyle}>
                      <input
                        type="checkbox"
                        checked={isAllAttendanceScoutsSelected}
                        onChange={(event) => {
                          if (event.target.checked) {
                            handleSelectAllAttendanceScouts();
                          } else {
                            handleClearAttendanceScoutSelection();
                          }
                        }}
                        disabled={!canManageMeetings || selectedMeetingScouts.length === 0}
                        aria-label="전체 대원 선택"
                      />
                    </th>
                    <th style={thStyle}>{renderAttendanceSortButton("member_no", "대원번호")}</th>
                    <th style={thStyle}>{renderAttendanceSortButton("name", "이름")}</th>
                    <th style={thStyle}>{renderAttendanceSortButton("school_grade", "소속/학년")}</th>
                    <th style={thStyle}>{renderAttendanceSortButton("status", "상태")}</th>
                    <th style={thStyle}>{renderAttendanceSortButton("attendance_status", "출석 상태")}</th>
                    <th style={thStyle}>비고</th>
                    {canManageMeetings && <th style={thStyle}>저장</th>}
                  </tr>
                </thead>

                <tbody>
                  {sortedSelectedMeetingScouts.map((scout) => {
                    const draft = attendanceDrafts[scout.id] ?? {
                      status: "not_entered" as AttendanceStatus,
                      note: "",
                    };
                    const isSelected = selectedAttendanceScoutIdSet.has(scout.id);

                    return (
                      <tr key={scout.id} style={isSelected ? selectedAttendanceRowStyle : rowStyle}>
                        <td style={centerTdStyle}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(event) =>
                              handleToggleAttendanceScoutSelection(scout.id, event.target.checked)
                            }
                            disabled={!canManageMeetings}
                            aria-label={`${scout.name} 선택`}
                          />
                        </td>
                        <td style={tdStyle}>{scout.member_no ?? "-"}</td>
                        <td style={strongTdStyle}>
                          {scout.name}
                          {scout.current_rank_id && rankNameMap.get(scout.current_rank_id) ? (
                            <span style={scoutRankTextStyle}>
                              {" "}
                              / {rankNameMap.get(scout.current_rank_id)}
                            </span>
                          ) : null}
                        </td>
                        <td style={tdStyle}>
                          {[scout.school_name, scout.grade].filter(Boolean).join(" / ") || "-"}
                        </td>
                        <td style={tdStyle}>{SCOUT_STATUS_LABELS[scout.status]}</td>
                        <td style={tdStyle}>
                          {canManageMeetings ? (
                            <select
                              style={getAttendanceSelectStyle(draft.status)}
                              value={draft.status}
                              onChange={(event) =>
                                updateAttendanceDraft(
                                  scout.id,
                                  "status",
                                  event.target.value as AttendanceStatus,
                                )
                              }
                            >
                              {ATTENDANCE_STATUS_OPTIONS.map((status) => (
                                <option key={status.value} value={status.value}>
                                  {status.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span style={getAttendanceBadgeStyle(draft.status)}>
                              {ATTENDANCE_STATUS_LABELS[draft.status]}
                            </span>
                          )}
                        </td>
                        <td style={tdStyle}>
                          {canManageMeetings ? (
                            <input
                              style={noteInputStyle}
                              value={draft.note}
                              onChange={(event) =>
                                updateAttendanceDraft(scout.id, "note", event.target.value)
                              }
                              placeholder="비고"
                            />
                          ) : (
                            draft.note || "-"
                          )}
                        </td>
                        {canManageMeetings && (
                          <td style={tdStyle}>
                            <button
                              type="button"
                              style={smallButtonStyle}
                              onClick={() => handleSaveAttendance(scout.id)}
                              disabled={attendanceSavingScoutId === scout.id || bulkAttendanceSaving}
                            >
                              {attendanceSavingScoutId === scout.id ? "저장 중" : "저장"}
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {isPanelOpen &&
        createPortal(
        <div style={panelBackdropStyle}>
          <aside style={slidePanelStyle}>
            {isCreateFormOpen && canManageMeetings && (
              <form style={panelFormStyle} onSubmit={handleCreateMeeting}>
                <div style={panelHeaderStyle}>
                  <div>
                    <h3 style={panelTitleStyle}>집회/활동 등록</h3>
                    <p style={panelDescriptionStyle}>
                      출석률 산정 대상을 선택하면 이 집회가 대원 출석률 계산에 포함됩니다.
                    </p>
                  </div>

                  <button
                    type="button"
                    style={secondaryButtonStyle}
                    onClick={handleClosePanel}
                    disabled={submitting}
                  >
                    닫기
                  </button>
                </div>

                <div style={panelBodyStyle}>
                  {formErrorMessage && <div style={errorBoxStyle}>{formErrorMessage}</div>}

                  {isSuperAdmin && (
                    <label style={fieldLabelStyle}>
                      소속 조직 <span style={requiredStyle}>*</span>
                      <select
                        style={inputStyle}
                        value={createForm.organization_id}
                        onChange={(event) => updateCreateForm("organization_id", event.target.value)}
                        required
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

                  <label style={fieldLabelStyle}>
                    집회일 <span style={requiredStyle}>*</span>
                    <input
                      style={inputStyle}
                      type="date"
                      value={createForm.meeting_date}
                      onChange={(event) => updateCreateForm("meeting_date", event.target.value)}
                      required
                    />
                  </label>

                  <label style={fieldLabelStyle}>
                    집회/활동명 <span style={requiredStyle}>*</span>
                    <input
                      style={inputStyle}
                      value={createForm.title}
                      onChange={(event) => updateCreateForm("title", event.target.value)}
                      placeholder="예: 7월 정기집회"
                      required
                    />
                  </label>

                  <label style={fieldLabelStyle}>
                    유형
                    <select
                      style={inputStyle}
                      value={createForm.meeting_type}
                      onChange={(event) => updateCreateForm("meeting_type", event.target.value as MeetingType)}
                    >
                      {MEETING_TYPE_OPTIONS.map((meetingType) => (
                        <option key={meetingType.value} value={meetingType.value}>
                          {meetingType.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={checkboxLabelStyle}>
                    <input
                      type="checkbox"
                      checked={createForm.is_attendance_target}
                      onChange={(event) => updateCreateForm("is_attendance_target", event.target.checked)}
                    />
                    출석률 산정 대상에 포함
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
                </div>

                <div style={panelFooterStyle}>
                  <button
                    type="button"
                    style={secondaryButtonStyle}
                    onClick={handleClosePanel}
                    disabled={submitting}
                  >
                    취소
                  </button>
                  <button type="submit" style={submitButtonStyle} disabled={submitting}>
                    {submitting ? "등록 중..." : "등록 저장"}
                  </button>
                </div>
              </form>
            )}

            {editingMeetingId && editForm && canManageMeetings && (
              <form style={panelFormStyle} onSubmit={handleUpdateMeeting}>
                <div style={panelHeaderStyle}>
                  <div>
                    <h3 style={panelTitleStyle}>집회/활동 수정</h3>
                    <p style={panelDescriptionStyle}>
                      선택한 집회/활동의 일자, 이름, 유형, 출석률 산정 여부를 수정합니다.
                    </p>
                  </div>

                  <button
                    type="button"
                    style={secondaryButtonStyle}
                    onClick={handleClosePanel}
                    disabled={editSubmitting}
                  >
                    닫기
                  </button>
                </div>

                <div style={panelBodyStyle}>
                  {editErrorMessage && <div style={errorBoxStyle}>{editErrorMessage}</div>}

                  <label style={fieldLabelStyle}>
                    집회일 <span style={requiredStyle}>*</span>
                    <input
                      style={inputStyle}
                      type="date"
                      value={editForm.meeting_date}
                      onChange={(event) => updateEditForm("meeting_date", event.target.value)}
                      required
                    />
                  </label>

                  <label style={fieldLabelStyle}>
                    집회/활동명 <span style={requiredStyle}>*</span>
                    <input
                      style={inputStyle}
                      value={editForm.title}
                      onChange={(event) => updateEditForm("title", event.target.value)}
                      placeholder="예: 7월 정기집회"
                      required
                    />
                  </label>

                  <label style={fieldLabelStyle}>
                    유형
                    <select
                      style={inputStyle}
                      value={editForm.meeting_type}
                      onChange={(event) => updateEditForm("meeting_type", event.target.value as MeetingType)}
                    >
                      {MEETING_TYPE_OPTIONS.map((meetingType) => (
                        <option key={meetingType.value} value={meetingType.value}>
                          {meetingType.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={checkboxLabelStyle}>
                    <input
                      type="checkbox"
                      checked={editForm.is_attendance_target}
                      onChange={(event) => updateEditForm("is_attendance_target", event.target.checked)}
                    />
                    출석률 산정 대상에 포함
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
                </div>

                <div style={panelFooterStyle}>
                  <button
                    type="button"
                    style={secondaryButtonStyle}
                    onClick={handleClosePanel}
                    disabled={editSubmitting}
                  >
                    취소
                  </button>
                  <button type="submit" style={submitButtonStyle} disabled={editSubmitting}>
                    {editSubmitting ? "수정 중..." : "수정 저장"}
                  </button>
                </div>
              </form>
            )}
          </aside>
        </div>,
          document.body,
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

const headerActionStyle: CSSProperties = {
  display: "flex",
  gap: "8px",
  alignItems: "center",
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

const summaryCardBlueStyle: CSSProperties = {
  ...summaryCardStyle,
  borderColor: "#bfdbfe",
  backgroundColor: "#eff6ff",
};

const summaryCardOrangeStyle: CSSProperties = {
  ...summaryCardStyle,
  borderColor: "#fed7aa",
  backgroundColor: "#fff7ed",
};

const summaryCardRedStyle: CSSProperties = {
  ...summaryCardStyle,
  borderColor: "#fecaca",
  backgroundColor: "#fef2f2",
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

const detailCardStyle: CSSProperties = {
  ...contentCardStyle,
  marginTop: "16px",
  padding: "16px",
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
  lineHeight: 1.5,
};

const filterSelectStyle: CSSProperties = {
  minWidth: "140px",
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

const primaryButtonStyle: CSSProperties = {
  padding: "10px 14px",
  borderRadius: "8px",
  border: "none",
  backgroundColor: "#2563eb",
  color: "#ffffff",
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const secondaryButtonStyle: CSSProperties = {
  padding: "10px 14px",
  borderRadius: "8px",
  border: "1px solid #cbd5e1",
  backgroundColor: "#ffffff",
  color: "#334155",
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const submitButtonStyle: CSSProperties = {
  padding: "10px 14px",
  borderRadius: "8px",
  border: "none",
  backgroundColor: "#16a34a",
  color: "#ffffff",
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const smallButtonStyle: CSSProperties = {
  padding: "7px 10px",
  borderRadius: "7px",
  border: "1px solid #cbd5e1",
  backgroundColor: "#ffffff",
  color: "#334155",
  fontSize: "13px",
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const smallDangerButtonStyle: CSSProperties = {
  padding: "7px 10px",
  borderRadius: "7px",
  border: "none",
  backgroundColor: "#dc2626",
  color: "#ffffff",
  fontSize: "13px",
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
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
  lineHeight: 1.5,
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

const centerThStyle: CSSProperties = {
  ...thStyle,
  textAlign: "center",
  width: "52px",
};

const sortableHeaderButtonStyle: CSSProperties = {
  padding: 0,
  border: "none",
  backgroundColor: "transparent",
  color: "#334155",
  fontWeight: 800,
  cursor: "pointer",
  font: "inherit",
};

const tdStyle: CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid #e5e7eb",
  color: "#475569",
  whiteSpace: "nowrap",
};

const centerTdStyle: CSSProperties = {
  ...tdStyle,
  textAlign: "center",
};

const strongTdStyle: CSSProperties = {
  ...tdStyle,
  color: "#0f172a",
  fontWeight: 800,
};

const rowStyle: CSSProperties = {};

const clickableMeetingRowStyle: CSSProperties = {
  cursor: "pointer",
};

const selectedClickableMeetingRowStyle: CSSProperties = {
  cursor: "pointer",
  backgroundColor: "#eff6ff",
};

const selectedAttendanceRowStyle: CSSProperties = {
  backgroundColor: "#f8fafc",
};

const rowActionStyle: CSSProperties = {
  display: "flex",
  gap: "6px",
  alignItems: "center",
};

const targetBadgeStyle: CSSProperties = {
  display: "inline-flex",
  padding: "4px 8px",
  borderRadius: "999px",
  backgroundColor: "#dcfce7",
  color: "#166534",
  fontSize: "12px",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const nonTargetBadgeStyle: CSSProperties = {
  ...targetBadgeStyle,
  backgroundColor: "#f1f5f9",
  color: "#475569",
};

const detailHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  alignItems: "flex-start",
  marginBottom: "10px",
};

const selectedMeetingTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "18px",
  fontWeight: 800,
  color: "#0f172a",
};

const selectedMeetingDescriptionStyle: CSSProperties = {
  marginTop: "8px",
  marginBottom: 0,
  color: "#64748b",
  lineHeight: 1.5,
};

const attendanceOverviewGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(320px, 1.5fr) repeat(4, minmax(120px, 1fr))",
  gap: "8px",
  alignItems: "stretch",
  marginBottom: "8px",
  overflowX: "auto",
};

const selectedMeetingOverviewCardStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  minWidth: "320px",
  padding: "10px 12px",
  border: "1px solid #e5e7eb",
  borderRadius: "9px",
  backgroundColor: "#f8fafc",
};


const miniSummaryCardStyle: CSSProperties = {
  minWidth: "120px",
  border: "1px solid #e5e7eb",
  borderRadius: "9px",
  padding: "10px 12px",
  backgroundColor: "#f8fafc",
};

const miniSummaryTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "13px",
  color: "#64748b",
  fontWeight: 800,
};

const miniSummaryValueStyle: CSSProperties = {
  marginTop: "4px",
  marginBottom: 0,
  fontSize: "18px",
  fontWeight: 800,
  color: "#0f172a",
};

const attendanceGuideStyle: CSSProperties = {
  marginTop: 0,
  marginBottom: "10px",
  color: "#64748b",
  fontSize: "12px",
  lineHeight: 1.4,
};

const bulkPanelStyle: CSSProperties = {
  padding: "12px 14px",
  border: "1px solid #bfdbfe",
  borderRadius: "10px",
  backgroundColor: "#eff6ff",
  marginBottom: "10px",
};

const bulkHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  alignItems: "center",
  marginBottom: "8px",
};

const bulkTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "16px",
  fontWeight: 800,
  color: "#0f172a",
};

const bulkDescriptionStyle: CSSProperties = {
  marginTop: "3px",
  marginBottom: 0,
  color: "#64748b",
  fontSize: "12px",
  lineHeight: 1.35,
};

const selectedCountBadgeStyle: CSSProperties = {
  display: "inline-flex",
  padding: "6px 9px",
  borderRadius: "999px",
  backgroundColor: "#dbeafe",
  color: "#1d4ed8",
  fontWeight: 800,
  fontSize: "12px",
  whiteSpace: "nowrap",
};

const bulkControlRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto minmax(190px, 220px) minmax(260px, 1fr) auto auto",
  gap: "8px",
  alignItems: "end",
  overflowX: "auto",
};

const bulkButtonGroupStyle: CSSProperties = {
  display: "flex",
  gap: "8px",
  flexWrap: "nowrap",
};

const compactFieldLabelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  color: "#334155",
  fontSize: "12px",
  fontWeight: 700,
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
  minHeight: "100px",
  resize: "vertical",
};

const checkboxLabelStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  marginTop: "16px",
  color: "#334155",
  fontSize: "14px",
  fontWeight: 700,
};

const requiredStyle: CSSProperties = {
  color: "#dc2626",
};

const attendanceSelectStyle: CSSProperties = {
  width: "120px",
  padding: "8px 10px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  fontSize: "14px",
  backgroundColor: "#ffffff",
};

const noteInputStyle: CSSProperties = {
  width: "200px",
  padding: "8px 10px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  fontSize: "14px",
  backgroundColor: "#ffffff",
};

const attendanceBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "56px",
  padding: "4px 8px",
  border: "1px solid #e5e7eb",
  borderRadius: "999px",
  backgroundColor: "#f8fafc",
  color: "#475569",
  fontSize: "12px",
  fontWeight: 800,
};

const panelBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 50,
  backgroundColor: "rgba(15, 23, 42, 0.18)",
  pointerEvents: "auto",
};

const slidePanelStyle: CSSProperties = {
  position: "fixed",
  top: "24px",
  right: "24px",
  bottom: "24px",
  width: "min(520px, calc(100vw - 48px))",
  maxWidth: "calc(100vw - 48px)",
  boxSizing: "border-box",
  borderRadius: "16px",
  backgroundColor: "#ffffff",
  boxShadow: "0 20px 60px rgba(15, 23, 42, 0.25)",
  overflow: "hidden",
};

const panelFormStyle: CSSProperties = {
  height: "100%",
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
};

const panelHeaderStyle: CSSProperties = {
  flexShrink: 0,
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: "12px",
  alignItems: "flex-start",
  padding: "20px",
  borderBottom: "1px solid #e5e7eb",
};

const panelTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "21px",
  fontWeight: 800,
  color: "#0f172a",
};

const panelDescriptionStyle: CSSProperties = {
  marginTop: "6px",
  marginBottom: 0,
  color: "#64748b",
  lineHeight: 1.5,
};

const panelBodyStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  overflowX: "hidden",
  padding: "20px 20px 32px",
  boxSizing: "border-box",
  overscrollBehavior: "contain",
};

const panelFooterStyle: CSSProperties = {
  position: "sticky",
  bottom: 0,
  flexShrink: 0,
  display: "flex",
  justifyContent: "flex-end",
  gap: "8px",
  padding: "16px 20px max(16px, env(safe-area-inset-bottom))",
  borderTop: "1px solid #e5e7eb",
  backgroundColor: "#ffffff",
  boxShadow: "0 -8px 20px rgba(15, 23, 42, 0.06)",
};

const scoutRankTextStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "12px",
  fontWeight: 600,
  whiteSpace: "nowrap",
};


const normalCountStyle: CSSProperties = {
  color: "#475569",
  fontWeight: 700,
};

const missingCountStyle: CSSProperties = {
  display: "inline-flex",
  minWidth: "34px",
  justifyContent: "center",
  padding: "4px 8px",
  borderRadius: "999px",
  backgroundColor: "#ffedd5",
  color: "#9a3412",
  fontWeight: 800,
};

const absentCountStyle: CSSProperties = {
  ...missingCountStyle,
  backgroundColor: "#fee2e2",
  color: "#b91c1c",
};

const completeStatusBadgeStyle: CSSProperties = {
  display: "inline-flex",
  padding: "5px 9px",
  borderRadius: "999px",
  backgroundColor: "#dcfce7",
  color: "#166534",
  fontSize: "12px",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const incompleteStatusBadgeStyle: CSSProperties = {
  ...completeStatusBadgeStyle,
  backgroundColor: "#ffedd5",
  color: "#9a3412",
};
