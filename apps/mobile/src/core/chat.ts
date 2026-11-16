/** Conexão única do chat em tempo real para o app inteiro. */
import { ChatTempoReal } from '@abraco/api-client';

import { CONFIG } from './config';
import { aoMudarSessao, renovarSessao, useSessao } from './sessao';

export const chat = new ChatTempoReal({
  url: CONFIG.wsChatUrl,
  obterToken: () => useSessao.getState().accessToken,
  // Mesma renovação única da API (refresh token é de uso único).
  renovar: () => renovarSessao(),
});

aoMudarSessao((e) => {
  if (e === 'token-renovado') chat.reautenticar();
  if (e === 'sessao-encerrada') chat.desconectar();
});
