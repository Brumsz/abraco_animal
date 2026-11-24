/**
 * "Doar um animal" à ONG. Mesmas regras da API (que reaproveita as do cadastro de
 * animais): nome e raça até 80, descrição até 5000, motivo 20–3000, endereço 10–500,
 * idade até 50 anos, 1 a 10 fotos de até 5 MB.
 */
import { UPLOAD_IMAGENS } from '@abraco/shared';
import { z } from 'zod';

const obrigatorio = (rotulo: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Informe ${rotulo}`)
    .max(max, `No máximo ${String(max)} caracteres`);

const entre = (rotulo: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, `${rotulo}: escreva ao menos ${String(min)} caracteres`)
    .max(max, `No máximo ${String(max)} caracteres`);

const numero = (max: number, mensagem: string) =>
  z
    .string()
    .trim()
    .regex(/^\d{0,3}$/, 'Só números')
    .refine((v) => v === '' || Number(v) <= max, mensagem);

export const MAX_FOTOS = UPLOAD_IMAGENS.arquivosPorEnvio;

export const esquemaDoacaoAnimal = z
  .object({
    nomeAnimal: obrigatorio('o nome do animal', 80),
    tipo: z.enum(['EQUINO', 'CANINO', 'BOVINO', 'OUTRO'], { error: 'Escolha a espécie' }),
    raca: obrigatorio('a raça (ou "sem raça definida")', 80),
    anos: numero(50, 'Até 50 anos'),
    meses: numero(11, 'De 0 a 11 meses'),
    sexo: z.enum(['MACHO', 'FEMEA'], { error: 'Escolha o sexo' }),
    porte: z.enum(['PEQUENO', 'MEDIO', 'GRANDE', 'MUITO_GRANDE'], { error: 'Escolha o porte' }),
    descricao: obrigatorio('como ele é', 5000),
    motivoDoacao: entre('Motivo', 20, 3000),
    enderecoRetirada: entre('Endereço', 10, 500),
    fotos: z
      .array(z.object({ uri: z.string(), name: z.string(), type: z.string() }))
      .min(1, 'Envie ao menos uma foto do animal')
      .max(MAX_FOTOS, `No máximo ${String(MAX_FOTOS)} fotos`),
  })
  .refine((f) => f.anos !== '' || f.meses !== '', {
    path: ['anos'],
    message: 'Informe a idade aproximada',
  });

export type FormDoacaoAnimal = z.input<typeof esquemaDoacaoAnimal>;
export type FotoEscolhida = FormDoacaoAnimal['fotos'][number];

/** Separa os dados (JSON do multipart) das fotos; idade vira meses. */
export function dadosDoacao(f: z.output<typeof esquemaDoacaoAnimal>) {
  const { fotos, anos, meses, ...resto } = f;
  return {
    dados: { ...resto, idadeAprox: Number(anos || 0) * 12 + Number(meses || 0) },
    fotos,
  };
}
