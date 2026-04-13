import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const config = {
  api: {
    bodyParser: false,
  },
};

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify(payload));
}

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function verifyStripeSignature(rawBody, signatureHeader, webhookSecret) {
  if (!signatureHeader || !webhookSecret) return false;

  const entries = String(signatureHeader)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  const timestamp = entries.find((part) => part.startsWith('t='))?.slice(2);
  const signatures = entries
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3));

  if (!timestamp || !signatures.length) return false;

  const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(signedPayload, 'utf8')
    .digest('hex');

  return signatures.some((sig) => {
    const sigBuf = Buffer.from(sig, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expectedBuf);
  });
}

function parseEventPayload(rawBody, req) {
  const rawText = rawBody?.length ? rawBody.toString('utf8') : '';
  if (rawText) return JSON.parse(rawText);
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  if (req.body && typeof req.body === 'object') return req.body;
  return {};
}

async function fetchStripeEvent(eventId, stripeSecretKey) {
  const response = await fetch(`https://api.stripe.com/v1/events/${encodeURIComponent(eventId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || 'stripe_event_fetch_failed');
  }
  return data;
}

function buildFallbackUsername(memberId) {
  return `member_${String(memberId).replace(/-/g, '').slice(0, 16)}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!webhookSecret) {
      return json(res, 500, { ok: false, error: 'stripe_webhook_secret_missing' });
    }
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();

    const rawBody = await getRawBody(req);
    const signatureHeader = req.headers['stripe-signature'];

    const isValidSignature = verifyStripeSignature(rawBody, signatureHeader, webhookSecret);
    let event = {};
    try {
      event = parseEventPayload(rawBody, req);
    } catch {
      return json(res, 400, { ok: false, error: 'invalid_json_payload' });
    }

    if (!isValidSignature) {
      if (!stripeSecretKey || !event?.id) {
        return json(res, 400, { ok: false, error: 'invalid_stripe_signature' });
      }
      const canonicalEvent = await fetchStripeEvent(event.id, stripeSecretKey);
      if (!canonicalEvent?.id || canonicalEvent.id !== event.id) {
        return json(res, 400, { ok: false, error: 'stripe_event_validation_failed' });
      }
      event = canonicalEvent;
    }

    const supportedEventTypes = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded']);
    if (!supportedEventTypes.has(event.type)) {
      return json(res, 200, { ok: true, ignored: true, event_type: event.type || 'unknown' });
    }

    const session = event?.data?.object || {};
    if (session.payment_status && session.payment_status !== 'paid') {
      return json(res, 200, { ok: true, ignored: true, reason: 'session_not_paid' });
    }

    const memberId = String(session?.metadata?.member_id || session?.client_reference_id || '').trim();
    const coinAmount = Number(session?.metadata?.coin_amount || 0);

    if (!memberId) {
      return json(res, 400, { ok: false, error: 'member_id_required' });
    }

    if (!Number.isFinite(coinAmount) || coinAmount <= 0) {
      return json(res, 400, { ok: false, error: 'coin_amount_invalid' });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return json(res, 500, { ok: false, error: 'server_env_missing' });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: memberEnsureError } = await admin
      .from('members')
      .upsert({
        id: memberId,
        username: buildFallbackUsername(memberId),
        password_hash: 'managed_by_payment_webhook',
      }, { onConflict: 'id' });

    if (memberEnsureError) {
      return json(res, 500, { ok: false, error: `member_ensure_failed:${memberEnsureError.message}` });
    }

    const { data: profile, error: readError } = await admin
      .from('member_profiles')
      .select('coin_balance')
      .eq('member_id', memberId)
      .maybeSingle();

    if (readError) {
      return json(res, 500, { ok: false, error: `profile_read_failed:${readError.message}` });
    }

    const currentBalance = Number(profile?.coin_balance || 0);
    const nextBalance = currentBalance + coinAmount;

    const { error: writeError } = await admin
      .from('member_profiles')
      .upsert({ member_id: memberId, coin_balance: nextBalance }, { onConflict: 'member_id' });

    if (writeError) {
      return json(res, 500, { ok: false, error: `profile_update_failed:${writeError.message}` });
    }

    return json(res, 200, {
      ok: true,
      coins_added: coinAmount,
      coin_balance: nextBalance,
    });
  } catch (error) {
    return json(res, 500, {
      ok: false,
      error: error?.message || 'unexpected_error',
    });
  }
}
