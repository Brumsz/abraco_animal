import { useEffect, useState } from 'react';

/** Valor que só muda depois de `ms` sem alteração (busca enquanto digita, sem uma chamada por letra). */
export function useAtrasado<T>(valor: T, ms = 400): T {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => {
      setAtrasado(valor);
    }, ms);
    return () => {
      clearTimeout(t);
    };
  }, [valor, ms]);
  return atrasado;
}
