-- Índice único parcial: um usuário não pode ter duas adoções PENDENTE
-- para o mesmo animal ao mesmo tempo. Prisma não suporta índice parcial
-- no schema; este SQL será anexado à primeira migração (Etapa 2).
CREATE UNIQUE INDEX "adocoes_pendente_unica"
  ON "adocoes" ("usuarioId", "animalId")
  WHERE "status" = 'PENDENTE' AND "removidoEm" IS NULL;
