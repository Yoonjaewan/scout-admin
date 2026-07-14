import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "../lib/supabase";

type UserRole = "org_admin" | "leader" | "viewer";
type Organization = { id: string; name: string; unit_number: string | null; status: string };
type TestUser = {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: string;
  expiresAt: string | null;
  createdAt: string | null;
  mustChangePassword?: boolean;
  status?: string;
};
type CreatedCredential = TestUser & { password: string };
type ResetFailure = { userId: string; message: string };

type FunctionResponse = {
  ok?: boolean;
  message?: string;
  users?: TestUser[];
  credentials?: CreatedCredential[];
  failures?: ResetFailure[];
};

const ROLE_LABELS: Record<UserRole, string> = {
  org_admin: "조직관리자",
  leader: "지도자",
  viewer: "조회전용",
};

export default function UserManagementPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [role, setRole] = useState<UserRole>("leader");
  const [count, setCount] = useState(1);
  const [expiryDays, setExpiryDays] = useState(14);
  const [users, setUsers] = useState<TestUser[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [createdCredentials, setCreatedCredentials] = useState<CreatedCredential[]>([]);
  const [credentialPanelTitle, setCredentialPanelTitle] = useState("이번에 발급한 계정");
  const [loadingOrganizations, setLoadingOrganizations] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const selectedOrganization = useMemo(
    () => organizations.find((item) => item.id === selectedOrganizationId) ?? null,
    [organizations, selectedOrganizationId],
  );

  const invokeFunction = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke<FunctionResponse>(
      "manage-test-users",
      { body },
    );

    if (error) {
      let detailMessage = error.message;

      const response = (error as { context?: Response }).context;
      if (response) {
        try {
          const errorBody = (await response.clone().json()) as {
            message?: string;
            error?: string;
          };
          detailMessage =
            errorBody.message ||
            errorBody.error ||
            detailMessage;
        } catch {
          // 응답 본문이 JSON이 아니면 SDK 오류 문구를 사용합니다.
        }
      }

      throw new Error(detailMessage);
    }

    if (!data?.ok) {
      throw new Error(data?.message || "요청을 처리하지 못했습니다.");
    }

    return data;
  }, []);

  const loadOrganizations = useCallback(async () => {
    setLoadingOrganizations(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("organizations")
      .select("id, name, unit_number, status")
      .is("deleted_at", null)
      .order("name", { ascending: true });

    if (error) {
      setErrorMessage(`소속대 목록을 불러오지 못했습니다. ${error.message}`);
      setLoadingOrganizations(false);
      return;
    }

    const rows = (data ?? []) as Organization[];
    setOrganizations(rows);
    setSelectedOrganizationId((current) => current || rows.find((row) => row.status === "active")?.id || rows[0]?.id || "");
    setLoadingOrganizations(false);
  }, []);

  const loadUsers = useCallback(async () => {
    if (!selectedOrganizationId) {
      setUsers([]);
      return;
    }

    setLoadingUsers(true);
    setErrorMessage("");
    try {
      const data = await invokeFunction({
        action: "list",
        organization_id: selectedOrganizationId,
      });
      setUsers(data.users ?? []);
      setSelectedUserIds([]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "테스트 계정 목록을 불러오지 못했습니다.");
    } finally {
      setLoadingUsers(false);
    }
  }, [invokeFunction, selectedOrganizationId]);

  useEffect(() => {
    void loadOrganizations();
  }, [loadOrganizations]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleCreate = async () => {
    if (!selectedOrganizationId) {
      setErrorMessage("소속대를 선택하세요.");
      return;
    }

    const confirmed = window.confirm(
      `${selectedOrganization?.name ?? "선택한 소속대"}에 ${ROLE_LABELS[role]} 테스트 계정 ${count}개를 생성하시겠습니까?`,
    );
    if (!confirmed) return;

    setProcessing(true);
    setErrorMessage("");
    setSuccessMessage("");
    setCreatedCredentials([]);
    setCredentialPanelTitle("이번에 발급한 계정");

    try {
      const data = await invokeFunction({
        action: "create",
        organization_id: selectedOrganizationId,
        role,
        count,
        expiry_days: expiryDays,
      });
      const credentials = data.credentials ?? [];
      setCreatedCredentials(credentials);
      setSuccessMessage(`${credentials.length}개의 테스트 계정을 생성했습니다.`);
      await loadUsers();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "테스트 계정을 생성하지 못했습니다.");
    } finally {
      setProcessing(false);
    }
  };

  const handleResetPassword = async () => {
    if (selectedUserIds.length === 0) {
      setErrorMessage("비밀번호를 초기화할 테스트 계정을 선택하세요.");
      return;
    }

    const confirmed = window.confirm(
      `선택한 테스트 계정 ${selectedUserIds.length}개의 비밀번호를 초기화하시겠습니까?\n초기화된 계정은 다음 로그인 시 비밀번호 변경이 필요합니다.`,
    );
    if (!confirmed) return;

    setProcessing(true);
    setErrorMessage("");
    setSuccessMessage("");
    setCreatedCredentials([]);
    setCredentialPanelTitle("이번에 초기화한 계정");

    try {
      const data = await invokeFunction({
        action: "reset_password",
        user_ids: selectedUserIds,
      });
      const credentials = data.credentials ?? [];
      const failures = data.failures ?? [];

      setCreatedCredentials(credentials);
      setSuccessMessage(
        data.message ||
          `${credentials.length}개의 테스트 계정 비밀번호를 초기화했습니다.`,
      );

      if (failures.length > 0) {
        setErrorMessage(
          failures
            .map((failure) => `${failure.userId}: ${failure.message}`)
            .join("\n"),
        );
      }

      await loadUsers();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "테스트 계정 비밀번호를 초기화하지 못했습니다.",
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (selectedUserIds.length === 0) {
      setErrorMessage("삭제할 테스트 계정을 선택하세요.");
      return;
    }

    if (!window.confirm(`선택한 테스트 계정 ${selectedUserIds.length}개를 삭제하시겠습니까?`)) return;

    setProcessing(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      await invokeFunction({ action: "delete", user_ids: selectedUserIds });
      setSuccessMessage(`${selectedUserIds.length}개의 테스트 계정을 삭제했습니다.`);
      setCreatedCredentials([]);
      await loadUsers();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "테스트 계정을 삭제하지 못했습니다.");
    } finally {
      setProcessing(false);
    }
  };

  const copyCreatedCredentials = async () => {
    if (createdCredentials.length === 0) return;
    const text = createdCredentials
      .map((item, index) => [
        `${index + 1}. ${item.name}`,
        `아이디: ${item.email}`,
        `비밀번호: ${item.password}`,
        `권한: ${ROLE_LABELS[item.role]}`,
        `사용기한: ${formatDate(item.expiresAt)}`,
      ].join("\n"))
      .join("\n\n");

    try {
      await navigator.clipboard.writeText(text);
      setSuccessMessage("계정 정보를 클립보드에 복사했습니다.");
    } catch {
      setErrorMessage("클립보드 복사에 실패했습니다. 계정 정보를 직접 복사하세요.");
    }
  };

  const getAccountStatusLabel = (user: TestUser) => {
    if (user.expiresAt) {
      const expiresAt = new Date(user.expiresAt);
      if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
        return "만료됨";
      }
    }

    if (user.mustChangePassword === true) {
      return "비밀번호 변경 필요";
    }

    return "사용중";
  };

  const getAccountStatusStyle = (label: string): CSSProperties => {
    if (label === "만료됨") {
      return { ...statusBadgeStyle, backgroundColor: "#fee2e2", color: "#b91c1c" };
    }
    if (label === "비밀번호 변경 필요") {
      return { ...statusBadgeStyle, backgroundColor: "#fef3c7", color: "#92400e" };
    }
    return { ...statusBadgeStyle, backgroundColor: "#dcfce7", color: "#166534" };
  };

  const toggleUser = (userId: string) => {
    setSelectedUserIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );
  };

  return (
    <div>
      <header style={pageHeaderStyle}>
        <div>
          <div style={roleBadgeStyle}>최고관리자</div>
          <h1 style={titleStyle}>사용자 관리</h1>
          <p style={descriptionStyle}>소속대별 테스트 계정을 생성하고 회수합니다.</p>
        </div>
        <button type="button" onClick={() => void loadOrganizations()} style={secondaryButtonStyle}>
          새로고침
        </button>
      </header>

      {errorMessage ? <div style={errorBoxStyle}>{errorMessage}</div> : null}
      {successMessage ? <div style={successBoxStyle}>{successMessage}</div> : null}

      <section style={panelStyle}>
        <div style={sectionHeaderStyle}>
          <h2 style={sectionTitleStyle}>테스트 계정 발급</h2>
          <p style={sectionDescriptionStyle}>이용중인 소속대에 필요한 권한과 수량을 선택해 계정을 생성합니다.</p>
        </div>

        <div style={formGridStyle}>
          <label style={labelStyle}>
            소속대
            <select
              value={selectedOrganizationId}
              onChange={(event) => {
                setSelectedOrganizationId(event.target.value);
                setCreatedCredentials([]);
                setCredentialPanelTitle("이번에 발급한 계정");
              }}
              disabled={loadingOrganizations || processing}
              style={inputStyle}
            >
              <option value="">소속대 선택</option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}{organization.unit_number ? ` · ${organization.unit_number}` : ""}{organization.status !== "active" ? " · 이용중 아님" : ""}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            권한
            <select value={role} onChange={(event) => setRole(event.target.value as UserRole)} style={inputStyle} disabled={processing}>
              <option value="leader">지도자</option>
              <option value="viewer">조회전용</option>
              <option value="org_admin">조직관리자</option>
            </select>
          </label>

          <label style={labelStyle}>
            생성 수량
            <select value={count} onChange={(event) => setCount(Number(event.target.value))} style={inputStyle} disabled={processing}>
              <option value={1}>1명</option>
              <option value={3}>3명</option>
              <option value={5}>5명</option>
            </select>
          </label>

          <label style={labelStyle}>
            사용 기간
            <select value={expiryDays} onChange={(event) => setExpiryDays(Number(event.target.value))} style={inputStyle} disabled={processing}>
              <option value={7}>7일</option>
              <option value={14}>14일</option>
              <option value={30}>30일</option>
            </select>
          </label>
        </div>

        <div style={actionRowStyle}>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={processing || !selectedOrganizationId || selectedOrganization?.status !== "active"}
            style={primaryButtonStyle}
          >
            {processing ? "처리 중..." : "테스트 계정 생성"}
          </button>
        </div>
      </section>

      {createdCredentials.length > 0 ? (
        <section style={credentialPanelStyle}>
          <div style={credentialHeaderStyle}>
            <div>
              <h2 style={sectionTitleStyle}>{credentialPanelTitle}</h2>
              <p style={sectionDescriptionStyle}>임시 비밀번호는 이 화면을 벗어나면 다시 확인할 수 없습니다.</p>
            </div>
            <button type="button" onClick={() => void copyCreatedCredentials()} style={copyButtonStyle}>계정 정보 복사</button>
          </div>
          <div style={credentialGridStyle}>
            {createdCredentials.map((item) => (
              <article key={item.userId} style={credentialCardStyle}>
                <strong>{item.name}</strong>
                <span>아이디: {item.email}</span>
                <span>비밀번호: <b>{item.password}</b></span>
                <span>권한: {ROLE_LABELS[item.role]}</span>
                <span>사용기한: {formatDate(item.expiresAt)}</span>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section style={panelStyle}>
        <div style={credentialHeaderStyle}>
          <div>
            <h2 style={sectionTitleStyle}>발급된 테스트 계정</h2>
            <p style={sectionDescriptionStyle}>{selectedOrganization?.name ?? "소속대"} 기준 계정 목록입니다.</p>
          </div>
          <div style={listActionGroupStyle}>
            <button
              type="button"
              onClick={() => void handleResetPassword()}
              disabled={processing || selectedUserIds.length === 0}
              style={resetButtonStyle}
            >
              비밀번호 초기화
            </button>
            <button type="button" onClick={() => void handleDelete()} disabled={processing || selectedUserIds.length === 0} style={dangerButtonStyle}>
              선택 계정 삭제
            </button>
          </div>
        </div>

        {loadingUsers ? (
          <div style={emptyStyle}>계정 목록을 불러오는 중입니다...</div>
        ) : users.length === 0 ? (
          <div style={emptyStyle}>발급된 테스트 계정이 없습니다.</div>
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>선택</th>
                  <th style={thStyle}>이름</th>
                  <th style={thStyle}>아이디</th>
                  <th style={thStyle}>권한</th>
                  <th style={thStyle}>상태</th>
                  <th style={thStyle}>사용기한</th>
                  <th style={thStyle}>생성일</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const statusLabel = getAccountStatusLabel(user);

                  return (
                  <tr key={user.userId}>
                    <td style={tdStyle}><input type="checkbox" checked={selectedUserIds.includes(user.userId)} onChange={() => toggleUser(user.userId)} /></td>
                    <td style={tdStyle}>{user.name}</td>
                    <td style={tdStyle}>{user.email}</td>
                    <td style={tdStyle}>{ROLE_LABELS[user.role]}</td>
                    <td style={tdStyle}><span style={getAccountStatusStyle(statusLabel)}>{statusLabel}</span></td>
                    <td style={tdStyle}>{formatDate(user.expiresAt)}</td>
                    <td style={tdStyle}>{formatDate(user.createdAt)}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

const pageHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start", marginBottom: 22 };
const roleBadgeStyle: CSSProperties = { display: "inline-flex", padding: "6px 10px", borderRadius: 999, backgroundColor: "#dbeafe", color: "#1d4ed8", fontWeight: 900, fontSize: 13, marginBottom: 9 };
const titleStyle: CSSProperties = { margin: 0, fontSize: 30, color: "#0f172a", fontWeight: 900 };
const descriptionStyle: CSSProperties = { margin: "8px 0 0", color: "#64748b", lineHeight: 1.6 };
const panelStyle: CSSProperties = { padding: 22, border: "1px solid #e5e7eb", borderRadius: 16, backgroundColor: "#fff", marginBottom: 20 };
const credentialPanelStyle: CSSProperties = { ...panelStyle, borderColor: "#93c5fd", backgroundColor: "#eff6ff" };
const sectionHeaderStyle: CSSProperties = { marginBottom: 18 };
const sectionTitleStyle: CSSProperties = { margin: 0, fontSize: 21, fontWeight: 900, color: "#0f172a" };
const sectionDescriptionStyle: CSSProperties = { margin: "6px 0 0", color: "#64748b", lineHeight: 1.5 };
const formGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 };
const labelStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 7, color: "#334155", fontWeight: 800, fontSize: 14 };
const inputStyle: CSSProperties = { height: 42, borderRadius: 10, border: "1px solid #cbd5e1", padding: "0 12px", backgroundColor: "#fff", fontSize: 14 };
const actionRowStyle: CSSProperties = { display: "flex", justifyContent: "flex-end", marginTop: 18 };
const primaryButtonStyle: CSSProperties = { minWidth: 150, height: 42, border: 0, borderRadius: 10, backgroundColor: "#2563eb", color: "#fff", fontWeight: 900, cursor: "pointer" };
const secondaryButtonStyle: CSSProperties = { height: 40, padding: "0 14px", borderRadius: 10, border: "1px solid #cbd5e1", backgroundColor: "#fff", color: "#334155", fontWeight: 800, cursor: "pointer" };
const copyButtonStyle: CSSProperties = { ...secondaryButtonStyle, color: "#1d4ed8", borderColor: "#93c5fd" };
const dangerButtonStyle: CSSProperties = { height: 40, padding: "0 14px", borderRadius: 10, border: 0, backgroundColor: "#ef4444", color: "#fff", fontWeight: 900, cursor: "pointer" };
const credentialHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 16 };
const credentialGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 };
const credentialCardStyle: CSSProperties = { display: "grid", gap: 7, padding: 15, border: "1px solid #bfdbfe", borderRadius: 12, backgroundColor: "#fff", color: "#334155", fontSize: 14 };
const errorBoxStyle: CSSProperties = { padding: "13px 15px", borderRadius: 12, border: "1px solid #fecaca", backgroundColor: "#fef2f2", color: "#b91c1c", marginBottom: 16 };
const successBoxStyle: CSSProperties = { padding: "13px 15px", borderRadius: 12, border: "1px solid #a7f3d0", backgroundColor: "#ecfdf5", color: "#047857", marginBottom: 16 };
const emptyStyle: CSSProperties = { padding: 34, border: "1px dashed #cbd5e1", borderRadius: 12, backgroundColor: "#f8fafc", color: "#64748b", textAlign: "center" };
const tableWrapStyle: CSSProperties = { overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 12 };
const tableStyle: CSSProperties = { width: "100%", minWidth: 860, borderCollapse: "collapse" };
const thStyle: CSSProperties = { padding: "11px 13px", backgroundColor: "#f8fafc", borderBottom: "1px solid #e5e7eb", textAlign: "left", color: "#334155", fontSize: 14 };
const tdStyle: CSSProperties = { padding: "11px 13px", borderBottom: "1px solid #f1f5f9", color: "#475569", fontSize: 14 };
const listActionGroupStyle: CSSProperties = { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" };
const resetButtonStyle: CSSProperties = { height: 40, padding: "0 14px", borderRadius: 10, border: "1px solid #fcd34d", backgroundColor: "#fffbeb", color: "#92400e", fontWeight: 900, cursor: "pointer" };
const statusBadgeStyle: CSSProperties = { display: "inline-flex", padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" };
