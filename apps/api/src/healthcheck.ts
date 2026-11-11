/**
 * Healthcheck do container. A imagem distroless não tem curl/wget,
 * então o próprio Node consulta /health/live.
 */
const porta = process.env['PORT'] ?? '3333';

try {
  const resposta = await fetch(`http://127.0.0.1:${porta}/health/live`, {
    signal: AbortSignal.timeout(2_000),
  });
  process.exit(resposta.ok ? 0 : 1);
} catch {
  process.exit(1);
}
