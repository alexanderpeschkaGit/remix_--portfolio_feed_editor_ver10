const fs = require('fs');

const files = [
    "Y:\\projekte2026\\website\\remix_--portfolio_feed_editor_ver10\\src\\App.tsx",
    "Y:\\projekte2026\\website\\portfolio-backend-handoff\\src\\App.tsx"
];

for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    const preciseFixes = {
        'durchgefÃ¼hrt': 'durchgeführt',
        'durchgefǬhrt': 'durchgeführt',
        'geÃ¤ndert': 'geändert',
        'gendert': 'geändert',
        'rÃ¼ckgÃ¤ngig': 'rückgängig',
        'rǬckgngig': 'rückgängig',
        'RÃ¼ckgÃ¤ngig': 'Rückgängig',
        'RǬckgngig': 'Rückgängig',
        'fÃ¼r': 'für',
        'fǬr': 'für',
        'FunktionalitÃ¤t': 'Funktionalität',
        'Funktionalitt': 'Funktionalität',
        'zurÃ¼ckverschoben': 'zurückverschoben',
        'zurǬckverschoben': 'zurückverschoben',
        'ursprÃ¼nglichen': 'ursprünglichen',
        'ursprǬnglichen': 'ursprünglichen',
        'AuflÃ¶sungs': 'Auflösungs',
        'Auflsungs': 'Auflösungs',
        'ffnen': 'öffnen',
        'Mchtest': 'Möchtest',
        'Luft': 'Läuft',
        'besttigt': 'bestätigt',
        'whrend': 'während',
        'primre': 'primäre',
        'spter': 'später',
        'schlieYen': 'schließen',
        'zusammenfǬhren': 'zusammenführen',
        'zusammengefǬhrt': 'zusammengeführt',
        'obrige': 'Übrige',
        'PrǬfen': 'Prüfen',
        'ungǬltig': 'ungültig',
        'eingefǬgt': 'eingefügt',
        'verfǬgbar': 'verfügbar',
        'hinzugefǬgt': 'hinzugefügt',
        'mǬssen': 'müssen',
        'Ã¤': 'ä',
        'Ã¼': 'ü',
        'Ã¶': 'ö',
        'ÃŸ': 'ß',
        'Â·': '·'
    };
    
    for (const [bad, good] of Object.entries(preciseFixes)) {
        content = content.split(bad).join(good);
    }
    
    content = content.replace(/fǬr /g, 'für ');
    
    fs.writeFileSync(file, content, 'utf8');
}
console.log('Encoding fixed cleanly');
