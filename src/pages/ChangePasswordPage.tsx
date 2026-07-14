import { useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return "비밀번호는 최소 8자 이상이어야 합니다.";
  }
  if (!/[a-zA-Z]/.test(password)) {
    return "비밀번호에 영문을 포함해야 합니다.";
  }
  if (!/\d/.test(password)) {
    return "비밀번호에 숫자를 포함해야 합니다.";
  }
  if (!/[^a-zA-Z0-9]/.test(password)) {
    return "비밀번호에 특수문자를 포함해야 합니다.";
  }
  return null;
}

export default function ChangePasswordPage() {
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");

    if (newPassword !== confirmPassword) {
      setErrorMessage("새 비밀번호와 확인 비밀번호가 일치하지 않습니다.");
      return;
    }

    const validationError = validatePassword(newPassword);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (authError) {
        console.error("[ChangePasswordPage] catch 오류 - updateUser:", authError.message);
        setErrorMessage("비밀번호 변경에 실패했습니다. 다시 시도하세요.");
        return;
      }

      console.info("[ChangePasswordPage] updateUser 성공");

      const user = authData.user ?? (await supabase.auth.getUser()).data.user;

      if (!user) {
        setErrorMessage("로그인 정보를 확인하지 못했습니다.");
        return;
      }

      const { data: updatedProfile, error: profileError } = await supabase
        .from("user_profiles")
        .update({ must_change_password: false })
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .select("must_change_password")
        .maybeSingle();

      if (profileError) {
        console.error("[ChangePasswordPage] catch 오류 - profile update:", profileError.message);
      } else {
        console.info("[ChangePasswordPage] profile update 성공", updatedProfile);
      }

      console.info("[ChangePasswordPage] navigate 실행 직전:", "/dashboard");
      navigate("/dashboard", { replace: true });
    } catch (error) {
      console.error("[ChangePasswordPage] catch 오류:", error);
      setErrorMessage("비밀번호 변경 중 오류가 발생했습니다. 다시 시도하세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={pageStyle}>
      <section style={cardStyle}>
        <div style={headerStyle}>
          <div style={badgeStyle}>최초 로그인</div>
          <h1 style={titleStyle}>비밀번호 변경</h1>
          <p style={descriptionStyle}>
            테스트 계정은 최초 로그인 시 비밀번호를 변경해야 합니다.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={formStyle}>
          <label style={labelStyle}>
            새 비밀번호
            <input
              type="password"
              name="new-password"
              value={newPassword}
              autoComplete="new-password"
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="새 비밀번호 입력"
              required
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            새 비밀번호 확인
            <input
              type="password"
              name="confirm-password"
              value={confirmPassword}
              autoComplete="new-password"
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="새 비밀번호 다시 입력"
              required
              style={inputStyle}
            />
          </label>

          <p style={hintStyle}>
            8자 이상, 영문·숫자·특수문자를 포함해야 합니다.
          </p>

          {errorMessage ? <div style={errorBoxStyle}>{errorMessage}</div> : null}

          <button
            type="submit"
            disabled={loading}
            style={{
              ...submitButtonStyle,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "저장 중..." : "저장"}
          </button>
        </form>
      </section>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "40px 24px",
  boxSizing: "border-box",
  backgroundColor: "#f8fafc",
  fontFamily:
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const cardStyle: CSSProperties = {
  width: "100%",
  maxWidth: "430px",
  padding: "38px",
  borderRadius: "24px",
  backgroundColor: "#ffffff",
  boxShadow: "0 24px 80px rgba(15, 23, 42, 0.16)",
  border: "1px solid #e5e7eb",
  boxSizing: "border-box",
};

const headerStyle: CSSProperties = {
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
  lineHeight: 1.6,
};

const formStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "18px",
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

const hintStyle: CSSProperties = {
  margin: 0,
  fontSize: "13px",
  color: "#64748b",
  lineHeight: 1.5,
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

const submitButtonStyle: CSSProperties = {
  height: "48px",
  border: "none",
  borderRadius: "12px",
  backgroundColor: "#2563eb",
  color: "#ffffff",
  fontSize: "16px",
  fontWeight: 900,
  marginTop: "4px",
};
