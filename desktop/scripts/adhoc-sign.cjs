// macOS: 패키징 직후 앱 전체를 ad-hoc 서명(dmg에 담기기 전). 인증서 없이도 서명이 유효해져
// 처음 열 때 「손상된 앱」 대신 「확인되지 않은 개발자」 안내가 나오고, 시스템 설정 > 개인정보 보호 및 보안 > 「그래도 열기」로 열 수 있다.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
  console.log(`  • ad-hoc 서명 완료: ${app}`);
};
