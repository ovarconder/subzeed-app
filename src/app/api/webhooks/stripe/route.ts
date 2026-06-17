import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  try {
    // In production: verify Stripe webhook signature
    // const event = stripe.webhooks.constructEvent(body, sig!, webhookSecret);

    const event = JSON.parse(body);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id;
        const tier = session.metadata?.tier || 'free';

        // Update user tier and quota via service role
        // const supabase = createServiceSupabase();
        // await supabase.from('profiles').update({
        //   tier,
        //   quota_minutes_total: TIER_CONFIGS[tier].quotaMinutes,
        //   billing_cycle_start: new Date().toISOString(),
        //   billing_cycle_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        // }).eq('id', userId);

        break;
      }

      case 'customer.subscription.updated': {
        // Handle tier change / renewal
        break;
      }

      case 'customer.subscription.deleted': {
        // Downgrade to free
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('Webhook error:', err.message);
    return NextResponse.json({ error: 'Webhook error' }, { status: 400 });
  }
}
