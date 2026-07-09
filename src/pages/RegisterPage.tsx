import { useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

type OrganizationType = "local" | "school";
type RequestedRole = "org_admin" | "leader" | "viewer";

const ORGANIZATION_TYPE_LABELS: Record<OrganizationType, string> = {
  school: "학교대",
  local: "지역대",
};

const REQUESTED_ROLE_LABELS: Record<RequestedRole, string> = {
  org_admin: "조직관리자",
  leader: "지도자",
  viewer: "조회전용",
};

export default function RegisterPage() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [organizationType, setOrganizationType] =
    useState<OrganizationType>("school");
  const [organizationName, setOrganizationName] = useState("");
  const [requestedRole, setRequestedRole] =
    useState<RequestedRole>("org_admin");
  const [note, setNote] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setLoading(true);
    setErrorMessage("");

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();
    const cleanOrganizationName = organizationName.trim();
    const cleanNote = note.trim();

    if (!cleanName) {
      setErrorMessage("이름을 입력하세요.");
      setLoading(false);
      return;
    }

    if (!cleanEmail) {
      setErrorMessage("이메일을 입력하세요.");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setErrorMessage("비밀번호는 6자 이상 입력하세요.");
      setLoading(false);
      return;
    }

    if (!cleanOrganizationName) {
      setErrorMessage("소속대명을 입력하세요.");
      setLoading(false);
      return;
    }

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          name: cleanName,
          phone: cleanPhone || null,
          organization_type: organizationType,
          organization_name: cleanOrganizationName,
          requested_role: requestedRole,
        },
      },
    });

    if (signUpError) {
      console.error("회원가입 오류:", signUpError.message);

      setErrorMessage(
        signUpError.message.toLowerCase().includes("already")
          ? "이미 등록된 이메일입니다. 로그인하거나 다른 이메일을 사용하세요."
          : "이용신청에 실패했습니다. 입력 내용을 확인한 뒤 다시 시도하세요.",
      );

      setLoading(false);
      return;
    }

    const authUserId = signUpData.user?.id ?? null;

    const { error: requestError } = await supabase
      .from("signup_requests")
      .insert({
        auth_user_id: authUserId,
        email: cleanEmail,
        name: cleanName,
        phone: cleanPhone || null,
        organization_type: organizationType,
        organization_name: cleanOrganizationName,
        requested_role: requestedRole,
        status: "pending",
        note: cleanNote || null,
      });

    if (requestError) {
      console.error("이용신청 저장 오류:", requestError.message);

      setErrorMessage(
        "계정은 생성되었지만 이용신청 저장에 실패했습니다. 최고관리자에게 문의하세요.",
      );

      setLoading(false);
      return;
    }

    setLoading(false);
    navigate("/pending-approval", { replace: true });
  };

  return (
    <main style={pageStyle}>
      <div style={backgroundShapeStyle} />
      <div style={backgroundGlowStyle} />

      <section style={leftPanelStyle}>
        <div style={brandBoxStyle}>
          <div style={brandLabelStyle}>Scout Advancement Manager</div>
          <h1 style={brandTitleStyle}>이용신청</h1>
          <p style={brandTextStyle}>
            스카우트 진급관리 프로그램을 사용하기 위한 계정과 소속대 정보를
            신청합니다. 최고관리자 승인 후 로그인하여 사용할 수 있습니다.
          </p>
        </div>

        <div style={guideBoxStyle}>
          <h2 style={guideTitleStyle}>이용 절차</h2>
          <ol style={guideListStyle}>
            <li>신청자 정보와 소속대 정보 입력</li>
            <li>최고관리자 승인</li>
            <li>승인된 계정으로 로그인</li>
            <li>권한에 따라 진급관리 기능 사용</li>
          </ol>
        </div>
      </section>

      <section style={rightPanelStyle}>
        <form onSubmit={handleSubmit} autoComplete="off" style={cardStyle}>
          <div style={headerStyle}>
            <div style={badgeStyle}>계정 신청</div>
            <h2 style={titleStyle}>이용신청</h2>
            <p style={descriptionStyle}>
              신청자 정보와 소속대 정보를 입력하세요.
            </p>
          </div>

          <div style={formGridStyle}>
            <label style={labelStyle}>
              이름
              <input
                type="text"
                value={name}
                autoComplete="name"
                onChange={(event) => setName(event.target.value)}
                placeholder="홍길동"
                required
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              연락처
              <input
                type="tel"
                value={phone}
                autoComplete="tel"
                onChange={(event) => setPhone(event.target.value)}
                placeholder="010-0000-0000"
                style={inputStyle}
              />
            </label>
          </div>

          <label style={labelStyle}>
            이메일
            <input
              type="email"
              value={email}
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="이메일 입력"
              required
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            비밀번호
            <input
              type="password"
              value={password}
              autoComplete="new-password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="6자 이상"
              required
              style={inputStyle}
            />
          </label>

          <div style={formGridStyle}>
            <label style={labelStyle}>
              소속대 구분
              <select
                value={organizationType}
                onChange={(event) =>
                  setOrganizationType(event.target.value as OrganizationType)
                }
                required
                style={inputStyle}
              >
                {Object.entries(ORGANIZATION_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelStyle}>
              신청 권한
              <select
                value={requestedRole}
                onChange={(event) =>
                  setRequestedRole(event.target.value as RequestedRole)
                }
                required
                style={inputStyle}
              >
                {Object.entries(REQUESTED_ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label style={labelStyle}>
            소속대명
            <input
              type="text"
              value={organizationName}
              onChange={(event) => setOrganizationName(event.target.value)}
              placeholder="예: 테스트학교대, 테스트지역대"
              required
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            비고
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="필요 시 신청 사유나 소속 정보를 입력하세요."
              rows={4}
              style={textareaStyle}
            />
          </label>

          {errorMessage && <div style={errorBoxStyle}>{errorMessage}</div>}

          <button
            type="submit"
            disabled={loading}
            style={{
              ...submitButtonStyle,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "신청 처리 중..." : "이용신청 접수"}
          </button>

          <div style={footerStyle}>
            <span style={footerTextStyle}>이미 승인된 계정이 있나요?</span>
            <Link to="/login" style={footerLinkStyle}>
              로그인
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  gridTemplateColumns: "minmax(520px, 1fr) minmax(520px, 680px)",
  position: "relative",
  overflow: "hidden",
  backgroundColor: "#f8fafc",
  fontFamily:
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const backgroundShapeStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "75%",
  background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)",
  clipPath: "polygon(0 0, 78% 0, 52% 100%, 0 100%)",
  zIndex: 0,
};

const backgroundGlowStyle: CSSProperties = {
  position: "absolute",
  left: "34%",
  bottom: "-180px",
  width: "420px",
  height: "420px",
  borderRadius: "999px",
  background: "rgba(191, 219, 254, 0.2)",
  filter: "blur(48px)",
  zIndex: 0,
};

const leftPanelStyle: CSSProperties = {
  position: "relative",
  zIndex: 1,
  padding: "72px 64px",
  color: "#ffffff",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: "48px",
  boxSizing: "border-box",
};

const brandBoxStyle: CSSProperties = {
  maxWidth: "640px",
};

const brandLabelStyle: CSSProperties = {
  fontSize: "14px",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "#bfdbfe",
  marginBottom: "20px",
  fontWeight: 800,
};

const brandTitleStyle: CSSProperties = {
  fontSize: "48px",
  lineHeight: "1.15",
  margin: 0,
  fontWeight: 900,
  letterSpacing: "-0.04em",
};

const brandTextStyle: CSSProperties = {
  maxWidth: "560px",
  marginTop: "24px",
  marginBottom: 0,
  fontSize: "18px",
  lineHeight: "1.75",
  color: "#dbeafe",
  wordBreak: "keep-all",
};

const guideBoxStyle: CSSProperties = {
  width: "100%",
  maxWidth: "500px",
  padding: "22px 24px",
  borderRadius: "18px",
  backgroundColor: "rgba(15, 23, 42, 0.62)",
  border: "1px solid rgba(219, 234, 254, 0.24)",
  boxShadow: "0 18px 48px rgba(15, 23, 42, 0.18)",
  boxSizing: "border-box",
};

const guideTitleStyle: CSSProperties = {
  fontSize: "19px",
  margin: "0 0 14px",
  fontWeight: 900,
};

const guideListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: "22px",
  lineHeight: "1.85",
  color: "#e0f2fe",
  fontSize: "15px",
};

const rightPanelStyle: CSSProperties = {
  position: "relative",
  zIndex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "48px 56px 48px 24px",
  boxSizing: "border-box",
};

const cardStyle: CSSProperties = {
  width: "100%",
  maxWidth: "620px",
  padding: "38px",
  borderRadius: "24px",
  backgroundColor: "#ffffff",
  boxShadow: "0 24px 80px rgba(15, 23, 42, 0.16)",
  border: "1px solid #e5e7eb",
  boxSizing: "border-box",
};

const headerStyle: CSSProperties = {
  marginBottom: "28px",
};

const badgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "6px 12px",
  borderRadius: "999px",
  backgroundColor: "#dbeafe",
  color: "#1d4ed8",
  fontSize: "13px",
  fontWeight: 800,
  marginBottom: "16px",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: "32px",
  fontWeight: 900,
  color: "#0f172a",
  letterSpacing: "-0.03em",
};

const descriptionStyle: CSSProperties = {
  marginTop: "10px",
  marginBottom: 0,
  color: "#64748b",
  fontSize: "15px",
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
  height: "46px",
  borderRadius: "12px",
  border: "1px solid #cbd5e1",
  padding: "0 14px",
  fontSize: "15px",
  outline: "none",
  boxSizing: "border-box",
  backgroundColor: "#ffffff",
};

const textareaStyle: CSSProperties = {
  minHeight: "96px",
  borderRadius: "12px",
  border: "1px solid #cbd5e1",
  padding: "12px 14px",
  fontSize: "15px",
  outline: "none",
  resize: "vertical",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const errorBoxStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: "12px",
  backgroundColor: "#fef2f2",
  color: "#b91c1c",
  border: "1px solid #fecaca",
  fontSize: "14px",
  lineHeight: "1.5",
  marginBottom: "16px",
};

const submitButtonStyle: CSSProperties = {
  width: "100%",
  height: "50px",
  border: "none",
  borderRadius: "12px",
  backgroundColor: "#2563eb",
  color: "#ffffff",
  fontSize: "16px",
  fontWeight: 900,
  marginTop: "4px",
};

const footerStyle: CSSProperties = {
  marginTop: "24px",
  paddingTop: "24px",
  borderTop: "1px solid #e5e7eb",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
};

const footerTextStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "14px",
};

const footerLinkStyle: CSSProperties = {
  color: "#2563eb",
  fontWeight: 900,
  textDecoration: "none",
  fontSize: "14px",
};
