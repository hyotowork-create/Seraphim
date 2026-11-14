// Vite 자산 import 타입 (tsconfig에 vite/client를 넣지 않아 여기서 최소 선언)
declare module '*?url' {
  const src: string
  export default src
}
