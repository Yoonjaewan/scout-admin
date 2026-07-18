import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ChangeEvent, FormEvent } from "react";

import { FeedbackToast, PageHelpButton } from "../components/common/CommonFeedback";
import { supabase } from "../lib/supabase";

type UserRole = "super_admin" | "org_admin" | "leader" | "viewer";
type OrganizationType = "local" | "school";
type LogoColumnMode = "url_and_path" | "url_only" | "none";

type OrganizationForm = {
  type: OrganizationType;
  unitNumber: string;
  name: string;
  region: string;
  description: string;
  beomAttendanceRequired: boolean;
};

type OrganizationInfo = {
  id: string;
  type: OrganizationType;
  unitNumber: string | null;
  name: string;
  region: string | null;
  description: string | null;
  logoUrl: string | null;
  logoPath: string | null;
  logoColumnMode: LogoColumnMode;
  beomAttendanceRequired: boolean;
  updatedAt: string | null;
};

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "최고관리자",
  org_admin: "대 관리자",
  leader: "지도자",
  viewer: "조회전용",
};

const ORGANIZATION_TYPE_LABELS: Record<OrganizationType, string> = {
  school: "학교대",
  local: "지역대",
};

const ORGANIZATION_LOGO_BUCKET = "organization-logos";
const MAX_LOGO_FILE_SIZE = 2 * 1024 * 1024;

function isUserRole(value: unknown): value is UserRole {
  return (
    value === "super_admin" ||
    value === "org_admin" ||
    value === "leader" ||
    value === "viewer"
  );
}

function isOrganizationType(value: unknown): value is OrganizationType {
  return value === "local" || value === "school";
}

function isUnitNumberUniqueViolation(error: {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}) {
  if (error.code !== "23505") return false;

  const haystack = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();

  return (
    haystack.includes("unit_number") ||
    haystack.includes("organizations_unit_number_active_uidx")
  );
}

function getFileExtension(fileName: string, mimeType: string) {
  const nameExtension = fileName.split(".").pop()?.toLowerCase();

  if (nameExtension && ["png", "jpg", "jpeg", "webp", "svg"].includes(nameExtension)) {
    return nameExtension === "jpeg" ? "jpg" : nameExtension;
  }

  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/svg+xml") return "svg";

  return "png";
}

function getMimeTypeByExtension(extension: string) {
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "svg") return "image/svg+xml";
  return "image/png";
}

function getLogoUploadErrorMessage(message: string) {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("bucket") || lowerMessage.includes("not found")) {
    return "로고 저장 공간이 준비되지 않았습니다. 환경설정 준비 작업을 먼저 실행하세요.";
  }

  if (lowerMessage.includes("policy") || lowerMessage.includes("row-level") || lowerMessage.includes("permission") || lowerMessage.includes("unauthorized")) {
    return "현재 계정으로 로고를 등록할 권한을 확인하지 못했습니다. 소속대 관리자 권한과 저장 공간 권한을 확인하세요.";
  }

  if (lowerMessage.includes("mime") || lowerMessage.includes("type")) {
    return "등록할 수 없는 이미지 형식입니다. PNG, JPG, WEBP, SVG 파일을 사용하세요.";
  }

  if (lowerMessage.includes("size") || lowerMessage.includes("limit")) {
    return "로고 이미지는 2MB 이하 파일만 등록할 수 있습니다.";
  }

  return "로고 이미지를 등록하지 못했습니다. 저장 공간과 권한을 확인하세요.";
}

function buildFormFromOrganization(organization: OrganizationInfo): OrganizationForm {
  return {
    type: organization.type,
    unitNumber: organization.unitNumber || "",
    name: organization.name,
    region: organization.region || "",
    description: organization.description || "",
    beomAttendanceRequired: organization.beomAttendanceRequired,
  };
}

async function fetchOrganizationInfo(organizationId: string): Promise<OrganizationInfo | null> {
  const attempts: Array<{
    select: string;
    logoColumnMode: LogoColumnMode;
  }> = [
    {
      select: "id, type, unit_number, name, region, description, logo_url, logo_path, beom_attendance_required, updated_at",
      logoColumnMode: "url_and_path",
    },
    {
      select: "id, type, unit_number, name, region, description, logo_url, beom_attendance_required, updated_at",
      logoColumnMode: "url_only",
    },
    {
      select: "id, type, unit_number, name, region, description, beom_attendance_required, updated_at",
      logoColumnMode: "none",
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

      return {
        id: organizationId,
        type: isOrganizationType(row.type) ? row.type : "school",
        unitNumber:
          typeof row.unit_number === "string" && row.unit_number.trim()
            ? row.unit_number
            : null,
        name: typeof row.name === "string" ? row.name : "",
        region: typeof row.region === "string" ? row.region : null,
        description: typeof row.description === "string" ? row.description : null,
        logoUrl:
          typeof row.logo_url === "string" && row.logo_url.trim()
            ? row.logo_url
            : null,
        logoPath:
          typeof row.logo_path === "string" && row.logo_path.trim()
            ? row.logo_path
            : null,
        logoColumnMode: attempt.logoColumnMode,
        beomAttendanceRequired: row.beom_attendance_required === true,
        updatedAt:
          typeof row.updated_at === "string" && row.updated_at.trim()
            ? row.updated_at
            : null,
      };
    }
  }

  throw new Error("소속대 정보를 불러오지 못했습니다.");
}

export default function SettingsPage() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [organization, setOrganization] = useState<OrganizationInfo | null>(null);
  const [form, setForm] = useState<OrganizationForm>({
    type: "school",
    unitNumber: "",
    name: "",
    region: "",
    description: "",
    beomAttendanceRequired: false,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [deletingLogo, setDeletingLogo] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const canEdit = useMemo(() => {
    return role === "org_admin" || role === "super_admin";
  }, [role]);

  const logoReady = organization ? organization.logoColumnMode !== "none" : false;
  const setupIncomplete = organization
    ? !organization.unitNumber?.trim() || !organization.name.trim()
    : false;

  const settingsComplete = Boolean(
    organization?.unitNumber?.trim() && organization?.name.trim(),
  );

  const formatUpdatedAt = (value: string | null) => {
    if (!value) return "-";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value.slice(0, 10);

    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const loadSettings = async () => {
    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setErrorMessage("로그인 정보를 확인하지 못했습니다. 다시 로그인해 주세요.");
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("role, organization_id")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (profileError || !profile) {
      console.error("환경설정 사용자 확인 오류:", profileError);
      setErrorMessage("사용자 정보를 확인하지 못했습니다.");
      setLoading(false);
      return;
    }

    if (!isUserRole(profile.role)) {
      setErrorMessage("사용자 권한을 확인하지 못했습니다.");
      setLoading(false);
      return;
    }

    setRole(profile.role);

    const organizationId =
      typeof profile.organization_id === "string" ? profile.organization_id : null;

    if (!organizationId) {
      setOrganization(null);
      setErrorMessage("연결된 소속대 정보가 없습니다.");
      setLoading(false);
      return;
    }

    try {
      const loadedOrganization = await fetchOrganizationInfo(organizationId);

      if (!loadedOrganization) {
        setOrganization(null);
        setErrorMessage("소속대 정보를 찾지 못했습니다.");
        setLoading(false);
        return;
      }

      setOrganization(loadedOrganization);
      setForm(buildFormFromOrganization(loadedOrganization));
    } catch (error) {
      console.error("소속대 정보 조회 오류:", error);
      setErrorMessage("소속대 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleChange =
    (field: keyof OrganizationForm) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const value = event.target.value;

      if (field === "beomAttendanceRequired") {
        const checked =
          event.target instanceof HTMLInputElement ? event.target.checked : false;

        setForm((current) => ({
          ...current,
          beomAttendanceRequired: checked,
        }));
        return;
      }

      if (field === "type") {
        if (!isOrganizationType(value)) return;

        setForm((current) => ({
          ...current,
          type: value,
        }));
        return;
      }

      setForm((current) => ({
        ...current,
        [field]: value,
      }));
    };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!organization) return;

    if (!canEdit) {
      setErrorMessage("현재 계정은 소속대 정보를 수정할 수 없습니다.");
      return;
    }

    const normalizedUnitNumber = form.unitNumber.trim();
    const cleanName = form.name.trim();
    const cleanRegion = form.region.trim();
    const cleanDescription = form.description.trim();

    if (!normalizedUnitNumber) {
      setErrorMessage("대번호를 입력하세요.");
      return;
    }

    if (!cleanName) {
      setErrorMessage("소속 대명을 입력하세요.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { data: duplicateRows, error: duplicateCheckError } = await supabase
      .from("organizations")
      .select("id")
      .is("deleted_at", null)
      .neq("id", organization.id)
      .eq("unit_number", normalizedUnitNumber)
      .limit(1);

    if (duplicateCheckError) {
      console.error("대번호 중복 검사 오류:", duplicateCheckError.message);
      setErrorMessage("소속대 정보를 저장하지 못했습니다.");
      setSaving(false);
      return;
    }

    if (duplicateRows && duplicateRows.length > 0) {
      setErrorMessage("이미 다른 소속대에서 사용 중인 대번호입니다.");
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("organizations")
      .update({
        type: form.type,
        unit_number: normalizedUnitNumber,
        name: cleanName,
        region: cleanRegion || null,
        description: cleanDescription || null,
        beom_attendance_required: form.beomAttendanceRequired,
        updated_at: new Date().toISOString(),
      })
      .eq("id", organization.id)
      .is("deleted_at", null);

    if (error) {
      console.error("소속대 정보 저장 오류:", error.message);
      if (isUnitNumberUniqueViolation(error)) {
        setErrorMessage("이미 다른 소속대에서 사용 중인 대번호입니다.");
      } else {
        setErrorMessage("소속대 정보를 저장하지 못했습니다.");
      }
      setSaving(false);
      return;
    }

    const updatedOrganization: OrganizationInfo = {
      ...organization,
      type: form.type,
      unitNumber: normalizedUnitNumber,
      name: cleanName,
      region: cleanRegion || null,
      description: cleanDescription || null,
      beomAttendanceRequired: form.beomAttendanceRequired,
      updatedAt: new Date().toISOString(),
    };

    setOrganization(updatedOrganization);
    setForm(buildFormFromOrganization(updatedOrganization));
    setSuccessMessage("소속대 정보를 저장했습니다.");
    window.dispatchEvent(new Event("organization-info-updated"));
    setSaving(false);
  };

  const handleLogoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";

    if (!file || !organization) return;

    if (!canEdit) {
      setErrorMessage("현재 계정은 소속대 로고를 등록할 수 없습니다.");
      return;
    }

    if (!logoReady) {
      setErrorMessage("소속대 로고 저장 준비가 필요합니다. 안내된 준비 작업을 먼저 완료하세요.");
      return;
    }

    const currentUnitNumber = (organization.unitNumber || form.unitNumber).trim();

    if (!currentUnitNumber) {
      setErrorMessage("대번호를 먼저 입력하고 소속대 정보를 저장한 뒤 로고를 등록하세요.");
      return;
    }

    const extension = getFileExtension(file.name, file.type);
    const contentType = file.type || getMimeTypeByExtension(extension);
    const allowedContentTypes = [
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/svg+xml",
    ];

    if (!allowedContentTypes.includes(contentType)) {
      setErrorMessage("PNG, JPG, WEBP, SVG 형식의 이미지만 등록할 수 있습니다.");
      return;
    }

    if (file.size > MAX_LOGO_FILE_SIZE) {
      setErrorMessage("로고 이미지는 2MB 이하 파일만 등록할 수 있습니다.");
      return;
    }

    setUploadingLogo(true);
    setErrorMessage("");
    setSuccessMessage("");

    const filePath = `organizations/${organization.id}/logo-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(ORGANIZATION_LOGO_BUCKET)
      .upload(filePath, file, {
        cacheControl: "3600",
        contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error("소속대 로고 업로드 오류:", uploadError.message);
      setErrorMessage(getLogoUploadErrorMessage(uploadError.message));
      setUploadingLogo(false);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(ORGANIZATION_LOGO_BUCKET).getPublicUrl(filePath);

    const updatePayload: Record<string, unknown> = {
      logo_url: publicUrl,
      updated_at: new Date().toISOString(),
    };

    if (organization.logoColumnMode === "url_and_path") {
      updatePayload.logo_path = filePath;
    }

    const { error: updateError } = await supabase
      .from("organizations")
      .update(updatePayload)
      .eq("id", organization.id)
      .is("deleted_at", null);

    if (updateError) {
      console.error("소속대 로고 저장 오류:", updateError.message);
      setErrorMessage("로고 이미지는 등록되었지만 소속대 정보에 반영하지 못했습니다.");
      setUploadingLogo(false);
      return;
    }

    const updatedOrganization: OrganizationInfo = {
      ...organization,
      logoUrl: publicUrl,
      logoPath: organization.logoColumnMode === "url_and_path" ? filePath : organization.logoPath,
    };

    setOrganization(updatedOrganization);
    setSuccessMessage("소속대 로고를 등록했습니다.");
    window.dispatchEvent(new Event("organization-info-updated"));
    setUploadingLogo(false);
  };


  const handleDeleteLogo = async () => {
    if (!organization) return;

    if (!canEdit) {
      setErrorMessage("현재 계정은 소속대 로고를 삭제할 수 없습니다.");
      return;
    }

    if (!logoReady) {
      setErrorMessage("소속대 로고 저장 준비가 필요합니다.");
      return;
    }

    if (!organization.logoUrl && !organization.logoPath) {
      setErrorMessage("삭제할 로고 이미지가 없습니다.");
      return;
    }

    const confirmed = window.confirm(
      "등록된 로고 이미지를 삭제하시겠습니까?\n삭제하면 사이드 메뉴에 기본 표시가 적용됩니다.",
    );

    if (!confirmed) return;

    setDeletingLogo(true);
    setErrorMessage("");
    setSuccessMessage("");

    const updatePayload: Record<string, unknown> = {
      logo_url: null,
      updated_at: new Date().toISOString(),
    };

    if (organization.logoColumnMode === "url_and_path") {
      updatePayload.logo_path = null;
    }

    const { error: updateError } = await supabase
      .from("organizations")
      .update(updatePayload)
      .eq("id", organization.id)
      .is("deleted_at", null);

    if (updateError) {
      console.error("소속대 로고 삭제 오류:", updateError.message);
      setErrorMessage("소속대 로고를 삭제하지 못했습니다.");
      setDeletingLogo(false);
      return;
    }

    if (organization.logoPath) {
      const { error: removeError } = await supabase.storage
        .from(ORGANIZATION_LOGO_BUCKET)
        .remove([organization.logoPath]);

      if (removeError) {
        console.error("소속대 로고 파일 삭제 오류:", removeError.message);
      }
    }

    const updatedOrganization: OrganizationInfo = {
      ...organization,
      logoUrl: null,
      logoPath: organization.logoColumnMode === "url_and_path" ? null : organization.logoPath,
    };

    setOrganization(updatedOrganization);
    setSuccessMessage("소속대 로고를 삭제했습니다.");
    window.dispatchEvent(new Event("organization-info-updated"));
    setDeletingLogo(false);
  };
  if (loading) {
    return (
      <section style={cardStyle}>
        <p style={emptyTextStyle}>환경설정을 불러오는 중입니다...</p>
      </section>
    );
  }

  return (
    <div>
      <header style={pageHeaderStyle}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}><h1 style={pageTitleStyle}>환경설정</h1><PageHelpButton title="환경설정" description="소속대 정보, 로고, 범 진급 출석률 운영 기준을 관리합니다." sections={[{ title: "사용 순서", content: "필수정보를 저장한 뒤 운영 기준과 로고를 확인합니다." },{ title: "주의사항", content: "범 진급 출석률 설정은 진급관리·통합관리·출석 화면과 동일해야 합니다." }]} /></div>
          <p style={pageDescriptionStyle}>
            소속대 정보와 사이드 메뉴에 표시할 로고를 관리합니다.
          </p>
        </div>

        <div style={headerActionStyle}>
          {role === "org_admin" ? (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("open-first-use-guide"))}
              style={guideButtonStyle}
            >
              시작 안내 다시 보기
            </button>
          ) : null}
          <button type="button" onClick={loadSettings} style={secondaryButtonStyle}>
            새로고침
          </button>
        </div>
      </header>

      {organization ? (
        <div style={summaryGridStyle}>
          <section style={summaryCardStyle}>
            <h2 style={summaryTitleStyle}>소속대</h2>
            <p style={summaryValueStyle}>{organization.name || "-"}</p>
            <p style={summaryDescriptionStyle}>
              {ORGANIZATION_TYPE_LABELS[organization.type]}
              {organization.unitNumber ? ` · 대번호 ${organization.unitNumber}` : ""}
            </p>
          </section>

          <section style={summaryCardStyle}>
            <h2 style={summaryTitleStyle}>범 진급 출석률</h2>
            <p style={summaryValueStyle}>
              {organization.beomAttendanceRequired ? "판정에 적용" : "계산·표시만"}
            </p>
            <p style={summaryDescriptionStyle}>
              {organization.beomAttendanceRequired
                ? "범 진급 판정에서 출석률 조건을 필수로 확인합니다."
                : "출석률을 확인하되 진급 판정에서는 제외합니다."}
            </p>
          </section>

          <section style={summaryCardStyle}>
            <h2 style={summaryTitleStyle}>설정 상태</h2>
            <p style={summaryValueStyle}>{settingsComplete ? "정상" : "확인 필요"}</p>
            <p style={summaryDescriptionStyle}>
              {settingsComplete
                ? "필수 소속대 정보가 등록되어 있습니다."
                : "대번호와 소속 대명을 확인하세요."}
            </p>
          </section>

          <section style={summaryCardStyle}>
            <h2 style={summaryTitleStyle}>최근 저장</h2>
            <p style={{ ...summaryValueStyle, fontSize: "17px" }}>
              {formatUpdatedAt(organization.updatedAt)}
            </p>
            <p style={summaryDescriptionStyle}>
              현재 저장된 소속대 설정의 최근 변경 시각입니다.
            </p>
          </section>
        </div>
      ) : null}

      {errorMessage ? <div style={errorBoxStyle}>{errorMessage}</div> : null}
      <FeedbackToast message={successMessage} tone="success" onClose={() => setSuccessMessage("")} />

      {organization && setupIncomplete ? (
        <div style={setupGuideBoxStyle}>
          <strong>대정보 등록이 필요합니다.</strong>
          <span>
            대번호와 소속 대명을 저장하면 대원 관리, 진급 관리, 기능장 관리, 보고서 출력 기능을 사용할 수 있습니다.
          </span>
        </div>
      ) : null}

      {organization ? (
        <div style={settingsGridStyle}>
          <section style={cardStyle}>
            <div style={sectionHeaderStyle}>
              <h2 style={sectionTitleStyle}>소속대 정보</h2>
              <p style={sectionDescriptionStyle}>
                {canEdit
                  ? "대번호와 소속 대명은 필수 입력 항목입니다. 대원번호 자동 발번과 보고서 출력에 사용됩니다."
                  : "현재 계정은 소속대 정보를 조회할 수 있습니다."}
              </p>
            </div>

            <form data-organization-settings-form="true" onSubmit={handleSave}>
              <div style={formGridStyle}>
                <label style={labelStyle}>
                  소속 구분
                  <select
                    value={form.type}
                    onChange={handleChange("type")}
                    disabled={!canEdit || saving}
                    style={inputStyle}
                  >
                    <option value="school">학교대</option>
                    <option value="local">지역대</option>
                  </select>
                </label>

                <label style={labelStyle}>
                  <span style={requiredLabelStyle}>대번호 <span style={requiredMarkStyle}>*</span></span>
                  <input
                    type="text"
                    value={form.unitNumber}
                    onChange={handleChange("unitNumber")}
                    disabled={!canEdit || saving}
                    placeholder="예: 404"
                    style={inputStyle}
                    required
                  />
                </label>
              </div>

              <div style={formGuideBoxStyle}>
                대번호와 소속 대명은 필수입니다. 대번호가 없으면 대원번호 자동 발번, 보고서 출력, 소속대 구분에 문제가 생길 수 있습니다.
              </div>

              <label style={labelStyle}>
                권한
                <div style={roleValueBoxStyle}>
                  {role ? ROLE_LABELS[role] : "-"}
                </div>
              </label>

              <label style={labelStyle}>
                <span style={requiredLabelStyle}>소속 대명 <span style={requiredMarkStyle}>*</span></span>
                <input
                  type="text"
                  value={form.name}
                  onChange={handleChange("name")}
                  disabled={!canEdit || saving}
                  placeholder="예: 테스트학교대"
                  style={inputStyle}
                  required
                />
              </label>

              <label style={labelStyle}>
                지역
                <input
                  type="text"
                  value={form.region}
                  onChange={handleChange("region")}
                  disabled={!canEdit || saving}
                  placeholder="예: 서울, 경기, 부산"
                  style={inputStyle}
                />
              </label>

              <label style={labelStyle}>
                설명
                <textarea
                  value={form.description}
                  onChange={handleChange("description")}
                  disabled={!canEdit || saving}
                  placeholder="소속대 소개나 참고사항을 입력하세요."
                  rows={4}
                  style={textareaStyle}
                />
              </label>

              <div style={formActionStyle}>
                <button
                  type="submit"
                  disabled={!canEdit || saving}
                  style={{
                    ...primaryButtonStyle,
                    opacity: !canEdit || saving ? 0.65 : 1,
                    cursor: !canEdit || saving ? "not-allowed" : "pointer",
                  }}
                >
                  {saving ? "저장 중..." : "소속대 정보 저장"}
                </button>
              </div>
            </form>
          </section>

          <section style={cardStyle}>
            <div style={sectionHeaderStyle}>
              <h2 style={sectionTitleStyle}>진급 운영 기준</h2>
              <p style={sectionDescriptionStyle}>
                범스카우트 진급 판정에서 출석률을 필수 조건으로 적용할지 설정합니다.
              </p>
            </div>

            <label style={settingToggleStyle}>
              <input
                type="checkbox"
                checked={form.beomAttendanceRequired}
                onChange={handleChange("beomAttendanceRequired")}
                disabled={!canEdit || saving}
                style={settingCheckboxStyle}
              />
              <span>
                <strong style={settingToggleTitleStyle}>범 진급 출석률을 판정에 적용</strong>
                <span style={settingToggleDescriptionStyle}>
                  활성화하면 무궁화에서 범으로 진급할 때 출석률 조건을 반드시 충족해야 합니다.
                </span>
              </span>
            </label>

            <div
              style={
                form.beomAttendanceRequired
                  ? operationEnabledBoxStyle
                  : operationDisabledBoxStyle
              }
            >
              <strong>
                현재 설정: {form.beomAttendanceRequired ? "운영 기준 적용" : "체험 기준"}
              </strong>
              <span>
                {form.beomAttendanceRequired
                  ? "출석률이 범 진급 판정 결과에 반영됩니다."
                  : "출석률은 계산·표시하지만 범 진급 판정에서는 제외됩니다."}
              </span>
            </div>

            <div style={impactBoxStyle}>
              <strong style={impactTitleStyle}>이 설정이 적용되는 화면</strong>
              <div style={impactGridStyle}>
                <span>진급 관리</span>
                <span>대원 통합관리</span>
                <span>집회/출석 관리</span>
                <span>범 진급 신청서</span>
              </div>
            </div>

            <div style={formActionStyle}>
              <button
                type="button"
                onClick={() => {
                  const formElement = document.querySelector<HTMLFormElement>(
                    'form[data-organization-settings-form="true"]',
                  );
                  formElement?.requestSubmit();
                }}
                disabled={!canEdit || saving}
                style={{
                  ...primaryButtonStyle,
                  opacity: !canEdit || saving ? 0.65 : 1,
                  cursor: !canEdit || saving ? "not-allowed" : "pointer",
                }}
              >
                {saving ? "저장 중..." : "운영 기준 저장"}
              </button>
            </div>
          </section>

          <section style={cardStyle}>
            <div style={sectionHeaderStyle}>
              <h2 style={sectionTitleStyle}>소속대 로고</h2>
              <p style={sectionDescriptionStyle}>
                등록한 로고는 사이드 메뉴 상단에 표시됩니다.
              </p>
            </div>

            <div style={logoPreviewBoxStyle}>
              {organization.logoUrl ? (
                <img
                  src={organization.logoUrl}
                  alt={`${organization.name} 로고`}
                  style={logoPreviewImageStyle}
                />
              ) : (
                <div style={logoEmptyStyle}>등록된 로고 없음</div>
              )}
            </div>

            <div style={menuPreviewStyle}>
              <div style={menuPreviewBrandStyle}>
                {organization.logoUrl ? (
                  <img
                    src={organization.logoUrl}
                    alt=""
                    style={menuPreviewLogoStyle}
                  />
                ) : (
                  <strong style={menuPreviewScoutStyle}>Scout</strong>
                )}
              </div>
              <div style={menuPreviewNameStyle}>{organization.name}</div>
              <div style={menuPreviewMetaStyle}>
                {ORGANIZATION_TYPE_LABELS[organization.type]}
                {organization.unitNumber ? ` · 대번호 ${organization.unitNumber}` : ""}
              </div>
            </div>

            {!logoReady ? (
              <div style={warningBoxStyle}>
                로고 등록을 사용하려면 소속대 로고 저장 준비가 필요합니다.
                준비 작업을 완료한 뒤 이 화면에서 이미지를 등록하세요.
              </div>
            ) : null}

            <div style={logoButtonGridStyle}>
              <label
                style={{
                  ...uploadButtonStyle,
                  opacity: !canEdit || uploadingLogo || deletingLogo || !logoReady ? 0.65 : 1,
                  cursor:
                    !canEdit || uploadingLogo || deletingLogo || !logoReady ? "not-allowed" : "pointer",
                }}
              >
                {uploadingLogo
                  ? "로고 등록 중..."
                  : organization.logoUrl
                    ? "로고 이미지 변경"
                    : "로고 이미지 선택"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={handleLogoUpload}
                  disabled={!canEdit || uploadingLogo || deletingLogo || !logoReady}
                  style={hiddenFileInputStyle}
                />
              </label>

              <button
                type="button"
                onClick={handleDeleteLogo}
                disabled={
                  !canEdit ||
                  uploadingLogo ||
                  deletingLogo ||
                  !logoReady ||
                  (!organization.logoUrl && !organization.logoPath)
                }
                style={{
                  ...deleteLogoButtonStyle,
                  opacity:
                    !canEdit ||
                    uploadingLogo ||
                    deletingLogo ||
                    !logoReady ||
                    (!organization.logoUrl && !organization.logoPath)
                      ? 0.65
                      : 1,
                  cursor:
                    !canEdit ||
                    uploadingLogo ||
                    deletingLogo ||
                    !logoReady ||
                    (!organization.logoUrl && !organization.logoPath)
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {deletingLogo ? "삭제 중..." : "로고 이미지 삭제"}
              </button>
            </div>

            <p style={smallGuideTextStyle}>
              권장 형식: PNG, JPG, WEBP, SVG / 최대 2MB
            </p>

            {!canEdit ? (
              <p style={readonlyGuideTextStyle}>
                지도자와 조회전용 계정은 소속대 로고를 변경할 수 없습니다.
              </p>
            ) : null}
          </section>
        </div>
      ) : (
        <section style={cardStyle}>
          <p style={emptyTextStyle}>표시할 소속대 정보가 없습니다.</p>
        </section>
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

const headerActionStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const guideButtonStyle: CSSProperties = {
  height: "40px",
  padding: "0 14px",
  borderRadius: "10px",
  border: "1px solid #bfdbfe",
  backgroundColor: "#eff6ff",
  color: "#1d4ed8",
  fontWeight: 800,
  cursor: "pointer",
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

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: "14px",
  marginBottom: "20px",
};

const summaryCardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: "14px",
  padding: "18px",
  backgroundColor: "#ffffff",
};

const summaryTitleStyle: CSSProperties = {
  margin: 0,
  color: "#64748b",
  fontSize: "14px",
  fontWeight: 800,
};

const summaryValueStyle: CSSProperties = {
  margin: "10px 0 0",
  color: "#0f172a",
  fontSize: "22px",
  fontWeight: 900,
};

const summaryDescriptionStyle: CSSProperties = {
  margin: "7px 0 0",
  color: "#64748b",
  fontSize: "13px",
  lineHeight: 1.5,
};

const settingToggleStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr)",
  gap: "12px",
  alignItems: "flex-start",
  padding: "16px",
  border: "1px solid #cbd5e1",
  borderRadius: "12px",
  backgroundColor: "#ffffff",
  cursor: "pointer",
};

const settingCheckboxStyle: CSSProperties = {
  width: "20px",
  height: "20px",
  marginTop: "2px",
};

const settingToggleTitleStyle: CSSProperties = {
  display: "block",
  color: "#0f172a",
  fontSize: "15px",
  fontWeight: 900,
};

const settingToggleDescriptionStyle: CSSProperties = {
  display: "block",
  marginTop: "5px",
  color: "#64748b",
  fontSize: "13px",
  lineHeight: 1.5,
};

const operationEnabledBoxStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "5px",
  marginTop: "14px",
  padding: "14px",
  border: "1px solid #86efac",
  borderRadius: "12px",
  backgroundColor: "#f0fdf4",
  color: "#166534",
  fontSize: "13px",
  lineHeight: 1.5,
};

const operationDisabledBoxStyle: CSSProperties = {
  ...operationEnabledBoxStyle,
  borderColor: "#fed7aa",
  backgroundColor: "#fff7ed",
  color: "#9a3412",
};

const impactBoxStyle: CSSProperties = {
  marginTop: "14px",
  padding: "14px",
  border: "1px solid #dbeafe",
  borderRadius: "12px",
  backgroundColor: "#f8fbff",
};

const impactTitleStyle: CSSProperties = {
  display: "block",
  marginBottom: "10px",
  color: "#1e3a8a",
  fontSize: "13px",
  fontWeight: 900,
};

const impactGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "8px",
  color: "#334155",
  fontSize: "13px",
  fontWeight: 700,
};

const menuPreviewStyle: CSSProperties = {
  padding: "16px",
  borderRadius: "14px",
  backgroundColor: "#0f172a",
  color: "#ffffff",
  textAlign: "center",
  marginBottom: "16px",
};

const menuPreviewBrandStyle: CSSProperties = {
  minHeight: "72px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px",
  borderRadius: "10px",
  backgroundColor: "#ffffff",
};

const menuPreviewLogoStyle: CSSProperties = {
  maxWidth: "100%",
  maxHeight: "56px",
  objectFit: "contain",
};

const menuPreviewScoutStyle: CSSProperties = {
  color: "#0f172a",
  fontSize: "22px",
  fontWeight: 900,
};

const menuPreviewNameStyle: CSSProperties = {
  marginTop: "12px",
  fontSize: "15px",
  fontWeight: 900,
};

const menuPreviewMetaStyle: CSSProperties = {
  marginTop: "4px",
  color: "#cbd5e1",
  fontSize: "12px",
  fontWeight: 700,
};

const settingsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: "20px",
  alignItems: "start",
};

const cardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: "16px",
  padding: "24px",
  backgroundColor: "#ffffff",
};

const sectionHeaderStyle: CSSProperties = {
  marginBottom: "18px",
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

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "16px",
};

const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  fontSize: "14px",
  fontWeight: 800,
  color: "#334155",
  marginBottom: "16px",
};

const requiredLabelStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
};

const requiredMarkStyle: CSSProperties = {
  color: "#dc2626",
  fontWeight: 900,
};

const formGuideBoxStyle: CSSProperties = {
  padding: "10px 12px",
  marginBottom: "16px",
  borderRadius: "10px",
  border: "1px solid #bfdbfe",
  backgroundColor: "#eff6ff",
  color: "#1e3a8a",
  fontSize: "13px",
  lineHeight: 1.5,
  fontWeight: 700,
};

const inputStyle: CSSProperties = {
  height: "44px",
  borderRadius: "10px",
  border: "1px solid #cbd5e1",
  padding: "0 12px",
  fontSize: "14px",
  outline: "none",
  boxSizing: "border-box",
  backgroundColor: "#ffffff",
};

const roleValueBoxStyle: CSSProperties = {
  minHeight: "44px",
  borderRadius: "10px",
  border: "1px solid #e2e8f0",
  padding: "0 12px",
  display: "flex",
  alignItems: "center",
  boxSizing: "border-box",
  backgroundColor: "#f8fafc",
  color: "#334155",
  fontSize: "14px",
  fontWeight: 800,
};

const textareaStyle: CSSProperties = {
  minHeight: "108px",
  borderRadius: "10px",
  border: "1px solid #cbd5e1",
  padding: "12px",
  fontSize: "14px",
  outline: "none",
  resize: "vertical",
  boxSizing: "border-box",
  fontFamily: "inherit",
  backgroundColor: "#ffffff",
};

const formActionStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  marginTop: "8px",
};

const primaryButtonStyle: CSSProperties = {
  height: "42px",
  padding: "0 18px",
  borderRadius: "10px",
  border: "none",
  backgroundColor: "#2563eb",
  color: "#ffffff",
  fontWeight: 800,
};

const secondaryButtonStyle: CSSProperties = {
  height: "40px",
  padding: "0 14px",
  borderRadius: "10px",
  border: "1px solid #cbd5e1",
  backgroundColor: "#ffffff",
  color: "#334155",
  fontWeight: 800,
  cursor: "pointer",
};

const errorBoxStyle: CSSProperties = {
  padding: "14px 16px",
  borderRadius: "12px",
  backgroundColor: "#fef2f2",
  color: "#b91c1c",
  border: "1px solid #fecaca",
  fontSize: "14px",
  lineHeight: 1.5,
  marginBottom: "16px",
};


const warningBoxStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: "12px",
  backgroundColor: "#fffbeb",
  color: "#92400e",
  border: "1px solid #fde68a",
  fontSize: "14px",
  lineHeight: 1.5,
  marginBottom: "16px",
};

const setupGuideBoxStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  padding: "14px 16px",
  borderRadius: "12px",
  backgroundColor: "#eff6ff",
  color: "#1e3a8a",
  border: "1px solid #bfdbfe",
  fontSize: "14px",
  lineHeight: 1.5,
  marginBottom: "16px",
};

const emptyTextStyle: CSSProperties = {
  margin: 0,
  color: "#64748b",
  lineHeight: 1.6,
};

const logoPreviewBoxStyle: CSSProperties = {
  height: "150px",
  borderRadius: "16px",
  border: "1px dashed #cbd5e1",
  backgroundColor: "#f8fafc",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  marginBottom: "16px",
  overflow: "hidden",
};

const logoPreviewImageStyle: CSSProperties = {
  maxWidth: "92%",
  maxHeight: "118px",
  objectFit: "contain",
};

const logoEmptyStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: "14px",
  fontWeight: 800,
};




const logoButtonGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "10px",
};

const uploadButtonStyle: CSSProperties = {
  width: "100%",
  height: "44px",
  borderRadius: "10px",
  border: "none",
  backgroundColor: "#0f172a",
  color: "#ffffff",
  fontWeight: 800,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const deleteLogoButtonStyle: CSSProperties = {
  width: "100%",
  height: "44px",
  borderRadius: "10px",
  border: "1px solid #fecaca",
  backgroundColor: "#fff1f2",
  color: "#be123c",
  fontWeight: 800,
  fontFamily: "inherit",
};

const hiddenFileInputStyle: CSSProperties = {
  display: "none",
};

const smallGuideTextStyle: CSSProperties = {
  marginTop: "12px",
  marginBottom: 0,
  color: "#64748b",
  fontSize: "13px",
  lineHeight: 1.5,
};

const readonlyGuideTextStyle: CSSProperties = {
  marginTop: "12px",
  marginBottom: 0,
  color: "#475569",
  fontSize: "13px",
  lineHeight: 1.5,
};
