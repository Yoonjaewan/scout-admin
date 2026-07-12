import type { FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  badgeDrawerDangerStyle,
  badgeDrawerGoodStyle,
  badgeDrawerRequirementHeaderStyle,
  badgeDrawerRequirementRowStyle,
  badgeDrawerRequirementStyle,
  badgeDrawerWarningStyle,
  checkboxLabelStyle,
  drawerBackdropStyle,
  drawerBodyStyle,
  drawerCloseButtonStyle,
  drawerDescriptionStyle,
  drawerFieldLabelStyle,
  drawerFooterStyle,
  drawerFormStyle,
  drawerHeaderStyle,
  drawerInputStyle,
  drawerLabelTextStyle,
  drawerPanelStyle,
  drawerTargetLabelStyle,
  drawerTargetSummaryStyle,
  drawerTextareaStyle,
  drawerTitleStyle,
  errorBoxStyle,
  fieldLabelStyle,
  fieldLabelTitleStyle,
  inputStyle,
  primaryButtonStyle,
  programManagementGuideStyle,
  programManagementGuideTextStyle,
  programManagementGuideTitleStyle,
  rankApprovalReferenceBadgeStyle,
  rankApprovalReferenceCurrentItemStyle,
  rankApprovalReferenceCurrentLabelStyle,
  rankApprovalReferenceDateStyle,
  rankApprovalReferenceDescriptionStyle,
  rankApprovalReferenceEmptyDateStyle,
  rankApprovalReferenceGridStyle,
  rankApprovalReferenceHeaderStyle,
  rankApprovalReferenceItemStyle,
  rankApprovalReferenceNoticeStyle,
  rankApprovalReferenceRankStyle,
  rankApprovalReferenceStyle,
  rankApprovalReferenceTitleStyle,
  requiredStyle,
  secondaryButtonStyle,
  submitButtonStyle,
  textareaStyle,
} from "./ScoutIntegratedPage.styles";

type Scout = {
  id: string;
  name: string;
  member_no: string | null;
  school_name: string | null;
  grade: string | null;
  current_rank_id: string | null;
};

type Rank = { id: string; rank_name: string };
type RankHistory = { id: string; rank_id: string; approved_at: string };
type RankRequirement = { id: string; from_rank_id: string; to_rank_id: string; required_general_badge_count: number };
type RankRequiredBadge = { id: string; rank_requirement_id: string; badge_id: string; sort_order: number };
type Badge = { id: string; category_id: string; name: string };
type BadgeCategory = { id: string; name: string };
type ScoutBadge = { id: string; badge_id: string };

type ProgramForm = {
  id: string;
  program_type: "WSEP" | "MoP";
  completed_at: string;
  certificate_no: string;
  approved_at: string;
  note: string;
};

type BadgeForm = {
  id: string;
  badge_id: string;
  acquired_at: string;
  approved_at: string;
  instructor_name: string;
  leader_confirmed: boolean;
  note: string;
};

type StageSummary = {
  stage: { label: string } | null;
  missingRequiredNames: string[];
  generalRequired: number;
  generalOwned: number;
  generalMissing: number;
};

type StageRule = {
  label: string;
  requiredBadgeNames: string[];
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return value.slice(0, 10).replaceAll("-", ".");
}

function normalizeName(value: string) {
  return value.replace(/\s+/g, "").replace(/급$/, "").trim();
}

export function ProgramDrawer({
  mode,
  scout,
  form,
  errorMessage,
  submitting,
  onFormChange,
  onClose,
  onSubmit,
}: {
  mode: "create" | "edit";
  scout: Scout;
  form: ProgramForm;
  errorMessage: string;
  submitting: boolean;
  onFormChange: (value: ProgramForm | ((current: ProgramForm) => ProgramForm)) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
}) {
  return createPortal(
    <div style={drawerBackdropStyle} onMouseDown={onClose}>
      <aside style={drawerPanelStyle} onMouseDown={(event) => event.stopPropagation()}>
        <form style={drawerFormStyle} onSubmit={onSubmit}>
          <div style={drawerHeaderStyle}>
            <div>
              <h3 style={drawerTitleStyle}>{mode === "create" ? "프로그램 이수 등록" : "프로그램 이수 수정"}</h3>
              <p style={drawerDescriptionStyle}>{scout.name} 대원의 WSEP 또는 MoP 이수 기록을 관리합니다.</p>
            </div>
            <button type="button" style={drawerCloseButtonStyle} onClick={onClose} disabled={submitting} aria-label="프로그램 이수 입력 닫기">×</button>
          </div>

          <div style={drawerBodyStyle}>
            <div style={drawerTargetSummaryStyle}>
              <span style={drawerTargetLabelStyle}>선택 대원</span>
              <strong>{scout.member_no ?? "번호없음"} · {scout.name}</strong>
              <span>{scout.school_name ?? "학교 미등록"} · {scout.grade ?? "학년 미등록"}</span>
            </div>

            <section style={programManagementGuideStyle}>
              <strong style={programManagementGuideTitleStyle}>범 진급 관리 기준</strong>
              <p style={programManagementGuideTextStyle}>WSEP 또는 MoP 중 1개 이상 이수해야 하며, 수료증번호와 승인일 누락 여부를 함께 확인하세요.</p>
            </section>

            {errorMessage && <div style={errorBoxStyle}>{errorMessage}</div>}

            <label style={drawerFieldLabelStyle}>
              <span style={drawerLabelTextStyle}>프로그램 <span style={requiredStyle}>*</span></span>
              <select style={drawerInputStyle} value={form.program_type} onChange={(event) => onFormChange((current) => ({ ...current, program_type: event.target.value as "WSEP" | "MoP" }))} required>
                <option value="WSEP">WSEP - 세계스카우트 자연환경 프로그램</option>
                <option value="MoP">MoP - Messengers of Peace</option>
              </select>
            </label>

            <label style={drawerFieldLabelStyle}>
              <span style={drawerLabelTextStyle}>이수일 <span style={requiredStyle}>*</span></span>
              <input style={drawerInputStyle} type="date" value={form.completed_at} onChange={(event) => onFormChange((current) => ({ ...current, completed_at: event.target.value }))} required />
            </label>

            <label style={drawerFieldLabelStyle}>
              <span style={drawerLabelTextStyle}>승인일</span>
              <input style={drawerInputStyle} type="date" value={form.approved_at} onChange={(event) => onFormChange({ ...form, approved_at: event.target.value })} />
            </label>

            <label style={drawerFieldLabelStyle}>
              <span style={drawerLabelTextStyle}>수료증번호</span>
              <input style={drawerInputStyle} value={form.certificate_no} onChange={(event) => onFormChange((current) => ({ ...current, certificate_no: event.target.value }))} placeholder="수료증번호를 입력하세요." />
            </label>

            <label style={drawerFieldLabelStyle}>
              <span style={drawerLabelTextStyle}>비고</span>
              <textarea style={drawerTextareaStyle} value={form.note} onChange={(event) => onFormChange({ ...form, note: event.target.value })} placeholder="과정명, 행사명 또는 확인 내용을 입력하세요." />
            </label>
          </div>

          <div style={drawerFooterStyle}>
            <button type="button" style={secondaryButtonStyle} onClick={onClose} disabled={submitting}>취소</button>
            <button type="submit" style={submitButtonStyle} disabled={submitting}>{submitting ? "저장 중..." : mode === "create" ? "이수 기록 등록" : "수정 저장"}</button>
          </div>
        </form>
      </aside>
    </div>,
    document.body,
  );
}

export function BadgeDrawer({
  mode,
  scout,
  form,
  errorMessage,
  submitting,
  ranks,
  histories,
  rankRequiredBadges,
  badges,
  badgeCategories,
  scoutBadges,
  stageSummary,
  stageRules,
  onFormChange,
  onClose,
  onSubmit,
}: {
  mode: "create" | "edit";
  scout: Scout;
  form: BadgeForm;
  errorMessage: string;
  submitting: boolean;
  ranks: Rank[];
  histories: RankHistory[];
  rankRequirements: RankRequirement[];
  rankRequiredBadges: RankRequiredBadge[];
  badges: Badge[];
  badgeCategories: BadgeCategory[];
  scoutBadges: ScoutBadge[];
  stageSummary: StageSummary;
  stageRules: StageRule[];
  onFormChange: (value: BadgeForm) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
}) {
  const ownedBadgeIdSet = new Set(scoutBadges.filter((row) => row.id !== form.id).map((row) => row.badge_id));
  const missingRequiredBadges = stageSummary.missingRequiredNames
    .map((name) => badges.find((badge) => normalizeName(badge.name) === normalizeName(name)) ?? null)
    .filter((badge): badge is Badge => Boolean(badge));
  const requiredIdSet = new Set(rankRequiredBadges.map((row) => row.badge_id));

  return createPortal(
    <div style={drawerBackdropStyle} onMouseDown={onClose}>
      <aside style={drawerPanelStyle} onMouseDown={(event) => event.stopPropagation()}>
        <form style={drawerFormStyle} onSubmit={onSubmit}>
          <div style={drawerHeaderStyle}>
            <div>
              <h3 style={drawerTitleStyle}>{mode === "create" ? "기능장 등록" : "기능장 수정"}</h3>
              <p style={drawerDescriptionStyle}>{scout.member_no ?? "번호없음"} · {scout.name}</p>
            </div>
            <button type="button" style={drawerCloseButtonStyle} onClick={onClose} disabled={submitting} aria-label="기능장 입력 닫기">×</button>
          </div>

          <div style={drawerBodyStyle}>
            {errorMessage && <div style={errorBoxStyle}>{errorMessage}</div>}

            {stageSummary.stage && (
              <section style={badgeDrawerRequirementStyle}>
                <div style={badgeDrawerRequirementHeaderStyle}>
                  <strong>{stageSummary.stage.label} 보완 현황</strong>
                  <span>현재 실제 취득 기록 기준</span>
                </div>
                <div style={badgeDrawerRequirementRowStyle}>
                  <span>필수 기능장</span>
                  <strong style={stageSummary.missingRequiredNames.length > 0 ? badgeDrawerDangerStyle : badgeDrawerGoodStyle}>
                    {stageSummary.missingRequiredNames.length > 0 ? stageSummary.missingRequiredNames.join(", ") : "충족"}
                  </strong>
                </div>
                <div style={badgeDrawerRequirementRowStyle}>
                  <span>일반 기능장</span>
                  <strong style={stageSummary.generalMissing > 0 ? badgeDrawerWarningStyle : badgeDrawerGoodStyle}>
                    필요 {stageSummary.generalRequired}개 · 보유 {stageSummary.generalOwned}개{stageSummary.generalMissing > 0 ? ` · ${stageSummary.generalMissing}개 부족` : " · 충족"}
                  </strong>
                </div>
              </section>
            )}

            <section style={rankApprovalReferenceStyle}>
              <div style={rankApprovalReferenceHeaderStyle}>
                <div>
                  <h4 style={rankApprovalReferenceTitleStyle}>급위별 진급 인가일</h4>
                  <p style={rankApprovalReferenceDescriptionStyle}>기능장 취득일과 인가일 입력 시 급위 인가일을 확인하세요.</p>
                </div>
                <span style={rankApprovalReferenceBadgeStyle}>입력 오류 방지</span>
              </div>

              <div style={rankApprovalReferenceGridStyle}>
                {ranks.map((rank) => {
                  const history = histories.find((item) => item.rank_id === rank.id) ?? null;
                  const isCurrentRank = scout.current_rank_id === rank.id;
                  return (
                    <div key={`badge-rank-reference-${rank.id}`} style={{ ...rankApprovalReferenceItemStyle, ...(isCurrentRank ? rankApprovalReferenceCurrentItemStyle : {}) }}>
                      <div style={rankApprovalReferenceRankStyle}>
                        {rank.rank_name}
                        {isCurrentRank && <span style={rankApprovalReferenceCurrentLabelStyle}>현재급위</span>}
                      </div>
                      <div style={history ? rankApprovalReferenceDateStyle : rankApprovalReferenceEmptyDateStyle}>{history ? formatDate(history.approved_at) : "인가일 미등록"}</div>
                    </div>
                  );
                })}
              </div>
              <p style={rankApprovalReferenceNoticeStyle}>기능장은 해당 급위의 진급 인가일 이전에 취득·인가된 기록인지 확인해야 합니다.</p>
            </section>

            <label style={fieldLabelStyle}>
              <span style={fieldLabelTitleStyle}>기능장 <span style={requiredStyle}>*</span></span>
              <select style={inputStyle} value={form.badge_id} onChange={(event) => onFormChange({ ...form, badge_id: event.target.value })} required>
                <option value="">기능장 선택</option>
                {missingRequiredBadges.length > 0 && (
                  <optgroup label="현재 진급에 부족한 필수 기능장">
                    {missingRequiredBadges.filter((badge) => !ownedBadgeIdSet.has(badge.id)).map((badge) => <option key={`missing-${badge.id}`} value={badge.id}>{badge.name} · 필수</option>)}
                  </optgroup>
                )}
                {stageRules.map((stage) => {
                  const stageBadges = stage.requiredBadgeNames
                    .map((name) => badges.find((badge) => normalizeName(badge.name) === normalizeName(name)) ?? null)
                    .filter((badge): badge is Badge => Boolean(badge && !ownedBadgeIdSet.has(badge.id)));
                  if (stageBadges.length === 0) return null;
                  return <optgroup key={stage.label} label={`${stage.label} 필수 기능장`}>{stageBadges.map((badge) => <option key={`${stage.label}-${badge.id}`} value={badge.id}>{badge.name} · 필수</option>)}</optgroup>;
                })}
                {badgeCategories.map((category) => {
                  const categoryBadges = badges.filter((badge) => badge.category_id === category.id && !requiredIdSet.has(badge.id) && !ownedBadgeIdSet.has(badge.id)).sort((a,b) => a.name.localeCompare(b.name, "ko"));
                  if (categoryBadges.length === 0) return null;
                  return <optgroup key={category.id} label={`일반 기능장 · ${category.name}`}>{categoryBadges.map((badge) => <option key={badge.id} value={badge.id}>{badge.name} · 일반</option>)}</optgroup>;
                })}
              </select>
            </label>

            <label style={fieldLabelStyle}>
              <span style={fieldLabelTitleStyle}>취득일 <span style={requiredStyle}>*</span></span>
              <input style={inputStyle} type="date" value={form.acquired_at} onChange={(event) => onFormChange({
                  ...form,
                  acquired_at: event.target.value,
                  approved_at: form.approved_at || event.target.value,
                })} required />
            </label>

            <label style={fieldLabelStyle}>인가일<input style={inputStyle} type="date" value={form.approved_at} onChange={(event) => onFormChange({ ...form, approved_at: event.target.value })} /></label>
            <label style={fieldLabelStyle}>지도자·강사명<input style={inputStyle} value={form.instructor_name} onChange={(event) => onFormChange({ ...form, instructor_name: event.target.value })} placeholder="지도자 또는 강사명" /></label>
            <label style={checkboxLabelStyle}><input type="checkbox" checked={form.leader_confirmed} onChange={(event) => onFormChange({ ...form, leader_confirmed: event.target.checked })} />지도자 확인 완료</label>
            <label style={fieldLabelStyle}>비고<textarea style={textareaStyle} value={form.note} onChange={(event) => onFormChange({ ...form, note: event.target.value })} placeholder="특이사항 또는 확인 내용을 입력하세요." /></label>
          </div>

          <div style={drawerFooterStyle}>
            <button type="button" style={secondaryButtonStyle} onClick={onClose} disabled={submitting}>취소</button>
            <button type="submit" style={primaryButtonStyle} disabled={submitting}>{submitting ? "저장 중..." : mode === "create" ? "기능장 등록 저장" : "기능장 수정 저장"}</button>
          </div>
        </form>
      </aside>
    </div>,
    document.body,
  );
}


type ScoutCreateProfile = { role: "super_admin" | "org_admin" | "leader" | "viewer"; organization_id: string | null };
type ScoutCreateOrganization = { id: string; name: string };
type ScoutCreateRank = { id: string; rank_name: string; sort_order: number };
type ScoutCreateForm = {
  organization_id: string; name: string; grade: string; joined_at: string;
  current_rank_id: string; rank_approval_dates: Record<string, string>;
  is_from_cub_scout: boolean; cub_promotion_completed: boolean;
  beginner_course_exempted: boolean; note: string;
};

export function ScoutCreateDrawer({ profile, organizations, ranks, gradeOptions, form, requiredRanks, errorMessage, submitting, onFormChange, onRankChange, onClose, onSubmit }: {
  profile: ScoutCreateProfile;
  organizations: ScoutCreateOrganization[];
  ranks: ScoutCreateRank[];
  gradeOptions: string[];
  form: ScoutCreateForm;
  requiredRanks: ScoutCreateRank[];
  errorMessage: string;
  submitting: boolean;
  onFormChange: (value: ScoutCreateForm | ((current: ScoutCreateForm) => ScoutCreateForm)) => void;
  onRankChange: (rankId: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
}) {
  const organizationName = organizations.find((item) => item.id === profile.organization_id)?.name ?? "소속대 확인 필요";
  return createPortal(
    <div style={drawerBackdropStyle} onMouseDown={onClose}>
      <aside style={drawerPanelStyle} onMouseDown={(event) => event.stopPropagation()}>
        <form style={drawerFormStyle} onSubmit={onSubmit}>
          <div style={drawerHeaderStyle}>
            <div><h3 style={drawerTitleStyle}>대원 등록</h3><p style={drawerDescriptionStyle}>신규 대원의 기본정보와 현재급위를 등록합니다. 대원번호는 자동 발번됩니다.</p></div>
            <button type="button" style={drawerCloseButtonStyle} onClick={onClose} disabled={submitting} aria-label="대원 등록 닫기">×</button>
          </div>
          <div style={drawerBodyStyle}>
            {errorMessage && <div style={errorBoxStyle}>{errorMessage}</div>}
            <label style={drawerFieldLabelStyle}><span style={drawerLabelTextStyle}>대원명 <span style={requiredStyle}>*</span></span><input style={drawerInputStyle} value={form.name} onChange={(e) => onFormChange((c) => ({...c, name:e.target.value}))} placeholder="예: 홍길동" required /></label>
            <label style={drawerFieldLabelStyle}><span style={drawerLabelTextStyle}>학년</span><select style={drawerInputStyle} value={form.grade} onChange={(e) => onFormChange((c) => ({...c, grade:e.target.value, beginner_course_exempted: e.target.value.includes("초등학교") ? false : c.is_from_cub_scout && c.cub_promotion_completed}))}><option value="">학년 선택</option>{gradeOptions.map((grade) => <option key={grade} value={grade}>{grade}</option>)}</select></label>
            <label style={drawerFieldLabelStyle}><span style={drawerLabelTextStyle}>입단일 <span style={requiredStyle}>*</span></span><input style={drawerInputStyle} type="date" value={form.joined_at} onChange={(e) => onFormChange((c) => ({...c, joined_at:e.target.value}))} required /></label>
            {profile.role === "super_admin" ? <label style={drawerFieldLabelStyle}><span style={drawerLabelTextStyle}>소속대 <span style={requiredStyle}>*</span></span><select style={drawerInputStyle} value={form.organization_id} onChange={(e) => onFormChange((c) => ({...c, organization_id:e.target.value}))} required><option value="">소속대 선택</option>{organizations.map((o)=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label> : <div style={drawerTargetSummaryStyle}><span style={drawerTargetLabelStyle}>소속대</span><strong>{organizationName}</strong><span>현재 로그인한 소속대로 등록됩니다.</span></div>}
            <label style={drawerFieldLabelStyle}><span style={drawerLabelTextStyle}>현재급위</span><select style={drawerInputStyle} value={form.current_rank_id} onChange={(e)=>onRankChange(e.target.value)}><option value="">현재급위 선택</option>{ranks.map((r)=><option key={r.id} value={r.id}>{r.rank_name}</option>)}</select></label>
            {requiredRanks.length > 0 && <section style={rankApprovalReferenceStyle}><div style={rankApprovalReferenceHeaderStyle}><div><h4 style={rankApprovalReferenceTitleStyle}>급위별 인가일</h4><p style={rankApprovalReferenceDescriptionStyle}>현재급위까지의 인가일을 순서대로 입력합니다.</p></div></div><div style={rankApprovalReferenceGridStyle}>{requiredRanks.map((rank)=><label key={rank.id} style={drawerFieldLabelStyle}><span style={drawerLabelTextStyle}>{rank.rank_name} 인가일 <span style={requiredStyle}>*</span></span><input style={drawerInputStyle} type="date" value={form.rank_approval_dates[rank.id] ?? ""} onChange={(e)=>onFormChange((c)=>({...c, rank_approval_dates:{...c.rank_approval_dates,[rank.id]:e.target.value}}))} required /></label>)}</div></section>}
            <section style={programManagementGuideStyle}><strong style={programManagementGuideTitleStyle}>컵스카우트 이력</strong><label style={checkboxLabelStyle}><input type="checkbox" checked={form.is_from_cub_scout} onChange={(e)=>onFormChange((c)=>({...c,is_from_cub_scout:e.target.checked,beginner_course_exempted:!c.grade.includes("초등학교") && e.target.checked && c.cub_promotion_completed}))}/> 컵스카우트 출신</label><label style={checkboxLabelStyle}><input type="checkbox" checked={form.cub_promotion_completed} onChange={(e)=>onFormChange((c)=>({...c,cub_promotion_completed:e.target.checked,beginner_course_exempted:!c.grade.includes("초등학교") && c.is_from_cub_scout && e.target.checked}))}/> 컵스카우트 승진과정 이수</label><label style={checkboxLabelStyle}><input type="checkbox" checked={form.beginner_course_exempted} onChange={(e)=>onFormChange((c)=>({...c,beginner_course_exempted:e.target.checked}))}/> 초급과정 면제</label></section>
            <label style={drawerFieldLabelStyle}><span style={drawerLabelTextStyle}>비고</span><textarea style={drawerTextareaStyle} value={form.note} onChange={(e)=>onFormChange((c)=>({...c,note:e.target.value}))} placeholder="특이사항이 있으면 입력하세요." /></label>
          </div>
          <div style={drawerFooterStyle}><button type="button" style={secondaryButtonStyle} onClick={onClose} disabled={submitting}>취소</button><button type="submit" style={submitButtonStyle} disabled={submitting}>{submitting ? "등록 중..." : "대원 등록"}</button></div>
        </form>
      </aside>
    </div>, document.body,
  );
}
