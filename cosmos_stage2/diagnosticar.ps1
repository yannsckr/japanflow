# Diagnóstico não destrutivo. Execute na raiz do repositório.
Write-Host '--- Branch e alterações ---'
git branch --show-current
git status --short
Write-Host '--- Versão e scripts ---'
node -p "require('./package.json').scripts['cosmos:android:sync']"
Write-Host '--- Firebase projeto (não exibe credenciais) ---'
Get-Content .firebaserc
Write-Host '--- Android Google services local ---'
if (Test-Path 'android/app/google-services.json') {Write-Host 'google-services.json presente (não enviar!)'} else {Write-Warning 'google-services.json ausente'}
Write-Host '--- Plugins ---'
npm ls @capacitor/core @capacitor/push-notifications @capacitor-community/background-geolocation --depth=0
