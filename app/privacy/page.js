export const metadata = {
  title: "개인정보처리방침 | 스크랩모아",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-neutral-800">
      <h1 className="text-2xl font-bold text-neutral-900">개인정보처리방침</h1>
      <p className="mt-2 text-sm text-neutral-500">최종 수정일: 2026-09-29</p>

      <p className="mt-6 text-sm leading-relaxed">
        스크랩모아(이하 "서비스")는 개인이 운영하는 비영리 사이드 프로젝트입니다.
        서비스는 카카오톡 챗봇으로 받은 링크를 자동 요약해 웹 대시보드에서
        모아볼 수 있게 해주며, 그 과정에서 아래와 같이 최소한의 정보를 수집·이용합니다.
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-neutral-900">1. 수집하는 개인정보 항목</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>카카오 로그인(웹 대시보드)</strong>: 카카오 계정 고유 식별값, 닉네임,
            프로필 이미지. 이메일 주소는 요청하지 않으며 수집하지 않습니다.
          </li>
          <li>
            <strong>카카오톡 챗봇 이용</strong>: 카카오가 챗봇 대화 상대마다 부여하는
            봇 사용자 식별키. 이 식별키만으로는 실명·연락처 등을 알 수 없으며,
            대시보드에서 발급한 6자리 연동 코드를 입력해야 로그인 계정과 연결됩니다.
          </li>
          <li>
            <strong>서비스 이용 중 생성되는 정보</strong>: 이용자가 저장한 링크 URL,
            그리고 AI가 자동으로 생성한 제목·3줄 요약·카테고리·태그.
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-neutral-900">2. 수집 목적</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>카카오 로그인을 통한 본인 확인 및 대시보드 계정 식별</li>
          <li>로그인 전 챗봇으로 저장한 링크를 연동 코드로 계정에 소급 연결</li>
          <li>저장한 링크의 자동 크롤링·AI 요약·분류 및 검색·필터 기능 제공</li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-neutral-900">3. 정보의 처리 위탁 및 제3자 제공</h2>
        <p className="mt-3 text-sm leading-relaxed">
          서비스는 아래 외부 서비스를 이용해 데이터를 저장·처리하며,
          광고 등 다른 목적으로 개인정보를 판매하거나 제공하지 않습니다.
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li><strong>Supabase</strong>: 회원 정보 및 저장된 링크 데이터베이스 보관</li>
          <li><strong>Google Gemini API</strong>: 저장된 링크의 본문 일부를 전달해 제목/요약/카테고리 생성에 사용</li>
          <li><strong>카카오</strong>: 로그인 인증 및 챗봇 메시지 수신</li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-neutral-900">4. 보유 및 파기</h2>
        <p className="mt-3 text-sm leading-relaxed">
          이용자가 링크를 삭제하거나 회원 탈퇴를 요청하면 관련 정보를 지체 없이
          파기합니다. 별도로 요청하지 않는 한 서비스 이용 기간 동안 보관합니다.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-neutral-900">5. 이용자의 권리</h2>
        <p className="mt-3 text-sm leading-relaxed">
          이용자는 언제든 본인의 정보 열람, 정정, 삭제, 회원 탈퇴를 요청할 수 있습니다.
          아래 문의처로 연락 주시면 확인 후 처리해 드립니다.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-neutral-900">6. 문의처</h2>
        <p className="mt-3 text-sm leading-relaxed">
          이메일:{" "}
          <a href="mailto:sideprojectlog@gmail.com" className="underline">
            sideprojectlog@gmail.com
          </a>
        </p>
      </section>
    </main>
  );
}
