import {
  CUB_GROWTH_STAGES,
  formatGradeShort,
  getCubGrowthStageIndex,
  getCubRankNameByGrade,
  getNextCubGrowthStage,
} from "../../lib/scoutDisplayFormat";
import { RecordCheckRow } from "./ScoutIntegratedDisplayComponents";
import {
  contentCardStyle,
  contentDescriptionStyle,
  contentTitleStyle,
  emptyContentStyle,
  infoItemStyle,
  infoLabelStyle,
  infoValueStyle,
  noticeBoxStyle,
  overviewSectionHeaderStyle,
  overviewSectionTitleStyle,
  overviewStackStyle,
  programSummaryCardStyle,
  programSummaryGridStyle,
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
  recentTimelineContentStyle,
  recentTimelineDateStyle,
  recentTimelineDetailStyle,
  recentTimelineDotStyle,
  recentTimelineGroupStyle,
  recentTimelineItemStyle,
  recentTimelineStyle,
  recentTimelineTitleStyle,
  recordCheckGridStyle,
  recordCheckGoodStyle,
} from "./ScoutIntegratedPage.styles";

type Scout = {
  id: string;
  name: string;
  member_no: string | null;
  school_name: string | null;
  grade: string | null;
  joined_at: string;
  current_rank_id: string | null;
  status: "active" | "inactive" | "graduated";
};

type Rank = {
  id: string;
  rank_name: string;
};

type RankHistory = {
  id: string;
  rank_id: string;
  approved_at: string;
};

type ProgramCompletion = {
  id: string;
  program_type: "WSEP" | "MoP";
  completed_at: string;
  approved_at: string | null;
};

type Attendance = {
  id: string;
  status: string;
  meeting_date?: string | null;
};

const SCOUT_STATUS_LABELS: Record<Scout["status"], string> = {
  active: "활동",
  inactive: "비활동",
  graduated: "졸업",
};

/** 컵 취미장 10개 분야 (향후 관리 기능에서 재사용) */
const CUB_HOBBY_FIELDS = [
  "야외생활",
  "예술",
  "운동",
  "과학",
  "안전",
  "문화",
  "지역사회",
  "세계",
  "자아",
  "스카우트",
] as const;

/** 성장 단계별 취미장 색상 안내 (표시 전용) */
const CUB_HOBBY_STAGE_COLORS: Record<
  string,
  { label: string; color: string; background: string; border: string }
> = {
  다람쥐: {
    label: "빨간색",
    color: "#b91c1c",
    background: "#fef2f2",
    border: "#fecaca",
  },
  토끼: {
    label: "노란색",
    color: "#a16207",
    background: "#fefce8",
    border: "#fde68a",
  },
  사슴: {
    label: "연두색",
    color: "#3f6212",
    background: "#f7fee7",
    border: "#bef264",
  },
  곰: {
    label: "보라색",
    color: "#6b21a8",
    background: "#faf5ff",
    border: "#e9d5ff",
  },
  무지개: {
    label: "주황색",
    color: "#c2410c",
    background: "#fff7ed",
    border: "#fdba74",
  },
};

function formatDate(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "-";
}

function getCubStageColorKey(stageName: string) {
  return (
    CUB_GROWTH_STAGES.find((stage) => stageName.includes(stage)) ?? null
  );
}

function CubHobbyFieldChips() {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "8px",
        marginTop: "10px",
      }}
    >
      {CUB_HOBBY_FIELDS.map((field) => (
        <span
          key={field}
          style={{
            display: "inline-flex",
            padding: "6px 10px",
            borderRadius: "999px",
            border: "1px solid #dbe3ee",
            backgroundColor: "#ffffff",
            color: "#334155",
            fontSize: "12px",
            fontWeight: 800,
          }}
        >
          {field}
        </span>
      ))}
    </div>
  );
}

function CubHobbyStageColorLegend({
  highlightStage,
}: {
  highlightStage?: string | null;
}) {
  const highlightKey = highlightStage
    ? getCubStageColorKey(highlightStage)
    : null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
        gap: "8px",
        marginTop: "12px",
      }}
    >
      {CUB_GROWTH_STAGES.map((stage) => {
        const palette = CUB_HOBBY_STAGE_COLORS[stage];
        const isCurrent = highlightKey === stage;
        return (
          <div
            key={stage}
            style={{
              ...infoItemStyle,
              border: `1px solid ${palette.border}`,
              backgroundColor: palette.background,
              boxShadow: isCurrent ? `0 0 0 2px ${palette.color}` : "none",
            }}
          >
            <span style={infoLabelStyle}>
              {stage}
              {isCurrent ? " (현재)" : ""}
            </span>
            <strong style={{ ...infoValueStyle, color: palette.color }}>
              {palette.label}
            </strong>
          </div>
        );
      })}
    </div>
  );
}

/** 종합 탭용 취미장 안내 (향후 취득 현황 데이터로 교체 가능) */
export function CubHobbyOverviewCard() {
  return (
    <section style={contentCardStyle}>
      <div style={overviewSectionHeaderStyle}>
        <div>
          <h3 style={contentTitleStyle}>취미장 현황</h3>
          <p style={contentDescriptionStyle}>
            컵스카우트는 10개 분야의 취미장을 취득합니다.
          </p>
        </div>
      </div>
      <CubHobbyFieldChips />
      <div style={{ ...noticeBoxStyle, marginTop: "12px" }}>
        취미장 관리 기능은 추후 지원 예정입니다.
      </div>
    </section>
  );
}

function normalizeStageName(value: string) {
  return value.replace(/\s/g, "");
}

function getCubStageMismatch(
  scout: Scout,
  ranks: Rank[],
): { expected: string; actual: string } | null {
  const expected = getCubRankNameByGrade(scout.grade);
  if (!expected) return null;

  const actual =
    ranks.find((rank) => rank.id === scout.current_rank_id)?.rank_name ?? "";
  if (!actual.trim()) {
    return { expected, actual: "미등록" };
  }

  const expectedNormalized = normalizeStageName(expected);
  const actualNormalized = normalizeStageName(actual);
  if (
    actualNormalized.includes(expectedNormalized) ||
    expectedNormalized.includes(actualNormalized)
  ) {
    return null;
  }

  return { expected, actual };
}

export function CubGrowthProgressSection({
  scout,
  ranks,
  title = "성장 진행현황",
  description = "학년 기준으로 자동 적용되는 컵스카우트 성장 단계입니다.",
}: {
  scout: Scout;
  ranks: Rank[];
  title?: string;
  description?: string;
}) {
  const gradeShort = formatGradeShort(scout.grade) || scout.grade || "-";
  const currentStage =
    getCubRankNameByGrade(scout.grade) ||
    ranks.find((rank) => rank.id === scout.current_rank_id)?.rank_name ||
    "-";
  const currentStageIndex = getCubGrowthStageIndex(currentStage);
  const nextStage = getNextCubGrowthStage(currentStage);
  const isHighest =
    currentStage.includes("무지개") || !nextStage || currentStageIndex >= 4;
  const promotionMethod = isHighest
    ? "컵스카우트 최고 단계"
    : "학년 기준 자동진급";

  return (
    <section style={rankProgressSectionStyle}>
      <div style={rankProgressHeaderStyle}>
        <div>
          <h3 style={rankProgressTitleStyle}>{title}</h3>
          <p style={rankProgressDescriptionStyle}>{description}</p>
        </div>
        <div style={rankProgressLegendStyle}>
          <span style={rankProgressLegendItemStyle}>
            <span
              style={{
                ...rankProgressLegendDotStyle,
                backgroundColor: "#16a34a",
              }}
            />
            완료
          </span>
          <span style={rankProgressLegendItemStyle}>
            <span
              style={{
                ...rankProgressLegendDotStyle,
                backgroundColor: "#2563eb",
              }}
            />
            현재
          </span>
          <span style={rankProgressLegendItemStyle}>
            <span
              style={{
                ...rankProgressLegendDotStyle,
                border: "2px solid #f97316",
              }}
            />
            다음
          </span>
        </div>
      </div>

      <div style={rankProgressTrackStyle}>
        {CUB_GROWTH_STAGES.map((stage, index) => {
          const state =
            currentStageIndex < 0
              ? "future"
              : index < currentStageIndex
                ? "completed"
                : index === currentStageIndex
                  ? "current"
                  : index === currentStageIndex + 1
                    ? "next"
                    : "future";
          const stateLabel =
            state === "completed"
              ? "완료"
              : state === "current"
                ? "현재"
                : state === "next"
                  ? "다음"
                  : "예정";

          return (
            <article key={stage} style={rankProgressStepStyle(state)}>
              <span style={rankProgressCircleStyle(state)}>
                {state === "completed" ? "✓" : index + 1}
              </span>
              <strong style={rankProgressRankNameStyle}>{stage}</strong>
              <span style={rankProgressStateLabelStyle(state)}>{stateLabel}</span>
              {state === "current" ? (
                <span style={rankProgressDateStyle}>현재 단계</span>
              ) : null}
            </article>
          );
        })}
      </div>

      <div style={{ ...programSummaryGridStyle, marginTop: "12px" }}>
        <div style={infoItemStyle}>
          <span style={infoLabelStyle}>현재 학년</span>
          <strong style={infoValueStyle} title={scout.grade ?? undefined}>
            {gradeShort}
          </strong>
        </div>
        <div style={infoItemStyle}>
          <span style={infoLabelStyle}>현재 단계</span>
          <strong style={{ ...infoValueStyle, color: "#1d4ed8" }}>
            {currentStage}
          </strong>
        </div>
        <div style={infoItemStyle}>
          <span style={infoLabelStyle}>다음 단계</span>
          <strong style={infoValueStyle}>{isHighest ? "없음" : nextStage}</strong>
        </div>
        <div style={infoItemStyle}>
          <span style={infoLabelStyle}>진급 방식</span>
          <strong style={infoValueStyle}>{promotionMethod}</strong>
        </div>
        <div style={infoItemStyle}>
          <span style={infoLabelStyle}>입단일</span>
          <strong style={infoValueStyle}>{formatDate(scout.joined_at)}</strong>
        </div>
        <div style={infoItemStyle}>
          <span style={infoLabelStyle}>활동 상태</span>
          <strong style={infoValueStyle}>
            {SCOUT_STATUS_LABELS[scout.status]}
          </strong>
        </div>
      </div>
    </section>
  );
}

export function CubOverviewPanel({
  scout,
  ranks,
  histories,
  programs,
  attendanceRows,
  onMoveToPrograms,
  onMoveToAttendance,
}: {
  scout: Scout;
  ranks: Rank[];
  histories: RankHistory[];
  programs: ProgramCompletion[];
  attendanceRows: Attendance[];
  onMoveToPrograms: () => void;
  onMoveToAttendance: () => void;
}) {
  const rankMap = new Map(ranks.map((rank) => [rank.id, rank]));
  const notEnteredCount = attendanceRows.filter(
    (row) => row.status === "not_entered",
  ).length;
  const programApprovalMissingCount = programs.filter(
    (row) => !row.approved_at,
  ).length;
  const stageMismatch = getCubStageMismatch(scout, ranks);
  const missingBasics: string[] = [];
  if (!scout.member_no?.trim()) missingBasics.push("대원번호");
  if (!scout.school_name?.trim()) missingBasics.push("소속대");
  if (!scout.grade?.trim()) missingBasics.push("학년");

  const checkRows: Array<{
    label: string;
    count: number;
    onClick: () => void;
  }> = [];

  if (scout.status !== "active") {
    checkRows.push({
      label: "활동 상태 확인",
      count: 1,
      onClick: () => undefined,
    });
  }
  if (notEnteredCount > 0) {
    checkRows.push({
      label: "최근 출석 입력 누락",
      count: notEnteredCount,
      onClick: onMoveToAttendance,
    });
  }
  if (programApprovalMissingCount > 0) {
    checkRows.push({
      label: "프로그램 이수 기록 확인",
      count: programApprovalMissingCount,
      onClick: onMoveToPrograms,
    });
  }
  if (missingBasics.length > 0) {
    checkRows.push({
      label: `기본정보 누락 (${missingBasics.join(", ")})`,
      count: missingBasics.length,
      onClick: () => undefined,
    });
  }
  if (stageMismatch) {
    checkRows.push({
      label: "학년 기준 급위 확인 필요",
      count: 1,
      onClick: () => undefined,
    });
  }

  const recentActivityItems = [
    ...histories.map((history) => ({
      key: `rank-${history.id}`,
      date: history.approved_at,
      title: "급위·단계 기록",
      detail: `${rankMap.get(history.rank_id)?.rank_name ?? "단계 확인"} 기록`,
      action: () => undefined,
    })),
    ...programs.map((program) => ({
      key: `program-${program.id}`,
      date: program.approved_at ?? program.completed_at,
      title: "프로그램",
      detail: `${program.program_type} 이수`,
      action: onMoveToPrograms,
    })),
  ]
    .filter((item) => Boolean(item.date))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  const recentActivityGroups = recentActivityItems.reduce<
    Array<{ date: string; items: typeof recentActivityItems }>
  >((groups, item) => {
    const date = formatDate(item.date);
    const currentGroup = groups[groups.length - 1];
    if (currentGroup?.date === date) {
      currentGroup.items.push(item);
    } else {
      groups.push({ date, items: [item] });
    }
    return groups;
  }, []);

  return (
    <div style={overviewStackStyle}>
      <CubGrowthProgressSection scout={scout} ranks={ranks} />

      {stageMismatch ? (
        <div style={noticeBoxStyle}>
          학년 기준 급위 확인 필요
          <div style={{ marginTop: "4px", fontWeight: 600 }}>
            현재 학년 기준 예상 단계({stageMismatch.expected})와 등록된 현재
            단계({stageMismatch.actual})가 다릅니다.
          </div>
        </div>
      ) : null}

      <CubHobbyOverviewCard />

      {checkRows.length > 0 && (
        <section style={contentCardStyle}>
          <div style={overviewSectionHeaderStyle}>
            <div>
              <h3 style={contentTitleStyle}>확인할 사항</h3>
              <p style={contentDescriptionStyle}>
                출석·프로그램·기본정보 등 실제 기록 기준 확인 항목입니다.
              </p>
            </div>
          </div>
          <div style={recordCheckGridStyle}>
            {checkRows.map((row) => (
              <RecordCheckRow
                key={row.label}
                label={row.label}
                count={row.count}
                onClick={row.onClick}
              />
            ))}
          </div>
        </section>
      )}

      {checkRows.length === 0 && (
        <section style={contentCardStyle}>
          <div style={overviewSectionHeaderStyle}>
            <div>
              <h3 style={contentTitleStyle}>확인할 사항</h3>
            </div>
          </div>
          <div
            style={{
              ...recordCheckGoodStyle,
              padding: "12px 14px",
              borderRadius: "10px",
              fontWeight: 800,
            }}
          >
            처리할 내용 없음
          </div>
        </section>
      )}

      <section style={contentCardStyle}>
        <div style={overviewSectionHeaderStyle}>
          <div>
            <h3 style={contentTitleStyle}>최근 활동 기록</h3>
            <p style={contentDescriptionStyle}>
              출석·프로그램·단계 기록 등 실제 활동 이력을 확인합니다.
            </p>
          </div>
        </div>

        {recentActivityGroups.length === 0 && attendanceRows.length === 0 ? (
          <div style={emptyContentStyle}>최근 활동 기록이 없습니다.</div>
        ) : (
          <div style={recentTimelineStyle}>
            {recentActivityGroups.map((group) => (
              <div key={group.date} style={recentTimelineGroupStyle}>
                <div style={recentTimelineDateStyle}>{group.date}</div>
                <div>
                  {group.items.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      style={recentTimelineItemStyle}
                      onClick={item.action}
                    >
                      <span style={recentTimelineDotStyle} aria-hidden="true" />
                      <span style={recentTimelineContentStyle}>
                        <strong style={recentTimelineTitleStyle}>
                          {item.title}
                        </strong>
                        <span style={recentTimelineDetailStyle}>
                          {item.detail}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div style={recentTimelineGroupStyle}>
              <div style={recentTimelineDateStyle}>출석 현황</div>
              <button
                type="button"
                style={recentTimelineItemStyle}
                onClick={onMoveToAttendance}
              >
                <span style={recentTimelineDotStyle} aria-hidden="true" />
                <span style={recentTimelineContentStyle}>
                  <strong style={recentTimelineTitleStyle}>최근 집회 출석</strong>
                  <span style={recentTimelineDetailStyle}>
                    입력 {attendanceRows.length - notEnteredCount}건 · 미입력{" "}
                    {notEnteredCount}건
                  </span>
                </span>
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export function CubAdvancementPanel({
  scout,
  ranks,
}: {
  scout: Scout;
  ranks: Rank[];
}) {
  const currentStage =
    getCubRankNameByGrade(scout.grade) ||
    ranks.find((rank) => rank.id === scout.current_rank_id)?.rank_name ||
    "-";
  const nextStage = getNextCubGrowthStage(currentStage);
  const isHighest =
    currentStage.includes("무지개") || !nextStage;

  return (
    <div style={overviewStackStyle}>
      <section style={programSummaryCardStyle}>
        <div style={overviewSectionHeaderStyle}>
          <div>
            <h3 style={contentTitleStyle}>컵스카우트 성장 단계</h3>
            <p style={contentDescriptionStyle}>
              컵스카우트 급위는 학년 기준으로 자동 적용되며 별도의 진급 판정은
              하지 않습니다.
            </p>
          </div>
        </div>
        <div style={noticeBoxStyle}>
          컵스카우트는 학년 기준으로 자동 급위가 적용됩니다.
          {isHighest ? " 현재는 컵스카우트 최고 단계입니다." : ""}
        </div>
        <div style={{ ...programSummaryGridStyle, marginTop: "12px" }}>
          <div style={infoItemStyle}>
            <span style={infoLabelStyle}>현재</span>
            <strong style={{ ...infoValueStyle, color: "#1d4ed8" }}>
              {currentStage}
            </strong>
          </div>
          <div style={infoItemStyle}>
            <span style={infoLabelStyle}>다음</span>
            <strong style={infoValueStyle}>
              {isHighest ? "없음" : nextStage}
            </strong>
          </div>
          <div style={infoItemStyle}>
            <span style={infoLabelStyle}>진급 방식</span>
            <strong style={infoValueStyle}>
              {isHighest ? "컵스카우트 최고 단계" : "학년 기준 자동급위"}
            </strong>
          </div>
        </div>
      </section>

      <CubGrowthProgressSection
        scout={scout}
        ranks={ranks}
        title="성장 단계 안내"
        description="다람쥐 → 토끼 → 사슴 → 곰 → 무지개 순서로 성장합니다."
      />
    </div>
  );
}

/**
 * 기능장 탭 자리의 컵 전용 취미장 안내.
 * 향후 취미장 조회·등록 UI로 이 컴포넌트만 확장하면 된다.
 */
export function CubHobbyPanel({
  scout,
  ranks,
}: {
  scout?: Scout;
  ranks?: Rank[];
}) {
  const currentStage = scout
    ? getCubRankNameByGrade(scout.grade) ||
      ranks?.find((rank) => rank.id === scout.current_rank_id)?.rank_name ||
      ""
    : "";

  return (
    <div style={overviewStackStyle}>
      <section style={contentCardStyle}>
        <div style={overviewSectionHeaderStyle}>
          <div>
            <h3 style={overviewSectionTitleStyle}>취미장</h3>
            <p style={contentDescriptionStyle}>
              컵스카우트는 기능장 대신 취미장을 취득합니다.
            </p>
          </div>
        </div>

        <div style={noticeBoxStyle}>
          취미장 관리 기능은 추후 지원 예정입니다.
        </div>

        <div style={{ marginTop: "14px" }}>
          <h4
            style={{
              margin: "0 0 4px",
              color: "#0f172a",
              fontSize: "14px",
              fontWeight: 900,
            }}
          >
            취미장 분야
          </h4>
          <p style={contentDescriptionStyle}>
            야외생활, 예술, 운동, 과학, 안전, 문화, 지역사회, 세계, 자아,
            스카우트
          </p>
          <CubHobbyFieldChips />
        </div>

        <div style={{ marginTop: "16px" }}>
          <h4
            style={{
              margin: "0 0 4px",
              color: "#0f172a",
              fontSize: "14px",
              fontWeight: 900,
            }}
          >
            취미장 색상 체계
          </h4>
          <p style={contentDescriptionStyle}>
            성장 단계에 따라 취미장 색상이 달라집니다.
          </p>
          <CubHobbyStageColorLegend highlightStage={currentStage || null} />
        </div>
      </section>
    </div>
  );
}

export function CubProfileBanner({
  scout,
  ranks,
  onMoveToAdvancement,
}: {
  scout: Scout;
  ranks: Rank[];
  onMoveToAdvancement: () => void;
}) {
  const currentStage =
    getCubRankNameByGrade(scout.grade) ||
    ranks.find((rank) => rank.id === scout.current_rank_id)?.rank_name ||
    "-";
  const nextStage = getNextCubGrowthStage(currentStage);
  const isHighest = currentStage.includes("무지개") || !nextStage;
  const gradeShort = formatGradeShort(scout.grade) || scout.grade || "-";

  return (
    <div
      style={{
        ...programSummaryCardStyle,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "12px",
        flexWrap: "wrap",
      }}
    >
      <div>
        <span
          style={{
            display: "block",
            fontSize: "12px",
            fontWeight: 800,
            color: "#64748b",
            marginBottom: "4px",
          }}
        >
          컵스카우트 성장 상태
        </span>
        <strong
          style={{
            display: "block",
            fontSize: "18px",
            fontWeight: 900,
            color: "#0f172a",
          }}
        >
          {gradeShort} · {currentStage}
        </strong>
        <span
          style={{
            display: "block",
            marginTop: "4px",
            fontSize: "13px",
            color: "#475569",
            fontWeight: 700,
          }}
        >
          다음 단계 {isHighest ? "없음" : nextStage} ·{" "}
          {isHighest ? "컵스카우트 최고 단계" : "학년 기준 자동진급"}
        </span>
      </div>
      <button
        type="button"
        onClick={onMoveToAdvancement}
        style={{
          padding: "8px 12px",
          borderRadius: "8px",
          border: "1px solid #cbd5e1",
          backgroundColor: "#ffffff",
          color: "#334155",
          fontSize: "13px",
          fontWeight: 800,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        성장 단계 확인
      </button>
    </div>
  );
}