import { z } from 'zod';

/** Validação do formulário de login (mensagens exibidas inline). */
export const esquemaLogin = z.object({
  email: z.string().trim().min(1, 'Informe seu e-mail').pipe(z.email('Informe um e-mail válido')),
  senha: z.string().min(1, 'Informe sua senha'),
});

export type DadosLogin = z.infer<typeof esquemaLogin>;
