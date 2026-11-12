import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import nodemailer from 'nodemailer';

import type { FilaEmails } from '../../modules/auth/application/portas.js';

const FILA = 'emails';

type Job =
  | {
      readonly tipo: 'codigoRecuperacao';
      readonly para: string;
      readonly nome: string;
      readonly codigo: string;
    }
  | { readonly tipo: 'senhaAlterada'; readonly para: string; readonly nome: string };

/**
 * Produtor da fila de e-mails. O job sai da fila assim que é enviado
 * (removeOnComplete) — o código de recuperação não fica guardado no Redis.
 */
export class FilaEmailsBullmq implements FilaEmails {
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
  if (job.tipo === 'codigoRecuperacao') {
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
  return {
    assunto: 'Sua senha foi alterada',
    texto: `Olá, ${job.nome}! A senha da sua conta foi alterada e todas as sessões foram encerradas. Se não foi você, fale com a ONG imediatamente.`,
    html: layout(
      'Senha alterada',
      `<p>Olá, ${nome}!</p><p>A senha da sua conta foi alterada e todos os aparelhos foram desconectados.</p>
<p>Se não foi você, entre em contato com a ONG imediatamente.</p>`,
    ),
  };
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
