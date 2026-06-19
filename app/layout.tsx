import type { Metadata } from 'next';
import 'katex/dist/katex.min.css';
import '@xyflow/react/dist/style.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Chat API Platform',
  description: 'Governed multimodal AI chat, public API access, and admin usage controls.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
