import type { Prisma } from '../../../shared/infra/prisma.js';
import type {
  AlteracaoPerfil,
  Anonimizacao,
  DadosBrutosExportacao,
  RepositorioConta,
  ResumoConta,
} from '../application/portas.js';

const TEXTO_REMOVIDO = '[removido a pedido do titular]';

export class PrismaRepositorioConta implements RepositorioConta {
  constructor(private readonly prisma: Prisma) {}

  async atualizarPerfil(usuarioId: number, d: AlteracaoPerfil): Promise<void> {
    await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: {
        ...(d.nome !== undefined ? { nome: d.nome } : {}),
        ...(d.telefone !== undefined ? { telefone: d.telefone } : {}),
        ...(d.endereco ?? {}),
      },
    });
  }

  async resumo(usuarioId: number): Promise<ResumoConta> {
    const [adocoes, pix, animais, apadrinhados] = await Promise.all([
      this.prisma.adocao.count({ where: { usuarioId, status: 'APROVADA', removidoEm: null } }),
      this.prisma.doacaoFinanceira.count({ where: { usuarioId, status: 'CONFIRMADA' } }),
      this.prisma.doacaoAnimal.count({ where: { usuarioId, status: 'RECEBIDA' } }),
      this.prisma.apadrinhamento.count({ where: { usuarioId, ativo: true } }),
    ]);
    return { adocoes, doacoes: pix + animais, apadrinhados };
  }

  async dadosExportacao(usuarioId: number): Promise<DadosBrutosExportacao> {
    const p = this.prisma;
    const [
      u,
      adocoes,
      doacoesAnimais,
      doacoesFinanceiras,
      apadrinhamentos,
      voluntario,
      mensagens,
      curtidas,
      sessoes,
    ] = await Promise.all([
      p.usuario.findUniqueOrThrow({
        where: { id: usuarioId },
        select: {
          cpfCifrado: true,
          cpfIv: true,
          cpfTag: true,
          dataNascCifrada: true,
          dataNascIv: true,
          dataNascTag: true,
          aceitouTermosEm: true,
          consentimentoDadosEm: true,
        },
      }),
      p.adocao.findMany({
        where: { usuarioId },
        orderBy: { criadoEm: 'asc' },
        select: {
          publicId: true,
          status: true,
          tipoMoradia: true,
          possuiEspacoAdequado: true,
          motivo: true,
          outrosAnimais: true,
          termoAceitoEm: true,
          motivoRecusa: true,
          criadoEm: true,
          animal: { select: { nome: true } },
        },
      }),
      p.doacaoAnimal.findMany({
        where: { usuarioId },
        orderBy: { criadoEm: 'asc' },
        select: {
          publicId: true,
          nomeAnimal: true,
          tipo: true,
          raca: true,
          status: true,
          motivoDoacao: true,
          enderecoRetirada: true,
          criadoEm: true,
        },
      }),
      p.doacaoFinanceira.findMany({
        where: { usuarioId },
        orderBy: { criadoEm: 'asc' },
        select: {
          publicId: true,
          valor: true,
          status: true,
          anonima: true,
          paidAt: true,
          criadoEm: true,
        },
      }),
      p.apadrinhamento.findMany({
        where: { usuarioId },
        orderBy: { criadoEm: 'asc' },
        select: {
          publicId: true,
          ativo: true,
          mensagemPadrinho: true,
          criadoEm: true,
          animal: { select: { nome: true } },
        },
      }),
      p.voluntario.findUnique({
        where: { usuarioId },
        select: {
          status: true,
          areasInteresse: true,
          areaInteresseOutros: true,
          disponibilidadeDias: true,
          turnos: true,
          motivacao: true,
          habilidades: true,
          criadoEm: true,
        },
      }),
      p.mensagem.findMany({
        where: { autorId: usuarioId },
        orderBy: { criadoEm: 'asc' },
        select: { conteudo: true, criadoEm: true },
      }),
      p.curtida.count({ where: { usuarioId } }),
      p.sessao.findMany({
        where: { usuarioId },
        orderBy: { criadaEm: 'asc' },
        select: { deviceId: true, criadaEm: true, ultimoUso: true, revogadaEm: true },
      }),
    ]);

    return {
      cpf: { cifrado: u.cpfCifrado, iv: u.cpfIv, tag: u.cpfTag },
      dataNasc: { cifrado: u.dataNascCifrada, iv: u.dataNascIv, tag: u.dataNascTag },
      aceitouTermosEm: u.aceitouTermosEm,
      consentimentoDadosEm: u.consentimentoDadosEm,
      adocoes: adocoes.map(({ publicId, animal, ...a }) => ({
        id: publicId,
        animal: animal.nome,
        ...a,
      })),
      doacoesAnimais: doacoesAnimais.map(({ publicId, ...d }) => ({ id: publicId, ...d })),
      doacoesFinanceiras: doacoesFinanceiras.map(({ publicId, valor, ...d }) => ({
        id: publicId,
        valor: valor.toFixed(2),
        ...d,
      })),
      apadrinhamentos: apadrinhamentos.map(({ publicId, animal, ...a }) => ({
        id: publicId,
        animal: animal.nome,
        ...a,
      })),
      voluntariado: voluntario,
      mensagens,
      curtidas,
      sessoes,
    };
  }

  contarAdminsAtivos(): Promise<number> {
    return this.prisma.usuario.count({ where: { role: 'ADMIN', ativo: true, removidoEm: null } });
  }

  async revogarOutrasSessoes(usuarioId: number, sidAtual: string): Promise<string[]> {
    const outras = { usuarioId, revogadaEm: null, sid: { not: sidAtual } };
    const ativas = await this.prisma.sessao.findMany({ where: outras, select: { sid: true } });
    const agora = new Date();
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { sessao: outras, revogadoEm: null },
        data: { revogadoEm: agora },
      }),
      this.prisma.sessao.updateMany({ where: outras, data: { revogadaEm: agora } }),
    ]);
    return ativas.map((s) => s.sid);
  }

  async anonimizar(usuarioId: number, a: Anonimizacao): Promise<string[]> {
    const vazio = {
      cifrado: Buffer.from(a.vazioCifrado.cifrado),
      iv: Buffer.from(a.vazioCifrado.iv),
      tag: Buffer.from(a.vazioCifrado.tag),
    };
    return this.prisma.$transaction(async (tx) => {
      const ativas = await tx.sessao.findMany({
        where: { usuarioId, revogadaEm: null },
        select: { sid: true },
      });

      // Pedidos em andamento perdem o sentido sem a pessoa.
      await tx.adocao.updateMany({
        where: { usuarioId, status: 'PENDENTE', removidoEm: null },
        data: { removidoEm: a.agora },
      });
      await tx.doacaoAnimal.updateMany({
        where: { usuarioId, status: { in: ['PENDENTE', 'APROVADA'] } },
        data: {
          status: 'RECUSADA',
          motivoRecusa: 'Conta do doador excluída',
          analisadoEm: a.agora,
        },
      });
      // Histórico da ONG fica, sem vínculo e sem textos pessoais.
      await tx.adocao.updateMany({
        where: { usuarioId },
        data: { usuarioId: null, motivo: TEXTO_REMOVIDO, outrosAnimais: null },
      });
      await tx.doacaoAnimal.updateMany({
        where: { usuarioId },
        data: { usuarioId: null, motivoDoacao: TEXTO_REMOVIDO, enderecoRetirada: TEXTO_REMOVIDO },
      });
      await tx.doacaoFinanceira.updateMany({
        where: { usuarioId },
        data: { usuarioId: null, nomeDoador: null, emailDoador: null },
      });

      // Só existem por causa da pessoa: saem.
      await tx.conversa.deleteMany({ where: { usuarioId } });
      await tx.curtida.deleteMany({ where: { usuarioId } });
      await tx.notificacao.deleteMany({ where: { usuarioId } });
      await tx.apadrinhamento.deleteMany({ where: { usuarioId } });
      await tx.voluntario.deleteMany({ where: { usuarioId } });
      await tx.dispositivoPush.deleteMany({ where: { usuarioId } });
      await tx.recuperacaoSenha.deleteMany({ where: { usuarioId } });

      await tx.refreshToken.updateMany({
        where: { sessao: { usuarioId }, revogadoEm: null },
        data: { revogadoEm: a.agora },
      });
      await tx.sessao.updateMany({
        where: { usuarioId, revogadaEm: null },
        data: { revogadaEm: a.agora },
      });

      await tx.usuario.update({
        where: { id: usuarioId },
        data: {
          nome: 'Conta removida',
          email: a.email,
          telefone: '',
          senhaHash: a.senhaHash,
          cpfCifrado: vazio.cifrado,
          cpfIv: vazio.iv,
          cpfTag: vazio.tag,
          cpfHash: a.cpfHash,
          dataNascCifrada: vazio.cifrado,
          dataNascIv: vazio.iv,
          dataNascTag: vazio.tag,
          cep: '',
          logradouro: '',
          numero: '',
          complemento: null,
          bairro: '',
          cidade: '',
          uf: '--',
          fotoUrl: null,
          capaUrl: null,
          role: 'USUARIO',
          ativo: false,
          removidoEm: a.agora,
        },
      });
      return ativas.map((s) => s.sid);
    });
  }
}
