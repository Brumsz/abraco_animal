/**
 * Cliente tipado da API Abraço Animal.
 *
 * Os tipos vêm de `openapi.json`, GERADO das rotas reais da API
 * (`pnpm api:gerar` na raiz). Não edite `esquema.ts` nem `openapi.json` à mão.
 */
export { criarClienteApi, ok, type ClienteApi, type OpcoesCliente } from './cliente.js';
export { ErroApi, ErroRede, type ErroCampo } from './erros.js';
export {
  ChatTempoReal,
  type EstadoConexao,
  type EventoChat,
  type OpcoesChat,
  type SocketMinimo,
} from './chat-tempo-real.js';
export {
  criarPost,
  definirCapaNoticia,
  doarAnimal,
  enviarFotosAnimal,
  type ArquivoUpload,
} from './uploads.js';
export type * from './tipos.js';
export type { paths } from './esquema.js';
