import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { TIER_CONFIGS, type SubscriptionTier } from '@/lib/types';
import Stripe from 'stripe';

/**
 * POST /api/create-checkout
 *
 * สร้าง Stripe Checkout Session สำหรับสมัครแพ็กเกจ
 *
 * Body: { tier: SubscriptionTier }
 *
 * Response: { url: string } — redirect ไป Stripe Checkout
 */
export async function POST(request: NextRequest) {
  try {
    // ─── ตรวจสอบ Auth ─────────────────────────────────
    const supabase = await createServerSupabase();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json(
        { error: 'กรุณาเข้าสู่ระบบก่อนสั่งซื้อ' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const userEmail = session.user.email;

    // ─── Validate body ────────────────────────────────
    const { tier } = await request.json();

    const validTiers: SubscriptionTier[] = ['basic', 'premium', 'business_starter', 'business_pro'];
    if (!validTiers.includes(tier)) {
      return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
    }

    const tierConfig = TIER_CONFIGS[tier as SubscriptionTier];

    // ─── เช็คว่า Stripe Keys มีมั้ย ────────────────────
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const stripePriceIds: Record<string, string> = {
      basic: process.env.STRIPE_PRICE_BASIC || '',
      premium: process.env.STRIPE_PRICE_PREMIUM || '',
      business_starter: process.env.STRIPE_PRICE_BUSINESS_STARTER || '',
      business_pro: process.env.STRIPE_PRICE_BUSINESS_PRO || '',
    };

    // ถ้าไม่มี Stripe Keys → โหมดทดสอบ (Dev Mode)
    const isDevMode = !stripeSecretKey;

    if (isDevMode) {
      console.log('[checkout] DEV MODE — simulating checkout for', tier);

      // ใน Dev Mode: อัปเดต tier ทันทีเลย
      const serviceSupabase = (await import('@/lib/supabase/server')).createServiceSupabase();
      const now = new Date();
      const cycleEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      await serviceSupabase.from('profiles').update({
        tier,
        quota_minutes_total: tierConfig.quotaMinutes,
        quota_minutes_used: 0,
        billing_cycle_start: now.toISOString(),
        billing_cycle_end: cycleEnd.toISOString(),
        updated_at: now.toISOString(),
      }).eq('id', userId);

      // บันทึก billing history
      await serviceSupabase.from('billing_history').insert({
        user_id: userId,
        action_type: 'subscribe',
        previous_tier: 'free',
        new_tier: tier,
        amount_thb: tierConfig.price,
        billing_cycle_start: now.toISOString(),
        billing_cycle_end: cycleEnd.toISOString(),
        payment_status: 'dev_mode',
      });

      return NextResponse.json({
        url: '/dashboard?checkout=success&tier=' + tier,
        devMode: true,
      });
    }

    // ─── โหมด Production: เรียก Stripe จริง ────────────
    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2025-03-31' as any });
    const priceId = stripePriceIds[tier];

    if (!priceId) {
      return NextResponse.json(
        { error: `ไม่ได้ตั้งค่า Stripe Price ID สำหรับ ${tier}` },
        { status: 500 }
      );
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['promptpay', 'card'],
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      customer_email: userEmail,
      client_reference_id: userId,
      metadata: { tier, userId },
      success_url: `${request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/dashboard?checkout=success`,
      cancel_url: `${request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/pricing?checkout=cancelled`,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[create-checkout] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
