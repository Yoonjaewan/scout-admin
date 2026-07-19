import { createClient } from "npm:@supabase/supabase-js@2";

type JsonRecord = Record<string, unknown>;

type ManageOrgAdminPasswordRequest = {
  action?: "list" | "reset_password";
  user_id?: string;
};

type OrgAdminListItem = {
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getText(row: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = asTrimmedString(row[key]);
    if (value) return value;
  }
  return "";
}

function randomPassword(length = 10) {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return `Sc!${out.slice(0, 7)}`;
}

function normalizeOrganizationStatus(status: unknown) {
  return asTrimmedString(status).toLowerCase();
}

function isOrganizationActive(status: unknown) {
  return normalizeOrganizationStatus(status) === "active";
}

function organizationStatusLabel(status: unknown) {
  const normalized = normalizeOrganizationStatus(status);
  if (normalized === "active") return "이용중";
  if (normalized === "suspended" || normalized === "inactive") return "이용중지";
  if (normalized === "closed") return "이용종료";
  if (!normalized) return "미확인";
  return normalized;
}

function profileStatusLabel(status: unknown) {
  const normalized = asTrimmedString(status).toLowerCase();
  if (normalized === "approved" || normalized === "active") return "승인";
  if (normalized === "pending") return "승인대기";
  if (normalized === "rejected") return "반려";
  if (!normalized) return "미확인";
  return normalized;
}

function getProfileStatus(row: JsonRecord) {
  // manage-test-users와 동일: approval_status 또는 status, 없으면 approved
  return getText(row, ["approval_status", "status"]) || "approved";
}

function isApprovedProfileStatus(status: string) {
  return ["approved", "active"].includes(status.toLowerCase());
}

function denyCaller(reason: string, status = 403) {
  console.error("[manage-org-admin-password] caller_denied", reason);
  return jsonResponse(
    { ok: false, message: "비밀번호 초기화 권한이 없습니다." },
    status,
  );
}

function resolveResetEligibility(input: {
  role: unknown;
  isTestUser: unknown;
  deletedAt: unknown;
  approvalStatus: unknown;
  organizationId: unknown;
  organizationDeletedAt: unknown;
  organizationStatus: unknown;
}) {
  const role = asTrimmedString(input.role).toLowerCase();
  const approvalStatus = asTrimmedString(input.approvalStatus).toLowerCase() ||
    "approved";

  if (role !== "org_admin") {
    return {
      canReset: false,
      reason: "소속대 관리자 계정만 초기화할 수 있습니다.",
    };
  }

  if (input.isTestUser === true) {
    return {
      canReset: false,
      reason: "테스트 계정은 테스트 계정 관리에서 초기화하세요.",
    };
  }

  if (input.deletedAt) {
    return {
      canReset: false,
      reason: "대상 사용자를 찾을 수 없습니다.",
    };
  }

  if (!isApprovedProfileStatus(approvalStatus)) {
    return {
      canReset: false,
      reason: "승인된 소속대 관리자만 초기화할 수 있습니다.",
    };
  }

  if (!asTrimmedString(input.organizationId)) {
    return {
      canReset: false,
      reason: "이용 중인 소속대 관리자만 초기화할 수 있습니다.",
    };
  }

  if (input.organizationDeletedAt) {
    return {
      canReset: false,
      reason: "이용 중인 소속대 관리자만 초기화할 수 있습니다.",
    };
  }

  if (!isOrganizationActive(input.organizationStatus)) {
    return {
      canReset: false,
      reason: "이용 중인 소속대 관리자만 초기화할 수 있습니다.",
    };
  }

  return { canReset: true, reason: null as string | null };
}

function toListItem(
  row: JsonRecord,
  email: string,
): OrgAdminListItem {
  const organization = isRecord(row.organizations) ? row.organizations : null;
  const profileStatus = getProfileStatus(row);
  const authUserId = getText(row, ["user_id"]) || getText(row, ["id"]);
  const eligibility = resolveResetEligibility({
    role: row.role,
    isTestUser: row.is_test_user,
    deletedAt: row.deleted_at,
    approvalStatus: profileStatus,
    organizationId: row.organization_id,
    organizationDeletedAt: organization?.deleted_at,
    organizationStatus: organization?.status,
  });

  return {
    id: authUserId,
    email,
    full_name: getText(row, ["name", "full_name"]) || email || "-",
    organization_id: asTrimmedString(row.organization_id) || null,
    organization_name: organization
      ? asTrimmedString(organization.name) || null
      : null,
    unit_number: organization
      ? asTrimmedString(organization.unit_number) || null
      : null,
    organization_status: organization
      ? normalizeOrganizationStatus(organization.status) || null
      : null,
    approval_status: profileStatus || null,
    must_change_password: row.must_change_password === true,
    can_reset_password: eligibility.canReset,
    reset_blocked_reason: eligibility.reason,
  };
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return jsonResponse(
        { ok: false, message: "POST 요청만 지원합니다." },
        405,
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error("[manage-org-admin-password] missing_env");
      return jsonResponse(
        {
          ok: false,
          message:
            "비밀번호를 초기화하지 못했습니다. 잠시 후 다시 시도하세요.",
        },
        500,
      );
    }

    const authorization = req.headers.get("Authorization") || "";
    const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();

    if (!accessToken) {
      return denyCaller("missing_authorization", 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(accessToken);

    if (userError || !user) {
      return denyCaller("invalid_token", 401);
    }

    // manage-test-users와 동일: user_profiles + user_id
    const { data: callerProfileData, error: callerProfileError } =
      await adminClient
        .from("user_profiles")
        .select("*")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .maybeSingle();

    if (callerProfileError) {
      console.error(
        "[manage-org-admin-password] caller_profile_lookup_failed",
        callerProfileError.message,
      );
      return denyCaller("profile_lookup_failed", 500);
    }

    const callerProfile = (callerProfileData ?? null) as JsonRecord | null;
    if (!callerProfile) {
      return denyCaller("profile_not_found", 403);
    }

    const callerRole = getText(callerProfile, ["role"]);
    const callerStatus = getProfileStatus(callerProfile);

    if (callerRole !== "super_admin") {
      return denyCaller("role_not_allowed", 403);
    }

    if (!isApprovedProfileStatus(callerStatus)) {
      return denyCaller("account_not_approved", 403);
    }

    let payload: ManageOrgAdminPasswordRequest = {};
    try {
      payload = (await req.json()) as ManageOrgAdminPasswordRequest;
    } catch {
      return jsonResponse(
        { ok: false, message: "요청 본문이 올바르지 않습니다." },
        400,
      );
    }

    const action = asTrimmedString(payload.action);

    if (action === "list") {
      const { data, error } = await adminClient
        .from("user_profiles")
        .select(
          "id, user_id, name, role, status, organization_id, is_test_user, must_change_password, deleted_at, organizations(id, name, unit_number, status, deleted_at)",
        )
        .eq("role", "org_admin")
        .eq("is_test_user", false)
        .is("deleted_at", null)
        .order("name", { ascending: true });

      if (error) {
        console.error("[manage-org-admin-password] list failed", error.message);
        return jsonResponse(
          {
            ok: false,
            message: "소속대 관리자 목록을 불러오지 못했습니다.",
          },
          500,
        );
      }

      const rows = (data ?? []) as JsonRecord[];
      const users = await Promise.all(
        rows.map(async (row) => {
          const authUserId = getText(row, ["user_id"]);
          let email = "";
          if (authUserId) {
            const { data: authUserData } = await adminClient.auth.admin
              .getUserById(authUserId);
            email = authUserData?.user?.email || "";
          }
          return toListItem(row, email);
        }),
      );

      return jsonResponse({
        ok: true,
        users,
      });
    }

    if (action !== "reset_password") {
      return jsonResponse(
        { ok: false, message: "지원하지 않는 요청입니다." },
        400,
      );
    }

    const targetUserId = asTrimmedString(payload.user_id);
    if (!targetUserId) {
      return jsonResponse(
        { ok: false, message: "대상 사용자를 찾을 수 없습니다." },
        400,
      );
    }

    const { data: targetProfileData, error: targetProfileError } =
      await adminClient
        .from("user_profiles")
        .select(
          "id, user_id, name, role, status, organization_id, is_test_user, must_change_password, deleted_at, organizations(id, name, unit_number, status, deleted_at)",
        )
        .eq("user_id", targetUserId)
        .is("deleted_at", null)
        .maybeSingle();

    if (targetProfileError) {
      console.error(
        "[manage-org-admin-password] target profile lookup failed",
        targetProfileError.message,
      );
      return jsonResponse(
        {
          ok: false,
          message: "비밀번호를 초기화하지 못했습니다. 잠시 후 다시 시도하세요.",
        },
        500,
      );
    }

    if (!targetProfileData) {
      return jsonResponse(
        { ok: false, message: "대상 사용자를 찾을 수 없습니다." },
        404,
      );
    }

    const targetProfile = targetProfileData as JsonRecord;
    const organization = isRecord(targetProfile.organizations)
      ? targetProfile.organizations
      : null;
    const targetStatus = getProfileStatus(targetProfile);

    const eligibility = resolveResetEligibility({
      role: targetProfile.role,
      isTestUser: targetProfile.is_test_user,
      deletedAt: targetProfile.deleted_at,
      approvalStatus: targetStatus,
      organizationId: targetProfile.organization_id,
      organizationDeletedAt: organization?.deleted_at,
      organizationStatus: organization?.status,
    });

    if (!eligibility.canReset) {
      const reason = eligibility.reason ||
        "비밀번호를 초기화하지 못했습니다. 잠시 후 다시 시도하세요.";
      return jsonResponse({ ok: false, message: reason }, 400);
    }

    const {
      data: authUserData,
      error: authUserError,
    } = await adminClient.auth.admin.getUserById(targetUserId);

    if (authUserError || !authUserData?.user) {
      return jsonResponse(
        { ok: false, message: "대상 사용자를 찾을 수 없습니다." },
        404,
      );
    }

    const temporaryPassword = randomPassword();

    const { error: passwordUpdateError } = await adminClient.auth.admin
      .updateUserById(targetUserId, {
        password: temporaryPassword,
      });

    if (passwordUpdateError) {
      console.error(
        "[manage-org-admin-password] auth password update failed",
        passwordUpdateError.message,
      );
      return jsonResponse(
        {
          ok: false,
          message: "비밀번호를 초기화하지 못했습니다. 잠시 후 다시 시도하세요.",
        },
        500,
      );
    }

    const { error: profileUpdateError } = await adminClient
      .from("user_profiles")
      .update({ must_change_password: true })
      .eq("user_id", targetUserId)
      .is("deleted_at", null);

    if (profileUpdateError) {
      console.error(
        "[manage-org-admin-password] must_change_password update failed after auth password reset",
        {
          targetUserId,
          message: profileUpdateError.message,
        },
      );
      return jsonResponse(
        {
          ok: false,
          message: "비밀번호를 초기화하지 못했습니다. 잠시 후 다시 시도하세요.",
          partial_failure: true,
        },
        500,
      );
    }

    const email = authUserData.user.email || "";
    const fullName = getText(targetProfile, ["name", "full_name"]) || email ||
      "-";

    return jsonResponse({
      ok: true,
      message: "소속대 관리자 비밀번호를 초기화했습니다.",
      temporary_password: temporaryPassword,
      user: {
        id: targetUserId,
        email,
        full_name: fullName,
        organization_id: asTrimmedString(targetProfile.organization_id) || null,
        organization_name: organization
          ? asTrimmedString(organization.name) || null
          : null,
        unit_number: organization
          ? asTrimmedString(organization.unit_number) || null
          : null,
        organization_status: organization
          ? normalizeOrganizationStatus(organization.status) || null
          : null,
        organization_status_label: organizationStatusLabel(organization?.status),
        approval_status: targetStatus || null,
        approval_status_label: profileStatusLabel(targetStatus),
        must_change_password: true,
      },
    });
  } catch (error) {
    console.error(
      "[manage-org-admin-password] unexpected error",
      error instanceof Error ? error.message : String(error),
    );
    return jsonResponse(
      {
        ok: false,
        message: "비밀번호를 초기화하지 못했습니다. 잠시 후 다시 시도하세요.",
      },
      500,
    );
  }
});
