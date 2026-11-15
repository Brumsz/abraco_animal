-- Texto institucional OFICIAL da ONG (fornecido na especificação; preservado
-- sem alterações). Só a seção SOBRE_NOS: Fundação, Fundadores e FAQ ficam para
-- a equipe preencher no painel — nada é inventado sobre a ONG.
-- ON CONFLICT: não sobrescreve se a equipe já tiver editado a seção.
INSERT INTO "perfil_ong" ("secao", "titulo", "conteudo", "publicado", "atualizadoEm")
VALUES (
  'SOBRE_NOS',
  'Sobre nós',
  'Aqui na Abraço Animal, resgatamos cavalos e outros animais que precisam de cuidado especial após serem salvos de situações de abuso. Mantidos 100% por doações de nossos apoiadores, nossos animais foram, em maioria, resgatados de situações de abuso onde não estariam vivos hoje se não fosse pela nossa intervenção. Nossa líder – Karina Somaggio – se dedica integralmente a manter a ONG e seus animais, os quais trata como filhos, no melhor estado possível, alimentando e cuidando diariamente de todos que habitam o Santuário.',
  true,
  NOW()
)
ON CONFLICT ("secao") DO NOTHING;
