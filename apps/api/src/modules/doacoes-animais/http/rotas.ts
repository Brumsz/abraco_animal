import multipart from '@fastify/multipart';
import { PORTES, SEXOS, STATUS_DOACAO_ANIMAL, TIPOS_ANIMAL, UPLOAD_IMAGENS } from '@abraco/shared';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod, ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { ErroDominio } from '../../../shared/dominio/erros.js';
import { codificarCursor, cursorEsquema } from '../../../shared/http/cursor.js';
import { aplicarLimite } from '../../../shared/http/limite.js';
import { fotoSaida } from '../../animais/http/esquemas.js';
import { LIMITES_ANIMAL } from '../../animais/domain/animal.js';
import { LIMITES_ADOCAO } from '../../adocoes/domain/adocao.js';
import { atorDe, type Autenticacao } from '../../auth/http/autenticacao.js';
import { REGRAS, type LimitadorTentativas } from '../../auth/infrastructure/redis-auth.js';
import {
  LIMITE_PAGINA_DOACOES,
  type AdminListarDoacoes,
  type AdminObterDoacao,
  type AprovarDoacao,
  type DoarAnimal,
  type ListarMinhasDoacoes,
  type ObterDoacao,
  type ReceberDoacao,
  type RecusarDoacao,
} from '../application/casos-de-uso.js';
import { LIMITES_DOACAO } from '../domain/doacao-animal.js';

export interface DependenciasRotasDoacoesAnimais {
  readonly doar: DoarAnimal;
  readonly listarMinhas: ListarMinhasDoacoes;
  readonly obter: ObterDoacao;
  readonly adminListar: AdminListarDoacoes;
  readonly adminObter: AdminObterDoacao;
  readonly aprovar: AprovarDoacao;
  readonly recusar: RecusarDoacao;
  readonly receber: ReceberDoacao;
  readonly limitador: LimitadorTentativas;
  readonly autenticacao: Autenticacao;
}

// ── Esquemas ─────────────────────────────────────────────────────────────

/** Campo `dados` do multipart (JSON). Teto de tamanho aqui; regras no domínio. */
export const doarAnimalEntrada = z.strictObject({
  nomeAnimal: z.string().max(LIMITES_ANIMAL.nome * 2),
  tipo: z.enum(TIPOS_ANIMAL),
  raca: z.string().max(LIMITES_ANIMAL.raca * 2),
  idadeAprox: z.number().int().min(0).max(LIMITES_ANIMAL.idadeMaximaMeses),
  sexo: z.enum(SEXOS),
  porte: z.enum(PORTES),
  descricao: z.string().max(LIMITES_ANIMAL.descricao * 2),
  motivoDoacao: z.string().max(LIMITES_DOACAO.motivoMax * 2),
  enderecoRetirada: z.string().max(LIMITES_DOACAO.enderecoMax * 2),
});

const idParam = z.strictObject({ id: z.uuid() });
const limite = z.coerce.number().int().min(1).max(LIMITE_PAGINA_DOACOES.maximo).optional();

const doacaoSaida = z.object({
  id: z.uuid(),
  status: z.enum(STATUS_DOACAO_ANIMAL),
  nomeAnimal: z.string(),
  tipo: z.enum(TIPOS_ANIMAL),
  raca: z.string(),
  idadeAprox: z.number().int(),
  sexo: z.enum(SEXOS),
  porte: z.enum(PORTES),
  descricao: z.string(),
  motivoDoacao: z.string(),
  enderecoRetirada: z.string(),
  fotos: z.array(fotoSaida),
  motivoRecusa: z.string().nullable(),
  analisadoEm: z.date().nullable(),
  recebidoEm: z.date().nullable(),
  animalCriadoId: z.uuid().nullable(),
  criadoEm: z.date(),
  timeline: z.array(
    z.object({
      etapa: z.enum(['ENVIADA', 'EM_ANALISE', 'APROVADA', 'RECEBIDA', 'RECUSADA']),
      em: z.date().nullable(),
    }),
  ),
});

const doacaoAdminSaida = doacaoSaida.extend({
  doador: z
    .object({ id: z.uuid(), nome: z.string(), email: z.string(), telefone: z.string() })
    .nullable(),
  analisadoPor: z.string().nullable(),
});

const paginaSaida = z.object({ itens: z.array(doacaoSaida), proximoCursor: z.string().nullable() });

const pagina = <T>(p: {
  itens: T[];
  proximoCursor: { criadoEm: Date; publicId: string } | null;
}) => ({
  itens: p.itens,
  proximoCursor: p.proximoCursor ? codificarCursor(p.proximoCursor) : null,
});

// ── Multipart ────────────────────────────────────────────────────────────

const invalida = (mensagem: string, campo?: string) =>
  new ErroDominio('REQUISICAO_INVALIDA', 'REQUISICAO_INVALIDA', mensagem, campo);

/**
 * Lê `dados` (JSON) e `fotos` (arquivos). Nome e Content-Type dos arquivos
 * são ignorados: o formato real é conferido pelos magic bytes no caso de uso.
 */
async function lerFormulario(request: FastifyRequest) {
  if (!request.isMultipart()) throw invalida('Envie o formulário como multipart/form-data');
  let dadosBrutos: string | undefined;
  const arquivos: Buffer[] = [];
  for await (const parte of request.parts()) {
    if (parte.type === 'file') {
      if (parte.fieldname !== 'fotos') {
        parte.file.resume();
        throw invalida('Envie as imagens no campo "fotos"', 'fotos');
      }
      arquivos.push(await parte.toBuffer());
    } else {
      if (parte.fieldname !== 'dados' || dadosBrutos !== undefined) {
        throw invalida('Campo de formulário inesperado', parte.fieldname);
      }
      dadosBrutos = String(parte.value);
    }
  }
  if (dadosBrutos === undefined) throw invalida('O campo "dados" é obrigatório', 'dados');

  let json: unknown;
  try {
    json = JSON.parse(dadosBrutos);
  } catch {
    throw invalida('O campo "dados" deve ser um JSON válido', 'dados');
  }
  const r = doarAnimalEntrada.safeParse(json);
  if (!r.success) {
    const problema = r.error.issues[0];
    throw invalida(problema?.message ?? 'Dados inválidos', problema?.path.join('.') ?? 'dados');
  }
  return { dados: r.data, arquivos };
}

// ── Rotas ────────────────────────────────────────────────────────────────

export function rotasDoacoesAnimais(deps: DependenciasRotasDoacoesAnimais): FastifyPluginAsyncZod {
  const { autenticar, exigirRole } = deps.autenticacao;

  return async (app) => {
    // Upload só neste escopo.
    await app.register(async (escopo) => {
      await escopo.register(multipart, {
        limits: {
          fileSize: UPLOAD_IMAGENS.tamanhoMaximoBytes,
          files: UPLOAD_IMAGENS.arquivosPorEnvio,
          fields: 1,
          fieldSize: 32 * 1024,
          parts: UPLOAD_IMAGENS.arquivosPorEnvio + 1,
          fieldNameSize: 50,
          headerPairs: 20,
        },
      });
      escopo
        .withTypeProvider<ZodTypeProvider>()
        .post(
          '/doacoes-animais',
          { preHandler: autenticar, schema: { response: { 201: doacaoSaida } } },
          async (request, reply) => {
            const ator = atorDe(request);
            // Antes de ler o corpo: quem estourou o limite nem chega a enviar as fotos.
            await aplicarLimite(
              deps.limitador,
              REGRAS.criacaoDoacaoAnimalPorUsuario,
              ator.id,
              reply,
            );
            const { dados, arquivos } = await lerFormulario(request);
            return reply.code(201).send(await deps.doar.executar({ ator, dados, arquivos }));
          },
        );
    });

    app.get(
      '/me/doacoes-animais',
      {
        preHandler: autenticar,
        schema: {
          querystring: z.strictObject({ cursor: cursorEsquema.optional(), limite }),
          response: { 200: paginaSaida },
        },
      },
      async (request) => {
        const { cursor, limite: n } = request.query;
        return pagina(
          await deps.listarMinhas.executar({
            ator: atorDe(request),
            ...(cursor ? { cursor } : {}),
            ...(n !== undefined ? { limite: n } : {}),
          }),
        );
      },
    );

    app.get(
      '/doacoes-animais/:id',
      { preHandler: autenticar, schema: { params: idParam, response: { 200: doacaoSaida } } },
      async (request) => deps.obter.executar({ ator: atorDe(request), id: request.params.id }),
    );

    await app.register(
      (escopo) => {
        const admin = escopo.withTypeProvider<ZodTypeProvider>();
        admin.addHook('preHandler', autenticar);
        admin.addHook('preHandler', exigirRole('ADMIN'));

        admin.get(
          '/doacoes-animais',
          {
            schema: {
              querystring: z
                .strictObject({
                  status: z.enum(STATUS_DOACAO_ANIMAL).optional(),
                  de: z.iso.datetime({ offset: true }).optional(),
                  ate: z.iso.datetime({ offset: true }).optional(),
                  cursor: cursorEsquema.optional(),
                  limite,
                })
                .refine((q) => !q.de || !q.ate || Date.parse(q.de) < Date.parse(q.ate), {
                  message: '"de" deve ser anterior a "ate"',
                  path: ['ate'],
                }),
              response: { 200: paginaSaida },
            },
          },
          async (request) => {
            const { status, de, ate, cursor, limite: n } = request.query;
            return pagina(
              await deps.adminListar.executar({
                ator: atorDe(request),
                ...(status ? { status } : {}),
                ...(de ? { de: new Date(de) } : {}),
                ...(ate ? { ate: new Date(ate) } : {}),
                ...(cursor ? { cursor } : {}),
                ...(n !== undefined ? { limite: n } : {}),
              }),
            );
          },
        );

        admin.get(
          '/doacoes-animais/:id',
          { schema: { params: idParam, response: { 200: doacaoAdminSaida } } },
          async (request) =>
            deps.adminObter.executar({ ator: atorDe(request), id: request.params.id }),
        );

        admin.post(
          '/doacoes-animais/:id/aprovar',
          { schema: { params: idParam, response: { 200: doacaoAdminSaida } } },
          async (request) =>
            deps.aprovar.executar({ ator: atorDe(request), id: request.params.id }),
        );

        admin.post(
          '/doacoes-animais/:id/recusar',
          {
            schema: {
              params: idParam,
              body: z.strictObject({
                motivoRecusa: z.string().max(LIMITES_ADOCAO.motivoRecusaMax * 2),
              }),
              response: { 200: doacaoAdminSaida },
            },
          },
          async (request) =>
            deps.recusar.executar({
              ator: atorDe(request),
              id: request.params.id,
              motivo: request.body.motivoRecusa,
            }),
        );

        admin.post(
          '/doacoes-animais/:id/receber',
          { schema: { params: idParam, response: { 200: doacaoAdminSaida } } },
          async (request) =>
            deps.receber.executar({ ator: atorDe(request), id: request.params.id }),
        );
        return Promise.resolve();
      },
      { prefix: '/admin' },
    );
  };
}
