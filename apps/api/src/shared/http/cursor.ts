/**
 * Cursor opaco de paginação: base64url de [data ISO, uuid]. Opaco para o app
 * (que só o devolve), mas não secreto — por isso usa publicId, nunca o id interno.
 */
import { z } from 'zod';

export interface PosicaoCursor {
  readonly criadoEm: Date;
  readonly publicId: string;
}

export function codificarCursor(p: PosicaoCursor): string {
  return Buffer.from(JSON.stringify([p.criadoEm.toISOString(), p.publicId])).toString('base64url');
}

const conteudo = z.tuple([z.iso.datetime(), z.uuid()]);

/** Campo de query `cursor`: cursor malformado → 400 (erro de validação do Zod). */
export const cursorEsquema = z
  .string()
  .max(200)
  .transform((valor, ctx): PosicaoCursor => {
    let json: unknown;
    try {
      json = JSON.parse(Buffer.from(valor, 'base64url').toString('utf8'));
    } catch {
      json = null;
    }
    const r = conteudo.safeParse(json);
    if (!r.success) {
      ctx.addIssue({ code: 'custom', message: 'Cursor inválido' });
      return z.NEVER;
    }
    return { criadoEm: new Date(r.data[0]), publicId: r.data[1] };
  });
