/**
 * SeaweedFS real (mesma imagem do docker-compose) para os testes de
 * integração do upload de fotos.
 */
import { CreateBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

import type { ConfigS3 } from '../shared/infra/armazenamento-s3.js';

const PORTA = 8333;
const CREDENCIAIS = { accessKeyId: 'teste-acesso', secretAccessKey: 'teste-segredo-123456' };
const BUCKET = 'abraco-teste';

export interface S3Integracao {
  readonly container: StartedTestContainer;
  readonly config: ConfigS3;
  /** Cliente direto, para o teste conferir o que está (ou não) no bucket. */
  readonly cliente: S3Client;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function iniciarS3(): Promise<S3Integracao> {
  const identidades = JSON.stringify({
    identities: [
      {
        name: 'api',
        credentials: [
          { accessKey: CREDENCIAIS.accessKeyId, secretKey: CREDENCIAIS.secretAccessKey },
        ],
        actions: ['Read', 'Write', 'List', 'Tagging', 'Admin'],
      },
    ],
  });

  const container = await new GenericContainer('chrislusf/seaweedfs:4.52')
    .withCopyContentToContainer([{ content: identidades, target: '/etc/seaweedfs/s3.json' }])
    .withEntrypoint(['weed'])
    .withCommand([
      'server',
      '-dir=/data',
      '-ip=127.0.0.1',
      '-ip.bind=0.0.0.0',
      '-s3',
      `-s3.port=${String(PORTA)}`,
      '-s3.config=/etc/seaweedfs/s3.json',
      '-master.volumeSizeLimitMB=64',
      '-volume.max=0',
    ])
    .withExposedPorts(PORTA)
    .withWaitStrategy(Wait.forHttp('/healthz', PORTA).forStatusCode(200))
    .withStartupTimeout(120_000)
    .start();

  const endpoint = `http://${container.getHost()}:${String(container.getMappedPort(PORTA))}`;
  const config: ConfigS3 = {
    endpoint,
    regiao: 'us-east-1',
    bucket: BUCKET,
    ...CREDENCIAIS,
    forcePathStyle: true,
    ttlUrlSegundos: 3600,
  };
  const cliente = new S3Client({
    endpoint,
    region: config.regiao,
    forcePathStyle: true,
    credentials: CREDENCIAIS,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

  // O S3 responde antes de o volume aceitar gravações: tenta até conseguir gravar.
  for (let tentativa = 1; ; tentativa++) {
    try {
      await cliente.send(new CreateBucketCommand({ Bucket: BUCKET })).catch((e: unknown) => {
        if (!(e instanceof Error && e.name.startsWith('BucketAlready'))) throw e;
      });
      await cliente.send(new PutObjectCommand({ Bucket: BUCKET, Key: 'pronto', Body: 'ok' }));
      break;
    } catch (erro) {
      if (tentativa >= 60) throw erro;
      await esperar(1000);
    }
  }

  return { container, config, cliente };
}
