import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type ProtectedRouteProps = {
  children: React.ReactNode;
};

type UserProfile = {
  id: string;
  user_id: string;
  role: string;
  status: string;
  organization_id: string | null;
  deleted_at: string | null;
};

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadSessionAndProfile = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (!mounted) return;

      if (error || !data.session) {
        setSession(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      setSession(data.session);

      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('id, user_id, role, status, organization_id, deleted_at')
        .eq('user_id', data.session.user.id)
        .maybeSingle();

      console.log('현재 로그인 사용자 ID:', data.session.user.id);
      console.log('조회된 user_profiles:', profileData);
      console.log('프로필 조회 오류:', profileError);

      setProfile((profileData ?? null) as UserProfile | null);
      setLoading(false);
    };

    loadSessionAndProfile();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadSessionAndProfile();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return <div className="page-loading">로그인 상태 확인 중...</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!profile || profile.status !== 'approved' || profile.deleted_at !== null) {
    return <Navigate to="/pending-approval" replace />;
  }

  return <>{children}</>;
}