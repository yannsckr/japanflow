$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
if ((git branch --show-current).Trim() -ne 'japanflow-erp') { throw 'Execute apenas no worktree da branch japanflow-erp' }
node .\japanflow_release_gate\check-env.mjs
if ($LASTEXITCODE -ne 0) { throw 'Bloqueio: Firebase env' }
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Bloqueio: typecheck' }
npm run lint
if ($LASTEXITCODE -ne 0) { throw 'Bloqueio: lint' }
npm run format:check
if ($LASTEXITCODE -ne 0) { throw 'Bloqueio: format' }
npm run test
if ($LASTEXITCODE -ne 0) { throw 'Bloqueio: test' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Bloqueio: build' }
Write-Host 'Build aprovado. Verifique o site em uma janela anonima apos o deploy.' -ForegroundColor Green
Write-Host 'Esse script NAO publica automaticamente regras nem o Hosting.'
