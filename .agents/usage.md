# Agent model usage

Rows record what the runtime reported. The runtime gives one total token count per sub-agent (no input/output split) and does not report the model of sub-agents started without a `model` override, so those values are left explicit rather than estimated. When an agent was resumed, the last reported total is used and it is probably cumulative.

| Agent | Usage Count | Model | Input & Output Tokens |
|---|---:|---|---|
| Planner (primary, session 20261022) | 1 | Sonnet 5.5 (`claude-sonnet-5-5`) | not reported |
| Coder: spike API Stellantis (20261022-connect-real-car) | 1 | not reported (inherited default) | 131,688 total, split not reported |
| Coder: sonda `probe-uconnect.mjs` + fix review (20261022-connect-real-car) | 2 | not reported (inherited default) | 138,449 total (last value), split not reported |
| Coder: foto Giulia, integrazione e ritocchi (20261022-car-model-photos) | 3 | not reported (inherited default) | 169,514 total (last value), split not reported |
| Coder: spike liquid glass (20261022-liquid-glass) | 1 | not reported (inherited default) | 111,078 total, split not reported |
| Coder: dati reali, RealVehicleService e correzioni (20261022-real-data) | 2 | not reported (inherited default) | 288,642 total (last value), split not reported |
| Reviewer: sonda `probe-uconnect.mjs` (20261022-connect-real-car) | 2 | not reported (inherited default) | 129,322 total (last value), split not reported |
| Reviewer: integrazione foto (20261022-car-model-photos) | 1 | not reported (inherited default) | 57,524 total, split not reported |
| Reviewer: dati reali e credenziali, 2 revisioni (20261022-real-data) | 2 | not reported (inherited default) | 190,481 total (last value), split not reported |
| Documentor: HANDOFF.md foto e fase 2 (20261022-car-model-photos) | 1 | Haiku (`haiku` override, exact version not reported) | 60,583 total, split not reported |
| Documentor: HANDOFF.md dati reali (20261022-real-data) | 1 | Sonnet (`sonnet` override, exact version not reported) | 108,183 total, split not reported |
| Coder: ricerca foto Giulia Veloce grigia (20261022-car-photo-veloce) | 1 | not reported (inherited default) | 146,894 total, split not reported |
| Coder: restyle chiaro stile My BMW e correzioni (20261022-bmw-style-ui) | 3 | not reported (inherited default) | 225,356 total (last value), split not reported |
| Reviewer: restyle chiaro, 2 revisioni (20261022-bmw-style-ui) | 2 | not reported (inherited default) | 136,152 total (last value), split not reported |
| Documentor: HANDOFF.md stile chiaro (20261022-bmw-style-ui) | 1 | Sonnet (`sonnet` override, exact version not reported) | 161454 total, split not reported |
| Coder: dati reali + proxy web + raw mode + chiave Maps (20261022-real-data, 20261022-web-proxy) | 8 | not reported (inherited default) | 449905 total (last value), split not reported |
| Reviewer: proxy web, più revisioni (20261022-web-proxy) | 3 | not reported (inherited default) | 198370 total (last value), split not reported |
| Coder: mappa reale poi semplificata (20261022-real-map) | 3 | not reported (inherited default) | 161454 total (last value), split not reported |
| Reviewer: mappa reale (20261022-real-map) | 1 | not reported (inherited default) | 111953 total, split not reported |
| Coder: carosello pneumatici/carburante + rimozione Scadenze (20261022-services-carousel) | 2 | not reported (inherited default) | 141934 total (last value), split not reported |
| Reviewer: fusione carosello + storia Giulia (20261022-services-carousel) | 1 | not reported (inherited default) | 86686 total, split not reported |
| Coder: storia Giulia, correzione motore, espansione 952 (20261022-giulia-history) | 4 | not reported (inherited default) | 115011 total (last value), split not reported |
| Reviewer: fact-check storia Giulia, 2 revisioni (20261022-giulia-history) | 2 | not reported (inherited default) | 70928 total (last value), split not reported |
| Documentor: HANDOFF.md sincronizzazione finale (20261022-handoff-sync) | 1 | Sonnet (`sonnet` override, exact version not reported) | 117040 total, split not reported |
| Coder: spike refresh vhr, analisi (20261023-vhr-refresh-spike) | 1 | not reported (inherited default) | 80361 total, split not reported |
| Coder: dati/store spie veicolo da vhr (20261023-vehicle-warnings) | 1 | not reported (inherited default) | 138792 total, split not reported |
| Reviewer: dati/store spie veicolo, approvato (20261023-vehicle-warnings) | 1 | not reported (inherited default) | 66157 total, split not reported |
| Coder: schermata Spie al posto di Viaggi (20261023-vehicle-warnings) | 1 | not reported (inherited default) | 83341 total, split not reported |
| Reviewer: schermata Spie, approvato (20261023-vehicle-warnings) | 1 | not reported (inherited default) | 74374 total, split not reported |
| Documentor: HANDOFF.md spie veicolo (20261023-vehicle-warnings) | 1 | not reported (inherited default) | 84552 total, split not reported |
| Coder: dati diagnostici reali in Spie (20261023-spie-dati-diagnostici) | 1 | not reported (inherited default) | 81035 total, split not reported |
| Coder: mappa nativa v2 + split web (20261023-native-map-v2) | 1 | not reported (inherited default) | 121186 total, split not reported |
| Reviewer: dati diagnostici in Spie, changes_requested (20261023-spie-dati-diagnostici) | 1 | not reported (inherited default) | 68129 total, split not reported |
| Reviewer: mappa nativa v2, approvato (20261023-native-map-v2) | 1 | not reported (inherited default) | 65891 total, split not reported |
| Coder: fix tagliando scaduto in Spie (20261023-spie-dati-diagnostici) | 1 | not reported (inherited default) | 60027 total, split not reported |
| Reviewer: dati diagnostici in Spie, 2a revisione, approvato (20261023-spie-dati-diagnostici) | 1 | not reported (inherited default) | 59667 total, split not reported |
| Documentor: HANDOFF.md mappa nativa + dati diagnostici (20261023-handoff-sync-2) | 1 | not reported (inherited default) | 80410 total, split not reported |
| Coder: ingrandire mappa (20261023-map-bigger) | 1 | not reported (inherited default) | 54923 total, split not reported |
| Reviewer: mappa ingrandita, approvato (20261023-map-bigger) | 1 | not reported (inherited default) | 52284 total, split not reported |
| Coder: declutter Servizi + schema pneumatici Spie (20261023-servizi-declutter) | 1 | not reported (inherited default) | 80676 total, split not reported |
| Reviewer: declutter Servizi + schema pneumatici, approvato (20261023-servizi-declutter) | 1 | not reported (inherited default) | 60147 total, split not reported |
| Coder: modellino 3D interattivo (20261023-car-3d-model) | 1 | not reported (inherited default) | 209468 total, split not reported |
| Reviewer: modellino 3D interattivo, approvato (20261023-car-3d-model) | 1 | not reported (inherited default) | 62625 total, split not reported |
| Documentor: HANDOFF.md mappa/spie/servizi/3D (20261023-handoff-sync-3) | 1 | not reported (inherited default) | 94136 total, split not reported |
| Coder: fix crash three.js process.emitWarning, incl. revisione interna (20261023-car-3d-fix-crash) | 1 | not reported (inherited default) | 64608 total, split not reported |
| Coder: fix crash transmission materials 3D, incl. revisione interna (20261023-car-3d-fix-crash-2) | 1 | not reported (inherited default) | 68274 total, split not reported |
| Coder: redesign mappa grande/chip/ricerca (20261023-map-redesign) | 1 | not reported (inherited default) | 111956 total, split not reported |
| Reviewer: redesign mappa, approvato (20261023-map-redesign) | 1 | not reported (inherited default) | 62602 total, split not reported |
| Documentor: HANDOFF.md mappa redesign + fix 3D (20261023-handoff-sync-4) | 1 | not reported (inherited default) | 107927 total, split not reported |
| Coder: ricerca a chip + rimuovi + fix fluidità mappa (20261023-map-polish) | 1 | not reported (inherited default) | 106248 total, split not reported |
| Reviewer: ricerca a chip + rimuovi + fluidità, approvato (20261023-map-polish) | 1 | not reported (inherited default) | 73153 total, split not reported |
| Coder: fix profondità/charset itemKey vhr (20261022-probe-vhr-keys) | 1 | not reported (inherited default) | 414299 total, split not reported |
| Reviewer: fix profondità/charset itemKey vhr (20261022-probe-vhr-keys) | 1 | not reported (inherited default) | 78155 total, split not reported |
| Coder: rivelare valore spie vhr note (20261022-probe-vhr-keys) | 1 | not reported (inherited default) | 85721 total, split not reported |
| Reviewer: valore spie vhr, 1a revisione (20261022-probe-vhr-keys) | 1 | not reported (inherited default) | 81857 total, split not reported |
| Coder: fix guard VIN/timestamp + whitelist (20261022-probe-vhr-keys) | 1 | not reported (inherited default) | 81549 total, split not reported |
| Reviewer: valore spie vhr, 2a revisione, approvato (20261022-probe-vhr-keys) | 1 | not reported (inherited default) | 76994 total, split not reported |
