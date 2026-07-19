// 시스템 프롬프트 빌더 — tool-v6.html 의 buildSys* 를 서버로 이식.
// 클라이언트 전역(selectedDept/selectedTone) 대신 인자로 dept/tone 을 받는다.

import { DEPT_PRESETS, TONE_PRESETS, resolveDept, resolveTone } from "./presets.mjs";

export function buildSysPlan(dept, trendMonths = 3) {
  const g = DEPT_PRESETS[resolveDept(dept)];
  const n = String(trendMonths);
  return "당신은 교회학교 " + g.label + " 설교를 돕는 기획자입니다. " + g.guide + " "
    + "주어진 설교 본문으로 다음을 한국어로 작성하세요. "
    + "1) 본문 핵심 메시지 요약(3줄). "
    + "2) [트렌드] 검색으로 최근 " + n + "개월 내 위 대상 연령에게 유행하는 콘텐츠/밈/이슈 3가지를 찾고, 각각을 본문 메시지와 어떻게 연결할지 1줄로. 부적절·자극적 트렌드는 제외. "
    + "3) [눈높이 풀이] 본문을 대상 연령의 언어와 눈높이로 풀어낸 한 단락. "
    + "4) [설교자 포인트] 설교에 넣으면 좋은 포인트 5개(제안 형식). "
    + "5) [개요] 후킹 제목 1개 + 다음 구성/분량 기준의 개요: " + g.scriptLen + ". "
    + "6) [봉독] 본문 장절과 본문 전체 텍스트(개역개정 기준, 정확히). "
    + "읽고 수정하기 쉬운 일반 텍스트로 출력하고, 마크다운 코드블록으로 감싸지 마세요.";
}

export function buildSysScript(dept) {
  const g = DEPT_PRESETS[resolveDept(dept)];
  return "다음 설교 기획안을 바탕으로 " + g.label + " 설교 풀스크립트를 한국어로 작성하세요. 구성/분량: " + g.scriptLen + ". 대상 연령에 맞는 표현과 적용. " + g.guide + " 마크다운 코드블록 없이 일반 텍스트로.";
}

export function buildSysBulletin(dept) {
  const g = DEPT_PRESETS[resolveDept(dept)];
  const common = "다음 설교 기획안을 바탕으로 " + g.label + " 예배 주보 원고를 한국어로 작성하세요. ";
  if (g.tier === "youth") {
    return common + "구성: [예배 순서](경배와찬양-기도-성경봉독-말씀-결단찬양-광고-축도, 청소년부 예배에 맞게), [오늘의 말씀](본문 장절 + 제목 + 한 줄 핵심), [설교 요약 5줄], [이번 주 소그룹/큐티 나눔 질문 2개], [암송구절 1개], [광고/안내] 수련회·소그룹·모임 자리표시자 3줄. 마크다운 코드블록 없이 바로 편집·인쇄할 수 있는 일반 텍스트로.";
  }
  return common + "구성: [예배 순서](부서 예배에 맞게), [오늘의 말씀](본문 장절 + 한 줄 핵심), [설교 요약 5줄], [이번 주 암송구절 1개], [가정 연계] 부모가 자녀와 나눌 질문 2개, [광고/안내] 자리표시자 3줄. 마크다운 코드블록 없이 바로 편집·인쇄할 수 있는 일반 텍스트로.";
}

export function buildSysLesson(dept) {
  const g = DEPT_PRESETS[resolveDept(dept)];
  const common = "다음 설교 기획안을 바탕으로 " + g.label + " 공과공부 워크시트를 한국어로 작성하세요. 대상 연령에 맞는 난이도로. ";
  if (g.tier === "youth") {
    return common + "구성(관찰->해석->적용 귀납식): [열기] 오늘 주제 관련 공감 질문/이슈 1개, [본문 관찰] 핵심 구절 + 관찰 질문 3개, [본문 해석] 본문이 말하는 핵심 1~2개, [적용·나눔] 내 삶(관계·진로·신앙) 적용 토의 질문 4개, [결단] 이번 주 실천 1개, [암송구절] 본문 중 1구절, [기도] 마무리 기도문 예시. 빈칸 채우기형은 쓰지 마세요. 마크다운 코드블록 없이 교사가 바로 출력해 쓸 일반 텍스트로.";
  }
  return common + "구성: [들어가기] 흥미 유발 질문/활동 1개, [본문 살피기] 본문 요약 + 빈칸 채우기형 질문 3개, [묵상 나눔] 토의 질문 4개(생각->느낌->적용), [삶으로] 이번 주 실천 과제 1개, [암송구절] 본문 중 1구절, [기도] 마무리 기도문 예시. 마크다운 코드블록 없이 교사가 바로 출력해 쓸 일반 텍스트로.";
}

export function buildSysImagePrompt(dept, tone) {
  const t = TONE_PRESETS[resolveTone(dept, tone)];
  return "다음 설교 기획안으로 이미지 생성 프롬프트 16개를 만드세요(스토리 12 + 행정 4: 타이틀/봉독/헌금기도/축도). "
    + "각 프롬프트는 영어로. 모든 프롬프트 앞부분에 공통 스타일 키워드를 포함: '" + t.pos + "'. "
    + "스토리 12개는 이미지 안에 글자 금지, 각 프롬프트 끝에 네거티브 '--no " + t.neg + "' 포함. "
    + "첫 프롬프트에서 정한 등장인물 외형을 모든 컷에서 동일하게 유지. "
    + "행정 4개는 배경만 묘사하고 글자는 넣지 마세요. "
    + "출력은 16개 프롬프트만, 번호 없이 각 프롬프트를 빈 줄 하나로 구분. 코드블록·설명·머리말 금지.";
}

// type -> (systemPrompt, 검색사용, maxToken, 과금분류) 매핑
export function buildForType(type, opts = {}) {
  const dept = opts.dept;
  switch (type) {
    case "plan":
      return { sys: buildSysPlan(dept, opts.trendMonths), useSearch: true, maxTok: opts.maxTok || 4096, metered: true };
    case "script":
      return { sys: buildSysScript(dept), useSearch: false, maxTok: 8192, metered: false };
    case "bulletin":
      return { sys: buildSysBulletin(dept), useSearch: false, maxTok: 4096, metered: false };
    case "lesson":
      return { sys: buildSysLesson(dept), useSearch: false, maxTok: 4096, metered: false };
    case "imagePrompt":
      return { sys: buildSysImagePrompt(dept, opts.tone), useSearch: false, maxTok: Math.max(opts.maxTok || 4096, 6144), metered: false };
    default:
      return null;
  }
}
