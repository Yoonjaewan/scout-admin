import { useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { supabase } from "../../lib/supabase";

type UserRole = "super_admin" | "org_admin" | "leader" | "viewer";
type UserProfile = { role: UserRole; organization_id: string | null };
type Organization = { id: string; name: string };
type Rank = { id: string; rank_name: string; sort_order: number };
type Badge = { id: string; name: string };
type ScoutStatus = "active" | "inactive" | "graduated";

type PreviewRow = {
  sourceRow: number;
  sheetName: string;
  memberNo: string;
  name: string;
  grade: string;
  joinedAt: string;
  status: ScoutStatus;
  currentRankId: string;
  currentRankName: string;
  rankDates: Record<string, string>;
  isFromCub: boolean;
  cubPromotionCompleted: boolean;
  beginnerExempted: boolean;
  note: string;
  badgeItems: Array<{ badgeId: string; badgeName: string; approvedAt: string }>;
  errors: string[];
};

type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

const SHEET_NAMES = ["컵스카우트", "스카우트", "벤처스카우트"];
const STATUS_MAP: Record<string, ScoutStatus> = {
  활동: "active", active: "active",
  비활동: "inactive", inactive: "inactive",
  졸업: "graduated", graduated: "graduated",
};

function normalize(value: unknown) {
  return String(value ?? "").replace(/\s+/g, "").toLowerCase();
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function parseBoolean(value: unknown) {
  const normalized = normalize(value);
  return ["예", "o", "y", "yes", "true", "1"].includes(normalized);
}

function toIsoDate(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }
  const raw = text(value).replace(/[./]/g, "-");
  const match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return raw;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00`));
}

function getCell(row: Record<string, unknown>, aliases: string[]) {
  const normalizedEntries = Object.entries(row).map(([key, value]) => [normalize(key), value] as const);
  for (const alias of aliases) {
    const found = normalizedEntries.find(([key]) => key === normalize(alias));
    if (found) return found[1];
  }
  return "";
}

function getGrade(sheetName: string, value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  if (raw.includes("학교")) return raw;
  const number = raw.match(/\d+/)?.[0];
  if (!number) return raw;
  if (sheetName === "컵스카우트") return `초등학교 ${number}학년`;
  if (sheetName === "벤처스카우트") return `고등학교 ${number}학년`;
  return `중학교 ${number}학년`;
}

function getRankByName(ranks: Rank[], value: unknown) {
  const target = normalize(value).replace(/급$/, "");
  if (!target) return null;
  return ranks.find((rank) => {
    const rankName = normalize(rank.rank_name).replace(/급$/, "");
    return rankName === target || rankName.includes(target) || target.includes(rankName);
  }) ?? null;
}

function getRequiredRanks(ranks: Rank[], currentRankId: string) {
  const current = ranks.find((rank) => rank.id === currentRankId);
  if (!current) return [];
  return ranks.filter((rank) => rank.sort_order <= current.sort_order).sort((a, b) => a.sort_order - b.sort_order);
}

function getRankDate(row: Record<string, unknown>, rankName: string) {
  const compact = rankName.replace(/\s+/g, "");
  return toIsoDate(getCell(row, [
    `${rankName} 인가일`, `${rankName}인가일`, `${compact} 인가일`, `${compact}인가일`, `${rankName} 승인일`,
  ]));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function ScoutExcelImportDrawer({
  profile,
  organizations,
  ranks,
  badges,
  onClose,
  onCompleted,
}: {
  profile: UserProfile;
  organizations: Organization[];
  ranks: Rank[];
  badges: Badge[];
  onClose: () => void;
  onCompleted: (selectedScoutId: string | null) => void | Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [organizationId, setOrganizationId] = useState(
    profile.role === "super_admin" ? organizations[0]?.id ?? "" : profile.organization_id ?? "",
  );
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const organizationName = organizations.find((item) => item.id === organizationId)?.name ?? null;
  const validRows = useMemo(() => rows.filter((row) => row.errors.length === 0), [rows]);
  const errorCount = rows.length - validRows.length;

  const parseWorkbook = async (file: File) => {
    setErrorMessage("");
    setRows([]);
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const parsedRows: PreviewRow[] = [];

      const targetSheets = SHEET_NAMES.filter((name) => workbook.SheetNames.includes(name));
      const sheets = targetSheets.length > 0 ? targetSheets : workbook.SheetNames.slice(0, 1);

      sheets.forEach((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const sourceRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true });
        sourceRows.forEach((source, index) => {
          const name = text(getCell(source, ["대원명", "성명", "이름"]));
          const memberNo = text(getCell(source, ["대원번호", "회원번호"]));
          if (!name && !memberNo) return;

          const grade = getGrade(sheetName, getCell(source, ["학년"]));
          const joinedAt = toIsoDate(getCell(source, ["입단일", "등록일"]));
          const currentRankText = getCell(source, ["현재급위", "현재 급위", "급위"]);
          const currentRank = getRankByName(ranks, currentRankText);
          const statusText = normalize(getCell(source, ["상태"]));
          const status = STATUS_MAP[statusText] ?? "active";
          const rankDates: Record<string, string> = {};
          const errors: string[] = [];

          if (!name) errors.push("대원명이 없습니다.");
          if (!memberNo && !joinedAt) errors.push("신규 대원은 입단일이 필요합니다.");
          if (joinedAt && !isValidDate(joinedAt)) errors.push("입단일 형식이 올바르지 않습니다.");
          if (text(currentRankText) && !currentRank) errors.push(`현재급위 '${text(currentRankText)}'를 찾지 못했습니다.`);

          if (currentRank) {
            getRequiredRanks(ranks, currentRank.id).forEach((rank) => {
              const date = getRankDate(source, rank.rank_name);
              rankDates[rank.id] = date;
              if (!date) errors.push(`${rank.rank_name} 인가일이 없습니다.`);
              else if (!isValidDate(date)) errors.push(`${rank.rank_name} 인가일 형식이 올바르지 않습니다.`);
            });
          }

          const badgeItems: Array<{ badgeId: string; badgeName: string; approvedAt: string }> = [];
          for (let badgeIndex = 1; badgeIndex <= 12; badgeIndex += 1) {
            const badgeName = text(getCell(source, [`기능장${badgeIndex}`, `기능장 ${badgeIndex}`]));
            const approvedAt = toIsoDate(getCell(source, [`기능장${badgeIndex} 인가일`, `기능장 ${badgeIndex} 인가일`, `기능장${badgeIndex} 취득일`]));
            if (!badgeName && !approvedAt) continue;
            if (!badgeName) {
              errors.push(`기능장${badgeIndex} 이름이 없습니다.`);
              continue;
            }
            const badge = badges.find((item) => normalize(item.name) === normalize(badgeName));
            if (!badge) {
              errors.push(`기능장 '${badgeName}'을 찾지 못했습니다.`);
              continue;
            }
            if (!approvedAt || !isValidDate(approvedAt)) {
              errors.push(`${badgeName} 인가일이 올바르지 않습니다.`);
              continue;
            }
            badgeItems.push({ badgeId: badge.id, badgeName: badge.name, approvedAt });
          }

          parsedRows.push({
            sourceRow: index + 2,
            sheetName,
            memberNo,
            name,
            grade,
            joinedAt,
            status,
            currentRankId: currentRank?.id ?? "",
            currentRankName: currentRank?.rank_name ?? "",
            rankDates,
            isFromCub: parseBoolean(getCell(source, ["컵스카우트 출신"])),
            cubPromotionCompleted: parseBoolean(getCell(source, ["컵스카우트 승진과정 이수", "승진과정 이수"])),
            beginnerExempted: parseBoolean(getCell(source, ["초급과정 면제"])),
            note: text(getCell(source, ["비고", "메모"])),
            badgeItems,
            errors,
          });
        });
      });

      if (parsedRows.length === 0) {
        setErrorMessage("등록할 대원 정보를 찾지 못했습니다. 양식의 열 제목과 내용을 확인하세요.");
        return;
      }
      setRows(parsedRows);
    } catch (error) {
      console.error("엑셀 파일 확인 오류:", error);
      setErrorMessage("엑셀 파일을 확인하지 못했습니다. 올바른 .xlsx 파일인지 확인하세요.");
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void parseWorkbook(file);
  };

  const saveRankHistory = async (scoutId: string, rankId: string, approvedAt: string) => {
    const { data: existing, error: lookupError } = await supabase
      .from("scout_rank_histories")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("scout_id", scoutId)
      .eq("rank_id", rankId)
      .is("deleted_at", null)
      .maybeSingle();
    if (lookupError) throw new Error(lookupError.message);
    if (existing) {
      const { error } = await supabase.from("scout_rank_histories").update({
        approved_at: approvedAt,
        approval_type: "normal",
        note: "대원 통합관리 엑셀 등록",
      }).eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("scout_rank_histories").insert({
        organization_id: organizationId,
        scout_id: scoutId,
        rank_id: rankId,
        approved_at: approvedAt,
        approval_type: "normal",
        note: "대원 통합관리 엑셀 등록",
      });
      if (error) throw new Error(error.message);
    }
  };

  const handleSave = async () => {
    if (!organizationId) {
      setErrorMessage("소속대를 선택하세요.");
      return;
    }
    if (rows.length === 0) {
      setErrorMessage("먼저 엑셀 파일을 선택하세요.");
      return;
    }
    if (errorCount > 0) {
      setErrorMessage(`오류 ${errorCount}건을 먼저 수정한 뒤 다시 파일을 선택하세요.`);
      return;
    }

    setSubmitting(true);
    setErrorMessage("");
    let lastCreatedId: string | null = null;
    try {
      const rpcClient = supabase as unknown as RpcClient;
      for (const row of validRows) {
        let scoutId = "";
        if (row.memberNo) {
          const { data: existing, error: lookupError } = await supabase
            .from("scouts")
            .select("id")
            .eq("organization_id", organizationId)
            .eq("member_no", row.memberNo)
            .is("deleted_at", null)
            .maybeSingle();
          if (lookupError) throw new Error(`${row.name}: ${lookupError.message}`);
          if (!existing) throw new Error(`${row.name}: 대원번호 ${row.memberNo}에 해당하는 기존 대원을 찾지 못했습니다.`);
          scoutId = existing.id;
          const { error: updateError } = await supabase.from("scouts").update({
            name: row.name,
            grade: row.grade || null,
            joined_at: row.joinedAt || undefined,
            current_rank_id: row.currentRankId || null,
            status: row.status,
            is_from_cub_scout: row.isFromCub,
            cub_promotion_completed: row.cubPromotionCompleted,
            beginner_course_exempted: row.beginnerExempted || (row.isFromCub && row.cubPromotionCompleted && !row.grade.includes("초등학교")),
            note: row.note || null,
          }).eq("id", scoutId).eq("organization_id", organizationId);
          if (updateError) throw new Error(`${row.name}: ${updateError.message}`);
        } else {
          const { data: created, error } = await rpcClient.rpc("create_scout_auto_member_no", {
            p_name: row.name,
            p_organization_id: organizationId,
            p_school_name: organizationName,
            p_grade: row.grade || null,
            p_joined_at: row.joinedAt,
            p_is_from_cub_scout: row.isFromCub,
            p_cub_promotion_completed: row.cubPromotionCompleted,
            p_beginner_course_exempted: row.beginnerExempted || (row.isFromCub && row.cubPromotionCompleted && !row.grade.includes("초등학교")),
            p_note: row.note || null,
          });
          if (error) throw new Error(`${row.name}: ${error.message}`);
          scoutId = (created as { id: string }).id;
          lastCreatedId = scoutId;
          if (row.currentRankId) {
            const { error: rankUpdateError } = await supabase.from("scouts").update({ current_rank_id: row.currentRankId, status: row.status }).eq("id", scoutId).eq("organization_id", organizationId);
            if (rankUpdateError) throw new Error(`${row.name}: ${rankUpdateError.message}`);
          }
        }

        for (const [rankId, approvedAt] of Object.entries(row.rankDates)) {
          if (approvedAt) await saveRankHistory(scoutId, rankId, approvedAt);
        }

        for (const badgeItem of row.badgeItems) {
          const { data: existingBadge, error: badgeLookupError } = await supabase
            .from("scout_badges")
            .select("id")
            .eq("organization_id", organizationId)
            .eq("scout_id", scoutId)
            .eq("badge_id", badgeItem.badgeId)
            .is("deleted_at", null)
            .maybeSingle();
          if (badgeLookupError) throw new Error(`${row.name}: ${badgeLookupError.message}`);
          if (existingBadge) {
            const { error: badgeUpdateError } = await supabase.from("scout_badges").update({
              acquired_at: badgeItem.approvedAt,
              approved_at: badgeItem.approvedAt,
              leader_confirmed: true,
              note: "대원 통합관리 엑셀 등록",
            }).eq("id", existingBadge.id);
            if (badgeUpdateError) throw new Error(`${row.name}: ${badgeUpdateError.message}`);
          } else {
            const { error: badgeInsertError } = await supabase.from("scout_badges").insert({
              organization_id: organizationId,
              scout_id: scoutId,
              badge_id: badgeItem.badgeId,
              acquired_at: badgeItem.approvedAt,
              approved_at: badgeItem.approvedAt,
              leader_confirmed: true,
              note: "대원 통합관리 엑셀 등록",
            });
            if (badgeInsertError) throw new Error(`${row.name}: ${badgeInsertError.message}`);
          }
        }
      }
      await onCompleted(lastCreatedId);
    } catch (error) {
      console.error("엑셀 대원 저장 오류:", error);
      setErrorMessage(error instanceof Error ? `저장에 실패했습니다. ${error.message}` : "저장에 실패했습니다.");
      setSubmitting(false);
    }
  };

  const downloadTemplate = () => {
    const headers = [
      "대원번호", "대원명", "학년", "입단일", "상태", "컵스카우트 출신", "컵스카우트 승진과정 이수", "초급과정 면제", "비고", "현재급위",
      ...ranks.map((rank) => `${rank.rank_name} 인가일`),
      ...Array.from({ length: 12 }).flatMap((_, index) => [`기능장${index + 1}`, `기능장${index + 1} 인가일`]),
    ];
    const workbook = XLSX.utils.book_new();
    SHEET_NAMES.forEach((sheetName) => {
      const sheet = XLSX.utils.aoa_to_sheet([headers]);
      XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
    });
    const guide = XLSX.utils.aoa_to_sheet([
      ["항목", "작성 기준"],
      ["대원번호", "신규 대원은 비워두며, 기존 대원 수정 시 입력합니다."],
      ["대원명", "필수"],
      ["학년", "각 시트에 숫자만 입력해도 학교급이 자동 적용됩니다."],
      ["입단일", "신규 대원 필수, 예: 2026-03-01"],
      ["현재급위", "선택한 급위까지의 모든 인가일을 입력합니다."],
    ]);
    XLSX.utils.book_append_sheet(workbook, guide, "작성안내");
    XLSX.writeFile(workbook, `대원_엑셀_등록양식_${today()}.xlsx`);
  };

  return createPortal(
    <div style={backdropStyle} onMouseDown={() => !submitting && onClose()}>
      <aside style={panelStyle} onMouseDown={(event) => event.stopPropagation()} aria-modal="true" role="dialog" aria-label="엑셀 일괄등록">
        <header style={headerStyle}>
          <div>
            <h3 style={titleStyle}>엑셀 일괄등록</h3>
            <p style={descriptionStyle}>화면 이동 없이 여러 대원의 기본정보와 급위 이력을 등록하거나 수정합니다.</p>
          </div>
          <button type="button" style={closeStyle} onClick={onClose} disabled={submitting} aria-label="닫기">×</button>
        </header>

        <div style={bodyStyle}>
          {profile.role === "super_admin" && (
            <label style={fieldStyle}>
              <span style={labelStyle}>적용 소속대</span>
              <select style={inputStyle} value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} disabled={rows.length > 0 || submitting}>
                <option value="">소속대 선택</option>
                {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
              </select>
            </label>
          )}

          <section style={guideStyle}>
            <strong>등록 절차</strong>
            <span>1. 양식 다운로드 → 2. 엑셀 작성 → 3. 파일 선택 및 오류 확인 → 4. 저장</span>
          </section>

          <div style={actionRowStyle}>
            <button type="button" style={secondaryStyle} onClick={downloadTemplate}>양식 다운로드</button>
            <button type="button" style={primaryStyle} onClick={() => fileInputRef.current?.click()} disabled={!organizationId || submitting}>엑셀 파일 선택</button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" hidden onChange={handleFileChange} />
          </div>

          {errorMessage && <div style={errorStyle}>{errorMessage}</div>}

          {rows.length > 0 && (
            <>
              <div style={summaryStyle}>
                <span>파일: {fileName}</span><span>전체 {rows.length}건</span><span>정상 {validRows.length}건</span><span>기능장 {rows.reduce((sum, row) => sum + row.badgeItems.length, 0)}건</span><span>오류 {errorCount}건</span>
              </div>
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead><tr><th style={thStyle}>시트/행</th><th style={thStyle}>구분</th><th style={thStyle}>대원명</th><th style={thStyle}>학년</th><th style={thStyle}>입단일</th><th style={thStyle}>현재급위</th><th style={thStyle}>확인 결과</th></tr></thead>
                  <tbody>{rows.map((row) => (
                    <tr key={`${row.sheetName}-${row.sourceRow}`}>
                      <td style={tdStyle}>{row.sheetName} {row.sourceRow}행</td>
                      <td style={tdStyle}>{row.memberNo ? "기존 수정" : "신규 등록"}</td>
                      <td style={strongTdStyle}>{row.name || "-"}</td>
                      <td style={tdStyle}>{row.grade || "-"}</td>
                      <td style={tdStyle}>{row.joinedAt || "-"}</td>
                      <td style={tdStyle}>{row.currentRankName || "-"}</td>
                      <td style={tdStyle}>{row.errors.length > 0 ? <span style={badStyle}>{row.errors.join(" ")}</span> : <span style={goodStyle}>등록 가능</span>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <footer style={footerStyle}>
          <button type="button" style={secondaryStyle} onClick={onClose} disabled={submitting}>취소</button>
          <button type="button" style={primaryStyle} onClick={handleSave} disabled={submitting || validRows.length === 0 || errorCount > 0}>{submitting ? "저장 중..." : `${validRows.length}건 저장`}</button>
        </footer>
      </aside>
    </div>,
    document.body,
  );
}

const backdropStyle: CSSProperties = { position: "fixed", inset: 0, zIndex: 1300, backgroundColor: "rgba(15,23,42,.38)", display: "flex", justifyContent: "flex-end" };
const panelStyle: CSSProperties = { width: "min(980px, 94vw)", height: "100%", backgroundColor: "#fff", boxShadow: "-12px 0 32px rgba(15,23,42,.18)", display: "flex", flexDirection: "column" };
const headerStyle: CSSProperties = { padding: "20px 22px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", gap: 16 };
const titleStyle: CSSProperties = { margin: 0, fontSize: 23, fontWeight: 900, color: "#0f172a" };
const descriptionStyle: CSSProperties = { margin: "6px 0 0", fontSize: 13, color: "#64748b" };
const closeStyle: CSSProperties = { width: 38, height: 38, border: "1px solid #cbd5e1", borderRadius: 9, background: "#fff", fontSize: 22, cursor: "pointer" };
const bodyStyle: CSSProperties = { flex: 1, overflow: "auto", padding: 22 };
const fieldStyle: CSSProperties = { display: "grid", gap: 7, marginBottom: 14 };
const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 900, color: "#334155" };
const inputStyle: CSSProperties = { height: 42, border: "1px solid #cbd5e1", borderRadius: 9, padding: "0 11px", fontFamily: "inherit" };
const guideStyle: CSSProperties = { padding: 14, border: "1px solid #bfdbfe", borderRadius: 10, background: "#eff6ff", color: "#1e3a8a", display: "grid", gap: 4, fontSize: 13 };
const actionRowStyle: CSSProperties = { display: "flex", justifyContent: "flex-end", gap: 8, margin: "14px 0" };
const primaryStyle: CSSProperties = { minHeight: 39, padding: "0 14px", border: "1px solid #2563eb", borderRadius: 9, background: "#2563eb", color: "#fff", fontFamily: "inherit", fontWeight: 900, cursor: "pointer" };
const secondaryStyle: CSSProperties = { minHeight: 39, padding: "0 14px", border: "1px solid #cbd5e1", borderRadius: 9, background: "#fff", color: "#334155", fontFamily: "inherit", fontWeight: 900, cursor: "pointer" };
const errorStyle: CSSProperties = { padding: 13, marginBottom: 14, border: "1px solid #fecaca", borderRadius: 9, background: "#fef2f2", color: "#b91c1c", fontSize: 13 };
const summaryStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 10, padding: "10px 12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 9, color: "#475569", fontSize: 12, fontWeight: 800 };
const tableWrapStyle: CSSProperties = { marginTop: 10, overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 10 };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
const thStyle: CSSProperties = { padding: "10px 9px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#475569", textAlign: "left", whiteSpace: "nowrap" };
const tdStyle: CSSProperties = { padding: "10px 9px", borderBottom: "1px solid #f1f5f9", color: "#475569", verticalAlign: "top" };
const strongTdStyle: CSSProperties = { ...tdStyle, color: "#0f172a", fontWeight: 900 };
const goodStyle: CSSProperties = { color: "#15803d", fontWeight: 900 };
const badStyle: CSSProperties = { color: "#b91c1c", fontWeight: 800, lineHeight: 1.45 };
const footerStyle: CSSProperties = { padding: "14px 22px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: 8 };
