import type { CSSProperties } from "react";
import {
  formatOrganizationFilterLabel,
  type FilterOrganization,
  type OrganizationFilterValue,
} from "../../lib/organizationFilter";

export type SuperAdminOrganizationFilterProps = {
  value: OrganizationFilterValue;
  onChange: (organizationId: OrganizationFilterValue) => void;
  organizations: FilterOrganization[];
  /** false면 렌더하지 않음 (org_admin 등) */
  visible?: boolean;
  disabled?: boolean;
  label?: string;
  allOptionLabel?: string;
  /** 필터 행 레이아웃에 맞출 때 사용 */
  fieldStyle?: CSSProperties;
  selectStyle?: CSSProperties;
};

const defaultFieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "2px",
  flex: "1 1 200px",
  minWidth: "160px",
  maxWidth: "280px",
  color: "#334155",
  fontSize: "11.5px",
  fontWeight: 700,
};

const defaultSelectStyle: CSSProperties = {
  width: "100%",
  height: "34px",
  padding: "0 8px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  fontSize: "13.5px",
  backgroundColor: "#ffffff",
  boxSizing: "border-box",
};

/**
 * 최고관리자 전용 소속대 필터 UI.
 * 표시/숨김은 visible(또는 호출측 isSuperAdmin)로 제어한다.
 */
export function SuperAdminOrganizationFilter({
  value,
  onChange,
  organizations,
  visible = true,
  disabled = false,
  label = "소속대",
  allOptionLabel = "전체 소속대",
  fieldStyle,
  selectStyle,
}: SuperAdminOrganizationFilterProps) {
  if (!visible) return null;

  return (
    <label style={{ ...defaultFieldStyle, ...fieldStyle }}>
      {label}
      <select
        style={{ ...defaultSelectStyle, ...selectStyle }}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{allOptionLabel}</option>
        {organizations.map((organization) => (
          <option key={organization.id} value={organization.id}>
            {formatOrganizationFilterLabel(organization)}
          </option>
        ))}
      </select>
    </label>
  );
}
