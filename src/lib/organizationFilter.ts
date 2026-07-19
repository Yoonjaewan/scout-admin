import { supabase } from "./supabase";

/** "" = 전체 소속대 (ScoutIntegrated / Reports와 동일) */
export type OrganizationFilterValue = string;

export type FilterOrganization = {
  id: string;
  name: string;
  unit_number: string | null;
};

export function formatOrganizationFilterLabel(organization: {
  name: string;
  unit_number?: string | null;
}) {
  const unitNumber = organization.unit_number?.trim();
  if (!unitNumber) return organization.name;
  return `${organization.name} · ${unitNumber}`;
}

/**
 * 최고관리자 소속대 필터용 조직 목록.
 * 전체 대원 통합관리와 동일: deleted_at IS NULL, name ASC, status 제외 없음.
 */
export async function fetchOrganizationsForFilter() {
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, unit_number")
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (error) {
    return { organizations: [] as FilterOrganization[], error };
  }

  return {
    organizations: (data ?? []) as FilterOrganization[],
    error: null,
  };
}
