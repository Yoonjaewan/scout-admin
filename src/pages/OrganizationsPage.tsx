import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "../lib/supabase";

type OrganizationStatus = "active" | "suspended" | "closed" | "inactive" | string;
type OrganizationStatusFilter = "all" | "active" | "suspended" | "closed";

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
  createdAt: string | null;
  updatedAt: string | null;
  adminCount: number;
  leaderCount: number;
  viewerCount: number;
  totalScoutCount: number;
  activeScoutCount: number;
};

type SummaryTone = "default" | "success" | "warning" | "danger" | "muted";

function getStringValue(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function getOrganizationTypeLabel(value: string | null) {
  if (value === "local") return "지역대";
  if (value === "school") return "학교대";
  return value || "-";
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

function isSuspendedStatus(status: string) {
  return status === "suspended" || status === "inactive";
}

function isApprovedProfileStatus(status: string) {
  return status === "approved" || status === "active";
}

function formatDate(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<OrganizationItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<OrganizationStatusFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadData = async (options?: { keepMessage?: boolean }) => {
    setLoading(true);
    setErrorMessage("");

    if (!options?.keepMessage) {
      setSuccessMessage("");
    }

    const [organizationResult, profileResult, scoutResult] = await Promise.all([
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

    if (organizationResult.error) {
      console.error("소속대 목록 조회 오류:", organizationResult.error.message);
      setErrorMessage("소속대 목록을 불러오지 못했습니다.");
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

    const profileRows = ((profileResult.data ?? []) as unknown as Record<string, unknown>[])
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

    const scoutRows = ((scoutResult.data ?? []) as unknown as Record<string, unknown>[])
      .map((row) => ({
        id: getStringValue(row, ["id"]) || "",
        organizationId: getStringValue(row, ["organization_id"]) || "",
        status: getStringValue(row, ["status"]) || "active",
      }))
      .filter((scout) => scout.id && scout.organizationId);

    const organizationRows = ((organizationResult.data ?? []) as unknown as Record<string, unknown>[])
      .map((row) => {
        const id = getStringValue(row, ["id"]) || "";
        const status = getOrganizationStatus(row);
        const organizationProfiles = profileRows.filter(
          (profile) =>
            profile.organizationId === id && isApprovedProfileStatus(profile.status),
        );
        const organizationScouts = scoutRows.filter(
          (scout) => scout.organizationId === id,
        );

        return {
          id,
          name: getStringValue(row, ["name"]) || "소속대명 미등록",
          type: getStringValue(row, ["type"]),
          typeLabel: getOrganizationTypeLabel(getStringValue(row, ["type"])),
          unitNumber: getStringValue(row, ["unit_number"]),
          region: getStringValue(row, ["region"]),
          description: getStringValue(row, ["description"]),
          status,
          statusLabel: getOrganizationStatusLabel(status),
          createdAt: getStringValue(row, ["created_at"]),
          updatedAt: getStringValue(row, ["updated_at"]),
          adminCount: organizationProfiles.filter((profile) => profile.role === "org_admin").length,
          leaderCount: organizationProfiles.filter((profile) => profile.role === "leader").length,
          viewerCount: organizationProfiles.filter((profile) => profile.role === "viewer").length,
          totalScoutCount: organizationScouts.length,
          activeScoutCount: organizationScouts.filter((scout) => scout.status === "active").length,
        };
      })
      .filter(
        (organization) =>
          organization.id && approvedOrganizationIds.has(organization.id),
      )
      .sort((left, right) => left.name.localeCompare(right.name, "ko"));

    setOrganizations(organizationRows);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const statusCounts = useMemo(() => {
    return {
      all: organizations.length,
      active: organizations.filter((organization) => organization.status === "active").length,
      suspended: organizations.filter((organization) =>
        isSuspendedStatus(organization.status),
      ).length,
      closed: organizations.filter((organization) => organization.status === "closed").length,
    };
  }, [organizations]);

  const filteredOrganizations = useMemo(() => {
    const cleanKeyword = keyword.trim().toLowerCase();

    return organizations.filter((organization) => {
      const statusMatched =
        statusFilter === "all" ||
        (statusFilter === "active" && organization.status === "active") ||
        (statusFilter === "suspended" && isSuspendedStatus(organization.status)) ||
        (statusFilter === "closed" && organization.status === "closed");

      if (!statusMatched) return false;

      if (!cleanKeyword) return true;

      const targetText = [
        organization.name,
        organization.unitNumber,
        organization.typeLabel,
        organization.region,
        organization.description,
        organization.statusLabel,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return targetText.includes(cleanKeyword);
    });
  }, [keyword, organizations, statusFilter]);

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

  const handleChangeStatusFilter = (nextStatus: OrganizationStatusFilter) => {
    setStatusFilter(nextStatus);
    setSelectedOrganizationId(null);
    setErrorMessage("");
    setSuccessMessage("");
  };

  const handleUpdateStatus = async (
    organization: OrganizationItem,
    nextStatus: "active" | "suspended" | "closed",
  ) => {
    const nextStatusLabel = getOrganizationStatusLabel(nextStatus);
    const confirmMessage = [
      `${organization.name}의 이용 상태를 '${nextStatusLabel}' 상태로 변경합니다.`,
      "",
      nextStatus === "active"
        ? "소속대 사용자가 다시 업무 화면을 사용할 수 있습니다."
        : "기존 기록은 보존되며, 해당 소속대 사용자는 업무 화면을 사용할 수 없습니다.",
      "",
      "계속 진행하시겠습니까?",
    ].join("\n");

    if (nextStatus === "closed") {
      const { data: providedBackup, error: backupCheckError } = await supabase
        .from("organization_backup_logs")
        .select("id, provided_at")
        .eq("organization_id", organization.id)
        .eq("backup_type", "business_excel")
        .not("provided_at", "is", null)
        .is("deleted_at", null)
        .order("provided_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (backupCheckError) {
        setErrorMessage(
          `이용종료 전 백업 제공 여부를 확인하지 못했습니다. 백업센터 SQL 적용 여부를 확인하세요. ${backupCheckError.message}`,
        );
        return;
      }

      if (!providedBackup) {
        setErrorMessage(
          `${organization.name}의 업무용 Excel 제공 완료 기록이 없습니다. 소속대 백업센터에서 업무용 Excel을 생성·전달한 뒤 '제공 완료'로 처리하세요.`,
        );
        return;
      }
    }

    if (!window.confirm(confirmMessage)) return;

    setProcessingId(organization.id);
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
      setProcessingId(null);
      return;
    }

    await loadData({ keepMessage: true });
    setSuccessMessage(`${organization.name}의 이용 상태를 '${nextStatusLabel}' 상태로 변경했습니다.`);
    setProcessingId(null);
  };

  return (
    <div>
      <header style={pageHeaderStyle}>
        <div>
          <div style={roleBadgeStyle}>최고관리자</div>
          <h1 style={titleStyle}>소속대 관리</h1>
          <p style={descriptionStyle}>
            승인된 소속대의 이용 상태를 관리합니다. 이용중지 또는 이용종료 상태에서도 기존 기록은 보존됩니다.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadData()}
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
          label="전체 소속대"
          value={statusCounts.all}
          active={statusFilter === "all"}
          onClick={() => handleChangeStatusFilter("all")}
        />
        <SummaryCard
          label="이용중"
          value={statusCounts.active}
          tone="success"
          active={statusFilter === "active"}
          onClick={() => handleChangeStatusFilter("active")}
        />
        <SummaryCard
          label="이용중지"
          value={statusCounts.suspended}
          tone="warning"
          active={statusFilter === "suspended"}
          onClick={() => handleChangeStatusFilter("suspended")}
        />
        <SummaryCard
          label="이용종료"
          value={statusCounts.closed}
          tone="muted"
          active={statusFilter === "closed"}
          onClick={() => handleChangeStatusFilter("closed")}
        />
      </section>

      <section style={noticeBoxStyle}>
        <strong>운영 기준</strong>
        <span>
          소속대 사용을 중단할 때는 삭제하지 않고 이용중지 또는 이용종료로 전환합니다. 대원, 진급, 기능장, 프로그램 이수, 출석 기록은 계속 보존됩니다.
        </span>
      </section>

      <section style={panelStyle}>
        <div style={toolbarStyle}>
          <div>
            <h2 style={sectionTitleStyle}>{getFilterTitle(statusFilter)}</h2>
            <p style={sectionDescriptionStyle}>
              목록에서 소속대를 선택하면 상세 정보와 상태 변경 버튼을 확인할 수 있습니다.
            </p>
          </div>

          <input
            type="search"
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value);
              setSelectedOrganizationId(null);
            }}
            placeholder="소속대명, 대번호, 구분 검색"
            style={searchInputStyle}
          />
        </div>

        {errorMessage && <div style={errorBoxStyle}>{errorMessage}</div>}
        {successMessage && <div style={successBoxStyle}>{successMessage}</div>}

        {loading ? (
          <div style={emptyStateStyle}>소속대 목록을 불러오는 중입니다...</div>
        ) : errorMessage ? null : filteredOrganizations.length === 0 ? (
          <div style={emptyStateStyle}>표시할 소속대가 없습니다.</div>
        ) : (
          <div style={workAreaStyle}>
            <div style={organizationListStyle}>
              {filteredOrganizations.map((organization) => {
                const isSelected = selectedOrganization?.id === organization.id;

                return (
                  <button
                    key={organization.id}
                    type="button"
                    style={
                      isSelected
                        ? selectedOrganizationListItemStyle
                        : organizationListItemStyle
                    }
                    onClick={() => setSelectedOrganizationId(organization.id)}
                  >
                    <div style={listItemHeaderStyle}>
                      <strong style={listItemTitleStyle}>{organization.name}</strong>
                      <span style={statusBadgeStyle(organization.status)}>
                        {organization.statusLabel}
                      </span>
                    </div>
                    <div style={listItemMetaStyle}>
                      {organization.typeLabel} · 대번호 {organization.unitNumber || "미등록"}
                    </div>
                    <div style={listItemSubMetaStyle}>
                      조직관리자 {organization.adminCount}명 · 활동 대원 {organization.activeScoutCount}명
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedOrganization && (
              <section style={detailCardStyle}>
                <div style={detailHeaderStyle}>
                  <div>
                    <div style={detailTitleLineStyle}>
                      <h3 style={detailTitleStyle}>{selectedOrganization.name}</h3>
                      <span style={statusBadgeStyle(selectedOrganization.status)}>
                        {selectedOrganization.statusLabel}
                      </span>
                    </div>
                    <p style={detailMetaStyle}>
                      {selectedOrganization.typeLabel} · 대번호 {selectedOrganization.unitNumber || "미등록"}
                    </p>
                  </div>

                  <div style={detailDateStyle}>
                    <span>등록일</span>
                    <strong>{formatDate(selectedOrganization.createdAt)}</strong>
                  </div>
                </div>

                <div style={infoGridStyle}>
                  <InfoItem label="소속대명" value={selectedOrganization.name} />
                  <InfoItem label="대번호" value={selectedOrganization.unitNumber || "-"} />
                  <InfoItem label="소속 구분" value={selectedOrganization.typeLabel} />
                  <InfoItem label="운영 상태" value={selectedOrganization.statusLabel} />
                  <InfoItem label="조직관리자" value={`${selectedOrganization.adminCount}명`} />
                  <InfoItem label="지도자" value={`${selectedOrganization.leaderCount}명`} />
                  <InfoItem label="조회자" value={`${selectedOrganization.viewerCount}명`} />
                  <InfoItem label="전체 대원" value={`${selectedOrganization.totalScoutCount}명`} />
                  <InfoItem label="활동 대원" value={`${selectedOrganization.activeScoutCount}명`} />
                </div>

                <div style={readOnlyBoxStyle}>
                  <strong>상태 변경 안내</strong>
                  <p>
                    이용중지는 일시적인 사용 제한에 적합합니다. 이용종료는 백업센터에서 백업 제공 완료 처리 후에만 가능합니다. 두 경우 모두 기존 기록은 삭제되지 않습니다.
                  </p>
                </div>

                <div style={detailActionAreaStyle}>
                  {selectedOrganization.status === "active" ? (
                    <>
                      <button
                        type="button"
                        style={warningButtonStyle}
                        disabled={processingId === selectedOrganization.id}
                        onClick={() => handleUpdateStatus(selectedOrganization, "suspended")}
                      >
                        이용중지
                      </button>
                      <button
                        type="button"
                        style={dangerButtonStyle}
                        disabled={processingId === selectedOrganization.id}
                        onClick={() => handleUpdateStatus(selectedOrganization, "closed")}
                      >
                        이용종료
                      </button>
                    </>
                  ) : selectedOrganization.status === "closed" ? (
                    <button
                      type="button"
                      style={approveButtonStyle}
                      disabled={processingId === selectedOrganization.id}
                      onClick={() => handleUpdateStatus(selectedOrganization, "active")}
                    >
                      이용재개
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        style={approveButtonStyle}
                        disabled={processingId === selectedOrganization.id}
                        onClick={() => handleUpdateStatus(selectedOrganization, "active")}
                      >
                        이용재개
                      </button>
                      <button
                        type="button"
                        style={dangerButtonStyle}
                        disabled={processingId === selectedOrganization.id}
                        onClick={() => handleUpdateStatus(selectedOrganization, "closed")}
                      >
                        이용종료
                      </button>
                    </>
                  )}
                </div>
              </section>
            )}
          </div>
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

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoItemStyle}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function getFilterTitle(value: OrganizationStatusFilter) {
  if (value === "all") return "전체 소속대";
  if (value === "active") return "이용중 소속대";
  if (value === "suspended") return "이용중지 소속대";
  return "이용종료 소속대";
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
    tone === "success"
      ? "#059669"
      : tone === "warning"
        ? "#d97706"
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

const noticeBoxStyle: CSSProperties = {
  display: "flex",
  gap: "10px",
  alignItems: "center",
  border: "1px solid #bfdbfe",
  borderRadius: "12px",
  padding: "12px 14px",
  backgroundColor: "#eff6ff",
  color: "#1e3a8a",
  fontSize: "14px",
  lineHeight: 1.5,
  marginBottom: "20px",
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

const organizationListStyle: CSSProperties = {
  display: "grid",
  gap: "10px",
};

const organizationListItemStyle: CSSProperties = {
  width: "100%",
  padding: "14px",
  borderRadius: "14px",
  border: "1px solid #e5e7eb",
  backgroundColor: "#ffffff",
  textAlign: "left",
  cursor: "pointer",
  fontFamily: "inherit",
};

const selectedOrganizationListItemStyle: CSSProperties = {
  ...organizationListItemStyle,
  border: "1px solid #93c5fd",
  backgroundColor: "#eff6ff",
};

const listItemHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "10px",
  alignItems: "flex-start",
  marginBottom: "8px",
};

const listItemTitleStyle: CSSProperties = {
  color: "#0f172a",
  fontSize: "16px",
};

const listItemMetaStyle: CSSProperties = {
  color: "#334155",
  fontSize: "14px",
  fontWeight: 800,
  marginBottom: "5px",
};

const listItemSubMetaStyle: CSSProperties = {
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

const detailTitleLineStyle: CSSProperties = {
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
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
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

const readOnlyBoxStyle: CSSProperties = {
  padding: "14px",
  borderRadius: "14px",
  backgroundColor: "#f8fafc",
  border: "1px solid #e2e8f0",
  color: "#334155",
  fontSize: "14px",
  lineHeight: 1.6,
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
  cursor: "pointer",
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

const statusBadgeStyle = (status: string): CSSProperties => {
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
