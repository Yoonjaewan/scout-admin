import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "../lib/supabase";

type SignupRequest = {
  id: string;
  auth_user_id: string | null;
  email: string;
  name: string;
  phone: string | null;
  organization_type: string;
  organization_name: string;
  requested_role: string;
  status: string;
  note: string | null;
  admin_note: string | null;
  processed_by: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
};

type StatusFilter = "all" | "pending" | "approved" | "rejected" | "suspended";
type OrganizationStatus = "active" | "suspended" | "closed" | "inactive" | string;
type OrganizationStatusFilter =
  | "all"
  | "active"
  | "suspended"
  | "closed"
  | "needs_info";
type SummaryTone = "default" | "warning" | "success" | "danger" | "muted";

type OrganizationItem = {
  id: string;
  name: string;
  type: string | null;
  typeLabel: string;
  unitNumber: string | null;
  region: string | null;
  description: string | null;
  status: OrganizationStatus;
  statusLabel: string;
  needsInfo: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  adminCount: number;
  leaderCount: number;
  viewerCount: number;
  totalScoutCount: number;
  activeScoutCount: number;
};

export default function SignupRequestsPage() {
  const [requests, setRequests] = useState<SignupRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [keyword, setKeyword] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null,
  );
  const [organizations, setOrganizations] = useState<OrganizationItem[]>([]);
  const [organizationStatusFilter, setOrganizationStatusFilter] =
    useState<OrganizationStatusFilter>("all");
  const [organizationKeyword, setOrganizationKeyword] = useState("");
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<
    string | null
  >(null);
  const [organizationProcessingId, setOrganizationProcessingId] = useState<
    string | null
  >(null);

  const loadRequests = async (options?: { keepMessage?: boolean }) => {
    setLoading(true);
    setErrorMessage("");

    if (!options?.keepMessage) {
      setSuccessMessage("");
    }

    const [requestResult, organizationResult, profileResult, scoutResult] =
      await Promise.all([
        supabase
          .from("signup_requests")
          .select(
            "id, auth_user_id, email, name, phone, organization_type, organization_name, requested_role, status, note, admin_note, processed_by, processed_at, created_at, updated_at",
          )
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        supabase
          .from("organizations")
          .select("*")
          .is("deleted_at", null)
          .order("name", { ascending: true }),
        supabase
          .from("user_profiles")
          .select("*")
          .is("deleted_at", null),
        supabase
          .from("scouts")
          .select("id, organization_id, status")
          .is("deleted_at", null),
      ]);

    if (requestResult.error) {
      console.error("이용신청 조회 오류:", requestResult.error.message);
      setErrorMessage(
        `이용신청 목록을 불러오지 못했습니다. 오류: ${requestResult.error.message}`,
      );
      setLoading(false);
      return;
    }

    if (organizationResult.error) {
      console.error("소속대 목록 조회 오류:", organizationResult.error.message);
      setErrorMessage("승인된 소속대 현황을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    if (profileResult.error) {
      console.error("사용자 목록 조회 오류:", profileResult.error.message);
      setErrorMessage("사용자 목록을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    if (scoutResult.error) {
      console.error("대원 목록 조회 오류:", scoutResult.error.message);
      setErrorMessage("대원 목록을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const rows = (requestResult.data ?? []) as SignupRequest[];

    setRequests(rows);

    const profileRows = ((profileResult.data ?? []) as unknown as Record<
      string,
      unknown
    >[])
      .map((row) => ({
        id: getStringValue(row, ["id", "user_id"]) || "",
        organizationId: getStringValue(row, ["organization_id"]),
        role: getStringValue(row, ["role"]) || "",
        status: getStringValue(row, ["approval_status", "status"]) || "approved",
      }))
      .filter((profile) => profile.id);

    const approvedOrganizationIds = new Set(
      profileRows
        .filter(
          (profile) =>
            profile.organizationId && isApprovedProfileStatus(profile.status),
        )
        .map((profile) => profile.organizationId),
    );

    const scoutRows = ((scoutResult.data ?? []) as unknown as Record<
      string,
      unknown
    >[])
      .map((row) => ({
        id: getStringValue(row, ["id"]) || "",
        organizationId: getStringValue(row, ["organization_id"]) || "",
        status: getStringValue(row, ["status"]) || "active",
      }))
      .filter((scout) => scout.id && scout.organizationId);

    const organizationRows = ((organizationResult.data ?? []) as unknown as
      Record<string, unknown>[])
      .map((row) => {
        const id = getStringValue(row, ["id"]) || "";
        const status = getOrganizationStatus(row);
        const unitNumber = getStringValue(row, ["unit_number"]);
        const organizationProfiles = profileRows.filter(
          (profile) =>
            profile.organizationId === id &&
            isApprovedProfileStatus(profile.status),
        );
        const organizationScouts = scoutRows.filter(
          (scout) => scout.organizationId === id,
        );

        return {
          id,
          name: getStringValue(row, ["name"]) || "소속대명 미등록",
          type: getStringValue(row, ["type"]),
          typeLabel: getOrganizationTypeLabel(getStringValue(row, ["type"]) || ""),
          unitNumber,
          region: getStringValue(row, ["region"]),
          description: getStringValue(row, ["description"]),
          status,
          statusLabel: getOrganizationUsageStatusLabel(status),
          needsInfo: !unitNumber,
          createdAt: getStringValue(row, ["created_at"]),
          updatedAt: getStringValue(row, ["updated_at"]),
          adminCount: organizationProfiles.filter(
            (profile) => profile.role === "org_admin",
          ).length,
          leaderCount: organizationProfiles.filter(
            (profile) => profile.role === "leader",
          ).length,
          viewerCount: organizationProfiles.filter(
            (profile) => profile.role === "viewer",
          ).length,
          totalScoutCount: organizationScouts.length,
          activeScoutCount: organizationScouts.filter(
            (scout) => scout.status === "active",
          ).length,
        };
      })
      .filter(
        (organization) =>
          organization.id && approvedOrganizationIds.has(organization.id),
      )
      .sort((left, right) => left.name.localeCompare(right.name, "ko"));

    setOrganizations(organizationRows);

    const initialNotes: Record<string, string> = {};
    rows.forEach((request) => {
      if (request.admin_note) {
        initialNotes[request.id] = request.admin_note;
      }
    });
    setAdminNotes(initialNotes);
    setLoading(false);
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const filteredRequests = useMemo(() => {
    const cleanKeyword = keyword.trim().toLowerCase();

    return requests.filter((request) => {
      const statusMatched =
        statusFilter === "all" ? true : request.status === statusFilter;

      const keywordMatched =
        !cleanKeyword ||
        request.email.toLowerCase().includes(cleanKeyword) ||
        request.name.toLowerCase().includes(cleanKeyword) ||
        request.organization_name.toLowerCase().includes(cleanKeyword) ||
        getOrganizationTypeLabel(request.organization_type)
          .toLowerCase()
          .includes(cleanKeyword) ||
        getRoleLabel(request.requested_role)
          .toLowerCase()
          .includes(cleanKeyword) ||
        (request.phone ?? "").toLowerCase().includes(cleanKeyword);

      return statusMatched && keywordMatched;
    });
  }, [requests, statusFilter, keyword]);

  const statusCounts = useMemo(() => {
    return {
      all: requests.length,
      pending: requests.filter((request) => request.status === "pending")
        .length,
      approved: requests.filter((request) => request.status === "approved")
        .length,
      rejected: requests.filter((request) => request.status === "rejected")
        .length,
      suspended: requests.filter((request) => request.status === "suspended")
        .length,
    };
  }, [requests]);

  const organizationStatusCounts = useMemo(() => {
    return {
      all: organizations.length,
      active: organizations.filter(
        (organization) => organization.status === "active",
      ).length,
      suspended: organizations.filter((organization) =>
        isSuspendedOrganizationStatus(organization.status),
      ).length,
      closed: organizations.filter(
        (organization) => organization.status === "closed",
      ).length,
      needsInfo: organizations.filter((organization) => organization.needsInfo)
        .length,
    };
  }, [organizations]);

  const filteredOrganizations = useMemo(() => {
    const cleanKeyword = organizationKeyword.trim().toLowerCase();

    return organizations.filter((organization) => {
      const statusMatched =
        organizationStatusFilter === "all" ||
        (organizationStatusFilter === "active" &&
          organization.status === "active") ||
        (organizationStatusFilter === "suspended" &&
          isSuspendedOrganizationStatus(organization.status)) ||
        (organizationStatusFilter === "closed" &&
          organization.status === "closed") ||
        (organizationStatusFilter === "needs_info" && organization.needsInfo);

      if (!statusMatched) return false;

      if (!cleanKeyword) return true;

      const targetText = [
        organization.name,
        organization.unitNumber,
        organization.typeLabel,
        organization.region,
        organization.description,
        organization.statusLabel,
        organization.needsInfo ? "정보 보완 필요" : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return targetText.includes(cleanKeyword);
    });
  }, [organizationKeyword, organizations, organizationStatusFilter]);

  const selectedOrganization = useMemo(() => {
    if (filteredOrganizations.length === 0) return null;

    if (selectedOrganizationId) {
      const matched = filteredOrganizations.find(
        (organization) => organization.id === selectedOrganizationId,
      );

      if (matched) return matched;
    }

    return filteredOrganizations[0];
  }, [filteredOrganizations, selectedOrganizationId]);

  const selectedRequest = useMemo(() => {
    if (filteredRequests.length === 0) return null;

    if (selectedRequestId) {
      const matchedRequest = filteredRequests.find(
        (request) => request.id === selectedRequestId,
      );
      if (matchedRequest) return matchedRequest;
    }

    return filteredRequests[0];
  }, [filteredRequests, selectedRequestId]);

  const handleChangeStatusFilter = (nextStatus: StatusFilter) => {
    setStatusFilter(nextStatus);
    setSelectedRequestId(null);
    setErrorMessage("");
    setSuccessMessage("");
  };

  const handleChangeOrganizationStatusFilter = (
    nextStatus: OrganizationStatusFilter,
  ) => {
    setOrganizationStatusFilter(nextStatus);
    setSelectedOrganizationId(null);
    setErrorMessage("");
    setSuccessMessage("");
  };

  const handleUpdateOrganizationStatus = async (
    organization: OrganizationItem,
    nextStatus: "active" | "suspended" | "closed",
  ) => {
    const nextStatusLabel = getOrganizationUsageStatusLabel(nextStatus);
    const confirmed = window.confirm(
      [
        `${organization.name}의 이용 상태를 '${nextStatusLabel}' 상태로 변경합니다.`,
        "",
        nextStatus === "active"
          ? "소속대 사용자가 다시 업무 화면을 사용할 수 있습니다."
          : "기존 기록은 보존되며, 해당 소속대 사용자는 업무 화면을 사용할 수 없습니다.",
        "",
        "계속 진행하시겠습니까?",
      ].join("\n"),
    );

    if (!confirmed) return;

    setOrganizationProcessingId(organization.id);
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase
      .from("organizations")
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", organization.id)
      .is("deleted_at", null);

    if (error) {
      console.error("소속대 상태 변경 오류:", error.message);
      setErrorMessage(`소속대 상태 변경에 실패했습니다. ${error.message}`);
      setOrganizationProcessingId(null);
      return;
    }

    await loadRequests({ keepMessage: true });
    setSuccessMessage(
      `${organization.name}의 이용 상태를 '${nextStatusLabel}' 상태로 변경했습니다.`,
    );
    setOrganizationProcessingId(null);
  };

  const handleApprove = async (request: SignupRequest) => {
    const confirmed = window.confirm(
      `${request.name}님의 이용신청을 승인하시겠습니까?\n\n소속: ${request.organization_name}\n권한: ${getRoleLabel(request.requested_role)}`,
    );

    if (!confirmed) return;

    setProcessingId(request.id);
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase.rpc("approve_signup_request", {
      p_request_id: request.id,
      p_admin_note: adminNotes[request.id]?.trim() || null,
    });

    if (error) {
      console.error("승인 오류:", error.message);
      setErrorMessage(`승인 실패: ${error.message}`);
      setProcessingId(null);
      return;
    }

    await loadRequests({ keepMessage: true });
    setSuccessMessage(`${request.name}님의 이용신청을 승인했습니다.`);
    setProcessingId(null);
  };

  const handleReject = async (request: SignupRequest) => {
    const note = adminNotes[request.id]?.trim();

    if (!note) {
      setErrorMessage("반려할 때는 관리자 메모에 반려 사유를 입력하세요.");
      return;
    }

    const confirmed = window.confirm(
      `${request.name}님의 이용신청을 반려하시겠습니까?`,
    );

    if (!confirmed) return;

    setProcessingId(request.id);
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase.rpc("reject_signup_request", {
      p_request_id: request.id,
      p_admin_note: note,
    });

    if (error) {
      console.error("반려 오류:", error.message);
      setErrorMessage(`반려 실패: ${error.message}`);
      setProcessingId(null);
      return;
    }

    await loadRequests({ keepMessage: true });
    setSuccessMessage(`${request.name}님의 이용신청을 반려했습니다.`);
    setProcessingId(null);
  };

  return (
    <div>
      <header style={pageHeaderStyle}>
        <div>
          <div style={roleBadgeStyle}>최고관리자</div>
          <h1 style={titleStyle}>이용신청 관리</h1>
          <p style={descriptionStyle}>
            소속대 이용신청을 확인하고 승인 또는 반려 처리합니다.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadRequests()}
          disabled={loading}
          style={{
            ...refreshButtonStyle,
            opacity: loading ? 0.7 : 1,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "새로고침 중..." : "새로고침"}
        </button>
      </header>

      <section style={summaryGridStyle}>
        <SummaryCard
          label="전체"
          value={statusCounts.all}
          active={statusFilter === "all"}
          onClick={() => handleChangeStatusFilter("all")}
        />
        <SummaryCard
          label="승인 대기"
          value={statusCounts.pending}
          tone="warning"
          active={statusFilter === "pending"}
          onClick={() => handleChangeStatusFilter("pending")}
        />
        <SummaryCard
          label="승인 완료"
          value={statusCounts.approved}
          tone="success"
          active={statusFilter === "approved"}
          onClick={() => handleChangeStatusFilter("approved")}
        />
        <SummaryCard
          label="반려"
          value={statusCounts.rejected}
          tone="danger"
          active={statusFilter === "rejected"}
          onClick={() => handleChangeStatusFilter("rejected")}
        />
        {statusCounts.suspended > 0 && (
          <SummaryCard
            label="이용 제한"
            value={statusCounts.suspended}
            tone="muted"
            active={statusFilter === "suspended"}
            onClick={() => handleChangeStatusFilter("suspended")}
          />
        )}
      </section>

      <section style={panelStyle}>
        <div style={toolbarStyle}>
          <div>
            <h2 style={sectionTitleStyle}>{getFilterTitle(statusFilter)}</h2>
            <p style={sectionDescriptionStyle}>
              상단 카드를 선택하면 상태별 신청 목록을 확인할 수 있습니다.
            </p>
          </div>

          <input
            type="search"
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value);
              setSelectedRequestId(null);
            }}
            placeholder="이름, 이메일, 소속대명, 연락처 검색"
            style={searchInputStyle}
          />
        </div>

        {errorMessage && <div style={errorBoxStyle}>{errorMessage}</div>}
        {successMessage && <div style={successBoxStyle}>{successMessage}</div>}

        {loading ? (
          <div style={emptyStateStyle}>
            이용신청 목록을 불러오는 중입니다...
          </div>
        ) : filteredRequests.length === 0 ? (
          <div style={emptyStateStyle}>표시할 이용신청이 없습니다.</div>
        ) : (
          <div style={workAreaStyle}>
            <div style={requestListStyle}>
              {filteredRequests.map((request) => {
                const isSelected = selectedRequest?.id === request.id;

                return (
                  <button
                    key={request.id}
                    type="button"
                    style={
                      isSelected
                        ? selectedRequestListItemStyle
                        : requestListItemStyle
                    }
                    onClick={() => setSelectedRequestId(request.id)}
                  >
                    <div style={requestListHeaderStyle}>
                      <div style={requestListTitleWrapStyle}>
                        <strong style={requestListNameStyle}>
                          {request.name}
                        </strong>
                        <span style={statusBadgeStyle(request.status)}>
                          {getStatusLabel(request.status)}
                        </span>
                      </div>
                      <span style={requestListDateStyle}>
                        {formatDate(request.created_at)}
                      </span>
                    </div>

                    <div style={requestListMetaStyle}>
                      {request.organization_name} ·{" "}
                      {getRoleLabel(request.requested_role)}
                    </div>
                    <div style={requestListSubMetaStyle}>
                      {request.email} · {request.phone || "연락처 없음"}
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedRequest && (
              <section style={detailCardStyle}>
                <div style={detailHeaderStyle}>
                  <div>
                    <div style={nameLineStyle}>
                      <h3 style={detailTitleStyle}>{selectedRequest.name}</h3>
                      <span style={statusBadgeStyle(selectedRequest.status)}>
                        {getStatusLabel(selectedRequest.status)}
                      </span>
                      {!selectedRequest.auth_user_id && (
                        <span style={warningBadgeStyle}>계정 연결 필요</span>
                      )}
                    </div>
                    <p style={detailMetaStyle}>
                      {selectedRequest.email} ·{" "}
                      {selectedRequest.phone || "연락처 없음"}
                    </p>
                  </div>

                  <div style={detailDateStyle}>
                    <span>신청일</span>
                    <strong>
                      {formatDateTime(selectedRequest.created_at)}
                    </strong>
                  </div>
                </div>

                <div style={infoGridStyle}>
                  <InfoItem
                    label="소속 구분"
                    value={getOrganizationTypeLabel(
                      selectedRequest.organization_type,
                    )}
                  />
                  <InfoItem
                    label="소속대명"
                    value={selectedRequest.organization_name}
                  />
                  <InfoItem
                    label="신청 역할"
                    value={getRoleLabel(selectedRequest.requested_role)}
                  />
                  <InfoItem
                    label="처리일"
                    value={
                      selectedRequest.processed_at
                        ? formatDateTime(selectedRequest.processed_at)
                        : "-"
                    }
                  />
                </div>

                <div style={detailTwoColumnStyle}>
                  <ReadOnlyTextBox
                    label="신청 메모"
                    value={selectedRequest.note || "-"}
                    tone="info"
                  />
                  <ReadOnlyTextBox
                    label="처리 상태"
                    value={getStatusDescription(selectedRequest)}
                  />
                </div>

                {selectedRequest.status === "pending" ? (
                  <label style={memoLabelStyle}>
                    관리자 메모
                    <textarea
                      value={adminNotes[selectedRequest.id] ?? ""}
                      onChange={(event) =>
                        setAdminNotes((prev) => ({
                          ...prev,
                          [selectedRequest.id]: event.target.value,
                        }))
                      }
                      placeholder="승인 메모 또는 반려 사유를 입력하세요. 반려 시에는 반드시 사유가 필요합니다."
                      rows={4}
                      style={memoTextareaStyle}
                    />
                  </label>
                ) : (
                  <ReadOnlyTextBox
                    label={
                      selectedRequest.status === "rejected"
                        ? "반려 사유"
                        : "관리자 메모"
                    }
                    value={selectedRequest.admin_note || "-"}
                  />
                )}

                <div style={detailActionAreaStyle}>
                  {selectedRequest.status === "pending" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleApprove(selectedRequest)}
                        disabled={processingId === selectedRequest.id}
                        style={{
                          ...approveButtonStyle,
                          opacity:
                            processingId === selectedRequest.id ? 0.7 : 1,
                          cursor:
                            processingId === selectedRequest.id
                              ? "not-allowed"
                              : "pointer",
                        }}
                      >
                        {processingId === selectedRequest.id
                          ? "처리 중..."
                          : "승인"}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleReject(selectedRequest)}
                        disabled={processingId === selectedRequest.id}
                        style={{
                          ...rejectButtonStyle,
                          opacity:
                            processingId === selectedRequest.id ? 0.7 : 1,
                          cursor:
                            processingId === selectedRequest.id
                              ? "not-allowed"
                              : "pointer",
                        }}
                      >
                        반려
                      </button>
                    </>
                  ) : (
                    <div style={completedStatusStyle}>
                      {getStatusLabel(selectedRequest.status)} 처리된
                      신청입니다.
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        )}
      </section>

      <section style={approvedOrganizationPanelStyle}>
        <div style={toolbarStyle}>
          <div>
            <h2 style={sectionTitleStyle}>승인된 소속대 현황</h2>
            <p style={sectionDescriptionStyle}>
              소속대별 이용 상태, 관리자 지정 여부와 대원 등록 현황입니다.
            </p>
          </div>

          <input
            type="search"
            value={organizationKeyword}
            onChange={(event) => {
              setOrganizationKeyword(event.target.value);
              setSelectedOrganizationId(null);
            }}
            placeholder="소속대명, 대번호, 구분 검색"
            style={searchInputStyle}
          />
        </div>

        <div style={organizationFilterBarStyle}>
          <OrganizationFilterButton
            label="전체"
            value={organizationStatusCounts.all}
            active={organizationStatusFilter === "all"}
            onClick={() => handleChangeOrganizationStatusFilter("all")}
          />
          <OrganizationFilterButton
            label="이용중"
            value={organizationStatusCounts.active}
            active={organizationStatusFilter === "active"}
            tone="success"
            onClick={() => handleChangeOrganizationStatusFilter("active")}
          />
          <OrganizationFilterButton
            label="이용중지"
            value={organizationStatusCounts.suspended}
            active={organizationStatusFilter === "suspended"}
            tone="warning"
            onClick={() => handleChangeOrganizationStatusFilter("suspended")}
          />
          <OrganizationFilterButton
            label="이용종료"
            value={organizationStatusCounts.closed}
            active={organizationStatusFilter === "closed"}
            tone="muted"
            onClick={() => handleChangeOrganizationStatusFilter("closed")}
          />
          <OrganizationFilterButton
            label="정보 보완 필요"
            value={organizationStatusCounts.needsInfo}
            active={organizationStatusFilter === "needs_info"}
            tone="danger"
            onClick={() => handleChangeOrganizationStatusFilter("needs_info")}
          />
        </div>

        {loading ? (
          <div style={emptyStateStyle}>승인된 소속대 현황을 불러오는 중입니다...</div>
        ) : filteredOrganizations.length === 0 ? (
          <div style={emptyStateStyle}>표시할 소속대가 없습니다.</div>
        ) : (
          <>
            <div style={organizationTableWrapStyle}>
              <table style={organizationTableStyle}>
                <thead>
                  <tr>
                    <th style={organizationThStyle}>소속대</th>
                    <th style={organizationThCenterStyle}>대번호</th>
                    <th style={organizationThCenterStyle}>조직관리자</th>
                    <th style={organizationThCenterStyle}>지도자</th>
                    <th style={organizationThCenterStyle}>전체 대원</th>
                    <th style={organizationThCenterStyle}>활동 대원</th>
                    <th style={organizationThCenterStyle}>이용 상태</th>
                    <th style={organizationThCenterStyle}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrganizations.map((organization) => {
                    const isSelected = selectedOrganization?.id === organization.id;

                    return (
                      <tr
                        key={organization.id}
                        style={isSelected ? selectedOrganizationRowStyle : undefined}
                      >
                        <td style={organizationTdStrongStyle}>
                          {organization.name}
                        </td>
                        <td style={organizationTdCenterStyle}>
                          {organization.unitNumber || "-"}
                        </td>
                        <td style={organizationTdCenterStyle}>
                          {organization.adminCount}명
                        </td>
                        <td style={organizationTdCenterStyle}>
                          {organization.leaderCount}명
                        </td>
                        <td style={organizationTdCenterStyle}>
                          {organization.totalScoutCount}명
                        </td>
                        <td style={organizationTdCenterStyle}>
                          {organization.activeScoutCount}명
                        </td>
                        <td style={organizationTdCenterStyle}>
                          <span style={organizationStatusBadgeStyle(organization.status)}>
                            {organization.statusLabel}
                          </span>
                          {organization.needsInfo && (
                            <span style={organizationNeedsInfoBadgeStyle}>
                              정보 보완 필요
                            </span>
                          )}
                        </td>
                        <td style={organizationTdCenterStyle}>
                          <button
                            type="button"
                            style={tableActionButtonStyle}
                            onClick={() => setSelectedOrganizationId(organization.id)}
                          >
                            상태 관리
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {selectedOrganization && (
              <div style={organizationManageBoxStyle}>
                <div>
                  <strong style={organizationManageTitleStyle}>
                    {selectedOrganization.name}
                  </strong>
                  <p style={organizationManageDescriptionStyle}>
                    현재 상태: {selectedOrganization.statusLabel}
                    {selectedOrganization.needsInfo ? " · 정보 보완 필요" : ""}
                  </p>
                </div>

                <div style={organizationManageActionsStyle}>
                  {selectedOrganization.status === "active" ? (
                    <>
                      <button
                        type="button"
                        style={warningButtonStyle}
                        disabled={organizationProcessingId === selectedOrganization.id}
                        onClick={() =>
                          handleUpdateOrganizationStatus(
                            selectedOrganization,
                            "suspended",
                          )
                        }
                      >
                        이용중지
                      </button>
                      <button
                        type="button"
                        style={dangerButtonStyle}
                        disabled={organizationProcessingId === selectedOrganization.id}
                        onClick={() =>
                          handleUpdateOrganizationStatus(selectedOrganization, "closed")
                        }
                      >
                        이용종료
                      </button>
                    </>
                  ) : selectedOrganization.status === "closed" ? (
                    <button
                      type="button"
                      style={approveButtonStyle}
                      disabled={organizationProcessingId === selectedOrganization.id}
                      onClick={() =>
                        handleUpdateOrganizationStatus(selectedOrganization, "active")
                      }
                    >
                      이용재개
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        style={approveButtonStyle}
                        disabled={organizationProcessingId === selectedOrganization.id}
                        onClick={() =>
                          handleUpdateOrganizationStatus(selectedOrganization, "active")
                        }
                      >
                        이용재개
                      </button>
                      <button
                        type="button"
                        style={dangerButtonStyle}
                        disabled={organizationProcessingId === selectedOrganization.id}
                        onClick={() =>
                          handleUpdateOrganizationStatus(selectedOrganization, "closed")
                        }
                      >
                        이용종료
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = "default",
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone?: SummaryTone;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...summaryCardStyle,
        ...(active ? summaryCardActiveStyle : {}),
      }}
      aria-pressed={active}
    >
      <span style={summaryLabelStyle}>{label}</span>
      <strong style={summaryValueStyle(tone)}>{value}</strong>
      <span style={summaryActionTextStyle}>목록 보기</span>
    </button>
  );
}

function OrganizationFilterButton({
  label,
  value,
  tone = "default",
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone?: SummaryTone;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...organizationFilterButtonStyle,
        ...(active ? organizationFilterButtonActiveStyle : {}),
      }}
      aria-pressed={active}
    >
      <span>{label}</span>
      <strong style={organizationFilterValueStyle(tone)}>{value}</strong>
    </button>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoItemStyle}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ReadOnlyTextBox({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "info";
}) {
  return (
    <div style={tone === "info" ? readOnlyInfoBoxStyle : readOnlyBoxStyle}>
      <strong>{label}</strong>
      <p>{value}</p>
    </div>
  );
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

function getOrganizationUsageStatusLabel(status: string) {
  const statusMap: Record<string, string> = {
    active: "이용중",
    inactive: "이용중지",
    suspended: "이용중지",
    closed: "이용종료",
  };

  return statusMap[status] || status;
}

function isSuspendedOrganizationStatus(status: string) {
  return status === "suspended" || status === "inactive";
}

function isApprovedProfileStatus(status: string) {
  return status === "approved" || status === "active";
}

function getOrganizationTypeLabel(value: string) {
  if (value === "local") return "지역대";
  if (value === "school") return "학교대";
  return value;
}

function getRoleLabel(value: string) {
  if (value === "org_admin") return "대 관리자";
  if (value === "leader") return "지도자";
  if (value === "viewer") return "조회자";
  if (value === "super_admin") return "최고관리자";
  return value;
}

function getStatusLabel(value: string) {
  if (value === "pending") return "승인 대기";
  if (value === "approved") return "승인 완료";
  if (value === "rejected") return "반려";
  if (value === "suspended") return "이용 제한";
  return value;
}

function getFilterTitle(value: StatusFilter) {
  if (value === "all") return "전체 이용신청";
  if (value === "pending") return "승인 대기 신청";
  if (value === "approved") return "승인 완료 신청";
  if (value === "rejected") return "반려 신청";
  return "이용 제한 신청";
}

function getStatusDescription(request: SignupRequest) {
  if (request.status === "pending") {
    return "아직 승인 또는 반려 처리되지 않은 신청입니다.";
  }

  if (request.status === "approved") {
    return `승인 완료${request.processed_at ? ` · ${formatDateTime(request.processed_at)}` : ""}`;
  }

  if (request.status === "rejected") {
    return `반려 처리${request.processed_at ? ` · ${formatDateTime(request.processed_at)}` : ""}`;
  }

  if (request.status === "suspended") {
    return `이용 제한${request.processed_at ? ` · ${formatDateTime(request.processed_at)}` : ""}`;
  }

  return getStatusLabel(request.status);
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const pageHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "24px",
  marginBottom: "24px",
};

const roleBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "7px 11px",
  borderRadius: "999px",
  backgroundColor: "#dbeafe",
  color: "#1d4ed8",
  fontSize: "13px",
  fontWeight: 900,
  marginBottom: "10px",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: "32px",
  fontWeight: 900,
  color: "#0f172a",
};

const descriptionStyle: CSSProperties = {
  marginTop: "10px",
  marginBottom: 0,
  color: "#64748b",
  fontSize: "15px",
  lineHeight: 1.6,
};

const refreshButtonStyle: CSSProperties = {
  height: "42px",
  padding: "0 18px",
  borderRadius: "10px",
  border: "1px solid #cbd5e1",
  backgroundColor: "#ffffff",
  color: "#334155",
  fontWeight: 800,
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: "14px",
  marginBottom: "20px",
};

const summaryCardStyle: CSSProperties = {
  minHeight: "128px",
  backgroundColor: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "16px",
  padding: "18px",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.04)",
  textAlign: "left",
  cursor: "pointer",
  fontFamily: "inherit",
};

const summaryCardActiveStyle: CSSProperties = {
  border: "1px solid #2563eb",
  boxShadow: "0 0 0 3px rgba(37, 99, 235, 0.12)",
};

const summaryLabelStyle: CSSProperties = {
  display: "block",
  color: "#475569",
  fontSize: "14px",
  fontWeight: 800,
  marginBottom: "8px",
};

const summaryValueStyle = (tone: SummaryTone): CSSProperties => ({
  color:
    tone === "warning"
      ? "#d97706"
      : tone === "success"
        ? "#059669"
        : tone === "danger"
          ? "#dc2626"
          : tone === "muted"
            ? "#475569"
            : "#0f172a",
  fontSize: "30px",
  fontWeight: 900,
});

const summaryActionTextStyle: CSSProperties = {
  display: "block",
  marginTop: "14px",
  color: "#2563eb",
  fontSize: "13px",
  fontWeight: 900,
};

const panelStyle: CSSProperties = {
  backgroundColor: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "18px",
  padding: "22px",
  boxShadow: "0 12px 32px rgba(15, 23, 42, 0.05)",
};

const toolbarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "16px",
  alignItems: "flex-start",
  marginBottom: "18px",
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "22px",
  fontWeight: 900,
  color: "#0f172a",
};

const sectionDescriptionStyle: CSSProperties = {
  marginTop: "6px",
  marginBottom: 0,
  color: "#64748b",
  lineHeight: 1.5,
};

const searchInputStyle: CSSProperties = {
  width: "340px",
  maxWidth: "100%",
  height: "42px",
  borderRadius: "10px",
  border: "1px solid #cbd5e1",
  padding: "0 14px",
  fontSize: "14px",
  outline: "none",
};

const errorBoxStyle: CSSProperties = {
  padding: "14px 16px",
  borderRadius: "14px",
  backgroundColor: "#fef2f2",
  color: "#b91c1c",
  border: "1px solid #fecaca",
  fontSize: "14px",
  marginBottom: "16px",
};

const successBoxStyle: CSSProperties = {
  padding: "14px 16px",
  borderRadius: "14px",
  backgroundColor: "#ecfdf5",
  color: "#047857",
  border: "1px solid #a7f3d0",
  fontSize: "14px",
  marginBottom: "16px",
};

const emptyStateStyle: CSSProperties = {
  padding: "48px",
  textAlign: "center",
  color: "#64748b",
  backgroundColor: "#f8fafc",
  borderRadius: "16px",
  border: "1px dashed #cbd5e1",
};

const workAreaStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(320px, 0.85fr) minmax(520px, 1.4fr)",
  gap: "18px",
  alignItems: "start",
};

const requestListStyle: CSSProperties = {
  display: "grid",
  gap: "10px",
};

const requestListItemStyle: CSSProperties = {
  width: "100%",
  padding: "14px",
  borderRadius: "14px",
  border: "1px solid #e5e7eb",
  backgroundColor: "#ffffff",
  textAlign: "left",
  cursor: "pointer",
  fontFamily: "inherit",
};

const selectedRequestListItemStyle: CSSProperties = {
  ...requestListItemStyle,
  border: "1px solid #93c5fd",
  backgroundColor: "#eff6ff",
};

const requestListHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "10px",
  alignItems: "flex-start",
  marginBottom: "8px",
};

const requestListTitleWrapStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "7px",
  flexWrap: "wrap",
};

const requestListNameStyle: CSSProperties = {
  color: "#0f172a",
  fontSize: "16px",
};

const requestListDateStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "12px",
  whiteSpace: "nowrap",
};

const requestListMetaStyle: CSSProperties = {
  color: "#334155",
  fontSize: "14px",
  fontWeight: 800,
  marginBottom: "5px",
};

const requestListSubMetaStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "13px",
};

const detailCardStyle: CSSProperties = {
  border: "1px solid #dbeafe",
  borderRadius: "16px",
  backgroundColor: "#ffffff",
  padding: "20px",
};

const detailHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "16px",
  marginBottom: "18px",
};

const nameLineStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "8px",
};

const detailTitleStyle: CSSProperties = {
  margin: 0,
  color: "#0f172a",
  fontSize: "22px",
  fontWeight: 900,
};

const detailMetaStyle: CSSProperties = {
  marginTop: "8px",
  marginBottom: 0,
  color: "#64748b",
  fontSize: "14px",
};

const detailDateStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: "4px",
  color: "#64748b",
  fontSize: "13px",
  whiteSpace: "nowrap",
};

const infoGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "12px",
  marginBottom: "14px",
};

const infoItemStyle: CSSProperties = {
  padding: "12px",
  borderRadius: "12px",
  backgroundColor: "#f8fafc",
  border: "1px solid #e2e8f0",
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  color: "#64748b",
  fontSize: "13px",
};

const detailTwoColumnStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "12px",
  marginBottom: "14px",
};

const readOnlyBoxStyle: CSSProperties = {
  padding: "14px",
  borderRadius: "14px",
  backgroundColor: "#f8fafc",
  border: "1px solid #e2e8f0",
  color: "#334155",
  fontSize: "14px",
  lineHeight: 1.6,
};

const readOnlyInfoBoxStyle: CSSProperties = {
  ...readOnlyBoxStyle,
  backgroundColor: "#eff6ff",
  border: "1px solid #bfdbfe",
  color: "#1e3a8a",
};

const memoLabelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  color: "#334155",
  fontSize: "14px",
  fontWeight: 800,
};

const memoTextareaStyle: CSSProperties = {
  width: "100%",
  borderRadius: "12px",
  border: "1px solid #cbd5e1",
  padding: "12px",
  fontSize: "14px",
  lineHeight: "1.5",
  resize: "vertical",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const detailActionAreaStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: "10px",
  marginTop: "16px",
};

const approveButtonStyle: CSSProperties = {
  minWidth: "96px",
  height: "42px",
  border: "none",
  borderRadius: "10px",
  backgroundColor: "#2563eb",
  color: "#ffffff",
  fontWeight: 900,
};

const rejectButtonStyle: CSSProperties = {
  minWidth: "96px",
  height: "42px",
  border: "none",
  borderRadius: "10px",
  backgroundColor: "#ef4444",
  color: "#ffffff",
  fontWeight: 900,
};

const completedStatusStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: "12px",
  backgroundColor: "#f8fafc",
  border: "1px solid #e2e8f0",
  color: "#64748b",
  fontSize: "14px",
  fontWeight: 800,
};

const warningBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 8px",
  borderRadius: "999px",
  backgroundColor: "#fef2f2",
  color: "#b91c1c",
  fontSize: "12px",
  fontWeight: 900,
};

const approvedOrganizationPanelStyle: CSSProperties = {
  ...panelStyle,
  marginTop: "24px",
};

const organizationFilterBarStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "10px",
  marginBottom: "16px",
};

const organizationFilterButtonStyle: CSSProperties = {
  minHeight: "40px",
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  border: "1px solid #cbd5e1",
  borderRadius: "999px",
  backgroundColor: "#ffffff",
  color: "#334155",
  padding: "0 14px",
  fontWeight: 900,
  fontFamily: "inherit",
  cursor: "pointer",
};

const organizationFilterButtonActiveStyle: CSSProperties = {
  border: "1px solid #2563eb",
  backgroundColor: "#eff6ff",
  color: "#1d4ed8",
  boxShadow: "0 0 0 3px rgba(37, 99, 235, 0.1)",
};

const organizationFilterValueStyle = (tone: SummaryTone): CSSProperties => ({
  color:
    tone === "success"
      ? "#059669"
      : tone === "warning"
        ? "#d97706"
        : tone === "danger"
          ? "#dc2626"
          : tone === "muted"
            ? "#475569"
            : "#0f172a",
});

const organizationTableWrapStyle: CSSProperties = {
  overflowX: "auto",
  border: "1px solid #e5e7eb",
  borderRadius: "14px",
};

const organizationTableStyle: CSSProperties = {
  width: "100%",
  minWidth: "960px",
  borderCollapse: "collapse",
  fontSize: "14px",
};

const organizationThStyle: CSSProperties = {
  padding: "13px 14px",
  backgroundColor: "#f8fafc",
  borderBottom: "1px solid #e5e7eb",
  color: "#334155",
  textAlign: "left",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const organizationThCenterStyle: CSSProperties = {
  ...organizationThStyle,
  textAlign: "center",
};

const organizationTdStrongStyle: CSSProperties = {
  padding: "13px 14px",
  borderBottom: "1px solid #e5e7eb",
  color: "#0f172a",
  fontWeight: 800,
};

const organizationTdCenterStyle: CSSProperties = {
  padding: "13px 14px",
  borderBottom: "1px solid #e5e7eb",
  color: "#334155",
  textAlign: "center",
  whiteSpace: "nowrap",
};

const selectedOrganizationRowStyle: CSSProperties = {
  backgroundColor: "#eff6ff",
};

const organizationNeedsInfoBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  marginLeft: "6px",
  padding: "4px 8px",
  borderRadius: "999px",
  backgroundColor: "#fff7ed",
  color: "#c2410c",
  fontSize: "12px",
  fontWeight: 900,
};

const tableActionButtonStyle: CSSProperties = {
  border: "none",
  backgroundColor: "transparent",
  color: "#2563eb",
  fontWeight: 900,
  cursor: "pointer",
  fontFamily: "inherit",
};

const organizationManageBoxStyle: CSSProperties = {
  marginTop: "16px",
  padding: "16px",
  borderRadius: "14px",
  border: "1px solid #bfdbfe",
  backgroundColor: "#eff6ff",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "16px",
  flexWrap: "wrap",
};

const organizationManageTitleStyle: CSSProperties = {
  display: "block",
  color: "#0f172a",
  fontSize: "16px",
  marginBottom: "4px",
};

const organizationManageDescriptionStyle: CSSProperties = {
  margin: 0,
  color: "#475569",
  fontSize: "14px",
};

const organizationManageActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  flexWrap: "wrap",
};

const warningButtonStyle: CSSProperties = {
  minWidth: "96px",
  height: "42px",
  border: "none",
  borderRadius: "10px",
  backgroundColor: "#f59e0b",
  color: "#ffffff",
  fontWeight: 900,
  cursor: "pointer",
};

const dangerButtonStyle: CSSProperties = {
  minWidth: "96px",
  height: "42px",
  border: "none",
  borderRadius: "10px",
  backgroundColor: "#ef4444",
  color: "#ffffff",
  fontWeight: 900,
  cursor: "pointer",
};

const organizationStatusBadgeStyle = (status: string): CSSProperties => {
  const styleMap: Record<string, CSSProperties> = {
    active: {
      backgroundColor: "#dcfce7",
      color: "#166534",
    },
    inactive: {
      backgroundColor: "#fef3c7",
      color: "#92400e",
    },
    suspended: {
      backgroundColor: "#fef3c7",
      color: "#92400e",
    },
    closed: {
      backgroundColor: "#e2e8f0",
      color: "#334155",
    },
  };

  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 900,
    ...(styleMap[status] ?? {
      backgroundColor: "#e2e8f0",
      color: "#334155",
    }),
  };
};

const statusBadgeStyle = (status: string): CSSProperties => {
  const styleMap: Record<string, CSSProperties> = {
    pending: {
      backgroundColor: "#fef3c7",
      color: "#92400e",
    },
    approved: {
      backgroundColor: "#dcfce7",
      color: "#166534",
    },
    rejected: {
      backgroundColor: "#fee2e2",
      color: "#991b1b",
    },
    suspended: {
      backgroundColor: "#e2e8f0",
      color: "#334155",
    },
  };

  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 900,
    ...(styleMap[status] ?? {
      backgroundColor: "#e2e8f0",
      color: "#334155",
    }),
  };
};
