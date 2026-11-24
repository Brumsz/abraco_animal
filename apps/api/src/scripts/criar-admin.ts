/**
 * Promove uma conta já cadastrada (pelo app) a ADMIN.
 *
 *   pnpm --filter @abraco/api criar-admin karina@abraco.org
 *
 * É o único jeito de criar o PRIMEIRO admin: depois dele, os papéis mudam pelo
 * painel (PATCH /v1/admin/usuarios/{id}/role, com auditoria). Roda no servidor,
 * por quem já tem acesso ao banco — não é exposto pela API.
 */
import { criarInfraScript, falhar, informar } from './infra-script.js';

const email = process.argv[2]?.trim().toLowerCase();
if (!email?.includes('@')) {
  falhar('Uso: pnpm --filter @abraco/api criar-admin <e-mail da conta>');
  process.exit(1);
}

const { prisma } = criarInfraScript();
try {
  const usuario = await prisma.usuario.findUnique({
    where: { email },
    select: { id: true, role: true, ativo: true, removidoEm: true },
  });
  if (!usuario || usuario.removidoEm) {
    falhar('Nenhuma conta com este e-mail. Crie a conta pelo app primeiro.');
    process.exitCode = 1;
  } else if (!usuario.ativo) {
    falhar('Esta conta está desativada.');
    process.exitCode = 1;
  } else if (usuario.role === 'ADMIN') {
    informar('Esta conta já é admin.');
  } else {
    await prisma.usuario.update({ where: { id: usuario.id }, data: { role: 'ADMIN' } });
    informar('Pronto: a conta agora é admin. Saia e entre de novo no app.');
  }
} finally {
  await prisma.$disconnect();
}
