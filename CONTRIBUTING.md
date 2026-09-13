# Contribuire

Segnalazioni e pull request sono benvenute. Prima di una modifica ampia, apri una issue per concordare obiettivo e impatto.

## Ambiente locale

Il progetto non richiede dipendenze o una fase di build. Servono Node.js 20 o successivo per i controlli automatici e Google Chrome 118 o successivo per le prove reali.

```bash
git clone https://github.com/n-car/chrome-full-page-capture.git
cd chrome-full-page-capture
npm test
npm run verify
```

Per caricare la versione di sviluppo, apri `chrome://extensions`, abilita la modalità sviluppatore e seleziona la root del repository con **Load unpacked**.

## Pull request

- Mantieni il progetto privo di dipendenze runtime, salvo necessità chiaramente motivata.
- Non aggiungere analytics, telemetria, richieste esterne o persistenza dei contenuti acquisiti.
- Ogni nuovo permesso Chrome deve essere indispensabile, documentato e limitato allo scopo.
- Mantieni sincronizzate le versioni in `manifest.json` e `package.json`.
- Aggiungi o aggiorna i test per le modifiche alla logica.
- Esegui `npm test` e `npm run verify`, poi prova in Chrome i flussi interessati.
- Non includere screenshot, URL o log contenenti dati riservati.

Contribuendo, accetti che il tuo lavoro sia distribuito con la licenza MIT del progetto.
