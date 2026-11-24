/**
 * Dados de exemplo (animais com foto, posts publicados e uma notícia) para
 * desenvolvimento e demonstração. Usa os MESMOS casos de uso da API: as fotos
 * passam pelo processamento de imagens e cada ação fica na auditoria do admin.
 *
 *   pnpm --filter @abraco/api semear
 *
 * Exige um admin (pnpm --filter @abraco/api criar-admin <e-mail>). Não roda se
 * já houver animais cadastrados — nunca mistura exemplos com dados reais.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { CriarAnimal } from '../modules/animais/application/gerenciar-animais.js';
import { EnviarFotosAnimal } from '../modules/animais/application/fotos-animal.js';
import { PrismaRepositorioAnimais } from '../modules/animais/infrastructure/prisma-repositorio-animais.js';
import { CriarPost, PublicarPost } from '../modules/feed/application/casos-de-uso.js';
import { PrismaRepositorioPosts } from '../modules/feed/infrastructure/prisma-repositorio-posts.js';
import { CriarNoticia, PublicarNoticia } from '../modules/noticias/application/casos-de-uso.js';
import { PrismaRepositorioNoticias } from '../modules/noticias/infrastructure/prisma-repositorio-noticias.js';
import { relogioSistema } from '../shared/aplicacao/relogio.js';
import { ProcessadorImagensSharp } from '../shared/infra/processador-imagens-sharp.js';
import { ANIMAIS_EXEMPLO, NOTICIAS_EXEMPLO, POSTS_EXEMPLO } from './dados-exemplo.js';
import { criarInfraScript, falhar, informar, PASTA_SEMENTE } from './infra-script.js';

const { ambiente, prisma, armazenamento } = criarInfraScript();
if (ambiente.NODE_ENV === 'production') {
  falhar('Dados de exemplo não podem ser criados em produção.');
  process.exit(1);
}

const foto = (nome: string) => readFile(join(PASTA_SEMENTE, nome));

try {
  const admin = await prisma.usuario.findFirst({
    where: { role: 'ADMIN', ativo: true, removidoEm: null },
    select: { publicId: true },
    orderBy: { id: 'asc' },
  });
  if (!admin) {
    falhar('Nenhum admin. Rode antes: pnpm --filter @abraco/api criar-admin <e-mail>');
    process.exitCode = 1;
  } else if ((await prisma.animal.count({ where: { removidoEm: null } })) > 0) {
    informar('Já existem animais cadastrados: nada a fazer.');
  } else {
    const ator = { id: admin.publicId, role: 'ADMIN' as const };
    const imagens = new ProcessadorImagensSharp();
    const depsAnimais = {
      animais: new PrismaRepositorioAnimais(prisma),
      armazenamento,
      imagens,
      relogio: relogioSistema,
    };
    const criarAnimal = new CriarAnimal(depsAnimais);
    const enviarFotos = new EnviarFotosAnimal(depsAnimais);
    for (const a of ANIMAIS_EXEMPLO) {
      const animal = await criarAnimal.executar({
        ator,
        dados: a.dados,
        ...(a.status ? { status: a.status } : {}),
      });
      await enviarFotos.executar({ ator, id: animal.id, arquivos: [await foto(a.foto)] });
      informar(`Animal: ${a.dados.nome}`);
    }

    const depsPosts = { posts: new PrismaRepositorioPosts(prisma), armazenamento, imagens };
    const criarPost = new CriarPost(depsPosts);
    const publicarPost = new PublicarPost(depsPosts);
    for (const p of POSTS_EXEMPLO) {
      const arquivos = await Promise.all(p.fotos.map(foto));
      const post = await criarPost.executar({ ator, legenda: p.legenda, arquivos });
      await publicarPost.executar({ ator, id: post.id, publicado: true });
    }
    informar(`Posts: ${String(POSTS_EXEMPLO.length)}`);

    const depsNoticias = {
      noticias: new PrismaRepositorioNoticias(prisma),
      armazenamento,
      imagens,
    };
    const criarNoticia = new CriarNoticia(depsNoticias);
    const publicarNoticia = new PublicarNoticia(depsNoticias);
    for (const n of NOTICIAS_EXEMPLO) {
      const noticia = await criarNoticia.executar({ ator, ...n });
      await publicarNoticia.executar({ ator, id: noticia.id, publicado: true });
    }
    informar(`Notícias: ${String(NOTICIAS_EXEMPLO.length)}`);
  }
} finally {
  await prisma.$disconnect();
}
