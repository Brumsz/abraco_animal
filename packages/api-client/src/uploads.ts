/**
 * Uploads multipart (ficam fora do OpenAPI gerado: o corpo é lido como
 * stream na API). Os tipos de RESPOSTA continuam vindo do OpenAPI.
 *
 * No React Native um arquivo é `{ uri, name, type }`; no navegador/Node, Blob.
 * O tipo declarado não importa para a API: ela confere os magic bytes.
 */
import type { ClienteApi } from './cliente.js';
import { erroDaResposta } from './erros.js';
import type { Resposta } from './tipos.js';

export type ArquivoUpload =
  Blob | { readonly uri: string; readonly name: string; readonly type: string };

function anexar(form: FormData, campo: string, arquivo: ArquivoUpload, indice: number) {
  if (arquivo instanceof Blob) form.append(campo, arquivo, `foto-${String(indice)}.jpg`);
  // Formato de arquivo do React Native (FormData do RN aceita este objeto).
  else form.append(campo, arquivo as unknown as Blob);
}

async function enviar<T>(
  api: ClienteApi,
  metodo: 'POST' | 'PUT',
  caminho: string,
  form: FormData,
): Promise<T> {
  // Sem content-type manual: o fetch gera o boundary do multipart.
  const resposta = await api.fetchAutenticado(`${api.baseUrl}${caminho}`, {
    method: metodo,
    body: form,
  });
  const corpo: unknown = await resposta.json().catch(() => null);
  if (!resposta.ok) throw erroDaResposta(resposta, corpo);
  return corpo as T;
}

export function doarAnimal(
  api: ClienteApi,
  dados: {
    nomeAnimal: string;
    tipo: string;
    raca: string;
    idadeAprox: number;
    sexo: string;
    porte: string;
    descricao: string;
    motivoDoacao: string;
    enderecoRetirada: string;
  },
  fotos: readonly ArquivoUpload[],
) {
  const form = new FormData();
  form.append('dados', JSON.stringify(dados));
  fotos.forEach((f, i) => {
    anexar(form, 'fotos', f, i);
  });
  return enviar<Resposta<'/v1/doacoes-animais/{id}', 'get'>>(
    api,
    'POST',
    '/v1/doacoes-animais',
    form,
  );
}

export function enviarFotosAnimal(
  api: ClienteApi,
  animalId: string,
  fotos: readonly ArquivoUpload[],
) {
  const form = new FormData();
  fotos.forEach((f, i) => {
    anexar(form, 'fotos', f, i);
  });
  return enviar<Resposta<'/v1/admin/animais/{id}/fotos', 'post', 201>>(
    api,
    'POST',
    `/v1/admin/animais/${encodeURIComponent(animalId)}/fotos`,
    form,
  );
}

export function criarPost(api: ClienteApi, legenda: string, imagens: readonly ArquivoUpload[]) {
  const form = new FormData();
  form.append('legenda', legenda);
  imagens.forEach((f, i) => {
    anexar(form, 'imagens', f, i);
  });
  return enviar<Resposta<'/v1/admin/posts', 'post', 201>>(api, 'POST', '/v1/admin/posts', form);
}

export function definirCapaNoticia(api: ClienteApi, noticiaId: string, imagem: ArquivoUpload) {
  const form = new FormData();
  anexar(form, 'imagem', imagem, 0);
  return enviar<Resposta<'/v1/admin/noticias/{id}/imagem', 'put'>>(
    api,
    'PUT',
    `/v1/admin/noticias/${encodeURIComponent(noticiaId)}/imagem`,
    form,
  );
}
