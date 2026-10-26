# Copilot instructions — Alfa Connect+

Leggi prima **`HANDOFF.md`** nella root: contiene stato del progetto, architettura, trappole note, backlog e regole. Qui sotto c'è il minimo indispensabile.

- App Expo **SDK 58** (React Native 0.88, React 19.3, Expo Router, TypeScript strict) per iOS, Android e web. Le API Expo cambiano a ogni SDK: verifica sempre su https://docs.expo.dev/versions/v58.0.0/ e https://docs.expo.dev/llms.txt invece di affidarti alla memoria.
- Clone di **My Alfa Connect** con stile **ispirato a My BMW** (tema scuro). Auto: **Alfa Romeo Giulia Veloce 2022, benzina** (niente batteria di trazione o ricarica).
- Interfaccia in **italiano**; formattazione con `src/utils/format.ts` (it-IT).
- Route solo in `src/app/`. Tab da `expo-router/js-tabs`.
- UI: usa sempre i token di `src/constants/theme.ts` (`C`, `S`, `R`) e le primitive di `src/components/ui.tsx`. Niente colori scritti a mano, niente loghi o asset BMW o Alfa Romeo.
- Dati: le schermate usano solo `useVehicle()` (`src/store/vehicle-store.tsx`). L'accesso al veicolo passa dall'interfaccia `VehicleService` (`src/services/types.ts`). Oggi è attiva l'implementazione `mockVehicleService` (PIN demo `1234`).
- Mai salvare credenziali, token o PIN in AsyncStorage o nel codice: usa `expo-secure-store`.
- La **fase 2** (API Stellantis non ufficiali) non va iniziata senza conferma esplicita del proprietario.
- Dipendenze solo con `npx expo install <pkg>`. Non modificare a mano `ios/` e `android/`.
- Lint: niente `setState` sincrono dentro `useEffect` (regola `react-hooks/set-state-in-effect`).
- Prima di chiudere un task: `npx tsc --noEmit` e `npx expo lint` devono passare.
