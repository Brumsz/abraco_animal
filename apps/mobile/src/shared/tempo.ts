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
