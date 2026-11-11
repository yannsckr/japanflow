# Execute na worktree japanflow-web-deploy. Coleta codigo, regras e configs sem segredos.
$ErrorActionPreference = 'Stop'
$root = (Get-Location).Path
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$output = Join-Path $env:USERPROFILE "Downloads\JapanFlow-Codigo-Atualizado-$stamp.zip"
$stage = Join-Path $env:TEMP "japanflow-export-$stamp"
New-Item -ItemType Directory -Force -Path $stage | Out-Null
$paths = @('src','functions','tests','scripts','firestore.rules','storage.rules','firestore.indexes.json','firebase.json','package.json','package-lock.json','tsconfig.json','vite.config.ts')
$extensions = @('.ts','.tsx','.js','.jsx','.cjs','.mjs','.css','.scss','.json','.md','.rules','.yml','.yaml','.html','.txt')
$excludeNames = @('google-services.json','service-account.json','serviceAccountKey.json','firebase-adminsdk.json','.env','.npmrc','.firebaserc','credentials.json','key.json')
foreach ($p in $paths) {
  $source = Join-Path $root $p
  if (-not (Test-Path $source)) { continue }
  $items = if (Test-Path $source -PathType Leaf) { @(Get-Item $source) } else { @(Get-ChildItem $source -File -Recurse -Force) }
  foreach ($item in $items) {
    if ($item.Name -in $excludeNames -or $item.Name -match '(?i)^(\.env|secret|credential|.*\.pem$|.*\.key$|.*\.p12$|.*\.jks$|.*\.keystore$)' ) { continue }
    if ($item.FullName -match '(?i)[\\/](node_modules|dist|build|\.git|\.firebase|coverage|logs|backups|release-output)[\\/]') { continue }
    if ($item.Length -gt 2MB) { continue }
    if ($item.Extension -notin $extensions -and $item.Name -notin @('firestore.rules','storage.rules')) { continue }
    $relative = $item.FullName.Substring($root.Length).TrimStart('\','/')
    $destination = Join-Path $stage $relative
    New-Item -ItemType Directory -Force -Path (Split-Path $destination) | Out-Null
    Copy-Item $item.FullName $destination -Force
  }
}
$gitInfo = @(
  "BRANCH: $(git branch --show-current)",
  "HEAD: $(git rev-parse --short HEAD)",
  'STATUS:',
  (git status --short)
) -join "`r`n"
[IO.File]::WriteAllText((Join-Path $stage 'GIT-STATUS.txt'),$gitInfo)
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $output -CompressionLevel Optimal -Force
Remove-Item $stage -Recurse -Force
Write-Host "ZIP criado: $output" -ForegroundColor Green
Write-Warning 'Antes de compartilhar, revise o ZIP. Scripts e configs podem conter segredos hardcoded que o filtro nao detecta.'
