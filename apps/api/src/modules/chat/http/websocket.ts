/**
 * WebSocket do chat: GET /v1/ws/chat
 *
 * Protocolo (JSON):
 *   cliente → { tipo: "auth", token }        primeira mensagem, em até 5 s
 *   cliente → { tipo: "digitando", conversaId }
 *   cliente → { tipo: "ping" }               → { tipo: "pong" }
 *   servidor → { tipo: "auth.ok" } | "mensagem.nova" | "mensagem.lida" |
 *              "conversa.encerrada" | "digitando" | { tipo: "erro", codigo }
 *
 * Segurança:
 * - O token vai na mensagem, NUNCA na URL (a URL aparece em logs e proxies).
 * - Origin de navegador fora da lista do CORS → 403 (impede outro site de abrir
 *   o WebSocket com a sessão do usuário). O app nativo não envia Origin.
 * - Fecha quando o token expira e quando a sessão é revogada (logout).
 * - Máx. 4 KB por mensagem e 30 mensagens a cada 10 s por conexão.
 * - Enviar mensagem de chat é SEMPRE pela API REST (validação + rate limit).
 */
import type { WebSocket } from '@fastify/websocket';
import type { Role } from '@abraco/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { ErroDominio } from '../../../shared/dominio/erros.js';
import type { EmissorTokens, ListaRevogacao } from '../../auth/application/portas.js';
import type { EventoChat, SinalizarDigitando } from '../application/casos-de-uso.js';
import type { BarramentoAssinavel } from '../infrastructure/barramento.js';

export const FECHAMENTO = {
  naoAutenticado: 4401,
  protocolo: 4400,
  limite: 4429,
} as const;

export interface DependenciasWebsocket {
  readonly tokens: EmissorTokens;
  readonly revogacao: ListaRevogacao;
  readonly digitando: SinalizarDigitando;
  readonly barramento: BarramentoAssinavel;
  readonly origensPermitidas: readonly string[];
  readonly prazoAutenticacaoMs?: number;
  readonly intervaloRevogacaoMs?: number;
}

const mensagemCliente = z.discriminatedUnion('tipo', [
  z.strictObject({ tipo: z.literal('auth'), token: z.string().min(1).max(4096) }),
  z.strictObject({ tipo: z.literal('digitando'), conversaId: z.uuid() }),
  z.strictObject({ tipo: z.literal('ping') }),
]);

interface Conexao {
  readonly socket: WebSocket;
  usuario?: { id: string; role: Role; jti: string; sid: string };
}

/** Quem recebe cada evento: o dono da conversa e a equipe (ADMIN). */
export function deveReceber(usuario: { id: string; role: Role }, e: EventoChat): boolean {
  const ehDono = usuario.id === e.usuarioId;
  const ehEquipe = usuario.role === 'ADMIN';
  // "digitando" não volta para o lado que está digitando.
  if (e.tipo === 'digitando') return e.daEquipe ? ehDono && !ehEquipe : ehEquipe;
  return ehDono || ehEquipe;
}

/** O que vai para o app (sem o id interno do dono). */
function paraCliente(e: EventoChat): Record<string, unknown> {
  const copia: Record<string, unknown> = { ...e };
  delete copia['usuarioId'];
  return copia;
}

export function rotaWebsocketChat(deps: DependenciasWebsocket): FastifyPluginAsync {
  return async (app) => {
    const conexoes = new Set<Conexao>();
    const enviar = (c: Conexao, dados: Record<string, unknown>) => {
      try {
        c.socket.send(JSON.stringify(dados));
      } catch {
        // Conexão caindo: o evento "close" faz a limpeza.
      }
    };

    await deps.barramento.assinar((evento) => {
      for (const c of conexoes) {
        if (c.usuario && deveReceber(c.usuario, evento)) enviar(c, paraCliente(evento));
      }
    });

    app.addHook('onClose', async () => {
      for (const c of conexoes) c.socket.close(1001, 'servidor encerrando');
      await deps.barramento.fechar();
    });

    app.get(
      '/ws/chat',
      {
        websocket: true,
        preValidation: async (request, reply) => {
          const origem = request.headers.origin;
          if (origem !== undefined && !deps.origensPermitidas.includes(origem)) {
            await reply.code(403).send({ codigo: 'ORIGEM_NAO_PERMITIDA' });
          }
        },
      },
      (socket: WebSocket) => {
        const conexao: Conexao = { socket };
        conexoes.add(conexao);
        const timers: NodeJS.Timeout[] = [];
        let janelaInicio = Date.now();
        let mensagensNaJanela = 0;

        const fechar = (codigo: number, motivo: string) => {
          socket.close(codigo, motivo);
        };

        timers.push(
          setTimeout(() => {
            if (!conexao.usuario) fechar(FECHAMENTO.naoAutenticado, 'autenticação não enviada');
          }, deps.prazoAutenticacaoMs ?? 5000),
        );

        socket.on('message', (bruto: Buffer) => {
          void (async () => {
            const agora = Date.now();
            if (agora - janelaInicio > 10_000) {
              janelaInicio = agora;
              mensagensNaJanela = 0;
            }
            mensagensNaJanela += 1;
            if (mensagensNaJanela > 30) {
              fechar(FECHAMENTO.limite, 'muitas mensagens');
              return;
            }

            let dados: unknown;
            try {
              dados = JSON.parse(bruto.toString('utf8'));
            } catch {
              dados = null;
            }
            const msg = mensagemCliente.safeParse(dados);
            if (!msg.success) {
              fechar(FECHAMENTO.protocolo, 'mensagem inválida');
              return;
            }

            if (msg.data.tipo === 'auth') {
              try {
                const claims = deps.tokens.verificarAcesso(msg.data.token);
                if (await deps.revogacao.estaRevogado(claims.jti, claims.sid))
                  throw new Error('revogado');
                // Reautenticar (token renovado) só vale para o mesmo usuário.
                if (conexao.usuario && conexao.usuario.id !== claims.sub) {
                  fechar(FECHAMENTO.protocolo, 'usuário diferente');
                  return;
                }
                conexao.usuario = {
                  id: claims.sub,
                  role: claims.role,
                  jti: claims.jti,
                  sid: claims.sid,
                };
                for (const t of timers.splice(0)) clearTimeout(t);
                // Fecha quando o token expirar: o app reconecta com o token renovado.
                timers.push(
                  setTimeout(
                    () => {
                      fechar(FECHAMENTO.naoAutenticado, 'token expirado');
                    },
                    Math.max(claims.exp * 1000 - Date.now(), 0),
                  ),
                );
                // Logout em outro lugar derruba esta conexão em até 1 min.
                timers.push(
                  setInterval(() => {
                    const u = conexao.usuario;
                    if (!u) return;
                    void deps.revogacao.estaRevogado(u.jti, u.sid).then((revogado) => {
                      if (revogado) fechar(FECHAMENTO.naoAutenticado, 'sessão encerrada');
                    });
                  }, deps.intervaloRevogacaoMs ?? 60_000),
                );
                enviar(conexao, { tipo: 'auth.ok' });
              } catch {
                fechar(FECHAMENTO.naoAutenticado, 'token inválido');
              }
              return;
            }

            if (!conexao.usuario) {
              fechar(FECHAMENTO.naoAutenticado, 'autentique-se primeiro');
              return;
            }
            if (msg.data.tipo === 'ping') {
              enviar(conexao, { tipo: 'pong' });
              return;
            }
            try {
              await deps.digitando.executar({
                ator: { id: conexao.usuario.id, role: conexao.usuario.role },
                id: msg.data.conversaId,
              });
            } catch (erro) {
              enviar(conexao, {
                tipo: 'erro',
                codigo: erro instanceof ErroDominio ? erro.codigo : 'ERRO_INTERNO',
              });
            }
          })();
        });

        socket.on('close', () => {
          for (const t of timers) clearTimeout(t);
          conexoes.delete(conexao);
        });
      },
    );
  };
}
