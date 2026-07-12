import type { CSSProperties } from "react";

export const summaryCardGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: "12px",
  marginBottom: "18px",
};

export function summaryFilterCardStyle(
  tone: "neutral" | "success" | "danger" | "warning",
  selected: boolean,
): CSSProperties {
  const palette = {
    neutral: { border: "#cbd5e1", background: "#ffffff", color: "#334155" },
    success: { border: "#86efac", background: "#f0fdf4", color: "#166534" },
    danger: { border: "#fca5a5", background: "#fef2f2", color: "#991b1b" },
    warning: { border: "#fcd34d", background: "#fffbeb", color: "#92400e" },
  }[tone];
  return {
    minWidth: 0,
    padding: "15px 16px",
    display: "grid",
    gap: "5px",
    border: `${selected ? 2 : 1}px solid ${palette.border}`,
    borderRadius: "13px",
    backgroundColor: palette.background,
    color: palette.color,
    boxShadow: selected
      ? "0 0 0 3px rgba(37, 99, 235, 0.16), 0 6px 16px rgba(15, 23, 42, 0.06)"
      : "none",
    fontFamily: "inherit",
    textAlign: "left",
    cursor: "pointer",
  };
}

export const summaryFilterLabelStyle: CSSProperties = {
  fontSize: "13px",
  fontWeight: 900,
};

export const summaryFilterCountStyle: CSSProperties = {
  fontSize: "22px",
  fontWeight: 900,
  lineHeight: 1.15,
};

export const summaryFilterDescriptionStyle: CSSProperties = {
  fontSize: "11px",
  lineHeight: 1.4,
  opacity: 0.82,
};

export function getReadinessBadgeStyle(
  status: "ready" | "needs_attention" | "review_needed",
): CSSProperties {
  if (status === "ready") {
    return {
      ...conditionBadgeBaseStyle,
      backgroundColor: "#dcfce7",
      color: "#166534",
    };
  }
  if (status === "needs_attention") {
    return {
      ...conditionBadgeBaseStyle,
      backgroundColor: "#fee2e2",
      color: "#b91c1c",
    };
  }
  return {
    ...conditionBadgeBaseStyle,
    backgroundColor: "#fef3c7",
    color: "#92400e",
  };
}

export const scoutRankFlowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  marginTop: "7px",
  color: "#334155",
  fontSize: "12px",
};

export function selectedReadinessBannerStyle(
  status: "ready" | "needs_attention" | "review_needed",
): CSSProperties {
  const palette =
    status === "ready"
      ? { border: "#86efac", background: "#f0fdf4", color: "#166534" }
      : status === "needs_attention"
        ? { border: "#fca5a5", background: "#fef2f2", color: "#991b1b" }
        : { border: "#fcd34d", background: "#fffbeb", color: "#92400e" };
  return {
    marginTop: "11px",
    padding: "12px 14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    border: `1px solid ${palette.border}`,
    borderRadius: "11px",
    backgroundColor: palette.background,
    color: palette.color,
  };
}

export const selectedReadinessEyebrowStyle: CSSProperties = {
  display: "block",
  fontSize: "11px",
  fontWeight: 900,
  opacity: 0.8,
};

export const selectedReadinessTitleStyle: CSSProperties = {
  display: "block",
  marginTop: "3px",
  fontSize: "19px",
  fontWeight: 900,
};

export const selectedReadinessDetailStyle: CSSProperties = {
  display: "block",
  marginTop: "4px",
  fontSize: "12px",
  lineHeight: 1.45,
};

export const selectedReadinessActionStyle: CSSProperties = {
  minHeight: "36px",
  padding: "0 12px",
  border: "1px solid currentColor",
  borderRadius: "8px",
  backgroundColor: "rgba(255,255,255,0.72)",
  color: "inherit",
  fontFamily: "inherit",
  fontSize: "12px",
  fontWeight: 900,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export const readinessProgressGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
  gap: "8px",
  marginTop: "10px",
};

export const readinessProgressItemStyle: CSSProperties = {
  minWidth: 0,
  minHeight: "50px",
  padding: "9px 10px",
  border: "1px solid #e2e8f0",
  borderRadius: "9px",
  backgroundColor: "#ffffff",
};

export const readinessProgressHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "8px",
  marginBottom: "5px",
};

export const readinessProgressLabelStyle: CSSProperties = {
  color: "#475569",
  fontSize: "11px",
  fontWeight: 900,
};

export function readinessProgressValueStyle(
  state: "passed" | "failed" | "pending",
): CSSProperties {
  return {
    color:
      state === "passed"
        ? "#15803d"
        : state === "failed"
          ? "#b91c1c"
          : "#64748b",
    fontSize: "11px",
    fontWeight: 900,
    textAlign: "right",
  };
}

export function readinessStateChipStyle(
  state: "passed" | "failed" | "pending",
): CSSProperties {
  return {
    minHeight: "24px",
    padding: "0 8px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "999px",
    backgroundColor:
      state === "passed"
        ? "#dcfce7"
        : state === "failed"
          ? "#fee2e2"
          : "#f1f5f9",
    color:
      state === "passed"
        ? "#166534"
        : state === "failed"
          ? "#b91c1c"
          : "#64748b",
    fontSize: "11px",
    fontWeight: 900,
    whiteSpace: "nowrap",
  };
}

export const readinessProgressTrackStyle: CSSProperties = {
  height: "6px",
  overflow: "hidden",
  borderRadius: "999px",
  backgroundColor: "#e2e8f0",
};

export function readinessProgressFillStyle(
  state: "passed" | "failed" | "pending",
): CSSProperties {
  return {
    width: state === "passed" ? "100%" : state === "failed" ? "45%" : "20%",
    height: "100%",
    borderRadius: "999px",
    backgroundColor:
      state === "passed"
        ? "#22c55e"
        : state === "failed"
          ? "#ef4444"
          : "#94a3b8",
  };
}

export const pageHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "20px",
  marginBottom: "20px",
};

export const pageTitleStyle: CSSProperties = {
  margin: 0,
  color: "#0f172a",
  fontSize: "30px",
  fontWeight: 900,
};

export const pageDescriptionStyle: CSSProperties = {
  margin: "5px 0 0",
  color: "#64748b",
  fontSize: "15px",
  lineHeight: 1.6,
};

export const headerActionStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
};

export const roleBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: "36px",
  padding: "0 12px",
  borderRadius: "999px",
  backgroundColor: "#dbeafe",
  color: "#1d4ed8",
  fontSize: "13px",
  fontWeight: 900,
};

export const secondaryButtonStyle: CSSProperties = {
  minHeight: "38px",
  padding: "0 14px",
  border: "1px solid #cbd5e1",
  borderRadius: "9px",
  backgroundColor: "#ffffff",
  color: "#334155",
  fontFamily: "inherit",
  fontSize: "14px",
  fontWeight: 800,
  cursor: "pointer",
};

export const errorBoxStyle: CSSProperties = {
  marginBottom: "16px",
  padding: "13px 15px",
  border: "1px solid #fecaca",
  borderRadius: "10px",
  backgroundColor: "#fef2f2",
  color: "#b91c1c",
  fontSize: "14px",
  lineHeight: 1.5,
};

export const workspaceStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "270px minmax(0, 1fr)",
  gap: "18px",
  alignItems: "start",
};

export const scoutPanelStyle: CSSProperties = {
  position: "sticky",
  top: "20px",
  height: "calc(100vh - 40px)",
  display: "flex",
  flexDirection: "column",
  border: "1px solid #e2e8f0",
  borderRadius: "14px",
  backgroundColor: "#ffffff",
  overflow: "hidden",
};

export const panelHeaderStyle: CSSProperties = {
  padding: "12px",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "12px",
  borderBottom: "1px solid #e2e8f0",
};

export const panelTitleStyle: CSSProperties = {
  margin: 0,
  color: "#0f172a",
  fontSize: "19px",
  fontWeight: 900,
};

export const panelDescriptionStyle: CSSProperties = {
  margin: "5px 0 0",
  color: "#64748b",
  fontSize: "13px",
  lineHeight: 1.5,
};


export const panelHeaderActionStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "flex-end",
};

export const registrationMenuWrapStyle: CSSProperties = {
  position: "relative",
};

export const registrationMenuButtonStyle: CSSProperties = {
  minHeight: "36px",
  padding: "0 12px",
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  border: "1px solid #2563eb",
  borderRadius: "8px",
  backgroundColor: "#2563eb",
  color: "#ffffff",
  fontFamily: "inherit",
  fontSize: "13px",
  fontWeight: 900,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export const registrationMenuStyle: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 7px)",
  right: 0,
  zIndex: 30,
  width: "246px",
  padding: "6px",
  border: "1px solid #dbe3ee",
  borderRadius: "11px",
  backgroundColor: "#ffffff",
  boxShadow: "0 14px 32px rgba(15, 23, 42, 0.16)",
};

export const registrationMenuItemStyle: CSSProperties = {
  width: "100%",
  padding: "10px 11px",
  display: "grid",
  gap: "3px",
  border: "none",
  borderRadius: "8px",
  backgroundColor: "transparent",
  color: "#0f172a",
  fontFamily: "inherit",
  fontSize: "13px",
  textAlign: "left",
  cursor: "pointer",
};

export const registrationMenuItemDescriptionStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "11px",
  lineHeight: 1.45,
};

export const searchAreaStyle: CSSProperties = {
  padding: "10px",
  borderBottom: "1px solid #e2e8f0",
  backgroundColor: "#f8fafc",
};

export const searchInputStyle: CSSProperties = {
  width: "100%",
  height: "40px",
  padding: "0 12px",
  border: "1px solid #cbd5e1",
  borderRadius: "9px",
  backgroundColor: "#ffffff",
  color: "#0f172a",
  boxSizing: "border-box",
  fontFamily: "inherit",
  fontSize: "14px",
};

export const filterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "8px",
  marginTop: "8px",
};

export const selectStyle: CSSProperties = {
  minWidth: 0,
  height: "38px",
  padding: "0 8px",
  border: "1px solid #cbd5e1",
  borderRadius: "9px",
  backgroundColor: "#ffffff",
  color: "#334155",
  fontFamily: "inherit",
  fontSize: "13px",
};

export const scoutListStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  padding: "6px",
};

export const emptyStateStyle: CSSProperties = {
  padding: "30px 16px",
  color: "#64748b",
  fontSize: "14px",
  lineHeight: 1.6,
  textAlign: "center",
};

export const scoutItemStyle: CSSProperties = {
  width: "100%",
  marginBottom: "5px",
  padding: "9px 10px",
  border: "1px solid transparent",
  borderRadius: "10px",
  backgroundColor: "#ffffff",
  color: "#0f172a",
  textAlign: "left",
  fontFamily: "inherit",
  cursor: "pointer",
};

export const selectedScoutItemStyle: CSSProperties = {
  border: "1px solid #2563eb",
  backgroundColor: "#eff6ff",
  boxShadow: "0 0 0 2px rgba(37, 99, 235, 0.08)",
};

export const scoutItemTopStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px",
};

export const scoutNameStyle: CSSProperties = {
  fontSize: "14px",
  fontWeight: 900,
};

export const scoutItemMetaStyle: CSSProperties = {
  marginTop: "2px",
  color: "#64748b",
  fontSize: "12px",
  lineHeight: 1.4,
};

export const statusBadgeBaseStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: "24px",
  padding: "0 8px",
  borderRadius: "999px",
  fontSize: "11px",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

export const detailPanelStyle: CSSProperties = {
  minWidth: 0,
};

export const emptyDetailStyle: CSSProperties = {
  minHeight: "480px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  border: "1px dashed #cbd5e1",
  borderRadius: "14px",
  backgroundColor: "#ffffff",
};

export const profileCardStyle: CSSProperties = {
  padding: "15px 16px",
  border: "1px solid #e2e8f0",
  borderRadius: "14px",
  backgroundColor: "#ffffff",
};

export const profileHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "12px",
};

export const profileTitleRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
};

export const profileNameStyle: CSSProperties = {
  margin: 0,
  color: "#0f172a",
  fontSize: "25px",
  fontWeight: 900,
};

export const profileMetaStyle: CSSProperties = {
  margin: "8px 0 0",
  color: "#64748b",
  fontSize: "14px",
};

export const profileQuickActionStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "7px",
  flexWrap: "wrap",
};

export const profileQuickButtonStyle: CSSProperties = {
  minHeight: "34px",
  padding: "0 11px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  backgroundColor: "#ffffff",
  color: "#334155",
  fontFamily: "inherit",
  fontSize: "12px",
  fontWeight: 900,
  cursor: "pointer",
};

export const compactPriorityStyle: CSSProperties = {
  marginTop: "10px",
  padding: "12px 14px",
  border: "1px solid #fed7aa",
  borderRadius: "12px",
  backgroundColor: "#fffaf5",
};

export const compactPriorityHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  marginBottom: "8px",
};

export const compactPriorityTitleStyle: CSSProperties = {
  margin: 0,
  color: "#9a3412",
  fontSize: "16px",
  fontWeight: 900,
};

export const compactPriorityCountStyle: CSSProperties = {
  minHeight: "24px",
  padding: "0 8px",
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "999px",
  backgroundColor: "#ffedd5",
  color: "#9a3412",
  fontSize: "11px",
  fontWeight: 900,
};

export const compactPriorityListStyle: CSSProperties = {
  display: "grid",
  gap: "6px",
};

export const compactPriorityItemStyle: CSSProperties = {
  width: "100%",
  minHeight: "36px",
  padding: "0 10px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  border: "1px solid #fed7aa",
  borderRadius: "8px",
  backgroundColor: "#ffffff",
  color: "#7c2d12",
  fontFamily: "inherit",
  fontSize: "12px",
  fontWeight: 800,
  textAlign: "left",
};

export const compactPriorityMoveStyle: CSSProperties = {
  color: "#c2410c",
  fontSize: "11px",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

export const rankProgressSectionStyle: CSSProperties = {
  marginTop: "10px",
  padding: "13px",
  border: "1px solid #dbe3ee",
  borderRadius: "14px",
  backgroundColor: "#ffffff",
};

export const rankProgressHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "16px",
  marginBottom: "9px",
};

export const rankProgressTitleStyle: CSSProperties = {
  margin: 0,
  color: "#0f172a",
  fontSize: "18px",
  fontWeight: 900,
};

export const rankProgressDescriptionStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#64748b",
  fontSize: "12px",
  lineHeight: 1.45,
};

export const rankProgressLegendStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  flexWrap: "wrap",
};

export const rankProgressLegendItemStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "5px",
  color: "#64748b",
  fontSize: "11px",
  fontWeight: 800,
};

export const rankProgressLegendDotStyle: CSSProperties = {
  width: "10px",
  height: "10px",
  borderRadius: "999px",
  backgroundColor: "#ffffff",
  boxSizing: "border-box",
};

export const rankProgressTrackStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(104px, 1fr))",
  gap: "8px",
};

export function rankProgressStepStyle(
  state: "completed" | "current" | "next" | "future",
): CSSProperties {
  const palette = {
    completed: { border: "1px solid #dcfce7", backgroundColor: "#f8fff9" },
    current: { border: "2px solid #2563eb", backgroundColor: "#eff6ff" },
    next: { border: "2px solid #f97316", backgroundColor: "#fff7ed" },
    future: { border: "1px solid #e2e8f0", backgroundColor: "#f8fafc" },
  };

  return {
    minWidth: 0,
    minHeight: "72px",
    padding: "8px 7px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "11px",
    textAlign: "center",
    boxSizing: "border-box",
    ...palette[state],
  };
}

export function rankProgressCircleStyle(
  state: "completed" | "current" | "next" | "future",
): CSSProperties {
  const palette = {
    completed: { backgroundColor: "#16a34a", border: "2px solid #16a34a", color: "#ffffff" },
    current: { backgroundColor: "#2563eb", border: "2px solid #2563eb", color: "#ffffff" },
    next: { backgroundColor: "#ffffff", border: "2px solid #f97316", color: "#ea580c" },
    future: { backgroundColor: "#e2e8f0", border: "2px solid #e2e8f0", color: "#64748b" },
  };

  return {
    width: "28px",
    height: "28px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "999px",
    boxSizing: "border-box",
    fontSize: "13px",
    fontWeight: 900,
    ...palette[state],
  };
}

export const rankProgressRankNameStyle: CSSProperties = {
  marginTop: "4px",
  color: "#0f172a",
  fontSize: "13px",
  fontWeight: 900,
};

export function rankProgressStateLabelStyle(
  state: "completed" | "current" | "next" | "future",
): CSSProperties {
  const color =
    state === "completed"
      ? "#15803d"
      : state === "current"
        ? "#1d4ed8"
        : state === "next"
          ? "#c2410c"
          : "#64748b";

  return {
    marginTop: "3px",
    color,
    fontSize: "11px",
    fontWeight: 900,
  };
}

export const rankProgressDateStyle: CSSProperties = {
  marginTop: "2px",
  color: "#94a3b8",
  fontSize: "9px",
  fontWeight: 700,
};

export const profileInfoGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.35fr repeat(5, minmax(0, 1fr))",
  gap: "7px",
  marginTop: "10px",
};

export const infoItemStyle: CSSProperties = {
  minWidth: 0,
  padding: "8px 10px",
  border: "1px solid #e2e8f0",
  borderRadius: "10px",
  backgroundColor: "#f8fafc",
};

export const infoLabelStyle: CSSProperties = {
  display: "block",
  color: "#64748b",
  fontSize: "12px",
  fontWeight: 800,
};

export const infoValueStyle: CSSProperties = {
  display: "block",
  marginTop: "4px",
  color: "#0f172a",
  fontSize: "14px",
  fontWeight: 900,
  wordBreak: "keep-all",
};

export const tabBarStyle: CSSProperties = {
  display: "flex",
  gap: "6px",
  margin: "10px 0",
  padding: "5px",
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  backgroundColor: "#ffffff",
  overflowX: "auto",
};

export const tabButtonStyle: CSSProperties = {
  minHeight: "36px",
  padding: "0 14px",
  border: "none",
  borderRadius: "8px",
  backgroundColor: "transparent",
  color: "#64748b",
  fontFamily: "inherit",
  fontSize: "14px",
  fontWeight: 800,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export const activeTabButtonStyle: CSSProperties = {
  backgroundColor: "#2563eb",
  color: "#ffffff",
};

export const overviewStackStyle: CSSProperties = {
  display: "grid",
  gap: "16px",
};

export const priorityCardStyle: CSSProperties = {
  padding: "18px",
  border: "1px solid #fed7aa",
  borderRadius: "14px",
  backgroundColor: "#fffaf5",
};

export const overviewSectionHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "14px",
  marginBottom: "12px",
};

export const overviewSectionTitleStyle: CSSProperties = {
  margin: 0,
  color: "#9a3412",
  fontSize: "19px",
  fontWeight: 900,
};

export const priorityCountStyle: CSSProperties = {
  minHeight: "28px",
  padding: "0 10px",
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "999px",
  backgroundColor: "#ffedd5",
  color: "#9a3412",
  fontSize: "12px",
  fontWeight: 900,
};

export const priorityListStyle: CSSProperties = {
  display: "grid",
  gap: "8px",
};

export function priorityItemStyle(type: "danger" | "warning" | "info"): CSSProperties {
  const palette = {
    danger: {
      border: "1px solid #fecaca",
      backgroundColor: "#fff7f7",
      color: "#991b1b",
    },
    warning: {
      border: "1px solid #fde68a",
      backgroundColor: "#fffbeb",
      color: "#92400e",
    },
    info: {
      border: "1px solid #bfdbfe",
      backgroundColor: "#eff6ff",
      color: "#1e3a8a",
    },
  };

  return {
    width: "100%",
    minHeight: "44px",
    padding: "9px 11px",
    display: "grid",
    gridTemplateColumns: "28px minmax(0, 1fr) auto",
    alignItems: "center",
    gap: "10px",
    borderRadius: "10px",
    fontFamily: "inherit",
    fontSize: "13px",
    fontWeight: 800,
    textAlign: "left",
    cursor: "pointer",
    ...palette[type],
  };
}

export const priorityNumberStyle: CSSProperties = {
  width: "26px",
  height: "26px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "999px",
  backgroundColor: "rgba(255,255,255,0.82)",
  fontSize: "12px",
  fontWeight: 900,
};

export const priorityMoveStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

export const inlineActionButtonStyle: CSSProperties = {
  minHeight: "34px",
  padding: "0 11px",
  border: "1px solid #bfdbfe",
  borderRadius: "8px",
  backgroundColor: "#eff6ff",
  color: "#1d4ed8",
  fontFamily: "inherit",
  fontSize: "12px",
  fontWeight: 900,
  cursor: "pointer",
};

export const recentRecordRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "14px",
  padding: "11px 0",
  borderBottom: "1px solid #f1f5f9",
};

export const recentRecordLabelStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "13px",
  fontWeight: 800,
};

export const recentRecordValueStyle: CSSProperties = {
  color: "#0f172a",
  fontSize: "13px",
  fontWeight: 900,
  textAlign: "right",
};

export const recordCheckRowStyle: CSSProperties = {
  width: "100%",
  minHeight: "38px",
  padding: "0 10px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  border: "1px solid #e2e8f0",
  borderRadius: "9px",
  backgroundColor: "#f8fafc",
  color: "#334155",
  fontFamily: "inherit",
  fontSize: "13px",
  fontWeight: 800,
  textAlign: "left",
  cursor: "pointer",
};

export const recordCheckGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "8px",
};

export const recordCheckWarningStyle: CSSProperties = {
  color: "#b91c1c",
  fontWeight: 900,
};

export const recordCheckGoodStyle: CSSProperties = {
  color: "#15803d",
  fontWeight: 900,
};

export const promotionWorkCardStyle: CSSProperties = {
  padding: "18px",
  border: "1px solid #bfdbfe",
  borderRadius: "14px",
  backgroundColor: "#f8fbff",
};

export const promotionWorkHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "16px",
  marginBottom: "14px",
};

export const promotionWorkTitleStyle: CSSProperties = {
  margin: 0,
  color: "#0f172a",
  fontSize: "22px",
  fontWeight: 900,
};

export const promotionStatusAreaStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
};

export const promotionActionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "12px",
};

export const promotionTaskStyle: CSSProperties = {
  padding: "14px",
  border: "1px solid #dbeafe",
  borderRadius: "11px",
  backgroundColor: "#ffffff",
};

export const promotionTaskTitleStyle: CSSProperties = {
  color: "#0f172a",
  fontSize: "15px",
  fontWeight: 900,
};

export const promotionTaskDescriptionStyle: CSSProperties = {
  margin: "5px 0 12px",
  color: "#64748b",
  fontSize: "12px",
  lineHeight: 1.45,
};

export const promotionTaskControlStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(150px, 1fr) auto",
  gap: "8px",
  alignItems: "end",
};

export const promotionApprovalControlStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "140px minmax(140px, 1fr) auto",
  gap: "8px",
  alignItems: "end",
};

export const compactFieldStyle: CSSProperties = {
  display: "grid",
  gap: "5px",
  color: "#475569",
  fontSize: "11px",
  fontWeight: 900,
};

export const compactFieldWideStyle: CSSProperties = {
  ...compactFieldStyle,
  minWidth: 0,
};

export const compactInputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  height: "38px",
  padding: "0 10px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  boxSizing: "border-box",
  backgroundColor: "#ffffff",
  color: "#0f172a",
  fontFamily: "inherit",
  fontSize: "13px",
};

export const primaryWorkButtonStyle: CSSProperties = {
  minHeight: "38px",
  padding: "0 13px",
  border: "1px solid #2563eb",
  borderRadius: "8px",
  backgroundColor: "#2563eb",
  color: "#ffffff",
  fontFamily: "inherit",
  fontSize: "13px",
  fontWeight: 900,
  cursor: "pointer",
};

export const approvalWorkButtonStyle: CSSProperties = {
  ...primaryWorkButtonStyle,
  border: "1px solid #16a34a",
  backgroundColor: "#16a34a",
};

export const successMessageStyle: CSSProperties = {
  marginBottom: "12px",
  padding: "10px 12px",
  border: "1px solid #bbf7d0",
  borderRadius: "9px",
  backgroundColor: "#f0fdf4",
  color: "#166534",
  fontSize: "13px",
  fontWeight: 800,
};

export const conditionDetailGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "12px",
};

export function detailedConditionCardStyle(passed: boolean): CSSProperties {
  return {
    padding: "14px",
    border: passed ? "1px solid #bbf7d0" : "1px solid #fecaca",
    borderRadius: "11px",
    backgroundColor: passed ? "#f8fff9" : "#fff8f8",
  };
}

export const detailedConditionHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  marginBottom: "10px",
};

export const detailedConditionTitleStyle: CSSProperties = {
  margin: 0,
  color: "#0f172a",
  fontSize: "16px",
  fontWeight: 900,
};

export const detailedConditionRowsStyle: CSSProperties = {
  display: "grid",
  gap: "7px",
};

export const detailedConditionRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  paddingTop: "7px",
  borderTop: "1px solid rgba(148, 163, 184, 0.18)",
};

export const detailedConditionLabelStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "12px",
  fontWeight: 700,
};

export const detailedConditionValueStyle: CSSProperties = {
  color: "#0f172a",
  fontSize: "12px",
  fontWeight: 900,
  textAlign: "right",
};

export const supportItemGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "10px",
};

export const supportItemStyle: CSSProperties = {
  padding: "12px",
  border: "1px solid #fecaca",
  borderRadius: "10px",
  backgroundColor: "#fff7f7",
};

export const supportItemTitleStyle: CSSProperties = {
  display: "block",
  color: "#b91c1c",
  fontSize: "13px",
  fontWeight: 900,
};

export const supportItemTextStyle: CSSProperties = {
  display: "block",
  marginTop: "5px",
  color: "#7f1d1d",
  fontSize: "12px",
  lineHeight: 1.5,
};

export const allPassedBoxStyle: CSSProperties = {
  padding: "14px",
  border: "1px solid #bbf7d0",
  borderRadius: "10px",
  backgroundColor: "#f0fdf4",
  color: "#166534",
  fontSize: "14px",
  fontWeight: 900,
};

export const overviewMainGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 3fr) minmax(320px, 2fr)",
  gap: "14px",
  alignItems: "stretch",
};

export const twoColumnGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "16px",
};

export const stackStyle: CSSProperties = {
  display: "grid",
  gap: "16px",
};

export const contentCardStyle: CSSProperties = {
  padding: "18px",
  border: "1px solid #e2e8f0",
  borderRadius: "14px",
  backgroundColor: "#ffffff",
};

export const contentHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "16px",
  marginBottom: "12px",
};

export const contentTitleStyle: CSSProperties = {
  margin: 0,
  color: "#0f172a",
  fontSize: "19px",
  fontWeight: 900,
};

export const contentDescriptionStyle: CSSProperties = {
  margin: "5px 0 0",
  color: "#64748b",
  fontSize: "13px",
  lineHeight: 1.5,
};

export const conditionRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "14px",
  padding: "11px 0",
  borderBottom: "1px solid #f1f5f9",
};

export const conditionLabelStyle: CSSProperties = {
  color: "#334155",
  fontSize: "14px",
  fontWeight: 800,
};

export const conditionDetailStyle: CSSProperties = {
  marginTop: "4px",
  color: "#64748b",
  fontSize: "12px",
};

export const conditionBadgeBaseStyle: CSSProperties = {
  minHeight: "26px",
  padding: "0 9px",
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "999px",
  fontSize: "12px",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

export const criticalDataMismatchStyle: CSSProperties = {
  display: "grid",
  gap: "5px",
  marginBottom: "14px",
  padding: "13px 14px",
  border: "2px solid #dc2626",
  borderRadius: "10px",
  backgroundColor: "#fef2f2",
  color: "#991b1b",
  fontSize: "13px",
  fontWeight: 800,
  lineHeight: 1.5,
};

export const dataDifferenceNoticeStyle: CSSProperties = {
  margin: "10px 0 4px",
  padding: "10px 12px",
  border: "1px solid #fde68a",
  borderRadius: "9px",
  backgroundColor: "#fffbeb",
  color: "#92400e",
  fontSize: "12px",
  fontWeight: 800,
  lineHeight: 1.5,
};

export const noticeBoxStyle: CSSProperties = {
  marginTop: "14px",
  padding: "10px 12px",
  border: "1px solid #bfdbfe",
  borderRadius: "9px",
  backgroundColor: "#eff6ff",
  color: "#1e3a8a",
  fontSize: "12px",
  lineHeight: 1.5,
};

export const emptyContentStyle: CSSProperties = {
  padding: "24px 10px",
  color: "#64748b",
  fontSize: "14px",
  textAlign: "center",
};

export const countBadgeStyle: CSSProperties = {
  minHeight: "28px",
  padding: "0 10px",
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "999px",
  backgroundColor: "#eff6ff",
  color: "#1d4ed8",
  fontSize: "12px",
  fontWeight: 900,
};

export const tableWrapStyle: CSSProperties = {
  overflowX: "auto",
  border: "1px solid #e2e8f0",
  borderRadius: "10px",
};

export const tableStyle: CSSProperties = {
  width: "100%",
  minWidth: "600px",
  borderCollapse: "collapse",
};

export const thStyle: CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #e2e8f0",
  backgroundColor: "#f8fafc",
  color: "#334155",
  fontSize: "13px",
  fontWeight: 900,
  textAlign: "left",
  whiteSpace: "nowrap",
};

export const tdStyle: CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #f1f5f9",
  color: "#475569",
  fontSize: "13px",
  verticalAlign: "top",
};

export const strongTdStyle: CSSProperties = {
  ...tdStyle,
  color: "#0f172a",
  fontWeight: 800,
};

export const programSummaryCardStyle: CSSProperties = {
  padding: "18px",
  border: "1px solid #bfdbfe",
  borderRadius: "14px",
  backgroundColor: "#f8fbff",
};

export const programStatusGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "12px",
};

export const programStatusCardStyle: CSSProperties = {
  minWidth: 0,
  padding: "15px",
  border: "1px solid #fecaca",
  borderRadius: "12px",
  backgroundColor: "#fff8f8",
};

export const programStatusCompletedStyle: CSSProperties = {
  border: "1px solid #bbf7d0",
  backgroundColor: "#f8fff9",
};

export const programStatusHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "12px",
  marginBottom: "12px",
};

export const programStatusTypeStyle: CSSProperties = {
  display: "block",
  color: "#0f172a",
  fontSize: "19px",
  fontWeight: 900,
};

export const programStatusDescriptionStyle: CSSProperties = {
  display: "block",
  marginTop: "4px",
  color: "#64748b",
  fontSize: "12px",
};

export const programStatusDetailGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: "8px",
};

export const programStatusActionStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "8px",
  marginTop: "12px",
};

export const programMissingDescriptionStyle: CSSProperties = {
  margin: "0 0 12px",
  color: "#7f1d1d",
  fontSize: "13px",
};

export const programActionNoticeStyle: CSSProperties = {
  display: "grid",
  gap: "5px",
  marginBottom: "9px",
  padding: "11px 12px",
  border: "1px solid #fde68a",
  borderRadius: "10px",
  backgroundColor: "#fffbeb",
  color: "#92400e",
  fontSize: "12px",
  lineHeight: 1.5,
};

export const warningTextStyle: CSSProperties = {
  color: "#b91c1c",
  fontWeight: 900,
};

export const programManagementGuideStyle: CSSProperties = {
  padding: "12px",
  border: "1px solid #bfdbfe",
  borderRadius: "10px",
  backgroundColor: "#eff6ff",
};

export const programManagementGuideTitleStyle: CSSProperties = {
  display: "block",
  color: "#1e3a8a",
  fontSize: "13px",
  fontWeight: 900,
};

export const programManagementGuideTextStyle: CSSProperties = {
  margin: "5px 0 0",
  color: "#1e40af",
  fontSize: "12px",
  lineHeight: 1.5,
};

export const attendanceSummaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: "10px",
  marginBottom: "14px",
};

export const attendanceBadgeWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
};

export const attendanceBadgeStyle: CSSProperties = {
  minHeight: "30px",
  padding: "0 10px",
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "999px",
  backgroundColor: "#f1f5f9",
  color: "#334155",
  fontSize: "12px",
  fontWeight: 900,
};

export const badgeHeaderActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

export const badgeSummaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
  gap: "10px",
  marginBottom: "14px",
};

export const badgeTableStyle: CSSProperties = {
  width: "100%",
  minWidth: "1050px",
  borderCollapse: "collapse",
};

export const primaryButtonStyle: CSSProperties = {
  minHeight: "38px",
  padding: "0 14px",
  border: "1px solid #2563eb",
  borderRadius: "9px",
  backgroundColor: "#2563eb",
  color: "#ffffff",
  fontFamily: "inherit",
  fontSize: "13px",
  fontWeight: 900,
  cursor: "pointer",
};

export const rowActionStyle: CSSProperties = {
  display: "flex",
  gap: "6px",
  whiteSpace: "nowrap",
};

export const smallButtonStyle: CSSProperties = {
  minHeight: "30px",
  padding: "0 10px",
  border: "1px solid #cbd5e1",
  borderRadius: "7px",
  backgroundColor: "#ffffff",
  color: "#334155",
  fontFamily: "inherit",
  fontSize: "12px",
  fontWeight: 800,
  cursor: "pointer",
};

export const smallDangerButtonStyle: CSSProperties = {
  ...smallButtonStyle,
  border: "1px solid #fecaca",
  color: "#b91c1c",
  backgroundColor: "#fff7f7",
};

export const confirmedBadgeStyle: CSSProperties = {
  display: "inline-flex",
  minHeight: "25px",
  padding: "0 8px",
  alignItems: "center",
  borderRadius: "999px",
  backgroundColor: "#dcfce7",
  color: "#166534",
  fontSize: "11px",
  fontWeight: 900,
};

export const unconfirmedBadgeStyle: CSSProperties = {
  ...confirmedBadgeStyle,
  backgroundColor: "#fef3c7",
  color: "#92400e",
};

export const usedBadgeStyle: CSSProperties = {
  ...confirmedBadgeStyle,
  backgroundColor: "#dbeafe",
  color: "#1d4ed8",
};

export const unusedBadgeStyle: CSSProperties = {
  ...confirmedBadgeStyle,
  backgroundColor: "#f1f5f9",
  color: "#475569",
};

export const drawerBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 2147483646,
  display: "flex",
  justifyContent: "flex-end",
  backgroundColor: "rgba(15, 23, 42, 0.42)",
};

export const drawerPanelStyle: CSSProperties = {
  width: "min(480px, 96vw)",
  height: "100vh",
  backgroundColor: "#ffffff",
  boxShadow: "-18px 0 45px rgba(15, 23, 42, 0.18)",
  overflowY: "auto",
};

export const drawerFormStyle: CSSProperties = {
  minHeight: "100%",
  display: "flex",
  flexDirection: "column",
};

export const drawerHeaderStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 2,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "16px",
  padding: "20px",
  borderBottom: "1px solid #e2e8f0",
  backgroundColor: "#ffffff",
};

export const drawerTitleStyle: CSSProperties = {
  margin: 0,
  color: "#0f172a",
  fontSize: "22px",
  fontWeight: 900,
};

export const drawerDescriptionStyle: CSSProperties = {
  margin: "6px 0 0",
  color: "#64748b",
  fontSize: "13px",
};

export const drawerCloseButtonStyle: CSSProperties = {
  width: "36px",
  height: "36px",
  border: "1px solid #cbd5e1",
  borderRadius: "9px",
  backgroundColor: "#ffffff",
  color: "#334155",
  fontSize: "22px",
  cursor: "pointer",
};

export const badgeDrawerRequirementStyle: CSSProperties = {
  display: "grid",
  gap: "9px",
  padding: "13px 14px",
  border: "1px solid #fed7aa",
  borderRadius: "11px",
  backgroundColor: "#fff7ed",
};

export const badgeDrawerRequirementHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  color: "#9a3412",
  fontSize: "12px",
};

export const badgeDrawerRequirementRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "12px",
  paddingTop: "8px",
  borderTop: "1px solid #fed7aa",
  color: "#475569",
  fontSize: "12px",
};

export const badgeDrawerDangerStyle: CSSProperties = {
  color: "#b91c1c",
  textAlign: "right",
};

export const badgeDrawerWarningStyle: CSSProperties = {
  color: "#c2410c",
  textAlign: "right",
};

export const badgeDrawerGoodStyle: CSSProperties = {
  color: "#15803d",
  textAlign: "right",
};

export const rankApprovalReferenceStyle: CSSProperties = {
  padding: "14px",
  border: "1px solid #bfdbfe",
  borderRadius: "12px",
  backgroundColor: "#f8fbff",
};

export const rankApprovalReferenceHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "12px",
  marginBottom: "12px",
};

export const rankApprovalReferenceTitleStyle: CSSProperties = {
  margin: 0,
  color: "#0f172a",
  fontSize: "15px",
  fontWeight: 900,
};

export const rankApprovalReferenceDescriptionStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#64748b",
  fontSize: "12px",
  lineHeight: 1.45,
};

export const rankApprovalReferenceBadgeStyle: CSSProperties = {
  minHeight: "25px",
  padding: "0 9px",
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "999px",
  backgroundColor: "#dbeafe",
  color: "#1d4ed8",
  fontSize: "11px",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

export const rankApprovalReferenceGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "8px",
};

export const rankApprovalReferenceItemStyle: CSSProperties = {
  minWidth: 0,
  padding: "9px 10px",
  border: "1px solid #e2e8f0",
  borderRadius: "9px",
  backgroundColor: "#ffffff",
};

export const rankApprovalReferenceCurrentItemStyle: CSSProperties = {
  border: "1px solid #2563eb",
  backgroundColor: "#eff6ff",
  boxShadow: "0 0 0 2px rgba(37, 99, 235, 0.08)",
};

export const rankApprovalReferenceRankStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  color: "#334155",
  fontSize: "12px",
  fontWeight: 900,
};

export const rankApprovalReferenceCurrentLabelStyle: CSSProperties = {
  minHeight: "20px",
  padding: "0 6px",
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "999px",
  backgroundColor: "#2563eb",
  color: "#ffffff",
  fontSize: "10px",
  fontWeight: 900,
};

export const rankApprovalReferenceDateStyle: CSSProperties = {
  marginTop: "5px",
  color: "#0f172a",
  fontSize: "13px",
  fontWeight: 900,
};

export const rankApprovalReferenceEmptyDateStyle: CSSProperties = {
  marginTop: "5px",
  color: "#94a3b8",
  fontSize: "12px",
  fontWeight: 700,
};

export const rankApprovalReferenceNoticeStyle: CSSProperties = {
  margin: "10px 0 0",
  color: "#1e3a8a",
  fontSize: "11px",
  fontWeight: 700,
  lineHeight: 1.5,
};

export const drawerTargetSummaryStyle: CSSProperties = {
  display: "grid",
  gap: "4px",
  padding: "12px 14px",
  border: "1px solid #dbeafe",
  borderRadius: "10px",
  backgroundColor: "#f8fbff",
  color: "#334155",
  fontSize: "13px",
};

export const drawerTargetLabelStyle: CSSProperties = {
  color: "#1d4ed8",
  fontSize: "11px",
  fontWeight: 900,
};

export const drawerFieldLabelStyle: CSSProperties = {
  display: "grid",
  gap: "7px",
  color: "#334155",
  fontSize: "13px",
  fontWeight: 800,
};

export const drawerLabelTextStyle: CSSProperties = {
  color: "#334155",
  fontSize: "13px",
  fontWeight: 800,
};

export const drawerInputStyle: CSSProperties = {
  width: "100%",
  minHeight: "42px",
  padding: "9px 11px",
  border: "1px solid #cbd5e1",
  borderRadius: "9px",
  backgroundColor: "#ffffff",
  color: "#0f172a",
  boxSizing: "border-box",
  fontFamily: "inherit",
  fontSize: "14px",
};

export const drawerTextareaStyle: CSSProperties = {
  ...drawerInputStyle,
  minHeight: "100px",
  resize: "vertical",
};

export const submitButtonStyle: CSSProperties = {
  minHeight: "40px",
  padding: "0 15px",
  border: "1px solid #2563eb",
  borderRadius: "9px",
  backgroundColor: "#2563eb",
  color: "#ffffff",
  fontFamily: "inherit",
  fontSize: "14px",
  fontWeight: 900,
  cursor: "pointer",
};

export const drawerBodyStyle: CSSProperties = {
  flex: 1,
  display: "grid",
  alignContent: "start",
  gap: "14px",
  padding: "20px",
};

export const fieldLabelTitleStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  whiteSpace: "nowrap",
};

export const fieldLabelStyle: CSSProperties = {
  display: "grid",
  gap: "7px",
  color: "#334155",
  fontSize: "13px",
  fontWeight: 800,
};

export const requiredStyle: CSSProperties = {
  color: "#dc2626",
};

export const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: "42px",
  padding: "9px 11px",
  border: "1px solid #cbd5e1",
  borderRadius: "9px",
  backgroundColor: "#ffffff",
  color: "#0f172a",
  boxSizing: "border-box",
  fontFamily: "inherit",
  fontSize: "14px",
};

export const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: "100px",
  resize: "vertical",
};

export const checkboxLabelStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  color: "#334155",
  fontSize: "14px",
  fontWeight: 800,
};

export const drawerFooterStyle: CSSProperties = {
  position: "sticky",
  bottom: 0,
  display: "flex",
  justifyContent: "flex-end",
  gap: "8px",
  padding: "16px 20px",
  borderTop: "1px solid #e2e8f0",
  backgroundColor: "#ffffff",
};

export const badgeManagementSummaryStyle: CSSProperties = {
  padding: "18px",
  border: "1px solid #bfdbfe",
  borderRadius: "14px",
  backgroundColor: "#ffffff",
};

export const managementSummaryHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "16px",
};

export const currentRankBadgeStyle: CSSProperties = {
  minHeight: "30px",
  padding: "0 11px",
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "999px",
  backgroundColor: "#dbeafe",
  color: "#1d4ed8",
  fontSize: "12px",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

export function managementAlertStyle(ready: boolean): CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    marginTop: "14px",
    padding: "13px 14px",
    borderRadius: "10px",
    border: ready ? "1px solid #bbf7d0" : "1px solid #fed7aa",
    backgroundColor: ready ? "#f0fdf4" : "#fff7ed",
    color: ready ? "#166534" : "#9a3412",
    fontSize: "13px",
    lineHeight: 1.5,
  };
}

export const stageCardGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: "12px",
};

export const stageCardStyle: CSSProperties = {
  padding: "15px",
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  backgroundColor: "#ffffff",
};

export const currentStageCardStyle: CSSProperties = {
  border: "2px solid #2563eb",
  backgroundColor: "#f8fbff",
  boxShadow: "0 0 0 3px rgba(37, 99, 235, 0.08)",
};

export const stageCardHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "10px",
  paddingBottom: "11px",
  borderBottom: "1px solid #f1f5f9",
};

export const stageTitleStyle: CSSProperties = {
  margin: 0,
  color: "#0f172a",
  fontSize: "16px",
  fontWeight: 900,
};

export const stageSubTextStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#64748b",
  fontSize: "12px",
  lineHeight: 1.4,
};

export const readyStageBadgeStyle: CSSProperties = {
  ...conditionBadgeBaseStyle,
  backgroundColor: "#dcfce7",
  color: "#166534",
};

export const currentStageBadgeStyle: CSSProperties = {
  ...conditionBadgeBaseStyle,
  backgroundColor: "#ffedd5",
  color: "#c2410c",
};

export const completedStageBadgeStyle: CSSProperties = {
  ...conditionBadgeBaseStyle,
  backgroundColor: "#dbeafe",
  color: "#1d4ed8",
};

export const futureStageBadgeStyle: CSSProperties = {
  ...conditionBadgeBaseStyle,
  backgroundColor: "#f1f5f9",
  color: "#64748b",
};

export const badgeRequirementListStyle: CSSProperties = {
  display: "grid",
  gap: "8px",
  padding: "12px 0",
};

export const badgeRequirementItemStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "24px minmax(0, 1fr) auto",
  alignItems: "center",
  gap: "8px",
};

export const requirementCheckStyle: CSSProperties = {
  width: "22px",
  height: "22px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "999px",
  backgroundColor: "#dcfce7",
  color: "#166534",
  fontSize: "12px",
  fontWeight: 900,
};

export const requirementMissingStyle: CSSProperties = {
  ...requirementCheckStyle,
  backgroundColor: "#fee2e2",
  color: "#b91c1c",
};

export const requirementNameDoneStyle: CSSProperties = {
  color: "#334155",
  fontSize: "13px",
  fontWeight: 800,
};

export const requirementNameMissingStyle: CSSProperties = {
  ...requirementNameDoneStyle,
  color: "#b91c1c",
};

export const acquiredTextStyle: CSSProperties = {
  color: "#166534",
  fontSize: "12px",
  fontWeight: 900,
};

export const missingTextStyle: CSSProperties = {
  color: "#b91c1c",
  fontSize: "12px",
  fontWeight: 900,
};


export const futureRequirementIconStyle: CSSProperties = {
  ...requirementCheckStyle,
  backgroundColor: "#dbeafe",
  color: "#2563eb",
};

export const futureRequirementNameStyle: CSSProperties = {
  ...requirementNameDoneStyle,
  color: "#475569",
};

export const futureRequirementTextStyle: CSSProperties = {
  color: "#2563eb",
  fontSize: "12px",
  fontWeight: 900,
};

export const historyRequirementIconStyle: CSSProperties = {
  ...requirementCheckStyle,
  backgroundColor: "#e2e8f0",
  color: "#64748b",
};

export const historyRequirementNameStyle: CSSProperties = {
  ...requirementNameDoneStyle,
  color: "#475569",
};

export const historyRequirementTextStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "12px",
  fontWeight: 900,
};

export const futureConditionBadgeStyle: CSSProperties = {
  ...conditionBadgeBaseStyle,
  backgroundColor: "#dbeafe",
  color: "#2563eb",
};

export const historyConditionBadgeStyle: CSSProperties = {
  ...conditionBadgeBaseStyle,
  backgroundColor: "#e2e8f0",
  color: "#475569",
};

export const generalRequirementRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  paddingTop: "11px",
  borderTop: "1px solid #f1f5f9",
};

export const generalRequirementTitleStyle: CSSProperties = {
  color: "#334155",
  fontSize: "13px",
  fontWeight: 900,
};


export const overviewConditionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "9px",
};

export function overviewConditionItemStyle(
  passed: boolean | null,
): CSSProperties {
  return {
    minWidth: 0,
    minHeight: "86px",
    padding: "11px 12px",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignContent: "start",
    gap: "6px 8px",
    border:
      passed === null
        ? "1px solid #94a3b8"
        : passed
          ? "2px solid #22c55e"
          : "2px solid #ef4444",
    borderRadius: "11px",
    backgroundColor:
      passed === null ? "#f1f5f9" : passed ? "#ecfdf3" : "#fff1f2",
    color: "#0f172a",
    fontFamily: "inherit",
    textAlign: "left",
    cursor: "pointer",
    boxSizing: "border-box",
  };
}

export const overviewConditionLabelStyle: CSSProperties = {
  minWidth: 0,
  color: "#0f172a",
  fontSize: "14px",
  fontWeight: 900,
};

export function overviewConditionStatusStyle(
  passed: boolean | null,
): CSSProperties {
  return {
    minHeight: "23px",
    padding: "0 8px",
    display: "inline-flex",
    alignItems: "center",
    borderRadius: "999px",
    backgroundColor:
      passed === null ? "#cbd5e1" : passed ? "#16a34a" : "#dc2626",
    color: "#ffffff",
    fontSize: "11px",
    fontWeight: 900,
    whiteSpace: "nowrap",
  };
}

export const overviewConditionDetailStyle: CSSProperties = {
  gridColumn: "1 / -1",
  color: "#64748b",
  fontSize: "11px",
  lineHeight: 1.45,
  wordBreak: "keep-all",
};

export function overviewActionButtonStyle(
  state: "ready" | "attention" | "pending",
): CSSProperties {
  const palette = {
    ready: {
      border: "#16a34a",
      backgroundColor: "#16a34a",
      color: "#ffffff",
    },
    attention: {
      border: "#dc2626",
      backgroundColor: "#fff7f7",
      color: "#b91c1c",
    },
    pending: {
      border: "#2563eb",
      backgroundColor: "#2563eb",
      color: "#ffffff",
    },
  }[state];

  return {
    minHeight: "36px",
    padding: "0 12px",
    border: `1px solid ${palette.border}`,
    borderRadius: "8px",
    backgroundColor: palette.backgroundColor,
    color: palette.color,
    fontFamily: "inherit",
    fontSize: "12px",
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

export const overviewRecordCheckSectionStyle: CSSProperties = {
  marginTop: "12px",
  paddingTop: "12px",
  borderTop: "1px solid #e2e8f0",
};

export const overviewRecordCheckHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "12px",
  marginBottom: "8px",
  color: "#0f172a",
  fontSize: "13px",
};

export const recentTimelineStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
};

export const recentTimelineGroupStyle: CSSProperties = {
  position: "relative",
  display: "grid",
  gridTemplateColumns: "92px minmax(0, 1fr)",
  gap: "12px",
  alignItems: "start",
};

export const recentTimelineDateStyle: CSSProperties = {
  minHeight: "25px",
  padding: "4px 8px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "999px",
  backgroundColor: "#eff6ff",
  color: "#1d4ed8",
  fontSize: "11px",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

export const recentTimelineItemStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  minWidth: 0,
  padding: "8px 0 10px 8px",
  display: "grid",
  gridTemplateColumns: "12px minmax(0, 1fr)",
  gap: "8px",
  border: "none",
  borderBottom: "1px solid #f1f5f9",
  backgroundColor: "transparent",
  color: "#334155",
  fontFamily: "inherit",
  textAlign: "left",
  cursor: "pointer",
};

export const recentTimelineDotStyle: CSSProperties = {
  width: "10px",
  height: "10px",
  marginTop: "4px",
  borderRadius: "999px",
  backgroundColor: "#2563eb",
  boxShadow: "0 0 0 4px #dbeafe",
};

export const recentTimelineContentStyle: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: "3px",
};

export const recentTimelineTitleStyle: CSSProperties = {
  color: "#0f172a",
  fontSize: "13px",
  fontWeight: 900,
};

export const recentTimelineDetailStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "12px",
  lineHeight: 1.4,
  wordBreak: "keep-all",
};


export const collapsedWorkspaceStyle: CSSProperties = {
  gridTemplateColumns: "54px minmax(0, 1fr)",
  gap: "10px",
};

export const collapsedScoutPanelStyle: CSSProperties = {
  width: "54px",
  minWidth: "54px",
};

export const collapsedScoutPanelHeaderStyle: CSSProperties = {
  minHeight: "100%",
  padding: "10px 7px",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: "10px",
  borderBottom: "none",
};

export const collapsedScoutPanelLabelStyle: CSSProperties = {
  writingMode: "vertical-rl",
  textOrientation: "upright",
  color: "#475569",
  fontSize: "12px",
  fontWeight: 900,
  letterSpacing: "0.08em",
};

export const scoutPanelCollapseButtonStyle: CSSProperties = {
  width: "34px",
  height: "34px",
  minWidth: "34px",
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #60a5fa",
  borderRadius: "9px",
  backgroundColor: "#2563eb",
  color: "#ffffff",
  boxShadow: "0 3px 10px rgba(37, 99, 235, 0.22)",
  fontFamily: "inherit",
  fontSize: "17px",
  lineHeight: 1,
  fontWeight: 900,
  cursor: "pointer",
};
