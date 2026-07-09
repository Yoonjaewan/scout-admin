import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";

type RouteCheckState = {
  loading: boolean;
  allowed: boolean;
  reason?:
    | "not_authenticated"
    | "profile_not_found"
    | "not_approved";
};

export default function ApprovedRoute() {
  const location = useLocation();

  const [state, setState] = useState<RouteCheckState>({
    loading: true,
    allowed: false,
  });

  useEffect(() => {
    const checkPermission = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setState({
          loading: false,
          allowed: false,
          reason: "not_authenticated",
        });
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("user_profiles")
        .select("id, user_id, status, deleted_at")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .maybeSingle();

      if (profileError || !profile) {
        console.error("user_profiles 조회 오류:", profileError);

        setState({
          loading: false,
          allowed: false,
          reason: "profile_not_found",
        });
        return;
      }

      if (profile.status !== "approved") {
        setState({
          loading: false,
          allowed: false,
          reason: "not_approved",
        });
        return;
      }

      setState({
        loading: false,
        allowed: true,
      });
    };

    checkPermission();
  }, []);

  if (state.loading) {
    return (
      <div style={{ padding: "40px" }}>
        로그인 및 승인 상태를 확인하는 중입니다...
      </div>
    );
  }

  if (state.allowed) {
    return <Outlet />;
  }

  if (state.reason === "not_authenticated") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Navigate to="/pending-approval" replace />;
}