// src/bulletins/ 폴더 안의 모든 주보 파일에 공통으로 적용되는 설정.
// 목회자는 이 파일을 건드릴 필요가 없습니다. (URL·제목·공유용 메타 자동 처리)

function pad(n) {
  return String(n).padStart(2, "0");
}

function slugFromDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate()
  )}`;
}

const PREFIX = process.env.PATH_PREFIX || "/";

function withPrefix(path) {
  if (!path) return PREFIX;
  if (/^https?:\/\//i.test(path)) return path;
  const a = PREFIX.replace(/\/$/, "");
  const b = String(path).replace(/^\//, "");
  return `${a}/${b}`;
}

// 출처(origin: https://도메인) + 하위경로 를 합쳐 전체 주소를 만듭니다.
function absolute(path, origin) {
  if (!path) return origin || "";
  try {
    return new URL(withPrefix(path), origin).href;
  } catch (e) {
    return path;
  }
}

module.exports = {
  layout: "bulletin.njk",
  tags: "bulletin",

  // 날짜만 정하면 /bulletin/YYYY-MM-DD/ 주소가 자동으로 만들어집니다.
  permalink: (data) => `/bulletin/${slugFromDate(data.date)}/`,

  // 카톡 공유 미리보기(제목·설명·썸네일)를 자동으로 채웁니다.
  eleventyComputed: {
    pageTitle: (data) =>
      `${data.church.name} 주보 · ${slugFromDate(data.date)}`,
    pageDescription: (data) => {
      const s = data.sermon || {};
      const parts = [s.title, s.scripture].filter(Boolean);
      return parts.join(" · ");
    },
    // 주보 이미지가 있으면 그것을, 없으면 교회 기본 이미지를 썸네일로.
    ogImage: (data) =>
      absolute(data.bulletinImage || data.church.defaultImage, data.church.url),
    // 공유 버튼이 복사할 이 페이지의 전체 주소.
    shareUrl: (data) =>
      absolute(`/bulletin/${slugFromDate(data.date)}/`, data.church.url),
  },
};
