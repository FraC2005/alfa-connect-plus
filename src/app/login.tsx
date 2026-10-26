import { useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';

import { Button, Card, Input, Screen, T } from '@/components/ui';
import { C, S } from '@/constants/theme';
import { useVehicle } from '@/store/vehicle-store';

/** Plain sign-in form for the My Alfa Connect account. One tap on "Accedi" = one login attempt. */
export default function LoginScreen() {
  const { auth, signIn, retryRestore, signOut, signingIn, authError } = useVehicle();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const canSubmit = email.trim() !== '' && password !== '' && !signingIn;

  // Credentials are stored but the launch sign-in failed for a non-credential reason: retry, don't retype.
  if (auth === 'offline') {
    return (
      <Screen title="Connessione" subtitle="Non è stato possibile accedere">
        <Card>
          {authError ? <T style={{ color: C.danger }}>{authError}</T> : null}
          {signingIn ? <ActivityIndicator color={C.accent} /> : null}
          <Button label="Riprova" icon="refresh" disabled={signingIn} onPress={retryRestore} />
          <Button label="Usa un altro account" kind="secondary" disabled={signingIn} onPress={signOut} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="Accedi" subtitle="Usa l’account di My Alfa Connect">
      <Card>
        <Input
          label="Email"
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          value={email}
          onChangeText={setEmail}
        />
        <Input
          label="Password"
          autoCapitalize="none"
          autoComplete="current-password"
          autoCorrect={false}
          secureTextEntry
          textContentType="password"
          value={password}
          onChangeText={setPassword}
        />
        {authError ? <T style={{ color: C.danger }}>{authError}</T> : null}
        {signingIn ? (
          <View style={{ alignItems: 'center', padding: S.sm }}>
            <ActivityIndicator color={C.accent} />
          </View>
        ) : null}
        <Button label="Accedi" icon="log-in" disabled={!canSubmit} onPress={() => signIn(email, password)} />
        <T variant="caption">
          {Platform.OS === 'web'
            ? 'Email e password vengono inviate solo al proxy locale su questo computer e restano nella sua memoria; il browser non le salva.'
            : 'Le credenziali restano su questo telefono, nell’archivio sicuro.'}
        </T>
      </Card>
    </Screen>
  );
}
