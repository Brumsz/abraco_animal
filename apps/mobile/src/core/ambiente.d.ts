/**
 * Variáveis públicas do Expo (`EXPO_PUBLIC_*`): o Metro as substitui pelo
 * valor no build. Nunca coloque segredo aqui — elas vão dentro do app.
 */
declare const process: {
  readonly env: {
    readonly EXPO_PUBLIC_API_URL?: string;
  };
};
