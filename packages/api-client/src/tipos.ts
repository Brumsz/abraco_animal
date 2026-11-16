/**
 * Apelidos dos tipos gerados (esquema.ts), com os nomes do domínio. Tudo
 * deriva do OpenAPI gerado das rotas: se a API mudar, o app deixa de compilar.
 */
import type { paths } from './esquema.js';

type Json<T> = T extends { content: { 'application/json': infer C } } ? C : never;

/** Corpo JSON da resposta `S` de `metodo` em `caminho`. */
export type Resposta<
  P extends keyof paths,
  M extends keyof paths[P],
  S extends number = 200,
> = paths[P][M] extends { responses: infer R } ? (S extends keyof R ? Json<R[S]> : never) : never;

/** Corpo JSON da requisição. */
export type Corpo<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends {
  requestBody?: infer B;
}
  ? Json<NonNullable<B>>
  : never;

export type Sessao = Resposta<'/v1/auth/login', 'post'>;
export type UsuarioPerfil = Resposta<'/v1/me', 'get'>;
export type PaginaAnimais = Resposta<'/v1/animais', 'get'>;
export type AnimalResumo = PaginaAnimais['itens'][number];
export type AnimalDetalhe = Resposta<'/v1/animais/{id}', 'get'>;
export type Foto = AnimalDetalhe['fotos'][number];
export type Adocao = Resposta<'/v1/adocoes/{id}', 'get'>;
export type DoacaoAnimal = Resposta<'/v1/doacoes-animais/{id}', 'get'>;
export type DoacaoFinanceira = Resposta<'/v1/doacoes-financeiras', 'post', 201>;
export type StatusPix = Resposta<'/v1/doacoes-financeiras/{id}/status', 'get'>;
export type Apadrinhamento = Resposta<'/v1/me/apadrinhamentos', 'get'>[number];
export type Padrinho = Resposta<'/v1/animais/{id}/padrinhos', 'get'>[number];
export type Candidatura = Resposta<'/v1/me/voluntariado', 'get'>;
export type SecaoPerfilOng = Resposta<'/v1/institucional/perfil', 'get'>[number];
export type PerguntaFaq = Resposta<'/v1/institucional/faq', 'get'>[number];
export type Post = Resposta<'/v1/posts/{id}', 'get'>;
export type Noticia = Resposta<'/v1/noticias/{slug}', 'get'>;
export type Notificacao = Resposta<'/v1/notificacoes', 'get'>['itens'][number];
export type Conversa = Resposta<'/v1/conversas', 'get'>[number];
export type Mensagem = Resposta<'/v1/conversas/{id}/mensagens', 'post', 201>;
export type Dashboard = Resposta<'/v1/admin/dashboard', 'get'>;
