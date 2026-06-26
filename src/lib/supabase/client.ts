'use client';

let supabaseInstance: ReturnType<typeof import('@supabase/ssr').createBrowserClient> | null = null;

export const createClient = () => {
  if (supabaseInstance) return supabaseInstance;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    if (typeof window === 'undefined') {
      return {
        auth: {
          getSession: () => Promise.resolve({ data: { session: null }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
          signUp: () => Promise.resolve({ data: { user: null }, error: null }),
          signInWithPassword: () => Promise.resolve({ data: { user: null }, error: null }),
          signOut: () => Promise.resolve({ error: null }),
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: null, error: null }),
              order: () => Promise.resolve({ data: null, error: null }),
              then: (fn: any) => fn({ data: null, error: null }),
            }),
            order: () => Promise.resolve({ data: null, error: null }),
          }),
          insert: () => Promise.resolve({ data: null, error: null }),
          update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
        }),
      } as any;
    }
    throw new Error('Missing Supabase environment variables');
  }

  const { createBrowserClient } = require('@supabase/ssr');
  const isProd = typeof window !== 'undefined' && 
    (window.location.hostname === 'overconda.space' || window.location.hostname.endsWith('.overconda.space'));
  supabaseInstance = createBrowserClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: {
      ...(isProd ? { domain: 'overconda.space' } : {}),
      path: '/',
      sameSite: 'lax' as const,
      secure: isProd,
    },
  });
  return supabaseInstance;
};