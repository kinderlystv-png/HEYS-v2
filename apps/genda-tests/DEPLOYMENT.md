# Deployment and rollback

## Production resources

- Bucket: `heys-genda-tests` (`e3e886onq1k442d1pnrb`), public read, no list, 100
  MiB limit.
- Website origin: `https://heys-genda-tests.website.yandexcloud.net`.
- Certificate: `genda-heyslab-ru` (`fpqadhtg7bnsqo6oapes`).
- DNS validation: `_acme-challenge.genda.heyslab.ru` CNAME to
  `fpqadhtg7bnsqo6oapes.cm.yandexcloud.net.`.
- CDN: `genda.heyslab.ru` (`bc8r2yorpvdeowc3353k`).
- CDN target: `e1e14e1dabe6ab92.topology.gslb.yccdn.ru.`.
- Public hostname: `https://genda.heyslab.ru`.

The bucket is separate from `heys-app`, `heys-static`, `heyslab.ru` and
`try-heyslab-ru`. It must never be added to the shared frontend deploy workflow.

## Upload

```bash
npm run build

aws s3 sync dist/assets s3://heys-genda-tests/assets \
  --endpoint-url=https://storage.yandexcloud.net \
  --cache-control 'public,max-age=31536000,immutable' --only-show-errors

aws s3 cp dist/index.html s3://heys-genda-tests/index.html \
  --endpoint-url=https://storage.yandexcloud.net \
  --cache-control 'no-cache,no-store,must-revalidate' \
  --content-type 'text/html; charset=utf-8' --only-show-errors
```

The production build loads content-hashed assets through the same public origin
as `index.html`, so the strict self-only CSP remains fail-closed.

Do not use `--delete` unless the bucket contents have first been listed and
confirmed to belong only to this application.

## Rollback

1. Remove only the `genda` and `_acme-challenge.genda` records from the
   `heyslab.ru` zone.
2. Delete the CDN resource whose CNAME is exactly `genda.heyslab.ru`.
3. Delete certificate `fpqadhtg7bnsqo6oapes`.
4. Empty and delete only bucket `heys-genda-tests`.

Removing the DNS record is the fastest user-facing rollback. The bucket can be
kept temporarily for recovery through its Yandex website URL.
