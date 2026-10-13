$fixes = [ordered]@{
    "durchgefÃ¼hrt" = "durchgeführt"
    "geÃ¤ndert" = "geändert"
    "rÃ¼ckgÃ¤ngig" = "rückgängig"
    "RÃ¼ckgÃ¤ngig" = "Rückgängig"
    "fÃ¼r" = "für"
    "FunktionalitÃ¤t" = "Funktionalität"
    "zurÃ¼ckverschoben" = "zurückverschoben"
    "ursprÃ¼nglichen" = "ursprünglichen"
    "Ã¤" = "ä"
    "Ã¼" = "ü"
    "Ã¶" = "ö"
    "ÃŸ" = "ß"
    "Â·" = "·"
    "AuflÃ¶sungs" = "Auflösungs"
}

$files = @(
    "y:\projekte2026\website\remix_--portfolio_feed_editor_ver10\src\App.tsx",
    "Y:\projekte2026\website\portfolio-backend-handoff\src\App.tsx"
)

foreach ($f in $files) {
    $text = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
    foreach ($key in $fixes.Keys) {
        $text = $text.Replace($key, $fixes[$key])
    }
    [System.IO.File]::WriteAllText($f, $text, [System.Text.Encoding]::UTF8)
}

Write-Output "Encoding fixed in both App.tsx files"
