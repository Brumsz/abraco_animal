import multipart from '@fastify/multipart';
import { UPLOAD_IMAGENS } from '@abraco/shared';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod, ZodTypeProvider } from 'fastify-type-provider-zod';

import { ErroDominio } from '../../../shared/dominio/erros.js';
import { codificarCursor } from '../../../shared/http/cursor.js';
import { claimsDe, type Autenticacao } from '../../auth/http/autenticacao.js';
import type { ListarAnimais, ObterAnimal } from '../application/consultar-animais.js';
import type {
  EnviarFotosAnimal,
  RemoverFotoAnimal,
  ReordenarFotosAnimal,
} from '../application/fotos-animal.js';
import type {
  AlterarStatusAnimal,
  AtualizarAnimal,
  CriarAnimal,
  RemoverAnimal,
} from '../application/gerenciar-animais.js';
import {
  alterarStatusEntrada,
  animalDetalheSaida,
  atualizarAnimalEntrada,
  criarAnimalEntrada,
  fotoParam,
  fotoSaida,
  idParam,
  listagemQuery,
  paginaAnimaisSaida,
  reordenarFotosEntrada,
} from './esquemas.js';

export interface DependenciasRotasAnimais {
  readonly listar: ListarAnimais;
  readonly obter: ObterAnimal;
  readonly criar: CriarAnimal;
  readonly atualizar: AtualizarAnimal;
  readonly alterarStatus: AlterarStatusAnimal;
  readonly remover: RemoverAnimal;
  readonly enviarFotos: EnviarFotosAnimal;
  readonly removerFoto: RemoverFotoAnimal;
  readonly reordenarFotos: ReordenarFotosAnimal;
  readonly autenticacao: Autenticacao;
}

const CAMPO_ARQUIVOS = 'fotos';

/**
 * Lê os arquivos do multipart para a memória. Os limites do plugin cortam o
 * envio cedo: arquivo > 5 MB ou mais de 10 arquivos → 413 sem ler o resto.
 */
async function lerArquivos(request: FastifyRequest): Promise<Buffer[]> {
  const arquivos: Buffer[] = [];
  for await (const parte of request.files()) {
    if (parte.fieldname !== CAMPO_ARQUIVOS) {
      // Esvazia o stream antes de recusar, senão a conexão fica pendurada.
      parte.file.resume();
      throw new ErroDominio(
        'VALIDACAO',
        'CAMPO_ARQUIVO_INVALIDO',
        `Envie as imagens no campo "${CAMPO_ARQUIVOS}"`,
        CAMPO_ARQUIVOS,
      );
    }
    // Nome, extensão e Content-Type do cliente são ignorados: vale o conteúdo.
    arquivos.push(await parte.toBuffer());
  }
  return arquivos;
}

export function rotasAnimais(deps: DependenciasRotasAnimais): FastifyPluginAsyncZod {
  const { autenticar, autenticarOpcional, exigirRole } = deps.autenticacao;

  return async (app) => {
    app.get(
      '/animais',
      {
        preHandler: autenticarOpcional,
        schema: { querystring: listagemQuery, response: { 200: paginaAnimaisSaida } },
      },
      async (request) => {
        const { cursor, q, tipo, porte, sexo, status, limite } = request.query;
        const role = request.claims?.role;
        const pagina = await deps.listar.executar({
          ...(role ? { role } : {}),
          ...(cursor ? { cursor } : {}),
          ...(q !== undefined ? { q } : {}),
          ...(tipo ? { tipo } : {}),
          ...(porte ? { porte } : {}),
          ...(sexo ? { sexo } : {}),
          ...(status ? { status } : {}),
          ...(limite !== undefined ? { limite } : {}),
        });
        return {
          itens: pagina.itens,
          proximoCursor: pagina.proximoCursor ? codificarCursor(pagina.proximoCursor) : null,
        };
      },
    );

    app.get(
      '/animais/:id',
      {
        preHandler: autenticarOpcional,
        schema: { params: idParam, response: { 200: animalDetalheSaida } },
      },
      async (request) => {
        const role = request.claims?.role;
        return deps.obter.executar({ id: request.params.id, ...(role ? { role } : {}) });
      },
    );

    // ── /admin/animais: só ADMIN (proteção no servidor, não só na UI) ──────
    await app.register(
      async (escopo) => {
        const admin = escopo.withTypeProvider<ZodTypeProvider>();
        admin.addHook('preHandler', autenticar);
        admin.addHook('preHandler', exigirRole('ADMIN'));

        // Multipart só existe neste escopo: rotas públicas não aceitam upload.
        await admin.register(multipart, {
          limits: {
            fileSize: UPLOAD_IMAGENS.tamanhoMaximoBytes,
            files: UPLOAD_IMAGENS.arquivosPorEnvio,
            fields: 0,
            parts: UPLOAD_IMAGENS.arquivosPorEnvio,
            fieldNameSize: 50,
            headerPairs: 20,
          },
        });

        const adminId = (request: FastifyRequest) => claimsDe(request).sub;

        admin.post(
          '/animais',
          { schema: { body: criarAnimalEntrada, response: { 201: animalDetalheSaida } } },
          async (request, reply) => {
            const { status, ...dados } = request.body;
            const animal = await deps.criar.executar({
              adminId: adminId(request),
              dados,
              ...(status ? { status } : {}),
            });
            return reply.code(201).send(animal);
          },
        );

        admin.put(
          '/animais/:id',
          {
            schema: {
              params: idParam,
              body: atualizarAnimalEntrada,
              response: { 200: animalDetalheSaida },
            },
          },
          async (request) =>
            deps.atualizar.executar({
              adminId: adminId(request),
              id: request.params.id,
              dados: request.body,
            }),
        );

        admin.patch(
          '/animais/:id/status',
          {
            schema: {
              params: idParam,
              body: alterarStatusEntrada,
              response: { 200: animalDetalheSaida },
            },
          },
          async (request) =>
            deps.alterarStatus.executar({
              adminId: adminId(request),
              id: request.params.id,
              status: request.body.status,
            }),
        );

        admin.delete('/animais/:id', { schema: { params: idParam } }, async (request, reply) => {
          await deps.remover.executar({ adminId: adminId(request), id: request.params.id });
          return reply.code(204).send();
        });

        admin.post(
          '/animais/:id/fotos',
          { schema: { params: idParam, response: { 201: fotoSaida.array() } } },
          async (request, reply) => {
            if (!request.isMultipart()) {
              throw new ErroDominio(
                'VALIDACAO',
                'MULTIPART_OBRIGATORIO',
                'Envie as fotos como multipart/form-data',
              );
            }
            const fotos = await deps.enviarFotos.executar({
              adminId: adminId(request),
              id: request.params.id,
              arquivos: await lerArquivos(request),
            });
            return reply.code(201).send(fotos);
          },
        );

        admin.put(
          '/animais/:id/fotos',
          { schema: { params: idParam, body: reordenarFotosEntrada } },
          async (request, reply) => {
            await deps.reordenarFotos.executar({
              adminId: adminId(request),
              id: request.params.id,
              ids: request.body.ids,
            });
            return reply.code(204).send();
          },
        );

        admin.delete(
          '/animais/:id/fotos/:fotoId',
          { schema: { params: fotoParam } },
          async (request, reply) => {
            await deps.removerFoto.executar({
              adminId: adminId(request),
              id: request.params.id,
              fotoId: request.params.fotoId,
            });
            return reply.code(204).send();
          },
        );
      },
      { prefix: '/admin' },
    );
  };
}
