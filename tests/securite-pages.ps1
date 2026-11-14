# Test de sécurité de la table notes_pages (RLS), via l'API REST publique.
# Usage : powershell -File tests/securite-pages.ps1   (code de sortie 0 = tout OK)
$ErrorActionPreference = 'Stop'
$base = 'https://kklvodtpjilsdaptogff.supabase.co'
$cle = 'sb_publishable_Zg7NpzmbwVySCKZ9BySPyA_tcSy_dHu'
$echecs = 0

function Verifier($nom, $ok, $detail) {
  if ($ok) { Write-Output "OK     $nom" } else { Write-Output "ECHEC  $nom ($detail)"; $script:echecs++ }
}
function Utilisateur {
  $u = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/signup" -Headers @{ apikey = $cle; 'Content-Type' = 'application/json' } -Body '{}'
  return @{ id = $u.user.id; h = @{ apikey = $cle; Authorization = "Bearer $($u.access_token)"; 'Content-Type' = 'application/json'; Prefer = 'return=representation' } }
}
# PowerShell 5 envoie les corps en Latin-1 : on envoie explicitement de l'UTF-8.
function Utf8($texte) { return , ([Text.Encoding]::UTF8.GetBytes($texte)) }  # la virgule évite que le tableau soit déroulé
function Statut($bloc) {
  try { & $bloc | Out-Null; return 200 } catch { return [int]$_.Exception.Response.StatusCode }
}

$A = Utilisateur
$B = Utilisateur
$note = (Invoke-RestMethod -Method Post -Uri "$base/rest/v1/notes" -Headers $A.h -Body (Utf8 (@{
  titre = 'Test sécurité notes_pages (à supprimer)'; matiere = 'Autre'; type_document = 'autre'
  fichiers = @(@{ chemin = "$($A.id)/test.jpg"; type = 'image/jpeg'; nom = 'test.jpg' })
} | ConvertTo-Json -Depth 5 -Compress)))[0]

try {
  $ligne = @{ note_id = $note.id; fichier = 0; page = 0; texte = 'Socrate'; mots = @(, @(0.1, 0.2, 0.3, 0.05, 'Socrate')) } | ConvertTo-Json -Depth 5 -Compress
  $s = Statut { Invoke-RestMethod -Method Post -Uri "$base/rest/v1/notes_pages" -Headers $A.h -Body (Utf8 $ligne) }
  Verifier 'A insère une page pour sa note' ($s -eq 200) "statut $s"

  $ligneB = @{ note_id = $note.id; fichier = 0; page = 1; texte = 'pirate' } | ConvertTo-Json -Compress
  $s = Statut { Invoke-RestMethod -Method Post -Uri "$base/rest/v1/notes_pages" -Headers $B.h -Body (Utf8 $ligneB) }
  Verifier 'B ne peut pas insérer pour la note de A' ($s -in 401, 403) "statut $s"

  $lues = Invoke-RestMethod -Uri "$base/rest/v1/notes_pages?note_id=eq.$($note.id)&select=fichier,page,texte,mots" -Headers @{ apikey = $cle }
  Verifier 'Lecture publique (non connecté)' (@($lues).Count -eq 1 -and $lues[0].texte -eq 'Socrate') "lignes $(@($lues).Count)"

  $s = Statut { Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/notes_pages?note_id=eq.$($note.id)" -Headers $B.h }
  $toujours = Invoke-RestMethod -Uri "$base/rest/v1/notes_pages?note_id=eq.$($note.id)&select=page" -Headers @{ apikey = $cle }
  Verifier 'B ne peut pas supprimer la page de A' (@($toujours).Count -eq 1) "statut $s, restantes $(@($toujours).Count)"

  $s = Statut { Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/notes_pages?note_id=eq.$($note.id)" -Headers $A.h -Body (Utf8 '{"texte":"modifié"}') }
  $apres = Invoke-RestMethod -Uri "$base/rest/v1/notes_pages?note_id=eq.$($note.id)&select=texte" -Headers @{ apikey = $cle }
  Verifier 'Aucune modification possible (même par A)' ($apres[0].texte -eq 'Socrate') "statut $s, texte '$($apres[0].texte)'"
}
finally {
  Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/notes?id=eq.$($note.id)" -Headers $A.h | Out-Null
}
$restantes = Invoke-RestMethod -Uri "$base/rest/v1/notes_pages?note_id=eq.$($note.id)&select=page" -Headers @{ apikey = $cle } -ErrorAction SilentlyContinue
Verifier 'Suppression de la note -> pages supprimées (cascade)' (@($restantes).Count -eq 0) "restantes $(@($restantes).Count)"

if ($echecs) { Write-Output "$echecs échec(s)"; exit 1 } else { Write-Output 'Tous les tests de sécurité passent'; exit 0 }
