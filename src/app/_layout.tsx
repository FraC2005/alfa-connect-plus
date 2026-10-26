import { Ionicons } from '@expo/vector-icons';
import { DefaultTheme, ThemeProvider } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ComponentProps } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { PinSheet } from '@/components/pin-sheet';
import { C } from '@/constants/theme';
import { vehicleService } from '@/services';
import { VehicleProvider, useVehicle } from '@/store/vehicle-store';

SplashScreen.preventAutoHideAsync();

type IconName = ComponentProps<typeof Ionicons>['name'];

const theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: C.bg, card: C.bg, border: C.border, primary: C.accent, text: C.text },
};

// One thin-line (outline) icon per tab; the active tab is marked by colour and an underline, not by a filled icon.
const tabs: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Veicolo', icon: 'car-sport-outline' },
  { name: 'map', title: 'Mappa', icon: 'location-outline' },
  { name: 'warnings', title: 'Spie', icon: 'warning-outline' },
  { name: 'services', title: 'Servizi', icon: 'construct-outline' },
  { name: 'profile', title: 'Profilo', icon: 'person-outline' },
];

function AppTabs() {
  const { auth, notifications } = useVehicle();
  const unread = notifications.filter((n) => !n.read).length;

  if (auth === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  // Business rule: the tabs exist only for a signed-in user, the login screen only for a signed-out one.
  const signedIn = auth === 'signedIn';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: C.text,
        tabBarInactiveTintColor: C.textMuted,
        tabBarStyle: { backgroundColor: C.bg, borderTopColor: C.border, borderTopWidth: StyleSheet.hairlineWidth },
      }}>
      <Tabs.Protected guard={signedIn}>
        {tabs.map((t) => (
          <Tabs.Screen
            key={t.name}
            name={t.name}
            options={{
              title: t.title,
              tabBarAccessibilityLabel: t.title,
              tabBarBadge: t.name === 'profile' && unread > 0 ? unread : undefined,
              tabBarBadgeStyle: { backgroundColor: C.accent, color: C.onAccent, fontSize: 10 },
              tabBarIcon: ({ focused, color }) => (
                <View style={styles.tabIcon}>
                  <Ionicons name={t.icon} color={color as string} size={26} />
                  <View style={[styles.tabMarker, focused && styles.tabMarkerActive]} />
                </View>
              ),
            }}
          />
        ))}
      </Tabs.Protected>
      <Tabs.Protected guard={!signedIn}>
        <Tabs.Screen name="login" options={{ title: 'Accedi', tabBarStyle: { display: 'none' } }} />
      </Tabs.Protected>
    </Tabs>
  );
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <ThemeProvider value={theme}>
      <StatusBar style="dark" />
      <VehicleProvider service={vehicleService}>
        <AppTabs />
        <PinSheet />
      </VehicleProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  tabIcon: { alignItems: 'center', gap: 6 },
  tabMarker: { width: 22, height: 2, borderRadius: 1, backgroundColor: 'transparent' },
  tabMarkerActive: { backgroundColor: C.text },
});
