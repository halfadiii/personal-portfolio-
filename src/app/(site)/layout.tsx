import { SmoothScroll } from "@/components/motion/SmoothScroll";
import { CommandPalette } from "@/components/site/CommandPalette";
import { Cursor } from "@/components/site/Cursor";
import { Providers } from "@/components/site/Providers";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Sky } from "@/components/three/Sky";

export default function SiteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <Providers>
      <SmoothScroll>
        <Sky />
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
        <CommandPalette />
        <Cursor />
      </SmoothScroll>
    </Providers>
  );
}
