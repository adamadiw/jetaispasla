# Lance tests/unitaires.html dans Edge (ou Chrome) sans interface et affiche le résultat.
# Prérequis : serveur local démarré (python -m http.server 8080 à la racine du dépôt).
# Usage : powershell -File tests/lancer-unitaires.ps1   (code de sortie 0 = tout OK)
param([string]$Url = 'http://127.0.0.1:8080/tests/unitaires.html')

$candidats = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$navigateur = $candidats | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $navigateur) { Write-Output 'Aucun navigateur Edge/Chrome trouvé.'; exit 2 }

$profil = Join-Path $env:TEMP ("jpl-tests-" + [guid]::NewGuid())
$dom = & $navigateur --headless=new --disable-gpu --no-first-run "--user-data-dir=$profil" `
  --virtual-time-budget=20000 --dump-dom $Url 2>$null | Out-String
Remove-Item -Recurse -Force $profil -ErrorAction SilentlyContinue

$titre = [regex]::Match($dom, '<title>([^<]*)</title>').Groups[1].Value
foreach ($m in [regex]::Matches($dom, '<li class="echec">(.*?)</li>', 'Singleline')) {
  Write-Output ([regex]::Replace($m.Groups[1].Value, '<[^>]+>', ' ') -replace '&gt;', '>' -replace '&lt;', '<' -replace '&amp;', '&')
}
Write-Output "Résultat : $titre"
if ($titre -like 'OK *') { exit 0 } else { exit 1 }
