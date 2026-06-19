import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import { TIER_CONFIGS, type SubscriptionTier } from '@/lib/types';
import Stripe from 'stripe';

/**
 * POST /api/webhooks/stripe
 *
 * รับ Webhook จาก Stripe เมื่อมีการชำระเงินสำเร็จ
 * อัปเดต Tier และโควตาของผู้ใช้ใน Supabase
 *
 * Stripe Dashboard → Webhooks → Add endpoint:
 *   URL: https://[domain]/api/webhooks/stripe
 *   Events: checkout.session.completed
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  try {
    let event: any;

    // ถ้ามี Stripe Webhook Secret → verify signature
    if (webhookSecret && sig) {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-03-31' as any });
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } else {
      // Dev Mode: parse JSON ตรง ๆ
      event = JSON.parse(body);
      console.warn('[stripe-webhook] DEV MODE: skipping signature verification');
    }

    const supabase = createServiceSupabase();

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id || session.metadata?.userId;
        const tier: SubscriptionTier = session.metadata?.tier || 'free';

        if (!userId || tier === 'free') {
          console.warn('[stripe-webhook] Missing userId or invalid tier');
          break;
        }

        const tierConfig = TIER_CONFIGS[tier];
        if (!tierConfig) {
          console.warn('[stripe-webhook] Unknown tier:', tier);
          break;
        }

        const now = new Date();
        const cycleEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        console.log(`[stripe-webhook] Upgrading ${userId} to ${tier}`);

        // อัปเดตโปรไฟล์
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            tier,
            quota_minutes_total: tierConfig.quotaMinutes,
            quota_minutes_used: 0,
            billing_cycle_start: now.toISOString(),
            billing_cycle_end: cycleEnd.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq('id', userId);

        if (updateError) {
          console.error('[stripe-webhook] Profile update error:', updateError);
          break;
        }

        // ดู tier เก่าสำหรับ history
        const { data: oldProfile } = await supabase
          .from('profiles')
          .select('tier')
          .eq('id', userId)
          .single();

        // บันทึก billing history
        const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        await supabase.from('billing_history').insert({
          user_id: userId,
          action_type: 'subscribe',
          previous_tier: oldProfile?.tier || 'free',
          new_tier: tier,
          amount_thb: tierConfig.price,
          invoice_number: invoiceNumber,
          billing_cycle_start: now.toISOString(),
          billing_cycle_end: cycleEnd.toISOString(),
          payment_status: 'success',
        });

        // บันทึก quota log
        await supabase.from('quota_activity_logs').insert({
          user_id: userId,
          log_type: 'renew_reset',
          minutes_changed: tierConfig.quotaMinutes,
          quota_minutes_used_snapshot: 0,
          description: `💳 ชำระเงินสำเร็จ — อัปเกรดเป็น ${tierConfig.name}`,
        });

        console.log(`[stripe-webhook] ✅ ${userId} upgraded to ${tier} successfully`);
        break;
      }

      case 'customer.subscription.updated': {
        // สำหรับ Subscription (recurring) — ในอนาคต
        const subscription = event.data.object;
        console.log('[stripe-webhook] Subscription updated:', subscription.id);
        break;
      }

      case 'customer.subscription.deleted': {
        // ยกเลิก subscription → Downgrade to free
        const subscription = event.data.object;
        const customerId = subscription.customer;

        // หา userId จาก Stripe customer ID (ต้องมี mapping table ในอนาคต)
        console.log('[stripe-webhook] Subscription deleted:', customerId);
        break;
      }

      case 'checkout.session.expired': {
        const expiredSession = event.data.object;
        console.log('[stripe-webhook] Checkout session expired:', expiredSession.id);
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('[stripe-webhook] Error:', err.message);
    return NextResponse.json(
      { error: `Webhook error: ${err.message}` },
      { status: 400 }
    );
  }
}
