import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

type ToastTone = "success" | "warning" | "error" | "info";

type HelpSection = {
  title: string;
  content: ReactNode;
};

export function PageHelpButton({
  title,
  description,
  sections,
}: {
  title: string;
  description: string;
  sections: HelpSection[];
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${title} 도움말`}
        title="사용 방법 보기"
        style={helpButtonStyle}
      >
        ?
      </button>
      {open ? (
        <div style={overlayStyle} role="presentation" onClick={() => setOpen(false)}>
          <section
            style={dialogStyle}
            role="dialog"
            aria-modal="true"
            aria-label={`${title} 도움말`}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={dialogHeaderStyle}>
              <div>
                <h2 style={dialogTitleStyle}>{title} 도움말</h2>
                <p style={dialogDescriptionStyle}>{description}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} style={closeButtonStyle}>
                닫기
              </button>
            </div>
            <div style={sectionListStyle}>
              {sections.map((section) => (
                <div key={section.title} style={helpSectionStyle}>
                  <strong style={helpSectionTitleStyle}>{section.title}</strong>
                  <div style={helpSectionContentStyle}>{section.content}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

export function FeedbackToast({
  message,
  tone = "success",
  onClose,
  autoCloseMs = 3500,
}: {
  message: string;
  tone?: ToastTone;
  onClose: () => void;
  autoCloseMs?: number;
}) {
  useEffect(() => {
    if (!message || autoCloseMs <= 0) return;
    const timer = window.setTimeout(onClose, autoCloseMs);
    return () => window.clearTimeout(timer);
  }, [autoCloseMs, message, onClose]);

  if (!message) return null;

  const palette = {
    success: { backgroundColor: "#ecfdf5", borderColor: "#86efac", color: "#166534", mark: "✓" },
    warning: { backgroundColor: "#fffbeb", borderColor: "#fde68a", color: "#92400e", mark: "!" },
    error: { backgroundColor: "#fef2f2", borderColor: "#fecaca", color: "#b91c1c", mark: "!" },
    info: { backgroundColor: "#eff6ff", borderColor: "#bfdbfe", color: "#1d4ed8", mark: "i" },
  }[tone];

  return (
    <div style={{ ...toastStyle, ...palette }} role="status" aria-live="polite">
      <span style={toastMarkStyle}>{palette.mark}</span>
      <span style={toastMessageStyle}>{message}</span>
      <button type="button" onClick={onClose} style={{ ...toastCloseStyle, color: palette.color }}>
        닫기
      </button>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <section style={emptyStateStyle}>
      <div style={emptyIconStyle}>＋</div>
      <h3 style={emptyTitleStyle}>{title}</h3>
      <p style={emptyDescriptionStyle}>{description}</p>
      {actionLabel && onAction ? (
        <button type="button" onClick={onAction} style={emptyActionStyle}>
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}

const helpButtonStyle: CSSProperties = {
  width: "30px",
  height: "30px",
  borderRadius: "999px",
  border: "1px solid #bfdbfe",
  backgroundColor: "#eff6ff",
  color: "#1d4ed8",
  fontSize: "15px",
  fontWeight: 900,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 2147483647,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
  backgroundColor: "rgba(15, 23, 42, 0.5)",
};

const dialogStyle: CSSProperties = {
  width: "min(680px, 100%)",
  maxHeight: "82vh",
  overflowY: "auto",
  borderRadius: "18px",
  border: "1px solid #e2e8f0",
  backgroundColor: "#ffffff",
  boxShadow: "0 24px 60px rgba(15, 23, 42, 0.25)",
  padding: "22px",
};

const dialogHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "20px", alignItems: "flex-start" };
const dialogTitleStyle: CSSProperties = { margin: 0, color: "#0f172a", fontSize: "22px", fontWeight: 900 };
const dialogDescriptionStyle: CSSProperties = { margin: "8px 0 0", color: "#64748b", lineHeight: 1.6 };
const closeButtonStyle: CSSProperties = { padding: "8px 12px", borderRadius: "9px", border: "1px solid #cbd5e1", backgroundColor: "#ffffff", color: "#334155", fontWeight: 800, cursor: "pointer" };
const sectionListStyle: CSSProperties = { display: "grid", gap: "12px", marginTop: "20px" };
const helpSectionStyle: CSSProperties = { padding: "14px 16px", borderRadius: "12px", border: "1px solid #e2e8f0", backgroundColor: "#f8fafc" };
const helpSectionTitleStyle: CSSProperties = { display: "block", color: "#0f172a", marginBottom: "6px" };
const helpSectionContentStyle: CSSProperties = { color: "#475569", lineHeight: 1.65, fontSize: "14px" };

const toastStyle: CSSProperties = {
  position: "fixed",
  top: "22px",
  right: "22px",
  zIndex: 2147483646,
  minWidth: "300px",
  maxWidth: "520px",
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr) auto",
  alignItems: "center",
  gap: "10px",
  padding: "13px 14px",
  border: "1px solid",
  borderRadius: "12px",
  boxShadow: "0 14px 34px rgba(15, 23, 42, 0.16)",
};
const toastMarkStyle: CSSProperties = { width: "24px", height: "24px", borderRadius: "999px", border: "1px solid currentColor", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 900 };
const toastMessageStyle: CSSProperties = { fontSize: "14px", fontWeight: 800, lineHeight: 1.5 };
const toastCloseStyle: CSSProperties = { border: "none", background: "transparent", fontWeight: 800, cursor: "pointer" };

const emptyStateStyle: CSSProperties = { padding: "34px 20px", borderRadius: "14px", border: "1px dashed #cbd5e1", backgroundColor: "#f8fafc", textAlign: "center" };
const emptyIconStyle: CSSProperties = { width: "42px", height: "42px", margin: "0 auto 12px", borderRadius: "999px", backgroundColor: "#dbeafe", color: "#1d4ed8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px", fontWeight: 900 };
const emptyTitleStyle: CSSProperties = { margin: 0, color: "#0f172a", fontSize: "17px", fontWeight: 900 };
const emptyDescriptionStyle: CSSProperties = { margin: "8px auto 0", maxWidth: "520px", color: "#64748b", lineHeight: 1.65 };
const emptyActionStyle: CSSProperties = { marginTop: "16px", minHeight: "40px", padding: "0 16px", borderRadius: "10px", border: "none", backgroundColor: "#2563eb", color: "#ffffff", fontWeight: 800, cursor: "pointer" };
