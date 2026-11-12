-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USUARIO', 'VOLUNTARIO', 'ADMIN');

-- CreateEnum
CREATE TYPE "TipoAnimal" AS ENUM ('EQUINO', 'CANINO', 'BOVINO', 'OUTRO');

-- CreateEnum
CREATE TYPE "Sexo" AS ENUM ('MACHO', 'FEMEA');

-- CreateEnum
CREATE TYPE "Porte" AS ENUM ('PEQUENO', 'MEDIO', 'GRANDE', 'MUITO_GRANDE');

-- CreateEnum
CREATE TYPE "StatusAnimal" AS ENUM ('DISPONIVEL', 'EM_TRATAMENTO', 'ADOTADO', 'INDISPONIVEL');

-- CreateEnum
CREATE TYPE "StatusAdocao" AS ENUM ('PENDENTE', 'APROVADA', 'RECUSADA');

-- CreateEnum
CREATE TYPE "TipoMoradia" AS ENUM ('CASA_COM_QUINTAL', 'CASA_SEM_QUINTAL', 'APARTAMENTO', 'CHACARA', 'FAZENDA');

-- CreateEnum
CREATE TYPE "StatusDoacaoAnimal" AS ENUM ('PENDENTE', 'APROVADA', 'RECUSADA', 'RECEBIDA');

-- CreateEnum
CREATE TYPE "StatusDoacaoFinanceira" AS ENUM ('PENDENTE', 'CONFIRMADA', 'EXPIRADA');

-- CreateEnum
CREATE TYPE "StatusConversa" AS ENUM ('ABERTA', 'ENCERRADA');

-- CreateEnum
CREATE TYPE "SecaoPerfilOng" AS ENUM ('SOBRE_NOS', 'FUNDACAO', 'FUNDADORES');

-- CreateEnum
CREATE TYPE "TipoNotificacao" AS ENUM ('ADOCAO_APROVADA', 'ADOCAO_RECUSADA', 'ADOCAO_ANIMAL_ADOTADO', 'DOACAO_ANIMAL_ATUALIZADA', 'DOACAO_FINANCEIRA_CONFIRMADA', 'VOLUNTARIADO_ATUALIZADO', 'CHAT_NOVA_MENSAGEM', 'GERAL');

-- CreateEnum
CREATE TYPE "StatusVoluntario" AS ENUM ('PENDENTE', 'APROVADO', 'RECUSADO');

-- CreateEnum
CREATE TYPE "AreaInteresse" AS ENUM ('CUIDADO_ANIMAIS', 'EVENTOS', 'REDES_SOCIAIS', 'TRANSPORTE', 'CAPTACAO_RECURSOS', 'OUTROS');

-- CreateEnum
CREATE TYPE "DiaSemana" AS ENUM ('DOMINGO', 'SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO');

-- CreateEnum
CREATE TYPE "Turno" AS ENUM ('MANHA', 'TARDE', 'NOITE');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "publicId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "cpfCifrado" BYTEA NOT NULL,
    "cpfIv" BYTEA NOT NULL,
    "cpfTag" BYTEA NOT NULL,
    "cpfHash" TEXT NOT NULL,
    "dataNascCifrada" BYTEA NOT NULL,
    "dataNascIv" BYTEA NOT NULL,
    "dataNascTag" BYTEA NOT NULL,
    "cep" TEXT NOT NULL,
    "logradouro" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "complemento" TEXT,
    "bairro" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "uf" CHAR(2) NOT NULL,
    "fotoUrl" TEXT,
    "capaUrl" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USUARIO',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "aceitouTermosEm" TIMESTAMPTZ(3) NOT NULL,
    "consentimentoDadosEm" TIMESTAMPTZ(3) NOT NULL,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "removidoEm" TIMESTAMPTZ(3),

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessoes" (
    "id" SERIAL NOT NULL,
    "sid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuarioId" INTEGER NOT NULL,
    "deviceId" TEXT NOT NULL,
    "criadaEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoUso" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revogadaEm" TIMESTAMPTZ(3),

    CONSTRAINT "sessoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" SERIAL NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "sessaoId" INTEGER NOT NULL,
    "familiaId" UUID NOT NULL,
    "substituidoPorId" INTEGER,
    "expiraEm" TIMESTAMPTZ(3) NOT NULL,
    "usadoEm" TIMESTAMPTZ(3),
    "revogadoEm" TIMESTAMPTZ(3),
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recuperacoes_senha" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "codigoHash" TEXT NOT NULL,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "expiraEm" TIMESTAMPTZ(3) NOT NULL,
    "usadoEm" TIMESTAMPTZ(3),
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recuperacoes_senha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "animais" (
    "id" SERIAL NOT NULL,
    "publicId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "tipo" "TipoAnimal" NOT NULL,
    "raca" TEXT NOT NULL,
    "idadeAprox" INTEGER NOT NULL,
    "sexo" "Sexo" NOT NULL,
    "porte" "Porte" NOT NULL,
    "descricao" TEXT NOT NULL,
    "historiaResgate" TEXT NOT NULL,
    "vacinado" BOOLEAN NOT NULL DEFAULT false,
    "castrado" BOOLEAN NOT NULL DEFAULT false,
    "status" "StatusAnimal" NOT NULL DEFAULT 'DISPONIVEL',
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "removidoEm" TIMESTAMPTZ(3),

    CONSTRAINT "animais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "animal_fotos" (
    "id" SERIAL NOT NULL,
    "publicId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "animalId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "animal_fotos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adocoes" (
    "id" SERIAL NOT NULL,
    "publicId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuarioId" INTEGER,
    "animalId" INTEGER NOT NULL,
    "status" "StatusAdocao" NOT NULL DEFAULT 'PENDENTE',
    "motivo" TEXT NOT NULL,
    "tipoMoradia" "TipoMoradia" NOT NULL,
    "possuiEspacoAdequado" BOOLEAN NOT NULL,
    "outrosAnimais" TEXT,
    "termoAceitoEm" TIMESTAMPTZ(3) NOT NULL,
    "analisadoPorId" INTEGER,
    "analisadoEm" TIMESTAMPTZ(3),
    "motivoRecusa" TEXT,
    "recusaAutomatica" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "removidoEm" TIMESTAMPTZ(3),

    CONSTRAINT "adocoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doacoes_animais" (
    "id" SERIAL NOT NULL,
    "publicId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuarioId" INTEGER,
    "nomeAnimal" TEXT NOT NULL,
    "tipo" "TipoAnimal" NOT NULL,
    "raca" TEXT NOT NULL,
    "idadeAprox" INTEGER NOT NULL,
    "sexo" "Sexo" NOT NULL,
    "porte" "Porte" NOT NULL,
    "descricao" TEXT NOT NULL,
    "motivoDoacao" TEXT NOT NULL,
    "enderecoRetirada" TEXT NOT NULL,
    "status" "StatusDoacaoAnimal" NOT NULL DEFAULT 'PENDENTE',
    "analisadoPorId" INTEGER,
    "analisadoEm" TIMESTAMPTZ(3),
    "motivoRecusa" TEXT,
    "animalCriadoId" INTEGER,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "doacoes_animais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doacao_animal_fotos" (
    "id" SERIAL NOT NULL,
    "publicId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "doacaoId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doacao_animal_fotos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doacoes_financeiras" (
    "id" SERIAL NOT NULL,
    "publicId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuarioId" INTEGER,
    "nomeDoador" TEXT,
    "emailDoador" TEXT,
    "anonima" BOOLEAN NOT NULL DEFAULT false,
    "valor" DECIMAL(10,2) NOT NULL,
    "status" "StatusDoacaoFinanceira" NOT NULL DEFAULT 'PENDENTE',
    "pixCopiaCola" TEXT NOT NULL,
    "pixQrCodeUrl" TEXT,
    "pspTxId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "paidAt" TIMESTAMPTZ(3),
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "doacoes_financeiras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_eventos" (
    "id" SERIAL NOT NULL,
    "provedor" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "recebidoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apadrinhamentos" (
    "id" SERIAL NOT NULL,
    "publicId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuarioId" INTEGER NOT NULL,
    "animalId" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "mensagemPadrinho" TEXT,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "apadrinhamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voluntarios" (
    "id" SERIAL NOT NULL,
    "publicId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuarioId" INTEGER NOT NULL,
    "cargo" TEXT,
    "status" "StatusVoluntario" NOT NULL DEFAULT 'PENDENTE',
    "areasInteresse" "AreaInteresse"[],
    "areaInteresseOutros" TEXT,
    "disponibilidadeDias" "DiaSemana"[],
    "turnos" "Turno"[],
    "motivacao" TEXT NOT NULL,
    "habilidades" TEXT,
    "analisadoPorId" INTEGER,
    "analisadoEm" TIMESTAMPTZ(3),
    "motivoRecusa" TEXT,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "voluntarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversas" (
    "id" SERIAL NOT NULL,
    "publicId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuarioId" INTEGER NOT NULL,
    "adminId" INTEGER,
    "status" "StatusConversa" NOT NULL DEFAULT 'ABERTA',
    "assunto" TEXT,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "conversas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagens" (
    "id" SERIAL NOT NULL,
    "publicId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversaId" INTEGER NOT NULL,
    "autorId" INTEGER NOT NULL,
    "conteudo" TEXT NOT NULL,
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "lidaEm" TIMESTAMPTZ(3),
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" SERIAL NOT NULL,
    "publicId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "legenda" TEXT NOT NULL,
    "publicado" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_imagens" (
    "id" SERIAL NOT NULL,
    "publicId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "postId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_imagens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curtidas" (
    "id" SERIAL NOT NULL,
    "postId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "curtidas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "noticias" (
    "id" SERIAL NOT NULL,
    "publicId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "resumo" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "imagem" TEXT,
    "publicado" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "noticias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perfil_ong" (
    "id" SERIAL NOT NULL,
    "publicId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "secao" "SecaoPerfilOng" NOT NULL,
    "titulo" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "publicado" BOOLEAN NOT NULL DEFAULT true,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "perfil_ong_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faqs" (
    "id" SERIAL NOT NULL,
    "publicId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pergunta" TEXT NOT NULL,
    "resposta" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "publicado" BOOLEAN NOT NULL DEFAULT true,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "faqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacoes" (
    "id" SERIAL NOT NULL,
    "publicId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuarioId" INTEGER NOT NULL,
    "tipo" "TipoNotificacao" NOT NULL,
    "titulo" TEXT NOT NULL,
    "corpo" TEXT NOT NULL,
    "entidadeId" UUID,
    "lidaEm" TIMESTAMPTZ(3),
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispositivos_push" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "deviceId" TEXT NOT NULL,
    "expoToken" TEXT NOT NULL,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispositivos_push_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "publicId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "adminId" INTEGER NOT NULL,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "detalhe" JSONB,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_publicId_key" ON "usuarios"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_cpfHash_key" ON "usuarios"("cpfHash");

-- CreateIndex
CREATE INDEX "usuarios_role_ativo_idx" ON "usuarios"("role", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "sessoes_sid_key" ON "sessoes"("sid");

-- CreateIndex
CREATE INDEX "sessoes_usuarioId_idx" ON "sessoes"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_substituidoPorId_key" ON "refresh_tokens"("substituidoPorId");

-- CreateIndex
CREATE INDEX "refresh_tokens_familiaId_idx" ON "refresh_tokens"("familiaId");

-- CreateIndex
CREATE INDEX "recuperacoes_senha_usuarioId_criadoEm_idx" ON "recuperacoes_senha"("usuarioId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "animais_publicId_key" ON "animais"("publicId");

-- CreateIndex
CREATE INDEX "animais_status_tipo_porte_sexo_idx" ON "animais"("status", "tipo", "porte", "sexo");

-- CreateIndex
CREATE INDEX "animais_criadoEm_id_idx" ON "animais"("criadoEm", "id");

-- CreateIndex
CREATE UNIQUE INDEX "animal_fotos_publicId_key" ON "animal_fotos"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "animal_fotos_animalId_ordem_key" ON "animal_fotos"("animalId", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "adocoes_publicId_key" ON "adocoes"("publicId");

-- CreateIndex
CREATE INDEX "adocoes_usuarioId_criadoEm_idx" ON "adocoes"("usuarioId", "criadoEm");

-- CreateIndex
CREATE INDEX "adocoes_status_criadoEm_idx" ON "adocoes"("status", "criadoEm");

-- CreateIndex
CREATE INDEX "adocoes_animalId_idx" ON "adocoes"("animalId");

-- CreateIndex
CREATE UNIQUE INDEX "doacoes_animais_publicId_key" ON "doacoes_animais"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "doacoes_animais_animalCriadoId_key" ON "doacoes_animais"("animalCriadoId");

-- CreateIndex
CREATE INDEX "doacoes_animais_usuarioId_criadoEm_idx" ON "doacoes_animais"("usuarioId", "criadoEm");

-- CreateIndex
CREATE INDEX "doacoes_animais_status_criadoEm_idx" ON "doacoes_animais"("status", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "doacao_animal_fotos_publicId_key" ON "doacao_animal_fotos"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "doacao_animal_fotos_doacaoId_ordem_key" ON "doacao_animal_fotos"("doacaoId", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "doacoes_financeiras_publicId_key" ON "doacoes_financeiras"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "doacoes_financeiras_pspTxId_key" ON "doacoes_financeiras"("pspTxId");

-- CreateIndex
CREATE UNIQUE INDEX "doacoes_financeiras_idempotencyKey_key" ON "doacoes_financeiras"("idempotencyKey");

-- CreateIndex
CREATE INDEX "doacoes_financeiras_usuarioId_criadoEm_idx" ON "doacoes_financeiras"("usuarioId", "criadoEm");

-- CreateIndex
CREATE INDEX "doacoes_financeiras_status_expiresAt_idx" ON "doacoes_financeiras"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_eventos_provedor_eventoId_key" ON "webhook_eventos"("provedor", "eventoId");

-- CreateIndex
CREATE UNIQUE INDEX "apadrinhamentos_publicId_key" ON "apadrinhamentos"("publicId");

-- CreateIndex
CREATE INDEX "apadrinhamentos_animalId_ativo_idx" ON "apadrinhamentos"("animalId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "apadrinhamentos_usuarioId_animalId_key" ON "apadrinhamentos"("usuarioId", "animalId");

-- CreateIndex
CREATE UNIQUE INDEX "voluntarios_publicId_key" ON "voluntarios"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "voluntarios_usuarioId_key" ON "voluntarios"("usuarioId");

-- CreateIndex
CREATE INDEX "voluntarios_status_criadoEm_idx" ON "voluntarios"("status", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "conversas_publicId_key" ON "conversas"("publicId");

-- CreateIndex
CREATE INDEX "conversas_status_atualizadoEm_idx" ON "conversas"("status", "atualizadoEm");

-- CreateIndex
CREATE INDEX "conversas_usuarioId_idx" ON "conversas"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "mensagens_publicId_key" ON "mensagens"("publicId");

-- CreateIndex
CREATE INDEX "mensagens_conversaId_criadoEm_idx" ON "mensagens"("conversaId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "posts_publicId_key" ON "posts"("publicId");

-- CreateIndex
CREATE INDEX "posts_publicado_criadoEm_idx" ON "posts"("publicado", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "post_imagens_publicId_key" ON "post_imagens"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "post_imagens_postId_ordem_key" ON "post_imagens"("postId", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "curtidas_postId_usuarioId_key" ON "curtidas"("postId", "usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "noticias_publicId_key" ON "noticias"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "noticias_slug_key" ON "noticias"("slug");

-- CreateIndex
CREATE INDEX "noticias_publicado_criadoEm_idx" ON "noticias"("publicado", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "perfil_ong_publicId_key" ON "perfil_ong"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "perfil_ong_secao_key" ON "perfil_ong"("secao");

-- CreateIndex
CREATE UNIQUE INDEX "faqs_publicId_key" ON "faqs"("publicId");

-- CreateIndex
CREATE INDEX "faqs_publicado_ordem_idx" ON "faqs"("publicado", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "notificacoes_publicId_key" ON "notificacoes"("publicId");

-- CreateIndex
CREATE INDEX "notificacoes_usuarioId_criadoEm_idx" ON "notificacoes"("usuarioId", "criadoEm");

-- CreateIndex
CREATE INDEX "notificacoes_usuarioId_lidaEm_idx" ON "notificacoes"("usuarioId", "lidaEm");

-- CreateIndex
CREATE UNIQUE INDEX "dispositivos_push_expoToken_key" ON "dispositivos_push"("expoToken");

-- CreateIndex
CREATE UNIQUE INDEX "dispositivos_push_usuarioId_deviceId_key" ON "dispositivos_push"("usuarioId", "deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_publicId_key" ON "audit_logs"("publicId");

-- CreateIndex
CREATE INDEX "audit_logs_adminId_criadoEm_idx" ON "audit_logs"("adminId", "criadoEm");

-- CreateIndex
CREATE INDEX "audit_logs_entidade_entidadeId_idx" ON "audit_logs"("entidade", "entidadeId");

-- CreateIndex
CREATE INDEX "audit_logs_criadoEm_idx" ON "audit_logs"("criadoEm");

-- AddForeignKey
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES "sessoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_substituidoPorId_fkey" FOREIGN KEY ("substituidoPorId") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recuperacoes_senha" ADD CONSTRAINT "recuperacoes_senha_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animal_fotos" ADD CONSTRAINT "animal_fotos_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "animais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adocoes" ADD CONSTRAINT "adocoes_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adocoes" ADD CONSTRAINT "adocoes_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "animais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adocoes" ADD CONSTRAINT "adocoes_analisadoPorId_fkey" FOREIGN KEY ("analisadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doacoes_animais" ADD CONSTRAINT "doacoes_animais_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doacoes_animais" ADD CONSTRAINT "doacoes_animais_analisadoPorId_fkey" FOREIGN KEY ("analisadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doacoes_animais" ADD CONSTRAINT "doacoes_animais_animalCriadoId_fkey" FOREIGN KEY ("animalCriadoId") REFERENCES "animais"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doacao_animal_fotos" ADD CONSTRAINT "doacao_animal_fotos_doacaoId_fkey" FOREIGN KEY ("doacaoId") REFERENCES "doacoes_animais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doacoes_financeiras" ADD CONSTRAINT "doacoes_financeiras_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apadrinhamentos" ADD CONSTRAINT "apadrinhamentos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apadrinhamentos" ADD CONSTRAINT "apadrinhamentos_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "animais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voluntarios" ADD CONSTRAINT "voluntarios_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voluntarios" ADD CONSTRAINT "voluntarios_analisadoPorId_fkey" FOREIGN KEY ("analisadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "conversas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_imagens" ADD CONSTRAINT "post_imagens_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curtidas" ADD CONSTRAINT "curtidas_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curtidas" ADD CONSTRAINT "curtidas_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispositivos_push" ADD CONSTRAINT "dispositivos_push_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Manual: Prisma não suporta índice único parcial no schema ───
-- Um usuário não pode ter duas adoções PENDENTE para o mesmo animal ao mesmo tempo.
CREATE UNIQUE INDEX "adocoes_pendente_unica"
  ON "adocoes" ("usuarioId", "animalId")
  WHERE "status" = 'PENDENTE' AND "removidoEm" IS NULL;
