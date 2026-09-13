# Test e verifica

[← Torna al README](../README.md)

## Pagina di test

[`test-page/index.html`](../test-page/index.html) è standalone e non fa parte del runtime dell'estensione. Contiene una pagina lunga con breakpoint visibili, hero, griglie, immagini SVG locali con `loading="lazy"`, elemento sticky, badge fixed, contenitore con scrollbar e animazioni CSS.

La pagina va servita via HTTP perché, per scelta di sicurezza, l'estensione rifiuta URL `file://`. Dalla root del repository esegui:

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

Con Node.js 20 o successivo, dalla root del repository esegui:

```bash
npm test
npm run verify
```

I test controllano la logica isolabile; `verify` valida struttura e JSON del manifest, file referenziati, icone, sintassi JavaScript e link locali della documentazione. Il comportamento grafico e l'integrazione reale con `chrome.debugger`, emulazione e download devono comunque essere confermati manualmente in Chrome con la checklist precedente.
