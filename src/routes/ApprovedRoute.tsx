import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";

type RouteCheckState = {
  loading: boolean;
  allowed: boolean;
  mustChangePassword: boolean;
  reason?:
    | "not_authenticated"
    | "profile_not_found"
    | "not_approved"
    | "organization_suspended"
    | "organization_closed"
    | "organization_unavailable";
  organizationName?: string;
};

function isRestrictedOrganizationStatus(status: string | null | undefined) {
  return status === "suspended" || status === "inactive" || status === "closed";
}

export default function ApprovedRoute() {
  const location = useLocation();

  const [state, setState] = useState<RouteCheckState>({
    loading: true,
    allowed: false,
    mustChangePassword: false,
  });

  useEffect(() => {
    setState((prev) => ({
      ...prev,
      loading: true,
    }));

    const checkPermission = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setState({
          loading: false,
          allowed: false,
          mustChangePassword: false,
          reason: "not_authenticated",
        });
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("user_profiles")
        .select("id, user_id, role, organization_id, status, deleted_at, must_change_password")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .maybeSingle();

      if (profileError || !profile) {
        console.error("user_profiles 조회 오류:", profileError);

        setState({
          loading: false,
          allowed: false,
          mustChangePassword: false,
          reason: "profile_not_found",
        });
        return;
      }

      if (profile.status !== "approved") {
        setState({
          loading: false,
          allowed: false,
          mustChangePassword: false,
          reason: "not_approved",
        });
        return;
      }

      const mustChangePassword = profile.must_change_password === true;

      if (mustChangePassword) {
        if (location.pathname === "/change-password") {
          setState({
            loading: false,
            allowed: true,
            mustChangePassword: true,
          });
          return;
        }

        setState({
          loading: false,
          allowed: false,
          mustChangePassword: true,
        });
        return;
      }

      if (profile.role === "super_admin") {
        setState({
          loading: false,
          allowed: true,
          mustChangePassword,
        });
        return;
      }

      if (profile.organization_id) {
        const { data: organization, error: organizationError } = await supabase
          .from("organizations")
          .select("name, status")
          .eq("id", profile.organization_id)
          .is("deleted_at", null)
          .maybeSingle();

        if (organizationError || !organization) {
          console.error("소속대 상태 조회 오류:", organizationError);

          setState({
            loading: false,
            allowed: false,
            mustChangePassword: false,
            reason: "organization_unavailable",
            organizationName: "소속대",
          });
          return;
        }

        const organizationStatus =
          typeof organization.status === "string" ? organization.status : "active";
        const organizationName =
          typeof organization.name === "string" && organization.name.trim()
            ? organization.name.trim()
            : "소속대";

        if (isRestrictedOrganizationStatus(organizationStatus)) {
          setState({
            loading: false,
            allowed: false,
            mustChangePassword: false,
            reason:
              organizationStatus === "closed"
                ? "organization_closed"
                : "organization_suspended",
            organizationName,
          });
          return;
        }
      }

      setState({
        loading: false,
        allowed: true,
        mustChangePassword,
      });
    };

    checkPermission();
  }, [location.pathname]);

  if (state.loading) {
    return (
      <div style={{ padding: "40px" }}>
        로그인 및 승인 상태를 확인하는 중입니다...
      </div>
    );
  }

  if (state.mustChangePassword && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  if (state.allowed) {
    return <Outlet />;
  }

  if (state.reason === "not_authenticated") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (
    state.reason === "organization_suspended" ||
    state.reason === "organization_closed" ||
    state.reason === "organization_unavailable"
  ) {
    const statusLabel =
      state.reason === "organization_closed"
        ? "이용종료"
        : state.reason === "organization_unavailable"
          ? "확인 필요"
          : "이용중지";

    return (
      <div
        style={{
          minHeight: "100vh",
          padding: "40px",
          boxSizing: "border-box",
          backgroundColor: "#f8fafc",
          color: "#0f172a",
        }}
      >
        <section
          style={{
            maxWidth: "640px",
            padding: "28px",
            borderRadius: "18px",
            border: "1px solid #e5e7eb",
            backgroundColor: "#ffffff",
            boxShadow: "0 12px 32px rgba(15, 23, 42, 0.06)",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              padding: "7px 11px",
              borderRadius: "999px",
              backgroundColor:
                state.reason === "organization_closed" ? "#e2e8f0" : "#fef3c7",
              color:
                state.reason === "organization_closed" ? "#334155" : "#92400e",
              fontSize: "13px",
              fontWeight: 900,
              marginBottom: "14px",
            }}
          >
            {statusLabel}
          </div>

          <h1 style={{ margin: 0, fontSize: "28px", fontWeight: 900 }}>
            {state.reason === "organization_unavailable"
              ? "소속대 정보를 확인할 수 없습니다"
              : "소속대 이용이 제한되어 있습니다"}
          </h1>
          <p
            style={{
              marginTop: "12px",
              marginBottom: "20px",
              color: "#475569",
              lineHeight: 1.7,
            }}
          >
            {state.reason === "organization_unavailable"
              ? "소속대 이용 상태를 확인할 수 없어 업무 화면을 사용할 수 없습니다. 최고관리자에게 문의하세요."
              : `${state.organizationName || "현재 소속대"}는 현재 ${statusLabel} 상태입니다. 기존 기록은 보존되지만, 업무 화면은 사용할 수 없습니다. 이용 재개가 필요한 경우 최고관리자에게 문의하세요.`}
          </p>

          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/login";
            }}
            style={{
              height: "42px",
              padding: "0 16px",
              border: "none",
              borderRadius: "10px",
              backgroundColor: "#ef4444",
              color: "#ffffff",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            로그아웃
          </button>
        </section>
      </div>
    );
  }

  return <Navigate to="/pending-approval" replace />;
}