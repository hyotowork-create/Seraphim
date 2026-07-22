# 대안 경로 — Remotion (코드로 영상 만들기)

이미지 생성·HappyHorse 없이, **React 코드로** 영상을 만들고 MP4로 렌더하는 방법입니다.
자막·데이터 애니메이션·타이포그래피 중심 영상에 특히 적합합니다.
(FFmpeg 내장 → 별도 설치 불필요, MP4 출력까지 자동)

## 전제 (한 번만)
- Node.js LTS 설치됨
- Claude Code 사용 중

## 설치 흐름
```bash
# 1) 프로젝트 생성 + 스킬 설치 (터미널 1)
npx create-video@latest --yes --blank my-video
cd my-video
npm i
npx remotion skills add
npm run dev            # → 브라우저에 Remotion Studio(미리보기)가 뜸 (localhost:3000)
```

```bash
# 2) Claude Code 열기 (터미널 2)
cd my-video
claude
```

이제 프롬프트만 넣으면 됩니다. 예:
```
/remotion-create AI 에이전트가 뭔지 설명하는 30초 세로 영상(1080x1920) 만들어줘
```

## 설치되는 스킬
| 스킬 | 용도 |
|---|---|
| `/remotion-best-practices` | 뭘 쓸지 모를 때 통합 안내 |
| `/remotion-create` | 프로젝트·컴포지션 생성 |
| `/remotion-markup` | 애니메이션·타이포·레이아웃 |
| `/remotion-render` | 영상·스틸 렌더 |
| `/remotion-captions` | 자막 |
| `/remotion-docs` | 최신 API 조회 |

## Windows에서 알아둘 것
- FFmpeg 따로 설치 불필요 (Remotion 내장).
- 터미널은 PowerShell·CMD·Windows Terminal 아무거나 OK. Studio는 보통 `localhost:3000`.
- **라이선스 확인**: 조직 규모에 따라 상업용 라이선스가 필요할 수 있음.
  개인·소규모는 무료지만, 협회(KSA) 명의 사용이면 조건을 미리 확인.

## 언제 어떤 걸 쓰나
| 상황 | 추천 |
|---|---|
| 실사풍 장면·시공/풍경 타임랩스 | 이 폴더의 STAGE 1~3 (이미지 → HappyHorse) |
| 자막·데이터·모션그래픽·설교 쇼츠 | Remotion (이 문서) |
