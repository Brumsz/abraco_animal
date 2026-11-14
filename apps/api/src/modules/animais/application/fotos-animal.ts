/** Galeria de fotos do animal: envio, remoção e reordenação (admin). */
import { randomUUID } from 'node:crypto';

import { UPLOAD_IMAGENS } from '@abraco/shared';

import type { ArmazenamentoObjetos } from '../../../shared/aplicacao/armazenamento.js';
import { prepararImagens, type ProcessadorImagens } from '../../../shared/aplicacao/imagens.js';
import { ErroDominio, erroValidacao } from '../../../shared/dominio/erros.js';
import { exigirAdmin, type Ator } from '../../../shared/dominio/permissoes.js';
import { fotoSaida, type FotoSaida } from './apresentacao.js';
import { exigirAnimal } from './gerenciar-animais.js';
import type { RepositorioAnimais } from './portas.js';

interface Deps {
  readonly animais: RepositorioAnimais;
  readonly armazenamento: ArmazenamentoObjetos;
  readonly imagens: ProcessadorImagens;
  readonly gerarId?: () => string;
}

/** Remoção que não pode derrubar a operação principal; sobra = objeto órfão no bucket. */
async function removerSemFalhar(armazenamento: ArmazenamentoObjetos, chaves: readonly string[]) {
  try {
    await armazenamento.remover(chaves);
  } catch {
    // Objetos órfãos não são visíveis (bucket privado, sem URL). Limpeza periódica: Etapa 11.
  }
}

export class EnviarFotosAnimal {
  constructor(private readonly deps: Deps) {}

  async executar(entrada: {
    ator: Ator;
    id: string;
    arquivos: readonly Buffer[];
  }): Promise<FotoSaida[]> {
    exigirAdmin(entrada.ator);
    const animal = await exigirAnimal(this.deps.animais, entrada.id);
    if (entrada.arquivos.length === 0) {
      throw erroValidacao('NENHUM_ARQUIVO', 'Envie ao menos uma foto', 'fotos');
    }
    if (animal.fotos.length + entrada.arquivos.length > UPLOAD_IMAGENS.fotosPorAnimal) {
      throw new ErroDominio(
        'REGRA_NEGOCIO',
        'LIMITE_FOTOS',
        `Cada animal pode ter no máximo ${String(UPLOAD_IMAGENS.fotosPorAnimal)} fotos`,
        'fotos',
      );
    }

    const imagens = await prepararImagens(entrada.arquivos, this.deps.imagens);
    const gerarId = this.deps.gerarId ?? randomUUID;
    // Chave aleatória: não revela o nome original do arquivo nem permite adivinhar outras.
    const chaves = imagens.map((i) => `animais/${animal.publicId}/${gerarId()}.${i.extensao}`);

    try {
      await Promise.all(
        imagens.map((img, i) =>
          this.deps.armazenamento.enviar(chaves[i] ?? '', img.conteudo, img.tipoConteudo),
        ),
      );
      const fotos = await this.deps.animais.adicionarFotos(animal, chaves, {
        adminId: entrada.ator.id,
        acao: 'ANIMAL_FOTOS_ADICIONADAS',
        detalhe: { quantidade: chaves.length },
      });
      return await Promise.all(fotos.map((f) => fotoSaida(f, this.deps.armazenamento)));
    } catch (erro) {
      // Compensação: nada fica no bucket se o banco não registrou as fotos.
      await removerSemFalhar(this.deps.armazenamento, chaves);
      throw erro;
    }
  }
}

const fotoNaoEncontrada = () =>
  new ErroDominio('NAO_ENCONTRADO', 'FOTO_NAO_ENCONTRADA', 'Foto não encontrada');

export class RemoverFotoAnimal {
  constructor(private readonly deps: Omit<Deps, 'imagens'>) {}

  async executar(entrada: { ator: Ator; id: string; fotoId: string }): Promise<void> {
    exigirAdmin(entrada.ator);
    const animal = await exigirAnimal(this.deps.animais, entrada.id);
    const foto = animal.fotos.find((f) => f.publicId === entrada.fotoId);
    if (!foto) throw fotoNaoEncontrada();
    await this.deps.animais.removerFoto(animal, foto, {
      adminId: entrada.ator.id,
      acao: 'ANIMAL_FOTO_REMOVIDA',
      detalhe: { fotoId: foto.publicId },
    });
    // Só depois do commit: se o banco falhar, a foto continua íntegra.
    await removerSemFalhar(this.deps.armazenamento, [foto.chave]);
  }
}

export class ReordenarFotosAnimal {
  constructor(private readonly deps: Pick<Deps, 'animais'>) {}

  async executar(entrada: { ator: Ator; id: string; ids: readonly string[] }): Promise<void> {
    exigirAdmin(entrada.ator);
    const animal = await exigirAnimal(this.deps.animais, entrada.id);
    const atuais = new Set(animal.fotos.map((f) => f.publicId));
    const pedidos = new Set(entrada.ids);
    const mesmaLista =
      entrada.ids.length === atuais.size &&
      pedidos.size === atuais.size &&
      entrada.ids.every((id) => atuais.has(id));
    if (!mesmaLista) {
      throw erroValidacao(
        'REORDENACAO_INVALIDA',
        'Envie todas as fotos do animal, cada uma uma única vez',
        'ids',
      );
    }
    await this.deps.animais.reordenarFotos(animal, entrada.ids, {
      adminId: entrada.ator.id,
      acao: 'ANIMAL_FOTOS_REORDENADAS',
      detalhe: { ids: [...entrada.ids] },
    });
  }
}
