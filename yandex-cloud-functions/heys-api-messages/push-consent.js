/**
 * Live client consent for Web Push (152-FZ art. 21 p. 5).
 * Curators are out of scope — different legal basis.
 */
const LIVE_PUSH_CONSENT_SQL = `
  SELECT EXISTS (
    SELECT 1 FROM public.consents
     WHERE client_id = $1
       AND consent_type = 'push_notifications'
       AND granted = true
       AND revoked_at IS NULL
  ) AS ok
`;

async function clientHasLivePushConsent(queryable, clientId) {
  if (!clientId) return false;
  const r = await queryable.query(LIVE_PUSH_CONSENT_SQL, [clientId]);
  return r.rows[0]?.ok === true;
}

function pushConsentMissingResponse() {
  return {
    statusCode: 403,
    body: { error: 'push_consent_missing' },
  };
}

module.exports = {
  LIVE_PUSH_CONSENT_SQL,
  clientHasLivePushConsent,
  pushConsentMissingResponse,
};
