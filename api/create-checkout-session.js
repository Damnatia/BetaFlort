function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify(payload));
}

function getBaseUrl(req) {
  const explicitBaseUrl = process.env.APP_BASE_URL;
  if (explicitBaseUrl) return explicitBaseUrl;

  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return json(res, 500, { ok: false, error: 'stripe_secret_missing' });
    }

    const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const memberId = String(payload.member_id || '').trim();
    const coinAmount = Number(payload.coin_amount || 0);

    if (!memberId) {
      return json(res, 400, { ok: false, error: 'member_id_required' });
    }

    if (!Number.isFinite(coinAmount) || coinAmount <= 0) {
      return json(res, 400, { ok: false, error: 'coin_amount_invalid' });
    }

    const currency = (process.env.STRIPE_CURRENCY || 'try').toLowerCase();
    const unitAmountPerCoin = Number(process.env.STRIPE_UNIT_AMOUNT_PER_COIN || 10);
    if (!Number.isFinite(unitAmountPerCoin) || unitAmountPerCoin <= 0) {
      return json(res, 500, { ok: false, error: 'stripe_unit_amount_invalid' });
    }

    const baseUrl = getBaseUrl(req);
    const lineItemAmount = Math.round(coinAmount * unitAmountPerCoin);

    const form = new URLSearchParams();
    form.set('mode', 'payment');
    form.set('line_items[0][quantity]', '1');
    form.set('line_items[0][price_data][currency]', currency);
    form.set('line_items[0][price_data][product_data][name]', `${coinAmount} Flort Coin`);
    form.set('line_items[0][price_data][product_data][description]', 'Flortbeta uygulaması içi coin paketi');
    form.set('line_items[0][price_data][unit_amount]', String(lineItemAmount));
    form.set('client_reference_id', memberId);
    form.set('metadata[member_id]', memberId);
    form.set('metadata[coin_amount]', String(coinAmount));
    form.set('metadata[source]', 'flortbeta_member_coins_page');
    form.set('success_url', `${baseUrl}/?checkout=success&member_id=${encodeURIComponent(memberId)}&coin_amount=${coinAmount}`);
    form.set('cancel_url', `${baseUrl}/?checkout=cancelled`);

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });

    const session = await response.json();
    if (!response.ok) {
      return json(res, response.status, {
        ok: false,
        error: session?.error?.message || 'stripe_session_create_failed',
      });
    }

    if (!session.url) {
      return json(res, 500, { ok: false, error: 'stripe_checkout_url_missing' });
    }

    return json(res, 200, { ok: true, url: session.url, id: session.id });
  } catch (error) {
    return json(res, 500, {
      ok: false,
      error: error?.message || 'unexpected_error',
    });
  }
}
