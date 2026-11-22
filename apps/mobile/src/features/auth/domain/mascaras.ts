/** Máscaras de digitação (o formulário guarda o texto mascarado; envia só o necessário). */

export const soDigitos = (texto: string): string => texto.replace(/\D/g, '');

/** 123.456.789-09 */
export function mascararCpf(texto: string): string {
  const d = soDigitos(texto).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}

/** (11) 98765-4321 ou (11) 3456-7890 */
export function mascararTelefone(texto: string): string {
  const d = soDigitos(texto).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  const ddd = d.slice(0, 2);
  const numero = d.slice(2);
  const corte = numero.length > 8 ? 5 : 4;
  return numero.length > corte
    ? `(${ddd}) ${numero.slice(0, corte)}-${numero.slice(corte)}`
    : `(${ddd}) ${numero}`;
}

/** 31/12/1990 */
export function mascararData(texto: string): string {
  const d = soDigitos(texto).slice(0, 8);
  return d.replace(/^(\d{2})(\d)/, '$1/$2').replace(/^(\d{2})\/(\d{2})(\d)/, '$1/$2/$3');
}

/** "31/12/1990" → "1990-12-31" (formato da API); `null` se incompleta. */
export function dataParaIso(texto: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
  return m ? `${m[3] ?? ''}-${m[2] ?? ''}-${m[1] ?? ''}` : null;
}

/** 01001-000 */
export function mascararCep(texto: string): string {
  const d = soDigitos(texto).slice(0, 8);
  return d.replace(/^(\d{5})(\d)/, '$1-$2');
}
