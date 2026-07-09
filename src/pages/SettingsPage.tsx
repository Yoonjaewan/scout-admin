import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ChangeEvent, FormEvent } from "react";

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
  };
}

async function fetchOrganizationInfo(organizationId: string): Promise<OrganizationInfo | null> {
  const attempts: Array<{
    select: string;
    logoColumnMode: LogoColumnMode;
  }> = [
    {
      select: "id, type, unit_number, name, region, description, logo_url, logo_path",
      logoColumnMode: "url_and_path",
    },
    {
      select: "id, type, unit_number, name, region, description, logo_url",
      logoColumnMode: "url_only",
    },
    {
      select: "id, type, unit_number, name, region, description",
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

    const cleanUnitNumber = form.unitNumber.trim();
    const cleanName = form.name.trim();
    const cleanRegion = form.region.trim();
    const cleanDescription = form.description.trim();

    if (!cleanUnitNumber) {
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

    const { error } = await supabase
      .from("organizations")
      .update({
        type: form.type,
        unit_number: cleanUnitNumber,
        name: cleanName,
        region: cleanRegion || null,
        description: cleanDescription || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", organization.id)
      .is("deleted_at", null);

    if (error) {
      console.error("소속대 정보 저장 오류:", error.message);
      setErrorMessage("소속대 정보를 저장하지 못했습니다.");
      setSaving(false);
      return;
    }

    const updatedOrganization: OrganizationInfo = {
      ...organization,
      type: form.type,
      unitNumber: cleanUnitNumber,
      name: cleanName,
      region: cleanRegion || null,
      description: cleanDescription || null,
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
          <h1 style={pageTitleStyle}>환경설정</h1>
          <p style={pageDescriptionStyle}>
            소속대 정보와 사이드 메뉴에 표시할 로고를 관리합니다.
          </p>
        </div>

        <button type="button" onClick={loadSettings} style={secondaryButtonStyle}>
          새로고침
        </button>
      </header>

      {errorMessage ? <div style={errorBoxStyle}>{errorMessage}</div> : null}
      {successMessage ? <div style={successBoxStyle}>{successMessage}</div> : null}

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
                  ? "대번호, 소속 대명과 기본 정보를 수정할 수 있습니다."
                  : "현재 계정은 소속대 정보를 조회할 수 있습니다."}
              </p>
            </div>

            <form onSubmit={handleSave}>
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
                  대번호
                  <input
                    type="text"
                    value={form.unitNumber}
                    onChange={handleChange("unitNumber")}
                    disabled={!canEdit || saving}
                    placeholder="예: 404"
                    style={inputStyle}
                  />
                </label>
              </div>

              <label style={labelStyle}>
                권한
                <div style={roleValueBoxStyle}>
                  {role ? ROLE_LABELS[role] : "-"}
                </div>
              </label>

              <label style={labelStyle}>
                소속 대명
                <input
                  type="text"
                  value={form.name}
                  onChange={handleChange("name")}
                  disabled={!canEdit || saving}
                  placeholder="예: 테스트학교대"
                  style={inputStyle}
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

            <div style={infoBoxStyle}>
              <div style={infoLabelStyle}>사이드 메뉴 표시 정보</div>
              <div style={infoValueStyle}>
                {ORGANIZATION_TYPE_LABELS[organization.type]} · {organization.name}
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

const settingsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(360px, 1.2fr) minmax(320px, 0.8fr)",
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

const successBoxStyle: CSSProperties = {
  padding: "14px 16px",
  borderRadius: "12px",
  backgroundColor: "#ecfdf5",
  color: "#047857",
  border: "1px solid #a7f3d0",
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

const infoBoxStyle: CSSProperties = {
  padding: "14px",
  borderRadius: "12px",
  backgroundColor: "#f8fafc",
  border: "1px solid #e2e8f0",
  marginBottom: "16px",
};

const infoLabelStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "13px",
  fontWeight: 800,
  marginBottom: "4px",
};

const infoValueStyle: CSSProperties = {
  color: "#0f172a",
  fontSize: "15px",
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
