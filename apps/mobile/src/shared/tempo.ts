/** "Há 2 horas", "Ontem", "12 de nov." — datas do feed e das notificações. */
const MESES = [
  'jan.',
  'fev.',
  'mar.',
  'abr.',
  'mai.',
  'jun.',
  'jul.',
  'ago.',
  'set.',
  'out.',
  'nov.',
  'dez.',
];

export function tempoRelativo(iso: string, agora: Date = new Date()): string {
  const data = new Date(iso);
  const segundos = Math.max(0, Math.floor((agora.getTime() - data.getTime()) / 1000));
  if (segundos < 60) return 'Agora há pouco';
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `Há ${String(minutos)} ${minutos === 1 ? 'minuto' : 'minutos'}`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `Há ${String(horas)} ${horas === 1 ? 'hora' : 'horas'}`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return 'Ontem';
  if (dias < 7) return `Há ${String(dias)} dias`;
  const mesmoAno = data.getFullYear() === agora.getFullYear();
  const base = `${String(data.getDate())} de ${MESES[data.getMonth()] ?? ''}`;
  return mesmoAno ? base : `${base} de ${String(data.getFullYear())}`;
}

/** "12/03/2024" (data local) — Jornal e históricos. */
export function dataCurta(iso: string): string {
  const d = new Date(iso);
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${String(d.getFullYear())}`;
}

/** "10:42" (hora local) — mensagens do chat. */
export function horaCurta(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Separador de dia do chat: "Hoje", "Ontem", "12 de nov." (ou com o ano). */
export function rotuloDia(iso: string, agora: Date = new Date()): string {
  const data = new Date(iso);
  const dias = Math.round((inicioDoDia(agora) - inicioDoDia(data)) / 86_400_000);
  if (dias === 0) return 'Hoje';
  if (dias === 1) return 'Ontem';
  const base = `${String(data.getDate())} de ${MESES[data.getMonth()] ?? ''}`;
  return data.getFullYear() === agora.getFullYear()
    ? base
    : `${base} de ${String(data.getFullYear())}`;
}

/** Mesmo dia local? (separadores do chat) */
export function mesmoDia(a: string, b: string): boolean {
  return inicioDoDia(new Date(a)) === inicioDoDia(new Date(b));
}
