// 홈 페이지의 공유 미리보기(OG)를 최신 주보 내용으로 자동 채웁니다.
module.exports = {
  eleventyComputed: {
    pageTitle: (data) => {
      const latest = (data.collections.bulletins || [])[0];
      return latest ? latest.data.pageTitle : `${data.church.name} 주보`;
    },
    pageDescription: (data) => {
      const latest = (data.collections.bulletins || [])[0];
      return latest ? latest.data.pageDescription : data.church.footerNote;
    },
    ogImage: (data) => {
      const latest = (data.collections.bulletins || [])[0];
      return latest ? latest.data.ogImage : null;
    },
  },
};
