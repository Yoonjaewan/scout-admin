import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

type UserRole = 'super_admin' | 'org_admin' | 'leader' | 'viewer';

type AppLayoutProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

type MenuItem = {
  to: string;
  label: string;
  allowedRoles: UserRole[];
};

const ALL_ROLES: UserRole[] = ['super_admin', 'org_admin', 'leader', 'viewer'];

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: '최고관리자',
  org_admin: '조직관리자',
  leader: '지도자',
  viewer: '조회전용',
};

const MENU_ITEMS: MenuItem[] = [
  {
    to: '/dashboard',
    label: '대시보드',
    allowedRoles: ALL_ROLES,
  },
  {
    to: '/scouts',
    label: '대원 관리',
    allowedRoles: ALL_ROLES,
  },
  {
    to: '/advancements',
    label: '진급 관리',
    allowedRoles: ALL_ROLES,
  },
  {
    to: '/merit-badges',
    label: '기능장 관리',
    allowedRoles: ALL_ROLES,
  },
  {
    to: '/admin/signup-requests',
    label: '이용신청 관리',
    allowedRoles: ['super_admin'],
  },
];

function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && ALL_ROLES.includes(value as UserRole);
}

export default function AppLayout({ title, description, children }: AppLayoutProps) {
  const navigate = useNavigate();

  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const visibleMenus = useMemo(() => {
    if (!role) return [];

    return MENU_ITEMS.filter((menu) => menu.allowedRoles.includes(role));
  }, [role]);

  useEffect(() => {
    let mounted = true;

    const loadProfile = async () => {
      setLoading(true);
      setErrorMessage('');

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (userError || !user) {
        navigate('/login', { replace: true });
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('role, status, deleted_at')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .maybeSingle();

      if (!mounted) return;

      if (profileError) {
        console.error('user_profiles 권한 조회 오류:', profileError.message);
        setErrorMessage('사용자 권한을 조회하지 못했습니다.');
        setLoading(false);
        return;
      }

      if (!profile) {
        setErrorMessage('사용자 프로필을 찾을 수 없습니다.');
        setLoading(false);
        return;
      }

      if (profile.status !== 'approved') {
        navigate('/pending-approval', { replace: true });
        return;
      }

      if (!isUserRole(profile.role)) {
        setErrorMessage('사용자 권한 값이 올바르지 않습니다.');
        setLoading(false);
        return;
      }

      setRole(profile.role);
      setLoading(false);
    };

    loadProfile();

    return () => {
      mounted = false;
    };
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  if (loading) {
    return <div className="page-loading">사용자 권한을 확인하는 중입니다...</div>;
  }

  if (!role || errorMessage) {
    return (
      <div className="page-loading">
        <h1>권한 확인 실패</h1>
        <p>{errorMessage || '사용자 권한을 확인할 수 없습니다.'}</p>

        <button type="button" className="secondary-button" onClick={handleLogout}>
          로그아웃
        </button>
      </div>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <strong>진급관리</strong>
            <span>Scout Admin · {ROLE_LABELS[role]}</span>
          </div>
        </div>

        <nav className="nav-menu">
          {visibleMenus.map((menu) => (
            <NavLink key={menu.to} to={menu.to}>
              {menu.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div>
            <h1>{title}</h1>
            {description && <p>{description}</p>}
          </div>

          <button type="button" className="secondary-button" onClick={handleLogout}>
            로그아웃
          </button>
        </header>

        {children}
      </section>
    </main>
  );
}