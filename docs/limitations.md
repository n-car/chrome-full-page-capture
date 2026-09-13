# Limitazioni note

[← Torna al README](../README.md)

- Sono supportate soltanto pagine principali `http://` e `https://`. URL `chrome://`, `edge://`, `file://`, `data:`, pagine di altre estensioni e Chrome Web Store vengono rifiutati.
- Chrome, policy aziendali o regole DLP possono impedire l'attach o gli screenshot.
- DevTools o un altro debugger non possono usare contemporaneamente lo stesso tab. Chiudi DevTools e riprova.
- Pagine estremamente alte o larghe possono superare limiti di memoria, texture o codifica PNG del browser.
- Il caricamento lazy è best effort: infinite scroll, contenuti caricati solo dopo interazioni, timeout lunghi o virtualizzazione aggressiva possono lasciare aree incomplete.
- La preparazione scorre il documento principale, non ogni contenitore scrollabile interno.
- Iframe cross-origin possono essere renderizzati nello screenshot, ma l'estensione non può necessariamente prepararne font, lazy loading, scrollbar o animazioni.
- Video, canvas, WebGL, mappe, contenuti protetti/DRM e animazioni controllate via JavaScript possono restituire un frame vuoto, incompleto o variabile.
- Elementi fixed/sticky, popup, cursori, cookie banner e layout che reagiscono allo scroll possono apparire in modo diverso rispetto a una visita manuale.
- Nelle catture full-page Chrome nasconde già le scrollbar a livello di renderer quando usa `captureBeyondViewport`; per questo, anche disattivando Hide scrollbars, alcune scrollbar possono restare assenti. Il confronto on/off è verificabile in modo affidabile con **Capture Viewport**.
- La pagina resta attiva durante la scansione; script del sito possono osservare scroll e resize. Lo scroll, le metriche CDP e il CSS temporaneo vengono ripristinati, ma eventuali effetti applicativi causati dal sito non sono annullabili in modo generico.
- Se il tab viene chiuso o navigato durante l'operazione, la cattura termina con errore; gli step successivi di un Capture set non vengono eseguiti.
