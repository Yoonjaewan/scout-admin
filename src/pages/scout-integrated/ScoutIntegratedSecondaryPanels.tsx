import type { CSSProperties } from "react";
import { ConditionRow, InfoItem } from "./ScoutIntegratedDisplayComponents";
import {
  allPassedBoxStyle,
  attendanceBadgeStyle,
  attendanceBadgeWrapStyle,
  attendanceSummaryGridStyle,
  conditionBadgeBaseStyle,
  contentCardStyle,
  contentDescriptionStyle,
  contentHeaderStyle,
  contentTitleStyle,
  emptyContentStyle,
  errorBoxStyle,
  noticeBoxStyle,
  overviewSectionHeaderStyle,
  overviewStackStyle,
  primaryWorkButtonStyle,
  programActionNoticeStyle,
  programMissingDescriptionStyle,
  programStatusActionStyle,
  programStatusCardStyle,
  programStatusCompletedStyle,
  programStatusDescriptionStyle,
  programStatusDetailGridStyle,
  programStatusGridStyle,
  programStatusHeaderStyle,
  programStatusTypeStyle,
  programSummaryCardStyle,
  rowActionStyle,
  smallButtonStyle,
  smallDangerButtonStyle,
  strongTdStyle,
  successMessageStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
  twoColumnGridStyle,
  warningTextStyle,
} from "./ScoutIntegratedPage.styles";

type ProgramCompletion = {
  id: string;
  scout_id: string;
  program_type: "WSEP" | "MoP";
  completed_at: string;
  certificate_no: string | null;
  approved_at: string | null;
  note: string | null;
};

type Attendance = {
  id: string;
  scout_id: string;
  status: string;
};

const ATTENDANCE_LABELS: Record<string, string> = {
  present: "출석",
  late: "지각",
  excused: "인정결석",
  absent: "결석",
  not_entered: "미입력",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return value.slice(0, 10).replaceAll("-", ".");
}

function getConditionStyle(passed: boolean | null): CSSProperties {
  if (passed === null) {
    return {
      ...conditionBadgeBaseStyle,
      backgroundColor: "#f1f5f9",
      color: "#475569",
    };
  }

  return {
    ...conditionBadgeBaseStyle,
    backgroundColor: passed ? "#dcfce7" : "#fee2e2",
    color: passed ? "#166534" : "#b91c1c",
  };
}

function getAttendanceSummary(rows: Attendance[]) {
  const enteredRows = rows.filter((row) => row.status !== "not_entered");
  const recognizedRows = enteredRows.filter(
    (row) =>
      row.status === "present" ||
      row.status === "late" ||
      row.status === "excused",
  );

  return {
    entered: enteredRows.length,
    recognized: recognizedRows.length,
    rate:
      enteredRows.length > 0
        ? Math.round((recognizedRows.length / enteredRows.length) * 100)
        : null,
  };
}

export function ProgramPanel({
  completions,
  canManage,
  actionMessage,
  errorMessage,
  deletingId,
  onCreate,
  onEdit,
  onDelete,
}: {
  completions: ProgramCompletion[];
  canManage: boolean;
  actionMessage: string;
  errorMessage: string;
  deletingId: string;
  onCreate: (programType?: "WSEP" | "MoP") => void;
  onEdit: (completion: ProgramCompletion) => void;
  onDelete: (completion: ProgramCompletion) => void;
}) {
  const wsep = completions.find((completion) => completion.program_type === "WSEP") ?? null;
  const mop = completions.find((completion) => completion.program_type === "MoP") ?? null;
  const hasAnyProgram = completions.some((completion) => Boolean(completion.approved_at));
  const missingApprovalCount = completions.filter((completion) => !completion.approved_at).length;
  const missingCertificateCount = completions.filter((completion) => !completion.certificate_no).length;

  return (
    <div style={overviewStackStyle}>
      <section style={programSummaryCardStyle}>
        <div style={overviewSectionHeaderStyle}>
          <div>
            <h3 style={contentTitleStyle}>범 진급 프로그램 준비 현황</h3>
            <p style={contentDescriptionStyle}>WSEP 또는 MoP 중 1개 이상 이수 여부와 증빙 누락을 확인합니다.</p>
          </div>
          <span style={getConditionStyle(hasAnyProgram)}>{hasAnyProgram ? "진급 조건 충족" : "이수 확인 필요"}</span>
        </div>
        {actionMessage && <div style={successMessageStyle}>{actionMessage}</div>}
        {errorMessage && <div style={errorBoxStyle}>{errorMessage}</div>}
        <div style={programStatusGridStyle}>
          <ProgramStatusCard programType="WSEP" completion={wsep} canManage={canManage} deletingId={deletingId} onCreate={onCreate} onEdit={onEdit} onDelete={onDelete} />
          <ProgramStatusCard programType="MoP" completion={mop} canManage={canManage} deletingId={deletingId} onCreate={onCreate} onEdit={onEdit} onDelete={onDelete} />
        </div>
      </section>

      <div style={twoColumnGridStyle}>
        <section style={contentCardStyle}>
          <div style={overviewSectionHeaderStyle}>
            <div><h3 style={contentTitleStyle}>관리 확인 사항</h3><p style={contentDescriptionStyle}>이수 여부뿐 아니라 승인일과 수료증번호를 확인합니다.</p></div>
          </div>
          <ConditionRow label="WSEP 또는 MoP 이수" passed={hasAnyProgram} detail={`${completions.length}건 등록`} />
          <ConditionRow label="승인일 입력" passed={completions.length === 0 ? null : missingApprovalCount === 0} detail={completions.length === 0 ? "등록 기록 없음" : `미등록 ${missingApprovalCount}건`} />
          <ConditionRow label="수료증번호 입력" passed={completions.length === 0 ? null : missingCertificateCount === 0} detail={completions.length === 0 ? "등록 기록 없음" : `미등록 ${missingCertificateCount}건`} />
          <div style={noticeBoxStyle}>범 진급 신청서에는 세계스카우트 자연환경 프로그램 수료증번호와 승인일을 기재하므로, 단순 이수 여부만 확인하지 말고 증빙 정보까지 관리해야 합니다.</div>
        </section>

        <section style={contentCardStyle}>
          <div style={overviewSectionHeaderStyle}><div><h3 style={contentTitleStyle}>지도자 조치 안내</h3><p style={contentDescriptionStyle}>현재 기록 기준으로 다음 조치를 확인합니다.</p></div></div>
          {!hasAnyProgram ? (
            <div style={programActionNoticeStyle}><strong>프로그램 이수 기록이 없습니다.</strong><span>범 진급 준비를 위해 WSEP 또는 MoP 참가 여부를 확인하고 이수 기록을 등록하세요.</span></div>
          ) : (
            <>
              {missingApprovalCount > 0 && <div style={programActionNoticeStyle}><strong>승인일 미등록 {missingApprovalCount}건</strong><span>수료증 또는 연맹 승인 자료를 확인해 승인일을 보완하세요.</span></div>}
              {missingCertificateCount > 0 && <div style={programActionNoticeStyle}><strong>수료증번호 미등록 {missingCertificateCount}건</strong><span>범 진급 신청서 작성 전에 수료증번호를 보완하세요.</span></div>}
              {missingApprovalCount === 0 && missingCertificateCount === 0 && <div style={allPassedBoxStyle}>프로그램 이수와 증빙 정보가 모두 등록되어 있습니다.</div>}
            </>
          )}
        </section>
      </div>

      <section style={contentCardStyle}>
        <div style={overviewSectionHeaderStyle}>
          <div><h3 style={contentTitleStyle}>프로그램 이수 기록</h3><p style={contentDescriptionStyle}>등록된 WSEP 및 MoP 세부 기록을 확인하고 수정·삭제합니다.</p></div>
          {canManage && <div style={rowActionStyle}>{!wsep && <button type="button" style={smallButtonStyle} onClick={() => onCreate("WSEP")}>WSEP 등록</button>}{!mop && <button type="button" style={smallButtonStyle} onClick={() => onCreate("MoP")}>MoP 등록</button>}</div>}
        </div>
        {completions.length === 0 ? <div style={emptyContentStyle}>등록된 프로그램 이수 기록이 없습니다.</div> : (
          <div style={tableWrapStyle}><table style={tableStyle}><thead><tr><th style={thStyle}>프로그램</th><th style={thStyle}>이수일</th><th style={thStyle}>승인일</th><th style={thStyle}>수료증번호</th><th style={thStyle}>비고</th>{canManage && <th style={thStyle}>관리</th>}</tr></thead><tbody>
            {completions.map((completion) => <tr key={completion.id}><td style={strongTdStyle}>{completion.program_type}</td><td style={tdStyle}>{formatDate(completion.completed_at)}</td><td style={tdStyle}>{completion.approved_at ? formatDate(completion.approved_at) : <span style={warningTextStyle}>미등록</span>}</td><td style={tdStyle}>{completion.certificate_no ?? <span style={warningTextStyle}>미등록</span>}</td><td style={tdStyle}>{completion.note ?? "-"}</td>{canManage && <td style={tdStyle}><div style={rowActionStyle}><button type="button" style={smallButtonStyle} onClick={() => onEdit(completion)} disabled={deletingId !== ""}>수정</button><button type="button" style={smallDangerButtonStyle} onClick={() => onDelete(completion)} disabled={deletingId === completion.id}>{deletingId === completion.id ? "삭제 중" : "삭제"}</button></div></td>}</tr>)}
          </tbody></table></div>
        )}
      </section>
    </div>
  );
}

function ProgramStatusCard({ programType, completion, canManage, deletingId, onCreate, onEdit, onDelete }: {
  programType: "WSEP" | "MoP";
  completion: ProgramCompletion | null;
  canManage: boolean;
  deletingId: string;
  onCreate: (programType?: "WSEP" | "MoP") => void;
  onEdit: (completion: ProgramCompletion) => void;
  onDelete: (completion: ProgramCompletion) => void;
}) {
  return (
    <article style={{ ...programStatusCardStyle, ...(completion?.approved_at ? programStatusCompletedStyle : {}) }}>
      <div style={programStatusHeaderStyle}><div><strong style={programStatusTypeStyle}>{programType}</strong><span style={programStatusDescriptionStyle}>{programType === "WSEP" ? "세계스카우트 자연환경 프로그램" : "Messengers of Peace"}</span></div><span style={getConditionStyle(completion ? Boolean(completion.approved_at) : false)}>{!completion ? "미이수" : completion.approved_at ? "승인 완료" : "승인 필요"}</span></div>
      {completion ? <><div style={programStatusDetailGridStyle}><InfoItem label="이수일" value={formatDate(completion.completed_at)} /><InfoItem label="승인일" value={formatDate(completion.approved_at)} /><InfoItem label="수료증번호" value={completion.certificate_no ?? "미등록"} /></div>{canManage && <div style={programStatusActionStyle}><button type="button" style={smallButtonStyle} onClick={() => onEdit(completion)} disabled={deletingId !== ""}>수정</button><button type="button" style={smallDangerButtonStyle} onClick={() => onDelete(completion)} disabled={deletingId === completion.id}>{deletingId === completion.id ? "삭제 중" : "삭제"}</button></div>}</> : <><p style={programMissingDescriptionStyle}>등록된 이수 기록이 없습니다.</p>{canManage && <button type="button" style={primaryWorkButtonStyle} onClick={() => onCreate(programType)}>{programType} 이수 등록</button>}</>}
    </article>
  );
}

export function AttendancePanel({ rows }: { rows: Attendance[] }) {
  const summary = getAttendanceSummary(rows);
  const countMap = rows.reduce<Record<string, number>>((accumulator, row) => {
    accumulator[row.status] = (accumulator[row.status] ?? 0) + 1;
    return accumulator;
  }, {});

  return (
    <section style={contentCardStyle}>
      <div style={contentHeaderStyle}><div><h3 style={contentTitleStyle}>출석 현황</h3><p style={contentDescriptionStyle}>입력된 출석 기록을 상태별로 집계합니다.</p></div></div>
      <div style={attendanceSummaryGridStyle}><InfoItem label="출석률" value={summary.rate === null ? "-" : `${summary.rate}%`} /><InfoItem label="입력 완료" value={`${summary.entered}회`} /><InfoItem label="출석 인정" value={`${summary.recognized}회`} /></div>
      {rows.length === 0 ? <div style={emptyContentStyle}>입력된 출석 기록이 없습니다.</div> : <div style={attendanceBadgeWrapStyle}>{Object.entries(countMap).map(([status, count]) => <span key={status} style={attendanceBadgeStyle}>{ATTENDANCE_LABELS[status] ?? status} {count}회</span>)}</div>}
      <div style={noticeBoxStyle}>출석률은 출석·지각·인정결석을 출석 인정으로 계산합니다.</div>
    </section>
  );
}
