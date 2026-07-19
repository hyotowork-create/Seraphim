# KSA-FLOW 개발 지침
- SPEC.md가 유일한 요구사항 원천. 임의 기능 추가 금지.
- 코딩 전 사고 / 단순함 우선 / 외과적 수정 / 목표 중심 실행.
- Gate(G1~G6)와 상태머신은 순수함수로 분리, 반드시 테스트 먼저 작성.
- AuditLog는 append-only — UPDATE/DELETE 코드 작성 금지.
- 모든 금액은 정수(원). 부동소수점 금지.
- 서버 검증이 원천. 클라이언트 검증은 UX 보조일 뿐.
- 권한 검사는 미들웨어 + 각 handler 이중으로.
- 마일스톤 단위로 작업, 완료 기준(✅) 통과 후 다음 진행.

## 구현 현황
- **M1 (기반)**: 완료 — 인증·역할·감사로그·사용자관리·예산코드 CRUD
- M2~M4: 미착수

## 로컬 실행
```bash
cd ksa-flow
npm install
cp .env.example .env        # AUTH_SECRET 등 확인
npx prisma migrate dev      # 또는 npx prisma db push
npm run seed                # SYSADMIN 계정 시드
npm run test                # M1 완료 기준 테스트
npm run dev                 # http://localhost:3000
```
