import { useEffect, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function LoginPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [inputLocked, setInputLocked] = useState(true);

  useEffect(() => {
    const resetLoginFields = () => {
      setEmail("");
      setPassword("");
    };

    resetLoginFields();
    const timeoutId = window.setTimeout(resetLoginFields, 200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setLoading(true);
    setErrorMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (error) {
      setErrorMessage("로그인에 실패했습니다. 이메일과 비밀번호를 확인하세요.");
      console.error("로그인 오류:", error.message);
      return;
    }

    navigate("/dashboard", { replace: true });
  };

  const moveToRegister = () => {
    navigate("/register");
  };

  return (
    <main style={pageStyle}>
      <div style={backgroundShapeStyle} />
      <div style={backgroundGlowStyle} />

      <section style={leftPanelStyle}>
        <div style={brandBoxStyle}>
          <div style={brandLabelStyle}>Scout Advancement Manager</div>
          <h1 style={brandTitleStyle}>스카우트 진급관리</h1>
          <p style={brandTextStyle}>
            대원 진급, 기능장 취득, 인가 기록을 체계적으로 관리하는
            스카우트 진급관리 시스템입니다.
          </p>
        </div>

        <div style={infoBoxStyle}>
          <h2 style={infoTitleStyle}>이용 절차</h2>
          <ol style={stepListStyle}>
            <li>이용신청</li>
            <li>최고관리자 승인</li>
            <li>승인된 계정으로 로그인</li>
            <li>권한에 따라 진급관리 기능 사용</li>
          </ol>
        </div>
      </section>

      <section style={rightPanelStyle}>
        <div style={loginCardStyle}>
          <div style={loginHeaderStyle}>
            <div style={badgeStyle}>계정 로그인</div>
            <h2 style={loginTitleStyle}>로그인</h2>
            <p style={loginDescriptionStyle}>
              이용 승인된 계정으로 로그인하세요.
            </p>
          </div>

          <form onSubmit={handleLogin} autoComplete="off" style={formStyle}>
            <input
              type="text"
              name="username"
              autoComplete="username"
              tabIndex={-1}
              aria-hidden="true"
              style={hiddenInputStyle}
            />
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              tabIndex={-1}
              aria-hidden="true"
              style={hiddenInputStyle}
            />

            <label style={labelStyle}>
              이메일
              <input
                type="email"
                name="scout-email-no-autofill"
                value={email}
                readOnly={inputLocked}
                autoComplete="new-password"
                onFocus={() => setInputLocked(false)}
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
                name="scout-password-no-autofill"
                value={password}
                readOnly={inputLocked}
                autoComplete="new-password"
                onFocus={() => setInputLocked(false)}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="비밀번호 입력"
                required
                style={inputStyle}
              />
            </label>

            {errorMessage && <div style={errorBoxStyle}>{errorMessage}</div>}

            <button
              type="submit"
              disabled={loading}
              style={{
                ...loginButtonStyle,
                opacity: loading ? 0.7 : 1,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "로그인 중..." : "로그인"}
            </button>
          </form>

          <div style={registerAreaStyle}>
            <span style={registerTextStyle}>아직 계정이 없나요?</span>
            <button
              type="button"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                moveToRegister();
              }}
              style={registerButtonStyle}
            >
              이용신청
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  gridTemplateColumns: "minmax(520px, 1fr) minmax(420px, 560px)",
  position: "relative",
  overflow: "hidden",
  backgroundColor: "#f8fafc",
  fontFamily:
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const backgroundShapeStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "74%",
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

const infoBoxStyle: CSSProperties = {
  width: "100%",
  maxWidth: "480px",
  padding: "22px 24px",
  borderRadius: "18px",
  backgroundColor: "rgba(15, 23, 42, 0.62)",
  border: "1px solid rgba(219, 234, 254, 0.24)",
  boxShadow: "0 18px 48px rgba(15, 23, 42, 0.18)",
  boxSizing: "border-box",
};

const infoTitleStyle: CSSProperties = {
  fontSize: "19px",
  margin: "0 0 14px",
  fontWeight: 900,
};

const stepListStyle: CSSProperties = {
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

const loginCardStyle: CSSProperties = {
  width: "100%",
  maxWidth: "430px",
  padding: "38px",
  borderRadius: "24px",
  backgroundColor: "#ffffff",
  boxShadow: "0 24px 80px rgba(15, 23, 42, 0.16)",
  border: "1px solid #e5e7eb",
  boxSizing: "border-box",
};

const loginHeaderStyle: CSSProperties = {
  marginBottom: "30px",
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

const loginTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "32px",
  fontWeight: 900,
  color: "#0f172a",
  letterSpacing: "-0.03em",
};

const loginDescriptionStyle: CSSProperties = {
  marginTop: "10px",
  marginBottom: 0,
  color: "#64748b",
  fontSize: "15px",
};

const formStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "18px",
};

const hiddenInputStyle: CSSProperties = {
  position: "absolute",
  width: 0,
  height: 0,
  opacity: 0,
  pointerEvents: "none",
};

const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  fontSize: "14px",
  fontWeight: 800,
  color: "#334155",
};

const inputStyle: CSSProperties = {
  height: "46px",
  borderRadius: "12px",
  border: "1px solid #cbd5e1",
  padding: "0 14px",
  fontSize: "15px",
  outline: "none",
  boxSizing: "border-box",
};

const errorBoxStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: "12px",
  backgroundColor: "#fef2f2",
  color: "#b91c1c",
  border: "1px solid #fecaca",
  fontSize: "14px",
  lineHeight: "1.5",
};

const loginButtonStyle: CSSProperties = {
  height: "48px",
  border: "none",
  borderRadius: "12px",
  backgroundColor: "#2563eb",
  color: "#ffffff",
  fontSize: "16px",
  fontWeight: 900,
  marginTop: "4px",
};

const registerAreaStyle: CSSProperties = {
  marginTop: "24px",
  paddingTop: "24px",
  borderTop: "1px solid #e5e7eb",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
};

const registerTextStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "14px",
};

const registerButtonStyle: CSSProperties = {
  color: "#2563eb",
  fontWeight: 900,
  textDecoration: "none",
  fontSize: "14px",
  border: "none",
  backgroundColor: "transparent",
  padding: 0,
  cursor: "pointer",
  fontFamily: "inherit",
};
