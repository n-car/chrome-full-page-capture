# Full Page Capture

[![CI](https://github.com/n-car/chrome-full-page-capture/actions/workflows/ci.yml/badge.svg)](https://github.com/n-car/chrome-full-page-capture/actions/workflows/ci.yml)
[Licenza MIT](LICENSE)

Estensione open source per Google Chrome che acquisisce screenshot PNG della viewport, dell'intero documento o di layout responsive simulati. È basata su Manifest V3 e non usa framework, dipendenze runtime, servizi esterni o una fase di build.

- Cattura full-page o della sola area visibile.
- Preset desktop e mobile, larghezza personalizzata e set responsive completo.
- Preparazione best-effort di immagini lazy, font, scrollbar e animazioni.
- Elaborazione e download locali, senza tracking o telemetria.

Versione: **0.1.0**<br>
Requisito minimo: **Google Chrome 118**

## Installazione rapida

Lo ZIP va estratto: non è un installer e non è un file `.crx`.

1. Scarica `full-page-capture-0.1.0.zip` dalla [release più recente](https://github.com/n-car/chrome-full-page-capture/releases/latest) ed estrailo.
2. Apri `chrome://extensions` in Chrome.
3. Attiva **Developer mode** / **Modalità sviluppatore**.
4. Premi **Load unpacked** / **Carica estensione non pacchettizzata**.
5. Seleziona la cartella estratta `full-page-capture`, cioè quella che contiene `manifest.json`.
6. Apri il menu Estensioni e fissa **Full Page Capture** alla toolbar.

Per usare direttamente il clone del repository, seleziona questa root in **Load unpacked**. Non servono `npm install` o compilazione. Dopo una modifica locale, usa il pulsante di ricarica nella scheda dell'estensione.

## Uso rapido

Apri una normale pagina `http://` o `https://`, premi l'icona dell'estensione e scegli:

- **Capture Full Page** per l'intero documento;
- **Capture Viewport** per la sola area visibile;
- un preset **Desktop** o **Mobile** per una larghezza responsive;
- **Custom width** per una larghezza da 320 a 7680 px;
- **Capture responsive set** per ottenere in sequenza 1440, 1280, 390 e 430 px.

Gli screenshot PNG vengono salvati nella cartella Download configurata in Chrome.

### Avviso sul permesso `debugger`

Chrome può mostrare un avviso marcato perché il permesso `debugger` concede tecnicamente accesso agli strumenti di sviluppo del tab. L'estensione lo usa soltanto dopo un comando esplicito, limitatamente ai domini CDP `Page` ed `Emulation`, e si scollega dopo ogni cattura.

## Documentazione

- [Guida completa all'uso](docs/usage.md)
- [Architettura e permessi](docs/architecture.md)
- [Test manuali e automatici](docs/testing.md)
- [Limitazioni note](docs/limitations.md)
- [Informativa sulla privacy](PRIVACY.md)
- [Policy di sicurezza](SECURITY.md)
- [Guida per contribuire](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

## Sviluppo

Il progetto non ha dipendenze. Con Node.js 20 o successivo:

```bash
npm test
npm run verify
```

I test coprono la logica isolabile; l'integrazione con Chrome va verificata anche con la [checklist manuale](docs/testing.md#checklist-di-test-manuale).

## Privacy e sicurezza

L'estensione non dispone di un backend e non invia URL, contenuti o screenshot a servizi propri o di terze parti. La preparazione lazy può comunque attivare le normali richieste della pagina visitata. Consulta [PRIVACY.md](PRIVACY.md) per i dettagli e usa la [segnalazione privata](https://github.com/n-car/chrome-full-page-capture/security/advisories/new) per eventuali vulnerabilità.

## Contribuire

Issue e pull request sono benvenute. Prima di intervenire, consulta [CONTRIBUTING.md](CONTRIBUTING.md).

## Licenza

Distribuito con licenza MIT. Vedi [LICENSE](LICENSE).
