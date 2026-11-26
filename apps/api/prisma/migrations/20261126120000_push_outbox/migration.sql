-- Push (Etapa 11): as notificações do sino viram um outbox para o job de push.
ALTER TABLE "notificacoes" ADD COLUMN "pushEnviadoEm" TIMESTAMPTZ(3);

-- O que já existia antes do push NÃO é enviado (ninguém recebe push de coisa antiga).
UPDATE "notificacoes" SET "pushEnviadoEm" = "criadoEm";

-- Só as pendentes ficam no índice: o job acha o que enviar sem varrer a tabela.
CREATE INDEX "notificacoes_push_pendente" ON "notificacoes" ("criadoEm")
  WHERE "pushEnviadoEm" IS NULL;
