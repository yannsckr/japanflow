$ErrorActionPreference = 'Stop'
function Run-Step([scriptblock]$Command) {
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "Validation failed: $Command" }
}
Run-Step { npm --prefix functions test }
Run-Step { npm run typecheck }
Run-Step { npx eslint . --max-warnings 0 }
Run-Step { npm run format:check }
Run-Step { npm run test }
Run-Step { npm run build }
Run-Step { npm run cosmos:android:sync }
Run-Step { npx firebase emulators:exec --only firestore,storage --project demo-japanflow-ota "node tests/japanflow-ota-permissions.cjs" }
Run-Step { npx firebase emulators:exec --only firestore --project demo-japanflow-ota-distribution "node tests/japanflow-ota-distribution-permissions.cjs" }
Push-Location android
try {
    Run-Step { .\gradlew.bat :app:compileDebugJavaWithJavac --no-daemon }
    Run-Step { .\gradlew.bat :app:compileReleaseJavaWithJavac --no-daemon }
} finally { Pop-Location }
Run-Step { git diff --check }
git status -sb
Write-Host 'V47.10 LOCAL VALIDATION PASSED - NO DEPLOY OR APK' -ForegroundColor Green
