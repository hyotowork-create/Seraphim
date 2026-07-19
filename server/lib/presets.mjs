// 부서/톤 프리셋 — tools/tool-v6.html 의 DEPT_PRESETS / TONE_PRESETS 를
// 서버(Node)로 이식한 것. 클라이언트와 동일 값 유지가 목적이므로 함께 수정할 것.

export const TONE_PRESETS = {
  toddler:         { label: "포근한 그림책", pos: "soft rounded children's picture book illustration, simple chunky shapes, thick gentle outlines, warm pastel colors, cozy friendly mood, minimal detail", neg: "scary, dark, photorealistic, complex detail, sharp edges, text, letters, words, numbers, watermark, subtitle" },
  lower_pixar:     { label: "픽사 3D", pos: "Pixar-style 3D animation, expressive lighting, high detail, 8k", neg: "anime style, watercolor style, text, letters, words, numbers, watermark, subtitle" },
  lower_cartoon:   { label: "밝은 2D 카툰", pos: "bright flat 2D cartoon illustration, bold clean outlines, vivid cheerful saturated colors, playful energetic mood", neg: "photorealistic, 3d render, dark, scary, text, letters, words, numbers, watermark, subtitle" },
  upper_webtoon:   { label: "웹툰/셀셰이딩", pos: "Korean webtoon style, clean cel shading, dynamic composition, cinematic lighting, semi-stylized characters", neg: "photorealistic, childish scribble, text, letters, words, numbers, watermark, subtitle" },
  upper_cinematic: { label: "시네마틱 일러스트", pos: "semi-realistic cinematic storybook illustration, painterly detail, dramatic warm lighting, rich atmosphere", neg: "flat cartoon, text, letters, words, numbers, watermark, subtitle" },
  upper_pixar:     { label: "픽사 3D(고학년)", pos: "cinematic Pixar-style 3D animation, refined detailed character design, dramatic expressive lighting, rich textures, high detail, 8k", neg: "babyish, chibi, anime style, watercolor, text, letters, words, numbers, watermark, subtitle" },
  upper_voxel:     { label: "게임 복셀(로블록스·마인크래프트풍)", pos: "stylized 3D voxel game render, blocky low-poly characters, vibrant game-world lighting, clean colorful shapes, adventurous video game aesthetic", neg: "photorealistic, gore, childish scribble, text, letters, words, numbers, watermark, subtitle" },
  upper_anime:     { label: "애니메이션풍", pos: "clean Japanese animation style, vibrant cel shading, expressive dynamic characters, crisp lineart, adventurous bright atmosphere", neg: "photorealistic, 3d render, chibi, childish scribble, text, letters, words, numbers, watermark, subtitle" },
  watercolor:      { label: "수채화 동화", pos: "soft watercolor storybook illustration, gentle washes, delicate textures, warm tender mood", neg: "3d render, photorealistic, harsh lines, dark, scary, text, letters, words, numbers, watermark, subtitle" },
};

export const DEPT_PRESETS = {
  infant:     { tier: "child", label: "영유아부", tones: ["toddler", "watercolor"],
                guide: "대상은 영아~유치부(만 7세 이하). 아주 짧고 반복적인 문장, 감각·소리·친숙한 사물(동물·간식·가족) 중심으로 풀어내세요. 유행/밈은 최소화하고 친숙한 것으로 연결. 폭력·공포 묘사 금지.",
                scriptLen: "3,000자 내외, 8개 챕터" },
  younger:    { tier: "child", label: "유년부", tones: ["lower_pixar", "lower_cartoon", "watercolor"],
                guide: "대상은 초등 저학년(1~3학년). 쉬운 언어와 상황극, 또래 학교생활을 활용. 최근 저학년에게 유행하는 콘텐츠/캐릭터를 본문과 자연스럽게 연결.",
                scriptLen: "5,000자 내외, 10개 챕터" },
  elementary: { tier: "child", label: "초등부", tones: ["upper_pixar", "upper_webtoon", "upper_voxel", "upper_anime", "upper_cinematic"],
                guide: "대상은 초등 고학년(4~6학년). 게임·유튜브·밈 등 또래 트렌드를 본문 메시지와 연결하고, 논리적 흐름과 적용을 또래 상황으로 구체화.",
                scriptLen: "7,000자 이상, 12개 챕터" },
  middle:     { tier: "youth", label: "중등부", tones: ["upper_webtoon", "upper_anime", "upper_cinematic"],
                guide: "대상은 중학생(13~15세, 디지털 네이티브). 학교·학원·또래관계·자존감·정체성 고민이 일상. 인기 드라마/노래/영상/뉴스·청소년 이슈를 '공감 도입'으로만 쓰되 반드시 본문 메시지로 수렴하세요. 본문과 무관한 개그·재미 위주로 흐르지 말고 본문 중심을 유지. 텍스트(본문)는 그대로, 콘텍스트(청소년 상황)에 적용점을 던지는 방식. 진지하되 친근하게, 따뜻함·공감이 신뢰를 만든다.",
                scriptLen: "20~25분 분량. 12챕터 상황극이 아니라 도입(공감/트렌드)→본문 관찰·강해→삶의 적용 2~3개→결단·기도 흐름" },
  high:       { tier: "youth", label: "고등부", tones: ["upper_cinematic", "upper_webtoon", "upper_anime"],
                guide: "대상은 고등학생(16~18세). 입시·진로·미래불안·실존적 질문이 핵심. 본문을 배경·문맥과 함께 깊이 있게 강해하고 신앙과 삶(진로·관계·세계관)을 연결. 트렌드·뉴스는 공감 도구로만 절제 사용. 가벼운 재미보다 말씀의 무게와 진정성으로 다가가되, 권위적·일방적 강요는 피하고 스스로 질문하게.",
                scriptLen: "25~30분 분량. 도입→본문 강해(배경·문맥)→신학적 핵심→삶의 적용→결단. 깊이 우선" },
};

export const DEFAULT_DEPT = "elementary";
export const DEFAULT_TONE = "upper_pixar";

export function resolveDept(dept) {
  return DEPT_PRESETS[dept] ? dept : DEFAULT_DEPT;
}
export function resolveTone(dept, tone) {
  const g = DEPT_PRESETS[resolveDept(dept)];
  if (tone && TONE_PRESETS[tone] && g.tones.includes(tone)) return tone;
  return g.tones[0] || DEFAULT_TONE;
}
