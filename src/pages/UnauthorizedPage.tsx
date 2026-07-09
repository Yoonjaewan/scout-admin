import { Link } from "react-router-dom";

export default function UnauthorizedPage() {
  return (
    <div style={{ padding: "40px", maxWidth: "720px", margin: "0 auto" }}>
      <h1>접근 권한이 없습니다</h1>

      <p>
        현재 계정으로는 이 페이지에 접근할 수 없습니다.
        필요한 권한이 있는 계정으로 다시 로그인하거나 관리자에게 문의하세요.
      </p>

      <div style={{ marginTop: "24px" }}>
        <Link to="/">홈으로 이동</Link>
      </div>
    </div>
  );
}