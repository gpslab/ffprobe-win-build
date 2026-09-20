#!/usr/bin/env node
// Self-containment gate.
//
// Usage: node check-imports.js <objdump-output-file>
//
// The bundle ships a single executable and no DLLs. That claim is only true if
// the binary imports nothing but Windows' own libraries: one forgotten
// -static and `libgcc_s_seh-1.dll`, `libwinpthread-1.dll` or `zlib1.dll` become
// a runtime dependency that exists on the build machine and on no user's
// machine. The failure surfaces as "the application can't start", days later,
// on someone else's computer.
//
// Reads the output of `objdump -p ffprobe.exe` (produced in the MSYS2 shell,
// checked here) and asserts every "DLL Name:" entry is a known OS library.

'use strict';
const fs = require('fs');

const file = process.argv[2];
if (!file) {
  console.error('usage: check-imports.js <objdump-output-file>');
  process.exit(2);
}

// Libraries that ship with Windows itself. Deliberately an allowlist: a new
// import must be looked at by a human, not silently accepted by a pattern.
const SYSTEM_DLLS = new Set([
  'kernel32.dll', 'user32.dll', 'gdi32.dll', 'advapi32.dll', 'shell32.dll',
  'ole32.dll', 'oleaut32.dll', 'shlwapi.dll', 'psapi.dll', 'version.dll',
  'ws2_32.dll', 'wsock32.dll', 'secur32.dll', 'bcrypt.dll', 'crypt32.dll',
  'winmm.dll', 'imm32.dll', 'setupapi.dll', 'cfgmgr32.dll', 'dwmapi.dll',
  'msvcrt.dll', 'ucrtbase.dll', 'api-ms-win-crt-runtime-l1-1-0.dll',
  'mfplat.dll', 'mf.dll', 'mfreadwrite.dll', 'mfuuid.dll', 'd3d11.dll',
  'dxgi.dll', 'dxva2.dll', 'evr.dll', 'ntdll.dll', 'rpcrt4.dll',
]);

const text = fs.readFileSync(file, 'utf8');
const names = [...text.matchAll(/DLL Name:\s*(\S+)/g)].map((m) => m[1].toLowerCase());

if (!names.length) {
  console.error('FAIL: no "DLL Name:" entries found — was this really `objdump -p` output?');
  process.exit(1);
}

const foreign = [...new Set(names)].filter((n) => {
  if (SYSTEM_DLLS.has(n)) return false;
  // api-ms-win-* are the UCRT / Windows API sets, always OS-provided.
  return !/^api-ms-win-/.test(n);
});

console.log(`imports (${new Set(names).size} unique): ${[...new Set(names)].sort().join(', ')}`);

if (foreign.length) {
  console.error(`\nFAIL: ${foreign.length} non-system import(s): ${foreign.join(', ')}`);
  console.error('The binary is not self-contained. Check --extra-ldflags="-static".');
  process.exit(1);
}
console.log('self-containment gate OK: every import is an OS-provided library');
