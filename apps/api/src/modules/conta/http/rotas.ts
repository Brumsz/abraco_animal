/**
 * /v1/me/* — "minha conta". Tudo sobre o usuário do token; nenhum id na URL.
 */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { aplicarLimite } from '../../../shared/http/limite.js';
import type { UsuarioAuth } from '../../auth/application/portas.js';
import { claimsDe, type Autenticacao } from '../../auth/http/autenticacao.js';
import { enderecoEsquema, usuarioPerfilSaida } from '../../auth/http/esquemas.js';
import { REGRAS, type LimitadorTentativas } from '../../auth/infrastructure/redis-auth.js';
import type {
  AlterarSenha,
  AtualizarPerfil,
  ExcluirConta,
  ExportarDados,
  ObterResumoConta,
} from '../application/casos-de-uso.js';

export interface DependenciasRotasConta {
  readonly resumo: ObterResumoConta;
  readonly atualizarPerfil: AtualizarPerfil;
  readonly alterarSenha: AlterarSenha;
  readonly exportar: ExportarDados;
  readonly excluir: ExcluirConta;
  readonly limitador: LimitadorTentativas;
  readonly autenticacao: Autenticacao;
}

const senha = z.string().min(1).max(128);

const atualizarPerfilEntrada = z
  .strictObject({
    nome: z.string().max(120).optional(),
    telefone: z.string().max(20).optional(),
    endereco: enderecoEsquema.optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: 'Envie ao menos um campo para alterar',
  });

const resumoSaida = z.object({
  adocoes: z.number().int(),
  doacoes: z.number().int(),
  apadrinhados: z.number().int(),
});

const registro = z.record(z.string(), z.unknown());
const exportacaoSaida = z.object({
  geradoEm: z.date(),
  titular: z.object({
    id: z.uuid(),
    nome: z.string(),
    email: z.string(),
    telefone: z.string(),
    cpf: z.string(),
    dataNasc: z.string(),
    endereco: usuarioPerfilSaida.shape.endereco,
    papel: z.string(),
    criadoEm: z.date(),
  }),
  consentimentos: z.object({ termosDeUsoEm: z.date(), tratamentoDeDadosEm: z.date() }),
  adocoes: z.array(registro),
  doacoesAnimais: z.array(registro),
  doacoesFinanceiras: z.array(registro),
  apadrinhamentos: z.array(registro),
  voluntariado: registro.nullable(),
  mensagensEnviadas: z.array(registro),
  totalCurtidas: z.number().int(),
  sessoes: z.array(registro),
});

const perfil = (u: UsuarioAuth) => ({ ...u, id: u.publicId });

export function rotasConta(deps: DependenciasRotasConta): FastifyPluginAsyncZod {
  const { autenticar } = deps.autenticacao;

  return (app) => {
    app.get(
      '/me/resumo',
      { preHandler: autenticar, schema: { response: { 200: resumoSaida } } },
      (request) => deps.resumo.executar(claimsDe(request)),
    );

    app.patch(
      '/me',
      {
        preHandler: autenticar,
        schema: { body: atualizarPerfilEntrada, response: { 200: usuarioPerfilSaida } },
      },
      async (request) =>
        perfil(await deps.atualizarPerfil.executar(claimsDe(request), request.body)),
    );

    app.post(
      '/me/senha',
      {
        preHandler: autenticar,
        schema: { body: z.strictObject({ senhaAtual: senha, novaSenha: senha }) },
      },
      async (request, reply) => {
        const claims = claimsDe(request);
        // Por usuário: quem pegou o celular desbloqueado não testa senhas à vontade.
        await aplicarLimite(deps.limitador, REGRAS.senhaContaPorUsuario, claims.sub, reply);
        await deps.alterarSenha.executar(claims, request.body);
        await deps.limitador.limpar(REGRAS.senhaContaPorUsuario, claims.sub);
        return reply.code(204).send();
      },
    );

    app.get(
      '/me/exportacao',
      { preHandler: autenticar, schema: { response: { 200: exportacaoSaida } } },
      async (request, reply) => {
        const claims = claimsDe(request);
        await aplicarLimite(deps.limitador, REGRAS.exportacaoPorUsuario, claims.sub, reply);
        // Dados pessoais completos (inclui CPF): nunca em cache.
        void reply.header('cache-control', 'no-store');
        return deps.exportar.executar(claims);
      },
    );

    app.delete(
      '/me',
      { preHandler: autenticar, schema: { body: z.strictObject({ senha }) } },
      async (request, reply) => {
        const claims = claimsDe(request);
        await aplicarLimite(deps.limitador, REGRAS.senhaContaPorUsuario, claims.sub, reply);
        await deps.excluir.executar(claims, request.body);
        return reply.code(204).send();
      },
    );

    return Promise.resolve();
  };
}
