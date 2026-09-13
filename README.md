# Full Page Capture

[![CI](https://github.com/n-car/chrome-full-page-capture/actions/workflows/ci.yml/badge.svg)](https://github.com/n-car/chrome-full-page-capture/actions/workflows/ci.yml)
[Licenza MIT](LICENSE)

Estensione locale per Google Chrome che acquisisce screenshot PNG della viewport, dell'intero documento o di layout responsive simulati. È basata su Manifest V3, non usa framework, dipendenze runtime, servizi esterni o una fase di build.

Versione: **0.1.0**<br>
Requisito minimo: **Google Chrome 118**

## Installazione

Lo ZIP è un archivio sorgente pronto per il caricamento locale: non va aperto come un installer e non è un file `.crx`.

1. Scarica `full-page-capture-0.1.0.zip` dalla [release più recente](https://github.com/n-car/chrome-full-page-capture/releases/latest) ed estrailo.
2. Apri `chrome://extensions` in Chrome.
3. Attiva **Developer mode** / **Modalità sviluppatore** in alto a destra.
4. Premi **Load unpacked** / **Carica estensione non pacchettizzata**.
5. Seleziona la cartella estratta `full-page-capture`, cioè quella che contiene `manifest.json`.
6. Apri il menu Estensioni (icona a puzzle) e fissa **Full Page Capture** alla toolbar.

Per installare direttamente dal progetto, esegui gli stessi passaggi dal punto 2 e seleziona questa cartella. Non servono `npm install` o compilazione.

Quando aggiorni i file locali, torna in `chrome://extensions` e premi il pulsante di ricarica nella scheda dell'estensione.

## Utilizzo

Apri una normale pagina `http://` o `https://`, premi l'icona dell'estensione e scegli una cattura. Durante il lavoro i controlli vengono disabilitati e lo stato passa, per esempio, da `Preparing page…` a `Capturing PNG…`, `Downloading…` e `Done`. Anche il badge sulla toolbar segnala attività, successo o errore.

- **Capture Full Page** acquisisce tutto il documento alla larghezza corrente del tab, senza imporre un profilo responsive.
- **Capture Viewport** acquisisce soltanto l'area attualmente visibile.
- **Desktop 1440** acquisisce l'intero documento con viewport emulata da `1440 × 900` CSS px.
- **Desktop 1280** acquisisce l'intero documento con viewport emulata da `1280 × 900` CSS px.
- **Mobile 390** acquisisce l'intero documento con viewport emulata da `390 × 844` CSS px, modalità mobile e touch attivi.
- **Mobile 430** acquisisce l'intero documento con viewport emulata da `430 × 932` CSS px, modalità mobile e touch attivi.
- **Custom width** accetta una larghezza intera da 320 a 7680 px; **Capture** esegue una cattura full-page a quella larghezza. Le larghezze 390 e 430 usano il relativo profilo mobile; le altre usano un profilo desktop alto 900 CSS px.
- **Capture responsive set** esegue in sequenza 1440, 1280, 390 e 430 e scarica quattro PNG distinti. Lo stato mostra il progresso, ad esempio `Capturing 2/4 — 1280 px`.
- **Hide scrollbars**, attivo per impostazione predefinita, rende temporaneamente trasparenti scrollbar, tracce e thumb che Chrome espone alla cattura.
- **Disable animations**, attivo per impostazione predefinita, mette in pausa temporaneamente le animazioni e disabilita transizioni, smooth scrolling e cursori lampeggianti.

I profili responsive modificano davvero le metriche del dispositivo: le media query vengono ricalcolate prima dello screenshot. I preset e la larghezza custom usano `deviceScaleFactor: 1`, quindi hanno **DPR 1** e un CSS pixel corrisponde a un pixel dell'immagine. Full Page e Viewport non sovrascrivono invece le metriche del tab corrente.

Gli screenshot vengono avviati automaticamente nella cartella Download configurata in Chrome, in formato PNG e senza finestra “Salva con nome” richiesta dall'estensione. Se nelle preferenze del browser è attiva una richiesta globale per ogni download, Chrome può comunque mostrarla.

### Nomi dei file

Il formato è:

```text
hostname_percorso_tipo_YYYYMMDD-HHMMSS.png
```

Esempi:

```text
example.com_home_1440_20260913-142530.png
example.com_casi-reali_390_20260913-142530.png
example.com_documentazione_full-1365_20260913-142530.png
example.com_home_viewport-1365x768_20260913-142530.png
```

Hostname, percorso e tipo sono normalizzati per produrre nomi portabili; la homepage diventa `home`. In caso di collisione Chrome aggiunge un suffisso senza sovrascrivere il file esistente.

## Shortcut

La scorciatoia proposta è **Ctrl+Shift+Y** su Windows/Linux e **Command+Shift+Y** su macOS. Avvia direttamente **Capture Full Page** sul tab attivo con entrambe le opzioni di preparazione abilitate; non occorre aprire il popup.

Chrome può non assegnare una combinazione già occupata dal sistema o da un'altra estensione. Per verificarla o cambiarla:

1. apri `chrome://extensions/shortcuts`;
2. trova **Full Page Capture**;
3. assegna la combinazione desiderata a “Capture the current page at full height”.

## Come funziona

Per ogni acquisizione l'estensione:

1. verifica che il tab sia una pagina HTTP/HTTPS accessibile;
2. collega temporaneamente `chrome.debugger` al solo tab richiesto e memorizza documento e posizione di scroll originali;
3. inserisce l'eventuale CSS temporaneo per scrollbar e movimento;
4. per un preset responsive applica le metriche CDP e, sui due preset mobile, l'emulazione touch;
5. attende brevemente i font, forza temporaneamente `loading="eager"` sugli elementi lazy e, per il full-page, scorre il documento in modo controllato per favorire il caricamento del contenuto fuori schermo;
6. torna alla posizione precedente alla scansione, misura il layout e cattura il PNG;
7. rimuove touch e metriche emulati, ripristina lo scroll originale, elimina il CSS e scollega il debugger in un blocco di cleanup eseguito anche in caso di errore;
8. trasferisce la base64 a un documento offscreen a blocchi, la converte in un Blob URL, avvia il download e conserva l'URL solo fino al completamento;
9. revoca il Blob URL e chiude il documento offscreen quando non serve più.

La preparazione del lazy loading è intenzionalmente “best effort”: la scansione è limitata nel tempo e non trasforma la cattura in uno stitching di screenshot multipli.

### Perché CDP e non `captureVisibleTab`

La [Tabs API ufficiale](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab) descrive `chrome.tabs.captureVisibleTab()` come cattura della sola area visibile. Per ottenere un documento intero con quel metodo bisognerebbe scorrere, acquisire molti frame e unirli; questo introduce problemi con elementi sticky/fixed, pagine dinamiche e limiti di frequenza.

Questa estensione usa invece [`chrome.debugger`](https://developer.chrome.com/docs/extensions/reference/api/debugger), il trasporto ufficiale delle estensioni verso Chrome DevTools Protocol. Misura il documento con [`Page.getLayoutMetrics`](https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-getLayoutMetrics), applica le larghezze con [`Emulation.setDeviceMetricsOverride`](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setDeviceMetricsOverride) e usa [`Page.captureScreenshot`](https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-captureScreenshot) con `captureBeyondViewport: true`. Come l'attuale comando DevTools, lascia al renderer la cattura oltre la viewport senza costruire un clip manuale. Chrome produce così un unico screenshot full-page senza ridimensionamento finale né stitching.

L'API `debugger` è un permesso sensibile, ma qui l'attach avviene soltanto dopo un comando esplicito dell'utente e il detach è immediato nel cleanup.

## Permessi

Il manifest non dichiara `host_permissions`, `<all_urls>` o il permesso più ampio `tabs`.

Chrome può mostrare un avviso marcato per il permesso `debugger`, perché tecnicamente concede accesso agli strumenti di sviluppo del tab. Questa estensione lo usa soltanto dopo un comando esplicito, limitatamente ai domini CDP `Page` ed `Emulation`, e si scollega al termine di ogni cattura.

| Permesso | Perché è necessario |
| --- | --- |
| `activeTab` | Concede accesso temporaneo al tab corrente soltanto dopo il clic sull'estensione o l'uso della shortcut. Permette di leggere l'URL e preparare la pagina senza accesso permanente a tutti i siti. |
| `debugger` | Consente l'attach temporaneo al tab, la misurazione del layout, l'emulazione responsive e `Page.captureScreenshot`. |
| `downloads` | Avvia il salvataggio automatico del PNG con un nome leggibile. |
| `scripting` | Esegue la preparazione lazy-loading e inserisce/rimuove il CSS temporaneo per scrollbar e animazioni. |
| `offscreen` | Crea per il solo download un [documento invisibile](https://developer.chrome.com/docs/extensions/reference/api/offscreen) con accesso alle API DOM: ricompone a blocchi la base64 CDP, crea un Blob URL e lo mantiene valido fino alla conclusione del download. Evita grandi data URL nel service worker. |

## Privacy e sicurezza

- Tutta l'elaborazione avviene localmente in Chrome.
- Non ci sono tracking, analytics, telemetria, account o raccolta dati.
- L'estensione non invia URL, contenuti o screenshot a un proprio backend o a servizi di terze parti.
- Il PNG resta locale: viene trasformato in Blob URL dal documento offscreen e passato al gestore Download del browser.
- L'estensione non mantiene uno storico delle pagine o delle immagini.
- Ogni cattura inizia dopo un comando dell'utente; l'accesso di scripting è temporaneo tramite `activeTab` e il debugger viene scollegato nel cleanup.
- Debugger, CSS e metriche emulati vengono rimossi dopo ogni singola cattura, anche quando la cattura fallisce.
- La scansione lazy può attivare le normali richieste della pagina, per esempio il caricamento delle sue immagini; queste restano soggette al sito visitato e alle impostazioni del browser.

Il codice è breve e ispezionabile localmente prima del caricamento.

Consulta l'[informativa sulla privacy](PRIVACY.md) e [SECURITY.md](SECURITY.md). Non pubblicare in issue screenshot, URL o log contenenti informazioni riservate.

## Architettura

```text
full-page-capture/
├── manifest.json          metadati MV3, permessi, action e shortcut
├── service-worker.js      orchestrazione, stato, messaggi e badge
├── capture.js             piano di cattura, CDP, preparazione e cleanup del tab
├── download.js            trasferimento chunked, download e attesa dello stato finale
├── offscreen.html         documento DOM invisibile per preparare il Blob PNG
├── offscreen.js           ricezione chunk, Blob URL e gestione del suo ciclo di vita
├── popup.html             struttura accessibile del popup
├── popup.css              interfaccia tecnica/minimalista
├── popup.js               validazione UI e collegamento al service worker
├── icons/                 icone PNG 16, 32, 48 e 128 px
├── test-page/
│   └── index.html         pagina lunga standalone per test manuali
├── tests/                 test automatici della logica pura e dell'orchestrazione
├── tools/                 verifica del progetto e generazione icone
├── package.json           comandi di verifica, senza dipendenze runtime
├── README.md
└── LICENSE
```

Il popup comunica con il service worker mediante una porta runtime, così può ricevere aggiornamenti mentre è aperto. `service-worker.js` impedisce catture concorrenti e delega a `capture.js`; quest'ultimo concentra le operazioni che devono restare simmetriche tra setup e cleanup. Non viene iniettato un content script persistente.

## Pagina di test

`test-page/index.html` è standalone e non fa parte del runtime dell'estensione. Contiene una pagina lunga con breakpoint visibili, hero, griglie, immagini SVG locali con `loading="lazy"`, elemento sticky, badge fixed, contenitore con scrollbar e animazioni CSS.

La pagina va servita via HTTP perché, per scelta di sicurezza, l'estensione rifiuta URL `file://`. Dalla cartella `full-page-capture` esegui:

```bash
python3 -m http.server 8000 --directory test-page
```

Poi apri:

```text
http://localhost:8000/
```

Interrompi il server con `Ctrl+C`. Non è richiesta connessione Internet: immagini, stili e script sono inclusi nella pagina.

## Checklist di test manuale

Prima di iniziare, apri la pagina di test via HTTP e annota la posizione di scroll.

- [ ] Il popup si apre con stato `Ready`; Hide scrollbars e Disable animations sono attivi.
- [ ] **Capture Viewport** produce un PNG della sola area visibile e non include il marcatore finale della pagina se questo è fuori schermo.
- [ ] **Capture Full Page** include hero, tutte le sezioni lazy e il marcatore `END OF TEST PAGE`.
- [ ] **1440** produce un file con `_1440_` e nella pagina compare il profilo `DESKTOP · 4 COLONNE`.
- [ ] **1280** produce un file con `_1280_` e mantiene il profilo desktop.
- [ ] **390** e **430** producono due file distinti, mostrano `MOBILE · 1 COLONNA`, comprimono la navigazione e impilano le card.
- [ ] Una custom width da **1024** produce `_1024_`, mostra `TABLET · 2 COLONNE` e ricompone davvero il layout.
- [ ] Un valore custom fuori dall'intervallo 320–7680 viene rifiutato nel popup.
- [ ] **Capture responsive set** scarica quattro PNG nell'ordine 1440, 1280, 390, 430 e mostra il contatore 1/4…4/4.
- [ ] Le illustrazioni nella sezione Lazy gallery sono presenti anche se non erano state viste prima della cattura.
- [ ] In **Capture Viewport**, con Hide scrollbars attivo scompare la scrollbar del laboratorio; disattivandolo torna visibile.
- [ ] Con Disable animations attivo l'indicatore nella sezione Motion non ruota durante la preparazione; disattivandolo la pagina continua ad animarsi.
- [ ] Dopo ogni preset il badge fisso torna a mostrare la larghezza reale del browser, la posizione di scroll originale è ripristinata e DevTools può essere aperto normalmente.
- [ ] **Ctrl+Shift+Y** (Command+Shift+Y su macOS) avvia un full-page senza aprire il popup.
- [ ] Su `chrome://extensions` e Chrome Web Store compare un errore comprensibile e non parte alcun download.
- [ ] Con DevTools già collegato allo stesso tab viene mostrato l'errore relativo al debugger; chiudendolo la cattura torna a funzionare.

## Verifiche automatiche

Se Node.js è disponibile, dalla cartella dell'estensione esegui:

```bash
npm test
npm run verify
```

I test controllano la logica isolabile; `verify` valida struttura e JSON del manifest, file referenziati, icone e sintassi JavaScript. Il comportamento grafico e l'integrazione reale con `chrome.debugger`, emulazione e download devono comunque essere confermati manualmente in Chrome con la checklist precedente.

## Contribuire

Issue e pull request sono benvenute. Consulta [CONTRIBUTING.md](CONTRIBUTING.md) per ambiente locale, controlli richiesti e vincoli su permessi e privacy. Le modifiche pubblicate sono riepilogate nel [changelog](CHANGELOG.md).

## Limitazioni note

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

## Licenza

Distribuito con licenza MIT. Vedi [LICENSE](LICENSE).
