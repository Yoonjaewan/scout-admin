import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

type OrganizationType = 'local' | 'school';
type RequestedRole = 'org_admin' | 'leader' | 'viewer';

type SignupRequest = {
  id: string;
  auth_user_id: string | null;
  email: string;
  name: string;
  phone: string | null;
  organization_type: OrganizationType;
  organization_name: string;
  requested_role: RequestedRole;
  status: string;
  note: string | null;
  admin_note: string | null;
  processed_by: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
};

export default function PendingApprovalPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [requestInfo, setRequestInfo] = useState<SignupRequest | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [organizationType, setOrganizationType] =
    useState<OrganizationType>('school');
  const [organizationName, setOrganizationName] = useState('');
  const [requestedRole, setRequestedRole] =
    useState<RequestedRole>('org_admin');
  const [note, setNote] = useState('');

  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [resubmitting, setResubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setMessage('');
    setErrorMessage('');
    setSuccessMessage('');

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setEmail('');
      setUserId('');
      setRequestInfo(null);
      setMessage('현재 로그인 세션이 없습니다. 로그인 화면에서 다시 로그인하세요.');
      setLoading(false);
      return;
    }

    setEmail(user.email ?? '');
    setUserId(user.id);

    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, user_id, role, status, deleted_at')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (profileError) {
      console.error('user_profiles 조회 오류:', profileError.message);
    }

    if (profile?.status === 'approved') {
      navigate('/dashboard', { replace: true });
      return;
    }

    let request: SignupRequest | null = null;

    const { data: requestByUserId, error: requestByUserIdError } =
      await supabase
        .from('signup_requests')
        .select(
          'id, auth_user_id, email, name, phone, organization_type, organization_name, requested_role, status, note, admin_note, processed_by, processed_at, created_at, updated_at',
        )
        .eq('auth_user_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (requestByUserIdError) {
      console.error('auth_user_id 기준 이용신청 조회 오류:', requestByUserIdError.message);
    }

    if (requestByUserId) {
      request = requestByUserId as SignupRequest;
    } else if (user.email) {
      const { data: requestByEmail, error: requestByEmailError } =
        await supabase
          .from('signup_requests')
          .select(
            'id, auth_user_id, email, name, phone, organization_type, organization_name, requested_role, status, note, admin_note, processed_by, processed_at, created_at, updated_at',
          )
          .eq('email', user.email)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

      if (requestByEmailError) {
        console.error('email 기준 이용신청 조회 오류:', requestByEmailError.message);
      }

      if (requestByEmail) {
        request = requestByEmail as SignupRequest;
      }
    }

    setRequestInfo(request);

    if (request) {
      setName(request.name ?? '');
      setPhone(request.phone ?? '');
      setOrganizationType(request.organization_type ?? 'school');
      setOrganizationName(request.organization_name ?? '');
      setRequestedRole(request.requested_role ?? 'org_admin');
      setNote(request.note ?? '');
    }

    if (!request) {
      setMessage(
        '이용신청 정보를 찾을 수 없습니다. 이용신청을 다시 작성하거나 최고관리자에게 문의하세요.',
      );
    } else if (request.status === 'rejected') {
      setMessage('이용신청이 반려되었습니다. 아래 반려 사유를 확인한 뒤 수정하여 재신청하세요.');
    } else if (request.status === 'approved') {
      setMessage(
        '이용신청은 승인되었지만 사용자 권한 정보가 아직 반영되지 않았습니다. 최고관리자에게 문의하세요.',
      );
    } else if (request.status === 'pending') {
      setMessage('이용신청이 접수되어 최고관리자 승인을 기다리고 있습니다.');
    } else if (request.status === 'suspended') {
      setMessage('계정 이용이 정지된 상태입니다. 최고관리자에게 문의하세요.');
    } else {
      setMessage(`현재 신청 상태: ${request.status}`);
    }

    setLoading(false);
  }, [navigate]);

  const handleCheckAgain = async () => {
    setChecking(true);
    await loadStatus();
    setChecking(false);
  };

  const handleResubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!requestInfo) {
      setErrorMessage('재신청할 이용신청 정보를 찾을 수 없습니다.');
      return;
    }

    if (requestInfo.status !== 'rejected') {
      setErrorMessage('반려된 신청만 재신청할 수 있습니다.');
      return;
    }

    const cleanName = name.trim();
    const cleanPhone = phone.trim();
    const cleanOrganizationName = organizationName.trim();
    const cleanNote = note.trim();

    if (!cleanName) {
      setErrorMessage('이름을 입력하세요.');
      return;
    }

    if (!cleanOrganizationName) {
      setErrorMessage('소속 대명을 입력하세요.');
      return;
    }

    setResubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    const { error } = await supabase
      .from('signup_requests')
      .update({
        auth_user_id: userId || requestInfo.auth_user_id,
        email: email || requestInfo.email,
        name: cleanName,
        phone: cleanPhone || null,
        organization_type: organizationType,
        organization_name: cleanOrganizationName,
        requested_role: requestedRole,
        status: 'pending',
        note: cleanNote || null,
        admin_note: null,
        processed_by: null,
        processed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestInfo.id);

    if (error) {
      console.error('재신청 오류:', error.message);
      setErrorMessage(`재신청 처리에 실패했습니다. 오류: ${error.message}`);
      setResubmitting(false);
      return;
    }

    setSuccessMessage('재신청이 접수되었습니다. 최고관리자 승인을 기다려 주세요.');
    setResubmitting(false);
    await loadStatus();
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const isRejected = requestInfo?.status === 'rejected';

  return (
    <main style={pageStyle}>
      <section style={leftPanelStyle}>
        <div>
          <div style={brandLabelStyle}>Scout Advancement Manager</div>
          <h1 style={brandTitleStyle}>
            {isRejected ? '이용신청 반려' : '승인 대기 중'}
          </h1>
          <p style={brandTextStyle}>
            {isRejected
              ? '이용신청이 반려되었습니다. 반려 사유를 확인하고 신청 정보를 수정하여 재신청할 수 있습니다.'
              : '이용신청은 접수되었지만 아직 최고관리자 승인이 완료되지 않았습니다. 승인이 완료되면 진급관리 기능을 사용할 수 있습니다.'}
          </p>
        </div>

        <div style={guideBoxStyle}>
          <h2 style={guideTitleStyle}>
            {isRejected ? '재신청 절차' : '승인 후 사용 가능 기능'}
          </h2>
          {isRejected ? (
            <ol style={guideListStyle}>
              <li>반려 사유 확인</li>
              <li>소속 대명, 신청 역할, 비고 수정</li>
              <li>재신청 접수</li>
              <li>최고관리자 재검토</li>
            </ol>
          ) : (
            <ul style={guideListStyle}>
              <li>대원 등록 및 조회</li>
              <li>진급 과정 관리</li>
              <li>기능장 취득 관리</li>
              <li>권한별 관리 화면 접근</li>
            </ul>
          )}
        </div>
      </section>

      <section style={rightPanelStyle}>
        <div style={cardStyle}>
          <div style={headerStyle}>
            <div style={isRejected ? rejectedBadgeStyle : pendingBadgeStyle}>
              {isRejected ? '반려됨' : '승인 상태'}
            </div>
            <h2 style={titleStyle}>
              {isRejected ? '반려 사유 확인 및 재신청' : '이용신청 승인 대기'}
            </h2>
            <p style={descriptionStyle}>
              {isRejected
                ? '관리자 메모를 확인하고 필요한 내용을 수정하세요.'
                : '최고관리자가 소속 대와 역할을 확인한 뒤 승인합니다.'}
            </p>
          </div>

          {loading ? (
            <div style={statusBoxStyle}>
              <strong>상태 확인 중</strong>
              <p style={statusTextStyle}>
                로그인 정보와 이용신청 상태를 확인하고 있습니다.
              </p>
            </div>
          ) : (
            <>
              <div style={statusBoxStyle}>
                <StatusRow label="로그인 계정" value={email || '로그인 세션 없음'} />
                <StatusRow
                  label="현재 상태"
                  value={getStatusLabel(requestInfo?.status ?? '확인 필요')}
                  badge
                  rejected={isRejected}
                />

                {requestInfo && (
                  <>
                    <StatusRow
                      label="소속 구분"
                      value={getOrganizationTypeLabel(requestInfo.organization_type)}
                    />
                    <StatusRow
                      label="소속 대명"
                      value={requestInfo.organization_name}
                    />
                    <StatusRow
                      label="신청 역할"
                      value={getRoleLabel(requestInfo.requested_role)}
                    />
                    <StatusRow
                      label="신청일"
                      value={formatDateTime(requestInfo.created_at)}
                    />
                  </>
                )}
              </div>

              {message && <div style={messageBoxStyle}>{message}</div>}

              {isRejected && (
                <div style={rejectReasonBoxStyle}>
                  <strong>반려 사유</strong>
                  <p>
                    {requestInfo?.admin_note?.trim()
                      ? requestInfo.admin_note
                      : '관리자 반려 사유가 입력되지 않았습니다. 최고관리자에게 문의하세요.'}
                  </p>
                </div>
              )}

              {errorMessage && <div style={errorBoxStyle}>{errorMessage}</div>}
              {successMessage && <div style={successBoxStyle}>{successMessage}</div>}

              {isRejected && requestInfo && (
                <form onSubmit={handleResubmit} style={resubmitFormStyle}>
                  <h3 style={formTitleStyle}>재신청 정보 수정</h3>

                  <div style={formGridStyle}>
                    <label style={labelStyle}>
                      이름
                      <input
                        type="text"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        required
                        style={inputStyle}
                      />
                    </label>

                    <label style={labelStyle}>
                      연락처
                      <input
                        type="tel"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        placeholder="010-0000-0000"
                        style={inputStyle}
                      />
                    </label>
                  </div>

                  <div style={formGridStyle}>
                    <label style={labelStyle}>
                      신청 구분
                      <select
                        value={organizationType}
                        onChange={(event) =>
                          setOrganizationType(event.target.value as OrganizationType)
                        }
                        required
                        style={inputStyle}
                      >
                        <option value="school">학교대</option>
                        <option value="local">지역대</option>
                      </select>
                    </label>

                    <label style={labelStyle}>
                      신청 역할
                      <select
                        value={requestedRole}
                        onChange={(event) =>
                          setRequestedRole(event.target.value as RequestedRole)
                        }
                        required
                        style={inputStyle}
                      >
                        <option value="org_admin">대 관리자</option>
                        <option value="leader">지도자</option>
                        <option value="viewer">조회자</option>
                      </select>
                    </label>
                  </div>

                  <label style={labelStyle}>
                    소속 대명
                    <input
                      type="text"
                      value={organizationName}
                      onChange={(event) => setOrganizationName(event.target.value)}
                      required
                      style={inputStyle}
                    />
                  </label>

                  <label style={labelStyle}>
                    재신청 메모
                    <textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="수정한 내용이나 재신청 사유를 입력하세요."
                      rows={4}
                      style={textareaStyle}
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={resubmitting}
                    style={{
                      ...primaryButtonStyle,
                      width: '100%',
                      opacity: resubmitting ? 0.7 : 1,
                      cursor: resubmitting ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {resubmitting ? '재신청 처리 중...' : '수정 후 재신청'}
                  </button>
                </form>
              )}
            </>
          )}

          <div style={buttonGroupStyle}>
            <button
              type="button"
              onClick={handleCheckAgain}
              disabled={checking}
              style={{
                ...primaryButtonStyle,
                opacity: checking ? 0.7 : 1,
                cursor: checking ? 'not-allowed' : 'pointer',
              }}
            >
              {checking ? '확인 중...' : '승인 여부 다시 확인'}
            </button>

            <button type="button" onClick={handleLogout} style={secondaryButtonStyle}>
              로그아웃
            </button>
          </div>

          <div style={footerStyle}>
            <Link to="/login" style={footerLinkStyle}>
              로그인 화면으로 이동
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function StatusRow({
  label,
  value,
  badge = false,
  rejected = false,
}: {
  label: string;
  value: string;
  badge?: boolean;
  rejected?: boolean;
}) {
  return (
    <div style={statusRowStyle}>
      <span style={statusLabelStyle}>{label}</span>
      {badge ? (
        <strong style={rejected ? rejectedStatusBadgeStyle : statusBadgeStyle}>
          {value}
        </strong>
      ) : (
        <strong style={statusValueStyle}>{value}</strong>
      )}
    </div>
  );
}

function getOrganizationTypeLabel(value: string) {
  if (value === 'school') return '학교대';
  if (value === 'local') return '지역대';
  return value;
}

function getRoleLabel(value: string) {
  if (value === 'org_admin') return '대 관리자';
  if (value === 'leader') return '지도자';
  if (value === 'viewer') return '조회자';
  if (value === 'super_admin') return '최고관리자';
  return value;
}

function getStatusLabel(value: string) {
  if (value === 'pending') return '승인 대기';
  if (value === 'approved') return '승인 완료';
  if (value === 'rejected') return '반려';
  if (value === 'suspended') return '정지';
  return value;
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  gridTemplateColumns: 'minmax(360px, 0.9fr) minmax(520px, 1.1fr)',
  background:
    'linear-gradient(135deg, #0f172a 0%, #1e3a8a 42%, #f8fafc 42%, #f8fafc 100%)',
  fontFamily:
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const leftPanelStyle: CSSProperties = {
  padding: '72px 64px',
  color: '#ffffff',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
};

const brandLabelStyle: CSSProperties = {
  fontSize: '15px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#bfdbfe',
  marginBottom: '20px',
};

const brandTitleStyle: CSSProperties = {
  fontSize: '48px',
  lineHeight: '1.15',
  margin: 0,
  fontWeight: 800,
};

const brandTextStyle: CSSProperties = {
  marginTop: '24px',
  fontSize: '18px',
  lineHeight: '1.7',
  color: '#dbeafe',
  maxWidth: '560px',
};

const guideBoxStyle: CSSProperties = {
  maxWidth: '520px',
  padding: '24px',
  borderRadius: '20px',
  backgroundColor: 'rgba(255, 255, 255, 0.12)',
  border: '1px solid rgba(255, 255, 255, 0.18)',
};

const guideTitleStyle: CSSProperties = {
  fontSize: '20px',
  margin: '0 0 16px',
};

const guideListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: '22px',
  lineHeight: '1.9',
  color: '#e0f2fe',
};

const rightPanelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '48px',
};

const cardStyle: CSSProperties = {
  width: '100%',
  maxWidth: '680px',
  padding: '40px',
  borderRadius: '24px',
  backgroundColor: '#ffffff',
  boxShadow: '0 24px 80px rgba(15, 23, 42, 0.18)',
  border: '1px solid #e5e7eb',
};

const headerStyle: CSSProperties = {
  marginBottom: '28px',
};

const pendingBadgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '6px 12px',
  borderRadius: '999px',
  backgroundColor: '#fef3c7',
  color: '#92400e',
  fontSize: '13px',
  fontWeight: 800,
  marginBottom: '16px',
};

const rejectedBadgeStyle: CSSProperties = {
  ...pendingBadgeStyle,
  backgroundColor: '#fee2e2',
  color: '#991b1b',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: '32px',
  fontWeight: 800,
  color: '#0f172a',
};

const descriptionStyle: CSSProperties = {
  marginTop: '10px',
  marginBottom: 0,
  color: '#64748b',
  fontSize: '15px',
};

const statusBoxStyle: CSSProperties = {
  padding: '20px',
  borderRadius: '16px',
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
};

const statusRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '16px',
  padding: '10px 0',
  borderBottom: '1px solid #e2e8f0',
};

const statusLabelStyle: CSSProperties = {
  color: '#64748b',
  fontSize: '14px',
  fontWeight: 700,
};

const statusValueStyle: CSSProperties = {
  color: '#0f172a',
  fontSize: '14px',
  textAlign: 'right',
};

const statusBadgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 10px',
  borderRadius: '999px',
  backgroundColor: '#fef3c7',
  color: '#92400e',
  fontSize: '13px',
  fontWeight: 800,
};

const rejectedStatusBadgeStyle: CSSProperties = {
  ...statusBadgeStyle,
  backgroundColor: '#fee2e2',
  color: '#991b1b',
};

const statusTextStyle: CSSProperties = {
  margin: '8px 0 0',
  color: '#64748b',
  lineHeight: '1.6',
};

const messageBoxStyle: CSSProperties = {
  marginTop: '16px',
  padding: '14px 16px',
  borderRadius: '14px',
  backgroundColor: '#eff6ff',
  border: '1px solid #bfdbfe',
  color: '#1e3a8a',
  fontSize: '14px',
  lineHeight: '1.6',
};

const rejectReasonBoxStyle: CSSProperties = {
  marginTop: '16px',
  padding: '16px',
  borderRadius: '14px',
  backgroundColor: '#fef2f2',
  border: '1px solid #fecaca',
  color: '#991b1b',
  fontSize: '14px',
  lineHeight: '1.6',
};

const errorBoxStyle: CSSProperties = {
  marginTop: '16px',
  padding: '14px 16px',
  borderRadius: '14px',
  backgroundColor: '#fef2f2',
  color: '#b91c1c',
  border: '1px solid #fecaca',
  fontSize: '14px',
  lineHeight: '1.6',
};

const successBoxStyle: CSSProperties = {
  marginTop: '16px',
  padding: '14px 16px',
  borderRadius: '14px',
  backgroundColor: '#ecfdf5',
  color: '#047857',
  border: '1px solid #a7f3d0',
  fontSize: '14px',
  lineHeight: '1.6',
};

const resubmitFormStyle: CSSProperties = {
  marginTop: '20px',
  padding: '20px',
  borderRadius: '18px',
  border: '1px solid #e5e7eb',
  backgroundColor: '#ffffff',
};

const formTitleStyle: CSSProperties = {
  margin: '0 0 16px',
  fontSize: '20px',
  color: '#0f172a',
};

const formGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '16px',
};

const labelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  fontSize: '14px',
  fontWeight: 700,
  color: '#334155',
  marginBottom: '16px',
};

const inputStyle: CSSProperties = {
  height: '46px',
  borderRadius: '12px',
  border: '1px solid #cbd5e1',
  padding: '0 14px',
  fontSize: '15px',
  outline: 'none',
  boxSizing: 'border-box',
  backgroundColor: '#ffffff',
};

const textareaStyle: CSSProperties = {
  minHeight: '96px',
  borderRadius: '12px',
  border: '1px solid #cbd5e1',
  padding: '12px 14px',
  fontSize: '15px',
  outline: 'none',
  resize: 'vertical',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const buttonGroupStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '12px',
  marginTop: '24px',
};

const primaryButtonStyle: CSSProperties = {
  height: '48px',
  border: 'none',
  borderRadius: '12px',
  backgroundColor: '#2563eb',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 800,
};

const secondaryButtonStyle: CSSProperties = {
  height: '48px',
  border: '1px solid #cbd5e1',
  borderRadius: '12px',
  backgroundColor: '#ffffff',
  color: '#334155',
  fontSize: '15px',
  fontWeight: 800,
  cursor: 'pointer',
};

const footerStyle: CSSProperties = {
  marginTop: '24px',
  paddingTop: '24px',
  borderTop: '1px solid #e5e7eb',
  display: 'flex',
  justifyContent: 'center',
  gap: '12px',
};

const footerLinkStyle: CSSProperties = {
  color: '#2563eb',
  fontWeight: 800,
  textDecoration: 'none',
  fontSize: '14px',
};