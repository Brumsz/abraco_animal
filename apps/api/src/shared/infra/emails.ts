import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import nodemailer from 'nodemailer';

import type { FilaEmails } from '../../modules/auth/application/portas.js';
import type { DestinatarioEmail, EmailsAdocao } from '../aplicacao/emails-adocao.js';
import type { EmailsDoacaoAnimal } from '../aplicacao/emails-doacao-animal.js';
import type { EmailsVoluntariado } from '../aplicacao/emails-voluntariado.js';
import type { EmailsDoacaoFinanceira } from '../../modules/doacoes-financeiras/application/portas.js';

const FILA = 'emails';

type Job =
  | {
      readonly tipo: 'codigoRecuperacao';
      readonly para: string;
      readonly nome: string;
      readonly codigo: string;
    }
  | { readonly tipo: 'senhaAlterada'; readonly para: string; readonly nome: string }
  | (DestinatarioEmail & {
      readonly tipo:
        | 'adocaoRecebida'
        | 'adocaoAprovada'
        | 'adocaoEncerrada'
        | 'doacaoEnviada'
        | 'doacaoAprovada'
        | 'doacaoConcluida';
      readonly animal: string;
    })
  | (DestinatarioEmail & {
      readonly tipo: 'adocaoRecusada' | 'doacaoRecusada';
      readonly animal: string;
      readonly motivo: string;
    })
  | (DestinatarioEmail & { readonly tipo: 'candidaturaRecebida' })
  | (DestinatarioEmail & { readonly tipo: 'voluntarioAprovado'; readonly cargo: string | null })
  | (DestinatarioEmail & { readonly tipo: 'voluntarioRecusado'; readonly motivo: string })
  | (DestinatarioEmail & {
      readonly tipo: 'comprovanteDoacao';
      /** Já formatado ("R$ 50,00"). */
      readonly valor: string;
      /** ISO 8601 (o job é serializado em JSON no Redis). */
      readonly data: string;
    });

/**
 * Produtor da fila de e-mails. O job sai da fila assim que é enviado
 * (removeOnComplete) — o código de recuperação não fica guardado no Redis.
 */
export class FilaEmailsBullmq
  implements
    FilaEmails,
    EmailsAdocao,
    EmailsDoacaoAnimal,
    EmailsDoacaoFinanceira,
    EmailsVoluntariado
{
  private readonly fila: Queue<Job>;

  constructor(conexao: ConnectionOptions) {
    this.fila = new Queue<Job>(FILA, {
      connection: conexao,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: { age: 24 * 3600 },
      },
    });
  }

  async codigoRecuperacao(dados: { para: string; nome: string; codigo: string }) {
    await this.fila.add('codigoRecuperacao', { tipo: 'codigoRecuperacao', ...dados });
  }

  async senhaAlterada(dados: { para: string; nome: string }) {
    await this.fila.add('senhaAlterada', { tipo: 'senhaAlterada', ...dados });
  }

  async adocaoRecebida(d: DestinatarioEmail & { animal: string }) {
    await this.fila.add('adocaoRecebida', { tipo: 'adocaoRecebida', ...d });
  }

  async adocaoAprovada(d: DestinatarioEmail & { animal: string }) {
    await this.fila.add('adocaoAprovada', { tipo: 'adocaoAprovada', ...d });
  }

  async adocaoRecusada(d: DestinatarioEmail & { animal: string; motivo: string }) {
    await this.fila.add('adocaoRecusada', { tipo: 'adocaoRecusada', ...d });
  }

  async adocaoEncerrada(d: DestinatarioEmail & { animal: string }) {
    await this.fila.add('adocaoEncerrada', { tipo: 'adocaoEncerrada', ...d });
  }

  async doacaoEnviada(d: DestinatarioEmail & { animal: string }) {
    await this.fila.add('doacaoEnviada', { tipo: 'doacaoEnviada', ...d });
  }

  async doacaoAprovada(d: DestinatarioEmail & { animal: string }) {
    await this.fila.add('doacaoAprovada', { tipo: 'doacaoAprovada', ...d });
  }

  async doacaoRecusada(d: DestinatarioEmail & { animal: string; motivo: string }) {
    await this.fila.add('doacaoRecusada', { tipo: 'doacaoRecusada', ...d });
  }

  async doacaoConcluida(d: DestinatarioEmail & { animal: string }) {
    await this.fila.add('doacaoConcluida', { tipo: 'doacaoConcluida', ...d });
  }

  async comprovanteDoacao(d: { para: string; nome: string; valor: string; data: Date }) {
    await this.fila.add('comprovanteDoacao', {
      tipo: 'comprovanteDoacao',
      para: d.para,
      nome: d.nome,
      valor: d.valor,
      data: d.data.toISOString(),
    });
  }

  async candidaturaRecebida(d: DestinatarioEmail) {
    await this.fila.add('candidaturaRecebida', { tipo: 'candidaturaRecebida', ...d });
  }

  async voluntarioAprovado(d: DestinatarioEmail & { cargo: string | null }) {
    await this.fila.add('voluntarioAprovado', { tipo: 'voluntarioAprovado', ...d });
  }

  async voluntarioRecusado(d: DestinatarioEmail & { motivo: string }) {
    await this.fila.add('voluntarioRecusado', { tipo: 'voluntarioRecusado', ...d });
  }

  fechar() {
    return this.fila.close();
  }
}

export interface ConfigSmtp {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly user?: string | undefined;
  readonly password?: string | undefined;
  readonly remetente: string;
}

const escapar = (texto: string) => texto.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function layout(titulo: string, corpo: string): string {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#FAF5EB;font-family:Arial,sans-serif;color:#111827">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden">
<tr><td style="background:#F97316;padding:20px 24px;color:#431407;font-size:20px;font-weight:bold">Abraço Animal</td></tr>
<tr><td style="padding:24px"><h1 style="font-size:20px;color:#431407;margin:0 0 16px">${titulo}</h1>${corpo}</td></tr>
<tr><td style="padding:16px 24px;font-size:12px;color:#4B5563;border-top:1px solid #E5E7EB">
Você recebeu este e-mail porque há uma conta Abraço Animal com este endereço.</td></tr>
</table></td></tr></table></body></html>`;
}

export function montarEmail(job: Job): { assunto: string; html: string; texto: string } {
  const nome = escapar(job.nome.split(' ')[0] ?? '');
  switch (job.tipo) {
    case 'codigoRecuperacao': {
      const codigo = escapar(job.codigo);
      return {
        assunto: 'Seu código para redefinir a senha',
        texto: `Olá, ${job.nome}! Seu código é ${job.codigo}. Ele vale por 15 minutos. Se você não pediu, ignore este e-mail.`,
        html: layout(
          'Redefinição de senha',
          `<p>Olá, ${nome}!</p><p>Use o código abaixo no app para criar uma nova senha:</p>
<p style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#431407;background:#FFF7ED;padding:16px;text-align:center;border-radius:12px">${codigo}</p>
<p>Ele vale por <strong>15 minutos</strong>. Se você não pediu, ignore este e-mail — sua senha continua a mesma.</p>`,
        ),
      };
    }
    case 'senhaAlterada':
      return {
        assunto: 'Sua senha foi alterada',
        texto: `Olá, ${job.nome}! A senha da sua conta foi alterada e todas as sessões foram encerradas. Se não foi você, fale com a ONG imediatamente.`,
        html: layout(
          'Senha alterada',
          `<p>Olá, ${nome}!</p><p>A senha da sua conta foi alterada e todos os aparelhos foram desconectados.</p>
<p>Se não foi você, entre em contato com a ONG imediatamente.</p>`,
        ),
      };
    case 'adocaoRecebida': {
      const animal = escapar(job.animal);
      return {
        assunto: `Recebemos sua solicitação para adotar ${job.animal}`,
        texto: `Olá, ${job.nome}! Recebemos sua solicitação para adotar ${job.animal}. A equipe vai analisar e você acompanha tudo pelo app, em Perfil > Minhas adoções.`,
        html: layout(
          'Solicitação recebida 💛',
          `<p>Olá, ${nome}!</p><p>Recebemos sua solicitação para adotar <strong>${animal}</strong>.</p>
<p>A equipe da ONG vai analisar suas respostas com carinho. Você acompanha cada etapa pelo app, em <strong>Perfil › Minhas adoções</strong>.</p>`,
        ),
      };
    }
    case 'adocaoAprovada': {
      const animal = escapar(job.animal);
      return {
        assunto: `Sua adoção de ${job.animal} foi aprovada! 🎉`,
        texto: `Olá, ${job.nome}! A ONG aprovou sua solicitação para adotar ${job.animal}. Em breve entraremos em contato para combinar os próximos passos.`,
        html: layout(
          'Adoção aprovada! 🎉',
          `<p>Olá, ${nome}!</p><p>A ONG aprovou sua solicitação para adotar <strong>${animal}</strong>.</p>
<p>Em breve entraremos em contato pelo telefone cadastrado para combinar os próximos passos.</p>`,
        ),
      };
    }
    case 'adocaoRecusada': {
      const animal = escapar(job.animal);
      const motivo = escapar(job.motivo);
      return {
        assunto: `Sua solicitação para adotar ${job.animal} foi analisada`,
        texto: `Olá, ${job.nome}. A solicitação para adotar ${job.animal} não foi aprovada. Motivo: ${job.motivo}`,
        html: layout(
          'Solicitação analisada',
          `<p>Olá, ${nome}.</p><p>A solicitação para adotar <strong>${animal}</strong> não foi aprovada desta vez.</p>
<p style="background:#FFF7ED;padding:12px 16px;border-radius:12px"><strong>Motivo:</strong> ${motivo}</p>
<p>Obrigado por querer fazer parte desta história. Há outros animais esperando por um lar no app.</p>`,
        ),
      };
    }
    case 'doacaoEnviada': {
      const animal = escapar(job.animal);
      return {
        assunto: `Recebemos sua oferta de doação de ${job.animal}`,
        texto: `Olá, ${job.nome}! Recebemos sua oferta para doar ${job.animal} à ONG. A equipe vai analisar e você acompanha pelo app, em Perfil > Minhas doações.`,
        html: layout(
          'Oferta de doação recebida',
          `<p>Olá, ${nome}!</p><p>Recebemos sua oferta para doar <strong>${animal}</strong> à Abraço Animal.</p>
<p>A equipe vai analisar com carinho. Você acompanha pelo app, em <strong>Perfil › Minhas doações</strong>.</p>`,
        ),
      };
    }
    case 'doacaoAprovada': {
      const animal = escapar(job.animal);
      return {
        assunto: `A ONG aceitou receber ${job.animal}`,
        texto: `Olá, ${job.nome}! A ONG aceitou receber ${job.animal}. Entraremos em contato pelo telefone cadastrado para combinar a retirada.`,
        html: layout(
          'Doação aceita 💛',
          `<p>Olá, ${nome}!</p><p>A ONG aceitou receber <strong>${animal}</strong>.</p>
<p>Entraremos em contato pelo telefone cadastrado para combinar o dia da retirada.</p>`,
        ),
      };
    }
    case 'doacaoRecusada': {
      const animal = escapar(job.animal);
      const motivo = escapar(job.motivo);
      return {
        assunto: `Sua oferta de doação de ${job.animal} foi analisada`,
        texto: `Olá, ${job.nome}. Não poderemos receber ${job.animal} agora. Motivo: ${job.motivo}`,
        html: layout(
          'Oferta analisada',
          `<p>Olá, ${nome}.</p><p>Infelizmente não poderemos receber <strong>${animal}</strong> agora.</p>
<p style="background:#FFF7ED;padding:12px 16px;border-radius:12px"><strong>Motivo:</strong> ${motivo}</p>
<p>Obrigado por pensar na Abraço Animal.</p>`,
        ),
      };
    }
    case 'doacaoConcluida': {
      const animal = escapar(job.animal);
      return {
        assunto: `${job.animal} chegou à ONG!`,
        texto: `Olá, ${job.nome}! ${job.animal} chegou à Abraço Animal e já está sob os cuidados da equipe. Obrigado pela confiança!`,
        html: layout(
          `${animal} chegou! 💛`,
          `<p>Olá, ${nome}!</p><p><strong>${animal}</strong> chegou à Abraço Animal e já está sob os cuidados da equipe.</p>
<p>Obrigado pela confiança!</p>`,
        ),
      };
    }
    case 'candidaturaRecebida':
      return {
        assunto: 'Recebemos sua candidatura de voluntariado',
        texto: `Olá, ${job.nome}! Recebemos sua candidatura para ser voluntário(a) na Abraço Animal. A equipe vai analisar e você acompanha pelo app.`,
        html: layout(
          'Candidatura recebida 💛',
          `<p>Olá, ${nome}!</p><p>Recebemos sua candidatura para ser voluntário(a) na Abraço Animal.</p>
<p>A equipe vai analisar e você acompanha tudo pelo app.</p>`,
        ),
      };
    case 'voluntarioAprovado': {
      const cargo = job.cargo ? ` como <strong>${escapar(job.cargo)}</strong>` : '';
      return {
        assunto: 'Bem-vindo(a) à equipe da Abraço Animal!',
        texto: `Olá, ${job.nome}! Sua candidatura foi aprovada${job.cargo ? ` como ${job.cargo}` : ''}. Em breve entraremos em contato para combinar os próximos passos.`,
        html: layout(
          'Bem-vindo(a) à equipe! 💛',
          `<p>Olá, ${nome}!</p><p>Sua candidatura de voluntariado foi aprovada${cargo}.</p>
<p>Em breve entraremos em contato para combinar os próximos passos. Obrigado por fazer parte!</p>`,
        ),
      };
    }
    case 'voluntarioRecusado': {
      const motivo = escapar(job.motivo);
      return {
        assunto: 'Sua candidatura de voluntariado foi analisada',
        texto: `Olá, ${job.nome}. Sua candidatura não foi aprovada desta vez. Motivo: ${job.motivo}`,
        html: layout(
          'Candidatura analisada',
          `<p>Olá, ${nome}.</p><p>Sua candidatura de voluntariado não foi aprovada desta vez.</p>
<p style="background:#FFF7ED;padding:12px 16px;border-radius:12px"><strong>Motivo:</strong> ${motivo}</p>
<p>Você pode se candidatar de novo pelo app quando quiser.</p>`,
        ),
      };
    }
    case 'comprovanteDoacao': {
      const valor = escapar(job.valor);
      const data = new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'America/Sao_Paulo',
      }).format(new Date(job.data));
      return {
        assunto: `Comprovante da sua doação de ${job.valor}`,
        texto: `Olá, ${job.nome}! Recebemos sua doação de ${job.valor} via Pix em ${data}. Obrigado por ajudar os animais da Abraço Animal!`,
        html: layout(
          'Obrigado pela sua doação! 💛',
          `<p>Olá, ${nome}!</p><p>Recebemos sua doação via Pix:</p>
<p style="font-size:28px;font-weight:bold;color:#431407;background:#FFF7ED;padding:16px;text-align:center;border-radius:12px">${valor}</p>
<p>Data: ${escapar(data)}</p>
<p>Cada real ajuda no resgate, na alimentação e no tratamento dos animais. Obrigado!</p>`,
        ),
      };
    }
    case 'adocaoEncerrada': {
      const animal = escapar(job.animal);
      return {
        assunto: `${job.animal} encontrou um lar`,
        texto: `Olá, ${job.nome}! ${job.animal} foi adotado por outra família e sua solicitação foi encerrada. Obrigado pelo carinho — conheça outros animais no app.`,
        html: layout(
          `${animal} encontrou um lar 💛`,
          `<p>Olá, ${nome}!</p><p><strong>${animal}</strong> foi adotado por outra família, então sua solicitação foi encerrada.</p>
<p>Obrigado pelo carinho! Há outros animais esperando por você no app.</p>`,
        ),
      };
    }
  }
}

/** Consumidor da fila: envia via SMTP (Mailpit em desenvolvimento). */
export function iniciarWorkerEmails(conexao: ConnectionOptions, smtp: ConfigSmtp) {
  const transporte = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    ...(smtp.user ? { auth: { user: smtp.user, pass: smtp.password ?? '' } } : {}),
  });

  return new Worker<Job>(
    FILA,
    async (job) => {
      const email = montarEmail(job.data);
      await transporte.sendMail({
        from: smtp.remetente,
        to: job.data.para,
        subject: email.assunto,
        text: email.texto,
        html: email.html,
      });
    },
    { connection: conexao, concurrency: 5 },
  );
}
