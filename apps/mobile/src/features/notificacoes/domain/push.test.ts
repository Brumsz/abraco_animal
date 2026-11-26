import { lerPayload, ROTA_PADRAO, rotaDoPush } from './push';

const ID = '11111111-1111-4111-8111-111111111111';

describe('toque no push', () => {
  it('cada tipo abre a sua tela', () => {
    expect(rotaDoPush({ notificacaoId: ID, tipo: 'ADOCAO_APROVADA', entidadeId: ID })).toBe(
      '/minhas-adocoes',
    );
    expect(rotaDoPush({ notificacaoId: ID, tipo: 'CHAT_NOVA_MENSAGEM', entidadeId: null })).toBe(
      '/chat',
    );
    expect(rotaDoPush({ notificacaoId: ID, tipo: 'DOACAO_FINANCEIRA_CONFIRMADA' })).toBe(
      '/minhas-doacoes',
    );
  });

  it('payload estranho nunca vira endereço: abre o sino', () => {
    expect(rotaDoPush({ notificacaoId: ID, tipo: 'https://malicioso.example' })).toBe(ROTA_PADRAO);
    expect(rotaDoPush({ tipo: 'ADOCAO_APROVADA', url: '/admin/usuarios' })).toBe(ROTA_PADRAO);
    expect(rotaDoPush(null)).toBe(ROTA_PADRAO);
    expect(rotaDoPush('ADOCAO_APROVADA')).toBe(ROTA_PADRAO);
    expect(lerPayload({ notificacaoId: 'x', tipo: 'GERAL' })).toBeNull();
  });
});
