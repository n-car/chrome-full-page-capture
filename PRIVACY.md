# Informativa sulla privacy

Ultimo aggiornamento: 13 settembre 2026.

Full Page Capture elabora localmente nel browser le informazioni necessarie a produrre lo screenshot richiesto dall'utente. L'estensione non dispone di un backend, non integra analytics o telemetria e non vende, condivide o invia URL, contenuti delle pagine o immagini a servizi propri o di terze parti.

## Dati elaborati

Quando avvii una cattura, l'estensione usa temporaneamente:

- URL e dimensioni del tab attivo, per verificare la pagina e costruire il nome del file;
- struttura e rendering della pagina, per preparare lazy loading, font, scrollbar e animazioni;
- dati PNG dello screenshot, conservati in memoria soltanto durante la creazione del Blob e il download.

L'estensione non mantiene uno storico delle catture e non usa storage locale o remoto. Il file viene consegnato al gestore Download di Chrome. Eventuali sincronizzazioni, backup o caricamenti applicati alla cartella di destinazione dal browser, dal sistema operativo o da altri programmi dipendono dalle impostazioni dell'utente e non dall'estensione.

La preparazione lazy può attivare le normali richieste di rete della pagina aperta, per esempio il caricamento di immagini dal sito visitato. Queste richieste sono effettuate dalla pagina secondo le sue regole, cookie e informative; l'estensione non ne riceve una copia e non le inoltra altrove.

## Permessi

I permessi Chrome e il loro uso sono descritti nella guida [Architettura e permessi](docs/architecture.md#permessi). L'accesso avviene dopo un comando esplicito dell'utente ed è limitato al tab interessato dalla cattura.

## Modifiche e contatti

Le modifiche a questa informativa saranno pubblicate nel repository. Per domande prive di dati sensibili puoi aprire una issue. Per una vulnerabilità o una comunicazione riservata usa la [segnalazione privata di sicurezza](https://github.com/n-car/chrome-full-page-capture/security/advisories/new).
