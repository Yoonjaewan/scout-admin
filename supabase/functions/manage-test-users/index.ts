import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type TestUserRole = "org_admin" | "leader" | "viewer";
type Action = "create" | "list" | "delete" | "reset_password";

type RequestBody = {
  action?: Action;
  organization_id?: string;
  role?: TestUserRole;
  count?: number;
  expiry_days?: number;
  user_ids?: string[];
};

type UnknownRow = Record<string, unknown>;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function getText(row: UnknownRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function isTestUserRole(value: unknown): value is TestUserRole {
  return value === "org_admin" || value === "leader" || value === "viewer";
}

function normalizeCount(value: unknown) {
  const count = Number(value);
  return count === 1 || count === 3 || count === 5 ? count : 1;
}

function normalizeExpiryDays(value: unknown) {
  const days = Number(value);
  return days === 7 || days === 14 || days === 30 ? days : 14;
}

function normalizeOrganizationCode(
  unitNumber: string | null | undefined,
  organizationId: string,
): string {
  const rawSource =
    typeof unitNumber === "string" && unitNumber.trim()
      ? unitNumber.trim()
      : organizationId.slice(0, 6);

  const normalized = rawSource
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");

  if (normalized) return normalized;

  return organizationId
    .slice(0, 6)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "") || "org";
}

function buildTestUserEmail(
  organizationCode: string,
  sequence: number,
  emailDomain: string,
) {
  return `t-${organizationCode}-${String(sequence).padStart(2, "0")}@${emailDomain}`;
}

function getTestUserEmailPattern(
  organizationCode: string,
  emailDomain: string,
) {
  const escapedCode = organizationCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedDomain = emailDomain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return new RegExp(`^t-${escapedCode}-(\\d{2})@${escapedDomain}$`, "i");
}

function getMaxTestUserSequence(
  emails: string[],
  organizationCode: string,
  emailDomain: string,
) {
  const pattern = getTestUserEmailPattern(organizationCode, emailDomain);
  let maxSequence = 0;

  for (const email of emails) {
    const match = email.match(pattern);
    if (!match) continue;

    const sequence = Number.parseInt(match[1], 10);
    if (Number.isFinite(sequence) && sequence > maxSequence) {
      maxSequence = sequence;
    }
  }

  return maxSequence;
}

function isDuplicateEmailError(error: { message?: string } | null | undefined) {
  if (!error?.message) return false;

  const message = error.message.toLowerCase();
  return (
    message.includes("already been registered") ||
    message.includes("already exists") ||
    message.includes("duplicate")
  );
}

async function listAuthUserEmails(
  adminClient: ReturnType<typeof createClient>,
) {
  const emails: string[] = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw error;
    }

    const users = data.users ?? [];

    for (const authUser of users) {
      if (typeof authUser.email === "string" && authUser.email.trim()) {
        emails.push(authUser.email.trim().toLowerCase());
      }
    }

    if (users.length < perPage) {
      break;
    }

    page += 1;
  }

  return emails;
}

function getProfileStatus(row: UnknownRow) {
  return getText(row, ["approval_status", "status"]) || "approved";
}

function normalizeUserIds(value: unknown) {
  return Array.isArray(value)
    ? Array.from(
        new Set(
          value.filter(
            (item): item is string =>
              typeof item === "string" && item.length > 0,
          ),
        ),
      )
    : [];
}

function randomPassword() {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(7);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(
    bytes,
    (byte) => alphabet[byte % alphabet.length],
  ).join("");
  return `Sc!${suffix}`;
}

async function saveTestProfile(
  adminClient: ReturnType<typeof createClient>,
  payload: {
    user_id: string;
    name: string;
    role: TestUserRole;
    organization_id: string;
    is_test_user: boolean;
    test_expires_at: string;
    must_change_password: boolean;
  },
) {
  // 현재 프로젝트의 user_profiles에는 email 컬럼은 없지만
  // name 컬럼은 NOT NULL이므로 표시 이름은 프로필에도 저장합니다.
  // 승인 상태 컬럼명은 approval_status 또는 status일 수 있어 순서대로 시도합니다.
  const attempts: UnknownRow[] = [
    { ...payload, approval_status: "approved", status: "approved" },
    { ...payload, approval_status: "approved" },
    { ...payload, status: "approved" },
    payload,
  ];

  let lastMessage = "프로필 저장 오류";

  for (const attempt of attempts) {
    const { data: existingProfile, error: lookupError } = await adminClient
      .from("user_profiles")
      .select("id, user_id")
      .eq("user_id", payload.user_id)
      .maybeSingle();

    if (lookupError) {
      lastMessage = lookupError.message;
      continue;
    }

    if (existingProfile) {
      const { error: updateError } = await adminClient
        .from("user_profiles")
        .update(attempt)
        .eq("user_id", payload.user_id);

      if (!updateError) return null;

      lastMessage = updateError.message;
      continue;
    }

    const { error: insertError } = await adminClient
      .from("user_profiles")
      .insert(attempt);

    if (!insertError) return null;

    lastMessage = insertError.message;
  }

  return lastMessage;
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
    const emailDomain = (
      Deno.env.get("TEST_USER_EMAIL_DOMAIN") || "test.com"
    )
      .replace(/^@+/, "")
      .trim();

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Edge Function 환경 변수가 준비되지 않았습니다. Supabase 프로젝트 연결과 함수 배포 상태를 확인하세요.",
        },
        500,
      );
    }

    const authorization = req.headers.get("Authorization") || "";
    const accessToken = authorization
      .replace(/^Bearer\s+/i, "")
      .trim();

    if (!accessToken) {
      return jsonResponse(
        { ok: false, message: "로그인 정보가 없습니다." },
        401,
      );
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
      return jsonResponse(
        { ok: false, message: "로그인 사용자를 확인하지 못했습니다." },
        401,
      );
    }

    // 특정 컬럼명을 지정하지 않고 전체 조회하여
    // approval_status/status 컬럼 차이로 인한 500 오류를 방지합니다.
    const { data: callerProfileData, error: callerProfileError } =
      await adminClient
        .from("user_profiles")
        .select("*")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .maybeSingle();

    if (callerProfileError) {
      return jsonResponse(
        {
          ok: false,
          message: `최고관리자 권한 확인 실패: ${callerProfileError.message}`,
        },
        500,
      );
    }

    const callerProfile =
      (callerProfileData ?? null) as UnknownRow | null;
    const callerRole = callerProfile
      ? getText(callerProfile, ["role"])
      : null;
    const callerStatus = callerProfile
      ? getText(callerProfile, ["approval_status", "status"]) || "approved"
      : null;

    if (
      !callerProfile ||
      callerRole !== "super_admin" ||
      !["approved", "active"].includes(callerStatus || "")
    ) {
      return jsonResponse(
        { ok: false, message: "최고관리자만 사용할 수 있습니다." },
        403,
      );
    }

    let body: RequestBody;

    try {
      body = (await req.json()) as RequestBody;
    } catch {
      return jsonResponse(
        { ok: false, message: "요청 형식이 올바르지 않습니다." },
        400,
      );
    }

    const action = body.action;

    if (action === "list") {
      if (!body.organization_id) {
        return jsonResponse(
          { ok: false, message: "소속대가 선택되지 않았습니다." },
          400,
        );
      }

      const { data, error } = await adminClient
        .from("user_profiles")
        .select("*")
        .eq("organization_id", body.organization_id)
        .eq("is_test_user", true)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) {
        return jsonResponse(
          {
            ok: false,
            message: `테스트 계정 조회 실패: ${error.message}`,
          },
          500,
        );
      }

      const rows = (data || []) as UnknownRow[];

      const users = await Promise.all(
        rows.map(async (row) => {
          const userId = getText(row, ["user_id", "id"]) || "";
          let email = "";
          let name = "테스트 사용자";
          let authCreatedAt = getText(row, ["created_at"]);

          if (userId) {
            const { data: authUserData } =
              await adminClient.auth.admin.getUserById(userId);

            const authUser = authUserData?.user;
            email = authUser?.email || "";
            name =
              (typeof authUser?.user_metadata?.name === "string" &&
                authUser.user_metadata.name.trim()) ||
              "테스트 사용자";
            authCreatedAt = authUser?.created_at || authCreatedAt;
          }

          return {
            userId,
            email,
            name,
            role: getText(row, ["role"]) || "viewer",
            organizationId: getText(row, ["organization_id"]) || "",
            expiresAt: getText(row, ["test_expires_at"]),
            createdAt: authCreatedAt,
            mustChangePassword: row.must_change_password === true,
            status: getProfileStatus(row),
          };
        }),
      );

      return jsonResponse({
        ok: true,
        users,
      });
    }

    if (action === "create") {
      if (!body.organization_id) {
        return jsonResponse(
          { ok: false, message: "소속대가 선택되지 않았습니다." },
          400,
        );
      }

      const role = isTestUserRole(body.role)
        ? body.role
        : "leader";
      const count = normalizeCount(body.count);
      const expiryDays = normalizeExpiryDays(body.expiry_days);

      const { data: organization, error: organizationError } =
        await adminClient
          .from("organizations")
          .select("id, name, unit_number, status")
          .eq("id", body.organization_id)
          .is("deleted_at", null)
          .maybeSingle();

      if (organizationError || !organization) {
        return jsonResponse(
          {
            ok: false,
            message:
              organizationError?.message ||
              "소속대 정보를 확인하지 못했습니다.",
          },
          404,
        );
      }

      if (organization.status !== "active") {
        return jsonResponse(
          {
            ok: false,
            message:
              "이용중인 소속대에만 계정을 생성할 수 있습니다.",
          },
          400,
        );
      }

      const organizationCode = normalizeOrganizationCode(
        organization.unit_number,
        organization.id,
      );
      const expiresAt = new Date(
        Date.now() + expiryDays * 24 * 60 * 60 * 1000,
      ).toISOString();
      const credentials: Array<Record<string, unknown>> = [];

      let existingEmails: string[];

      try {
        existingEmails = await listAuthUserEmails(adminClient);
      } catch (listUsersError) {
        const message = listUsersError instanceof Error
          ? listUsersError.message
          : "기존 계정 조회 오류";

        return jsonResponse(
          {
            ok: false,
            message: `기존 테스트 계정 이메일 조회 실패: ${message}`,
          },
          500,
        );
      }

      let nextSequence =
        getMaxTestUserSequence(existingEmails, organizationCode, emailDomain) + 1;

      for (let index = 0; index < count; index += 1) {
        let sequence = nextSequence;
        let authData: { user: { id: string; created_at: string } } | null = null;
        let email = "";
        let password = "";
        let displayName = "";
        let lastAuthErrorMessage = "사용자 생성 오류";

        for (let attempt = 0; attempt < 20; attempt += 1) {
          email = buildTestUserEmail(organizationCode, sequence, emailDomain);
          password = randomPassword();
          displayName =
            `${organization.name} 테스트 ${String(sequence).padStart(2, "0")}`;

          const { data: createdAuthData, error: authError } =
            await adminClient.auth.admin.createUser({
              email,
              password,
              email_confirm: true,
              user_metadata: {
                name: displayName,
                is_test_user: true,
                organization_id: organization.id,
              },
            });

          if (!authError && createdAuthData.user) {
            authData = createdAuthData;
            break;
          }

          lastAuthErrorMessage = authError?.message || "사용자 생성 오류";

          if (authError && isDuplicateEmailError(authError)) {
            sequence += 1;
            continue;
          }

          return jsonResponse(
            {
              ok: false,
              message: `테스트 계정 생성 실패: ${lastAuthErrorMessage}`,
              credentials,
            },
            500,
          );
        }

        if (!authData?.user) {
          return jsonResponse(
            {
              ok: false,
              message:
                `테스트 계정 생성 실패: 사용 가능한 이메일을 찾지 못했습니다. (${lastAuthErrorMessage})`,
              credentials,
            },
            500,
          );
        }

        const profileErrorMessage = await saveTestProfile(
          adminClient,
          {
            user_id: authData.user.id,
            name: displayName,
            role,
            organization_id: organization.id,
            is_test_user: true,
            test_expires_at: expiresAt,
            must_change_password: true,
          },
        );

        if (profileErrorMessage) {
          await adminClient.auth.admin.deleteUser(
            authData.user.id,
          );

          return jsonResponse(
            {
              ok: false,
              message:
                `프로필 저장 실패: ${profileErrorMessage}`,
              credentials,
            },
            500,
          );
        }

        credentials.push({
          userId: authData.user.id,
          email,
          password,
          name: displayName,
          role,
          organizationId: organization.id,
          expiresAt,
          createdAt: authData.user.created_at,
        });

        existingEmails.push(email.toLowerCase());
        nextSequence = sequence + 1;
      }

      return jsonResponse({ ok: true, credentials });
    }

    if (action === "reset_password") {
      const userIds = normalizeUserIds(body.user_ids);

      if (userIds.length === 0) {
        return jsonResponse(
          {
            ok: false,
            message: "비밀번호를 초기화할 테스트 계정이 없습니다.",
          },
          400,
        );
      }

      const { data: profiles, error: profileLookupError } =
        await adminClient
          .from("user_profiles")
          .select("*")
          .in("user_id", userIds)
          .eq("is_test_user", true)
          .is("deleted_at", null);

      if (profileLookupError) {
        return jsonResponse(
          {
            ok: false,
            message:
              `테스트 계정 확인 실패: ${profileLookupError.message}`,
          },
          500,
        );
      }

      const profileMap = new Map(
        ((profiles || []) as UnknownRow[]).map((profile) => [
          getText(profile, ["user_id"]) || "",
          profile,
        ]),
      );

      const credentials: Array<Record<string, unknown>> = [];
      const failures: Array<Record<string, unknown>> = [];

      for (const userId of userIds) {
        const profile = profileMap.get(userId);

        if (!profile) {
          failures.push({
            userId,
            message: "테스트 계정이 아니거나 찾을 수 없습니다.",
          });
          continue;
        }

        const password = randomPassword();
        const role = getText(profile, ["role"]) || "viewer";
        const organizationId = getText(profile, ["organization_id"]) || "";
        const expiresAt = getText(profile, ["test_expires_at"]);
        let email = "";
        let name = getText(profile, ["name"]) || "테스트 사용자";
        let createdAt = getText(profile, ["created_at"]);

        const { error: authUpdateError } =
          await adminClient.auth.admin.updateUserById(userId, {
            password,
          });

        if (authUpdateError) {
          failures.push({
            userId,
            message: `비밀번호 변경 실패: ${authUpdateError.message}`,
          });
          continue;
        }

        const { data: authUserData } =
          await adminClient.auth.admin.getUserById(userId);
        const authUser = authUserData?.user;

        if (authUser) {
          email = authUser.email || "";
          name =
            (typeof authUser.user_metadata?.name === "string" &&
              authUser.user_metadata.name.trim()) ||
            name;
          createdAt = authUser.created_at || createdAt;
        }

        const { error: profileUpdateError } = await adminClient
          .from("user_profiles")
          .update({ must_change_password: true })
          .eq("user_id", userId)
          .eq("is_test_user", true);

        if (profileUpdateError) {
          failures.push({
            userId,
            message:
              `비밀번호는 변경되었지만 프로필 갱신 실패: ${profileUpdateError.message}`,
          });
          continue;
        }

        credentials.push({
          userId,
          email,
          password,
          name,
          role,
          organizationId,
          expiresAt,
          createdAt,
        });
      }

      if (credentials.length === 0) {
        return jsonResponse(
          {
            ok: false,
            message: "선택한 테스트 계정의 비밀번호를 초기화하지 못했습니다.",
            credentials,
            failures,
          },
          500,
        );
      }

      const failureCount = failures.length;
      const successMessage = failureCount > 0
        ? `${credentials.length}개 계정 비밀번호를 초기화했습니다. ${failureCount}개 실패.`
        : `${credentials.length}개 계정 비밀번호를 초기화했습니다.`;

      return jsonResponse({
        ok: true,
        message: successMessage,
        credentials,
        failures,
      });
    }

    if (action === "delete") {
      const userIds = normalizeUserIds(body.user_ids);

      if (userIds.length === 0) {
        return jsonResponse(
          {
            ok: false,
            message: "삭제할 테스트 계정이 없습니다.",
          },
          400,
        );
      }

      const { data: profiles, error: profileLookupError } =
        await adminClient
          .from("user_profiles")
          .select("user_id, is_test_user")
          .in("user_id", userIds)
          .eq("is_test_user", true)
          .is("deleted_at", null);

      if (profileLookupError) {
        return jsonResponse(
          {
            ok: false,
            message:
              `테스트 계정 확인 실패: ${profileLookupError.message}`,
          },
          500,
        );
      }

      const verifiedIds = (profiles || []).map(
        (profile) => profile.user_id,
      );

      if (verifiedIds.length !== userIds.length) {
        return jsonResponse(
          {
            ok: false,
            message:
              "테스트 계정이 아닌 사용자가 포함되어 있습니다.",
          },
          400,
        );
      }

      for (const userId of verifiedIds) {
        const { error: profileDeleteError } =
          await adminClient
            .from("user_profiles")
            .delete()
            .eq("user_id", userId)
            .eq("is_test_user", true);

        if (profileDeleteError) {
          return jsonResponse(
            {
              ok: false,
              message:
                `프로필 삭제 실패: ${profileDeleteError.message}`,
            },
            500,
          );
        }

        const { error: authDeleteError } =
          await adminClient.auth.admin.deleteUser(userId);

        if (authDeleteError) {
          return jsonResponse(
            {
              ok: false,
              message:
                `인증 계정 삭제 실패: ${authDeleteError.message}`,
            },
            500,
          );
        }
      }

      return jsonResponse({
        ok: true,
        deletedCount: verifiedIds.length,
      });
    }

    return jsonResponse(
      { ok: false, message: "지원하지 않는 작업입니다." },
      400,
    );
  } catch (error) {
    console.error("manage-test-users 처리 오류:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? `서버 처리 오류: ${error.message}`
            : "서버 처리 중 알 수 없는 오류가 발생했습니다.",
      },
      500,
    );
  }
});
