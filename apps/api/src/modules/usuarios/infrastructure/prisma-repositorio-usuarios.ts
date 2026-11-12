import type { Prisma as PrismaGerado } from '../../../generated/prisma/client.js';
import { ErroDominio } from '../../../shared/dominio/erros.js';
import { violouUnicidade, type Prisma } from '../../../shared/infra/prisma.js';
import type {
  NovoUsuario,
  RepositorioUsuarios,
  UsuarioAuth,
} from '../../auth/application/portas.js';
import { MENSAGEM_CONFLITO } from '../../auth/application/cadastrar.js';

// Seleciona só o necessário: CPF e data de nascimento cifrados nunca saem daqui.
const CAMPOS = {
  id: true,
  publicId: true,
  nome: true,
  email: true,
  telefone: true,
  senhaHash: true,
  role: true,
  ativo: true,
  removidoEm: true,
  cep: true,
  logradouro: true,
  numero: true,
  complemento: true,
  bairro: true,
  cidade: true,
  uf: true,
  fotoUrl: true,
  capaUrl: true,
  criadoEm: true,
} as const;

type Linha = PrismaGerado.UsuarioGetPayload<{ select: typeof CAMPOS }>;

function paraDominio(l: Linha): UsuarioAuth {
  return {
    id: l.id,
    publicId: l.publicId,
    nome: l.nome,
    email: l.email,
    telefone: l.telefone,
    senhaHash: l.senhaHash,
    role: l.role,
    ativo: l.ativo,
    removido: l.removidoEm !== null,
    endereco: {
      cep: l.cep,
      logradouro: l.logradouro,
      numero: l.numero,
      complemento: l.complemento,
      bairro: l.bairro,
      cidade: l.cidade,
      uf: l.uf,
    },
    fotoUrl: l.fotoUrl,
    capaUrl: l.capaUrl,
    criadoEm: l.criadoEm,
  };
}

export class PrismaRepositorioUsuarios implements RepositorioUsuarios {
  constructor(private readonly prisma: Prisma) {}

  async buscarPorEmail(email: string) {
    const l = await this.prisma.usuario.findUnique({ where: { email }, select: CAMPOS });
    return l ? paraDominio(l) : null;
  }

  async buscarPorId(id: number) {
    const l = await this.prisma.usuario.findUnique({ where: { id }, select: CAMPOS });
    return l ? paraDominio(l) : null;
  }

  async buscarPorPublicId(publicId: string) {
    const l = await this.prisma.usuario.findUnique({ where: { publicId }, select: CAMPOS });
    return l ? paraDominio(l) : null;
  }

  async existeEmailOuCpf(email: string, cpfHash: string) {
    const total = await this.prisma.usuario.count({ where: { OR: [{ email }, { cpfHash }] } });
    return total > 0;
  }

  async criar(dados: NovoUsuario) {
    try {
      const l = await this.prisma.usuario.create({
        data: {
          nome: dados.nome,
          email: dados.email,
          telefone: dados.telefone,
          senhaHash: dados.senhaHash,
          cpfCifrado: Buffer.from(dados.cpf.cifrado),
          cpfIv: Buffer.from(dados.cpf.iv),
          cpfTag: Buffer.from(dados.cpf.tag),
          cpfHash: dados.cpfHash,
          dataNascCifrada: Buffer.from(dados.dataNasc.cifrado),
          dataNascIv: Buffer.from(dados.dataNasc.iv),
          dataNascTag: Buffer.from(dados.dataNasc.tag),
          ...dados.endereco,
          aceitouTermosEm: dados.aceitouTermosEm,
          consentimentoDadosEm: dados.consentimentoDadosEm,
        },
        select: CAMPOS,
      });
      return paraDominio(l);
    } catch (e) {
      // Corrida entre a checagem e o insert: o índice único decide.
      if (violouUnicidade(e))
        throw new ErroDominio('CONFLITO', 'CADASTRO_DUPLICADO', MENSAGEM_CONFLITO);
      throw e;
    }
  }

  async atualizarSenha(id: number, senhaHash: string) {
    await this.prisma.usuario.update({ where: { id }, data: { senhaHash } });
  }
}
