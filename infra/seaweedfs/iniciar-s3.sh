#!/bin/sh
# Sobe o SeaweedFS com API S3 e cria o bucket da aplicação.
# Credenciais vêm do ambiente (.env) — nenhum segredo fica versionado.
set -eu

CONFIG=/tmp/s3.json
umask 077
cat > "$CONFIG" <<JSON
{
  "identities": [
    {
      "name": "api",
      "credentials": [
        { "accessKey": "${S3_ACCESS_KEY_ID}", "secretKey": "${S3_SECRET_ACCESS_KEY}" }
      ],
      "actions": ["Read", "Write", "List", "Tagging", "Admin"]
    }
  ]
}
JSON

rm -f /data/.bucket-pronto

weed server -dir=/data -ip=127.0.0.1 -ip.bind=0.0.0.0 \
  -s3 -s3.port=8333 -s3.config="$CONFIG" \
  -master.volumeSizeLimitMB=256 -volume.max=0 &
PID=$!

# Espera o master responder antes de criar o bucket
i=0
until echo "cluster.check" | weed shell -master=127.0.0.1:9333 >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -gt 60 ] && { echo "SeaweedFS não ficou pronto"; kill "$PID"; exit 1; }
  sleep 1
done

if echo "s3.bucket.list" | weed shell -master=127.0.0.1:9333 2>/dev/null | grep -qw "$S3_BUCKET"; then
  echo "bucket $S3_BUCKET já existe"
else
  echo "s3.bucket.create -name $S3_BUCKET" | weed shell -master=127.0.0.1:9333
  echo "bucket $S3_BUCKET criado"
fi
touch /data/.bucket-pronto

wait "$PID"
