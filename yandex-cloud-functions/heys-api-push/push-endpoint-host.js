/**
 * Allowed Web Push delivery hosts for POST /push/subscribe.
 * Legal basis: docs/release/ocenka-pravovogo-rezhima.md — FCM + Apple only.
 *
 * Этот список — не оптимизация, а юридический контроль. Решение владельца
 * 20.08.2026: Mozilla не подключаем — Firefox это меньше 2% пользователей, и
 * бумажная работа под них не окупается. Mozilla остаётся названной только в
 * уведомлении РКН № 100383874; заявить регулятору больше, чем используешь,
 * безопасно, обратное — нет (разбор юриста 20.08). В согласии на обработку
 * персональных данных, политике и перечне обработчиков Mozilla поэтому не
 * названа, и это верно ровно до тех пор, пока её нет в списке ниже.
 *
 * Значит: добавление updates.push.services.mozilla.com (или любого нового
 * хоста доставки) делает клиентские документы неверными задним числом. Порядок
 * обязателен и обратному не подлежит — сначала новые версии согласий и
 * переподписание, потом хост здесь. См. heys/d8f2b0.
 */
const ALLOWED_PUSH_ENDPOINT_HOSTS = new Set([
  'fcm.googleapis.com',
  'web.push.apple.com',
]);

function parsePushEndpointHost(endpoint) {
  if (typeof endpoint !== 'string' || !endpoint.trim()) {
    return { ok: false, reason: 'push_endpoint_invalid_url' };
  }
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:') {
      return { ok: false, reason: 'push_endpoint_not_https' };
    }
    return { ok: true, host: url.hostname.toLowerCase() };
  } catch {
    return { ok: false, reason: 'push_endpoint_invalid_url' };
  }
}

function validatePushSubscribeEndpoint(endpoint) {
  const parsed = parsePushEndpointHost(endpoint);
  if (!parsed.ok) return parsed;
  if (!ALLOWED_PUSH_ENDPOINT_HOSTS.has(parsed.host)) {
    return { ok: false, reason: 'push_endpoint_host_not_allowed', host: parsed.host };
  }
  return { ok: true, host: parsed.host };
}

module.exports = {
  ALLOWED_PUSH_ENDPOINT_HOSTS,
  parsePushEndpointHost,
  validatePushSubscribeEndpoint,
};
