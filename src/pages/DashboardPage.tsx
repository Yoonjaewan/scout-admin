import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { supabase } from '../lib/supabase';

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [profileData, setProfileData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const loadUserAndProfile = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUser = sessionData.session?.user ?? null;

      setUser(currentUser);

      if (!currentUser) return;

      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', currentUser.id)
        .maybeSingle();

      if (error) {
        console.error('프로필 조회 오류:', error.message);
        return;
      }

      setProfileData(data);
    };

    loadUserAndProfile();
  }, []);

  return (
    <AppLayout
      title="대시보드"
      description="로그인 및 Supabase 연결 확인 화면입니다."
    >
      <section className="dashboard-grid">
        <article className="info-card">
          <h2>로그인 사용자</h2>
          <dl>
            <dt>Email</dt>
            <dd>{user?.email ?? '-'}</dd>

            <dt>User ID</dt>
            <dd>{user?.id ?? '-'}</dd>
          </dl>
        </article>

        <article className="info-card">
          <h2>프로필 정보</h2>
          <pre>{JSON.stringify(profileData, null, 2)}</pre>
        </article>

        <article className="info-card wide">
          <h2>다음 구현 화면</h2>
          <p>
            대원 목록 화면에서 RLS가 정상 적용되어 로그인 사용자의 조직 대원만 조회되는지
            확인합니다.
          </p>
        </article>
      </section>
    </AppLayout>
  );
}