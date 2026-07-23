/* =========================================================
   supabase-config.js — 내 Supabase 프로젝트 주소와 공개 키
   =========================================================

   프로젝트: JinK-kr's Project

   값 찾는 곳:
     Supabase 대시보드 → Project Settings → API

       Project URL       →  url
       Publishable key   →  publicKey   (sb_publishable_... 로 시작)

   ⚠ service_role 키는 절대 여기에 넣지 마세요.
      그 키는 모든 정책을 무시하고 DB 전체를 조작할 수 있습니다.
      이 파일은 브라우저로 전송되고 깃허브에도 올라갑니다.

   publishable 키는 원래 브라우저에 공개되는 값이라 여기 적어도 됩니다.
   대신 표를 지키는 건 오직 RLS 정책뿐입니다.
   지금 정책은 '누구나 읽고 쓰기'로 열려 있습니다 (supabase/schema.sql 참고).

   접근을 끊어야 할 일이 생기면 Supabase 대시보드에서 이 키를 폐기(rotate)
   하면 됩니다. 그러면 여기 적힌 키로는 더 이상 접속되지 않습니다.
   ========================================================= */

window.SUPABASE_CONFIG = {
  url:       'https://pcmgravqwlzgksfnnsda.supabase.co',
  publicKey: 'sb_publishable_k5utsVVq5t-kif9q2eKrBg_Wdy5cx_z'
};
