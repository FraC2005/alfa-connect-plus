import { Card, Screen, T } from './ui';

/** Shown on web: the Stellantis APIs are only reachable from the phone app, so no data is shown there. */
export function UnsupportedPlatform() {
  return (
    <Screen title="Alfa Connect+">
      <Card>
        <T variant="h2">I dati reali sono disponibili solo da mobile</T>
        <T variant="secondary">
          Apri l’app sul telefono (Android o iOS, ad esempio con Expo Go) per vedere lo stato della tua auto.
        </T>
      </Card>
    </Screen>
  );
}
