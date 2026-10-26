import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

import { C, R, S } from "@/constants/theme";
import { useVehicle } from "@/store/vehicle-store";

import { Button, SheetPanel, T } from "./ui";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

const titles = {
  lock: "Blocca",
  unlock: "Sblocca",
  lights: "Lampeggia luci",
  horn: "Luci e clacson",
  refresh: "Aggiorna",
};

export function PinSheet() {
  const { command, confirmCommand, submitPin, dismissCommand } = useVehicle();
  const [pin, setPin] = useState("");

  useEffect(() => {
    if (command?.phase !== "done") return;
    const t = setTimeout(dismissCommand, 1400);
    return () => clearTimeout(t);
  }, [command?.phase, dismissCommand]);

  const close = () => {
    setPin("");
    dismissCommand();
  };

  // The sheet takes exactly 4 digits and submits on the 4th (the official app's PIN length, UNVERIFIED);
  // a longer PIN cannot be entered here, which avoids sending a truncated, wrong PIN.
  const press = (k: string) => {
    if (k === "⌫") return setPin((p) => p.slice(0, -1));
    if (!k || pin.length >= 4) return;
    const next = pin + k;
    if (next.length < 4) return setPin(next);
    setPin("");
    submitPin(next);
  };

  return (
    <Modal
      visible={!!command}
      transparent
      animationType="slide"
      onRequestClose={command?.phase === "sending" ? () => {} : close}
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={command?.phase === "sending" ? undefined : close}
        />
        <SheetPanel style={styles.sheet}>
          {command?.phase === "confirm" ? (
            <>
              <T variant="h2">
                {command.cmd === "unlock" ? "Sbloccare l’auto?" : "Bloccare l’auto?"}
              </T>
              <T variant="secondary">
                Il comando verrà inviato all’auto dopo l’inserimento del PIN.
              </T>
              <Button label="Continua" onPress={confirmCommand} />
              <Button label="Annulla" kind="secondary" onPress={close} />
            </>
          ) : null}

          {command?.phase === "pin" ? (
            <>
              <T variant="h2">{titles[command.cmd]}</T>
              <T variant="secondary">
                Inserisci il PIN dei servizi remoti
              </T>
              <View
                style={styles.dots}
                accessible
                accessibilityLabel={`${pin.length} cifre inserite su 4`}>
                {[0, 1, 2, 3].map((i) => (
                  <View
                    key={i}
                    style={[styles.dot, i < pin.length && styles.dotFilled]}
                  />
                ))}
              </View>
              <View style={styles.pad}>
                {KEYS.map((k, i) => (
                  <Pressable
                    key={i}
                    disabled={!k}
                    accessibilityRole="button"
                    accessibilityLabel={k === "⌫" ? "Cancella" : k}
                    onPress={() => press(k)}
                    style={({ pressed }) => [
                      styles.key,
                      !k && { opacity: 0 },
                      pressed && { backgroundColor: C.surface2 },
                    ]}
                  >
                    <T style={styles.keyLabel}>{k}</T>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          {command?.phase === "sending" ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={C.accent} />
              <T variant="h2">Invio del comando…</T>
              <T variant="secondary">Comunicazione con il veicolo in corso</T>
            </View>
          ) : null}

          {command?.phase === "done" ? (
            <View style={styles.center}>
              <Ionicons name="checkmark-circle" size={56} color={C.success} />
              <T variant="h2">{command.message}</T>
            </View>
          ) : null}

          {command?.phase === "error" ? (
            <View style={styles.center}>
              <Ionicons name="close-circle" size={56} color={C.danger} />
              <T variant="h2">{command.message}</T>
              <Button label="Chiudi" kind="secondary" onPress={close} />
            </View>
          ) : null}
        </SheetPanel>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: C.scrim,
  },
  sheet: {
    paddingBottom: 48,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
  },
  dots: {
    flexDirection: "row",
    gap: S.lg,
    alignSelf: "center",
    marginVertical: S.lg,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: C.textSecondary,
  },
  dotFilled: { backgroundColor: C.text, borderColor: C.text },
  pad: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: S.md,
  },
  key: {
    width: "31%",
    height: 58,
    borderRadius: R.md,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  keyLabel: { fontSize: 24, fontWeight: "500" },
  center: { alignItems: "center", gap: S.md, paddingVertical: S.xxl },
});
