import { useCallback, useEffect, useState } from "react";
import {
  fetchOrganizationsForFilter,
  type FilterOrganization,
  type OrganizationFilterValue,
} from "../lib/organizationFilter";

type UseSuperAdminOrganizationFilterOptions = {
  /** super_admin일 때만 true. false면 조직 목록을 조회하지 않음 */
  enabled: boolean;
  /** 외부에서 이미 조회한 조직 목록을 넘기면 훅 내부 조회를 생략 */
  organizations?: FilterOrganization[];
};

/**
 * 최고관리자 전용 소속대 필터 상태.
 * 선택값 유지: 페이지 로컬 state (전체 대원 통합관리와 동일, 새로고침 시 "").
 */
export function useSuperAdminOrganizationFilter({
  enabled,
  organizations: externalOrganizations,
}: UseSuperAdminOrganizationFilterOptions) {
  const [selectedOrganizationId, setSelectedOrganizationId] =
    useState<OrganizationFilterValue>("");
  const [internalOrganizations, setInternalOrganizations] = useState<
    FilterOrganization[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const usesExternalOrganizations = externalOrganizations !== undefined;

  const reloadOrganizations = useCallback(async () => {
    if (!enabled || usesExternalOrganizations) return;

    setIsLoading(true);
    setError("");
    const { organizations, error: fetchError } =
      await fetchOrganizationsForFilter();

    if (fetchError) {
      console.error("소속대 필터 조직 목록 조회 오류:", fetchError.message);
      setInternalOrganizations([]);
      setError("소속대 목록을 불러오지 못했습니다.");
      setIsLoading(false);
      return;
    }

    setInternalOrganizations(organizations);
    setIsLoading(false);
  }, [enabled, usesExternalOrganizations]);

  useEffect(() => {
    if (!enabled) {
      setInternalOrganizations([]);
      setError("");
      setIsLoading(false);
      return;
    }

    if (usesExternalOrganizations) return;

    void reloadOrganizations();
  }, [enabled, reloadOrganizations, usesExternalOrganizations]);

  useEffect(() => {
    if (!enabled && selectedOrganizationId) {
      setSelectedOrganizationId("");
    }
  }, [enabled, selectedOrganizationId]);

  return {
    organizations: usesExternalOrganizations
      ? (externalOrganizations ?? [])
      : internalOrganizations,
    selectedOrganizationId,
    setSelectedOrganizationId,
    isLoading: usesExternalOrganizations ? false : isLoading,
    error: usesExternalOrganizations ? "" : error,
    isSuperAdmin: enabled,
    reloadOrganizations,
  };
}
