/**
 * Erros do app no Sentry (plano gratuito). Desligado sem EXPO_PUBLIC_SENTRY_DSN
 * e sempre em desenvolvimento (__DEV__). O DSN não é segredo: só permite ENVIAR.
 *
 * Seção 6 (nada de CPF, senha, token ou e-mail) e MASVS: sem captura de tela,
 * sem hierarquia de views, sem dados de usuário, sem breadcrumbs do console e
 * textos redigidos antes do envio.
 */
import * as Sentry from '@sentry/react-native';

import { limparEventoApp } from './sentry-limpeza';

export function iniciarSentry(dsn: string | undefined, ambiente: string): void {
  if (!dsn || __DEV__) return;
  Sentry.init({
    dsn,
    environment: ambiente,
    // sendDefaultPii fica no padrão (false): IP, cookies e usuário não são enviados.
    attachScreenshot: false,
    attachViewHierarchy: false,
    reportAccessibilityIdentifier: false,
    // Só erros: rastreamento de desempenho do app fica desligado (cota gratuita).
    tracesSampleRate: 0,
    beforeSend: (evento) => limparEventoApp(evento),
    beforeBreadcrumb: (b) => (b.category === 'console' ? null : b),
  });
}
