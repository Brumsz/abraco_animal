/**
 * Variáveis públicas do Expo (`EXPO_PUBLIC_*`): o Metro as substitui pelo
 * valor no build. Nunca coloque segredo aqui — elas vão dentro do app.
 */
declare const process: {
  readonly env: {
    readonly EXPO_PUBLIC_API_URL?: string;
    readonly EXPO_PUBLIC_INSTAGRAM_URL?: string;
  };
};

/** Imagens importadas: o Metro troca pelo identificador numérico do recurso. */
declare module '*.png' {
  const recurso: number;
  export default recurso;
}

declare module '*.jpg' {
  const recurso: number;
  export default recurso;
}
