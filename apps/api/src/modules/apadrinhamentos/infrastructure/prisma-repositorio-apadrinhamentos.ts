import type { Prisma as PrismaGerado } from '../../../generated/prisma/client.js';
import { ErroDominio } from '../../../shared/dominio/erros.js';
import { violouUnicidade, type Prisma } from '../../../shared/infra/prisma.js';
import type { AnimalRegistro } from '../../animais/application/portas.js';
import {
  paraResumoAnimal,
  SELECAO_RESUMO_ANIMAL,
} from '../../animais/infrastructure/prisma-repositorio-animais.js';
import type {
  ApadrinhamentoRegistro,
  PadrinhoRegistro,
  RepositorioApadrinhamentos,
} from '../application/casos-de-uso.js';

const CAMPOS = {
  id: true,
  publicId: true,
  ativo: true,
  mensagemPadrinho: true,
  criadoEm: true,
  usuario: { select: { publicId: true } },
  animal: { select: SELECAO_RESUMO_ANIMAL },
} as const satisfies PrismaGerado.ApadrinhamentoSelect;

type Linha = PrismaGerado.ApadrinhamentoGetPayload<{ select: typeof CAMPOS }>;

const registro = (l: Linha): ApadrinhamentoRegistro => ({
  id: l.id,
  publicId: l.publicId,
  padrinhoId: l.usuario.publicId,
  ativo: l.ativo,
  mensagemPadrinho: l.mensagemPadrinho,
  criadoEm: l.criadoEm,
  animal: paraResumoAnimal(l.animal),
});

const jaPadrinho = () =>
  new ErroDominio('CONFLITO', 'JA_PADRINHO', 'Você já é padrinho deste animal');

export class PrismaRepositorioApadrinhamentos implements RepositorioApadrinhamentos {
  constructor(private readonly prisma: Prisma) {}

  async apadrinhar(d: {
    padrinhoId: string;
    animal: AnimalRegistro;
    mensagem: string | null;
  }): Promise<ApadrinhamentoRegistro> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const { id: usuarioId } = await tx.usuario.findUniqueOrThrow({
          where: { publicId: d.padrinhoId },
          select: { id: true },
        });
        const existente = await tx.apadrinhamento.findUnique({
          where: { usuarioId_animalId: { usuarioId, animalId: d.animal.id } },
          select: { id: true, ativo: true },
        });
        if (existente?.ativo) throw jaPadrinho();
        // Encerrado antes: reativa (UNIQUE usuário+animal impede um segundo registro).
        const linha = existente
          ? await tx.apadrinhamento.update({
              where: { id: existente.id },
              data: { ativo: true, mensagemPadrinho: d.mensagem },
              select: CAMPOS,
            })
          : await tx.apadrinhamento.create({
              data: { usuarioId, animalId: d.animal.id, mensagemPadrinho: d.mensagem },
              select: CAMPOS,
            });
        return registro(linha);
      });
    } catch (erro) {
      // Dois toques ao mesmo tempo: o UNIQUE barra o segundo.
      if (violouUnicidade(erro)) throw jaPadrinho();
      throw erro;
    }
  }

  async buscar(publicId: string): Promise<ApadrinhamentoRegistro | null> {
    const l = await this.prisma.apadrinhamento.findUnique({ where: { publicId }, select: CAMPOS });
    return l ? registro(l) : null;
  }

  async encerrar(a: ApadrinhamentoRegistro): Promise<void> {
    await this.prisma.apadrinhamento.update({ where: { id: a.id }, data: { ativo: false } });
  }

  async listarDoPadrinho(padrinhoId: string): Promise<ApadrinhamentoRegistro[]> {
    const linhas = await this.prisma.apadrinhamento.findMany({
      where: { usuario: { publicId: padrinhoId }, ativo: true, animal: { removidoEm: null } },
      orderBy: { criadoEm: 'desc' },
      select: CAMPOS,
    });
    return linhas.map(registro);
  }

  async listarPadrinhos(animalId: number, limite: number): Promise<PadrinhoRegistro[]> {
    const linhas = await this.prisma.apadrinhamento.findMany({
      // Conta removida/anonimizada (LGPD) não aparece.
      where: { animalId, ativo: true, usuario: { removidoEm: null, ativo: true } },
      orderBy: { criadoEm: 'desc' },
      take: limite,
      select: { mensagemPadrinho: true, usuario: { select: { nome: true, fotoUrl: true } } },
    });
    return linhas.map((l) => ({
      nome: l.usuario.nome,
      fotoChave: l.usuario.fotoUrl,
      mensagemPadrinho: l.mensagemPadrinho,
    }));
  }
}
