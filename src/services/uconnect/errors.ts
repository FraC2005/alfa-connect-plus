/**
 * Errors of the Uconnect client, each with the Italian message shown to the owner.
 * Messages never carry URLs, response bodies or credentials.
 */

export type UconnectErrorKind =
  | 'invalid_credentials'
  | 'account_locked'
  | 'session_expired'
  | 'session_rejected'
  | 'network'
  | 'vehicle_unreachable'
  | 'unavailable'
  | 'not_found'
  | 'no_vehicle'
  | 'pin_wrong'
  | 'pin_locked'
  | 'command_unavailable'
  | 'no_confirmation'
  | 'proxy_unreachable';

const MESSAGES: Record<UconnectErrorKind, string> = {
  invalid_credentials: 'Credenziali non valide. Controlla email e password.',
  account_locked: 'Account bloccato temporaneamente per troppi tentativi. Attendi qualche minuto prima di riprovare.',
  session_expired: 'Sessione scaduta. Accedi di nuovo.',
  session_rejected: 'Il server ha rifiutato la sessione appena creata. Controlla data e ora del telefono e riprova.',
  network: 'Rete assente. Controlla la connessione e riprova.',
  vehicle_unreachable: 'Auto non raggiungibile. Riprova più tardi.',
  unavailable: 'Servizio non disponibile. Riprova più tardi.',
  not_found: 'Dato non disponibile per questa auto.',
  no_vehicle: 'Nessun veicolo trovato su questo account.',
  pin_wrong: 'PIN non corretto',
  pin_locked: 'PIN bloccato per troppi tentativi. Sbloccalo dall’app ufficiale.',
  command_unavailable: 'Comando non disponibile per questa auto',
  proxy_unreachable: 'Proxy locale non raggiungibile. Avvialo da terminale, nella cartella del progetto, con: npm run web:real',
  no_confirmation: 'Nessuna conferma dall’auto. Controlla lo stato prima di riprovare.',
};

export class UconnectError extends Error {
  readonly kind: UconnectErrorKind;
  readonly status?: number;

  /** `detail` is a short non-secret technical hint (HTTP status, error code) appended to the message. */
  constructor(kind: UconnectErrorKind, options: { status?: number; detail?: string } = {}) {
    super(options.detail ? `${MESSAGES[kind]} (${options.detail})` : MESSAGES[kind]);
    this.name = 'UconnectError';
    this.kind = kind;
    this.status = options.status;
  }
}

/**
 * The stored credentials are no longer accepted (or missing): the user must sign in again.
 * 'session_rejected' is deliberately NOT here: it follows a successful login, so the password is fine.
 */
export const isCredentialRejection = (e: unknown) =>
  e instanceof UconnectError && (e.kind === 'invalid_credentials' || e.kind === 'account_locked' || e.kind === 'session_expired');

/** Italian message for any thrown value. */
export const errorMessage = (e: unknown) => (e instanceof UconnectError ? e.message : MESSAGES.unavailable);
