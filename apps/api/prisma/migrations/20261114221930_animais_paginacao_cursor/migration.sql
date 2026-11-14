-- DropIndex
DROP INDEX "animais_criadoEm_id_idx";

-- DropIndex
DROP INDEX "animais_status_tipo_porte_sexo_idx";

-- CreateIndex
CREATE INDEX "animais_status_criadoEm_publicId_idx" ON "animais"("status", "criadoEm" DESC, "publicId" DESC);

-- CreateIndex
CREATE INDEX "animais_criadoEm_publicId_idx" ON "animais"("criadoEm" DESC, "publicId" DESC);
