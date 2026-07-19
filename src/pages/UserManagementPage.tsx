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

type OrgAdminUser = {
  id: string;
  email: string;
  full_name: string;
  organization_id: string | null;
  organization_name: string | null;
  unit_number: string | null;
  organization_status: string | null;
  approval_status: string | null;
  must_change_password: boolean;
  can_reset_password: boolean;
  reset_blocked_reason: string | null;
};

type OrgAdminResetResult = {
  id: string;
  email: string;
  full_name: string;
  organization_name: string | null;
  unit_number: string | null;
  temporary_password: string;
};

type FunctionResponse = {
  ok?: boolean;
  message?: string;
  users?: TestUser[];
  credentials?: CreatedCredential[];
  failures?: ResetFailure[];
};

type OrgAdminFunctionResponse = {
  ok?: boolean;
  message?: string;
  users?: OrgAdminUser[];
  temporary_password?: string;
  user?: {
    id?: string;
    email?: string;
    full_name?: string;
    organization_name?: string | null;
    unit_number?: string | null;
  };
};

const ORG_STATUS_LABELS: Record<string, string> = {
  active: "이용중",
  suspended: "이용중지",
  inactive: "이용중지",
  closed: "이용종료",
};

const APPROVAL_STATUS_LABELS: Record<string, string> = {
  approved: "승인",
  pending: "승인대기",
  rejected: "반려",
};

const ROLE_LABELS: Record<UserRole, string> = {
  org_admin: "조직관리자",
  leader: "지도자",
  viewer: "조회전용",
};

async function extractFunctionErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;

  let detailMessage = error.message;
  const response = (error as { context?: Response }).context;
  if (response) {
    try {
      const errorBody = (await response.clone().json()) as {
        message?: string;
        error?: string;
      };
      detailMessage = errorBody.message || errorBody.error || detailMessage;
    } catch {
      // 응답 본문이 JSON이 아니면 SDK 오류 문구를 사용합니다.
    }
  }

  return detailMessage || fallback;
}

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
  const [isCredentialModalOpen, setIsCredentialModalOpen] = useState(false);
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState(false);
  const [resetPasswordFormError, setResetPasswordFormError] = useState("");
  const [resetPasswordFormLoading, setResetPasswordFormLoading] = useState(false);
  const [loadingOrganizations, setLoadingOrganizations] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [orgAdmins, setOrgAdmins] = useState<OrgAdminUser[]>([]);
  const [loadingOrgAdmins, setLoadingOrgAdmins] = useState(false);
  const [orgAdminErrorMessage, setOrgAdminErrorMessage] = useState("");
  const [orgAdminSuccessMessage, setOrgAdminSuccessMessage] = useState("");
  const [pendingOrgAdminReset, setPendingOrgAdminReset] = useState<OrgAdminUser | null>(null);
  const [isOrgAdminResetConfirmOpen, setIsOrgAdminResetConfirmOpen] = useState(false);
  const [orgAdminResetFormError, setOrgAdminResetFormError] = useState("");
  const [orgAdminResetLoading, setOrgAdminResetLoading] = useState(false);
  const [orgAdminResetResult, setOrgAdminResetResult] = useState<OrgAdminResetResult | null>(null);
  const [isOrgAdminResetResultOpen, setIsOrgAdminResetResultOpen] = useState(false);

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
      throw new Error(await extractFunctionErrorMessage(error, "요청을 처리하지 못했습니다."));
    }

    if (!data?.ok) {
      throw new Error(data?.message || "요청을 처리하지 못했습니다.");
    }

    return data;
  }, []);

  const invokeOrgAdminPasswordFunction = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke<OrgAdminFunctionResponse>(
      "manage-org-admin-password",
      { body },
    );

    if (error) {
      throw new Error(
        await extractFunctionErrorMessage(error, "비밀번호를 초기화하지 못했습니다. 잠시 후 다시 시도하세요."),
      );
    }

    if (!data?.ok) {
      throw new Error(
        data?.message || "비밀번호를 초기화하지 못했습니다. 잠시 후 다시 시도하세요.",
      );
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

  const loadOrgAdmins = useCallback(async () => {
    setLoadingOrgAdmins(true);
    setOrgAdminErrorMessage("");
    try {
      const data = await invokeOrgAdminPasswordFunction({ action: "list" });
      setOrgAdmins(data.users ?? []);
    } catch (error) {
      setOrgAdmins([]);
      setOrgAdminErrorMessage(
        error instanceof Error ? error.message : "소속대 관리자 목록을 불러오지 못했습니다.",
      );
    } finally {
      setLoadingOrgAdmins(false);
    }
  }, [invokeOrgAdminPasswordFunction]);

  useEffect(() => {
    void loadOrganizations();
  }, [loadOrganizations]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    void loadOrgAdmins();
  }, [loadOrgAdmins]);

  const closeCredentialModal = () => {
    setIsCredentialModalOpen(false);
    setCreatedCredentials([]);
    setResetPasswordFormError("");
    setResetPasswordFormLoading(false);
  };

  const openCredentialModal = (credentials: CreatedCredential[], title: string) => {
    setCredentialPanelTitle(title);
    setCreatedCredentials(credentials);
    setIsCredentialModalOpen(credentials.length > 0);
  };

  const openResetPasswordModal = () => {
    if (selectedUserIds.length === 0) {
      setErrorMessage("비밀번호를 초기화할 테스트 계정을 선택하세요.");
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");
    setResetPasswordFormError("");
    setResetPasswordFormLoading(false);
    setIsResetPasswordModalOpen(true);
  };

  const closeResetPasswordModal = () => {
    if (resetPasswordFormLoading) return;

    setIsResetPasswordModalOpen(false);
    setResetPasswordFormError("");
    setResetPasswordFormLoading(false);
  };

  const submitResetPasswordModal = async () => {
    if (selectedUserIds.length === 0) {
      setResetPasswordFormError("비밀번호를 초기화할 테스트 계정을 선택하세요.");
      return;
    }

    setResetPasswordFormLoading(true);
    setResetPasswordFormError("");
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

      setIsResetPasswordModalOpen(false);
      setResetPasswordFormError("");
      openCredentialModal(credentials, "이번에 초기화한 계정");

      void loadUsers();
    } catch (error) {
      setResetPasswordFormError(
        error instanceof Error ? error.message : "테스트 계정 비밀번호를 초기화하지 못했습니다.",
      );
    } finally {
      setResetPasswordFormLoading(false);
      setProcessing(false);
    }
  };

  const openOrgAdminResetConfirm = (user: OrgAdminUser) => {
    if (!user.can_reset_password) return;

    setOrgAdminErrorMessage("");
    setOrgAdminSuccessMessage("");
    setOrgAdminResetFormError("");
    setOrgAdminResetLoading(false);
    setPendingOrgAdminReset(user);
    setIsOrgAdminResetConfirmOpen(true);
  };

  const closeOrgAdminResetConfirm = () => {
    if (orgAdminResetLoading) return;
    setIsOrgAdminResetConfirmOpen(false);
    setPendingOrgAdminReset(null);
    setOrgAdminResetFormError("");
    setOrgAdminResetLoading(false);
  };

  const closeOrgAdminResetResult = () => {
    setIsOrgAdminResetResultOpen(false);
    setOrgAdminResetResult(null);
  };

  const submitOrgAdminReset = async () => {
    if (!pendingOrgAdminReset) {
      setOrgAdminResetFormError("대상 사용자를 찾을 수 없습니다.");
      return;
    }

    setOrgAdminResetLoading(true);
    setOrgAdminResetFormError("");
    setOrgAdminErrorMessage("");
    setOrgAdminSuccessMessage("");

    try {
      const data = await invokeOrgAdminPasswordFunction({
        action: "reset_password",
        user_id: pendingOrgAdminReset.id,
      });

      const temporaryPassword = data.temporary_password?.trim() ?? "";
      if (!temporaryPassword) {
        throw new Error("비밀번호를 초기화하지 못했습니다. 잠시 후 다시 시도하세요.");
      }

      const resultUser = data.user;
      setOrgAdminResetResult({
        id: resultUser?.id || pendingOrgAdminReset.id,
        email: resultUser?.email || pendingOrgAdminReset.email,
        full_name: resultUser?.full_name || pendingOrgAdminReset.full_name,
        organization_name:
          resultUser?.organization_name ?? pendingOrgAdminReset.organization_name,
        unit_number: resultUser?.unit_number ?? pendingOrgAdminReset.unit_number,
        temporary_password: temporaryPassword,
      });

      setIsOrgAdminResetConfirmOpen(false);
      setPendingOrgAdminReset(null);
      setIsOrgAdminResetResultOpen(true);
      setOrgAdminSuccessMessage("소속대 관리자 비밀번호를 초기화했습니다.");
      void loadOrgAdmins();
    } catch (error) {
      setOrgAdminResetFormError(
        error instanceof Error
          ? error.message
          : "비밀번호를 초기화하지 못했습니다. 잠시 후 다시 시도하세요.",
      );
    } finally {
      setOrgAdminResetLoading(false);
    }
  };

  const copyOrgAdminTemporaryPassword = async () => {
    if (!orgAdminResetResult?.temporary_password) return;

    try {
      await navigator.clipboard.writeText(orgAdminResetResult.temporary_password);
      setOrgAdminSuccessMessage("임시 비밀번호를 클립보드에 복사했습니다.");
    } catch {
      setOrgAdminErrorMessage("클립보드 복사에 실패했습니다. 임시 비밀번호를 직접 복사하세요.");
    }
  };

  const copyOrgAdminResetSummary = async () => {
    if (!orgAdminResetResult) return;

    const text = [
      `소속대: ${orgAdminResetResult.organization_name || "-"}`,
      `이름: ${orgAdminResetResult.full_name}`,
      `이메일: ${orgAdminResetResult.email}`,
      `임시 비밀번호: ${orgAdminResetResult.temporary_password}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setOrgAdminSuccessMessage("초기화 정보를 클립보드에 복사했습니다.");
    } catch {
      setOrgAdminErrorMessage("클립보드 복사에 실패했습니다. 정보를 직접 복사하세요.");
    }
  };

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
      openCredentialModal(credentials, "이번에 발급한 계정");
      setSuccessMessage(`${credentials.length}개의 테스트 계정을 생성했습니다.`);
      void loadUsers();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "테스트 계정을 생성하지 못했습니다.");
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
      setIsCredentialModalOpen(false);
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
      closeCredentialModal();
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

  const getOrganizationStatusLabel = (status: string | null | undefined) => {
    if (!status) return "미확인";
    return ORG_STATUS_LABELS[status] || status;
  };

  const getApprovalStatusLabel = (status: string | null | undefined) => {
    if (!status) return "미확인";
    return APPROVAL_STATUS_LABELS[status] || status;
  };

  const getOrgAdminAccountStatusLabel = (user: OrgAdminUser) => {
    if (user.must_change_password) return "비밀번호 변경 필요";
    return getApprovalStatusLabel(user.approval_status);
  };

  return (
    <div>
      <header style={pageHeaderStyle}>
        <div>
          <div style={roleBadgeStyle}>최고관리자</div>
          <h1 style={titleStyle}>사용자 관리</h1>
          <p style={descriptionStyle}>
            일반 소속대 관리자 비밀번호를 초기화하고, 소속대별 테스트 계정을 생성·회수합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void loadOrganizations();
            void loadOrgAdmins();
          }}
          style={secondaryButtonStyle}
        >
          새로고침
        </button>
      </header>

      {orgAdminErrorMessage ? <div style={errorBoxStyle}>{orgAdminErrorMessage}</div> : null}
      {orgAdminSuccessMessage ? <div style={successBoxStyle}>{orgAdminSuccessMessage}</div> : null}
      {errorMessage ? <div style={errorBoxStyle}>{errorMessage}</div> : null}
      {successMessage ? <div style={successBoxStyle}>{successMessage}</div> : null}

      <section style={panelStyle}>
        <div style={credentialHeaderStyle}>
          <div>
            <h2 style={sectionTitleStyle}>일반 소속대 관리자</h2>
            <p style={sectionDescriptionStyle}>
              정식 소속대 관리자(org_admin) 비밀번호를 임시 비밀번호로 초기화합니다. 테스트 계정은 아래
              테스트 계정 관리에서 처리하세요.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadOrgAdmins()}
            disabled={loadingOrgAdmins || orgAdminResetLoading}
            style={secondaryButtonStyle}
          >
            {loadingOrgAdmins ? "불러오는 중..." : "목록 새로고침"}
          </button>
        </div>

        {loadingOrgAdmins ? (
          <div style={emptyStyle}>소속대 관리자 목록을 불러오는 중입니다...</div>
        ) : orgAdmins.length === 0 ? (
          <div style={emptyStyle}>표시할 일반 소속대 관리자가 없습니다.</div>
        ) : (
          <div style={tableWrapStyle}>
            <table style={{ ...tableStyle, minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={thStyle}>이름</th>
                  <th style={thStyle}>이메일</th>
                  <th style={thStyle}>소속대명</th>
                  <th style={thStyle}>대번호</th>
                  <th style={thStyle}>계정 상태</th>
                  <th style={thStyle}>조직 이용 상태</th>
                  <th style={thStyle}>비밀번호 초기화</th>
                </tr>
              </thead>
              <tbody>
                {orgAdmins.map((user) => {
                  const accountStatusLabel = getOrgAdminAccountStatusLabel(user);
                  const organizationStatusLabel = getOrganizationStatusLabel(user.organization_status);

                  return (
                    <tr key={user.id}>
                      <td style={tdStyle}>{user.full_name}</td>
                      <td style={tdStyle}>{user.email}</td>
                      <td style={tdStyle}>{user.organization_name || "-"}</td>
                      <td style={tdStyle}>{user.unit_number || "-"}</td>
                      <td style={tdStyle}>
                        <span style={getAccountStatusStyle(accountStatusLabel)}>{accountStatusLabel}</span>
                      </td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            ...statusBadgeStyle,
                            backgroundColor:
                              user.organization_status === "active" ? "#dcfce7" : "#fee2e2",
                            color: user.organization_status === "active" ? "#166534" : "#b91c1c",
                          }}
                        >
                          {organizationStatusLabel}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        {user.can_reset_password ? (
                          <button
                            type="button"
                            onClick={() => openOrgAdminResetConfirm(user)}
                            disabled={orgAdminResetLoading}
                            style={resetButtonStyle}
                          >
                            비밀번호 초기화
                          </button>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: 13 }}>
                            {user.reset_blocked_reason || "초기화 불가"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isOrgAdminResetConfirmOpen && pendingOrgAdminReset ? (
        <div style={modalOverlayStyle} role="presentation" onClick={closeOrgAdminResetConfirm}>
          <section
            style={{ ...modalPanelStyle, maxWidth: 560 }}
            role="dialog"
            aria-modal="true"
            aria-label="소속대 관리자 비밀번호 초기화"
            onClick={(event) => event.stopPropagation()}
          >
            <div style={sectionHeaderStyle}>
              <h2 style={sectionTitleStyle}>소속대 관리자 비밀번호 초기화</h2>
              <p style={sectionDescriptionStyle}>
                {pendingOrgAdminReset.organization_name || "소속대"} 관리자
                <br />
                {pendingOrgAdminReset.email}
                <br />
                비밀번호를 임시 비밀번호로 초기화합니다.
                <br />
                다음 로그인 시 새 비밀번호로 변경해야 합니다.
              </p>
            </div>

            {orgAdminResetFormError ? <div style={errorBoxStyle}>{orgAdminResetFormError}</div> : null}

            <div style={modalFooterStyle}>
              <button
                type="button"
                onClick={closeOrgAdminResetConfirm}
                disabled={orgAdminResetLoading}
                style={secondaryButtonStyle}
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void submitOrgAdminReset()}
                disabled={orgAdminResetLoading}
                style={primaryButtonStyle}
              >
                {orgAdminResetLoading ? "초기화 중..." : "비밀번호 초기화"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isOrgAdminResetResultOpen && orgAdminResetResult ? (
        <div style={modalOverlayStyle} role="presentation" onClick={closeOrgAdminResetResult}>
          <section
            style={{ ...modalPanelStyle, maxWidth: 560 }}
            role="dialog"
            aria-modal="true"
            aria-label="소속대 관리자 임시 비밀번호"
            onClick={(event) => event.stopPropagation()}
          >
            <div style={sectionHeaderStyle}>
              <h2 style={sectionTitleStyle}>소속대 관리자 임시 비밀번호</h2>
              <p style={sectionDescriptionStyle}>
                임시 비밀번호는 이 화면에서만 확인할 수 있습니다.
                <br />
                사용자는 다음 로그인 시 새 비밀번호로 변경해야 합니다.
              </p>
            </div>

            <article style={credentialCardStyle}>
              <span>소속대명: <b>{orgAdminResetResult.organization_name || "-"}</b></span>
              <span>사용자 이름: <b>{orgAdminResetResult.full_name}</b></span>
              <span>이메일: <b>{orgAdminResetResult.email}</b></span>
              <span>임시 비밀번호: <b>{orgAdminResetResult.temporary_password}</b></span>
            </article>

            <div style={modalFooterStyle}>
              <button type="button" onClick={() => void copyOrgAdminTemporaryPassword()} style={copyButtonStyle}>
                임시 비밀번호 복사
              </button>
              <button type="button" onClick={() => void copyOrgAdminResetSummary()} style={copyButtonStyle}>
                전체 정보 복사
              </button>
              <button type="button" onClick={closeOrgAdminResetResult} style={primaryButtonStyle}>
                확인
              </button>
            </div>
          </section>
        </div>
      ) : null}

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
                closeCredentialModal();
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

      {isCredentialModalOpen ? (
        <div style={modalOverlayStyle} role="presentation" onClick={closeCredentialModal}>
          <section
            style={modalPanelStyle}
            role="dialog"
            aria-modal="true"
            aria-label={credentialPanelTitle}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={credentialHeaderStyle}>
              <div>
                <h2 style={sectionTitleStyle}>{credentialPanelTitle}</h2>
                <p style={sectionDescriptionStyle}>임시 비밀번호는 이 화면을 벗어나면 다시 확인할 수 없습니다.</p>
              </div>
              <button type="button" onClick={closeCredentialModal} style={secondaryButtonStyle}>
                닫기
              </button>
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
            <div style={modalFooterStyle}>
              <button type="button" onClick={() => void copyCreatedCredentials()} style={copyButtonStyle}>
                계정 정보 복사
              </button>
              <button type="button" onClick={closeCredentialModal} style={primaryButtonStyle}>
                확인
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isResetPasswordModalOpen ? (
        <div style={modalOverlayStyle} role="presentation" onClick={closeResetPasswordModal}>
          <section
            style={modalPanelStyle}
            role="dialog"
            aria-modal="true"
            aria-label="비밀번호 초기화"
            onClick={(event) => event.stopPropagation()}
          >
            <div style={sectionHeaderStyle}>
              <h2 style={sectionTitleStyle}>비밀번호 초기화</h2>
              <p style={sectionDescriptionStyle}>
                선택한 테스트 계정 {selectedUserIds.length}개의 비밀번호를 초기화합니다.
                저장 후 임시 비밀번호가 발급되며, 다음 로그인 시 비밀번호 변경이 필요합니다.
              </p>
            </div>

            {resetPasswordFormError ? <div style={errorBoxStyle}>{resetPasswordFormError}</div> : null}

            <div style={modalFooterStyle}>
              <button
                type="button"
                onClick={closeResetPasswordModal}
                disabled={resetPasswordFormLoading}
                style={secondaryButtonStyle}
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void submitResetPasswordModal()}
                disabled={resetPasswordFormLoading}
                style={primaryButtonStyle}
              >
                {resetPasswordFormLoading ? "저장 중..." : "저장"}
              </button>
            </div>
          </section>
        </div>
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
              onClick={openResetPasswordModal}
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
const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  boxSizing: "border-box",
  backgroundColor: "rgba(15, 23, 42, 0.55)",
};
const modalPanelStyle: CSSProperties = {
  width: "100%",
  maxWidth: 760,
  maxHeight: "90vh",
  overflowY: "auto",
  padding: 24,
  borderRadius: 18,
  backgroundColor: "#ffffff",
  border: "1px solid #e5e7eb",
  boxShadow: "0 24px 80px rgba(15, 23, 42, 0.16)",
  boxSizing: "border-box",
};
const modalFooterStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  marginTop: 18,
  flexWrap: "wrap",
};
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
