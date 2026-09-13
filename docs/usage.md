# Guida all'uso

[← Torna al README](../README.md)

## Avviare una cattura

Apri una normale pagina `http://` o `https://`, premi l'icona dell'estensione e scegli una cattura. Durante il lavoro i controlli vengono disabilitati e lo stato passa, per esempio, da `Preparing page…` a `Capturing PNG…`, `Downloading…` e `Done`. Anche il badge sulla toolbar segnala attività, successo o errore.

## Modalità disponibili

- **Capture Full Page** acquisisce tutto il documento alla larghezza corrente del tab, senza imporre un profilo responsive.
- **Capture Viewport** acquisisce soltanto l'area attualmente visibile.
- **Desktop 1440** acquisisce l'intero documento con viewport emulata da `1440 × 900` CSS px.
- **Desktop 1280** acquisisce l'intero documento con viewport emulata da `1280 × 900` CSS px.
- **Mobile 390** acquisisce l'intero documento con viewport emulata da `390 × 844` CSS px, modalità mobile e touch attivi.
- **Mobile 430** acquisisce l'intero documento con viewport emulata da `430 × 932` CSS px, modalità mobile e touch attivi.
- **Custom width** accetta una larghezza intera da 320 a 7680 px; **Capture** esegue una cattura full-page a quella larghezza. Le larghezze 390 e 430 usano il relativo profilo mobile; le altre usano un profilo desktop alto 900 CSS px.
- **Capture responsive set** esegue in sequenza 1440, 1280, 390 e 430 e scarica quattro PNG distinti. Lo stato mostra il progresso, ad esempio `Capturing 2/4 — 1280 px`.

## Opzioni di preparazione

- **Hide scrollbars**, attivo per impostazione predefinita, rende temporaneamente trasparenti scrollbar, tracce e thumb che Chrome espone alla cattura.
- **Disable animations**, attivo per impostazione predefinita, mette in pausa temporaneamente le animazioni e disabilita transizioni, smooth scrolling e cursori lampeggianti.

I profili responsive modificano davvero le metriche del dispositivo: le media query vengono ricalcolate prima dello screenshot. I preset e la larghezza custom usano `deviceScaleFactor: 1`, quindi hanno DPR 1 e un CSS pixel corrisponde a un pixel dell'immagine. Full Page e Viewport non sovrascrivono invece le metriche del tab corrente.

## Download e nomi dei file

Gli screenshot vengono avviati automaticamente nella cartella Download configurata in Chrome, in formato PNG e senza finestra “Salva con nome” richiesta dall'estensione. Se nelle preferenze del browser è attiva una richiesta globale per ogni download, Chrome può comunque mostrarla.

Il formato del nome è:

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

Consulta anche le [limitazioni note](limitations.md), in particolare per pagine molto grandi, contenuti dinamici e scrollbar nelle catture full-page.
