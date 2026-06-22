// Eleventy 설정 — 소형 교회 주보 사이트
// 비개발자도 이해할 수 있도록 한국어 주석을 충분히 달았습니다.

const crypto = require("crypto");

module.exports = function (eleventyConfig) {
  // 교인용 헌금정보 가림막에 쓰는 해시. 비밀번호 원문을 페이지 소스에 그대로
  // 노출하지 않기 위해 SHA-256 해시만 심고, 브라우저에서 입력값을 같은 방식으로
  // 해시해 비교합니다. (강력한 보안은 아니며 가벼운 가림막 용도)
  eleventyConfig.addFilter("sha256", (value) => {
    if (!value) return "";
    return crypto.createHash("sha256").update(String(value)).digest("hex");
  });
  // ── 정적 파일 그대로 복사 (CSS, 이미지, 관리자 CMS 화면) ──
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/admin": "admin" });
  // 관리자 화면은 그대로 복사만 하고, 11ty 템플릿 처리 대상에서는 제외합니다.
  eleventyConfig.ignores.add("src/admin/index.html");

  // ── 날짜를 안전하게 다루기 위한 헬퍼 ──
  // 프런트매터의 date(예: 2026-06-07)는 Eleventy가 Date 객체로 바꿉니다.
  // 시간대(timezone) 차이로 날짜가 하루 밀리지 않도록 항상 UTC 기준으로 읽습니다.
  function toDate(value) {
    if (value instanceof Date) return value;
    return new Date(value);
  }

  const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

  // 2026-06-07 형태 (URL/파일 키)
  eleventyConfig.addFilter("dateSlug", (value) => {
    const d = toDate(value);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });

  // 2026년 6월 7일 (일) 형태 (사람이 읽기 좋은 표기)
  eleventyConfig.addFilter("dateKorean", (value) => {
    const d = toDate(value);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const w = WEEKDAYS_KO[d.getUTCDay()];
    return `${y}년 ${m}월 ${day}일 (${w})`;
  });

  // 절대 URL 만들기 (카톡 OG 썸네일·공유 링크에 필요)
  // church.json 의 url(사이트 출처: https://도메인) 과 경로를 합쳐 전체 주소를 돌려줍니다.
  // GitHub Pages 프로젝트 페이지의 하위 경로(PATH_PREFIX)도 자동으로 반영합니다.
  const PREFIX = process.env.PATH_PREFIX || "/";
  function withPrefix(path) {
    if (!path) return PREFIX;
    if (/^https?:\/\//i.test(path)) return path; // 이미 전체 주소면 그대로
    const a = PREFIX.replace(/\/$/, "");
    const b = String(path).replace(/^\//, "");
    return `${a}/${b}`;
  }
  eleventyConfig.addFilter("absUrl", (path, origin) => {
    if (!path) return origin || "";
    try {
      return new URL(withPrefix(path), origin).href;
    } catch (e) {
      return path;
    }
  });

  // 긴 텍스트에서 OG description 용으로 앞부분만 잘라내기
  eleventyConfig.addFilter("truncate", (text, n = 120) => {
    if (!text) return "";
    const clean = String(text).replace(/\s+/g, " ").trim();
    return clean.length > n ? clean.slice(0, n) + "…" : clean;
  });

  // ── 주보 컬렉션: 최신 날짜가 맨 앞 ──
  eleventyConfig.addCollection("bulletins", (collectionApi) => {
    return collectionApi
      .getFilteredByTag("bulletin")
      .sort((a, b) => b.date - a.date); // 내림차순(최신 우선)
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    // GitHub Pages 프로젝트 페이지(예: /저장소이름/) 에 배포할 때 경로 보정.
    // 배포 워크플로에서 PATH_PREFIX 환경변수로 주입합니다. 기본값은 "/".
    pathPrefix: process.env.PATH_PREFIX || "/",
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    templateFormats: ["njk", "md", "html"],
  };
};
