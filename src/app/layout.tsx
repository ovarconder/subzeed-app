import type { Metadata } from "next";
import "./globals.css";
import siteConfig from "@/lib/site-config";
import { Providers } from "./providers";

// ─── Static metadata (ใช้ fallback จาก site-config.ts) ─
export const metadata: Metadata = {
  title: {
    default: siteConfig.brand.name,
    template: `%s | ${siteConfig.brand.name}`,
  },
  description: siteConfig.brand.slogan,
  icons: {
    icon: siteConfig.brand.favicon,
  },
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // ─── ดึง favicon จาก DB โดยตรง (Server Component) ────
  let favicon = siteConfig.brand.favicon; // fallback
  let brandName = siteConfig.brand.name;

  try {
    const { createServiceSupabase } = await import('@/lib/supabase/server');
    const supabase = createServiceSupabase();
    const { data } = await supabase
      .from('site_config')
      .select('config')
      .eq('id', 1)
      .single();

    if (data?.config?.brand?.favicon) favicon = data.config.brand.favicon;
    if (data?.config?.brand?.name) brandName = data.config.brand.name;
  } catch (err) {
    console.warn('[Layout] Failed to read site config from DB:', err);
  }

  return (
    <html lang={siteConfig.misc.locale} className="h-full antialiased">
      <head>
        {/* Dynamic favicon from admin settings */}
        <link rel="icon" href={favicon} sizes="any" />
        <link rel="apple-touch-icon" href={favicon} />
        <meta property="og:title" content={brandName} />
        <meta property="og:description" content={siteConfig.brand.slogan} />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
