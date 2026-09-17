import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import appCss from "../styles.css?url";

const DIRECTION_CONTRACT = `
THESIS: One canonical JSON sheet folds between semantic graph and exact structure; it refuses detached dashboard cards.
OWN-WORLD: Warm washi field, vermilion active sheet, sumi notation, restrained gold, crisp creases, and compact workhorse type.
STORY: Open local source, understand its semantic shape, edit either view, run the same revision, and save exact text.
FIRST VIEWPORT: A compact command strip crowns a wide fold-map canvas and a dense source/inspector workbench; Run remains at the upper right.
FORM: One-Sheet Fold Map, the ticket-approved direction; seed key LION-FOLD-MAP-021.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
`;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      {
        name: "description",
        content:
          "A local-first semantic graph and JSON editor for Lion programs.",
      },
      { name: "theme-color", content: "#b43a2f" },
      { title: "Lion Fold Map" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "manifest", href: "/manifest.json" },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { readonly children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <meta content={DIRECTION_CONTRACT} name="lion:direction-contract" />
      </head>
      <body>
        {children}
        <Toaster position="bottom-center" richColors />
        <Scripts />
      </body>
    </html>
  );
}
