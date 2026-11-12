import { ErroDominio, erroValidacao } from '../../../shared/dominio/erros.js';
import { Cpf } from '../../usuarios/domain/cpf.js';
import { Email } from '../../usuarios/domain/email.js';
import { dataDeNascimento, garantirIdadeMinima } from '../../usuarios/domain/idade.js';
import { validarPoliticaSenha } from '../../usuarios/domain/senha.js';
import { Telefone } from '../../usuarios/domain/telefone.js';
import type { CifradorDados, EnderecoUsuario, HasherSenha, RepositorioUsuarios } from './portas.js';
import { iniciarSessao, type DepsSessao, type SessaoEmitida } from './sessoes.js';

export interface EntradaCadastro {
  readonly nome: string;
  readonly dataNasc: string;
  readonly cpf: string;
  readonly telefone: string;
  readonly email: string;
  readonly senha: string;
  readonly endereco: EnderecoUsuario;
  readonly aceitouTermos: boolean;
  readonly consentimentoDados: boolean;
  readonly deviceId: string;
}

export interface DepsCadastro extends DepsSessao {
  readonly usuarios: RepositorioUsuarios;
  readonly hasher: HasherSenha;
  readonly cifrador: CifradorDados;
}

export const MENSAGEM_CONFLITO = 'Já existe uma conta com este e-mail ou CPF';

export class CadastrarUsuario {
  constructor(private readonly deps: DepsCadastro) {}

  async executar(entrada: EntradaCadastro): Promise<SessaoEmitida> {
    const { deps } = this;
    const agora = deps.relogio.agora();

    // LGPD: consentimentos explícitos e obrigatórios.
    if (!entrada.aceitouTermos) {
      throw erroValidacao(
        'TERMOS_NAO_ACEITOS',
        'É preciso aceitar os Termos de Uso',
        'aceitouTermos',
      );
    }
    if (!entrada.consentimentoDados) {
      throw erroValidacao(
        'CONSENTIMENTO_AUSENTE',
        'É preciso concordar com o tratamento dos dados',
        'consentimentoDados',
      );
    }

    const nome = entrada.nome.trim().replace(/\s+/g, ' ');
    if (nome.length < 3) throw erroValidacao('NOME_INVALIDO', 'Informe o nome completo', 'nome');
    const email = Email.criar(entrada.email);
    const cpf = Cpf.criar(entrada.cpf);
    const telefone = Telefone.criar(entrada.telefone);
    const nascimento = dataDeNascimento(entrada.dataNasc);
    garantirIdadeMinima(nascimento, agora);
    validarPoliticaSenha(entrada.senha);

    const cpfHash = deps.cifrador.indiceCpf(cpf.digitos);
    if (await deps.usuarios.existeEmailOuCpf(email.valor, cpfHash)) {
      throw new ErroDominio('CONFLITO', 'CADASTRO_DUPLICADO', MENSAGEM_CONFLITO);
    }

    const usuario = await deps.usuarios.criar({
      nome,
      email: email.valor,
      telefone: telefone.digitos,
      senhaHash: await deps.hasher.gerar(entrada.senha),
      cpf: deps.cifrador.cifrar(cpf.digitos),
      cpfHash,
      dataNasc: deps.cifrador.cifrar(entrada.dataNasc),
      endereco: {
        ...entrada.endereco,
        cep: entrada.endereco.cep.replace(/\D/g, ''),
        uf: entrada.endereco.uf.toUpperCase(),
      },
      aceitouTermosEm: agora,
      consentimentoDadosEm: agora,
    });

    return iniciarSessao(deps, usuario, entrada.deviceId);
  }
}
