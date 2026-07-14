import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { InfoItem } from "./ScoutIntegratedDisplayComponents";
import {
  allPassedBoxStyle,
  attendanceBadgeStyle,
  attendanceBadgeWrapStyle,
  conditionBadgeBaseStyle,
  contentCardStyle,
  contentDescriptionStyle,
  contentTitleStyle,
  emptyContentStyle,
  errorBoxStyle,
  infoItemStyle,
  infoLabelStyle,
  infoValueStyle,
  noticeBoxStyle,
  overviewSectionHeaderStyle,
  overviewStackStyle,
  primaryWorkButtonStyle,
  programActionNoticeStyle,
  programCompactNoticeStyle,
  programMissingDescriptionStyle,
  programStatusActionStyle,
  programStatusCardStyle,
  programStatusCompletedStyle,
  programStatusDescriptionStyle,
  programStatusDetailGridStyle,
  programStatusGridStyle,
  programStatusHeaderStyle,
  programStatusReferenceCardStyle,
  programStatusTypeStyle,
  programSummaryCardStyle,
  programSummaryGridStyle,
  recentTimelineStyle,
  recordCheckGoodStyle,
  recordCheckWarningStyle,
  rowActionStyle,
  smallButtonStyle,
  smallDangerButtonStyle,
  strongTdStyle,
  successMessageStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
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
  meeting_id: string;
  status: string;
  note: string | null;
};

type RecentAttendanceHistoryItem = {
  id: string;
  meetingDate: string;
  title: string;
  status: string;
  note: string | null;
};

const ATTENDANCE_LABELS: Record<string, string> = {
  present: "출석",
  recognized: "인정출석",
  late: "지각",
  early_leave: "조퇴",
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
      row.status === "recognized" ||
      row.status === "late" ||
      row.status === "early_leave" ||
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

function hasDisplayTargetRankName(targetRankName: string) {
  return targetRankName.trim().length > 0 && targetRankName !== "-";
}

function getBeomLeaderActionMessage(
  completions: ProgramCompletion[],
  hasAnyProgram: boolean,
  missingCertificateCount: number,
) {
  if (completions.length === 0) {
    return {
      tone: "action" as const,
      message: "WSEP 또는 MoP 중 하나를 등록해 주세요.",
    };
  }
  if (!hasAnyProgram) {
    return {
      tone: "action" as const,
      message: "승인일을 입력해 주세요.",
    };
  }
  if (missingCertificateCount > 0) {
    return {
      tone: "action" as const,
      message: "수료증번호를 확인해 주세요.",
    };
  }
  return {
    tone: "complete" as const,
    message: "프로그램 조건과 증빙이 모두 확인되었습니다.",
  };
}

function getNonBeomLeaderActionMessage(
  completions: ProgramCompletion[],
  missingApprovalCount: number,
  missingCertificateCount: number,
) {
  if (completions.length === 0) {
    return {
      tone: "neutral" as const,
      message:
        "현재 진급 조건에는 적용되지 않습니다. 필요 시 참고 기록을 등록할 수 있습니다.",
    };
  }
  if (missingApprovalCount > 0 || missingCertificateCount > 0) {
    return {
      tone: "action" as const,
      message:
        "등록된 참고 기록의 승인일 또는 수료증번호를 확인해 주세요.",
    };
  }
  return {
    tone: "complete" as const,
    message: "등록된 프로그램 기록을 참고용으로 확인할 수 있습니다.",
  };
}

export function ProgramPanel({
  completions,
  isBeomTarget,
  targetRankName,
  canManage,
  actionMessage,
  errorMessage,
  deletingId,
  onCreate,
  onEdit,
  onDelete,
}: {
  completions: ProgramCompletion[];
  isBeomTarget: boolean;
  targetRankName: string;
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
  const hasTargetRankLabel = hasDisplayTargetRankName(targetRankName);

  const summaryTitle = isBeomTarget
    ? "범 진급 프로그램 준비 현황"
    : "프로그램 이수 기록 (참고)";
  const summaryDescription = isBeomTarget
    ? hasTargetRankLabel
      ? `다음 급위 ${targetRankName} 진급에 필요한 프로그램을 확인합니다. WSEP 또는 MoP 중 승인 완료된 프로그램 1건이 있으면 프로그램 조건을 충족합니다.`
      : "WSEP 또는 MoP 중 승인 완료된 프로그램 1건이 있으면 프로그램 조건을 충족합니다."
    : hasTargetRankLabel
      ? `현재 다음 급위 ${targetRankName}에서는 프로그램 조건이 적용되지 않습니다.`
      : "등록된 프로그램 기록을 참고용으로 확인합니다.";
  const summaryStatusLabel = isBeomTarget
    ? hasAnyProgram
      ? "프로그램 조건 충족"
      : completions.length > 0
        ? "승인 필요"
        : "등록 필요"
    : completions.length > 0
      ? "참고 기록"
      : "현재 단계 해당 없음";
  const summaryStatusStyle = isBeomTarget
    ? getConditionStyle(hasAnyProgram)
    : getConditionStyle(null);
  const summarySectionStyle = isBeomTarget
    ? programSummaryCardStyle
    : contentCardStyle;
  const tableEmptyMessage = isBeomTarget
    ? "WSEP 또는 MoP 중 하나의 이수 기록을 등록해 주세요."
    : "등록된 프로그램 이수 기록이 없습니다.";

  const beomSummaryItems = isBeomTarget
    ? [
        {
          label: "프로그램 조건",
          value: hasAnyProgram ? "충족" : "확인 필요",
          tone: hasAnyProgram ? ("good" as const) : ("warning" as const),
        },
        {
          label: "승인 대기",
          value:
            missingApprovalCount === 0
              ? "이상 없음"
              : `${missingApprovalCount}건 승인 필요`,
          tone: missingApprovalCount === 0 ? ("good" as const) : ("warning" as const),
        },
        {
          label: "수료증 확인",
          value:
            missingCertificateCount === 0
              ? "이상 없음"
              : `${missingCertificateCount}건 확인 필요`,
          tone:
            missingCertificateCount === 0 ? ("good" as const) : ("warning" as const),
        },
        {
          label: "이수 기록",
          value: completions.length === 0 ? "등록 필요" : "기록 있음",
          tone: completions.length === 0 ? ("warning" as const) : ("good" as const),
        },
      ]
    : [];

  const leaderAction = isBeomTarget
    ? getBeomLeaderActionMessage(
        completions,
        hasAnyProgram,
        missingCertificateCount,
      )
    : getNonBeomLeaderActionMessage(
        completions,
        missingApprovalCount,
        missingCertificateCount,
      );

  return (
    <div style={overviewStackStyle}>
      <section style={summarySectionStyle}>
        <div style={overviewSectionHeaderStyle}>
          <div>
            <h3 style={contentTitleStyle}>{summaryTitle}</h3>
            <p style={contentDescriptionStyle}>{summaryDescription}</p>
          </div>
          <span style={summaryStatusStyle}>{summaryStatusLabel}</span>
        </div>
        {actionMessage && <div style={successMessageStyle}>{actionMessage}</div>}
        {errorMessage && <div style={errorBoxStyle}>{errorMessage}</div>}
        {isBeomTarget && (
          <div style={programSummaryGridStyle}>
            {beomSummaryItems.map((item) => (
              <div key={item.label} style={infoItemStyle}>
                <span style={infoLabelStyle}>{item.label}</span>
                <strong
                  style={{
                    ...infoValueStyle,
                    ...(item.tone === "warning"
                      ? recordCheckWarningStyle
                      : recordCheckGoodStyle),
                  }}
                >
                  {item.value}
                </strong>
              </div>
            ))}
          </div>
        )}
      </section>

      <div style={programStatusGridStyle}>
        <ProgramStatusCard
          programType="WSEP"
          completion={wsep}
          isRequiredForCurrentStage={isBeomTarget}
          programConditionMet={hasAnyProgram}
          canManage={canManage}
          deletingId={deletingId}
          onCreate={onCreate}
          onEdit={onEdit}
          onDelete={onDelete}
        />
        <ProgramStatusCard
          programType="MoP"
          completion={mop}
          isRequiredForCurrentStage={isBeomTarget}
          programConditionMet={hasAnyProgram}
          canManage={canManage}
          deletingId={deletingId}
          onCreate={onCreate}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>

      <section style={contentCardStyle}>
        <div style={overviewSectionHeaderStyle}>
          <div>
            <h3 style={contentTitleStyle}>지도자 조치 안내</h3>
          </div>
        </div>
        {leaderAction.tone === "complete" ? (
          <div style={allPassedBoxStyle}>{leaderAction.message}</div>
        ) : leaderAction.tone === "action" ? (
          <div style={programActionNoticeStyle}>
            <span>{leaderAction.message}</span>
          </div>
        ) : (
          <div style={emptyContentStyle}>{leaderAction.message}</div>
        )}
      </section>

      {isBeomTarget && (
        <div style={programCompactNoticeStyle}>
          범 진급 신청 시 이수일·승인일·수료증번호를 증빙자료와 함께 확인해
          주세요.
        </div>
      )}

      <section style={contentCardStyle}>
        <div style={overviewSectionHeaderStyle}>
          <div><h3 style={contentTitleStyle}>프로그램 이수 기록</h3><p style={contentDescriptionStyle}>등록된 WSEP 및 MoP 세부 기록을 확인하고 수정·삭제합니다.</p></div>
          {canManage && <div style={rowActionStyle}>{!wsep && <button type="button" style={smallButtonStyle} onClick={() => onCreate("WSEP")}>WSEP 등록</button>}{!mop && <button type="button" style={smallButtonStyle} onClick={() => onCreate("MoP")}>MoP 등록</button>}</div>}
        </div>
        {completions.length === 0 ? (
          <div style={emptyContentStyle}>{tableEmptyMessage}</div>
        ) : (
          <div style={tableWrapStyle}><table style={tableStyle}><thead><tr><th style={thStyle}>프로그램</th><th style={thStyle}>이수일</th><th style={thStyle}>승인일</th><th style={thStyle}>수료증번호</th><th style={thStyle}>비고</th>{canManage && <th style={thStyle}>관리</th>}</tr></thead><tbody>
            {completions.map((completion) => <tr key={completion.id}><td style={strongTdStyle}>{completion.program_type}</td><td style={tdStyle}>{formatDate(completion.completed_at)}</td><td style={tdStyle}>{completion.approved_at ? formatDate(completion.approved_at) : <span style={warningTextStyle}>미등록</span>}</td><td style={tdStyle}>{completion.certificate_no ?? <span style={warningTextStyle}>미등록</span>}</td><td style={tdStyle}>{completion.note ?? "-"}</td>{canManage && <td style={tdStyle}><div style={rowActionStyle}><button type="button" style={smallButtonStyle} onClick={() => onEdit(completion)} disabled={deletingId !== ""}>수정</button><button type="button" style={smallDangerButtonStyle} onClick={() => onDelete(completion)} disabled={deletingId === completion.id}>{deletingId === completion.id ? "삭제 중" : "삭제"}</button></div></td>}</tr>)}
          </tbody></table></div>
        )}
      </section>
    </div>
  );
}

function ProgramStatusCard({
  programType,
  completion,
  isRequiredForCurrentStage,
  programConditionMet = false,
  canManage,
  deletingId,
  onCreate,
  onEdit,
  onDelete,
}: {
  programType: "WSEP" | "MoP";
  completion: ProgramCompletion | null;
  isRequiredForCurrentStage: boolean;
  programConditionMet?: boolean;
  canManage: boolean;
  deletingId: string;
  onCreate: (programType?: "WSEP" | "MoP") => void;
  onEdit: (completion: ProgramCompletion) => void;
  onDelete: (completion: ProgramCompletion) => void;
}) {
  const useNeutralEmptyCard =
    isRequiredForCurrentStage && programConditionMet && !completion;
  const statusLabel = !completion
    ? useNeutralEmptyCard || !isRequiredForCurrentStage
      ? "기록 없음"
      : "미이수"
    : completion.approved_at
      ? "승인 완료"
      : "승인 필요";
  const statusStyle = !completion
    ? useNeutralEmptyCard || !isRequiredForCurrentStage
      ? getConditionStyle(null)
      : getConditionStyle(false)
    : getConditionStyle(Boolean(completion.approved_at));
  const cardStyle = {
    ...(useNeutralEmptyCard
      ? programStatusReferenceCardStyle
      : isRequiredForCurrentStage
        ? programStatusCardStyle
        : programStatusReferenceCardStyle),
    ...(completion?.approved_at ? programStatusCompletedStyle : {}),
  };
  const emptyMessage = useNeutralEmptyCard
    ? "다른 프로그램 승인으로 조건을 충족했습니다."
    : isRequiredForCurrentStage
      ? "등록된 이수 기록이 없습니다."
      : "등록된 참고 기록이 없습니다.";

  return (
    <article style={cardStyle}>
      <div style={programStatusHeaderStyle}><div><strong style={programStatusTypeStyle}>{programType}</strong><span style={programStatusDescriptionStyle}>{programType === "WSEP" ? "세계스카우트 자연환경 프로그램" : "Messengers of Peace"}</span></div><span style={statusStyle}>{statusLabel}</span></div>
      {completion ? <><div style={programStatusDetailGridStyle}><InfoItem label="이수일" value={formatDate(completion.completed_at)} /><InfoItem label="승인일" value={formatDate(completion.approved_at)} /><InfoItem label="수료증번호" value={completion.certificate_no ?? "미등록"} /></div>{canManage && <div style={programStatusActionStyle}><button type="button" style={smallButtonStyle} onClick={() => onEdit(completion)} disabled={deletingId !== ""}>수정</button><button type="button" style={smallDangerButtonStyle} onClick={() => onDelete(completion)} disabled={deletingId === completion.id}>{deletingId === completion.id ? "삭제 중" : "삭제"}</button></div>}</> : <><p style={programMissingDescriptionStyle}>{emptyMessage}</p>{canManage && <button type="button" style={primaryWorkButtonStyle} onClick={() => onCreate(programType)}>{programType} 이수 등록</button>}</>}
    </article>
  );
}

export function AttendancePanel({
  rows,
  recentHistoryItems,
  isBeomTarget,
  attendanceRequiredForBeom,
  attendancePassed,
  attendanceRate,
  targetRankName,
}: {
  rows: Attendance[];
  recentHistoryItems: RecentAttendanceHistoryItem[];
  isBeomTarget: boolean;
  attendanceRequiredForBeom: boolean;
  attendancePassed: boolean;
  attendanceRate: number | null;
  targetRankName: string;
}) {
  const navigate = useNavigate();
  const summary = getAttendanceSummary(rows);
  const notEnteredCount = rows.filter((row) => row.status === "not_entered").length;
  const absentCount = rows.filter((row) => row.status === "absent").length;
  const countMap = rows.reduce<Record<string, number>>((accumulator, row) => {
    accumulator[row.status] = (accumulator[row.status] ?? 0) + 1;
    return accumulator;
  }, {});
  const hasTargetRankLabel = hasDisplayTargetRankName(targetRankName);

  const summaryTitle = isBeomTarget
    ? "범 진급 출석 준비 현황"
    : "출석 기록 (참고)";
  const summaryDescription = isBeomTarget
    ? hasTargetRankLabel
      ? `다음 급위 ${targetRankName} 진급에 필요한 출석 상태를 확인합니다.`
      : "다음 급위 진급에 필요한 출석 상태를 확인합니다."
    : "현재 단계에서는 출석률이 진급 조건에 적용되지 않습니다.";
  const summaryStatusLabel = isBeomTarget
    ? attendancePassed
      ? "출석 조건 충족"
      : "출석 확인 필요"
    : "현재 단계 해당 없음";
  const summaryStatusStyle = isBeomTarget
    ? getConditionStyle(attendancePassed)
    : getConditionStyle(null);
  const summarySectionStyle = isBeomTarget
    ? programSummaryCardStyle
    : contentCardStyle;
  const emptyMessage = isBeomTarget
    ? "출석 기록이 없습니다. 집회/출석 관리에서 출석을 입력해 주세요."
    : "등록된 출석 기록이 없습니다.";
  const noticeMessage = isBeomTarget
    ? "출석률 80% 이상이면 범 진급 출석 조건을 충족합니다."
    : "출석 기록은 활동 관리 참고 자료입니다.";

  const rateSummaryValue =
    !isBeomTarget || !attendanceRequiredForBeom
      ? "참고 지표"
      : attendanceRate !== null && attendanceRate >= 80
        ? "충족"
        : "확인 필요";
  const rateSummaryTone =
    !isBeomTarget || !attendanceRequiredForBeom
      ? ("good" as const)
      : attendanceRate !== null && attendanceRate >= 80
        ? ("good" as const)
        : ("warning" as const);

  const summaryItems = [
    {
      label: "출석률",
      value: rateSummaryValue,
      tone: rateSummaryTone,
    },
    {
      label: "미입력",
      value: notEnteredCount === 0 ? "이상 없음" : "입력 필요",
      tone: notEnteredCount === 0 ? ("good" as const) : ("warning" as const),
    },
    {
      label: "결석",
      value: absentCount === 0 ? "없음" : "확인 필요",
      tone: absentCount === 0 ? ("good" as const) : ("warning" as const),
    },
    {
      label: "출석 인정",
      value: summary.recognized === 0 ? "없음" : "인정",
      tone: summary.recognized === 0 ? ("good" as const) : ("good" as const),
    },
  ];

  const priorityAction =
    notEnteredCount > 0
      ? {
          tone: "warning" as const,
          title: `출석 미입력 ${notEnteredCount}건 있습니다.`,
          detail: "집회/출석 관리에서 입력하세요.",
        }
      : absentCount > 0
        ? {
            tone: "warning" as const,
            title: `결석 ${absentCount}건이 있습니다.`,
            detail: "확인해 주세요.",
          }
        : isBeomTarget && !attendancePassed
          ? {
              tone: "warning" as const,
              title: "범 진급 출석 조건을 충족하지 않았습니다.",
              detail: "",
            }
          : {
              tone: "good" as const,
              title: "현재 확인이 필요한 사항이 없습니다.",
              detail: "",
            };

  const displayRate = attendanceRate ?? summary.rate;
  const calculationFormula =
    summary.entered === 0
      ? "출석률을 계산할 입력 기록이 없습니다."
      : `출석 인정 ${summary.recognized}회 ÷ 입력 완료 ${summary.entered}회 × 100 = ${displayRate}%`;

  const calculationBasisItems = [
    { label: "입력 완료", value: `${summary.entered}회` },
    { label: "출석 인정", value: `${summary.recognized}회` },
    { label: "결석", value: `${absentCount}회` },
    { label: "미입력", value: `${notEnteredCount}회` },
  ];

  return (
    <div style={overviewStackStyle}>
      <section style={summarySectionStyle}>
        <div style={overviewSectionHeaderStyle}>
          <div>
            <h3 style={contentTitleStyle}>{summaryTitle}</h3>
            <p style={contentDescriptionStyle}>{summaryDescription}</p>
          </div>
          <span style={summaryStatusStyle}>{summaryStatusLabel}</span>
        </div>

        <div style={programSummaryGridStyle}>
          {summaryItems.map((item) => (
            <div key={item.label} style={infoItemStyle}>
              <span style={infoLabelStyle}>{item.label}</span>
              <strong
                style={{
                  ...infoValueStyle,
                  ...(item.tone === "warning"
                    ? recordCheckWarningStyle
                    : recordCheckGoodStyle),
                }}
              >
                {item.value}
              </strong>
            </div>
          ))}
        </div>
      </section>

      <section style={contentCardStyle}>
        <div style={overviewSectionHeaderStyle}>
          <div>
            <h3 style={contentTitleStyle}>지금 처리할 사항</h3>
          </div>
        </div>
        {priorityAction.tone === "good" ? (
          <div style={allPassedBoxStyle}>{priorityAction.title}</div>
        ) : (
          <>
            <div style={programActionNoticeStyle}>
              <strong>{priorityAction.title}</strong>
              {priorityAction.detail ? <span>{priorityAction.detail}</span> : null}
              <span>
                출석을 입력하거나 수정한 후 통합관리 화면을 새로고침하면 최신
                결과가 반영됩니다.
              </span>
            </div>
            <button
              type="button"
              style={primaryWorkButtonStyle}
              onClick={() => navigate("/meetings")}
            >
              집회/출석 관리로 이동
            </button>
          </>
        )}
      </section>

      <section style={contentCardStyle}>
        <div style={overviewSectionHeaderStyle}>
          <div>
            <h3 style={contentTitleStyle}>출석률 계산 근거</h3>
          </div>
        </div>

        <div style={programSummaryGridStyle}>
          {calculationBasisItems.map((item) => (
            <div key={item.label} style={infoItemStyle}>
              <span style={infoLabelStyle}>{item.label}</span>
              <strong style={infoValueStyle}>{item.value}</strong>
            </div>
          ))}
        </div>

        <p style={{ ...contentDescriptionStyle, margin: "0 0 10px" }}>
          현재 출석률: {displayRate === null ? "-" : `${displayRate}%`}
        </p>
        <p style={{ ...contentDescriptionStyle, margin: "0 0 10px", fontWeight: 800 }}>
          {calculationFormula}
        </p>

        <div style={programCompactNoticeStyle}>
          출석 인정: 출석, 인정출석, 지각, 조퇴, 인정결석(레거시). 미입력은
          출석률 분모에서 제외됩니다.
        </div>

        {isBeomTarget && attendanceRequiredForBeom && (
          <p style={{ ...contentDescriptionStyle, margin: "10px 0 0" }}>
            범 진급 기준 80% · 현재{" "}
            <strong
              style={
                attendancePassed
                  ? recordCheckGoodStyle
                  : recordCheckWarningStyle
              }
            >
              {attendancePassed ? "충족" : "미충족"}
            </strong>
          </p>
        )}

        {isBeomTarget && !attendanceRequiredForBeom && (
          <p style={{ ...contentDescriptionStyle, margin: "10px 0 0" }}>
            범 진급 출석률: 참고 지표. 현재 출석률은 진급 판정에 반영되지
            않습니다.
          </p>
        )}
      </section>

      <section style={contentCardStyle}>
        <div style={overviewSectionHeaderStyle}>
          <div>
            <h3 style={contentTitleStyle}>상태별 출석 건수</h3>
          </div>
        </div>

        {rows.length === 0 ? (
          <div style={emptyContentStyle}>{emptyMessage}</div>
        ) : (
          <div style={attendanceBadgeWrapStyle}>
            {Object.entries(countMap).map(([status, count]) => (
              <span key={status} style={attendanceBadgeStyle}>
                {ATTENDANCE_LABELS[status] ?? status} {count}회
              </span>
            ))}
          </div>
        )}
      </section>

      <section style={contentCardStyle}>
        <div style={overviewSectionHeaderStyle}>
          <div>
            <h3 style={contentTitleStyle}>최근 출석 이력</h3>
          </div>
        </div>

        {recentHistoryItems.length === 0 ? (
          <div style={emptyContentStyle}>출석 이력이 없습니다.</div>
        ) : (
          <div style={recentTimelineStyle}>
            {recentHistoryItems.map((item, index) => (
              <div
                key={item.id}
                style={{
                  padding: "12px 0",
                  borderBottom:
                    index < recentHistoryItems.length - 1
                      ? "1px solid #e2e8f0"
                      : "none",
                }}
              >
                <div style={contentDescriptionStyle}>
                  {formatDate(item.meetingDate)}
                </div>
                <strong
                  style={{
                    display: "block",
                    marginTop: "4px",
                    color: "#0f172a",
                    fontSize: "14px",
                  }}
                >
                  {item.title}
                </strong>
                <div
                  style={{
                    marginTop: "4px",
                    color: "#334155",
                    fontSize: "13px",
                    fontWeight: 800,
                  }}
                >
                  {ATTENDANCE_LABELS[item.status] ?? item.status}
                </div>
                {item.note ? (
                  <div
                    style={{
                      marginTop: "6px",
                      color: "#64748b",
                      fontSize: "12px",
                      lineHeight: 1.5,
                    }}
                  >
                    비고:
                    <br />
                    {item.note}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <div style={noticeBoxStyle}>{noticeMessage}</div>
    </div>
  );
}
