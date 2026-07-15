import type { Metadata } from 'next';
import 'katex/dist/katex.min.css';
import '@xyflow/react/dist/style.css';
import './globals.css';
import { LanguageProvider } from '@/components/LanguageProvider';

export const metadata: Metadata = {
  title: 'Wadi AI',
  description: 'Bilingual AI chat, documents, and developer API endpoints powered by accessible models.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
