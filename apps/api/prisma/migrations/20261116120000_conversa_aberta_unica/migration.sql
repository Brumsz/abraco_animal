-- Uma conversa ABERTA por usuário (o Prisma não suporta índice parcial no schema).
-- Garante a regra mesmo com dois "abrir conversa" simultâneos.
CREATE UNIQUE INDEX "conversas_aberta_unica"
  ON "conversas" ("usuarioId")
  WHERE "status" = 'ABERTA';
