export interface Relogio {
  agora(): Date;
}

export const relogioSistema: Relogio = { agora: () => new Date() };
