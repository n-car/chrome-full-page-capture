# Architettura e permessi

[← Torna al README](../README.md)

## Flusso di cattura

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

La preparazione del lazy loading è intenzionalmente best effort: la scansione è limitata nel tempo e non trasforma la cattura in uno stitching di screenshot multipli.

## Perché CDP e non `captureVisibleTab`

La [Tabs API ufficiale](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab) descrive `chrome.tabs.captureVisibleTab()` come cattura della sola area visibile. Per ottenere un documento intero con quel metodo bisognerebbe scorrere, acquisire molti frame e unirli; questo introduce problemi con elementi sticky/fixed, pagine dinamiche e limiti di frequenza.

Questa estensione usa invece [`chrome.debugger`](https://developer.chrome.com/docs/extensions/reference/api/debugger), il trasporto ufficiale delle estensioni verso Chrome DevTools Protocol. Misura il documento con [`Page.getLayoutMetrics`](https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-getLayoutMetrics), applica le larghezze con [`Emulation.setDeviceMetricsOverride`](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setDeviceMetricsOverride) e usa [`Page.captureScreenshot`](https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-captureScreenshot) con `captureBeyondViewport: true`. Come l'attuale comando DevTools, lascia al renderer la cattura oltre la viewport senza costruire un clip manuale. Chrome produce così un unico screenshot full-page senza ridimensionamento finale né stitching.

L'API `debugger` è un permesso sensibile, ma qui l'attach avviene soltanto dopo un comando esplicito dell'utente e il detach è immediato nel cleanup.

## Permessi

Il [manifest](../manifest.json) non dichiara `host_permissions`, `<all_urls>` o il permesso più ampio `tabs`.

Chrome può mostrare un avviso marcato per il permesso `debugger`, perché tecnicamente concede accesso agli strumenti di sviluppo del tab. Questa estensione lo usa soltanto dopo un comando esplicito, limitatamente ai domini CDP `Page` ed `Emulation`, e si scollega al termine di ogni cattura.

| Permesso | Perché è necessario |
| --- | --- |
| `activeTab` | Concede accesso temporaneo al tab corrente soltanto dopo il clic sull'estensione o l'uso della shortcut. Permette di leggere l'URL e preparare la pagina senza accesso permanente a tutti i siti. |
| `debugger` | Consente l'attach temporaneo al tab, la misurazione del layout, l'emulazione responsive e `Page.captureScreenshot`. |
| `downloads` | Avvia il salvataggio automatico del PNG con un nome leggibile. |
| `scripting` | Esegue la preparazione lazy-loading e inserisce/rimuove il CSS temporaneo per scrollbar e animazioni. |
| `offscreen` | Crea per il solo download un [documento invisibile](https://developer.chrome.com/docs/extensions/reference/api/offscreen) con accesso alle API DOM: ricompone a blocchi la base64 CDP, crea un Blob URL e lo mantiene valido fino alla conclusione del download. Evita grandi data URL nel service worker. |

Per la gestione dei dati consulta l'[informativa sulla privacy](../PRIVACY.md); per le vulnerabilità consulta la [policy di sicurezza](../SECURITY.md).

## Struttura del progetto

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
├── test-page/             pagina standalone per test manuali
├── tests/                 test automatici della logica e dell'orchestrazione
├── tools/                 verifica del progetto e generazione icone
├── docs/                  guide tematiche
├── package.json           comandi di verifica, senza dipendenze runtime
└── README.md              panoramica e accesso alla documentazione
```

Il popup comunica con il service worker mediante una porta runtime, così può ricevere aggiornamenti mentre è aperto. `service-worker.js` impedisce catture concorrenti e delega a `capture.js`; quest'ultimo concentra le operazioni che devono restare simmetriche tra setup e cleanup. Non viene iniettato un content script persistente.
