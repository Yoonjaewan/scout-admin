import type { CSSProperties } from "react";
import {
  conditionBadgeBaseStyle,
  conditionDetailStyle,
  conditionLabelStyle,
  conditionRowStyle,
  detailedConditionCardStyle,
  detailedConditionHeaderStyle,
  detailedConditionLabelStyle,
  detailedConditionRowStyle,
  detailedConditionRowsStyle,
  detailedConditionTitleStyle,
  detailedConditionValueStyle,
  infoItemStyle,
  infoLabelStyle,
  infoValueStyle,
  rankProgressCircleStyle,
  rankProgressDateStyle,
  rankProgressDescriptionStyle,
  rankProgressHeaderStyle,
  rankProgressLegendDotStyle,
  rankProgressLegendItemStyle,
  rankProgressLegendStyle,
  rankProgressRankNameStyle,
  rankProgressSectionStyle,
  rankProgressStateLabelStyle,
  rankProgressStepStyle,
  rankProgressTitleStyle,
  rankProgressTrackStyle,
  readinessProgressFillStyle,
  readinessProgressHeaderStyle,
  readinessProgressItemStyle,
  readinessProgressLabelStyle,
  readinessProgressTrackStyle,
  readinessProgressValueStyle,
  readinessStateChipStyle,
  recentRecordLabelStyle,
  recentRecordRowStyle,
  recentRecordValueStyle,
  recordCheckGoodStyle,
  recordCheckLabelStyle,
  recordCheckRowStyle,
  recordCheckStatusStyle,
  recordCheckWarningStyle,
  summaryFilterCardStyle,
  summaryFilterCountStyle,
  summaryFilterDescriptionStyle,
  summaryFilterLabelStyle,
  supportItemStyle,
  supportItemTextStyle,
  supportItemTitleStyle,
} from "./ScoutIntegratedPage.styles";

type ScoutSummary = { current_rank_id: string | null };
type RankSummary = { id: string; rank_name: string; sort_order: number };
type RankHistorySummary = { rank_id: string; approved_at: string };

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

export function SummaryFilterCard({
  label, count, description, tone, selected, onClick,
}: {
  label: string; count: number; description: string;
  tone: "neutral" | "success" | "danger" | "warning";
  selected: boolean; onClick: () => void;
}) {
  return (
    <button type="button" style={summaryFilterCardStyle(tone, selected)} onClick={onClick} aria-pressed={selected}>
      <span style={summaryFilterLabelStyle}>{label}</span>
      <strong style={summaryFilterCountStyle}>{count}명</strong>
      <span style={summaryFilterDescriptionStyle}>{description}</span>
    </button>
  );
}

export function ReadinessProgressItem({ label, passed, pending = false, detail }: {
  label: string; passed: boolean; pending?: boolean; detail: string;
}) {
  const state = pending ? "pending" : passed ? "passed" : "failed";
  const showProgressBar = label === "활동기간";

  return (
    <div style={readinessProgressItemStyle}>
      <div style={readinessProgressHeaderStyle}>
        <span style={readinessProgressLabelStyle}>{label}</span>
        {showProgressBar ? (
          <strong style={readinessProgressValueStyle(state)}>{detail}</strong>
        ) : (
          <strong style={readinessStateChipStyle(state)}>{detail}</strong>
        )}
      </div>
      {showProgressBar ? (
        <div style={readinessProgressTrackStyle}>
          <div style={readinessProgressFillStyle(state)} />
        </div>
      ) : null}
    </div>
  );
}

export function RankProgressOverview({ scout, ranks, histories, targetRank }: {
  scout: ScoutSummary; ranks: RankSummary[]; histories: RankHistorySummary[]; targetRank: RankSummary | null;
}) {
  const currentRank = ranks.find((rank) => rank.id === scout.current_rank_id) ?? null;
  const currentOrder = currentRank?.sort_order ?? Number.NEGATIVE_INFINITY;
  const historyMap = new Map(histories.map((history) => [history.rank_id, history]));

  return (
    <section style={rankProgressSectionStyle}>
      <div style={rankProgressHeaderStyle}>
        <div>
          <h3 style={rankProgressTitleStyle}>급위 진행 현황</h3>
          <p style={rankProgressDescriptionStyle}>완료한 급위와 현재급위, 다음 진급 단계를 한눈에 확인합니다.</p>
        </div>
        <div style={rankProgressLegendStyle}>
          <span style={rankProgressLegendItemStyle}><span style={{ ...rankProgressLegendDotStyle, backgroundColor: "#16a34a" }} />완료</span>
          <span style={rankProgressLegendItemStyle}><span style={{ ...rankProgressLegendDotStyle, backgroundColor: "#2563eb" }} />현재</span>
          <span style={rankProgressLegendItemStyle}><span style={{ ...rankProgressLegendDotStyle, border: "2px solid #f97316" }} />다음</span>
        </div>
      </div>
      <div style={rankProgressTrackStyle}>
        {ranks.map((rank, index) => {
          const history = historyMap.get(rank.id) ?? null;
          const isCurrent = scout.current_rank_id === rank.id;
          const isTarget = targetRank?.id === rank.id;
          const isCompleted = !isCurrent && (Boolean(history) || rank.sort_order < currentOrder);
          const state = isCurrent ? "current" : isTarget ? "next" : isCompleted ? "completed" : "future";
          const stateLabel = state === "completed" ? "완료" : state === "current" ? "현재" : state === "next" ? "다음" : "예정";
          return (
            <article key={rank.id} style={rankProgressStepStyle(state)} title={history ? `${rank.rank_name} 인가일 ${formatDate(history.approved_at)}` : undefined}>
              <span style={rankProgressCircleStyle(state)}>{state === "completed" ? "✓" : index + 1}</span>
              <strong style={rankProgressRankNameStyle}>{rank.rank_name}</strong>
              <span style={rankProgressStateLabelStyle(state)}>{stateLabel}</span>
              {history && state === "completed" ? <span style={rankProgressDateStyle}>{formatDate(history.approved_at)}</span> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function InfoItem({ label, value }: { label: string; value: string }) {
  return <div style={infoItemStyle}><span style={infoLabelStyle}>{label}</span><strong style={infoValueStyle}>{value}</strong></div>;
}

export function ConditionRow({ label, passed, detail }: { label: string; passed: boolean | null; detail?: string }) {
  return (
    <div style={conditionRowStyle}>
      <div><div style={conditionLabelStyle}>{label}</div>{detail && <div style={conditionDetailStyle}>{detail}</div>}</div>
      <span style={getConditionStyle(passed)}>{passed === null ? "확인 필요" : passed ? "충족" : "보완 필요"}</span>
    </div>
  );
}

export function RecentRecordRow({ label, value }: { label: string; value: string }) {
  return <div style={recentRecordRowStyle}><span style={recentRecordLabelStyle}>{label}</span><strong style={recentRecordValueStyle}>{value}</strong></div>;
}

export function RecordCheckRow({ label, count, onClick }: { label: string; count: number; onClick: () => void }) {
  const statusText = count > 0 ? `${count}건` : "처리할 내용 없음";

  return (
    <button
      type="button"
      style={recordCheckRowStyle}
      onClick={onClick}
      aria-label={`${label}, ${statusText}`}
    >
      <span style={recordCheckLabelStyle}>{label}</span>
      <strong
        style={{
          ...(count > 0 ? recordCheckWarningStyle : recordCheckGoodStyle),
          ...recordCheckStatusStyle,
        }}
      >
        {statusText}
      </strong>
    </button>
  );
}

export function DetailedConditionCard({ title, passed, rows }: { title: string; passed: boolean; rows: Array<[string, string]> }) {
  return (
    <article style={detailedConditionCardStyle(passed)}>
      <div style={detailedConditionHeaderStyle}><h4 style={detailedConditionTitleStyle}>{title}</h4><span style={getConditionStyle(passed)}>{passed ? "충족" : "보완 필요"}</span></div>
      <div style={detailedConditionRowsStyle}>{rows.map(([label, value]) => <div key={`${title}-${label}`} style={detailedConditionRowStyle}><span style={detailedConditionLabelStyle}>{label}</span><strong style={detailedConditionValueStyle}>{value}</strong></div>)}</div>
    </article>
  );
}

export function SupportItem({ title, text }: { title: string; text: string }) {
  return <div style={supportItemStyle}><strong style={supportItemTitleStyle}>{title}</strong><span style={supportItemTextStyle}>{text}</span></div>;
}
